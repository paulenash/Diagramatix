/**
 * Build the Word edition of tests/TESTS_SUMMARY.md.
 *
 * WHY THIS EXISTS. A straight `pandoc TESTS_SUMMARY.md -o x.docx` is unreadable:
 * a pipe table's column widths come from the DASH COUNTS in its separator row,
 * and the source writes `|------|------|----------------------|----------------|`
 * everywhere. That gives the Ref column (5 characters of "T4422") the same width
 * as the Test column (243 characters at the 90th percentile), so the column
 * carrying the actual test name is squeezed into a tall, thin ribbon while a
 * five-character column sits half empty (Paul, 2026-09-16).
 *
 * WHAT IT DOES.
 *  1. Rewrites each separator row with dash counts proportional to that table's
 *     OWN measured content, so widths follow the writing rather than a template
 *     — the allocation that minimises total row height. The source file is never
 *     touched; the rewrite happens on a copy on the way to pandoc.
 *  2. Floors a naturally narrow column (a ref, an id, a number) at a share wide
 *     enough to hold it, AND marks those cells no-wrap in the output, because a
 *     ref broken across two lines is the one thing in the document a reader
 *     scans for (Paul, 2026-09-16).
 *  3. Renders LANDSCAPE A4 with 1 cm margins — four columns of prose do not fit
 *     a portrait page at any column ratio.
 *  4. Gives every table full borders and a bold header row, and makes the
 *     document headings bold, by patching the reference document's styles once
 *     rather than 133 tables individually.
 *
 * Usage: node scripts/build-tests-summary-docx.mjs [outputPath]
 *   PANDOC_PATH  override the pandoc executable
 */
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const PANDOC = process.env.PANDOC_PATH
  ?? "C:\\Users\\paul\\AppData\\Local\\Pandoc\\pandoc.exe";
const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "tests", "TESTS_SUMMARY.md");
const OUT = path.resolve(process.argv[2]
  ?? path.join(ROOT, "..", "competitors", "diagramatix-test-summary-2026-09-18.docx"));

/** Total dashes spread across a table's columns — pandoc reads the ratio, not the absolute. */
const TOTAL = 100;
/**
 * Floor for a narrow column. On a landscape A4 page with 1 cm margins the text
 * width is ~27.7 cm, so 8% is ~2.2 cm — comfortably more than "T4422" plus the
 * cell margins. At the previous 5% (~1.4 cm) it wrapped.
 */
const MIN_SHARE = 8;
/** Columns this short are fixed-width labels rather than prose, and never wrap. */
const NARROW_AT = 8;
/** The long cells set the row height, so size on them rather than the median. */
const PCTL = 0.9;

const isSeparator = (line) => /^\|[\s:|-]+\|$/.test(line) && line.includes("-");
const cellsOf = (line) => line.split("|").slice(1, -1);

/** Dash counts proportional to content, plus which columns are no-wrap labels. */
function widthsFor(rows, ncol) {
  const lens = Array.from({ length: ncol }, () => []);
  for (const r of rows) r.forEach((v, i) => lens[i].push(v.trim().length));
  const p = lens.map((a) => {
    if (!a.length) return 1;
    a.sort((x, y) => x - y);
    return Math.max(1, a[Math.min(a.length - 1, Math.floor(a.length * PCTL))]);
  });
  const narrow = p.map((v) => v <= NARROW_AT);
  const fixed = narrow.filter(Boolean).length * MIN_SHARE;
  const restTotal = p.reduce((s, v, i) => s + (narrow[i] ? 0 : v), 0) || 1;
  const widths = p.map((v, i) => (narrow[i]
    ? MIN_SHARE
    : Math.max(MIN_SHARE, Math.round(((TOTAL - fixed) * v) / restTotal))));
  return { widths, narrow };
}

/** Rewrite every separator row. Returns the markdown and the no-wrap columns per table, in document order. */
function rewrite(md) {
  const lines = md.split(/\r?\n/);
  const noWrapByTable = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isSeparator(lines[i])) continue;
    const header = lines[i - 1];
    if (!header?.startsWith("|")) continue;
    const ncol = cellsOf(lines[i]).length;
    if (cellsOf(header).length !== ncol) continue;

    const body = [];
    for (let j = i + 1; j < lines.length && lines[j].startsWith("|"); j++) {
      const c = cellsOf(lines[j]);
      if (c.length !== ncol) break;
      body.push(c);
    }
    const { widths, narrow } = widthsFor(body.length ? body : [cellsOf(header)], ncol);
    const align = cellsOf(lines[i]).map((c) => [c.trim().startsWith(":"), c.trim().endsWith(":")]);
    lines[i] = `|${widths.map((n, k) => {
      const [l, r] = align[k];
      const dashes = "-".repeat(Math.max(3, n - (l ? 1 : 0) - (r ? 1 : 0)));
      return `${l ? ":" : ""}${dashes}${r ? ":" : ""}`;
    }).join("|")}|`;
    noWrapByTable.push(new Set(narrow.flatMap((v, k) => (v ? [k] : []))));
  }
  return { md: lines.join("\n"), noWrapByTable };
}

