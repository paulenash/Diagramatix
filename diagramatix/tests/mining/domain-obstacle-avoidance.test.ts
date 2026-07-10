/**
 * Domain-Diagram obstacle avoidance (T0697): a freshly-generated object model
 * must not route an association straight across an unrelated entity box — the
 * editor flags such a crossing red. `avoidObstaclesPostLayout` detours the
 * offending association around the box, keeping its invisible centre leaders so
 * the arrowhead still lands on the element edge. The crossing test here mirrors
 * Canvas's `segCrossesRect` (zero-margin rect interior), so "no crossings after"
 * is exactly "no red flag in the editor".
 */
import { describe, it, expect } from "vitest";
import { avoidObstaclesPostLayout } from "@/app/lib/diagram/routing";
import type { DiagramData, DiagramElement, Point } from "@/app/lib/diagram/types";

// Mirror of Canvas.segCrossesRect for axis-aligned segments (the only kind our
// rectilinear associations produce), zero margin = the literal rect interior.
function segCrossesRect(p1: Point, p2: Point, r: { x: number; y: number; w: number; h: number }): boolean {
  const left = r.x, right = r.x + r.w, top = r.y, bottom = r.y + r.h;
  if (Math.abs(p1.y - p2.y) < 1) {
    if (p1.y <= top || p1.y >= bottom) return false;
    return Math.max(p1.x, p2.x) > left && Math.min(p1.x, p2.x) < right;
  }
  if (Math.abs(p1.x - p2.x) < 1) {
    if (p1.x <= left || p1.x >= right) return false;
    return Math.max(p1.y, p2.y) > top && Math.min(p1.y, p2.y) < bottom;
  }
  return false;
}

const box = (id: string, x: number): DiagramElement =>
  ({ id, type: "uml-class", label: id, x, y: 0, width: 80, height: 60 } as DiagramElement);

// The visible slice = drop the invisible centre leaders at each end (what Canvas
// trims before its red-crossing test).
function visibleOf(c: DiagramData["connectors"][number]): Point[] {
  const w = c.waypoints;
  const s = c.sourceInvisibleLeader ? 1 : 0;
  const e = c.targetInvisibleLeader ? w.length - 2 : w.length - 1;
  return w.slice(s, e + 1);
}
function crossesAny(path: Point[], boxes: DiagramElement[], skip: Set<string>): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    for (const b of boxes) {
      if (skip.has(b.id)) continue;
      if (segCrossesRect(path[i], path[i + 1], { x: b.x, y: b.y, w: b.width, h: b.height })) return true;
    }
  }
  return false;
}

describe("domain obstacle avoidance (T0697)", () => {
  it("reroutes an association that the layout drew straight across a middle entity", () => {
    // A —— C with B squarely in the channel between them at the same y.
    const elements = [box("A", 0), box("B", 200), box("C", 400)];
    // Straight horizontal route A→C at y=30, through B's interior.
    const data: DiagramData = {
      elements,
      connectors: [{
        id: "a-c", sourceId: "A", targetId: "C",
        sourceSide: "right", targetSide: "left", type: "uml-association",
        directionType: "non-directed", routingType: "rectilinear",
        sourceInvisibleLeader: true, targetInvisibleLeader: true,
        waypoints: [
          { x: 40, y: 30 },   // A centre (leader)
          { x: 80, y: 30 },   // A edge
          { x: 400, y: 30 },  // C edge
          { x: 440, y: 30 },  // C centre (leader)
        ],
      }],
      viewport: { x: 0, y: 0, zoom: 1 },
    } as unknown as DiagramData;

    const conn = data.connectors[0];
    const endpoints = new Set(["A", "C"]);
    // Precondition: as laid out, it DOES cross B (would be flagged red).
    expect(crossesAny(visibleOf(conn), elements, endpoints)).toBe(true);

    avoidObstaclesPostLayout(data);

    // Postcondition: the rerouted association clears B entirely...
    expect(crossesAny(visibleOf(conn), elements, endpoints)).toBe(false);
    // ...still starts/ends on the same edge points (arrowhead unmoved)...
    const vis = visibleOf(conn);
    expect(vis[0]).toEqual({ x: 80, y: 30 });
    expect(vis[vis.length - 1]).toEqual({ x: 400, y: 30 });
    // ...and kept its centre leaders (first/last waypoint unchanged).
    expect(conn.waypoints[0]).toEqual({ x: 40, y: 30 });
    expect(conn.waypoints[conn.waypoints.length - 1]).toEqual({ x: 440, y: 30 });
  });

  it("leaves an already-clear association untouched", () => {
    const elements = [box("A", 0), box("C", 400)];
    const clear = [
      { x: 40, y: 30 }, { x: 80, y: 30 }, { x: 400, y: 30 }, { x: 440, y: 30 },
    ];
    const data: DiagramData = {
      elements,
      connectors: [{
        id: "a-c", sourceId: "A", targetId: "C",
        sourceSide: "right", targetSide: "left", type: "uml-association",
        directionType: "non-directed", routingType: "rectilinear",
        sourceInvisibleLeader: true, targetInvisibleLeader: true,
        waypoints: clear.map((p) => ({ ...p })),
      }],
      viewport: { x: 0, y: 0, zoom: 1 },
    } as unknown as DiagramData;

    avoidObstaclesPostLayout(data);
    expect(data.connectors[0].waypoints).toEqual(clear);
  });
});
