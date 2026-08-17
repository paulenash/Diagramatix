/**
 * BPMN sequence-flow scope rules — a sequence flow may not cross an Expanded
 * Subprocess (EP) boundary, with the edge-mounted-event exceptions:
 *   • edge Start on X: source flows INTO X; target is triggered from OUTSIDE X.
 *   • edge End on X: target is X's exit (from INSIDE X); never a source.
 *   • edge Intermediate on X: flow continues in X's own scope.
 *
 * The topology mirrors test/Templates.json (the reported repro):
 *   top-start ─▶ EP1
 *   EP1 ┌ start-in-EP1
 *       ├ EP2 ┌ start-in-EP2 ─▶ task-in-EP2 ─▶ end-in-EP2
 *       └ (EP2 ─▶ edge-End-on-EP1)          edge-End mounted on EP1's rim
 *   EP3 └ task-in-EP3
 */
import { describe, it, expect } from "vitest";
import { canConnect } from "@/app/lib/diagram/canConnect";
import type { DiagramElement } from "@/app/lib/diagram/types";

const el = (
  id: string, type: string,
  extra: Partial<DiagramElement> = {},
): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label: id, x: 0, y: 0, width: 40, height: 40, properties: {}, ...extra });

// ── the shared world (repro topology + a few extra endpoints) ──
const topStart   = el("topStart", "start-event", { eventType: "message" });
const topTask    = el("topTask", "task");
const ep1        = el("ep1", "subprocess-expanded");
const startInEp1 = el("startInEp1", "start-event", { parentId: "ep1" });
const ep2        = el("ep2", "subprocess-expanded", { parentId: "ep1" });
const startInEp2 = el("startInEp2", "start-event", { parentId: "ep2" });
const taskInEp2  = el("taskInEp2", "task", { parentId: "ep2" });
const endInEp2   = el("endInEp2", "end-event", { parentId: "ep2" });
const edgeEndEp1 = el("edgeEndEp1", "end-event", { boundaryHostId: "ep1" });
const ep3        = el("ep3", "subprocess-expanded");
const taskInEp3  = el("taskInEp3", "task", { parentId: "ep3" });
const edgeStartEp3 = el("edgeStartEp3", "start-event", { boundaryHostId: "ep3" });
const eventEp    = el("eventEp", "subprocess-expanded", { properties: { subprocessType: "event" } });
const taskInEventEp = el("taskInEventEp", "task", { parentId: "eventEp" });

const WORLD = [
  topStart, topTask, ep1, startInEp1, ep2, startInEp2, taskInEp2, endInEp2,
  edgeEndEp1, ep3, taskInEp3, edgeStartEp3, eventEp, taskInEventEp,
];

const seq = (s: DiagramElement, t: DiagramElement) => canConnect(s, t, "sequence", WORLD);

describe("sequence scope — the Templates.json repro is the oracle", () => {
  it("accepts every LEGAL connector in the repro", () => {
    expect(seq(startInEp2, taskInEp2)).toBe(true);   // inside EP2
    expect(seq(taskInEp2, endInEp2)).toBe(true);     // inside EP2
    expect(seq(ep2, edgeEndEp1)).toBe(true);         // EP2 (in EP1) → EP1's edge End
    expect(seq(topStart, ep1)).toBe(true);           // top-level start → EP1
  });
  it("REJECTS the boundary-crossing connector (the bug)", () => {
    // start inside EP1 → task inside EP3 crosses two EP boundaries.
    expect(seq(startInEp1, taskInEp3)).toBe(false);
  });
});

describe("issue #3 — start event inside an EP", () => {
  it("connects to same-scope siblings inside its EP", () => {
    expect(seq(startInEp1, ep2)).toBe(true);         // both scope = EP1
    expect(seq(startInEp2, taskInEp2)).toBe(true);   // both scope = EP2
  });
  it("cannot connect OUT of its EP", () => {
    expect(seq(startInEp2, topTask)).toBe(false);    // EP2 → top level
    expect(seq(startInEp2, taskInEp3)).toBe(false);  // EP2 → EP3
    expect(seq(startInEp1, taskInEp3)).toBe(false);  // EP1 → EP3
  });
});

describe("issue #4 — an EP as source", () => {
  it("cannot target its OWN children", () => {
    expect(seq(ep2, taskInEp2)).toBe(false);
    expect(seq(ep2, startInEp2)).toBe(false);
  });
  it("cannot target ANOTHER EP's children", () => {
    expect(seq(ep2, taskInEp3)).toBe(false);
    expect(seq(ep1, taskInEp3)).toBe(false);
  });
  it("CAN target same-scope siblings", () => {
    expect(seq(ep1, ep3)).toBe(true);                // both top-level
    expect(seq(ep3, topTask)).toBe(true);            // both top-level
    expect(seq(ep2, edgeEndEp1)).toBe(true);         // EP2 (scope EP1) → EP1 edge End
  });
});

describe("issue #2 — an edge-mounted End event", () => {
  it("is never a source", () => {
    expect(seq(edgeEndEp1, topTask)).toBe(false);
    expect(seq(edgeEndEp1, taskInEp2)).toBe(false);
    expect(seq(edgeEndEp1, ep3)).toBe(false);
  });
  it("as a target, is reachable only from INSIDE its host", () => {
    expect(seq(ep2, edgeEndEp1)).toBe(true);         // EP2 is in EP1 → OK
    expect(seq(topTask, edgeEndEp1)).toBe(false);    // outside EP1
    expect(seq(taskInEp3, edgeEndEp1)).toBe(false);  // different EP
  });
});

describe("issue #1 — an edge-mounted Start event", () => {
  it("as a source, flows INTO its host (not out)", () => {
    expect(seq(edgeStartEp3, taskInEp3)).toBe(true); // into EP3
    expect(seq(edgeStartEp3, topTask)).toBe(false);  // not into EP3
    expect(seq(edgeStartEp3, taskInEp2)).toBe(false);
  });
  it("as a target, is triggered only from OUTSIDE its host", () => {
    expect(seq(topTask, edgeStartEp3)).toBe(true);   // external trigger (top-level → EP3's edge Start)
    expect(seq(taskInEp3, edgeStartEp3)).toBe(false); // from inside EP3 = illegal
  });
});

describe("baseline non-boundary + event-EP rules still hold", () => {
  it("no sequence TO a non-boundary start, none FROM a non-boundary end", () => {
    expect(seq(topTask, topStart)).toBe(false);      // → non-boundary start
    expect(seq(endInEp2, taskInEp2)).toBe(false);    // non-boundary end →
  });
  it("an Event Expanded Subprocess is never sequence-wired", () => {
    expect(seq(topTask, eventEp)).toBe(false);
    expect(seq(eventEp, topTask)).toBe(false);
  });
  it("but its children still flow among themselves", () => {
    const startInEventEp = el("startInEventEp", "start-event", { parentId: "eventEp" });
    const world2 = [...WORLD, startInEventEp];
    expect(canConnect(startInEventEp, taskInEventEp, "sequence", world2)).toBe(true);
    expect(canConnect(startInEventEp, topTask, "sequence", world2)).toBe(false);
  });
  it("plain top-level flow is unaffected", () => {
    expect(seq(topStart, topTask)).toBe(true);
  });
});
