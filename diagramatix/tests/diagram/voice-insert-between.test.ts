/**
 * "Insert C between A and B" (Paul, 2026-09-27): "I want it to be inserted into
 * the connector from Task A, if there is room, if not, it should move
 * everything in Task A's Pool or Lane to the right, and then insert it into the
 * existing connector from Task A to Task B. If there is no existing connector
 * between Task A and Task B then insert the new task and connect Task A to Task
 * C, and Task C to Task B."
 */
import { describe, it, expect } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { fixtureDiagram } from "@/app/lib/assist/commandFixture";
import { scoreApply } from "@/app/lib/assist/applyScore";
import { planInsertBetween, INSERT_GAP } from "@/app/lib/diagram/insertBetween";
import { reducer } from "@/app/hooks/useDiagram";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

function on(d: DiagramData = fixtureDiagram()) {
  const h = headlessDiagram(d);
  const say = (text: string) => applyAssistOps(parseCommand(text)!, h.context());
  const el = (id: string) => h.data.elements.find((e) => e.id === id)!;
  const byName = (label: string) => h.data.elements.find((e) => (e.label ?? "").replace(/\s+/g, " ").trim() === label)!;
  const flows = (s: string, t: string) => h.data.connectors.filter((c) => c.type === "sequence" && c.sourceId === s && c.targetId === t);
  return { h, say, el, byName, flows };
}
const overlapping = (d: DiagramData, c: DiagramElement) => d.elements.filter((e) => e.id !== c.id
  && !["pool", "lane", "sublane", "subprocess-expanded"].includes(e.type) && !e.boundaryHostId
  && e.x < c.x + c.width && e.x + e.width > c.x && e.y < c.y + c.height && e.y + e.height > c.y);

