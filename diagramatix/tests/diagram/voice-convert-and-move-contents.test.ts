/**
 * Paul, 2026-09-27 — three new Voice Assist commands:
 *   a) Convert {selected, <task_name>} to a Subprocess
 *   b) Convert {selected, <subprocess_name>} to a Task
 *   c) Move everything in {<pool_name>, <lane_name>, <sublane_name>}
 *      {<n> steps, <m> pixels} to the {right, left}
 */
import { describe, it, expect } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { fixtureDiagram } from "@/app/lib/assist/commandFixture";
import { scoreApply } from "@/app/lib/assist/applyScore";
import { planMoveContents, CONTENTS_STEP_PX } from "@/app/lib/diagram/moveContents";
import type { DiagramData } from "@/app/lib/diagram/types";

function on(d: DiagramData = fixtureDiagram()) {
  const h = headlessDiagram(d);
  const say = (text: string, selectedIds: string[] = []) => applyAssistOps(parseCommand(text)!, h.context({ selectedIds }));
  const el = (id: string) => h.data.elements.find((e) => e.id === id)!;
  return { h, say, el };
}
const inLane = (d: DiagramData, lane: string) => d.elements.filter((e) => e.parentId === lane);

describe("T4943 — convert a task to a subprocess, and a subprocess to a task (Paul, 2026-09-27)", () => {
  it("parses every way it is said — and leaves the marker convert and the add alone", () => {
    expect(parseCommand("convert Review Claim to a subprocess")).toEqual([{ op: "convertActivity", ref: "Review Claim", to: "subprocess" }]);
    expect(parseCommand("convert selected to a task")).toEqual([{ op: "convertActivity", ref: "selected", to: "task" }]);
    expect(parseCommand("make this a subprocess")).toEqual([{ op: "convertActivity", ref: "this", to: "subprocess" }]);
    expect(parseCommand("turn the selected subprocess into a task")).toEqual([{ op: "convertActivity", ref: "the selected subprocess", to: "task" }]);
    expect(parseCommand("convert Review Claim to a sub process")?.[0]).toMatchObject({ op: "convertActivity", to: "subprocess" });
    expect(parseCommand("make Review Claim a user task")?.[0]).toMatchObject({ op: "convert", subtype: "user task" });
    // "make" is not an add verb (that sentence has always gone to the AI) — and it is not a shape change either.
    expect(parseCommand("make a task called Approve")?.[0]?.op).not.toBe("convertActivity");
    expect(parseCommand("add a task called Approve")?.[0]).toMatchObject({ op: "add", label: "Approve" });
  });

  it("a named task becomes a subprocess — same place, same flows", () => {
    const s = on();
    const before = { ...s.el("t1") };
    const flows = s.h.data.connectors.filter((c) => c.sourceId === "t1" || c.targetId === "t1").map((c) => c.id).sort();
    expect(s.say("convert Review Claim to a subprocess")).toEqual({ ok: true, summary: "converted Review Claim to a subprocess" });
    expect(s.el("t1")).toMatchObject({ type: "subprocess", x: before.x, y: before.y });
    expect(s.h.data.connectors.filter((c) => c.sourceId === "t1" || c.targetId === "t1").map((c) => c.id).sort()).toEqual(flows);
  });

  it("the selected subprocess becomes a task; several selected are all converted", () => {
    const s = on();
    expect(s.say("convert selected to a task", ["sub3"]).summary).toBe("converted Subprocess 3 to a task");
    expect(s.el("sub3").type).toBe("task");
    const t = on();
    expect(t.say("convert these to a subprocess", ["t4", "t5"]).summary).toBe("converted Task 1, Task 2 to a subprocess");
    expect([t.el("t4").type, t.el("t5").type]).toEqual(["subprocess", "subprocess"]);
  });

  it("what it can't do it says: already that shape, the wrong kind, nothing selected", () => {
    const s = on();
    expect(s.say("convert Review Claim to a task")).toEqual({ ok: false, summary: "Review Claim is already a task" });
    expect(s.say("convert Claim Approved? to a subprocess")).toEqual({ ok: false, summary: "Claim Approved? is a gateway — only a task becomes a subprocess" });
    expect(s.say("convert selected to a subprocess")).toEqual({ ok: false, summary: "nothing is selected" });
  });

  it("a task's marker and a subprocess's sub-diagram link do not survive the change, and the log says so", () => {
    const d = fixtureDiagram();
    d.elements.find((e) => e.id === "t1")!.taskType = "user";
    d.elements.find((e) => e.id === "sub3")!.properties = { ...d.elements.find((e) => e.id === "sub3")!.properties, linkedDiagramId: "dia-1" };
    const s = on(d);
    expect(s.say("convert Review Claim to a subprocess").summary).toBe("converted Review Claim to a subprocess — Review Claim's user marker is dropped");
    expect(s.say("convert Subprocess 3 to a task").summary).toBe("converted Subprocess 3 to a task — Subprocess 3's link to its sub-diagram is removed");
  });

  it("L4 judges it", () => {
    for (const said of ["convert Review Claim to a subprocess", "convert Subprocess 3 to a task"]) {
      const v = scoreApply(parseCommand(said)!, fixtureDiagram());
      expect(v.ok, `${said}: ${v.detail}`).toBe(true);
    }
  });
});