// ── docx plumbing ──────────────────────────────────────────────────────────
const unpack = (docx, dir) => {
  mkdirSync(dir, { recursive: true });
  execFileSync("unzip", ["-qo", docx, "-d", dir], { stdio: "inherit" });
};
/**
 * No `zip` on this box; .NET writes the archive instead — but NOT via
 * CreateFromDirectory. On PowerShell 5.1 (.NET Framework) that stores entry
 * names with the platform separator, so every path inside the archive comes out
 * as `word\document.xml`. A zip is specified to use forward slashes, and an
 * OOXML reader that takes it at its word sees a file with no parts in it.
 * Entries are therefore added one at a time with the name spelled correctly,
 * `[Content_Types].xml` first as the format expects.
 */
const pack = (dir, out) => {
  const ps = `
    Add-Type -AssemblyName System.IO.Compression;
    Add-Type -AssemblyName System.IO.Compression.FileSystem;
    if (Test-Path '${out}') { Remove-Item '${out}' -Force }
    $base = (Resolve-Path '${dir}').Path.TrimEnd('\\') + '\\'
    $zip = [System.IO.Compression.ZipFile]::Open('${out}', 'Create')
    try {
      $files = Get-ChildItem -LiteralPath $base -Recurse -File |
        Sort-Object { if ($_.Name -eq '[Content_Types].xml') { 0 } else { 1 } }
      foreach ($f in $files) {
        $rel = $f.FullName.Substring($base.Length).Replace('\\', '/')
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
          $zip, $f.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal)
      }
    } finally { $zip.Dispose() }
  `;
  execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { stdio: "inherit" });
};

const BORDER = (w) => ["top", "left", "bottom", "right", "insideH", "insideV"]
  .map((s) => `<w:${s} w:val="single" w:sz="${w}" w:space="0" w:color="808080" />`).join("");

/** Pandoc's default reference document: landscape, bordered tables, bold headings. */
function buildReference(work) {
  const plain = path.join(work, "default.docx");
  writeFileSync(plain, execFileSync(PANDOC, ["--print-default-data-file", "reference.docx"], {
    maxBuffer: 64 * 1024 * 1024, encoding: "buffer",
  }));
  const dir = path.join(work, "ref");
  unpack(plain, dir);

  // Page: A4 landscape (twips), 1 cm margins.
  const docXml = path.join(dir, "word", "document.xml");
  let xml = readFileSync(docXml, "utf8");
  if (!xml.includes("w:pgSz")) {
    xml = xml.replace("<w:sectPr>", "<w:sectPr>"
      + '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape" />'
      + '<w:pgMar w:top="567" w:right="567" w:bottom="567" w:left="567"'
      + ' w:header="284" w:footer="284" w:gutter="0" />');
    writeFileSync(docXml, xml, "utf8");
  }

  const stylesXml = path.join(dir, "word", "styles.xml");
  let styles = readFileSync(stylesXml, "utf8");

  // Every table gets a full grid; the header row gets a heavier box and bold text.
  const i = styles.indexOf('w:styleId="Table"');
  const open = styles.indexOf("<w:tblPr>", i);
  const close = styles.indexOf("</w:tblPr>", open);
  if (i >= 0 && open >= 0 && close > open && !styles.slice(open, close).includes("tblBorders")) {
    styles = styles.slice(0, open + "<w:tblPr>".length)
      + `<w:tblBorders>${BORDER(4)}</w:tblBorders>`
      + styles.slice(open + "<w:tblPr>".length);
  }
  styles = styles.replace('<w:tblStylePr w:type="firstRow">',
    '<w:tblStylePr w:type="firstRow"><w:rPr><w:b /><w:bCs /></w:rPr>');

  // Document headings are coloured but not bold in the default reference.
  for (let h = 1; h <= 6; h++) {
    const at = styles.indexOf(`w:styleId="Heading${h}"`);
    if (at < 0) continue;
    const rpr = styles.indexOf("<w:rPr>", at);
    const end = styles.indexOf("</w:style>", at);
    if (rpr < 0 || rpr > end) continue;
    if (styles.slice(rpr, styles.indexOf("</w:rPr>", rpr)).includes("<w:b ")) continue;
    styles = styles.slice(0, rpr + "<w:rPr>".length) + "<w:b /><w:bCs />"
      + styles.slice(rpr + "<w:rPr>".length);
  }
  writeFileSync(stylesXml, styles, "utf8");

  const out = path.join(work, "reference.docx");
  pack(dir, out);
  return out;
}

