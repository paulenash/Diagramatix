/**
 * T4670–T4672 — a label belongs to a place on its line, not to its anchor.
 *
 * Paul, 22 September 2026:
 *
 *   "Connector labels located near a horizontal segment of the connector they
 *    are associated with (i.e. above or below it) should move with that
 *    horizontal segment as it is moved up or down. If they are further away
 *    then when they get very close they should then move with that segment.
 *    This is particularly important for outgoing gateway connectors but should
 *    occur for any sequence connector labels in this situation."
 *
 *   "In addition, when moving the gateway the connectors originate from, do
 *    not move these labels as is currently done. Except the label on the
 *    middle vertex connector" — "if it exists!"
 *
 * A label is stored as an offset from an anchor — the gateway vertex for a
 * branch, the midpoint of the two ends otherwise — and in both cases the
 * anchor was the wrong thing to follow. Dragging a middle segment moves
 * neither end, so the label stayed while its line slid away; moving a gateway
 * moves every branch's first point, so every branch label went with it, even
 * where the line beside it had not moved at all.
 */
import { describe, it, expect } from "vitest";
import { reducer } from "@/app/hooks/useDiagram";
import { connectorLabelBox, baseLabelAnchor } from "@/app/lib/diagram/checks/layoutViolations";
import {
  labelShiftForSegmentMove, movedHorizontalSegment, leavesMiddleVertex, SEGMENT_ATTACH_GAP,
} from "@/app/lib/diagram/labelFollow";
import type { Connector, DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;
const C = (o: Record<string, unknown>) => o as unknown as Connector;

// ── Rule 1 ───────────────────────────────────────────────────────────────────
// A five-point route whose middle horizontal segment (x 200→350, y 300) can be
// dragged while both ends stay put — so the anchor, the ends' midpoint
// (225, 250), never moves.
const ROUTE = [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 300 }, { x: 350, y: 300 }, { x: 350, y: 400 }];
const withSegmentAt = (y: number) => ROUTE.map((p, i) => (i === 2 || i === 3 ? { ...p, y } : p));

/** A 30×14 "Yes" label whose box top is at `top`, centred at x = 275. */
const flow = (top: number, type = "sequence"): DiagramData => ({
  elements: [
    E({ id: "a", type: "task", label: "A", x: 0, y: 70, width: 100, height: 60, properties: {} }),
    E({ id: "b", type: "task", label: "B", x: 300, y: 400, width: 100, height: 60, properties: {} }),
  ],
  connectors: [C({
    id: "c", type, sourceId: "a", targetId: "b", sourceSide: "right", targetSide: "top",
    directionType: "directed", routingType: "rectilinear",
    waypoints: ROUTE, label: "Yes", labelOffsetX: 50, labelOffsetY: top - 250,
  })],
  viewport: { x: 0, y: 0, zoom: 1 },
}) as unknown as DiagramData;

const dragSegment = (d: DiagramData, y: number) =>
  reducer(d, { type: "UPDATE_CONNECTOR_WAYPOINTS", payload: { id: "c", waypoints: withSegmentAt(y) } } as never) as DiagramData;
const labelTop = (d: DiagramData) => connectorLabelBox(d.connectors[0])!.y;

