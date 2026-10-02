/**
 * T5221 — making room for an element added inside an expanded subprocess (Paul's debug capture, 2026-10-02: "when the target
 * EP has to be grown vertically … if there is another EP next to it, this EP also grows"; then: "growing downwards needs to
 * only affect elements underneath, but lane dividers, pool boundaries and pools all need to move down").
 *
 *   • the target EP and everything above it (its lane, its pool) grow;
 *   • an EP the growth line merely passes through — beside the target — is left exactly as it is, with everything in it;
 *   • going DOWN, only what is UNDER the target (its columns) moves, plus every lane divider, pool boundary and pool below,
 *     with whatever is in those lanes and pools;
 *   • going SIDEWAYS, everything to the right moves right, but an EP the line merely passes through (above or below, in
 *     another lane) is left alone.
 */
import { describe, expect, it } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { sizeOf } from "@/app/lib/diagram/assistPlacement";
import { EMPTY_DIAGRAM, type DiagramData, type DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, x: number, y: number, w: number, h: number, label = "", parentId?: string, extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label, properties: type === "pool" ? { poolType: "white-box" } : {}, ...(parentId ? { parentId } : {}), ...extra }) as DiagramElement;

const TASK = sizeOf("task");
const EV = sizeOf("start-event").w;

/**
 * Pool P (lanes L1 / L2 / L3) with a black-box pool below it.
 * L2 holds the TARGET EP "T" (x 100–400, y 250–400, with a flow in it), a NEIGHBOUR EP "N" beside it (x 450–950, y 230–480, so
 * the horizontal line at T's bottom edge passes through it) with a task inside it below that line, a task BESIDE T and below
 * the line, and a task UNDER T. L1 holds an EP "Above" (x 250–550) that the VERTICAL line at T's right edge passes through,
 * and a task far to the right. L3 holds tasks under T and far to the right.
 */
function world(): DiagramData {
  const row = 325;
  return {
    ...EMPTY_DIAGRAM,
    elements: [
      el("P", "pool", 0, 0, 2000, 900, "Claims"),
      el("L1", "lane", 36, 0, 1964, 200, "Intake", "P"),
      el("L2", "lane", 36, 200, 1964, 400, "Underwriting", "P"),
      el("L3", "lane", 36, 600, 1964, 300, "Finance", "P"),
      el("T", "subprocess-expanded", 100, 250, 300, 150, "Target", "L2"),
      el("ts", "start-event", 124, row - EV / 2, EV, EV, "", "T"), el("tk", "task", 190, row - TASK.h / 2, TASK.w, TASK.h, "Check", "T"), el("te", "end-event", 322, row - EV / 2, EV, EV, "", "T"),
      el("N", "subprocess-expanded", 450, 230, 500, 250, "Neighbour", "L2"),
      el("inN", "task", 600, 400, TASK.w, TASK.h, "Inside neighbour", "N"),                       // y 400–465: inside N (230–480), below the line
      el("beside", "task", 1100, 420, TASK.w, TASK.h, "Beside, low", "L2"),
      el("under", "task", 150, 450, TASK.w, TASK.h, "Under target", "L2"),
      el("Above", "subprocess-expanded", 250, 20, 300, 150, "Above", "L1"),
      el("inAbove", "task", 400, 60, TASK.w, TASK.h, "Inside above", "Above"),                     // x 400–502: inside Above (250–550), right of the line
      el("farL1", "task", 900, 60, TASK.w, TASK.h, "Far right, top", "L1"),
      el("underL3", "task", 150, 650, TASK.w, TASK.h, "Finance under", "L3"),
      el("farL3", "task", 1700, 650, TASK.w, TASK.h, "Finance far", "L3"),
      el("cust", "pool", 0, 950, 2000, 100, "Customer", undefined, { properties: { poolType: "black-box" } }),
    ],
    connectors: [],
  };
}
const run = (sentence: string, selected: string[]) => {
  const h = headlessDiagram(world());
  const ops = parseCommand(sentence);
  expect(ops, sentence).toBeTruthy();
  const r = applyAssistOps(ops!, h.context({ selectedIds: selected }));
  return { h, r };
};
const get = (h: ReturnType<typeof headlessDiagram>, id: string) => h.data.elements.find((e) => e.id === id)!;
const base = (id: string) => world().elements.find((e) => e.id === id)!;

