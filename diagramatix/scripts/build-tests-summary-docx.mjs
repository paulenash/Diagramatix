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
 * WHAT IT DOES. Rewrites each separator row with dash counts proportional to
 * that table's OWN measured content, so widths follow the writing rather than a
 * template — the allocation that minimises total row height. A naturally narrow
 * column (a ref, an id, a number) is floored so it never wraps, and the rest of
 * the width is shared out by 90th-percentile cell length. The source file is
 * never touched; the rewrite happens on a copy on its way to pandoc.
 *
 * It also renders LANDSCAPE A4 with 1 cm margins, because four columns of prose
 * do not fit a portrait page at any column ratio. Pandoc takes page setup from a
 * reference document, so this builds one by patching the section properties of
 * pandoc's own default.
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
/** A column that never wraps (a ref, an id) still needs enough not to break "T4422". */
const MIN_SHARE = 5;
/** Columns this short are treated as fixed-width labels rather than prose. */
const NARROW_AT = 8;
/** The long cells set the row height, so size on them rather than the median. */
const PCTL = 0.9;

const isSeparator = (line) => /^\|[\s:|-]+\|$/.test(line) && line.includes("-");
const cellsOf = (line) => line.split("|").slice(1, -1);

/** Dash counts proportional to each column's 90th-percentile content length. */
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
  return p.map((v, i) => (narrow[i]
    ? MIN_SHARE
    : Math.max(MIN_SHARE, Math.round(((TOTAL - fixed) * v) / restTotal))));
}

/** Rewrite every table's separator row in place. Returns the new markdown. */
function rewrite(md) {
  const lines = md.split(/\r?\n/);
  let tables = 0;
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
    const w = widthsFor(body.length ? body : [cellsOf(header)], ncol);
    const align = cellsOf(lines[i]).map((c) => [c.trim().startsWith(":"), c.trim().endsWith(":")]);
    lines[i] = `|${w.map((n, k) => {
      const [l, r] = align[k];
      const dashes = "-".repeat(Math.max(3, n - (l ? 1 : 0) - (r ? 1 : 0)));
      return `${l ? ":" : ""}${dashes}${r ? ":" : ""}`;
    }).join("|")}|`;
    tables++;
  }
  return { md: lines.join("\n"), tables };
}

/** Pandoc's default reference document, with its section properties made landscape. */
function landscapeReference(work) {
  const plain = path.join(work, "default.docx");
  writeFileSync(plain, execFileSync(PANDOC, ["--print-default-data-file", "reference.docx"], {
    maxBuffer: 64 * 1024 * 1024, encoding: "buffer",
  }));
  const dir = path.join(work, "ref");
  mkdirSync(dir, { recursive: true });
  execFileSync("unzip", ["-q", plain, "-d", dir], { stdio: "inherit" });

  const docXml = path.join(dir, "word", "document.xml");
  let xml = readFileSync(docXml, "utf8");
  if (!xml.includes("w:pgSz")) {
    // A4 landscape (twips), 1 cm margins — the widest page Word opens without fuss.
    xml = xml.replace("<w:sectPr>", "<w:sectPr>"
      + '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape" />'
      + '<w:pgMar w:top="567" w:right="567" w:bottom="567" w:left="567"'
      + ' w:header="284" w:footer="284" w:gutter="0" />');
    writeFileSync(docXml, xml, "utf8");
  }

  // No `zip` on this box; .NET writes the archive instead.
  const out = path.join(work, "reference.docx");
  const ps = [
    "Add-Type -AssemblyName System.IO.Compression.FileSystem;",
    `[System.IO.Compression.ZipFile]::CreateFromDirectory('${dir}','${out}',`,
    "[System.IO.Compression.CompressionLevel]::Optimal, $false)",
  ].join(" ");
  execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { stdio: "inherit" });
  return out;
}

if (!existsSync(SOURCE)) throw new Error(`missing ${SOURCE}`);
if (!existsSync(PANDOC)) throw new Error(`pandoc not found at ${PANDOC} — set PANDOC_PATH`);

const work = mkdtempSync(path.join(tmpdir(), "tests-summary-docx-"));
try {
  const { md, tables } = rewrite(readFileSync(SOURCE, "utf8"));
  const src = path.join(work, "summary.md");
  writeFileSync(src, md, "utf8");

  execFileSync(PANDOC, [
    src, "-o", OUT,
    "--toc", "--toc-depth=2",
    "--reference-doc", landscapeReference(work),
    "--metadata", "title=Diagramatix — Tests Summary",
  ], { stdio: "inherit" });

  console.log(`rewrote ${tables} tables · wrote ${OUT}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
