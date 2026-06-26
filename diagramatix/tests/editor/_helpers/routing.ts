/**
 * Routing invariants for the manual-editor characterisation net.
 *
 * findRoutingViolations(data) asserts what a re-routed diagram must always
 * satisfy, no matter how it was edited:
 *   1. every connector has a drawable path (>= 2 waypoints);
 *   2. orthogonal connectors have no diagonal segments;
 *   3. each endpoint actually attaches to its element (catches detachment /
 *      stale-leader bugs after a move);
 *   4. no connector segment crosses THROUGH a non-endpoint flow node — the
 *      obstacle-avoidance invariant. Running this over a matrix isolates the
 *      existing obstacle-avoidance gaps as concrete failing cases.
 */
import type { DiagramData, DiagramElement, Connector, Point } from "@/app/lib/diagram/types";

const FLOW_NODES = new Set([
  "task", "subprocess", "subprocess-expanded", "start-event", "end-event",
  "intermediate-event", "gateway", "data-object", "data-store",
]);
const ORTHOGONAL = new Set(["sequence", "flowline", "messageBPMN"]);

const EPS = 1.0;          // diagonal tolerance
const ATTACH_TOL = 6;     // how far an endpoint may sit from its element box
const OBST_MARGIN = 3;    // a segment must penetrate this far inside a node to count

type Box = { x: number; y: number; w: number; h: number };
const box = (e: DiagramElement): Box => ({ x: e.x, y: e.y, w: e.width, h: e.height });
const withinBox = (p: Point, b: Box, tol: number) =>
  p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol;

/** Does an axis-aligned segment pass through the interior (minus margin) of a box? */
function segCrossesBox(p: Point, q: Point, b: Box, m: number): boolean {
  const x0 = b.x + m, x1 = b.x + b.w - m, y0 = b.y + m, y1 = b.y + b.h - m;
  if (x1 <= x0 || y1 <= y0) return false;
  if (Math.abs(p.x - q.x) < 0.5) { // vertical at x = p.x
    const x = p.x, a = Math.min(p.y, q.y), b2 = Math.max(p.y, q.y);
    return x > x0 && x < x1 && b2 > y0 && a < y1;
  }
  if (Math.abs(p.y - q.y) < 0.5) { // horizontal at y = p.y
    const y = p.y, a = Math.min(p.x, q.x), b2 = Math.max(p.x, q.x);
    return y > y0 && y < y1 && b2 > x0 && a < x1;
  }
  return false; // diagonals reported separately by the orthogonality check
}

export function findRoutingViolations(data: DiagramData): string[] {
  const v: string[] = [];
  const byId = new Map(data.elements.map((e) => [e.id, e]));

  for (const c of data.connectors) {
    const wps = c.waypoints ?? [];
    if (wps.length < 2) { v.push(`connector ${c.id} (${c.type}) has < 2 waypoints`); continue; }

    // 2 — orthogonality
    if (ORTHOGONAL.has(c.type)) {
      for (let i = 1; i < wps.length; i++) {
        const p = wps[i - 1], q = wps[i];
        if (Math.abs(p.x - q.x) > EPS && Math.abs(p.y - q.y) > EPS) {
          v.push(`connector ${c.id} has a diagonal segment (${Math.round(p.x)},${Math.round(p.y)})→(${Math.round(q.x)},${Math.round(q.y)})`);
        }
      }
    }

    // 3 — endpoint attachment
    const src = byId.get(c.sourceId), tgt = byId.get(c.targetId);
    if (src && !withinBox(wps[0], box(src), ATTACH_TOL)) {
      v.push(`connector ${c.id} source endpoint detached from ${src.type} ${src.id}`);
    }
    if (tgt && !withinBox(wps[wps.length - 1], box(tgt), ATTACH_TOL)) {
      v.push(`connector ${c.id} target endpoint detached from ${tgt.type} ${tgt.id}`);
    }

    // 4 — obstacle crossing (skip the connector's own endpoints + containers)
    for (let i = 1; i < wps.length; i++) {
      const p = wps[i - 1], q = wps[i];
      for (const e of data.elements) {
        if (e.id === c.sourceId || e.id === c.targetId) continue;
        if (!FLOW_NODES.has(e.type)) continue;
        if (segCrossesBox(p, q, box(e), OBST_MARGIN)) v.push(`connector ${c.id} crosses ${e.type} ${e.id}`);
      }
    }
  }
  return [...new Set(v)];
}