describe("T4670 — a label goes with the horizontal segment it sits by", () => {
  it("moves the whole way with it when it is close — up or down", () => {
    // Box bottom at 294, 6px above the line at 300: attached.
    expect(labelTop(dragSegment(flow(280), 340))).toBeCloseTo(320, 5);
    expect(labelTop(dragSegment(flow(280), 250))).toBeCloseTo(230, 5);
  });

  it("does the same for a label BELOW the segment", () => {
    // Box top at 306, 6px under the line.
    expect(labelTop(dragSegment(flow(306), 360))).toBeCloseTo(366, 5);
  });

  it("leaves a label that is further away where it is…", () => {
    // Box bottom at 214, 86px above the line.
    expect(labelTop(dragSegment(flow(200), 340)), "moving away").toBeCloseTo(200, 5);
    expect(labelTop(dragSegment(flow(200), 250)), "still 36px off").toBeCloseTo(200, 5);
  });

  it("…until the segment gets very close, and then carries it", () => {
    // The line reaches 220: 6px from the label, inside the 8px gap. The label
    // is picked up at exactly the gap — box bottom at 212, top at 198.
    const picked = dragSegment(flow(200), 220);
    expect(labelTop(picked)).toBeCloseTo(220 - SEGMENT_ATTACH_GAP - 14, 5);
    // From then on it is attached and goes the whole way.
    const carried = reducer(picked, {
      type: "UPDATE_CONNECTOR_WAYPOINTS", payload: { id: "c", waypoints: withSegmentAt(150) },
    } as never) as DiagramData;
    expect(labelTop(carried)).toBeCloseTo(150 - SEGMENT_ATTACH_GAP - 14, 5);
  });

  it("picks it up even if one mouse sample jumps the segment past it", () => {
    // From 300 straight to 120, over the label: it must not be left behind on
    // the wrong side.
    const jumped = dragSegment(flow(200), 120);
    const box = connectorLabelBox(jumped.connectors[0])!;
    expect(box.y + box.h, "still above the line").toBeLessThanOrEqual(120 - SEGMENT_ATTACH_GAP + 0.01);
  });

  it("follows a segment brought level with its neighbour — where the route drops to four points", () => {
    // At y = 100 the dragged segment lines up with the first one, the zero-
    // length step between them is consolidated away and the stored route has
    // FOUR points. The canvas anchors a four-point route's label at the curve
    // midpoint, and the first version measured it from the ends instead — so
    // the rule put the label somewhere the canvas did not.
    const level = dragSegment(flow(200), 100);
    expect(level.connectors[0].waypoints).toHaveLength(4);
    const box = connectorLabelBox(level.connectors[0])!;
    expect(box.y + box.h, "carried up with the segment").toBeLessThanOrEqual(100 - SEGMENT_ATTACH_GAP + 0.01);
    expect(movedHorizontalSegment(level.connectors[0].waypoints, withSegmentAt(140)), "and found again on the next sample")
      .not.toBeNull();
  });

  it("is for SEQUENCE flows, as asked", () => {
    const msg = dragSegment(flow(280, "association"), 340);
    expect(labelTop(msg)).toBeCloseTo(280, 5);
  });
});

describe("T4671 — the rule itself", () => {
  const seg = (y: number) => ({ y, x1: 200, x2: 350 });
  const box = (y: number, x = 260) => ({ x, y, w: 30, h: 14 });

  it("finds the segment a drag moved by its unchanged x-span", () => {
    expect(movedHorizontalSegment(ROUTE, withSegmentAt(340))).toEqual({ from: seg(300), to: seg(340) });
    expect(movedHorizontalSegment(ROUTE, ROUTE), "nothing moved").toBeNull();
  });

  it("still finds it when the stored route had FUSED two segments into one", () => {
    // Collinear fusion can merge the dragged segment into a neighbour, after
    // which no span matches exactly. Containment finds it: the new segment's
    // span lies inside the fused one, at a different height.
    const fused = [{ x: 100, y: 100 }, { x: 350, y: 100 }, { x: 350, y: 400 }];
    const pulledApart = [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 140 }, { x: 350, y: 140 }, { x: 350, y: 400 }];
    expect(movedHorizontalSegment(fused, pulledApart)).toEqual({
      from: { y: 100, x1: 100, x2: 350 },
      to: { y: 140, x1: 200, x2: 350 },
    });
  });

  it("anchors a label exactly where the canvas draws it", () => {
    // ConnectorRenderer: a source-anchored label from the first point; a
    // FOUR-point route from its cubic-bezier midpoint; otherwise the midpoint
    // of the ends. The checks and these rules share one anchor, so pin it to
    // the renderer's numbers — agreement among the copies proves nothing if
    // they are all wrong together.
    const four = C({ type: "sequence", waypoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 }] });
    expect(baseLabelAnchor(four)).toEqual({ x: 0.375 * 100 + 0.375 * 100 + 0.125 * 300, y: 0.375 * 200 + 0.125 * 200 });
    const five = C({ type: "sequence", waypoints: ROUTE });
    expect(baseLabelAnchor(five)).toEqual({ x: 225, y: 250 });
    const branch = C({ type: "sequence", labelAnchor: "source", waypoints: [{ x: 7, y: 9 }, { x: 50, y: 9 }, { x: 50, y: 90 }, { x: 99, y: 90 }] });
    expect(baseLabelAnchor(branch)).toEqual({ x: 7, y: 9 });
  });

  it("ignores a label that is not over or under the segment", () => {
    expect(labelShiftForSegmentMove(box(280, 500), seg(300), seg(340))).toBe(0);
  });

  it("carries an attached label, including one sitting on the line", () => {
    expect(labelShiftForSegmentMove(box(280), seg(300), seg(340))).toBe(40);
    expect(labelShiftForSegmentMove(box(293), seg(300), seg(340)), "straddling").toBe(40);
  });

  it("uses one gap for 'close' and for where a picked-up label lands", () => {
    // Box bottom at 214. The line arriving at 223 is 9px off — not yet close.
    expect(labelShiftForSegmentMove(box(200), seg(300), seg(223))).toBe(0);
    // At 221 it is 7px off — inside the gap — so the label is picked up and
    // lands exactly 8px above: top at 221 − 8 − 14 = 199, a shift of −1.
    expect(labelShiftForSegmentMove(box(200), seg(300), seg(221))).toBe(-1);
  });
});

