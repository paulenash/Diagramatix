/** Parse an APQC PCF workbook (.xlsx) into a flat node list. Every APQC PCF
 *  workbook — Cross-Industry and every industry variant — shares the same layout:
 *  a "Combined" sheet with columns A PCF ID · B Hierarchy ID (dotted code) ·
 *  C Name · D Difference Index · E Change Details · F Metrics? · G Element
 *  Description. Level + parent are derived from the dotted Hierarchy ID.
 *
 *  Hand-parses the OOXML with JSZip (already a dependency — same approach as the
 *  .vsdx importer), so no spreadsheet library is needed. Pure over a buffer →
 *  unit-testable without a live upload. `pcfId` (col A) is APQC's stable id and
 *  the key downstream refs hang off.  .xls (old binary) is NOT supported — those
 *  must be converted to .xlsx first. */
import JSZip from "jszip";

export interface ParsedPcfNode {
  pcfId: number;
  hierarchyId: string;
  name: string;
  description: string | null;
  level: number;
  parentHierarchyId: string | null;
  changeType: string | null;   // "NEW" | "RENAMED" | null
  metricsAvailable: boolean;
}
export interface ParsedPcf {
  attributionNote: string;     // the ©APQC notice (must travel with copies/exports)
  nodes: ParsedPcfNode[];
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&amp;/g, "&");
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let t: RegExpExecArray | null, s = "";
    while ((t = tRe.exec(m[1]))) s += t[1];
    out.push(unescapeXml(s));
  }
  return out;
}

/** Level + parent from the dotted Hierarchy ID. Categories are "N.0" (level 1);
 *  a level-2 code "N.M" parents to its category "N.0"; deeper codes drop the last
 *  dotted segment. */
export function levelAndParent(hierarchyId: string): { level: number; parentHierarchyId: string | null } {
  if (/^\d+\.0$/.test(hierarchyId)) return { level: 1, parentHierarchyId: null };
  const seg = hierarchyId.split(".");
  if (seg.length === 2) return { level: 2, parentHierarchyId: `${seg[0]}.0` };
  return { level: seg.length, parentHierarchyId: seg.slice(0, -1).join(".") };
}

function deriveChangeType(changeDetails: string): string | null {
  const c = changeDetails.trim().toUpperCase();
  if (!c) return null;
  if (c.startsWith("NEW")) return "NEW";
  if (c.includes("RENAME")) return "RENAMED";
  return null;
}

/** Read the cells of a worksheet into per-row column maps ({ A: "..", B: ".." }). */
function readSheetRows(sheetXml: string, shared: string[]): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  const cellRe = /<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g;
  let r: RegExpExecArray | null;
  while ((r = rowRe.exec(sheetXml))) {
    const cells: Record<string, string> = {};
    let c: RegExpExecArray | null;
    cellRe.lastIndex = 0;
    while ((c = cellRe.exec(r[1]))) {
      const col = c[1], attrs = c[2], inner = c[3];
      const tm = /\bt="([^"]+)"/.exec(attrs);
      const t = tm ? tm[1] : "";
      let val = "";
      if (t === "inlineStr") {
        const im = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner);
        val = im ? unescapeXml(im[1]) : "";
      } else {
        const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
        if (vm) val = t === "s" ? (shared[parseInt(vm[1], 10)] ?? "") : unescapeXml(vm[1]);
      }
      cells[col] = val;
    }
    rows.push(cells);
  }
  return rows;
}

/** Map every worksheet name → its XML path (via workbook.xml + rels). */
async function sheetPathsByName(zip: JSZip): Promise<Map<string, string>> {
  const wb = await zip.file("xl/workbook.xml")!.async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const out = new Map<string, string>();
  const sheetRe = /<sheet[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = sheetRe.exec(wb))) {
    const rm = new RegExp(`<Relationship[^>]*\\bId="${m[2]}"[^>]*\\bTarget="([^"]+)"`, "i").exec(rels);
    if (rm) out.set(m[1].trim(), `xl/${rm[1].replace(/^\/?xl\//, "")}`);
  }
  return out;
}

/** Build a ParsedPcfNode from an already-dotted code + name (shared by both
 *  formats). Normalises a bare category code ("1" → "1.0"). */
