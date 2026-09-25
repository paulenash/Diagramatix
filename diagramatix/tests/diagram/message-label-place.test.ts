/**
 * T4817–T4824 — THE message-label placement rule (messageLabel.ts).
 *
 * Paul, 2026-09-25, after a voice rename dropped "Request" out of the air gap
 * and into his pool: "The message lable should always be in the air gap between
 * pools and attached closest to the Pool meesage endpoint diagonally to the left
 * or right." And for generated diagrams: "Always — generated too".
 *
 * "Attached": the label's corner nearest the pool end sits 10px off the pool
 * edge and 6px off its own line. Left by default, right when the left is taken,
 * then a row further into the gap; the least overlap when nothing is clear;
 * never outside the pools' shared x-range.
 *
 * Pure: these call `placeMessageLabel` directly. The reducer wiring (rename,
 * add, load) is in message-label-rename-2026-09-25.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  placeMessageLabel, messageLabelSide, MESSAGE_LABEL_EDGE_GAP, MESSAGE_LABEL_LINE_GAP,
} from "@/app/lib/diagram/messageLabel";
import { connectorLabelBox, type Box } from "@/app/lib/diagram/checks/layoutViolations";
import type { Connector, DiagramData, DiagramElement, SymbolType } from "@/app/lib/diagram/types";

const el = (id: string, type: SymbolType, x: number, y: number, w: number, h: number, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label: id, properties: {}, ...extra } as DiagramElement);

const msg = (id: string, sourceId: string, targetId: string, pts: [number, number][], label: string, extra: Partial<Connector> = {}): Connector =>
  ({
    id, sourceId, targetId, sourceSide: "top", targetSide: "bottom",
    type: "messageBPMN", directionType: "directed", routingType: "direct",
    sourceInvisibleLeader: false, targetInvisibleLeader: false,
    waypoints: pts.map(([x, y]) => ({ x, y })), label, ...extra,
  } as Connector);

/**
 * Customer (black-box) 0–80 above Us (white-box) 180–480, a task in Us at
 * x 350–450, SalesForce (black-box) 580–680 below. Both air gaps are 100px.
 */
const world = (): DiagramElement[] => [
  el("cust", "pool", 0, 0, 1000, 80, { label: "Customer", properties: { poolType: "black-box" } }),
  el("us", "pool", 0, 180, 1000, 300, { label: "Us", properties: { poolType: "white-box" } }),
  el("t1", "task", 350, 250, 100, 60, { label: "Take order", parentId: "us" }),
  el("sf", "pool", 0, 580, 1000, 100, { label: "SalesForce", properties: { poolType: "black-box" } }),
];
const up = (label: string, extra: Partial<Connector> = {}) => msg("m1", "t1", "cust", [[400, 250], [400, 80]], label, extra);

const close = (a: Box, b: Box) => {
  for (const k of ["x", "y", "w", "h"] as const) expect(a[k], k).toBeCloseTo(b[k], 6);
};
/** The box the canvas draws once the placement is stored. */
const drawn = (c: Connector, placed: { labelOffsetX: number; labelOffsetY: number }, els: DiagramElement[], fontSize = 10) =>
  connectorLabelBox({ ...c, labelOffsetX: placed.labelOffsetX, labelOffsetY: placed.labelOffsetY }, els, fontSize)!;
const crosses = (b: Box, x: number) => b.x < x && b.x + b.w > x;

/** Paul's diagram before the renames (snapshot 18687imk): the recorded file with its two messages as they were. */
function paulsBefore(): DiagramData {
  const d = JSON.parse(readFileSync(join(process.cwd(), "tests", "fixtures", "block2-test3-add-message.json"), "utf8")) as DiagramData;
  const was: Record<string, Partial<Connector>> = {
    spxupev9: { label: "message 3", labelOffsetX: 60.909627916278396, labelOffsetY: -35.639801942109926, labelWidth: 80, labelTether: "never" },
    bqdjxqwf: { label: "message 4", labelOffsetX: -50.35000787390277, labelOffsetY: -37.27065928336094, labelWidth: 80, labelTether: "never" },
  };
  return { ...d, connectors: d.connectors.map((c) => (was[c.id] ? { ...c, ...was[c.id] } : c)) };
}

