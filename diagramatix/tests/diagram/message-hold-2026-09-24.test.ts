/**
 * T4713–T4715 — what a message keeps hold of when something near it changes.
 *
 * Paul, 2026-09-24, two reports and a question:
 *
 *   1. "Extending the right-hand Pool boundary moves all pool boundaries to
 *      the right. So far so good, but any message originating on pools that
 *      were extended to the right also move to the right." …and then, having
 *      tried again: "I can't reproduce the pool right hand boundary move
 *      defect … Can you find any circumstances where this could occur?"
 *   2. "Moving a Task up or down, in a white-box pool, that has messages
 *      attached to it causes the message labels to move up or down. In either
 *      of these circumstances the message labels should not move at all."
 *
 * The answer to (1) is why the rule moved. A message's x is a FRACTION of its
 * pool's width, so every path that changes that width and recomputes moves the
 * message — and only two paths remembered to pin it. The pin now belongs to the
 * width change itself, in the reducer wrapper, so no path can forget.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { reducer } from "@/app/hooks/useDiagram";
import { connectorLabelBox } from "@/app/lib/diagram/checks/layoutViolations";
import { holdMessageLabel, settleMessageLabels } from "@/app/lib/diagram/messageLabel";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;

/** A white-box pool with a task, and a black-box participant below it. */
const world = (): DiagramData => ({
  elements: [
    E({ id: "A", type: "pool", label: "A", x: 0, y: 0, width: 800, height: 200, properties: { poolType: "white-box" } }),
    E({ id: "LA", type: "lane", label: "L", x: 36, y: 0, width: 764, height: 200, parentId: "A", properties: {} }),
    E({ id: "t", type: "task", label: "Task", x: 300, y: 60, width: 100, height: 60, parentId: "LA", properties: {} }),
    E({ id: "B", type: "pool", label: "B", x: 0, y: 300, width: 800, height: 80, properties: { poolType: "black-box" } }),
  ],
  connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
}) as unknown as DiagramData;

const withMessage = (from: string, to: string, fromSide: string, toSide: string): DiagramData =>
  reducer(world(), {
    type: "ADD_CONNECTOR",
    payload: {
      sourceId: from, targetId: to, connectorType: "messageBPMN", directionType: "directed",
      routingType: "rectilinear", sourceSide: fromSide, targetSide: toSide, initialLabel: "msg", force: true,
    },
  } as never) as DiagramData;

const labelAt = (d: DiagramData) => {
  const b = connectorLabelBox(d.connectors[0]);
  return b ? { x: Math.round(b.x), y: Math.round(b.y) } : null;
};
/**
 * The x of the run you can SEE. A BPMN message carries an invisible leader at
 * each end — waypoint 0 and the last are the two elements' centres, drawn by
 * nobody — so the visible run is waypoints[1]..[len-2], which share one x.
 * Reading waypoint 0 is what made this look like a 300 → 450 jump when the
 * message had not moved at all.
 */
const runX = (d: DiagramData) => Math.round((d.connectors[0] as Connector).waypoints[1].x);
const drag = (d: DiagramData, id: string, x: number, y: number) => {
  const pre = { elements: d.elements, connectors: d.connectors };
  let next = reducer(d, { type: "MOVE_ELEMENT", payload: { id, x, y } } as never) as DiagramData;
  return reducer(next, { type: "MOVE_END", payload: { id, preDrag: pre } } as never) as DiagramData;
};

describe("T4713 — a task moving does not move the message labels", () => {
  it("up or down, the label stays exactly where it was", () => {
    const d = withMessage("t", "B", "bottom", "top");
    const was = labelAt(d);
    expect(labelAt(drag(d, "t", 300, 110)), "moved down 50").toEqual(was);
    expect(labelAt(drag(d, "t", 300, 20)), "moved up 40").toEqual(was);
  });

  it("the same when the message ORIGINATES on the pool and ends on the task", () => {
    const d = withMessage("B", "t", "top", "bottom");
    const was = labelAt(d);
    expect(labelAt(drag(d, "t", 300, 110))).toEqual(was);
    expect(labelAt(drag(d, "t", 300, 20))).toEqual(was);
  });

  it("sideways too — the label is not dragged along by the task", () => {
    const d = withMessage("t", "B", "bottom", "top");
    expect(labelAt(drag(d, "t", 420, 60))).toEqual(labelAt(d));
  });
});

describe("T4714 — a POOL still carries its labels, which is the rule that stays", () => {
  it("the label travels with a moved pool, by the pool's own delta", () => {
    // preserveMessageLabel's rule (2026-09-18, after the pool swap) is intact;
    // what changed is only WHICH moves count as "the pool moved".
    const d = withMessage("t", "B", "bottom", "top");
    const before = d.connectors[0];
    const moved = { ...before, waypoints: before.waypoints.map((w) => ({ x: w.x, y: w.y + 120 })) } as Connector;
    const asPool = settleMessageLabels([moved], [before], new Set(["B"]), new Set(["B"]));
    const asTask = settleMessageLabels([moved], [before], new Set(["B"]), new Set());
    expect(asPool[0].labelOffsetY, "a pool carries the label").toBe(before.labelOffsetY);
    expect(asTask[0].labelOffsetY, "anything else leaves it in place").not.toBe(before.labelOffsetY);
  });

  it("holdMessageLabel keeps the world position while the line changes", () => {
    const d = withMessage("t", "B", "bottom", "top");
    const before = d.connectors[0];
    const shifted = { ...before, waypoints: before.waypoints.map((w) => ({ x: w.x, y: w.y + 60 })) } as Connector;
    const held = holdMessageLabel(shifted, before)!;
    const oldMid = (before.waypoints[0].y + before.waypoints[before.waypoints.length - 1].y) / 2;
    const newMid = (shifted.waypoints[0].y + shifted.waypoints[shifted.waypoints.length - 1].y) / 2;
    expect(newMid + held.labelOffsetY, "same world y as before")
      .toBeCloseTo(oldMid + (before.labelOffsetY ?? 0), 5);
  });
});

