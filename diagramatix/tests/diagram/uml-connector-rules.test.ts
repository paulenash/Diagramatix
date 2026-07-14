/**
 * Domain-diagram connector rules (app/hooks/useDiagram.ts ADD_CONNECTOR):
 *   • uml-containment is package-to-package ONLY.
 *   • a package accepts only dependency or containment.
 *   • a Note connects ONLY via a uml-note-anchor, to a non-note / non-pain-point.
 */
import { describe, it, expect } from "vitest";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import type { DiagramData, DiagramElement, ConnectorType } from "@/app/lib/diagram/types";

const el = (id: string, type: DiagramElement["type"], x: number): DiagramElement =>
  ({ id, type, x, y: 100, width: 120, height: 80, label: id, properties: {} });

const base = (elements: DiagramElement[]): DiagramData =>
  ({ elements, connectors: [], viewport: { x: 0, y: 0, zoom: 1 } });

const add = (sourceId: string, targetId: string, connectorType: ConnectorType): Action => ({
  type: "ADD_CONNECTOR",
  payload: {
    sourceId, targetId, connectorType,
    directionType: "non-directed", routingType: "direct",
    sourceSide: "right", targetSide: "left",
  },
});

const world = (): DiagramData => base([
  el("p1", "uml-package", 0),
  el("p2", "uml-package", 400),
  el("c1", "uml-class", 800),
  el("n1", "uml-note", 1200),
  el("pp", "uml-pain-point", 1600),
]);

describe("uml-containment", () => {
  it("allows containment between two packages", () => {
    const d = reducer(world(), add("p1", "p2", "uml-containment"));
    expect(d.connectors).toHaveLength(1);
    expect(d.connectors[0].type).toBe("uml-containment");
  });
  it("rejects containment from a package to a class", () => {
    expect(reducer(world(), add("p1", "c1", "uml-containment")).connectors).toHaveLength(0);
  });
  it("rejects containment between two classes", () => {
    expect(reducer(world(), add("c1", "c1", "uml-containment")).connectors).toHaveLength(0);
  });
});

describe("package endpoints", () => {
  it("still allows a dependency between packages", () => {
    const d = reducer(world(), add("p1", "p2", "uml-dependency"));
    expect(d.connectors).toHaveLength(1);
  });
  it("still rejects a plain association touching a package", () => {
    expect(reducer(world(), add("p1", "c1", "uml-association")).connectors).toHaveLength(0);
  });
});

describe("uml-note-anchor", () => {
  it("allows a note anchor from a note to a class", () => {
    const d = reducer(world(), add("n1", "c1", "uml-note-anchor"));
    expect(d.connectors).toHaveLength(1);
    expect(d.connectors[0].type).toBe("uml-note-anchor");
  });
  it("rejects a note anchor to a pain point", () => {
    expect(reducer(world(), add("n1", "pp", "uml-note-anchor")).connectors).toHaveLength(0);
  });
  it("rejects a note anchor between two notes", () => {
    const d = base([el("n1", "uml-note", 0), el("n2", "uml-note", 400)]);
    expect(reducer(d, add("n1", "n2", "uml-note-anchor")).connectors).toHaveLength(0);
  });
  it("rejects a note anchor with no note end", () => {
    expect(reducer(world(), add("c1", "c1", "uml-note-anchor")).connectors).toHaveLength(0);
  });
  it("rejects a NON-anchor connector touching a note", () => {
    expect(reducer(world(), add("n1", "c1", "uml-association")).connectors).toHaveLength(0);
  });
});

describe("pain points are non-interactive with connectors (issue #4)", () => {
  it("rejects any connector with a pain-point endpoint", () => {
    expect(reducer(world(), add("pp", "c1", "uml-association")).connectors).toHaveLength(0);
    expect(reducer(world(), add("c1", "pp", "uml-dependency")).connectors).toHaveLength(0);
  });
});

describe("package containment ↔ connector reconciliation (issues #5/#6)", () => {
  // Two packages, the child (p2) currently top-level with a containment
  // connector to p1. Moving p2's centre INTO p1 should drop that connector.
  const nestIntoWorld = (): DiagramData => ({
    elements: [
      { id: "p1", type: "uml-package", x: 0, y: 0, width: 500, height: 400, label: "P1", properties: {} },
      { id: "p2", type: "uml-package", x: 700, y: 0, width: 160, height: 120, label: "P2", properties: {} },
    ],
    connectors: [
      { id: "cc", sourceId: "p2", targetId: "p1", type: "uml-containment",
        sourceSide: "top", targetSide: "bottom", directionType: "non-directed", routingType: "direct",
        sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [] },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  });

  it("#5 removes the containment connector when p2 is nested into p1", () => {
    // Move p2 so its centre lands inside p1.
    const d = reducer(nestIntoWorld(), { type: "MOVE_ELEMENT", payload: { id: "p2", x: 150, y: 120 } });
    expect(d.elements.find(e => e.id === "p2")?.parentId).toBe("p1");
    expect(d.connectors.filter(c => c.type === "uml-containment")).toHaveLength(0);
  });

  it("#6 adds a containment connector (child→former parent) when p2 is pulled out of p1", () => {
    // p2 starts physically nested inside p1 (parentId p1), no connector.
    const start: DiagramData = {
      elements: [
        { id: "p1", type: "uml-package", x: 0, y: 0, width: 500, height: 400, label: "P1", properties: {} },
        { id: "p2", type: "uml-package", x: 150, y: 120, width: 160, height: 120, label: "P2", properties: {}, parentId: "p1" },
      ],
      connectors: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    // Drag p2 far outside p1.
    const d = reducer(start, { type: "MOVE_ELEMENT", payload: { id: "p2", x: 900, y: 600 } });
    expect(d.elements.find(e => e.id === "p2")?.parentId).toBeUndefined();
    const cc = d.connectors.filter(c => c.type === "uml-containment");
    expect(cc).toHaveLength(1);
    expect(cc[0].sourceId).toBe("p2"); // child = source, ⊕ sits on the target (former parent)
    expect(cc[0].targetId).toBe("p1");
  });
});
