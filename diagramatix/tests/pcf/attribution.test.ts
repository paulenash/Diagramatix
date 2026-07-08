import { describe, it, expect } from "vitest";
import { APQC_ATTRIBUTION, dataHasPcf, anyDiagramHasPcf } from "@/app/lib/pcf/attribution";

describe("PCF attribution detection", () => {
  it("the notice contains APQC's required derivative-works clause", () => {
    expect(APQC_ATTRIBUTION).toMatch(/APQC/);
    expect(APQC_ATTRIBUTION).toMatch(/derivative works contain a copy of this notice/i);
  });

  it("dataHasPcf is true for a diagram-level classification", () => {
    expect(dataHasPcf({ pcf: { pcfId: 1, frameworkId: "f" }, elements: [] })).toBe(true);
  });

  it("dataHasPcf is true for a pcf-tagged element (code or id)", () => {
    expect(dataHasPcf({ elements: [{ properties: { pcfHierarchyId: "1.1.1" } }] })).toBe(true);
    expect(dataHasPcf({ elements: [{ properties: { pcfId: 42 } }] })).toBe(true);
  });

  it("dataHasPcf is false for empty pcf, unrelated properties, or non-objects", () => {
    expect(dataHasPcf({ pcf: {}, elements: [{ properties: { fillColor: "#fff" } }] })).toBe(false);
    expect(dataHasPcf({ elements: [{ properties: null }, {}] })).toBe(false);
    expect(dataHasPcf({})).toBe(false);
    expect(dataHasPcf(null)).toBe(false);
  });

  it("anyDiagramHasPcf scans a list of diagrams", () => {
    expect(anyDiagramHasPcf([{ data: {} }, { data: { pcf: { pcfId: 1 } } }])).toBe(true);
    expect(anyDiagramHasPcf([{ data: {} }, { data: { elements: [] } }])).toBe(false);
  });
});
