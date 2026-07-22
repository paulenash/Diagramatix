/**
 * Auto-repair: fuseCollinearWaypoints drops a shared waypoint when a segment move
 * makes it collinear (parallel / almost-parallel) with its neighbour, merging the
 * two segments into one.
 */
import { describe, it, expect } from "vitest";
import { fuseCollinearWaypoints } from "@/app/lib/diagram/routing";

describe("fuseCollinearWaypoints (auto-repair)", () => {
  it("T0980 — fuses collinear segments, keeping genuine corners + endpoints", () => {
    const wp = [
      { x: 0, y: 30 }, { x: 20, y: 30 },                                  // src center + edge
      { x: 100, y: 30 }, { x: 200, y: 30 }, { x: 300, y: 30 },            // 100,200 redundant on the y=30 run
      { x: 300, y: 100 },                                                 // real corner (turns down)
      { x: 380, y: 100 }, { x: 400, y: 100 },                            // tgt edge + center
    ];
    const out = fuseCollinearWaypoints(wp);
    expect(out.some((p) => p.x === 100 && p.y === 30)).toBe(false); // fused away
    expect(out.some((p) => p.x === 200 && p.y === 30)).toBe(false); // fused away
    expect(out.some((p) => p.x === 300 && p.y === 30)).toBe(true);  // corner kept
    expect(out.some((p) => p.x === 300 && p.y === 100)).toBe(true); // corner kept
    expect(out[0]).toEqual({ x: 0, y: 30 });                        // endpoints untouched
    expect(out[out.length - 1]).toEqual({ x: 400, y: 100 });
  });

  it("T0981 — fuses ALMOST-parallel segments within tolerance", () => {
    const wp = [
      { x: 0, y: 30 }, { x: 20, y: 30 },
      { x: 150, y: 33 },   // 3 px off the y=30 run → within tol → fused
      { x: 300, y: 30 },
      { x: 300, y: 100 }, { x: 380, y: 100 }, { x: 400, y: 100 },
    ];
    const out = fuseCollinearWaypoints(wp);
    expect(out.some((p) => p.x === 150)).toBe(false); // near-collinear point fused away
  });

  it("T0982 — leaves a genuine zig-zag (perpendicular corners) intact", () => {
    const wp = [
      { x: 0, y: 30 }, { x: 20, y: 30 },
      { x: 100, y: 30 }, { x: 100, y: 100 }, { x: 200, y: 100 },  // right, down, right — all real corners
      { x: 280, y: 100 }, { x: 300, y: 100 },
    ];
    const out = fuseCollinearWaypoints(wp);
    expect(out.some((p) => p.x === 100 && p.y === 30)).toBe(true);
    expect(out.some((p) => p.x === 100 && p.y === 100)).toBe(true);
  });
});
