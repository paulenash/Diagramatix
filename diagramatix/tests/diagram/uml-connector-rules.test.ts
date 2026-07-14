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
