/**
 * Reading an `.xlsx` workbook into the same `{ headers, rows }` every other
 * importer produces.
 *
 * The picker took CSV, TSV, XES, OCEL and XML — everything except the format
 * people actually have. Anyone with a genuine Excel export had to Save As → CSV
 * first, in a product whose whole promise is to start from the spreadsheet you
 * already have. `excelSerialToMs` was already here to cope with Excel's serial
 * dates arriving inside a CSV, so the shape was half-anticipated and then never
 * finished.
 *
 * DATES ARE DELIBERATELY LEFT AS NUMBERS. A styled date cell in xlsx is just a
 * number plus a format id, and chasing `numFmt` through the style table to
 * decide what a cell "means" is where this kind of reader usually goes wrong.
 * The Miner already understands Excel serials end to end (`parseTimestamp` →
 * `excelSerialToMs`), so a serial handed straight through is read correctly by
 * the pipeline that has always read them. One fewer thing to get wrong.
 *
 * jszip is already a dependency of this repo, so no new one is introduced.
 */

import JSZip from "jszip";

/** Text of every `<t>` inside one element, in order — handles rich text runs,
 *  where a single string is split across several `<r><t>` fragments. */
function textOf(xml: string): string {
  const parts = [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]);
  return parts.join("").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** "BC12" → 54 (zero-based column index). */
export function columnIndex(ref: string): number {
  const letters = (ref.match(/^[A-Z]+/) ?? [""])[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export interface XlsxSheet { name: string; headers: string[]; rows: string[][] }

/**
 * Read every worksheet. Returns them in workbook order, so "the first sheet" is
 * the one the user sees first when they open the file — which is what they will
 * assume was imported.
 */
export async function parseXlsx(data: ArrayBuffer | Uint8Array): Promise<XlsxSheet[]> {
  const zip = await JSZip.loadAsync(data);

  // Shared strings: most text cells are an index into this table rather than
  // the text itself.
  const sstFile = zip.file("xl/sharedStrings.xml");
  const shared: string[] = [];
  if (sstFile) {
    const xml = await sstFile.async("string");
    for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));
  }

  // Sheet order and names come from the workbook; the file each maps to comes
  // from the rels. Matching on r:id rather than guessing sheet1.xml matters —
  // a workbook with deleted sheets does not renumber its parts.
  const wbFile = zip.file("xl/workbook.xml");
  if (!wbFile) throw new Error("That .xlsx has no workbook — it may be corrupt, or not really a workbook.");
  const wbXml = await wbFile.async("string");
  const relsXml = (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "";
  const relTarget = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    relTarget.set(m[1], m[2].replace(/^\/?xl\//, "").replace(/^\.\//, ""));
  }

  const out: XlsxSheet[] = [];
  for (const m of wbXml.matchAll(/<sheet\b[^>]*\/>/g)) {
    const tag = m[0];
    const name = (tag.match(/name="([^"]*)"/) ?? [, ""])[1]
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    const rid = (tag.match(/r:id="([^"]+)"/) ?? [, ""])[1];
    const target = relTarget.get(rid);
    const file = target ? zip.file(`xl/${target}`) : null;
    if (!file) continue;
    out.push(parseSheet(name, await file.async("string"), shared));
  }
  return out;
}

function parseSheet(name: string, xml: string, shared: string[]): XlsxSheet {
  const grid: string[][] = [];
  for (const rowM of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNum = Number((rowM[1].match(/\br="(\d+)"/) ?? [, "0"])[1]);
    const cells: string[] = [];
    for (const cM of rowM[2].matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cM[1], body = cM[2] ?? "";
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) ?? [, ""])[1];
      const type = (attrs.match(/\bt="([^"]+)"/) ?? [, ""])[1];
      let value = "";
      if (type === "s") {
        const idx = Number((body.match(/<v>(\d+)<\/v>/) ?? [, "-1"])[1]);
        value = shared[idx] ?? "";
      } else if (type === "inlineStr") {
        value = textOf(body);
      } else {
        // Numbers, booleans, dates-as-serials and formula results all arrive as
        // <v>. Left exactly as written: parseTimestamp already understands an
        // Excel serial, so a date needs no special handling here.
        value = (body.match(/<v>([\s\S]*?)<\/v>/) ?? [, ""])[1].trim();
      }
      // Place by cell reference, not by order: a sparse row omits its empty
      // cells entirely, so counting <c> elements would shift every value left.
      const at = ref ? columnIndex(ref) : cells.length;
      while (cells.length < at) cells.push("");
      cells[at] = value;
    }
    // Rows are placed by their own number for the same reason — a blank row in
    // the middle of a sheet is simply absent from the XML.
    const at = rowNum > 0 ? rowNum - 1 : grid.length;
    while (grid.length < at) grid.push([]);
    grid[at] = cells;
  }

  const width = grid.reduce((w, r) => Math.max(w, r.length), 0);
  const pad = (r: string[]) => { const c = [...r]; while (c.length < width) c.push(""); return c; };

  // The first row that has any content is the header row: exported sheets often
  // carry a blank line, or a title, above the table.
  const first = grid.findIndex((r) => r.some((c) => (c ?? "").trim() !== ""));
  if (first < 0) return { name, headers: [], rows: [] };
  const headers = pad(grid[first]).map((h, i) => (h ?? "").trim() || `Column ${i + 1}`);
  const rows = grid.slice(first + 1).map(pad).filter((r) => r.some((c) => (c ?? "").trim() !== ""));
  return { name, headers, rows };
}
