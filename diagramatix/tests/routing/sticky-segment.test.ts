/**
 * Sticky-segment rule (BPMN): a connector the user SHAPED (pathShaped) keeps its
 * interior waypoints across a re-route; only the endpoint stubs re-fit.
 */
import { describe, it, expect } from "vitest";
import { recomputeAllConnectors } from "@/app/lib/diagram/routing";
import type { Connector, DiagramElement } from "@/app/lib/diagram/types";

const task = (id: string, x: number, y: number): DiagramElement =>
  ({ id, type: "task", x, y, width: 100, height: 60, label: id, properties: {} });

// A shaped U-detour: src stub → down → across → up → tgt stub (10 waypoints).
const shaped = (): Connector => ({
  id: "c1", sourceId: "a", targetId: "b",
  sourceSide: "right", targetSide: "left",
  type: "sequence", directionType: "directed", routingType: "rectilinear",
  sourceInvisibleLeader: true, targetInvisibleLeader: true,
  sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5,
  pathShaped: true,
  waypoints: [
    { x: 50, y: 30 }, { x: 100, y: 30 }, { x: 130, y: 30 },      // src stub
    { x: 250, y: 30 }, { x: 250, y: 200 }, { x: 350, y: 200 }, { x: 350, y: 30 }, // interior detour (y=200 = distinctive)
    { x: 370, y: 30 }, { x: 400, y: 30 }, { x: 450, y: 30 },     // tgt stub
  ],
});

describe("sticky segment (pathShaped)", () => {
  it("T0977 — a shaped connector keeps its interior when the target element moves", () => {
    const a = task("a", 0, 0);
    const bMoved = task("b", 400, 100); // dragged DOWN 100px
    const out = recomputeAllConnectors([shaped()], [a, bMoved])[0];
    // The distinctive interior detour (y ≈ 200) survives the re-route.
    expect(out.waypoints.some((p) => Math.abs(p.y - 200) < 2), "interior detour preserved").toBe(true);
    // The end still attaches to the (moved) target's left face (re-fitted stub).
    const last = out.waypoints[out.waypoints.length - 1];
    expect(Math.abs(last.y - 130), "target-end re-fitted to the moved element's centre").toBeLessThan(2);
    expect(out.pathShaped).toBe(true);
  });

  it("T0978 — the SAME path without the flag (and < 9 waypoints) is NOT preserved", () => {
    // Below the legacy N>=9 heuristic and unflagged → a re-route recomputes it,
    // so the distinctive interior is gone (proving the flag is what preserves).
    const short: Connector = { ...shaped(), pathShaped: false,
      waypoints: [
        { x: 50, y: 30 }, { x: 100, y: 30 }, { x: 130, y: 30 },
        { x: 250, y: 200 },
        { x: 370, y: 30 }, { x: 400, y: 30 }, { x: 450, y: 30 },
      ] };
    const out = recomputeAllConnectors([short], [task("a", 0, 0), task("b", 400, 0)])[0];
    expect(out.waypoints.some((p) => Math.abs(p.y - 200) < 2)).toBe(false);
  });
});