describe("T4817 — in the air gap, attached at the pool end, left of the line", () => {
  it("pool end ABOVE: top 10px under the pool, right edge 6px left of the line — and drawn exactly there", () => {
    const els = world(), c = up("Order");
    const p = placeMessageLabel(c, els, [c])!;
    expect(p.side).toBe("left");
    close(p.box, { x: 400 - MESSAGE_LABEL_LINE_GAP - 42, y: 80 + MESSAGE_LABEL_EDGE_GAP, w: 42, h: 14 });
    close(drawn(c, p, els), p.box);
  });

  it("pool end BELOW: bottom 10px above SalesForce, inside the gap", () => {
    const els = world();
    const c = msg("m2", "t1", "sf", [[400, 310], [400, 580]], "Save record");
    const p = placeMessageLabel(c, els, [c])!;
    expect(p.box.y + p.box.h).toBeCloseTo(580 - MESSAGE_LABEL_EDGE_GAP, 6);
    expect(p.box.y).toBeGreaterThanOrEqual(480);
    expect(p.box.x + p.box.w).toBeCloseTo(400 - MESSAGE_LABEL_LINE_GAP, 6);
    close(drawn(c, p, els), p.box);
  });

  it("the source end is the pool: attached there, not at the task", () => {
    const els = world();
    const c = msg("m3", "cust", "t1", [[400, 80], [400, 250]], "Order");
    const p = placeMessageLabel(c, els, [c])!;
    expect(p.box.y).toBeCloseTo(90, 6);
  });
});

describe("T4818 — Paul's diagram: \"Order details\" goes right, \"Request\" left, both attached under Customer", () => {
  // Customer's bottom is -176.68 and My company's top -118.71: a 58px gap.
  const GAP_TOP = -176.6786407442375, GAP_BOTTOM = -118.71419104447502;

  it("message 3 renamed \"Order details\" keeps its right side — the left would cross message 4's line at x 710.7", () => {
    const d = paulsBefore();
    const m3 = d.connectors.find((c) => c.id === "spxupev9")!;
    expect(messageLabelSide(m3, d.elements)).toBe("right");
    const renamed = { ...m3, label: "Order details" };
    const p = placeMessageLabel(renamed, d.elements, d.connectors, { prefer: "right" })!;
    expect(p.side).toBe("right");
    expect(p.box.x).toBeCloseTo(753.0215505527722 + 6, 3);
    expect(p.box.y).toBeCloseTo(GAP_TOP + 10, 3);
    expect(p.box.y + p.box.h).toBeLessThanOrEqual(GAP_BOTTOM);
    // Asked to go left, it still cannot: that spot is across message 4's line.
    expect(placeMessageLabel(renamed, d.elements, d.connectors, { prefer: "left" })!.side).toBe("right");
    close(drawn(renamed, p, d.elements), p.box);
  });

  it("message 4 renamed \"Request\" stays left, 6px clear of its line", () => {
    const d = paulsBefore();
    const m4 = d.connectors.find((c) => c.id === "bqdjxqwf")!;
    expect(messageLabelSide(m4, d.elements)).toBe("left");
    const renamed = { ...m4, label: "Request" };
    const p = placeMessageLabel(renamed, d.elements, d.connectors, { prefer: "left" })!;
    expect(p.side).toBe("left");
    expect(p.box.x + p.box.w).toBeCloseTo(710.7310002253834 - 6, 3);
    expect(p.box.y).toBeCloseTo(GAP_TOP + 10, 3);
    expect(p.box.y + p.box.h).toBeLessThanOrEqual(GAP_BOTTOM);
  });
});

