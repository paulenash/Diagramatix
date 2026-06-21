/**
 * Diagram Type Sort Order:
 *  - the built-in default order is CO, VC, PC, AM, BP, FC, SM, DM;
 *  - resolveDiagramTypeStyle layers a DB-override sortOrder (so the admin tile's
 *    order becomes authoritative app-wide, including the project Diagram Type sort).
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_DIAGRAM_TYPE_STYLES,
  resolveDiagramTypeStyle,
  type DiagramTypeStyleOverrides,
} from "@/app/lib/diagram/diagramTypeStyles";

describe("diagram type sort order", () => {
  it("default order is CO, VC, PC, AM, BP, FC, SM, DM", () => {
    const codes = [...DEFAULT_DIAGRAM_TYPE_STYLES]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => s.code);
    expect(codes).toEqual(["CO", "VC", "PC", "AM", "BP", "FC", "SM", "DM"]);
  });

  it("resolveDiagramTypeStyle returns the override sortOrder when present", () => {
    const overrides: DiagramTypeStyleOverrides = { bpmn: { sortOrder: 0 } };
    expect(resolveDiagramTypeStyle("bpmn", overrides).sortOrder).toBe(0);
    // Unrelated fields fall back to the default.
    expect(resolveDiagramTypeStyle("bpmn", overrides).code).toBe("BP");
    // No override → default sortOrder.
    expect(resolveDiagramTypeStyle("bpmn").sortOrder).toBe(4);
  });

  it("a project-style comparator orders mixed diagrams by configured order then name", () => {
    const styleOf = (type: string) => resolveDiagramTypeStyle(type);
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    const diagrams = [
      { name: "Zeta", type: "domain" },       // DM = 7
      { name: "Beta", type: "context" },       // CO = 0
      { name: "Alpha", type: "context" },      // CO = 0
      { name: "Gamma", type: "bpmn" },         // BP = 4
    ];
    const ordered = diagrams.slice().sort((a, b) => {
      const d = styleOf(a.type).sortOrder - styleOf(b.type).sortOrder;
      return d !== 0 ? d : collator.compare(a.name, b.name);
    });
    expect(ordered.map((d) => d.name)).toEqual(["Alpha", "Beta", "Gamma", "Zeta"]);
  });
});
