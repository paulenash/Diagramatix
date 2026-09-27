/**
 * Paul's test-diagram session, 2026-09-27 (…voice-debug-2026-09-27.dgx-voice.json):
 *   1. "move finance team's top boundary up" — couldn't find "finance team":
 *      the boundary command took pools only. "Move <lane_name> {top, bottom}
 *      boundary/divider {up, down}".
 *   2. "Move everything from selected, in <lane_name>, {<n> steps, <m>
 *      pixels} to the {right, left}. Never allow overlaps if it can't be done.
 *      Assume the lane or pool from the selected element's parent."
 */
import { describe, it, expect } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { fixtureDiagram } from "@/app/lib/assist/commandFixture";
import { scoreApply } from "@/app/lib/assist/applyScore";
import { laneEdgePlan } from "@/app/lib/diagram/laneBoundary";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

function on(d: DiagramData = fixtureDiagram()) {
  const h = headlessDiagram(d);
  const say = (text: string, selectedIds: string[] = []) => applyAssistOps(parseCommand(text)!, h.context({ selectedIds }));
  const el = (id: string) => h.data.elements.find((e) => e.id === id)!;
  return { h, say, el };
}
const parents = (d: DiagramData) => Object.fromEntries(d.elements.map((e) => [e.id, e.parentId]));
const flow = (d: DiagramData) => d.elements.filter((e) => !["pool", "lane", "sublane"].includes(e.type));

describe("T4945 — a lane's top or bottom boundary is its divider (Paul, 2026-09-27)", () => {
  it("parses a lane's boundary, divider included — and Paul's own sentence", () => {
    expect(parseCommand("move finance team's top boundary up")).toEqual([{ op: "movePoolBoundary", ref: "finance team", boundary: "top", direction: "up" }]);
    expect(parseCommand("move the Underwriters lane bottom divider down by 40"))
      .toEqual([{ op: "movePoolBoundary", ref: "Underwriters", boundary: "bottom", direction: "down", distance: 40 }]);
    expect(parseCommand("move lane divider up")).toEqual([{ op: "movePoolBoundary", ref: "the lane", boundary: "top", direction: "up" }]);
    // The pool form is unchanged.
    expect(parseCommand("move the pool left boundary right")).toEqual([{ op: "movePoolBoundary", boundary: "left", direction: "right" }]);
  });

  it("which line it is: the shared divider, the enclosing band's at the end of a stack, the pool's edge at the very end", () => {
    const els = fixtureDiagram().elements;
    const E = (id: string) => els.find((e) => e.id === id)!;
    expect(laneEdgePlan(els, E("L2"), "top")).toEqual({ divider: { aboveId: "L1", belowId: "L2" } });
    expect(laneEdgePlan(els, E("L2"), "bottom")).toEqual({ divider: { aboveId: "L2", belowId: "L3" } });
    expect(laneEdgePlan(els, E("L1"), "top")).toEqual({ poolEdge: { poolId: "p", boundary: "top" } });
    expect(laneEdgePlan(els, E("L3"), "bottom")).toEqual({ poolEdge: { poolId: "p", boundary: "bottom" } });
    const sub = [...els, { id: "S1", type: "lane", label: "Sub A", x: 72, y: E("L2").y, width: 500, height: E("L2").height / 2, parentId: "L2", properties: {} },
      { id: "S2", type: "lane", label: "Sub B", x: 72, y: E("L2").y + E("L2").height / 2, width: 500, height: E("L2").height / 2, parentId: "L2", properties: {} }] as DiagramElement[];
    expect(laneEdgePlan(sub, sub.find((e) => e.id === "S2")!, "bottom"), "the last sub-lane's bottom is its lane's").toEqual({ divider: { aboveId: "L2", belowId: "L3" } });
    expect(laneEdgePlan(sub, sub.find((e) => e.id === "S1")!, "bottom")).toEqual({ divider: { aboveId: "S1", belowId: "S2" } });
  });

  it("moves the divider: the lane grows, its neighbour gives way, the pool keeps its size, nothing changes lane", () => {
    const s = on();
    const before = structuredClone(s.h.data);
    const L = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!;
    const r = s.say("move Underwriters top boundary up");
    expect(r).toEqual({ ok: true, summary: "moved Underwriters's top boundary up 20px" });
    expect(s.el("L2").y).toBe(L(before, "L2").y - 20);
    expect(s.el("L2").height).toBe(L(before, "L2").height + 20);
    expect(s.el("L1").height).toBe(L(before, "L1").height - 20);
    expect(s.el("p").height).toBe(L(before, "p").height);
    expect(parents(s.h.data)).toEqual(parents(before));
  });

  it("never runs the divider through anything — refused, naming what is in the way", () => {
    const s = on();
    const before = structuredClone(s.h.data);
    const r = s.say("move Underwriters top boundary up by 200");
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/^the divider would run through “.+ — move (?:it|them) first, or say a smaller move$/);
    expect(s.h.data).toEqual(before);
  });

  it("the top lane's top and the bottom lane's bottom are the pool's edges; a lane has no left or right of its own", () => {
    const s = on();
    const h0 = s.el("p").height;
    const r = s.say("move Lane 2 bottom boundary down by 40");
    expect(r.ok, r.summary).toBe(true);
    expect(r.summary).toBe("moved Claims Processing's bottom boundary down 40px");
    expect(s.el("p").height).toBeCloseTo(h0 + 40, 6);
    expect(s.say("move Underwriters left boundary right")).toEqual({ ok: false, summary: "Underwriters's left edge is its pool's — say “move <pool> left boundary right”" });
  });

  it("L4 judges it — the edge moved the right way, and nothing changed lane", () => {
    for (const said of ["move Underwriters top boundary up", "move the Underwriters lane bottom divider up by 20", "move Lane 2 bottom boundary down by 40"]) {
      const v = scoreApply(parseCommand(said)!, fixtureDiagram());
      expect(v.ok, `${said}: ${v.detail} / ${v.summary}`).toBe(true);
    }
  });
});