describe("T4819 — taken spots: the other side, then a row further in, then the least overlap; never past the pools' ends", () => {
  /** A message whose label is stored where it covers the left spot of `up`. */
  const blockerOnTheLeft = (): Connector => {
    // Line at x 200: anchor (200, 165). Box 341–383 × 88–102.
    const c = msg("m0", "t0", "cust", [[200, 250], [200, 80]], "Order", { labelOffsetX: 162, labelOffsetY: -77 });
    return c;
  };
  const withT0 = () => [...world(), el("t0", "task", 150, 250, 100, 60, { parentId: "us" })];

  it("a neighbour's label on the preferred side sends it right", () => {
    const els = withT0(), c = up("Order"), n = blockerOnTheLeft();
    const p = placeMessageLabel(c, els, [n, c])!;
    expect(p.side).toBe("right");
    expect(p.box.x).toBeCloseTo(406, 6);
    expect(p.box.y).toBeCloseTo(90, 6);
  });

  it("both sides taken: a row further into the gap, still wholly inside it", () => {
    const els = [...withT0(), el("note", "text-annotation", 406, 86, 50, 18)];
    const c = up("Order"), n = blockerOnTheLeft();
    const p = placeMessageLabel(c, els, [n, c])!;
    expect(p.side).toBe("left");
    expect(p.box.y).toBeCloseTo(90 + 14 + 2, 6);
    expect(p.box.y + p.box.h).toBeLessThanOrEqual(180);
  });

  it("every attached spot taken: the same row, stepped out along it — still in the gap, still to one side", () => {
    // What a generated diagram meets: an event's long name hanging into the gap
    // beside the line. Both sides are covered right up to the line.
    const els = [...world(),
      el("a", "text-annotation", 340, 82, 54, 96),
      el("b", "text-annotation", 406, 82, 60, 96)];
    const c = up("Order");
    const p = placeMessageLabel(c, els, [c])!;
    expect(p.side).toBe("left");
    expect(p.box.x + p.box.w).toBeCloseTo(400 - 6 - 60, 6);
    expect(p.box.y).toBeCloseTo(90, 6);
  });

  it("nothing clear anywhere, even stepped out: the candidate that overlaps least", () => {
    // Every left spot is fully covered, stepped out or not; every right spot
    // too, except the last row, which is only partly covered.
    const els = [...world(),
      el("a", "text-annotation", 200, 82, 194, 96),
      el("b", "text-annotation", 406, 82, 200, 78)];
    const c = up("Order");
    const p = placeMessageLabel(c, els, [c])!;
    expect(p.side).toBe("right");
    expect(p.box.x).toBeCloseTo(406, 6);
    expect(p.box.y).toBeCloseTo(90 + 4 * 16, 6);
    expect(p.box.y + p.box.h).toBeLessThanOrEqual(180);
  });

  it("a line near the pools' left end never puts the label outside them", () => {
    const els = [...world(), el("t2", "task", 10, 250, 60, 60, { parentId: "us" })];
    const c = msg("m4", "t2", "cust", [[40, 250], [40, 80]], "Order details");
    const p = placeMessageLabel(c, els, [c])!;
    expect(p.side).toBe("right");
    expect(p.box.x).toBeGreaterThanOrEqual(0);
  });

  it("the line of a neighbouring message counts as taken", () => {
    const els = [...world(), el("t3", "task", 330, 250, 20, 60, { parentId: "us" })];
    const c = up("Order");
    const n = msg("m5", "t3", "cust", [[370, 250], [370, 80]], "");
    const p = placeMessageLabel(c, els, [n, c])!;
    expect(crosses(p.box, 370), "not across the neighbour's line").toBe(false);
    expect(p.side).toBe("right");
  });
});

