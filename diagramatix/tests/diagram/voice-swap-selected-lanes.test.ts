/**
 * T5228 — "swap" with two selected lanes (Paul, 2026-10-04): no names needed; adjacent lanes in the same pool only.
 * T5229 — a lone "pixels" after a number that already ran is accepted.
 * T5230 — moving a pool's boundary moves the pools above / below with the edge that moved (poolNeighbours.ts).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { isIncompleteCommand } from "@/app/lib/assist/incompleteCommand";
import { twoLanesSelected } from "@/app/lib/assist/laneSwapSelection";
import { isLonePixelWord } from "@/app/lib/assist/loneUnit";
import { shiftNeighbourPools } from "@/app/lib/diagram/poolNeighbours";
import { reducer } from "@/app/hooks/useDiagram";
import { EMPTY_DIAGRAM, type DiagramData, type DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, x: number, y: number, w: number, h: number, label = "", parentId?: string, props: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label, properties: type === "pool" ? { poolType: "white-box", ...props } : props, ...(parentId ? { parentId } : {}) }) as DiagramElement;

/** One pool, three lanes (Intake / Review / Finance), a task in each; a second pool beside them for the "different pool" case. */
function lanes(): DiagramData {
  return {
    ...EMPTY_DIAGRAM,
    elements: [
      el("P", "pool", 0, 0, 1000, 450, "Claims"),
      el("L1", "lane", 36, 0, 964, 150, "Intake", "P"), el("t1", "task", 200, 40, 102, 65, "Register", "L1"),
      el("L2", "lane", 36, 150, 964, 150, "Review", "P"), el("t2", "task", 200, 190, 102, 65, "Check", "L2"),
      el("L3", "lane", 36, 300, 964, 150, "Finance", "P"), el("t3", "task", 200, 340, 102, 65, "Pay", "L3"),
      el("Q", "pool", 0, 500, 1000, 200, "Other"),
      el("Q1", "lane", 36, 500, 964, 200, "Other lane", "Q"),
    ],
    connectors: [],
  };
}
const laneOrder = (d: DiagramData, pool: string) => d.elements.filter((e) => e.type === "lane" && e.parentId === pool).sort((a, b) => a.y - b.y).map((e) => e.id);

describe("T5228 swap two selected lanes", () => {
  it("the words, with no names, parse to a swap of the selection", () => {
    for (const s of ["swap", "Swap lanes.", "swap the selected lanes", "swap these two lanes", "swap the two lanes", "swap lines"]) expect(parseCommand(s), s).toEqual([{ op: "swapLanes" }]);
  });
  it("named swaps and pool swaps still parse as before", () => {
    expect(parseCommand("swap Intake with Review")).toEqual([{ op: "swapLanes", laneA: "Intake", laneB: "Review" }]);
    expect(parseCommand("swap the selected pools")).toEqual([{ op: "swapPools" }]);
  });
  it("two adjacent selected lanes swap — contents with them", () => {
    const h = headlessDiagram(lanes());
    const r = applyAssistOps(parseCommand("swap lanes")!, h.context({ selectedIds: ["L1", "L2"] }));
    expect(r.ok, r.summary).toBe(true);
    expect(laneOrder(h.data, "P")).toEqual(["L2", "L1", "L3"]);
    expect(h.data.elements.find((e) => e.id === "t2")!.y).toBeLessThan(h.data.elements.find((e) => e.id === "t1")!.y);
  });
  it("the same with just “swap”, whichever order they were selected in", () => {
    const h = headlessDiagram(lanes());
    const r = applyAssistOps(parseCommand("swap")!, h.context({ selectedIds: ["L3", "L2"] }));
    expect(r.ok, r.summary).toBe(true);
    expect(laneOrder(h.data, "P")).toEqual(["L1", "L3", "L2"]);
  });
  it("lanes that are not next to each other, or not in the same pool, or not two, are refused with a reason", () => {
    const apart = headlessDiagram(lanes());
    const r1 = applyAssistOps(parseCommand("swap lanes")!, apart.context({ selectedIds: ["L1", "L3"] }));
    expect(r1.ok).toBe(false); expect(r1.summary).toMatch(/next to each other/);
    expect(laneOrder(apart.data, "P")).toEqual(["L1", "L2", "L3"]);
    const cross = headlessDiagram(lanes());
    const r2 = applyAssistOps(parseCommand("swap lanes")!, cross.context({ selectedIds: ["L1", "Q1"] }));
    expect(r2.ok).toBe(false); expect(r2.summary).toMatch(/same pool/);
    const one = headlessDiagram(lanes());
    const r3 = applyAssistOps(parseCommand("swap lanes")!, one.context({ selectedIds: ["L1"] }));
    expect(r3.ok).toBe(false); expect(r3.summary).toMatch(/exactly two|select the two/);
    const none = headlessDiagram(lanes());
    const r4 = applyAssistOps(parseCommand("swap lanes")!, none.context({ selectedIds: [] }));
    expect(r4.ok).toBe(false); expect(r4.summary).toMatch(/select the two lanes/);
  });
  it("two selected POOLS swap too (bare “swap”)", () => {
    const h = headlessDiagram(lanes());
    const r = applyAssistOps(parseCommand("swap")!, h.context({ selectedIds: ["P", "Q"] }));
    expect(r.ok, r.summary).toBe(true);
  });
  it("bare “swap” / “swap lanes” waits for names — unless two lanes of one pool are selected", () => {
    expect(isIncompleteCommand("swap")).toBe(true);
    expect(isIncompleteCommand("swap lanes")).toBe(true);
    expect(isIncompleteCommand("swap", { twoLanesSelected: true })).toBe(false);
    expect(isIncompleteCommand("swap lanes", { twoLanesSelected: true })).toBe(false);
    expect(isIncompleteCommand("swap the selected lanes", { twoLanesSelected: true })).toBe(false);
    const d = lanes();
    expect(twoLanesSelected(d.elements, ["L1", "L2"])).toBe(true);
    expect(twoLanesSelected(d.elements, ["L1", "Q1"])).toBe(false);                            // different pools
    expect(twoLanesSelected(d.elements, ["L1"])).toBe(false);
    expect(twoLanesSelected(d.elements, ["L1", "t1"])).toBe(false);
  });
  it("the session passes the selection to the hold", () => {
    const src = readFileSync("app/hooks/useVoiceSession.ts", "utf8");
    expect(src).toContain("isIncompleteCommand(cmd, { twoLanesSelected: twoLanesSelected(host.elementsRef.current, host.selectedIdsRef.current) })");
  });
});

