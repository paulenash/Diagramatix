/**
 * UML Package — resizeable container membership + dependency-only connection rule.
 *
 * Drives the real reducer (app/hooks/useDiagram.ts) to pin the two code-enforced
 * package rules added with the Domain-diagram palette work:
 *   1. A class dropped inside a package's bounds becomes its member (parentId).
 *   2. A package may only be an endpoint of a `uml-dependency` connector — any
 *      other UML relationship touching a package is rejected by ADD_CONNECTOR.
 */
import { describe, it, expect } from "vitest";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";

const dispatch = (s: DiagramData, a: Action) => reducer(s, a);
const at = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id);

function pkgEl(): DiagramElement {
  return {
    id: "pkg", type: "uml-package", x: 100, y: 100, width: 400, height: 300,
    label: "Package 1", properties: {},
  };
}

const base = (elements: DiagramElement[], connectors: Connector[] = []): DiagramData => ({
  elements,
  connectors,
  viewport: { x: 0, y: 0, zoom: 1 },
});

const addConnector = (type: Action extends { type: "ADD_CONNECTOR"; payload: infer P } ? P["connectorType"] : never, force = false): Action => ({
  type: "ADD_CONNECTOR",
  payload: {
    sourceId: "pkg", targetId: "cls", connectorType: type,
    directionType: "open-directed", routingType: "rectilinear",
    sourceSide: "right", targetSide: "left", force,
  },
});

describe("uml-package — container membership", () => {
  it("a class dropped inside a package's bounds becomes its member", () => {
    let d = base([pkgEl()]);
    // Drop a class at the centre of the package.
    d = dispatch(d, {
      type: "ADD_ELEMENT",
      payload: { symbolType: "uml-class", position: { x: 300, y: 250 }, id: "cls" },
    });
    expect(at(d, "cls")?.parentId).toBe("pkg");
  });

  it("a class dropped OUTSIDE the package is not adopted", () => {
    let d = base([pkgEl()]);
    d = dispatch(d, {
      type: "ADD_ELEMENT",
      payload: { symbolType: "uml-class", position: { x: 900, y: 900 }, id: "cls" },
    });
    expect(at(d, "cls")?.parentId).toBeUndefined();
  });
});

describe("uml-package — dependency-only connection rule", () => {
  const withClass = (): DiagramData => base([
    pkgEl(),
    { id: "cls", type: "uml-class", x: 600, y: 200, width: 120, height: 80, label: "Entity 1", properties: {} },
  ]);

  it("rejects a uml-association touching a package", () => {
    const d = dispatch(withClass(), addConnector("uml-association"));
    expect(d.connectors).toHaveLength(0);
  });

  it("rejects a uml-generalisation touching a package", () => {
    const d = dispatch(withClass(), addConnector("uml-generalisation"));
    expect(d.connectors).toHaveLength(0);
  });

  it("allows a uml-dependency touching a package", () => {
    const d = dispatch(withClass(), addConnector("uml-dependency"));
    expect(d.connectors).toHaveLength(1);
    expect(d.connectors[0].type).toBe("uml-dependency");
  });
});
