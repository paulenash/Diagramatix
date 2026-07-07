/**
 * APQC PCF workbook parser (importPcfXlsx): the dotted-code → level/parent
 * derivation, and hand-parsing a (synthetic) Combined sheet via JSZip into a
 * node tree. Pure — builds a tiny .xlsx in-memory, no real file.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parsePcfWorkbook, levelAndParent } from "@/app/lib/pcf/importPcfXlsx";

// Minimal shared strings; names/codes referenced by index from the sheet cells.
const STR = [
  "1.0", "Develop Vision and Strategy",          // 0,1
  "1.1", "Sales &amp; Marketing",                 // 2,3  (entity → "Sales & Marketing")
  "1.1.1", "Assess the external environment",     // 4,5
  "1.1.1.1", "Identify competitors",              // 6,7
  "NEW", "Yes", "A description",                  // 8,9,10
  "Hierarchy ID", "Name",                          // 11,12 (header cells)
];
const sst = `<sst>${STR.map((s) => `<si><t>${s}</t></si>`).join("")}</sst>`;

// r, [col,type,value] — type "s" = shared-string index, "" = inline number.
const cell = (col: string, r: number, t: string, v: string) => `<c r="${col}${r}"${t ? ` t="${t}"` : ""}><v>${v}</v></c>`;
const rows = [
  `<row r="1">${cell("B", 1, "s", "11")}${cell("C", 1, "s", "12")}</row>`,            // header — skipped
  `<row r="2">${cell("A", 2, "", "10002")}${cell("B", 2, "s", "0")}${cell("C", 2, "s", "1")}</row>`,
  `<row r="3">${cell("A", 3, "", "17040")}${cell("B", 3, "s", "2")}${cell("C", 3, "s", "3")}</row>`,
  `<row r="4">${cell("A", 4, "", "10017")}${cell("B", 4, "s", "4")}${cell("C", 4, "s", "5")}</row>`,
  `<row r="5">${cell("A", 5, "", "20000")}${cell("B", 5, "s", "6")}${cell("C", 5, "s", "7")}${cell("E", 5, "s", "8")}${cell("F", 5, "s", "9")}${cell("G", 5, "s", "10")}</row>`,
].join("");

async function buildWorkbook(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("xl/workbook.xml", `<?xml version="1.0"?><workbook xmlns:r="http://x"><sheets><sheet name="Combined" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`);
  zip.file("xl/sharedStrings.xml", sst);
  zip.file("xl/worksheets/sheet1.xml", `<worksheet><sheetData>${rows}</sheetData></worksheet>`);
  return zip.generateAsync({ type: "uint8array" });
}

describe("PCF workbook parser", () => {
  it("T0659 — derives level + parent from the dotted Hierarchy ID", () => {
    expect(levelAndParent("1.0")).toEqual({ level: 1, parentHierarchyId: null });
    expect(levelAndParent("1.1")).toEqual({ level: 2, parentHierarchyId: "1.0" });
    expect(levelAndParent("1.1.1")).toEqual({ level: 3, parentHierarchyId: "1.1" });
    expect(levelAndParent("1.1.1.2")).toEqual({ level: 4, parentHierarchyId: "1.1.1" });
    expect(levelAndParent("10.0")).toEqual({ level: 1, parentHierarchyId: null });
  });

  it("T0660 — parses a Combined sheet into a node tree (skips header, unescapes, reads change/metrics/desc)", async () => {
    const { nodes, attributionNote } = await parsePcfWorkbook(await buildWorkbook());
    expect(nodes).toHaveLength(4); // header row skipped

    const cat = nodes.find((n) => n.hierarchyId === "1.0")!;
    expect(cat).toMatchObject({ pcfId: 10002, level: 1, parentHierarchyId: null, name: "Develop Vision and Strategy" });

    const grp = nodes.find((n) => n.hierarchyId === "1.1")!;
    expect(grp.name).toBe("Sales & Marketing");                 // &amp; unescaped
    expect(grp.parentHierarchyId).toBe("1.0");

    const leaf = nodes.find((n) => n.hierarchyId === "1.1.1.1")!;
    expect(leaf).toMatchObject({ level: 4, parentHierarchyId: "1.1.1", changeType: "NEW", metricsAvailable: true, description: "A description", pcfId: 20000 });

    // No APQC notice in the synthetic strings → the attribution fallback still cites APQC.
    expect(attributionNote).toMatch(/APQC/);
  });
});
