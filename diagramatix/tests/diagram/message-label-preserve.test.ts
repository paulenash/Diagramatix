/**
 * A message label keeps its place when its pool moves.
 *
 * Paul, 2026-09-18, after the swap started re-attaching correctly: "the message
 * labels loose their relative positions with respect to their message
 * connector's attachment point to their respective Pool boundaries."
 *
 * The label is stored as an offset from the MIDPOINT of the line, so moving one
 * end moves the midpoint and slides the label somewhere nobody put it.
 *
 * The rule was settled the hard way during the pool-drag work (see the memory
 * note "messageBPMN label preservation across pool cross-over", where several
 * other formulas were tried and rejected by Paul):
 *
 *     oldOff  = oldLabelCentre − oldAttach     // the MOVING end
 *     normal  : newLabelCentre = newAttach + oldOff
 *     flipped : newLabelCentre = newAttach − oldOff
 *
 * Anchoring to the moving end is what makes it work: the offset is invariant
 * while the pool and its label travel together, so a flip is just a sign change.
 */
import { describe, it, expect } from "vitest";
import { preserveMessageLabel } from "@/app/lib/diagram/messageLabel";
import type { Connector } from "@/app/lib/diagram/types";

const LINE_H = 14;

/** A two-waypoint message: task at the top, pool below. */
const msg = (
  src: { x: number; y: number },
  tgt: { x: number; y: number },
  over: Partial<Connector> = {},
): Connector =>
  ({
    id: "m1", sourceId: "task", targetId: "POOL",
    sourceSide: "bottom", targetSide: "top",
    type: "messageBPMN", directionType: "directed", routingType: "rectilinear",
    sourceInvisibleLeader: false, targetInvisibleLeader: false,
    sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5,
    label: "Order Placed",
    labelOffsetX: 0, labelOffsetY: 0,
    waypoints: [src, tgt],
    ...over,
  }) as unknown as Connector;

/** Where the label's CENTRE ends up, given a connector's offsets. */
const centreOf = (c: Connector, off: { labelOffsetX: number; labelOffsetY: number }) => {
  const mid = {
    x: (c.waypoints[0].x + c.waypoints[1].x) / 2,
    y: (c.waypoints[0].y + c.waypoints[1].y) / 2,
  };
  const half = (((c.label ?? "").split("\n").length) || 1) * LINE_H / 2;
  return { x: mid.x + off.labelOffsetX, y: mid.y + off.labelOffsetY + half };
};

describe("T4516 — the label stays put relative to the pool it is attached to", () => {
  it("follows the pool down the page", () => {
    // Task at y=100, pool edge at y=300. The label sits 40px above the pool.
    const before = msg({ x: 200, y: 100 }, { x: 200, y: 300 }, { labelOffsetX: 0, labelOffsetY: -47 });
    const startGap = centreOf(before, { labelOffsetX: 0, labelOffsetY: -47 }).y - 300;

    // The pool moves to y=500; the task has not moved.
    const after = msg({ x: 200, y: 100 }, { x: 200, y: 500 });
    const off = preserveMessageLabel(after, before, "target")!;
    expect(off).not.toBeNull();
    expect(centreOf(after, off).y - 500, "the same distance from the new pool edge")
      .toBeCloseTo(startGap, 5);
  });

  it("mirrors when the pool crosses to the other side", () => {
    // The pool was BELOW the task and ends up ABOVE it — which is exactly what a
    // swap does. The label mirrors so it stays on the outside of the elbow.
    const before = msg({ x: 200, y: 100 }, { x: 200, y: 300 }, { labelOffsetY: -47 });
    const gapBelowAttach = centreOf(before, { labelOffsetX: 0, labelOffsetY: -47 }).y - 300;
    const after = msg({ x: 200, y: 100 }, { x: 200, y: -100 });
    const off = preserveMessageLabel(after, before, "target")!;
    expect(centreOf(after, off).y - -100, "mirrored across the new attachment")
      .toBeCloseTo(-gapBelowAttach, 5);
  });

  it("keeps the sideways offset as it was", () => {
    const before = msg({ x: 200, y: 100 }, { x: 200, y: 300 }, { labelOffsetX: 25, labelOffsetY: -47 });
    const after = msg({ x: 200, y: 100 }, { x: 200, y: 500 });
    const off = preserveMessageLabel(after, before, "target")!;
    expect(centreOf(after, off).x - 200).toBeCloseTo(25, 5);
  });

  it("anchors to whichever end actually moved", () => {
    // Same geometry, but this time the SOURCE is the pool that moved. Anchoring
    // to the wrong end is the failure mode the rule exists to avoid.
    const before = msg({ x: 200, y: 300 }, { x: 200, y: 100 }, { labelOffsetY: -47 });
    const gap = centreOf(before, { labelOffsetX: 0, labelOffsetY: -47 }).y - 300;
    const after = msg({ x: 200, y: 500 }, { x: 200, y: 100 });
    const off = preserveMessageLabel(after, before, "source")!;
    expect(centreOf(after, off).y - 500).toBeCloseTo(gap, 5);
  });

  it("measures a multi-line label from its middle", () => {
    const two = { label: "Order\nPlaced", labelOffsetY: -47 };
    const before = msg({ x: 200, y: 100 }, { x: 200, y: 300 }, two);
    const gap = centreOf(before, { labelOffsetX: 0, labelOffsetY: -47 }).y - 300;
    const after = msg({ x: 200, y: 100 }, { x: 200, y: 500 }, { label: "Order\nPlaced" });
    const off = preserveMessageLabel(after, before, "target")!;
    expect(centreOf(after, off).y - 500).toBeCloseTo(gap, 5);
  });

  it("has nothing to do when there is no label or no offsets", () => {
    const plain = msg({ x: 200, y: 100 }, { x: 200, y: 300 }, { label: "" });
    expect(preserveMessageLabel(plain, plain, "target")).toBeNull();
    const noOffsets = msg({ x: 200, y: 100 }, { x: 200, y: 300 }, { labelOffsetX: undefined, labelOffsetY: undefined });
    expect(preserveMessageLabel(noOffsets, noOffsets, "target")).toBeNull();
  });

  it("is used by the pool reorder", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), "app", "lib", "diagram", "poolOrder.ts"), "utf8");
    expect(src).toContain("preserveMessageLabel(");
    expect(src, "anchored to the end that moved").toContain("shiftOf(c.sourceId) !== 0");
  });
});
