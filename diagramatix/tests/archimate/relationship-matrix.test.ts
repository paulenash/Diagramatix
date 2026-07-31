/**
 * ArchiMate 3.2 relationship compatibility matrix (drives the connector picker's
 * highlighting). The matrix in public/archimate-relationships.json is generated
 * verbatim from the authoritative 3.2 workbook; these pin the exact permitted
 * sets the picker relies on, plus the degraded-mode fallback.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { loadCompatibilityMatrix, getAllowedRelationships } from "@/app/lib/archimate/compatibility";

const matrix = JSON.parse(readFileSync("public/archimate-relationships.json", "utf8"));

beforeAll(async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => matrix })));
  await loadCompatibilityMatrix();
});

const allowed = (s: string, t: string) => [...getAllowedRelationships(s, t).allowed].sort();

describe("ArchiMate 3.2 relationship matrix", () => {
  it("T1113 — the generated matrix has 60 elements + version 3.2 + universal Association", () => {
    expect(matrix.version).toBe("3.2");
    expect(matrix.elements).toHaveLength(60);
    expect(matrix.universal).toEqual(["archi-association", "archi-association-directed"]);
    expect(matrix.elements).toContain("Equipment");
    expect(matrix.elements).toContain("Grouping");
    expect(matrix.elements).not.toContain("Junction");     // pseudo-concept, excluded
    expect(matrix.elements).not.toContain("Relationship");
  });

  it("T1114 — Equipment→Material permits Access (the previously-missing one) + Assignment + Association", () => {
    expect(allowed("Equipment", "Material")).toEqual(
      ["archi-access", "archi-assignment", "archi-association", "archi-association-directed"].sort(),
    );
  });

  it("T1115 — the matrix is DIRECTIONAL: Material→Equipment differs from Equipment→Material", () => {
    // Reverse direction permits Realization + Association, NOT Access/Assignment.
    const rev = allowed("Material", "Equipment");
    expect(rev).toContain("archi-realisation");
    expect(rev).toContain("archi-association");
    expect(rev).not.toContain("archi-access");
    expect(rev).not.toContain("archi-assignment");
  });

  it("T1116 — a Grouping receives nearly everything; Association is universal", () => {
    // Grouping is a container — 3.2 permits every relationship into it.
    expect(getAllowedRelationships("Application Component", "Grouping").allowed.size).toBeGreaterThanOrEqual(11);
    // Association permitted between any two elements.
    for (const [s, t] of [["Business Actor", "Node"], ["Goal", "Artifact"], ["Assessment", "Business Process"]]) {
      expect(getAllowedRelationships(s, t).allowed.has("archi-association")).toBe(true);
    }
  });

  it("T1117 — over-permits removed: Assessment→Application Component does NOT permit Influence", () => {
    expect(getAllowedRelationships("Assessment", "Application Component").allowed.has("archi-influence")).toBe(false);
  });

  it("T1118 — Specialization only between the same concept", () => {
    expect(getAllowedRelationships("Business Process", "Business Process").allowed.has("archi-specialisation")).toBe(true);
    expect(getAllowedRelationships("Business Process", "Business Actor").allowed.has("archi-specialisation")).toBe(false);
  });

  it("T1119 — single tier: `derived` is always empty; every element pair resolves", () => {
    for (const s of matrix.elements) for (const t of matrix.elements) {
      const r = getAllowedRelationships(s, t);
      expect(r.derived.size).toBe(0);
      expect(r.allowed.size).toBeGreaterThan(0);        // at least Association
    }
  });

  it("T1120 — degraded mode: unknown element / missing name → allow all (never blocks the user)", () => {
    expect(getAllowedRelationships("Not An Element", "Business Actor").allowed.size).toBe(12);
    expect(getAllowedRelationships(undefined, "Business Actor").allowed.size).toBe(12);
  });
});
