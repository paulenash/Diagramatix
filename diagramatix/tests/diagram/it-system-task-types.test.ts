/**
 * T4541-T4543 — flipping a black-box pool's IT System flag retypes the tasks
 * that exchange messages with it, and Escape takes the pool alignment guide away.
 *
 * Paul, 2026-09-18. Two separate rules, both driven from one place so the
 * Properties panel checkbox and the right-click menu cannot disagree: the
 * retype lives in the UPDATE_PROPERTIES reducer, and the guide's
 * show/suppress rule lives in app/lib/diagram/poolGuide.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  retypeTasksForSystemFlag,
  applyTaskTypeChanges,
  isMessageFlow,
} from "@/app/lib/diagram/itSystemTaskTypes";
import { poolGuideNext, EMPTY_POOL_GUIDE, type PoolBoundaryGuide } from "@/app/lib/diagram/poolGuide";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import type { Connector, DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

const task = (id: string, taskType: string): DiagramElement =>
  ({ id, type: "task", label: id, x: 0, y: 0, width: 102, height: 65, taskType, properties: {} }) as unknown as DiagramElement;
const pool = (id: string, isSystem = false): DiagramElement =>
  ({ id, type: "pool", label: id, x: 0, y: 400, width: 900, height: 78, properties: { poolType: "black-box", isSystem } }) as unknown as DiagramElement;
const msg = (id: string, sourceId: string, targetId: string): Connector =>
  ({ id, sourceId, targetId, type: "messageBPMN" }) as unknown as Connector;
const seq = (id: string, sourceId: string, targetId: string): Connector =>
  ({ id, sourceId, targetId, type: "sequence" }) as unknown as Connector;

describe("T4541 — IT System = true turns the message tasks into User tasks", () => {
  it("retypes a Send and a Receive task that talk to the pool", () => {
    const els = [task("t1", "send"), task("t2", "receive"), pool("p1")];
    const conns = [msg("m1", "t1", "p1"), msg("m2", "p1", "t2")];
    const changes = retypeTasksForSystemFlag(els, conns, "p1", true);
    expect(changes.map((c) => [c.id, c.from, c.to])).toEqual([
      ["t1", "send", "user"],
      ["t2", "receive", "user"],
    ]);
  });

  it("leaves every other task type alone", () => {
    // The rule names Send and Receive only. A Service task talking to a system
    // is already correct, and a None task was never claiming to be a message
    // exchange.
    const els = [task("svc", "service"), task("none", "none"), task("man", "manual"), pool("p1")];
    const conns = [msg("m1", "svc", "p1"), msg("m2", "p1", "none"), msg("m3", "man", "p1")];
    expect(retypeTasksForSystemFlag(els, conns, "p1", true)).toEqual([]);
  });

  it("does nothing when the pool has no message flows", () => {
    // Paul's precondition. Without it, flagging a freshly-drawn pool would
    // reach out and retype tasks it has nothing to do with.
    const els = [task("t1", "send"), pool("p1")];
    expect(retypeTasksForSystemFlag(els, [seq("s1", "t1", "p1")], "p1", true)).toEqual([]);
    expect(retypeTasksForSystemFlag(els, [], "p1", true)).toEqual([]);
  });

  it("only touches tasks on the OTHER end of this pool's messages", () => {
    const els = [task("mine", "send"), task("theirs", "send"), pool("p1"), pool("p2")];
    const conns = [msg("m1", "mine", "p1"), msg("m2", "theirs", "p2")];
    expect(retypeTasksForSystemFlag(els, conns, "p1", true).map((c) => c.id)).toEqual(["mine"]);
  });

  it("ignores a message partner that is not a task", () => {
    // Paul's rule says "any Task". A collapsed subprocess can carry a stale
    // taskType — converting a Send task into a subprocess leaves the property
    // behind — so without the type filter it would be silently retyped.
    const sub = {
      id: "sp", type: "subprocess-collapsed", label: "Sub", x: 0, y: 0, width: 102, height: 65,
      taskType: "send", properties: {},
    } as unknown as DiagramElement;
    const els = [sub, pool("p1"), pool("p2", true)];
    const conns = [msg("m1", "sp", "p1"), msg("m2", "p2", "p1")];
    expect(retypeTasksForSystemFlag(els, conns, "p1", true), "a subprocess is not a Task").toEqual([]);
  });
});

describe("T4542 — IT System = false gives the task back to its own traffic", () => {
  it("all messages out → Send", () => {
    const els = [task("t1", "user"), pool("p1", true)];
    expect(retypeTasksForSystemFlag(els, [msg("m1", "t1", "p1")], "p1", false))
      .toEqual([{ id: "t1", from: "user", to: "send" }]);
  });

  it("all messages in → Receive", () => {
    const els = [task("t1", "user"), pool("p1", true)];
    expect(retypeTasksForSystemFlag(els, [msg("m1", "p1", "t1")], "p1", false))
      .toEqual([{ id: "t1", from: "user", to: "receive" }]);
  });

  it("a mix of in and out → None", () => {
    // Neither Send nor Receive describes a task that does both, so the rule
    // refuses to guess rather than picking one.
    const els = [task("t1", "user"), pool("p1", true)];
    const conns = [msg("m1", "t1", "p1"), msg("m2", "p1", "t1")];
    expect(retypeTasksForSystemFlag(els, conns, "p1", false))
      .toEqual([{ id: "t1", from: "user", to: "none" }]);
  });

  it("counts the task's messages with EVERY participant, not just this pool", () => {
    // The reading Paul's wording was given: a task that sends to one
    // participant and receives from another is not a Send task by any reading.
    const els = [task("t1", "user"), pool("p1", true), pool("other")];
    const conns = [msg("m1", "t1", "p1"), msg("m2", "other", "t1")];
    expect(retypeTasksForSystemFlag(els, conns, "p1", false))
      .toEqual([{ id: "t1", from: "user", to: "none" }]);
  });

  it("leaves a task that was not a User task alone", () => {
    const els = [task("svc", "service"), task("n", "none"), pool("p1", true)];
    const conns = [msg("m1", "svc", "p1"), msg("m2", "p1", "n")];
    expect(retypeTasksForSystemFlag(els, conns, "p1", false)).toEqual([]);
  });

  it("does not report a change that changes nothing", () => {
    // A User task whose only message is outbound becomes Send; run it the other
    // way and the already-Send task must not produce a no-op change.
    const els = [task("t1", "send"), pool("p1", true)];
    expect(retypeTasksForSystemFlag(els, [msg("m1", "t1", "p1")], "p1", false)).toEqual([]);
  });

  it("applies the changes and touches nothing else", () => {
    const els = [task("t1", "user"), task("t2", "service"), pool("p1", true)];
    const out = applyTaskTypeChanges(els, [{ id: "t1", from: "user", to: "send" }]);
    expect((out[0] as { taskType: string }).taskType).toBe("send");
    expect(out[1]).toBe(els[1]);
    expect(applyTaskTypeChanges(els, []), "an empty change list is identity").toBe(els);
  });

  it("recognises both spellings of a message flow", () => {
    expect(isMessageFlow(msg("m", "a", "b"))).toBe(true);
    expect(isMessageFlow({ id: "m", sourceId: "a", targetId: "b", type: "message" } as unknown as Connector)).toBe(true);
    expect(isMessageFlow(seq("s", "a", "b"))).toBe(false);
    expect(isMessageFlow({ id: "m", sourceId: "a", targetId: "b", type: "associationBPMN" } as unknown as Connector)).toBe(false);
  });

  it("is driven from the reducer, so both UIs get it", () => {
    // The right-click menu and the Properties panel both call
    // onUpdateProperties, which dispatches UPDATE_PROPERTIES; putting the rule
    // in either UI would leave the other behind. Driven for real.
    const state = {
      elements: [task("t1", "send"), task("t2", "receive"), pool("p1")],
      connectors: [msg("m1", "t1", "p1"), msg("m2", "p1", "t2")],
      viewport: { x: 0, y: 0, zoom: 1 },
    } as unknown as DiagramData;

    const on = reducer(state, { type: "UPDATE_PROPERTIES", payload: { id: "p1", properties: { isSystem: true } } } as Action);
    const typeOf = (s: DiagramData, id: string) =>
      (s.elements.find((e) => e.id === id) as unknown as { taskType?: string })?.taskType;
    expect(typeOf(on, "t1"), "Send → User").toBe("user");
    expect(typeOf(on, "t2"), "Receive → User").toBe("user");
    expect((on.elements.find((e) => e.id === "p1") as DiagramElement).properties.isSystem).toBe(true);

    const off = reducer(on, { type: "UPDATE_PROPERTIES", payload: { id: "p1", properties: { isSystem: false } } } as Action);
    expect(typeOf(off, "t1"), "its one message goes out → Send").toBe("send");
    expect(typeOf(off, "t2"), "its one message comes in → Receive").toBe("receive");
  });

  it("does not retype when some other property of the pool changes", () => {
    // Setting the Collection flag, or renaming the pool, must leave the tasks
    // where they are — the rule is about the IT System flag moving.
    const state = {
      elements: [task("t1", "send"), pool("p1")],
      connectors: [msg("m1", "t1", "p1")],
      viewport: { x: 0, y: 0, zoom: 1 },
    } as unknown as DiagramData;
    const out = reducer(state, {
      type: "UPDATE_PROPERTIES",
      payload: { id: "p1", properties: { multiplicity: "collection" } },
    } as Action);
    expect((out.elements[0] as unknown as { taskType: string }).taskType).toBe("send");
  });

  it("does not retype when the flag is re-set to the value it already had", () => {
    const state = {
      elements: [task("t1", "send"), pool("p1", true)],
      connectors: [msg("m1", "t1", "p1")],
      viewport: { x: 0, y: 0, zoom: 1 },
    } as unknown as DiagramData;
    const out = reducer(state, {
      type: "UPDATE_PROPERTIES",
      payload: { id: "p1", properties: { isSystem: true } },
    } as Action);
    expect((out.elements[0] as unknown as { taskType: string }).taskType).toBe("send");
  });
});

describe("T4543 — Escape removes the pool alignment line and its green markers", () => {
  const guide: PoolBoundaryGuide = {
    side: "right",
    currentX: 500,
    others: [{ id: "p1", x: 500, midY: 100, isMoving: true }],
  };

  it("clears what is on screen", () => {
    const shown = poolGuideNext(EMPTY_POOL_GUIDE, { type: "propose", guide });
    expect(shown.guide).toBe(guide);
    expect(poolGuideNext(shown, { type: "escape" }).guide).toBeNull();
  });

  it("stays gone for the rest of the gesture", () => {
    // The drag re-proposes the guide on every mouse-move, so clearing alone
    // would put it back on the next pixel of travel.
    const after = poolGuideNext({ guide, suppressed: false }, { type: "escape" });
    const next = poolGuideNext(after, { type: "propose", guide });
    expect(next.guide, "a mouse-move after Escape must not bring it back").toBeNull();
    expect(next.suppressed).toBe(true);
  });

  it("comes back on the next gesture", () => {
    const suppressed = poolGuideNext({ guide, suppressed: false }, { type: "escape" });
    const ended = poolGuideNext(suppressed, { type: "gestureEnd" });
    expect(ended).toEqual(EMPTY_POOL_GUIDE);
    expect(poolGuideNext(ended, { type: "propose", guide }).guide).toBe(guide);
  });

  it("is wired to the Escape key and to the end of both gestures", () => {
    const src = read("app", "components", "canvas", "Canvas.tsx");
    expect(src).toContain('dispatchPoolGuide({ type: "escape" })');
    // Two gestures raise the guide — a pool resize and a pool move — and both
    // must release the suppression when they finish. A THIRD call was added
    // 2026-09-19 (T4559): mousedown capture retires a guide stranded by a
    // gesture that ended some other way. So this is a floor, not an exact
    // count; T4559 owns the cancel itself.
    expect((src.match(/dispatchPoolGuide\(\{ type: "gestureEnd" \}\)/g) ?? []).length)
      .toBeGreaterThanOrEqual(2);
  });
});