describe("T5221 an Event EP added to the target: growing down", () => {
  const { h, r } = run("add an event expanded subprocess called Cancel", ["T"]);
  const dy = get(h, "T").height - 150;
  const dx = get(h, "T").width - 300;

  it("worked, and the target grew down (its top stays)", () => {
    expect(r.ok, r.summary).toBe(true);
    expect(dy).toBeGreaterThan(0);
    expect(get(h, "T").y).toBe(250);
  });
  it("the NEIGHBOUR EP beside it does NOT grow or move vertically — and neither does what is inside it", () => {
    expect(get(h, "N").y).toBe(230);
    expect(get(h, "N").height).toBe(250);
    expect(get(h, "inN").y).toBe(400);
  });
  it("a task BESIDE the target (low, not under it) stays", () => {
    expect(get(h, "beside").y).toBe(420);
  });
  it("what is UNDER the target moves down by what it grew", () => {
    expect(get(h, "under").y).toBe(450 + dy);
  });
  it("the target's lane and pool grow; the lane divider, the lane below and the pools below move down", () => {
    expect(get(h, "L2").height).toBe(400 + dy);
    expect(get(h, "P").height).toBe(900 + dy);
    expect(get(h, "L3").y).toBe(600 + dy);                 // the lane divider
    expect(get(h, "cust").y).toBe(950 + dy);               // the pool below
  });
  it("everything in a lane below moves with it, wherever it is across — not only what is under the target", () => {
    expect(get(h, "underL3").y).toBe(650 + dy);
    expect(get(h, "farL3").y).toBe(650 + dy);
  });
  it("the lane above is untouched (nothing above moves)", () => {
    expect(get(h, "L1").y).toBe(0);
    expect(get(h, "L1").height).toBe(200);
    expect(get(h, "farL1").y).toBe(60);
  });

  describe("going sideways", () => {
    it("the target widens and everything to the RIGHT moves right (pool and lane edges with it)", () => {
      expect(dx).toBe(30);
      expect(get(h, "N").x).toBe(450 + dx);
      expect(get(h, "beside").x).toBe(1100 + dx);
      expect(get(h, "farL1").x).toBe(900 + dx);
      expect(get(h, "farL3").x).toBe(1700 + dx);
      expect(get(h, "P").width).toBe(2000 + dx);
      expect(get(h, "L2").width).toBe(1964 + dx);
      expect(get(h, "cust").width).toBe(2000 + dx);        // the pool below stays one width
    });
    it("the EP in ANOTHER lane that the vertical line passes through does not stretch, and nor does what is in it", () => {
      expect(get(h, "Above").width).toBe(300);
      expect(get(h, "Above").x).toBe(250);
      expect(get(h, "inAbove").x).toBe(400);
    });
  });
});

describe("T5221 an ordinary add that needs the EP taller: the same rules", () => {
  it("an EP added inside a short target: the neighbour beside it does not grow", () => {
    const d = world();
    d.elements.find((e) => e.id === "T")!.height = 80;                      // too short for an EP inside it
    d.elements = d.elements.filter((e) => !["ts", "tk", "te"].includes(e.id));
    const h = headlessDiagram(d);
    const r = applyAssistOps(parseCommand("add an expanded subprocess called Inner")!, h.context({ selectedIds: ["T"] }));
    expect(r.ok, r.summary).toBe(true);
    expect(get(h, "T").height).toBeGreaterThan(80);
    expect(get(h, "N").height).toBe(250);
    expect(get(h, "N").y).toBe(230);
    expect(get(h, "inN").y).toBe(400);
  });
});

describe("T5221 the mouse's Insert Space is unchanged", () => {
  it("it still stretches every EP its line passes through (no underId)", async () => {
    const { reducer } = await import("@/app/hooks/useDiagram");
    const next = reducer(world(), { type: "INSERT_SPACE", payload: { markerX: 0, markerY: 398, dx: 0, dy: 100 } } as never);
    expect(next.elements.find((e) => e.id === "N")!.height).toBe(350);      // cut by the line, so it grows — as the mouse always did
    expect(next.elements.find((e) => e.id === "T")!.height).toBe(250);
  });
});