describe("T4820 — a gap too thin to attach in", () => {
  it("narrower than the label plus the 10px attach: centred in the gap, one row", () => {
    const els = world().map((e) => (e.id === "us" ? { ...e, y: 100, height: 380 } : e));
    const c = up("Order");
    const p = placeMessageLabel(c, els, [c])!;
    expect(p.box.y).toBeCloseTo(90 - 7, 6);
    expect(p.box.y).toBeGreaterThanOrEqual(80);
    expect(p.box.y + p.box.h).toBeLessThanOrEqual(100);
  });

  it("thinner than the label itself: centred, spilling equally into both pools (the documented limit)", () => {
    const els = world().map((e) => (e.id === "us" ? { ...e, y: 100, height: 380 } : e));
    const c = up("Confirmation of the delivery order"); // two lines, 28px
    const p = placeMessageLabel(c, els, [c])!;
    expect(p.box.h).toBe(28);
    expect(p.box.y).toBeCloseTo(80 - 4, 6);
    expect(p.box.y + p.box.h).toBeCloseTo(100 + 4, 6);
  });
});

describe("T4821 — a long name grows away from the line, at the diagram's font", () => {
  it("a name that wraps to two lines keeps its near edge 6px off the line and stays in the gap", () => {
    const els = world(), c = up("Confirmation of the delivery order");
    const p = placeMessageLabel(c, els, [c])!;
    expect(p.box.h).toBe(28);
    expect(p.box.x + p.box.w).toBeCloseTo(394, 6);
    expect(crosses(p.box, 400)).toBe(false);
    expect(p.box.y).toBeCloseTo(90, 6);
    close(drawn(c, p, els), p.box);
  });

  it("at a 12px connector font the label is sized as drawn, so it still clears its line", () => {
    const els = world(), c = up("Order details");
    const p = placeMessageLabel(c, els, [c], { fontSize: 12 })!;
    expect(p.box.w).toBeCloseTo(13 * 12 * 0.6 + 12, 6);
    expect(p.box.x + p.box.w).toBeCloseTo(394, 6);
    close(drawn(c, p, els, 12), p.box);
    // Measured at 10 instead, the stored centre is drawn across the line at 12
    // (the verdict's case: a wider label grows toward its line on both sides).
    const at10 = placeMessageLabel(c, els, [c])!;
    expect(crosses(drawn(c, at10, els, 12), 400)).toBe(true);
  });
});

describe("T4822 — which gap: the one next to the POOL end", () => {
  it("a pool between the two ends: the label sits next to the pool end, not in the pool between", () => {
    const els = [
      el("cust", "pool", 0, 0, 1000, 80, { properties: { poolType: "black-box" } }),
      el("mid", "pool", 0, 180, 1000, 80, { properties: { poolType: "black-box" } }),
      el("us", "pool", 0, 360, 1000, 300, { properties: { poolType: "white-box" } }),
      el("t1", "task", 350, 400, 100, 60, { parentId: "us" }),
    ];
    const c = msg("m1", "t1", "cust", [[400, 400], [400, 80]], "Order");
    const p = placeMessageLabel(c, els, [c])!;
    expect(p.box.y).toBeCloseTo(90, 6);
    expect(p.box.y + p.box.h).toBeLessThanOrEqual(180);
  });

  it("the other end in no pool: the gap runs to that element, and the label is still attached at the pool", () => {
    const els = [
      el("cust", "pool", 0, 0, 1000, 80, { properties: { poolType: "black-box" } }),
      el("t9", "task", 350, 300, 100, 60),
    ];
    const c = msg("m1", "t9", "cust", [[400, 300], [400, 80]], "Order");
    const p = placeMessageLabel(c, els, [c])!;
    expect(p.box.y).toBeCloseTo(90, 6); // not at the midpoint, 190
  });

  it("neither end a pool: attached where the line leaves the SENDER's pool", () => {
    const els = [
      el("a", "pool", 0, 0, 1000, 200, { properties: { poolType: "white-box" } }),
      el("ta", "task", 350, 100, 100, 60, { parentId: "a" }),
      el("b", "pool", 0, 300, 1000, 200, { properties: { poolType: "white-box" } }),
      el("tb", "task", 350, 360, 100, 60, { parentId: "b" }),
    ];
    const down = msg("m1", "ta", "tb", [[400, 160], [400, 360]], "Order");
    expect(placeMessageLabel(down, els, [down])!.box.y).toBeCloseTo(210, 6);
    const back = msg("m2", "tb", "ta", [[420, 360], [420, 160]], "Reply");
    const p = placeMessageLabel(back, els, [back])!;
    expect(p.box.y + p.box.h).toBeCloseTo(290, 6);
  });
});

