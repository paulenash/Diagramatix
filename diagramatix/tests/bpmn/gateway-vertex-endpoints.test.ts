/**
 * Gateway endpoints land on a VERTEX, and an arrow key moves them the way it
 * points (Paul, 2026-09-01).
 *
 *   "always connect to the exact vertex point on the gateway. Sometimes the
 *    connection originates or terminates on a point near the vertex not
 *    actually on the vertex. Note: nudging should still be used to separate
 *    them if the user wants to. Check that the arrow keys nudge the selected
 *    endpoint in a direction implied by the arrow keys."
 *
 * A side of a diamond spans two edges meeting at its cardinal vertex, so offset
 * 0.5 IS that vertex and anything else is a point on a slope. Every assertion
 * below is made against the RENDERED point from `sidePoint`, not against the
 * offset — the offset is the thing that was wrong to reason about.
 */
import { describe, it, expect } from "vitest";
import { sidePoint, gatewayVertex, nudgeGatewayEndpoint } from "@/app/lib/diagram/routing";
import type { DiagramElement, Side } from "@/app/lib/diagram/types";

const gw = { id: "g", type: "gateway", x: 100, y: 200, width: 50, height: 50 } as DiagramElement;
const SIDES: Side[] = ["top", "right", "bottom", "left"];
const VERTS = {
  top:    { x: 125, y: 200 },
  right:  { x: 150, y: 225 },
  bottom: { x: 125, y: 250 },
  left:   { x: 100, y: 225 },
};
const isVertex = (p: { x: number; y: number }) =>
  Object.values(VERTS).some((v) => Math.abs(v.x - p.x) < 0.001 && Math.abs(v.y - p.y) < 0.001);

describe("a gateway endpoint attaches to a vertex (R6.30)", () => {
  it("T3110 — any offset a mouse can produce resolves to an exact vertex", () => {
    for (const side of SIDES) {
      for (let o = 0; o <= 1.0001; o += 0.05) {
        const v = gatewayVertex(side, o);
        expect(v.offset).toBe(0.5);
        const p = sidePoint(gw, v.side, v.offset);
        expect(isVertex(p), `${side}@${o.toFixed(2)} -> ${v.side} gave (${p.x}, ${p.y})`).toBe(true);
      }
    }
  });

  it("T3111 — it picks the NEAREST vertex, not simply this side's own", () => {
    // The bug was a 3px snap radius on a 50px diamond: unhittable, so a drop
    // near the top vertex but nominally on the "right" side kept its raw
    // offset and attached part-way down the top-right slope.
    expect(gatewayVertex("right", 0.05)).toEqual({ side: "top", offset: 0.5 });
    expect(gatewayVertex("right", 0.95)).toEqual({ side: "bottom", offset: 0.5 });
    expect(gatewayVertex("top", 0.1)).toEqual({ side: "left", offset: 0.5 });
    expect(gatewayVertex("top", 0.9)).toEqual({ side: "right", offset: 0.5 });
    expect(gatewayVertex("bottom", 0.5)).toEqual({ side: "bottom", offset: 0.5 });
  });

  it("T3112 — a mid-edge offset is NOT silently kept (the negative control)", () => {
    // If gatewayVertex ever became a pass-through, every other assertion here
    // would still hold. This one would not.
    const p = sidePoint(gw, "top", 0.3);
    expect(isVertex(p), "0.3 along the top must be off-vertex to begin with").toBe(false);
  });
});

describe("an arrow key nudges a gateway endpoint the way it points", () => {
  const ARROWS = [
    { key: "ArrowLeft",  dx: -5, dy: 0, axis: "x" as const, sign: -1 },
    { key: "ArrowRight", dx: 5,  dy: 0, axis: "x" as const, sign: 1 },
    { key: "ArrowUp",    dx: 0,  dy: -5, axis: "y" as const, sign: -1 },
    { key: "ArrowDown",  dx: 0,  dy: 5,  axis: "y" as const, sign: 1 },
  ];

  it("T3113 — from every vertex, every arrow that moves the point moves it the right way", () => {
    for (const side of SIDES) {
      for (const a of ARROWS) {
        const before = sidePoint(gw, side, 0.5);
        const n = nudgeGatewayEndpoint(side, 0.5, a.dx, a.dy);
        const after = sidePoint(gw, n.side, n.offset);
        const moved = Math.hypot(after.x - before.x, after.y - before.y);
        if (moved < 0.001) continue;   // no travel along the boundary that way
        const delta = a.axis === "x" ? after.x - before.x : after.y - before.y;
        expect(Math.sign(delta),
          `${a.key} at the ${side} vertex moved ${a.axis} by ${delta.toFixed(1)}`).toBe(a.sign);
      }
    }
  });

  it("T3114 — the same holds part-way along an edge, on all four sides", () => {
    for (const side of SIDES) {
      for (const o of [0.3, 0.7]) {
        for (const a of ARROWS) {
          const before = sidePoint(gw, side, o);
          const n = nudgeGatewayEndpoint(side, o, a.dx, a.dy);
          const after = sidePoint(gw, n.side, n.offset);
          const moved = Math.hypot(after.x - before.x, after.y - before.y);
          if (moved < 0.001) continue;
          const delta = a.axis === "x" ? after.x - before.x : after.y - before.y;
          expect(Math.sign(delta),
            `${a.key} at ${side}@${o} moved ${a.axis} by ${delta.toFixed(1)}`).toBe(a.sign);
        }
      }
    }
  });

  it("T3115 — an endpoint can LEAVE a vertex, and can arrive at the next one", () => {
    // Both halves of the old snap bug: re-snapping on arrival is what lets a
    // nudge walk the boundary; re-snapping on departure is what trapped it.
    let side: Side = "right", offset = 0.5;
    const first = nudgeGatewayEndpoint(side, offset, 0, -5);
    expect(sidePoint(gw, first.side, first.offset).y).toBeLessThan(225);
    ({ side, offset } = first);
    for (let i = 0; i < 40 && !(side === "top" && offset === 0.5); i++) {
      ({ side, offset } = nudgeGatewayEndpoint(side, offset, 0, -5));
    }
    expect({ side, offset }).toEqual({ side: "top", offset: 0.5 });
  });
});
