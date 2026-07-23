/**
 * ArchiMate 3.2 catalogue + layout guards. Prove the upgrade is internally
 * consistent: every element icon has a drawer, every AI-layout shapeKey exists,
 * the new element types band correctly, and the version/cleanup landed.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ICON_DRAWERS } from "@/app/lib/archimate/icons";
import { ARCHI_SHAPE, ARCHI_BAND } from "@/app/lib/diagram/genericLayout";
import { ARCHI_REL_NAME } from "@/app/lib/diagram/archimateConnectorStyle";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const catalogue: any = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "public/archimate-catalogue.json"), "utf8"),
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const allShapes: any[] = catalogue.categories.flatMap((c: any) => c.shapes);

describe("ArchiMate v3.2 catalogue + layout", () => {
  it("T0992 — every catalogue iconType in use has an ICON_DRAWERS drawer", () => {
    const missing = [...new Set(
      allShapes.map((s) => s.iconType).filter((t) => t && !(t in ICON_DRAWERS)),
    )];
    expect(missing).toEqual([]);
  });

  it("T0993 — every ARCHI_SHAPE key exists in the catalogue", () => {
    const keys = new Set(allShapes.map((s) => s.key));
    const missing = Object.values(ARCHI_SHAPE).map((v) => v.key).filter((k) => !keys.has(k));
    expect(missing).toEqual([]);
  });

  it("T0994 — new v3.2 element types band correctly (Technology 11, Impl&Migration 12)", () => {
    for (const t of ["technology-path", "technology-communication-network", "equipment", "facility", "distribution-network", "material"])
      expect(ARCHI_BAND[t]).toBe(11);
    for (const t of ["work-package", "deliverable", "implementation-event", "plateau", "gap"])
      expect(ARCHI_BAND[t]).toBe(12);
  });

  it("T0995 — catalogue is v3.2, Technology has 17 types, new categories present, typo/dupes gone", () => {
    expect(catalogue.version).toBe("3.2");
    expect(catalogue.categories.find((c: { id: string }) => c.id === "technology").shapes.length).toBe(17);
    expect(catalogue.categories.map((c: { id: string }) => c.id)).toEqual(
      expect.arrayContaining(["implementation-migration", "composite"]),
    );
    expect(allShapes.some((s) => s.key === "motivation-assessmen-icon")).toBe(false);
    expect(allShapes.some((s) => /-icon-\d+$/.test(s.key))).toBe(false);
  });

  it("T0996 — Directed Association relationship-name is registered", () => {
    expect(ARCHI_REL_NAME["archi-association-directed"]).toBe("Association (directed)");
  });

  it("T0997 — relationship matrix covers the new elements + Directed Association is universal", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matrix: any = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "public/archimate-relationships.json"), "utf8"),
    );
    expect(matrix.universal).toContain("archi-association-directed");
    const named = new Set(Object.values(matrix.categories).flat() as string[]);
    for (const n of ["Path", "Communication Network", "Equipment", "Facility", "Distribution Network", "Material", "Work Package", "Deliverable", "Implementation Event", "Grouping", "Location", "Plateau", "Gap"])
      expect(named.has(n), `matrix missing category for "${n}"`).toBe(true);
  });

  it("T0998 — Realisation is directly allowed for elements that realise a Service", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matrix: any = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "public/archimate-relationships.json"), "utf8"),
    );
    const realisesService: [string, string][] = [
      ["Business Process", "Business Service"],
      ["Business Function", "Business Service"],
      ["Application Function", "Application Service"],
      ["Application Component", "Application Service"],
      ["Technology Process", "Technology Service"],
    ];
    for (const [src, tgt] of realisesService)
      expect(matrix.overrides?.[src]?.[tgt]?.allowed ?? [], `${src} → ${tgt}`).toContain("archi-realisation");
  });
});