describe("T4823 — the run at the pool end, whatever the route does further on", () => {
  it("a free-form route that jogs part-way across: beside the run at the pool, never on the jog", () => {
    // The verdict's case: Customer 0–80, white-box 200–500, a task at 400–560.
    const els = [
      el("cust", "pool", 0, 0, 1000, 80, { properties: { poolType: "black-box" } }),
      el("us", "pool", 0, 200, 1000, 300, { properties: { poolType: "white-box" } }),
      el("t", "task", 400, 300, 160, 60, { parentId: "us" }),
    ];
    const c = msg("m1", "cust", "t", [[240, 80], [240, 104], [240, 190], [480, 190], [480, 300]], "message 1");
    const p = placeMessageLabel(c, els, [c])!;
    expect(p.side).toBe("left");
    expect(p.box.y).toBeCloseTo(90, 6);
    expect(p.box.x + p.box.w).toBeCloseTo(234, 6);
    expect(p.box.y + p.box.h).toBeLessThan(190);
    close(drawn(c, p, els), p.box);
  });

  it("a four-point route (the canvas anchors it on the curve) round-trips exactly", () => {
    const els = world();
    const c = msg("m1", "t1", "cust", [[400, 250], [400, 150], [300, 150], [300, 80]], "Order");
    const p = placeMessageLabel(c, els, [c])!;
    expect(p.box.x + p.box.w).toBeCloseTo(294, 6);
    expect(p.box.y).toBeCloseTo(90, 6);
    close(drawn(c, p, els), p.box);
  });

  it("no vertical run at the pool (a diagonal line): still 10px off the pool edge, and off its own line", () => {
    const els = world();
    const c = msg("m1", "t1", "cust", [[400, 250], [300, 80]], "Order");
    const p = placeMessageLabel(c, els, [c])!;
    expect(p.box.y).toBeCloseTo(90, 6);
    // Sample the line through the label's rows: never inside the box.
    for (let y = p.box.y; y <= p.box.y + p.box.h; y += 1) {
      const x = 300 + ((y - 80) / 170) * 100;
      expect(x > p.box.x && x < p.box.x + p.box.w, `line at y ${y}`).toBe(false);
    }
  });

  it("invisible leaders into the shapes are not the line", () => {
    const els = world();
    const c = msg("m1", "t1", "cust", [[400, 280], [400, 250], [400, 80], [500, 40]], "Order",
      { sourceInvisibleLeader: true, targetInvisibleLeader: true });
    const p = placeMessageLabel(c, els, [c])!;
    expect(p.side).toBe("left");
    expect(p.box.y).toBeCloseTo(90, 6);
    close(drawn(c, p, els), p.box);
  });
});

describe("T4824 — nothing to place, and which side a label is on", () => {
  it("returns null with no label, for a sequence flow, for pools side by side and for overlapping pools", () => {
    const els = world();
    expect(placeMessageLabel(up(""), els, [])).toBeNull();
    expect(placeMessageLabel(up("   "), els, [])).toBeNull();
    expect(placeMessageLabel({ ...up("Order"), type: "sequence" }, els, [])).toBeNull();

    const side = [
      el("a", "pool", 0, 0, 400, 200, { properties: { poolType: "black-box" } }),
      el("b", "pool", 500, 0, 400, 200, { properties: { poolType: "black-box" } }),
    ];
    expect(placeMessageLabel(msg("m", "a", "b", [[400, 100], [500, 100]], "Hi"), side, [])).toBeNull();

    const overlap = [
      el("a", "pool", 0, 0, 1000, 200, { properties: { poolType: "black-box" } }),
      el("b", "pool", 0, 150, 1000, 300, { properties: { poolType: "white-box" } }),
      el("tb", "task", 350, 250, 100, 60, { parentId: "b" }),
    ];
    expect(placeMessageLabel(msg("m", "tb", "a", [[400, 250], [400, 200]], "Hi"), overlap, [])).toBeNull();
  });

  it("messageLabelSide reads the side drawn now; a label on the line has none", () => {
    const els = world();
    const left = placeMessageLabel(up("Order"), els, [])!;
    expect(messageLabelSide({ ...up("Order"), ...left }, els)).toBe("left");
    const right = placeMessageLabel(up("Order"), els, [], { prefer: "right" })!;
    expect(messageLabelSide({ ...up("Order"), ...right }, els)).toBe("right");
    expect(messageLabelSide({ ...up("Order"), labelOffsetX: 0, labelOffsetY: -60 }, els)).toBeUndefined();
  });
});

