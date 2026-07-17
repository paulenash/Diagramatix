/**
 * D5.01 / D5.02 — Domain connector routing.
 * Connectors that share an element SIDE are spread into N+1 sections (offsets
 * 1/(N+1) … N/(N+1)) so none coincide, and ordered by the opposite endpoint so
 * siblings on a side don't cross. A lone connector re-centres at 0.5.
 */
import { describe, it, expect } from "vitest";
import { spreadUmlEndpoints } from "@/app/lib/diagram/routing";
import type { Connector, DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, x: number, y: number): DiagramElement =>
  ({ id, type: "uml-class", x, y, width: 120, height: 60, label: id, properties: {} } as DiagramElement);

const conn = (id: string, sourceId: string, targetId: string, sourceSide: string, targetSide: string): Connector =>
  ({
    id, sourceId, targetId,
    sourceSide, targetSide,
    type: "uml-association", directionType: "non-directed", routingType: "rectilinear",
    sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [],
  } as unknown as Connector);

describe("D5.01/D5.02 — domain connector endpoint spread", () => {
  it("two connectors sharing a side split it into 3 sections (1/3, 2/3)", () => {
    const A = el("A", 0, 0), B = el("B", 400, 0);
    const c1 = conn("c1", "A", "B", "right", "left");
    const c2 = conn("c2", "A", "B", "right", "left");
    const out = spreadUmlEndpoints([c1, c2], [A, B]);
    const offs = out.map(c => c.sourceOffsetAlong).sort((a, b) => (a! - b!));
    expect(offs).toEqual([1 / 3, 2 / 3]);
    // Targets on B.left are likewise split.
    const toffs = out.map(c => c.targetOffsetAlong).sort((a, b) => (a! - b!));
    expect(toffs).toEqual([1 / 3, 2 / 3]);
    // No two source endpoints coincide.
    expect(out[0].sourceOffsetAlong).not.toBe(out[1].sourceOffsetAlong);
  });

  it("three connectors sharing a side split it into 4 sections", () => {
    const A = el("A", 0, 0), B = el("B", 400, 0);
    const out = spreadUmlEndpoints(
      [conn("c1", "A", "B", "right", "left"), conn("c2", "A", "B", "right", "left"), conn("c3", "A", "B", "right", "left")],
      [A, B],
    );
    const offs = out.map(c => c.sourceOffsetAlong).sort((a, b) => (a! - b!));
    expect(offs).toEqual([1 / 4, 2 / 4, 3 / 4]);
  });

  it("orders endpoints by the opposite element so siblings don't cross", () => {
    // A.right connects to B (above) and C (below). On the right side, offset 0 =
    // top, 1 = bottom → the connector to the HIGHER target must get the smaller
    // offset so the two lines don't cross.
    const A = el("A", 0, 100);
    const B = el("B", 400, 0);   // above
    const C = el("C", 400, 300); // below
    const cB = conn("cB", "A", "B", "right", "left");
    const cC = conn("cC", "A", "C", "right", "left");
    const out = spreadUmlEndpoints([cB, cC], [A, B, C]);
    const offB = out.find(c => c.id === "cB")!.sourceOffsetAlong!;
    const offC = out.find(c => c.id === "cC")!.sourceOffsetAlong!;
    expect(offB).toBeLessThan(offC); // higher target → higher (smaller-offset) attachment
  });

  it("a lone connector on a side re-centres at 0.5", () => {
    const A = el("A", 0, 0), B = el("B", 400, 0);
    const out = spreadUmlEndpoints([conn("c1", "A", "B", "right", "left")], [A, B]);
    expect(out[0].sourceOffsetAlong).toBe(0.5);
    expect(out[0].targetOffsetAlong).toBe(0.5);
  });

  it("leaves non-UML connectors untouched", () => {
    const A = el("A", 0, 0), B = el("B", 400, 0);
    const seq = { ...conn("s1", "A", "B", "right", "left"), type: "sequence" } as unknown as Connector;
    const seq2 = { ...conn("s2", "A", "B", "right", "left"), type: "sequence" } as unknown as Connector;
    const out = spreadUmlEndpoints([seq, seq2], [A, B]);
    expect(out[0].sourceOffsetAlong).toBeUndefined();
    expect(out[1].sourceOffsetAlong).toBeUndefined();
  });
});