describe("T5229 a lone “pixels” after a number that already ran", () => {
  it("only the pixel words are accepted on their own", () => {
    for (const s of ["pixels", "Pixels.", "pixel", "px", "pix"]) expect(isLonePixelWord(s), s).toBe(true);
    for (const s of ["steps", "tasks", "pixels up", "100 pixels", "move pixels", ""]) expect(isLonePixelWord(s), s).toBe(false);
  });
  it("“up 100 pixels” itself parses the same as “up 100”", () => {
    expect(parseCommand("move selected pool's bottom boundary up 100 pixels")).toEqual(parseCommand("move selected pool's bottom boundary up 100"));
  });
  it("the session accepts the straggler instead of sending it to the AI", () => {
    const src = readFileSync("app/hooks/useVoiceSession.ts", "utf8");
    expect(src).toContain("if (isLonePixelWord(heard))");
  });
});

describe("T5230 a pool boundary move takes the pools above / below with it", () => {
  const stack = (): DiagramData => ({
    ...EMPTY_DIAGRAM,
    elements: [
      el("top", "pool", 0, 0, 1000, 100, "Top", undefined, { poolType: "black-box" }), el("topNote", "text-annotation", 50, 10, 100, 50, "n", "top"),
      el("mid", "pool", 0, 140, 1000, 400, "Mid"), el("ml", "lane", 36, 140, 964, 400, "Lane", "mid"), el("mt", "task", 300, 300, 102, 65, "T", "ml"),
      el("bot", "pool", 0, 580, 1000, 200, "Bot"), el("bl", "lane", 36, 580, 964, 200, "Lane B", "bot"), el("bt", "task", 300, 640, 102, 65, "B", "bl"),
    ],
    connectors: [],
  });
  const g = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!;

  it("the helper: shrink the bottom by 100 and the pool below comes up 100, with its contents; the pool above stays", () => {
    const out = shiftNeighbourPools(stack().elements, "mid", { y: 140, height: 400 }, { y: 140, height: 300 });
    const d = { ...stack(), elements: out };
    expect(g(d, "bot").y).toBe(480); expect(g(d, "bl").y).toBe(480); expect(g(d, "bt").y).toBe(540);
    expect(g(d, "top").y).toBe(0); expect(g(d, "topNote").y).toBe(10);
  });
  it("the helper: the top edge moving down 60 takes the pool above down 60; the pool below stays", () => {
    const out = shiftNeighbourPools(stack().elements, "mid", { y: 140, height: 400 }, { y: 200, height: 340 });
    const d = { ...stack(), elements: out };
    expect(g(d, "top").y).toBe(60); expect(g(d, "topNote").y).toBe(70);
    expect(g(d, "bot").y).toBe(580);
  });
  it("the real RESIZE_ELEMENT (the mouse's path, and the voice command's): the bottom boundary up 100 brings the pool below up", () => {
    const before = stack();
    const after = reducer(before, { type: "RESIZE_ELEMENT", payload: { id: "mid", x: 0, y: 140, width: 1000, height: 300, wasWhiteBoxAtResizeStart: true } } as never);
    const m = g(after, "mid");
    const dBottom = (m.y + m.height) - 540;
    expect(dBottom).toBeLessThan(0);
    expect(g(after, "bot").y).toBe(580 + dBottom);
    expect(g(after, "bt").y).toBe(640 + dBottom);
    expect(g(after, "bot").y - (m.y + m.height)).toBe(40);       // the gap is kept
    expect(g(after, "top").y).toBe(0);
  });
  it("by voice: “move the pool's bottom boundary up 100”", () => {
    const h = headlessDiagram(stack());
    const r = applyAssistOps(parseCommand("move Mid bottom boundary up 100 pixels")!, h.context({ selectedIds: [] }));
    expect(r.ok, r.summary).toBe(true);
    const m = h.data.elements.find((e) => e.id === "mid")!;
    expect(h.data.elements.find((e) => e.id === "bot")!.y - (m.y + m.height)).toBe(40);
  });
});