describe("T4835 — a label steps out along its row, but never past another message's line", () => {
  /** Lines of OTHER messages that run between the label's own line and its far side, within its rows. */
  const passed = (b: Box, lineX: number, others: number[]) => others.filter((x) => {
    const lo = Math.min(lineX, b.x), hi = Math.max(lineX, b.x + b.w);
    return x > lo && x < hi;
  });

  it("three messages 40px apart: \"Order details\" stays attached to its own line — not 6px beside message 2's", () => {
    // The review's case: lines at 440, 520 and 480, the third labelled. The
    // step out used to put it at 526–616, where it reads as message 2's name.
    const els = [...world().filter((e) => e.id !== "t1"), el("tw", "task", 380, 250, 160, 60, { parentId: "us" })];
    const m1 = msg("m1", "tw", "cust", [[440, 250], [440, 80]], "message 1");
    const m2 = msg("m2", "tw", "cust", [[520, 250], [520, 80]], "message 2");
    const p1 = placeMessageLabel(m1, els, [m1])!;
    const placed1 = { ...m1, labelOffsetX: p1.labelOffsetX, labelOffsetY: p1.labelOffsetY };
    const p2 = placeMessageLabel(m2, els, [placed1, m2])!;
    const placed2 = { ...m2, labelOffsetX: p2.labelOffsetX, labelOffsetY: p2.labelOffsetY };
    close(p1.box, { x: 368, y: 90, w: 66, h: 14 });
    close(p2.box, { x: 448, y: 90, w: 66, h: 14 });

    const m3 = msg("m3", "tw", "cust", [[480, 250], [480, 80]], "Order details");
    const p = placeMessageLabel(m3, els, [placed1, placed2, m3])!;
    // Attached: its near side 6px off its own line…
    const near = p.side === "left" ? 480 - (p.box.x + p.box.w) : p.box.x - 480;
    expect(near).toBeCloseTo(MESSAGE_LABEL_LINE_GAP, 6);
    // …and no other message's line between it and that line.
    const nearSide = p.side === "left" ? p.box.x + p.box.w : p.box.x;
    expect([440, 520].filter((x) => x > Math.min(480, nearSide) && x < Math.max(480, nearSide))).toEqual([]);
    expect(p.box.x).not.toBeCloseTo(526, 6);
  });

  it("a step out that would pass a neighbour's line is not taken; the other side's step out is", () => {
    // Both attached spots covered (an event's long name beside the line, as in
    // T4819), and a neighbouring message's line at x 360 on the left: every
    // left step out passes it, so the label steps out to the RIGHT instead.
    const els = [...world(),
      el("a", "text-annotation", 340, 82, 54, 96),
      el("b", "text-annotation", 406, 82, 60, 96),
      el("t3", "task", 330, 350, 60, 60, { parentId: "us" })];
    const c = up("Order");
    const n = msg("m5", "t3", "cust", [[360, 350], [360, 80]], "");
    const p = placeMessageLabel(c, els, [n, c])!;
    expect(p.side).toBe("right");
    expect(p.box.x).toBeCloseTo(466, 6);
    expect(p.box.y).toBeCloseTo(90, 6);
    expect(passed(p.box, 400, [360])).toEqual([]);
    // Without the neighbour it steps out left, as T4819 pins.
    expect(placeMessageLabel(c, els, [c])!.side).toBe("left");
  });
});