const xmlEscape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xmlUnescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/**
 * A REAL contents list, not a TOC field.
 *
 * Pandoc's `--toc` emits a `TOC` field, and Word greets every reader of a
 * document containing one with "this document contains fields that may refer to
 * other files, do you want to update them?" — because a contents field CAN pull
 * entries from other documents (that is what its RD switch does). Ours refers to
 * nothing outside itself, but Word cannot know that without evaluating it, so it
 * asks. On a document sent to someone else that prompt reads like a warning
 * about the file (Paul, 2026-09-16).
 *
 * Every heading already carries a bookmark, so the contents can be written out
 * as ordinary paragraphs with internal links: same navigation, no field, no
 * prompt. The cost is page numbers, which a field computes at layout time and
 * nothing outside Word can know.
 */
function contentsXml(xml, depth = 2) {
  const entries = [];
  let bookmark = null;
  const re = /<w:bookmarkStart[^>]*w:name="([^"]+)"[^>]*\/>|<w:p>([\s\S]*?)<\/w:p>/g;
  for (let m; (m = re.exec(xml));) {
    if (m[1] !== undefined) { bookmark = m[1]; continue; }
    const body = m[2];
    const lvl = /<w:pStyle w:val="Heading([1-6])"/.exec(body);
    if (!lvl) continue;
    const level = Number(lvl[1]);
    if (level <= depth && bookmark) {
      const text = [...body.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
        .map((t) => xmlUnescape(t[1])).join("").trim();
      if (text) entries.push({ level, bookmark, text });
    }
    bookmark = null;
  }
  const rows = entries.map(({ level, bookmark, text }) =>
    `<w:p><w:pPr><w:pStyle w:val="Compact" /><w:ind w:left="${(level - 1) * 340}" /></w:pPr>`
    + `<w:hyperlink w:anchor="${bookmark}">`
    + `<w:r><w:rPr><w:rStyle w:val="Hyperlink" />${level === 1 ? "<w:b /><w:bCs />" : ""}</w:rPr>`
    + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:hyperlink></w:p>`).join("");
  return {
    xml: `<w:p><w:pPr><w:pStyle w:val="Heading1" /></w:pPr>`
      + `<w:r><w:t xml:space="preserve">Contents</w:t></w:r></w:p>${rows}`,
    count: entries.length,
  };
}

/** Mark the label columns no-wrap, so a ref never breaks across two lines. */
function applyNoWrap(docx, noWrapByTable, work) {
  const dir = path.join(work, "out");
  unpack(docx, dir);
  const p = path.join(dir, "word", "document.xml");
  let xml = readFileSync(p, "utf8");

  // Static contents in place of the field, straight after the title.
  const toc = contentsXml(xml);
  const titleEnd = xml.indexOf("</w:p>", xml.indexOf('<w:pStyle w:val="Title"')) + "</w:p>".length;
  const at = titleEnd > "</w:p>".length ? titleEnd : xml.indexOf("<w:body>") + "<w:body>".length;
  xml = xml.slice(0, at) + toc.xml + xml.slice(at);

  let cursor = 0, table = 0, patched = 0;
  const pieces = [];
  for (;;) {
    const start = xml.indexOf("<w:tbl>", cursor);
    if (start < 0) break;
    const end = xml.indexOf("</w:tbl>", start);
    if (end < 0) break;
    const cols = noWrapByTable[table++] ?? new Set();
    let body = xml.slice(start, end);
    if (cols.size) {
      // Walk rows, then cells within each row, so the column index is right.
      body = body.replace(/<w:tr>[\s\S]*?<\/w:tr>/g, (row) => {
        let col = 0;
        return row.replace(/<w:tc>(\s*)(<w:tcPr\s*\/>|<w:tcPr>)/g, (m, ws, tcpr) => {
          const mine = cols.has(col++);
          if (!mine) return m;
          patched++;
          return tcpr.endsWith("/>")
            ? `<w:tc>${ws}<w:tcPr><w:noWrap /></w:tcPr>`
            : `<w:tc>${ws}<w:tcPr><w:noWrap />`;
        });
      });
    }
    pieces.push(xml.slice(cursor, start), body);
    cursor = end;
  }
  pieces.push(xml.slice(cursor));
  xml = pieces.join("");
  writeFileSync(p, xml, "utf8");
  pack(dir, docx);
  return { tables: table, cells: patched, toc: toc.count };
}

if (!existsSync(SOURCE)) throw new Error(`missing ${SOURCE}`);
if (!existsSync(PANDOC)) throw new Error(`pandoc not found at ${PANDOC} — set PANDOC_PATH`);

const work = mkdtempSync(path.join(tmpdir(), "tests-summary-docx-"));
try {
  const { md, noWrapByTable } = rewrite(readFileSync(SOURCE, "utf8"));
  const src = path.join(work, "summary.md");
  writeFileSync(src, md, "utf8");

  execFileSync(PANDOC, [
    src, "-o", OUT,
    "--reference-doc", buildReference(work),
    "--metadata", "title=Diagramatix — Tests Summary",
  ], { stdio: "inherit" });

  const { tables, cells, toc } = applyNoWrap(OUT, noWrapByTable, work);
  console.log(`sized ${noWrapByTable.length} tables · no-wrap on ${cells} label cells across ${tables} · ${toc} contents entries, no fields · wrote ${OUT}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
