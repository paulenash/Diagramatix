/**
 * Collapse a uml-package (Data Model) into a linked Domain diagram: the nested
 * classes are removed from THIS canvas, purely-interior connectors are dropped,
 * and connectors that CROSS the package boundary re-attach to the package.
 * (CONVERT_PACKAGE_COLLAPSED in app/hooks/useDiagram.ts.)
 */
import { describe, it, expect } from "vitest";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";

const el = (id: string, type: DiagramElement["type"], x: number, parentId?: string): DiagramElement =>
  ({ id, type, x, y: 100, width: 140, height: 80, label: id, properties: {}, ...(parentId ? { parentId } : {}) });

const conn = (id: string, sourceId: string, targetId: string): Connector =>
  ({ id, sourceId, targetId, type: "uml-association", directionType: "non-directed", routingType: "rectilinear",
     sourceSide: "right", targetSide: "left", sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [] });

function world(): DiagramData {
  return {
    elements: [
      el("p", "uml-package", 0),
      el("c1", "uml-class", 40, "p"),
      el("c2", "uml-class", 120, "p"),
      el("ext", "uml-class", 600),
    ],
    connectors: [
      conn("k-int", "c1", "c2"),   // interior — both ends inside the package
      conn("k-out", "c1", "ext"),  // crossing — inside → outside
      conn("k-in", "ext", "c2"),   // crossing — outside → inside
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

describe("CONVERT_PACKAGE_COLLAPSED", () => {
  const act: Action = { type: "CONVERT_PACKAGE_COLLAPSED", payload: { id: "p", linkedDiagramId: "sub-1" } };

  it("removes the interior classes and links the package", () => {
    const d = reducer(world(), act);
    expect(d.elements.find(e => e.id === "c1")).toBeUndefined();
    expect(d.elements.find(e => e.id === "c2")).toBeUndefined();
    expect(d.elements.find(e => e.id === "ext")).toBeDefined();
    const p = d.elements.find(e => e.id === "p")!;
    expect(p.properties.linkedDiagramId).toBe("sub-1");
    expect(p.properties.collapsed).toBe(true);
  });

  it("drops interior connectors and re-attaches crossing ones to the package", () => {
    const d = reducer(world(), act);
    expect(d.connectors.find(c => c.id === "k-int")).toBeUndefined();      // interior gone
    const out = d.connectors.find(c => c.id === "k-out")!;
    const inn = d.connectors.find(c => c.id === "k-in")!;
    expect(out.sourceId).toBe("p");    // c1 → package
    expect(out.targetId).toBe("ext");
    expect(inn.sourceId).toBe("ext");
    expect(inn.targetId).toBe("p");    // c2 → package
  });

  it("is a no-op for an empty package", () => {
    const empty: DiagramData = { elements: [el("p", "uml-package", 0)], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } };
    const d = reducer(empty, act);
    expect(d.elements.find(e => e.id === "p")!.properties.linkedDiagramId).toBeUndefined();
  });
});
