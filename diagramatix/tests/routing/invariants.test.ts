/**
 * Orthogonal router invariants — direct over computeWaypoints.
 *
 * The editor net (tests/editor) exercises RE-routing through the reducer; this
 * file pins the router itself: computeWaypoints(source, target, all, srcSide,
 * tgtSide, "rectilinear") fed a spread of relative element placements (target
 * to the E/W/N/S/diagonals of the source, near + far). For every route:
 *   • the path is orthogonal — every segment is axis-aligned (no diagonals);
 *   • the visible endpoints attach to the source/target element EDGES;
 *   • the path does not pass through the body of the source or target.
 *
 * Obstacle avoidance through a THIRD element is the known-hard gap: a separate
 * ratcheted sweep places an obstacle on the straight line between the endpoints
 * and counts how many routes still cross it. The count must not exceed the
 * documented baseline (it is currently 0 for the single-connector router, which
 * detours; the ratchet guards against regression).
 */
import { describe, it, expect } from "vitest";
import { computeWaypoints } from "@/app/lib/diagram/routing";
import type { DiagramElement, Point, Side } from "@/app/lib/diagram/types";

// Obstacle crossings the single-connector router produces today. GOAL: stays 0.
const KNOWN_CROSSING_BASELINE = 0;

const EPS = 1.0;        // diagonal tolerance
const ATTACH_TOL = 2.0; // endpoint-on-edge tolerance
const BODY_MARGIN = 3;  // a segment must penetrate this far to count as "through"

const mk = (id: string, x: number, y: number, w = 80, h = 50): DiagramElement =>
  ({ id, type: "task", x, y, width: w, height: h, label: id, properties: {} });

type Box = { x: number; y: number; w: number; h: number };
const box = (e: DiagramElement): Box => ({ x: e.x, y: e.y, w: e.width, h: e.height });

/** A point lies on (within tol of) the boundary of a box. */
const onEdge = (p: Point, b: Box, tol: number) => {
  const inX = p.x >= b.x - tol && p.x <= b.x + b.w + tol;
  const inY = p.y >= b.y - tol && p.y <= b.y + b.h + tol;
  const nearV = Math.abs(p.x - b.x) <= tol || Math.abs(p.x - (b.x + b.w)) <= tol;
  const nearH = Math.abs(p.y - b.y) <= tol || Math.abs(p.y - (b.y + b.h)) <= tol;
  return (inX && inY) && (nearV || nearH);
};

/** Does an axis-aligned segment pass through the interior (minus margin) of a box? */
function segCrossesBox(p: Point, q: Point, b: Box, m: number): boolean {
  const x0 = b.x + m, x1 = b.x + b.w - m, y0 = b.y + m, y1 = b.y + b.h - m;
  if (x1 <= x0 || y1 <= y0) return false;
  if (Math.abs(p.x - q.x) < 0.5) {
    const x = p.x, a = Math.min(p.y, q.y), b2 = Math.max(p.y, q.y);
    return x > x0 && x < x1 && b2 > y0 && a < y1;
  }
  if (Math.abs(p.y - q.y) < 0.5) {
    const y = p.y, a = Math.min(p.x, q.x), b2 = Math.max(p.x, q.x);
    return y > y0 && y < y1 && b2 > x0 && a < x1;
  }
  return false;
}

/** Pick a sensible side pair from the relative placement of target vs source. */
function sidesFor(src: DiagramElement, tgt: DiagramElement): [Side, Side] {
  const dx = (tgt.x + tgt.width / 2) - (src.x + src.width / 2);
  const dy = (tgt.y + tgt.height / 2) - (src.y + src.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? ["right", "left"] : ["left", "right"];
  }
  return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
}

/** Route a single connector and return its waypoints + the visible sub-path
 *  (with invisible leader segments trimmed, as the renderer does). */
function route(src: DiagramElement, tgt: DiagramElement, all: DiagramElement[]) {
  const [ss, ts] = sidesFor(src, tgt);
  const r = computeWaypoints(src, tgt, all, ss, ts, "rectilinear");
  const wps = r.waypoints;
  const start = r.sourceInvisibleLeader ? 1 : 0;
  const end = r.targetInvisibleLeader ? wps.length - 2 : wps.length - 1;
  return { wps, visible: wps.slice(start, end + 1) };
}

// A spread of relative placements: 8 compass directions × near/far.
const OFFSETS: { dx: number; dy: number }[] = [];
for (const d of [200, 480]) {
  OFFSETS.push({ dx: d, dy: 0 }, { dx: -d, dy: 0 }, { dx: 0, dy: d }, { dx: 0, dy: -d });
  OFFSETS.push({ dx: d, dy: d }, { dx: -d, dy: d }, { dx: d, dy: -d }, { dx: -d, dy: -d });
}

