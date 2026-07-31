/**
 * ArchiMate 3.2 catalogue + layout guards. Prove the upgrade is internally
 * consistent: every element icon has a drawer, every AI-layout shapeKey exists,
 * the new element types band correctly, and the version/cleanup landed.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ICON_DRAWERS } from "@/app/lib/archimate/icons";
import { ARCHI_SHAPE, ARCHI_BAND, ARCHI_DUAL_FORM } from "@/app/lib/diagram/genericLayout";
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

  it("T1077 — every dual-form type maps to a `-box` key whose `-icon` sibling exists (image ingestion can pick either form)", () => {
    const keys = new Set(allShapes.map((s) => s.key));
    for (const type of ARCHI_DUAL_FORM) {
      const spec = ARCHI_SHAPE[type];
      expect(spec, `ARCHI_SHAPE has ${type}`).toBeTruthy();
      expect(spec.key.endsWith("-box"), `${type} defaults to a -box key`).toBe(true);
      const iconKey = spec.key.replace(/-box$/, "-icon");
      expect(keys.has(spec.key), `catalogue has ${spec.key}`).toBe(true);
      expect(keys.has(iconKey), `catalogue has ${iconKey}`).toBe(true);
    }
  });

  it("T1079 — Node + Component have selectable icon forms (dual-form + catalogue + drawer); System Software is box-only", () => {
    const keys = new Set(allShapes.map((s) => s.key));
    for (const t of ["technology-node", "application-component"]) {
      expect(ARCHI_DUAL_FORM.has(t), `${t} is dual-form`).toBe(true);
      const iconKey = ARCHI_SHAPE[t].key.replace(/-box$/, "-icon");
      expect(keys.has(iconKey), `catalogue has ${iconKey}`).toBe(true);
    }
    expect(allShapes.find((s) => s.key === "technology-node-icon").iconType).toBe("node");
    // System Software is box-only (bespoke corner-glyph icon assigned via the Icon Library).
    expect(ARCHI_DUAL_FORM.has("technology-system-software"), "system software NOT dual-form").toBe(false);
  });

  it("T0994 — new v3.2 element types band correctly (Technology 11, Impl&Migration 12)", () => {
    for (const t of ["technology-path", "technology-communication-network", "equipment", "facility", "distribution-network", "material"])
      expect(ARCHI_BAND[t]).toBe(11);
    for (const t of ["work-package", "deliverable", "implementation-event", "plateau", "gap"])
      expect(ARCHI_BAND[t]).toBe(12);
  });

  it("T0995 — catalogue is v3.2, Technology has 18 masters (Node gained an icon form; System Software is box-only), new categories present, typo/dupes gone", () => {
    expect(catalogue.version).toBe("3.2");
    // 17 box masters + the Node icon (expressed) form = 18.
    expect(catalogue.categories.find((c: { id: string }) => c.id === "technology").shapes.length).toBe(18);
    expect(catalogue.categories.map((c: { id: string }) => c.id)).toEqual(
      expect.arrayContaining(["implementation-migration", "composite"]),
    );
    expect(allShapes.some((s) => s.key === "motivation-assessmen-icon")).toBe(false);
    expect(allShapes.some((s) => /-icon-\d+$/.test(s.key))).toBe(false);
  });

  it("T0996 — Directed Association relationship-name is registered", () => {
    expect(ARCHI_REL_NAME["archi-association-directed"]).toBe("Association (directed)");
  });

  // The matrix is now the EXACT ArchiMate 3.2 permitted set (public/
  // archimate-relationships.json, generated from the workbook — format:
  // { elements[], universal[], permitted[source][target] }). These pin the real
  // relationships (previously asserted against the old category approximation).
  const MATRIX = () => JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/archimate-relationships.json"), "utf8"));
  const permits = (m: { permitted: Record<string, Record<string, string[]>> }, s: string, t: string, rel: string) =>
    (m.permitted[s]?.[t] ?? []).includes(rel);

  it("T0997 — matrix covers the new 3.2 elements + Directed Association is universal", () => {
    const m = MATRIX();
    expect(m.version).toBe("3.2");
    expect(m.universal).toContain("archi-association-directed");
    const els = new Set(m.elements as string[]);
    for (const n of ["Path", "Communication Network", "Equipment", "Facility", "Distribution Network", "Material", "Work Package", "Deliverable", "Implementation Event", "Grouping", "Location", "Plateau", "Gap"])
      expect(els.has(n), `matrix missing element "${n}"`).toBe(true);
  });

  it("T0998 — Realisation is permitted for elements that realise a Service", () => {
    const m = MATRIX();
    const realisesService: [string, string][] = [
      ["Business Process", "Business Service"],
      ["Business Function", "Business Service"],
      ["Application Function", "Application Service"],
      ["Application Component", "Application Service"],
      ["Technology Process", "Technology Service"],
    ];
    for (const [src, tgt] of realisesService)
      expect(permits(m, src, tgt, "archi-realisation"), `${src} → ${tgt}`).toBe(true);
  });

  it("T1012 — a core element realises a Strategy element (Business Process → Capability)", () => {
    const m = MATRIX();
    expect(permits(m, "Business Process", "Capability", "archi-realisation")).toBe(true);
    expect(permits(m, "Resource", "Capability", "archi-assignment")).toBe(true);
  });

  it("T1013 — representative real 3.2 relationships hold in the permitted matrix", () => {
    const m = MATRIX();
    const cases: [string, string, string][] = [
      ["Business Process", "Business Function", "archi-serving"],     // behaviour → behaviour serving
      ["Business Process", "Business Function", "archi-composition"], // behaviour whole–part
      ["Business Actor", "Business Object", "archi-access"],          // active → passive access
      ["Business Interface", "Business Process", "archi-serving"],    // interface → behaviour serving
      ["Application Component", "Grouping", "archi-composition"],     // anything → Grouping
      ["Equipment", "Material", "archi-access"],                     // the previously-missing one
    ];
    for (const [s, t, rel] of cases) expect(permits(m, s, t, rel), `${s} → ${t} : ${rel}`).toBe(true);
    // ...and a known NON-permit (over-permit removed):
    expect(permits(m, "Assessment", "Application Component", "archi-influence")).toBe(false);
  });
});
