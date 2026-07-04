/**
 * The hand-built .xlsx writer (used for the Risk-Control Matrix export) produces
 * a valid OOXML zip whose worksheet carries the given rows as inline strings.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildXlsx } from "@/app/lib/riskControls/xlsx";

describe("xlsx writer", () => {
  it("T0629 — builds a valid multi-sheet workbook with inline-string cells", async () => {
    const buf = await buildXlsx([
      { name: "Risk-Control Matrix", rows: [["Risk", "Coverage"], ["R-01 Fraud", "GAP"], ["R-02 Error", "Covered"]] },
      { name: "Controls", rows: [["Control", "Owner"], ["C-01 Approval", "Finance"]] },
    ]);
    const z = await JSZip.loadAsync(buf);
    // Core OOXML parts present.
    for (const p of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]) {
      expect(z.file(p), `${p} present`).toBeTruthy();
    }
    const wb = await z.file("xl/workbook.xml")!.async("string");
    expect(wb).toContain('name="Risk-Control Matrix"');
    expect(wb).toContain('name="Controls"');
    const s1 = await z.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(s1).toContain("<t xml:space=\"preserve\">R-01 Fraud</t>");
    expect(s1).toContain("<t xml:space=\"preserve\">GAP</t>");
    // Ampersand-escaping in a sheet name / cell doesn't corrupt the XML.
    const buf2 = await buildXlsx([{ name: "A & B", rows: [["x & y"]] }]);
    const z2 = await JSZip.loadAsync(buf2);
    expect(await z2.file("xl/worksheets/sheet1.xml")!.async("string")).toContain("x &amp; y");
  });
});
