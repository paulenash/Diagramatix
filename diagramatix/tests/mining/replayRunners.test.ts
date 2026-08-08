/**
 * Log-replay runner builder — one polyline per sampled variant through the
 * discovered model's element centres + linear interpolation along it.
 */
import { describe, it, expect } from "vitest";
import { buildRunners, pointAt } from "@/app/lib/mining/replayRunners";
import type { Variant } from "@/app/lib/mining/types";
import type { DiagramData } from "@/app/lib/diagram/types";

const V = (events: string[], count: number): Variant => ({ states: events, events, count });
const el = (id: string, type: string, label: string, x: number): DiagramData["elements"][number] =>
  ({ id, type, label, x, y: 0, width: 40, height: 40, properties: {} } as DiagramData["elements"][number]);

// (S@0) A@100 B@200 (E@300) — centres at x+20
const DATA: DiagramData = {
  elements: [el("s", "start-event", "", 0), el("a", "task", "A", 100), el("b", "task", "B", 200), el("e", "end-event", "", 300)],
  connectors: [],
} as DiagramData;

describe("replay runners", () => {
  it("T2232 — buildRunners walks start → activities → end centres", () => {
    const runners = buildRunners(DATA, [V(["A", "B"], 5)]);
    expect(runners).toHaveLength(1);
    // S(20), A(120), B(220), E(320)
    expect(runners[0].points.map((p) => p.x)).toEqual([20, 120, 220, 320]);
    expect(runners[0].weight).toBe(5);
  });

  it("T2233 — pointAt interpolates linearly along the polyline", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(pointAt(pts, 0).x).toBe(0);
    expect(pointAt(pts, 0.5).x).toBe(50);
    expect(pointAt(pts, 1).x).toBe(100);
  });
});