describe("T4715 — a pool changing WIDTH never drags its messages", () => {
  /**
   * A NARROW black-box pool, narrow before the message is drawn — the offset
   * fraction has to be recorded against the width the pool really has, or
   * "extend pools" merely puts back the width the fraction was taken from and
   * the fixture proves nothing.
   */
  const narrowWorld = (from: string, to: string, fs2: string, ts: string): DiagramData => {
    const base = world();
    base.elements = base.elements.map((e) =>
      e.id === "A" ? { ...e, width: 900 } : e.id === "LA" ? { ...e, width: 864 } : e.id === "B" ? { ...e, width: 600 } : e,
    );
    return reducer(base, {
      type: "ADD_CONNECTOR",
      payload: {
        sourceId: from, targetId: to, connectorType: "messageBPMN", directionType: "directed",
        routingType: "rectilinear", sourceSide: fs2, targetSide: ts, initialLabel: "msg", force: true,
      },
    } as never) as DiagramData;
  };

  it("“extend the pools” is the circumstance — and it no longer drags them", () => {
    // This is what Paul saw, asymmetry and all: "any message ORIGINATING on
    // pools that were extended to the right also move to the right … This does
    // not happen to messages TERMINATING on any of the extended pools."
    //
    // EXTEND_POOLS sets every pool to a common width and recomputes the
    // connectors, with no pin of its own. A message attached to a pool sits at
    // a FRACTION of that pool's width, and the visible run takes its x from the
    // SOURCE end — so widening the pool moved a message that started there, and
    // left alone one that ended there. It was the pools that were extended, not
    // the message that was meant to move.
    //
    // Dragging the boundary by hand is RESIZE_ELEMENT, which pinned already —
    // which is why it would not reproduce the second time it was tried.
    for (const [from, to, fs2, ts] of [["B", "t", "top", "bottom"], ["t", "B", "bottom", "top"]] as const) {
      const d = narrowWorld(from, to, fs2, ts);
      const wasRun = runX(d);
      const wasLabel = labelAt(d);
      const extended = reducer(d, { type: "EXTEND_POOLS", payload: {} } as never) as DiagramData;
      expect(extended.elements.find((e) => e.id === "B")!.width, "the pool really did widen").toBeGreaterThan(600);
      expect(runX(extended), `${from}→${to}: the visible run stays put`).toBe(wasRun);
      expect(labelAt(extended), `${from}→${to}: and so does its label`).toEqual(wasLabel);
    }
  });

  it("and the resize path, which pinned already, still does", () => {
    for (const [from, to, fs2, ts] of [["B", "t", "top", "bottom"], ["t", "B", "bottom", "top"]] as const) {
      const d = withMessage(from, to, fs2, ts);
      const was = runX(d);
      const resized = reducer(d, { type: "RESIZE_ELEMENT", payload: { id: "B", x: 0, y: 300, width: 1000, height: 80 } } as never) as DiagramData;
      expect(runX(resized), `${from}→${to} after a resize`).toBe(was);
    }
  });

  it("a pool that MOVES is the opposite case and is left alone", () => {
    // Its messages travel with it — that is what makes a pool drag work.
    const d = withMessage("B", "t", "top", "bottom");
    const movedPool = reducer(d, { type: "MOVE_ELEMENT", payload: { id: "B", x: 150, y: 300 } } as never) as DiagramData;
    const pool = movedPool.elements.find((e) => e.id === "B")!;
    expect(pool.x, "the pool moved").toBe(150);
    expect(pool.width, "and did not change width").toBe(800);
  });

  it("the rule sits in the wrapper, where no path can forget it", () => {
    const src = readFileSync("app/hooks/useDiagram.ts", "utf8");
    const wrapper = src.slice(src.indexOf("A POOL CHANGING WIDTH NEVER DRAGS ITS MESSAGES"), src.indexOf("LANE_RECONCILE_ACTIONS.has(action.type)"));
    expect(wrapper).toContain("was.width !== after.width");
    expect(wrapper).toContain("pinPoolMessageEnds(conn, orig, oldById, next.elements, changed)");
  });
});

describe("T4716 — the template hover preview is clear of the menu", () => {
  it("is offset by the menu's own width, and painted above it", () => {
    // Paul, 2026-09-24: "The hover large template image appears under the drop
    // down template menu. This image must always be clear of the drop-down
    // menu itself. Further to the left is fine."
    const ed = readFileSync("app/(dashboard)/diagram/[id]/DiagramEditor.tsx", "utf8");
    const panel = ed.slice(ed.indexOf('data-template-preview="large"') - 1200, ed.indexOf('data-template-preview="large"'));
    expect(panel, "measured from the same edge the menu is").toContain('style={{ right: "calc(20rem + 0.75rem)" }}');
    expect(panel, "and never painted under it").toContain("z-[60]");
    // The className itself, not the comment above it explaining what was wrong.
    const cls = panel.slice(panel.lastIndexOf("className=")).split("\n")[0];
    expect(cls, "not merely beside the wrapper — the menu reaches past that").not.toContain("right-full");
    // The menu it must clear is 20rem wide.
    expect(ed).toContain("absolute right-0 top-full mt-1 w-80");
  });
});
