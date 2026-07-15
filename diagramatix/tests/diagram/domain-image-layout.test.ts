/**
 * Domain (UML class) image reproduction — when the AI (reading an uploaded class
 * diagram) emits per-element `bounds` + package `parent` + connector faces, the
 * generated DiagramData should honour that geometry instead of grid-flowing.
 */
import { describe, it, expect } from "vitest";
import { layoutGenericDiagram } from "@/app/lib/diagram/genericLayout";
import type { UmlAttribute } from "@/app/lib/diagram/types";

const parsed = {
  elements: [
    { id: "p1", type: "uml-package", label: "Sales", bounds: { x: 0.05, y: 0.05, w: 0.5, h: 0.8 } },
    { id: "c1", type: "uml-class", label: "Customer", parent: "p1",
      bounds: { x: 0.08, y: 0.15, w: 0.2, h: 0.25 },
      attributes: [{ name: "id", type: "Integer", visibility: "+" }],
      operations: [{ name: "rename", visibility: "+" }] },
    { id: "c2", type: "uml-class", label: "Order", parent: "p1",
      bounds: { x: 0.34, y: 0.15, w: 0.2, h: 0.2 }, attributes: [{ name: "no", type: "Integer" }] },
    { id: "e1", type: "uml-enumeration", label: "Status",
      bounds: { x: 0.7, y: 0.15, w: 0.22, h: 0.18 }, values: ["New", "Done"] },
  ],
  connections: [
    { sourceId: "c1", targetId: "c2", type: "uml-association", sourceMultiplicity: "1", targetMultiplicity: "*", sourceSide: "right", targetSide: "left" },
    { sourceId: "c2", targetId: "e1", type: "uml-association", targetMultiplicity: "1" },
  ],
};

describe("domain image reproduction (layout preserved from bounds)", () => {
  it("positions elements from bounds, nests classes in the package, builds typed connectors", () => {
    const data = layoutGenericDiagram(parsed as never, "domain", { imageAspect: { w: 1000, h: 700 } });

    const c1 = data.elements.find(e => e.id === "c1")!;
    const c2 = data.elements.find(e => e.id === "c2")!;
    // Not the grid: c1 left of c2, both offset from origin per bounds.
    expect(c1.x).toBeLessThan(c2.x);
    expect(c1.x).toBeGreaterThan(50);
    // Package nesting.
    expect(c1.parentId).toBe("p1");
    expect(c2.parentId).toBe("p1");
    // Package encloses its members.
    const p1 = data.elements.find(e => e.id === "p1")!;
    expect(p1.x).toBeLessThanOrEqual(c1.x);
    expect(p1.x + p1.width).toBeGreaterThanOrEqual(c2.x + c2.width);
    // Attributes + operations reconstructed.
    expect((c1.properties.attributes as UmlAttribute[])[0].name).toBe("id");
    expect((c1.properties.operations as Array<{ name: string }>)[0].name).toBe("rename");
    // Enum values.
    expect(data.elements.find(e => e.id === "e1")!.properties.values).toEqual(["New", "Done"]);
    // Connectors typed + multiplicities preserved.
    const assoc = data.connectors.find(c => c.sourceId === "c1")!;
    expect(assoc.type).toBe("uml-association");
    expect(assoc.sourceMultiplicity).toBe("1");
    expect(assoc.targetMultiplicity).toBe("*");
  });

  it("falls back to auto-layout when bounds are absent", () => {
    const noBounds = {
      elements: [
        { id: "a", type: "uml-class", label: "A" },
        { id: "b", type: "uml-class", label: "B" },
      ],
      connections: [{ sourceId: "a", targetId: "b", type: "uml-association" }],
    };
    const data = layoutGenericDiagram(noBounds as never, "domain");
    expect(data.elements).toHaveLength(2);
    expect(data.connectors).toHaveLength(1);
  });
});