describe("T4941 — “insert C between A and B” (Paul, 2026-09-27)", () => {
  it("parses every way it is said — and the name may come before or after", () => {
    const want = { op: "insertBetween", symbolType: "task", label: "Assess Risk", afterRef: "Review Claim", beforeRef: "Check Claim" };
    expect(parseCommand("insert a task called Assess Risk between Review Claim and Check Claim")).toEqual([want]);
    expect(parseCommand("add a task between Review Claim and Check Claim called Assess Risk")).toEqual([want]);
    expect(parseCommand("insert task C between Task 1 and Task 2")).toEqual([{ op: "insertBetween", symbolType: "task", label: "C", afterRef: "Task 1", beforeRef: "Task 2" }]);
    expect(parseCommand("insert Verify between Review Claim and Check Claim")).toEqual([{ op: "insertBetween", symbolType: "task", label: "Verify", afterRef: "Review Claim", beforeRef: "Check Claim" }]);
    expect(parseCommand("insert a parallel gateway between Check Stock and Pick Items"))
      .toEqual([{ op: "insertBetween", symbolType: "gateway", gatewayType: "parallel", afterRef: "Check Stock", beforeRef: "Pick Items" }]);
    expect(parseCommand("add a subprocess called Investigate between Subprocess 3 and Check Coverage")?.[0])
      .toMatchObject({ op: "insertBetween", label: "Investigate", afterRef: "Subprocess 3", beforeRef: "Check Coverage" });
    // Nothing to insert is still nothing.
    expect(parseCommand("add between A and B")).toBeNull();
  });

  it("with room, it goes into the flow in line after A and nothing moves", () => {
    const s = on();
    const cov = { ...s.byName("Check Coverage") };
    const r = s.say("insert a task called Assess Risk between Subprocess 3 and Check Coverage");
    expect(r).toEqual({ ok: true, summary: "inserted Assess Risk between Subprocess 3 and Check Coverage" });
    const c = s.byName("Assess Risk");
    const sub = s.el("sub3");
    expect(c.x).toBe(sub.x + sub.width + INSERT_GAP);
    expect(c.y + c.height / 2).toBe(sub.y + sub.height / 2);
    expect(s.byName("Check Coverage").x).toBe(cov.x);
    // The connector from A now ends at C; C → B is new; no A → B is left.
    expect(s.h.data.connectors.find((k) => k.id === "gyzky2y6")!.targetId).toBe(c.id);
    expect(s.flows(c.id, cov.id)).toHaveLength(1);
    expect(s.flows("sub3", cov.id)).toEqual([]);
    expect(c.parentId).toBe("L2");
  });

  it("with no room, everything after A in A's POOL moves right just enough — the other pools widen, nothing else moves", () => {
    const s = on();
    const before = structuredClone(s.h.data);
    const review = s.el("t1");
    const r = s.say("insert a task called Assess Risk between Review Claim and Check Claim");
    expect(r.ok, r.summary).toBe(true);
    expect(r.summary).toMatch(/^inserted Assess Risk between Review Claim and Check Claim — moved everything after Review Claim in Claims Processing \d+px right to make room$/);
    const dx = Number(r.summary.match(/(\d+)px/)![1]);
    const c = s.byName("Assess Risk");
    expect(overlapping(s.h.data, c), "C sits on nothing").toEqual([]);
    const check = s.el("95k4p9hz");
    expect(check.x - (c.x + c.width), "the standard gap to B").toBeGreaterThanOrEqual(INSERT_GAP);
    for (const e0 of before.elements) {
      const e1 = s.el(e0.id);
      if (["pool", "lane"].includes(e0.type)) {
        expect(e1.width, `${e0.id} widens with the line`).toBe(e0.width + dx);
        expect(e1.x).toBe(e0.x);
        continue;
      }
      const host = e0.boundaryHostId ? before.elements.find((x) => x.id === e0.boundaryHostId)! : e0;
      const right = host.x + host.width / 2 > review.x + review.width;
      expect(e1.x, `${e0.id} ${right ? "moves" : "stays"}`).toBe(e0.x + (right ? dx : 0));
      expect(e1.y).toBe(e0.y);
    }
    expect(s.flows("t1", c.id)).toHaveLength(1);
    expect(s.flows(c.id, "95k4p9hz")).toHaveLength(1);
    expect(s.flows("t1", "95k4p9hz")).toEqual([]);
  });

  it("the flow's label stays on the leg out of A — a gateway's “No” still leaves the gateway", () => {
    const s = on();
    expect(s.say("insert a task called Log Failure between Pass Claim Check? and Draft Documentation").ok).toBe(true);
    const c = s.byName("Log Failure");
    const no = s.h.data.connectors.find((k) => k.id === "f0bq6vce")!;
    expect([no.sourceId, no.targetId, no.label]).toEqual(["g2", c.id, "No"]);
    expect(s.flows(c.id, "17qw4i2b")[0].label ?? "").toBe("");
  });

  it("two steps that were not connected are joined through it: A → C → B", () => {
    const s = on();
    const r = s.say("insert a task called Bridge between Task 1 and Check Coverage");
    // In line after Task 1, by the same rule — Task 2 was in the way, so room was made.
    expect(r.summary).toMatch(/^inserted Bridge between Task 1 and Check Coverage — they weren’t connected, so it now joins them — moved everything after Task 1 in Claims Processing \d+px right to make room$/);
    const c = s.byName("Bridge");
    expect(overlapping(s.h.data, c)).toEqual([]);
    expect(s.flows("t4", c.id)).toHaveLength(1);
    expect(s.flows(c.id, "kkc0tsyc")).toHaveLength(1);
    // Task 1's own flow on to Task 2 is untouched.
    expect(s.flows("t4", "t5")).toHaveLength(1);
  });

  it("a name with “and” in it is found: every split is tried", () => {
    const d = fixtureDiagram();
    d.elements.find((e) => e.id === "t4")!.label = "Review and Approve";
    const s = on(d);
    const r = s.say("insert a task called Check between Review and Approve and Task 2");
    expect(r.ok, r.summary).toBe(true);
    const c = s.byName("Check");
    expect(s.flows("t4", c.id)).toHaveLength(1);
    expect(s.flows(c.id, "t5")).toHaveLength(1);
  });

  it("an illegal flow is refused before anything changes", () => {
    const s = on();
    const before = structuredClone(s.h.data);
    const r = s.say("insert a task called Late between Claim Closed and Pay Claim");
    expect(r.ok).toBe(false);
    expect(r.summary).toBe("can't insert after Claim Closed — a sequence flow from it isn’t legal");
    expect(s.h.data).toEqual(before);
    const r2 = s.say("insert an end event called Stop between Review Claim and Check Claim");
    expect(r2.summary).toMatch(/^can't insert a end event before Check Claim/);
  });

  it("L4 judges it: the new step, both legs, no A → B, and it sits on nothing", () => {
    for (const said of [
      "insert a task called Assess Risk between Review Claim and Check Claim",
      "insert task C between Task 1 and Task 2",
      "insert a task called Assess Risk between Subprocess 3 and Check Coverage",
    ]) {
      const v = scoreApply(parseCommand(said)!, fixtureDiagram());
      expect(v.ok, `${said}: ${v.detail} / ${v.summary}`).toBe(true);
    }
  });

  it("the plan: B ahead of A goes in line (on B's row when the flow leaves A's top or bottom); otherwise near the middle, nothing moved", () => {
    const d = fixtureDiagram();
    const E = (id: string) => d.elements.find((e) => e.id === id)!;
    const inline = planInsertBetween(d.elements, E("sub3"), E("kkc0tsyc"), "right", 102, 64);
    expect(inline.shift).toBeUndefined();
    const tight = planInsertBetween(d.elements, E("t1"), E("95k4p9hz"), "right", 102, 64);
    expect(tight.shift).toMatchObject({ markerX: E("t1").x + E("t1").width, scopeId: "p" });
    const behind = planInsertBetween(d.elements, E("p5fku96e"), E("17qw4i2b"), "top", 102, 64);
    expect(behind.shift).toBeUndefined();
  });
});

describe("T4942 — Insert Space, scoped to one pool (INSERT_SPACE scopeId)", () => {
  it("only the scope's contents move; a pool or lane the line crosses grows; the unscoped tool is unchanged", () => {
    const d = fixtureDiagram();
    const markerX = 700;
    const scoped = reducer(d, { type: "INSERT_SPACE", payload: { markerX, markerY: 0, dx: 50, dy: 0, scopeId: "p" } });
    const plain = reducer(d, { type: "INSERT_SPACE", payload: { markerX, markerY: 0, dx: 50, dy: 0 } });
    const at = (x: DiagramData, id: string) => x.elements.find((e) => e.id === id)!;
    // In the pool, right of the line: moved. Left of it: not.
    expect(at(scoped, "17qw4i2b").x).toBe(at(d, "17qw4i2b").x + 50);
    expect(at(scoped, "t4").x).toBe(at(d, "t4").x);
    // The black-box pools the line crosses widen by the same amount, in both.
    for (const id of ["cust", "sys", "p", "L1", "L2", "L3"]) {
      expect(at(scoped, id).width, id).toBe(at(d, id).width + 50);
      expect(at(plain, id).width, id).toBe(at(d, id).width + 50);
    }
    // A second white-box pool's contents are outside the scope and stay put.
    const two: DiagramData = structuredClone(d);
    two.elements.push(
      { id: "q", type: "pool", label: "Other", x: 0, y: 1200, width: 1600, height: 200, properties: { poolType: "white-box" } } as unknown as DiagramElement,
      { id: "qt", type: "task", label: "Far", x: 900, y: 1260, width: 102, height: 64, parentId: "q", properties: {} } as unknown as DiagramElement,
    );
    const s2 = reducer(two, { type: "INSERT_SPACE", payload: { markerX, markerY: 0, dx: 50, dy: 0, scopeId: "p" } });
    expect(at(s2, "qt").x).toBe(900);
    expect(at(s2, "q").width).toBe(1650);
    expect(at(reducer(two, { type: "INSERT_SPACE", payload: { markerX, markerY: 0, dx: 50, dy: 0 } }), "qt").x).toBe(950);
  });
});