describe("T4946 — move everything from a step on, in its lane or pool (Paul, 2026-09-27)", () => {
  it("parses: from / after / “and everything after it”, the lane optional, commas and all", () => {
    expect(parseCommand("move everything from selected in Finance Team two steps to the right"))
      .toEqual([{ op: "moveContents", fromRef: "selected", ref: "Finance Team", direction: "right", steps: 2 }]);
    expect(parseCommand("move everything from selected, in Finance Team, two steps to the right"))
      .toEqual([{ op: "moveContents", fromRef: "selected", ref: "Finance Team", direction: "right", steps: 2 }]);
    expect(parseCommand("move everything after Check Claim 50 pixels to the left"))
      .toEqual([{ op: "moveContents", fromRef: "Check Claim", direction: "left", pixels: 50 }]);
    expect(parseCommand("move the selected task and everything after it one step right"))
      .toEqual([{ op: "moveContents", fromRef: "the selected task", direction: "right", steps: 1 }]);
    // "everything in" is still the whole lane.
    expect(parseCommand("move everything in Underwriters one step to the right")?.[0]).toEqual({ op: "moveContents", ref: "Underwriters", direction: "right", steps: 1 });
  });

  it("the selected step and everything after it in ITS lane move; what is before it, and the other lanes, stay", () => {
    const s = on();
    const before = structuredClone(s.h.data);
    const r = s.say("move everything from selected two steps to the right", ["t5"]);
    expect(r).toEqual({ ok: true, summary: "moved Task 2 and everything after it in Underwriters right 200px" });
    const t5x = before.elements.find((e) => e.id === "t5")!.x;
    for (const e of flow(before)) {
      const inL2 = e.parentId === "L2" && !e.boundaryHostId;
      const moves = inL2 && e.x + e.width / 2 >= t5x;
      expect(s.el(e.id).x, `${e.id} ${moves ? "moves" : "stays"}`).toBe(e.x + (moves ? 200 : 0));
    }
  });

  it("never overlaps: left is refused with the exact room, and that room then fits", () => {
    const s = on();
    const before = structuredClone(s.h.data);
    const r = s.say("move everything from selected one step to the left", ["t5"]);
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/^only \d+px of room on the left of Task 2 — say a smaller move$/);
    expect(s.h.data).toEqual(before);
    const room = Number(r.summary.match(/(\d+)px/)![1]);
    expect(s.say(`move everything from selected ${room} pixels to the left`, ["t5"]).ok).toBe(true);
    const t4 = s.el("t4"), t5 = s.el("t5");
    expect(t5.x - (t4.x + t4.width), "still clear of Task 1").toBeGreaterThan(0);
  });

  it("a named pool widens it to every lane; a selected lane means all of it; nothing selected is said", () => {
    const s = on();
    const before = structuredClone(s.h.data);
    const t5x = before.elements.find((e) => e.id === "t5")!.x;
    expect(s.say("move everything from selected in Claims Processing one step to the right", ["t5"]).ok).toBe(true);
    for (const e of flow(before).filter((x) => !x.boundaryHostId && ["L1", "L2", "L3"].includes(x.parentId ?? ""))) {
      const moves = e.x + e.width / 2 >= t5x;
      expect(s.el(e.id).x, e.id).toBe(e.x + (moves ? 100 : 0));
    }
    const t = on();
    expect(t.say("move everything from selected one step to the right", ["L2"]).summary).toBe("moved everything in Underwriters right 100px");
    expect(on().say("move everything from selected one step to the right")).toEqual({ ok: false, summary: "nothing is selected" });
  });

  it("L4 judges it — what the planner says moved by the amount, the rest stayed, nothing overlaps", () => {
    for (const [said, sel] of [
      ["move everything from selected two steps to the right", ["t5"]],
      ["move everything after Check Claim one step to the right", []],
      ["move everything from selected in Claims Processing one step to the right", ["t5"]],
    ] as const) {
      const v = scoreApply(parseCommand(said)!, fixtureDiagram(), [...sel]);
      expect(v.ok, `${said}: ${v.detail} / ${v.summary}`).toBe(true);
    }
  });
});
