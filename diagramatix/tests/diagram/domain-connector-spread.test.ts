/**
 * D4.04 / D4.05 — Domain connector routing.
 * Connectors that share an element SIDE are spread into N+1 sections (offsets
 * 1/(N+1) … N/(N+1)) so none coincide, and ordered by the opposite endpoint so
 * siblings on a side don't cross. A lone connector re-centres at 0.5.
 */
import { describe, it, expect } from "vitest";
import { spreadUmlEndpoints, deconflictUmlSegments } from "@/app/lib/diagram/routing";
import { layoutGenericDiagram } from "@/app/lib/diagram/genericLayout";
import type { Connector, DiagramElement, Point } from "@/app/lib/diagram/types";

const el = (id: string, x: number, y: number): DiagramElement =>
  ({ id, type: "uml-class", x, y, width: 120, height: 60, label: id, properties: {} } as DiagramElement);

const conn = (id: string, sourceId: string, targetId: string, sourceSide: string, targetSide: string): Connector =>
  ({
    id, sourceId, targetId,
    sourceSide, targetSide,
    type: "uml-association", directionType: "non-directed", routingType: "rectilinear",
    sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [],
  } as unknown as Connector);

describe("D4.04/D4.05 — domain connector endpoint spread", () => {
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

  // Realistic path: [srcCentre, srcEdge, corner, trunkA, trunkB(=corner), tgtEdge,
  // tgtCentre] — the first/last segment is an invisible leader.
  const withLeaders = (id: string, pts: [number, number][]): Connector => ({
    ...conn(id, "A", "B", "bottom", "top"),
    sourceInvisibleLeader: true, targetInvisibleLeader: true,
    waypoints: pts.map(([x, y]) => ({ x, y })),
  } as unknown as Connector);

  const trunkY = (c: Connector) => {
    let best = { y: NaN, len: -1 };
    for (let i = 0; i < c.waypoints.length - 1; i++) {
      const p = c.waypoints[i], q = c.waypoints[i + 1];
      if (Math.abs(p.y - q.y) < 0.5) { const len = Math.abs(q.x - p.x); if (len > best.len) best = { y: p.y, len }; }
    }
    return best.y;
  };

  it("de-conflicts overlapping trunks WITHOUT moving the endpoints/edge points (D4.05)", () => {
    // Both trunks sit at y=120 and overlap in x → must be pulled apart.
    const c1 = withLeaders("c1", [[100, 20], [100, 50], [100, 120], [300, 120], [300, 180], [300, 210]]);
    const c2 = withLeaders("c2", [[150, 20], [150, 50], [150, 120], [400, 120], [400, 180], [400, 210]]);
    const out = deconflictUmlSegments([c1, c2]);
    // Trunks are now on distinct lines.
    expect(trunkY(out[0])).not.toBe(trunkY(out[1]));
    expect(Math.abs(trunkY(out[0]) - trunkY(out[1]))).toBeGreaterThanOrEqual(10);
    // Centre endpoints (leaders) and edge-attachment points are UNCHANGED — the
    // connector still reaches its elements.
    for (const [ci, o] of [c1, c2].entries()) {
      const before = o.waypoints, after = out[ci].waypoints;
      expect(after[0]).toEqual(before[0]);                 // src centre
      expect(after[1]).toEqual(before[1]);                 // src edge
      expect(after[after.length - 1]).toEqual(before[before.length - 1]); // tgt centre
      expect(after[after.length - 2]).toEqual(before[before.length - 2]); // tgt edge
    }
  });

  it("leaves a single connector's waypoints unchanged", () => {
    const c1 = withLeaders("c1", [[100, 20], [100, 50], [100, 120], [300, 120], [300, 180], [300, 210]]);
    const out = deconflictUmlSegments([c1]);
    expect(out[0].waypoints).toEqual(c1.waypoints);
  });

  it("every GENERATED connector stays attached to its source AND target element", () => {
    // The Composite-pattern shape: 3 classes, and TWO connectors between
    // Component↔Composite (a generalisation + an aggregation) — the case where
    // de-confliction previously detached the line from the element.
    const parsed = {
      elements: [
        { id: "comp", type: "uml-class", label: "Component" },
        { id: "leaf", type: "uml-class", label: "Leaf" },
        { id: "composite", type: "uml-class", label: "Composite" },
      ],
      connections: [
        { sourceId: "leaf", targetId: "comp", type: "uml-generalisation" },
        { sourceId: "composite", targetId: "comp", type: "uml-generalisation" },
        { sourceId: "comp", targetId: "composite", type: "uml-aggregation" },
      ],
    };
    const data = layoutGenericDiagram(parsed as never, "domain");
    const byId = new Map(data.elements.map(e => [e.id, e]));
    const onBoundary = (p: Point, el: DiagramElement, tol = 2) => {
      const inX = p.x >= el.x - tol && p.x <= el.x + el.width + tol;
      const inY = p.y >= el.y - tol && p.y <= el.y + el.height + tol;
      const onLR = (Math.abs(p.x - el.x) <= tol || Math.abs(p.x - (el.x + el.width)) <= tol) && inY;
      const onTB = (Math.abs(p.y - el.y) <= tol || Math.abs(p.y - (el.y + el.height)) <= tol) && inX;
      return onLR || onTB;
    };
    for (const c of data.connectors) {
      if (c.type === "uml-note-anchor") continue;
      const s = byId.get(c.sourceId)!, t = byId.get(c.targetId)!;
      expect(c.waypoints.some(p => onBoundary(p, s)), `${c.type} ${c.sourceId}→${c.targetId}: SOURCE end detached`).toBe(true);
      expect(c.waypoints.some(p => onBoundary(p, t)), `${c.type} ${c.sourceId}→${c.targetId}: TARGET end detached`).toBe(true);
    }
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