describe("orthogonal router — single-connector invariants", () => {
  it("every route is orthogonal (no diagonal segments)", () => {
    const src = mk("s", 500, 500);
    const bad: string[] = [];
    for (const { dx, dy } of OFFSETS) {
      const tgt = mk("t", src.x + dx, src.y + dy);
      const { visible } = route(src, tgt, [src, tgt]);
      for (let i = 1; i < visible.length; i++) {
        const p = visible[i - 1], q = visible[i];
        if (Math.abs(p.x - q.x) > EPS && Math.abs(p.y - q.y) > EPS) {
          bad.push(`(${dx},${dy}) diagonal (${Math.round(p.x)},${Math.round(p.y)})→(${Math.round(q.x)},${Math.round(q.y)})`);
        }
      }
    }
    expect(bad, `\n  - ${bad.join("\n  - ")}`).toEqual([]);
  });

  it("visible endpoints attach to the source + target element edges", () => {
    const src = mk("s", 500, 500);
    const bad: string[] = [];
    for (const { dx, dy } of OFFSETS) {
      const tgt = mk("t", src.x + dx, src.y + dy);
      const { visible } = route(src, tgt, [src, tgt]);
      const first = visible[0], last = visible[visible.length - 1];
      if (!onEdge(first, box(src), ATTACH_TOL)) bad.push(`(${dx},${dy}) source endpoint off-edge (${Math.round(first.x)},${Math.round(first.y)})`);
      if (!onEdge(last, box(tgt), ATTACH_TOL)) bad.push(`(${dx},${dy}) target endpoint off-edge (${Math.round(last.x)},${Math.round(last.y)})`);
    }
    expect(bad, `\n  - ${bad.join("\n  - ")}`).toEqual([]);
  });

  it("a route never passes through its own source or target body", () => {
    const src = mk("s", 500, 500);
    const bad: string[] = [];
    for (const { dx, dy } of OFFSETS) {
      const tgt = mk("t", src.x + dx, src.y + dy);
      const { visible } = route(src, tgt, [src, tgt]);
      for (let i = 1; i < visible.length; i++) {
        const p = visible[i - 1], q = visible[i];
        if (segCrossesBox(p, q, box(src), BODY_MARGIN)) bad.push(`(${dx},${dy}) crosses its own source`);
        if (segCrossesBox(p, q, box(tgt), BODY_MARGIN)) bad.push(`(${dx},${dy}) crosses its own target`);
      }
    }
    expect([...new Set(bad)], `\n  - ${[...new Set(bad)].join("\n  - ")}`).toEqual([]);
  });

  it("curvilinear + direct routings also stay attached at both ends", () => {
    const src = mk("s", 500, 500);
    for (const rt of ["curvilinear", "direct"] as const) {
      for (const { dx, dy } of OFFSETS) {
        const tgt = mk("t", src.x + dx, src.y + dy);
        const [ss, ts] = sidesFor(src, tgt);
        const r = computeWaypoints(src, tgt, [src, tgt], ss, ts, rt);
        const wps = r.waypoints;
        const start = r.sourceInvisibleLeader ? 1 : 0;
        const end = r.targetInvisibleLeader ? wps.length - 2 : wps.length - 1;
        const vis = wps.slice(start, end + 1);
        expect(vis.length).toBeGreaterThanOrEqual(2);
        expect(onEdge(vis[0], box(src), ATTACH_TOL + 1), `${rt} (${dx},${dy}) source`).toBe(true);
        expect(onEdge(vis[vis.length - 1], box(tgt), ATTACH_TOL + 1), `${rt} (${dx},${dy}) target`).toBe(true);
      }
    }
  });
});

describe("orthogonal router — obstacle-avoidance ratchet", () => {
  it(`obstacle on the straight line is detoured (crossings ≤ ${KNOWN_CROSSING_BASELINE})`, () => {
    let crossings = 0;
    const src = mk("s", 500, 500);
    // Place the target to the E/W/N/S (far), drop an obstacle squarely on the
    // straight line between the two, and re-route.
    const dirs: { dx: number; dy: number }[] = [
      { dx: 520, dy: 0 }, { dx: -520, dy: 0 }, { dx: 0, dy: 460 }, { dx: 0, dy: -460 },
    ];
    for (const { dx, dy } of dirs) {
      const tgt = mk("t", src.x + dx, src.y + dy);
      // Obstacle centred on the midpoint of the source/target centres.
      const midX = (src.x + src.width / 2 + tgt.x + tgt.width / 2) / 2 - 50;
      const midY = (src.y + src.height / 2 + tgt.y + tgt.height / 2) / 2 - 50;
      const obst = mk("o", midX, midY, 100, 100);
      const all = [src, tgt, obst];
      const { visible } = route(src, tgt, all);
      for (let i = 1; i < visible.length; i++) {
        if (segCrossesBox(visible[i - 1], visible[i], box(obst), BODY_MARGIN)) { crossings++; break; }
      }
    }
    expect(crossings, "single-connector router crossed a known obstacle — regression").toBeLessThanOrEqual(KNOWN_CROSSING_BASELINE);
  });
});