describe("T4944 — move everything in a pool, lane or sub-lane, n steps or m pixels, right or left (Paul, 2026-09-27)", () => {
  it("parses the amount and the direction in either order", () => {
    expect(parseCommand("move everything in Underwriters two steps to the right")).toEqual([{ op: "moveContents", ref: "Underwriters", direction: "right", steps: 2 }]);
    expect(parseCommand("move all the elements in Lane 2 50 pixels to the left")).toEqual([{ op: "moveContents", ref: "Lane 2", direction: "left", pixels: 50 }]);
    expect(parseCommand("move everything in the Underwriters lane to the right by 100 pixels")).toEqual([{ op: "moveContents", ref: "the Underwriters lane", direction: "right", pixels: 100 }]);
    expect(parseCommand("move everything in Claims Processing right")).toEqual([{ op: "moveContents", ref: "Claims Processing", direction: "right" }]);
    expect(parseCommand("shift everything inside Lane 3 left 1 step")).toEqual([{ op: "moveContents", ref: "Lane 3", direction: "left", steps: 1 }]);
    // One element still moves the way it always did.
    expect(parseCommand("move Pay Claim right")?.[0]).toMatchObject({ op: "move", ref: "Pay Claim" });
  });

  it("a lane's contents move; its lanes and the other lanes' contents do not", () => {
    const s = on();
    const before = structuredClone(s.h.data);
    const r = s.say("move everything in Underwriters two steps to the right");
    expect(r).toEqual({ ok: true, summary: "moved everything in Underwriters right 200px" });
    for (const e of inLane(before, "L2")) {
      expect(s.el(e.id).x, e.id).toBe(e.x + 200);
      expect(s.el(e.id).parentId, `${e.id} stays in its lane`).toBe("L2");
    }
    for (const e of [...inLane(before, "L1"), ...inLane(before, "L3")]) expect(s.el(e.id).x, e.id).toBe(e.x);
    for (const id of ["p", "L1", "L2", "L3", "cust", "sys"]) expect(s.el(id).width, id).toBe(before.elements.find((e) => e.id === id)!.width);
  });

  it("moving right past the pool's edge widens the pool FIRST — nothing falls out — and every pool keeps one width", () => {
    const s = on();
    const before = structuredClone(s.h.data);
    const r = s.say("move everything in Underwriters 400 pixels to the right");
    expect(r).toEqual({ ok: true, summary: "moved everything in Underwriters right 400px — the pools widened to make room" });
    for (const e of inLane(before, "L2")) expect([s.el(e.id).x, s.el(e.id).parentId], e.id).toEqual([e.x + 400, "L2"]);
    const w = s.el("p").width;
    expect(w).toBeGreaterThan(before.elements.find((e) => e.id === "p")!.width);
    expect([s.el("cust").width, s.el("sys").width]).toEqual([w, w]);
    const rightmost = Math.max(...inLane(s.h.data, "L2").map((e) => e.x + e.width));
    expect(s.el("p").x + w).toBeGreaterThanOrEqual(rightmost);
  });

  it("moving left never crosses into a header: with room it moves, without it says how far it could", () => {
    const s = on();
    expect(s.say("move everything in Underwriters 1 step to the left")).toEqual({ ok: true, summary: "moved everything in Underwriters left 100px" });
    const t = on();
    const before = structuredClone(t.h.data);
    const r = t.say("move everything in Underwriters two steps to the left");
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/^only \d+px of room on the left in Underwriters — say a smaller move$/);
    expect(t.h.data).toEqual(before);
    const room = Number(r.summary.match(/(\d+)px/)![1]);
    expect(t.say(`move everything in Underwriters ${room} pixels to the left`).ok, "exactly the room fits").toBe(true);
  });

  it("a pool's contents move across all its lanes; an empty pool, or a task, is refused", () => {
    const s = on();
    const before = structuredClone(s.h.data);
    expect(s.say("move everything in Claims Processing one step to the right").ok).toBe(true);
    for (const lane of ["L1", "L2", "L3"]) for (const e of inLane(before, lane)) expect(s.el(e.id).x, e.id).toBe(e.x + CONTENTS_STEP_PX);
    expect(s.say("move everything in Customer to the right")).toEqual({ ok: false, summary: "there is nothing in Customer to move" });
    const t = on();
    const b2 = structuredClone(t.h.data);
    expect(t.say("move everything in Review Claim to the right").ok).toBe(false);
    expect(t.h.data).toEqual(b2);
  });

  it("the plan lists each thing once — the reducer carries boundary events and subprocess contents", () => {
    const d = fixtureDiagram();
    d.elements.push({ id: "bev", type: "intermediate-event", label: "Late", x: 230, y: 530, width: 36, height: 36, parentId: "L2", boundaryHostId: "t4", properties: {} } as never);
    const plan = planMoveContents(d.elements, d.elements.find((e) => e.id === "L2")!, 100);
    expect("ids" in plan && plan.ids.includes("bev")).toBe(false);
    const s = on(d);
    expect(s.say("move everything in Underwriters one step to the right").ok).toBe(true);
    expect(s.el("bev").x, "the boundary event rode with its task").toBe(330);
  });

  it("L4 judges it — every content moved by the amount, and none fell out", () => {
    for (const said of [
      "move everything in Underwriters two steps to the right",
      "move everything in Underwriters 400 pixels to the right",
      "move everything in Lane 2 one step to the left",
      "move everything in Claims Processing one step to the right",
    ]) {
      const v = scoreApply(parseCommand(said)!, fixtureDiagram());
      expect(v.ok, `${said}: ${v.detail} / ${v.summary}`).toBe(true);
    }
  });
});