function nodeFromCode(rawCode: string, name: string, pcfId: number, description: string | null, extra?: { changeType?: string | null; metricsAvailable?: boolean }): ParsedPcfNode {
  const hierarchyId = rawCode.includes(".") ? rawCode : `${rawCode}.0`;
  const { level, parentHierarchyId } = levelAndParent(hierarchyId);
  return { pcfId, hierarchyId, name, description, level, parentHierarchyId, changeType: extra?.changeType ?? null, metricsAvailable: extra?.metricsAvailable ?? false };
}

/** Legacy per-category format (e.g. APQC PCF v5.0.x): no Combined sheet — one
 *  sheet per category ("1.0" … "13.0"), the element sits in the column for its
 *  level (Category / Group / Process / Activity), and the dotted code is embedded
 *  at the start of that cell ("1.1.1 Assess the external environment"). PCF ID is
 *  in column A. We extract the embedded code + name and reuse the standard tree. */
async function parseLegacyPerCategory(zip: JSZip, shared: string[]): Promise<ParsedPcfNode[]> {
  const paths = await sheetPathsByName(zip);
  const catSheets = [...paths.entries()]
    .filter(([name]) => /^\d+\.0$/.test(name))
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  const nodes: ParsedPcfNode[] = [];
  const seen = new Set<string>();
  for (const [, path] of catSheets) {
    const rows = readSheetRows(await zip.file(path)!.async("string"), shared);
    for (const cells of rows) {
      // The level cell: any column (not A) whose text starts with a dotted code.
      let codeCell = "";
      for (const [col, val] of Object.entries(cells)) {
        if (col === "A") continue;
        if (/^\d+(?:\.\d+)*\s+\S/.test(val)) { codeCell = val; break; }
      }
      if (!codeCell) continue;
      const cm = /^(\d+(?:\.\d+)*)\s+([\s\S]*)$/.exec(codeCell);
      if (!cm) continue;
      const name = cm[2].replace(/\s*\(\d+\)\s*$/, "").trim(); // strip trailing "(pcfId)"
      if (!name) continue;
      const pcfId = parseInt((cells.A ?? "").trim(), 10);
      const node = nodeFromCode(cm[1], name, Number.isFinite(pcfId) ? pcfId : 0, null);
      if (seen.has(node.hierarchyId)) continue;
      seen.add(node.hierarchyId);
      nodes.push(node);
    }
  }
  return nodes;
}

function findAttribution(shared: string[]): string {
  const note = shared.find((s) => /apqc/i.test(s) && /(reserved|copyrighted|royalty-free|grants you)/i.test(s));
  return note ?? "© APQC. Process Classification Framework® (PCF). Used under APQC's royalty-free licence; see www.apqc.org/pcf.";
}

export async function parsePcfWorkbook(buf: ArrayBuffer | Uint8Array): Promise<ParsedPcf> {
  const zip = await JSZip.loadAsync(buf);
  const ssFile = zip.file("xl/sharedStrings.xml");
  const shared = ssFile ? parseSharedStrings(await ssFile.async("string")) : [];
  const attributionNote = findAttribution(shared);

  const paths = await sheetPathsByName(zip);
  const combined = [...paths.entries()].find(([name]) => name.toLowerCase() === "combined")?.[1];

  // Legacy per-category workbooks (v5.0.x) have no Combined sheet.
  if (!combined) {
    return { attributionNote, nodes: await parseLegacyPerCategory(zip, shared) };
  }

  // Modern format — the Combined sheet, cols A pcfId / B hierarchyId / C name / …
  const rows = readSheetRows(await zip.file(combined)!.async("string"), shared);
  const nodes: ParsedPcfNode[] = [];
  const seen = new Set<string>();
  for (const cells of rows) {
    const hierarchyId = (cells.B ?? "").trim();
    const name = (cells.C ?? "").trim();
    if (!hierarchyId || !name || !/^\d+(\.\d+)+$/.test(hierarchyId)) continue;
    if (seen.has(hierarchyId)) continue;
    seen.add(hierarchyId);
    const { level, parentHierarchyId } = levelAndParent(hierarchyId);
    const pcfId = parseInt((cells.A ?? "").trim(), 10);
    nodes.push({
      pcfId: Number.isFinite(pcfId) ? pcfId : 0,
      hierarchyId, name,
      description: (cells.G ?? "").trim() || null,
      level, parentHierarchyId,
      changeType: deriveChangeType(cells.E ?? ""),
      metricsAvailable: /^y/i.test((cells.F ?? "").trim()),
    });
  }
  return { attributionNote, nodes };
}
