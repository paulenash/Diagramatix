/**
 * Flowchart generate-layout rules:
 *  - F4.02 — a branching Decision's flowlines exit the diamond's LEFT / RIGHT
 *    connection points (not the bottom).
 *  - F4.05 — flowlines converging on a Merge attach to its TOP edge, fanned out
 *    so they don't overlap at the centre.
 */
import { describe, it, expect } from "vitest";
import { layoutFlowchartDiagram } from "@/app/lib/diagram/layoutFlowchart";

const plan = {
  elements: [
    { id: "s", type: "terminator", label: "Start" },
    { id: "d", type: "decision", label: "Approved?" },
    { id: "pa", type: "process", label: "Ship" },
    { id: "pb", type: "process", label: "Reject" },
    { id: "m", type: "merge", label: "" },
    { id: "e", type: "terminator", label: "End" },
  ],
  connections: [
    { sourceId: "s", targetId: "d" },
    { sourceId: "d", targetId: "pa", label: "Yes" },
    { sourceId: "d", targetId: "pb", label: "No" },
    { sourceId: "pa", targetId: "m" },
    { sourceId: "pb", targetId: "m" },
    { sourceId: "m", targetId: "e" },
  ],
};

describe("flowchart layout — decision branches + merge convergence", () => {
  const out = layoutFlowchartDiagram(plan);
  const conn = (s: string, t: string) => out.connectors.find((c) => c.sourceId === s && c.targetId === t)!;

  it("F4.02 — decision branches exit the left and right diamond points", () => {
    const sides = [conn("d", "pa").sourceSide, conn("d", "pb").sourceSide].sort();
    expect(sides).toEqual(["left", "right"]);
    // The branch towards the left-placed process exits left; the other right.
    const pa = out.elements.find((e) => e.id === "pa")!;
    const pb = out.elements.find((e) => e.id === "pb")!;
    const left = pa.x < pb.x ? "pa" : "pb";
    expect(conn("d", left).sourceSide).toBe("left");
  });

  it("F4.05 — merge inputs attach to the top edge, fanned apart", () => {
    const a = conn("pa", "m");
    const b = conn("pb", "m");
    expect(a.targetSide).toBe("top");
    expect(b.targetSide).toBe("top");
    // Distinct, non-centre offsets ordered left→right by source x.
    expect(a.targetOffsetAlong).not.toBe(b.targetOffsetAlong);
    expect(a.targetOffsetAlong).toBeDefined();
    const leftFirst = (out.elements.find((e) => e.id === "pa")!.x <= out.elements.find((e) => e.id === "pb")!.x)
      ? a.targetOffsetAlong! < b.targetOffsetAlong!
      : b.targetOffsetAlong! < a.targetOffsetAlong!;
    expect(leftFirst).toBe(true);
  });

  it("every connector still has a non-empty waypoints array", () => {
    for (const c of out.connectors) {
      expect(Array.isArray(c.waypoints)).toBe(true);
      expect(c.waypoints.length).toBeGreaterThan(0);
    }
  });
});
