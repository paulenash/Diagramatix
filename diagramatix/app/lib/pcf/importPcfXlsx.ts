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

/** Resolve the "Combined" worksheet's XML path via workbook.xml + its rels. */
async function combinedSheetPath(zip: JSZip): Promise<string> {
  const wb = await zip.file("xl/workbook.xml")!.async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const sheetRe = /<sheet[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"[^>]*\/?>/g;
  let m: RegExpExecArray | null, rid: string | null = null;
  while ((m = sheetRe.exec(wb))) {
    if (m[1].trim().toLowerCase() === "combined") { rid = m[2]; break; }
  }
  if (!rid) throw new Error('Workbook has no "Combined" sheet — not a recognised APQC PCF export.');
  const relRe = new RegExp(`<Relationship[^>]*\\bId="${rid}"[^>]*\\bTarget="([^"]+)"`, "i");
  const rm = relRe.exec(rels);
  if (!rm) throw new Error("Could not resolve the Combined sheet target.");
  const target = rm[1].replace(/^\/?xl\//, "");
  return `xl/${target}`;
}

function findAttribution(shared: string[]): string {
  const note = shared.find((s) => /apqc/i.test(s) && /(reserved|copyrighted|royalty-free|grants you)/i.test(s));
  return note ?? "© APQC. Process Classification Framework® (PCF). Used under APQC's royalty-free licence; see www.apqc.org/pcf.";
}

export async function parsePcfWorkbook(buf: ArrayBuffer | Uint8Array): Promise<ParsedPcf> {
  const zip = await JSZip.loadAsync(buf);
  const ssFile = zip.file("xl/sharedStrings.xml");
  const shared = ssFile ? parseSharedStrings(await ssFile.async("string")) : [];
  const sheetXml = await zip.file(await combinedSheetPath(zip))!.async("string");
  const rows = readSheetRows(sheetXml, shared);

  const nodes: ParsedPcfNode[] = [];
  const seen = new Set<string>();
  for (const cells of rows) {
    const hierarchyId = (cells.B ?? "").trim();
    const name = (cells.C ?? "").trim();
    // Skip the header row + any row without a real dotted code / name.
    if (!hierarchyId || !name || !/^\d+(\.\d+)+$/.test(hierarchyId)) continue;
    if (seen.has(hierarchyId)) continue;
    seen.add(hierarchyId);
    const { level, parentHierarchyId } = levelAndParent(hierarchyId);
    const pcfId = parseInt((cells.A ?? "").trim(), 10);
    nodes.push({
      pcfId: Number.isFinite(pcfId) ? pcfId : 0,
      hierarchyId,
      name,
      description: (cells.G ?? "").trim() || null,
      level,
      parentHierarchyId,
      changeType: deriveChangeType(cells.E ?? ""),
      metricsAvailable: /^y/i.test((cells.F ?? "").trim()),
    });
  }
  return { attributionNote: findAttribution(shared), nodes };
}
