/**
 * Diagram Portal denormalisation (T0700). Every data-changing save (and the
 * backfill) mirrors DiagramData.pcf / .procedureDoc onto flat Diagram columns
 * so the Portal's category facet, search, and procedure link are DB-native.
 * This pins the extraction: classification fields, the procedure URL/name
 * fallback, and clean nulls for absent/blank values.
 */
import { describe, it, expect } from "vitest";
import { deriveDiagramDenorm } from "@/app/lib/diagram/denorm";

describe("diagram denorm (T0700)", () => {
  it("extracts PCF + procedure-doc fields from data", () => {
    expect(deriveDiagramDenorm({
      pcf: { nodeId: "n", pcfId: 17040, hierarchyId: "8.5.2", name: "Process AP", frameworkId: "f", variant: "Cross" },
      procedureDoc: { url: "https://sp/ap.docx", name: "AP Procedure v3" },
    })).toEqual({
      pcfId: 17040, pcfHierarchyId: "8.5.2", pcfName: "Process AP",
      procedureDocUrl: "https://sp/ap.docx", procedureDocName: "AP Procedure v3", entityRefs: [],
    });
  });

  it("falls back to the URL when the procedure doc has no display name", () => {
    const r = deriveDiagramDenorm({ procedureDoc: { url: "https://sp/x.pdf" } });
    expect(r.procedureDocUrl).toBe("https://sp/x.pdf");
    expect(r.procedureDocName).toBe("https://sp/x.pdf");
  });

  it("returns all-null for a diagram with no classification or procedure", () => {
    expect(deriveDiagramDenorm({})).toEqual({
      pcfId: null, pcfHierarchyId: null, pcfName: null, procedureDocUrl: null, procedureDocName: null, entityRefs: [],
    });
    expect(deriveDiagramDenorm(null)).toEqual({
      pcfId: null, pcfHierarchyId: null, pcfName: null, procedureDocUrl: null, procedureDocName: null, entityRefs: [],
    });
  });

  it("treats a blank/whitespace URL as no procedure doc, and tolerates a missing pcfId", () => {
    expect(deriveDiagramDenorm({ procedureDoc: { url: "   " } }).procedureDocUrl).toBeNull();
    const r = deriveDiagramDenorm({ pcf: { hierarchyId: "4.2", name: "Manage orders" } });
    expect(r.pcfId).toBeNull();
    expect(r.pcfHierarchyId).toBe("4.2");
    expect(r.pcfName).toBe("Manage orders");
  });
});