// ── Rule 2 ───────────────────────────────────────────────────────────────────
/** A decision gateway with three branches: top, middle (right), bottom. */
const fanOut = (withMiddle = true): DiagramData => {
  const gw = E({ id: "g", type: "gateway", label: "OK?", x: 200, y: 200, width: 40, height: 40, properties: {} });
  const up = E({ id: "up", type: "task", label: "Up", x: 350, y: 60, width: 100, height: 60, properties: {} });
  const mid = E({ id: "mid", type: "task", label: "Mid", x: 350, y: 190, width: 100, height: 60, properties: {} });
  const dn = E({ id: "dn", type: "task", label: "Down", x: 350, y: 320, width: 100, height: 60, properties: {} });
  const branch = (id: string, target: string, side: string, wp: { x: number; y: number }[], label: string) => C({
    id, type: "sequence", sourceId: "g", targetId: target, sourceSide: side, targetSide: "left",
    directionType: "directed", routingType: "rectilinear", labelAnchor: "source",
    waypoints: wp, label, labelOffsetX: 20, labelOffsetY: -18,
  });
  return {
    elements: withMiddle ? [gw, up, mid, dn] : [gw, up, dn],
    connectors: [
      branch("cUp", "up", "top", [{ x: 220, y: 200 }, { x: 220, y: 90 }, { x: 350, y: 90 }], "High"),
      ...(withMiddle ? [branch("cMid", "mid", "right", [{ x: 240, y: 220 }, { x: 350, y: 220 }], "Normal")] : []),
      branch("cDn", "dn", "bottom", [{ x: 220, y: 240 }, { x: 220, y: 350 }, { x: 350, y: 350 }], "Low"),
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  } as unknown as DiagramData;
};
const boxOf = (d: DiagramData, id: string) => connectorLabelBox(d.connectors.find((c) => c.id === id)!)!;
const moveGateway = (d: DiagramData, dx: number, dy: number) =>
  reducer(d, { type: "MOVE_ELEMENT", payload: { id: "g", x: 200 + dx, y: 200 + dy } } as never) as DiagramData;

describe("T4672 — moving a gateway leaves its top and bottom branch labels where they are", () => {
  it("holds the top- and bottom-vertex labels still in the diagram", () => {
    const before = fanOut();
    const after = moveGateway(before, -30, 25);
    for (const id of ["cUp", "cDn"]) {
      const a = boxOf(before, id), b = boxOf(after, id);
      expect([b.x, b.y], `${id} moved with the gateway`).toEqual([a.x, a.y].map((v) => expect.closeTo(v, 5)));
    }
  });

  it("still carries the MIDDLE-vertex label with the gateway", () => {
    const before = fanOut();
    const after = moveGateway(before, -30, 25);
    const a = boxOf(before, "cMid"), b = boxOf(after, "cMid");
    expect(Math.hypot(b.x - a.x, b.y - a.y), "the middle label did not travel").toBeGreaterThan(10);
  });

  it("works when there is no middle branch at all", () => {
    const before = fanOut(false);
    const after = moveGateway(before, 0, 40);
    expect(boxOf(after, "cUp").y).toBeCloseTo(boxOf(before, "cUp").y, 5);
    expect(boxOf(after, "cDn").y).toBeCloseTo(boxOf(before, "cDn").y, 5);
  });

  it("lets everything travel when the gateway moves WITH its targets", () => {
    // A group move is not "moving the gateway"; the labels go with the group.
    const before = fanOut();
    const after = reducer(before, {
      type: "MOVE_ELEMENTS", payload: { ids: ["g", "up", "mid", "dn"], dx: 0, dy: 50 },
    } as never) as DiagramData;
    expect(boxOf(after, "cUp").y).toBeCloseTo(boxOf(before, "cUp").y + 50, 0);
  });

  it("knows which vertex is the middle one", () => {
    expect(leavesMiddleVertex({ sourceSide: "right" })).toBe(true);
    expect(leavesMiddleVertex({ sourceSide: "left" })).toBe(true);
    expect(leavesMiddleVertex({ sourceSide: "top" })).toBe(false);
    expect(leavesMiddleVertex({ sourceSide: "bottom" })).toBe(false);
  });
});
