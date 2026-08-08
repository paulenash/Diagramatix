/**
 * Variant explorer helpers — Pareto shares, activity-set diff, and mapping a
 * variant's activity sequence onto the discovered model's element/connector ids
 * (used to isolate a variant's path on the diagram).
 */
import { describe, it, expect } from "vitest";
import { variantPareto, variantDiff, variantPathIds } from "@/app/lib/mining/variantView";
import type { Variant } from "@/app/lib/mining/types";
import type { DiagramData } from "@/app/lib/diagram/types";

const V = (events: string[], count: number): Variant => ({ states: events, events, count });

// Minimal discovered-like model: (S)->A->B->(E)
const el = (id: string, type: string, label: string): DiagramData["elements"][number] =>
  ({ id, type, label, x: 0, y: 0, width: 80, height: 40, properties: {} } as DiagramData["elements"][number]);
const conn = (id: string, sourceId: string, targetId: string): DiagramData["connectors"][number] =>
  ({ id, sourceId, targetId, type: "sequence", sourceSide: "right", targetSide: "left", directionType: "forward", routingType: "orthogonal", sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [] } as unknown as DiagramData["connectors"][number]);

const DATA: DiagramData = {
  elements: [el("s", "start-event", ""), el("a", "task", "A"), el("b", "task", "B"), el("e", "end-event", "")],
  connectors: [conn("sa", "s", "a"), conn("ab", "a", "b"), conn("be", "b", "e")],
} as DiagramData;

describe("variant explorer helpers", () => {
  it("T2229 — variantPareto gives shares that sum to 1 and a rising cumulative", () => {
    const rows = variantPareto([V(["A", "B"], 3), V(["A"], 1)]);
    expect(rows[0].share).toBeCloseTo(0.75);
    expect(rows[1].cumulative).toBeCloseTo(1);
    expect(rows[0].cumulative).toBeLessThan(rows[1].cumulative);
  });

  it("T2230 — variantDiff splits activities unique to each vs shared", () => {
    const d = variantDiff(["A", "B", "C"], ["A", "C", "D"]);
    expect(d.onlyA).toEqual(["B"]);
    expect(d.onlyB).toEqual(["D"]);
    expect(d.common.sort()).toEqual(["A", "C"]);
  });

  it("T2231 — variantPathIds isolates a variant's elements + connectors + start/end", () => {
    const ids = variantPathIds(DATA, ["A", "B"]);
    // activities + the A->B connector
    expect(ids.has("a")).toBe(true);
    expect(ids.has("b")).toBe(true);
    expect(ids.has("ab")).toBe(true);
    // start/end events + their connectors
    expect(ids.has("s")).toBe(true);
    expect(ids.has("sa")).toBe(true);
    expect(ids.has("e")).toBe(true);
    expect(ids.has("be")).toBe(true);
  });
});
