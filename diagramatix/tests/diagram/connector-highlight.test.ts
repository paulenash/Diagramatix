/**
 * Business rules for the connector drop-target HIGHLIGHT, pinned so the canvas
 * cannot drift from them (the canvas render passes call exactly these functions).
 *
 * These tests DOCUMENT CURRENT BEHAVIOUR — a verbatim extraction of the logic
 * that used to live inline in Canvas.tsx. If a rule below looks wrong, fix the
 * rule in app/lib/diagram/connectorHighlight.ts AND its test here together.
 *
 * Legend for classifyDragTarget results: sequence=green, message=blue,
 * association=purple, compensation=dark-yellow.
 */
import { describe, it, expect } from "vitest";
import type { DiagramElement } from "@/app/lib/diagram/types";
import { computeDragContext, classifyDragTarget } from "@/app/lib/diagram/connectorHighlight";

const el = (id: string, type: string, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label: id, x: 0, y: 0, width: 40, height: 40, properties: {}, ...extra });

// ── a rich BPMN world ──────────────────────────────────────────────────────
// White-box pools A & B (message across them), black-box pool C. Positioned far
// from the (0,0) default so unpositioned top-level elements never fall inside a
// pool via the position fallback. Pool membership below is set via parentId.
const poolA = el("poolA", "pool", { x: 2000, y: 0, width: 400, height: 200, properties: { poolType: "white-box" } });
const poolB = el("poolB", "pool", { x: 2000, y: 300, width: 400, height: 200, properties: { poolType: "white-box" } });
const poolC = el("poolC", "pool", { x: 2000, y: 600, width: 400, height: 200, properties: { poolType: "black-box" } });
const taskA1 = el("taskA1", "task", { parentId: "poolA", x: 2050, y: 50 });
const taskB1 = el("taskB1", "task", { parentId: "poolB", x: 2050, y: 350 });

// Top-level (pool-less) nested EPs: EP1 ⊃ EP2 ⊃ children; EP3; event-EP.
const ep1 = el("ep1", "subprocess-expanded", { x: 600, y: 0, width: 300, height: 200 });
const startInEp1 = el("startInEp1", "start-event", { parentId: "ep1" });
const taskInEp1 = el("taskInEp1", "task", { parentId: "ep1" }); // a plain direct child of EP1
const ep2 = el("ep2", "subprocess-expanded", { parentId: "ep1", x: 620, y: 20, width: 200, height: 120 });
const taskInEp2 = el("taskInEp2", "task", { parentId: "ep2" });
const startInEp2 = el("startInEp2", "start-event", { parentId: "ep2" });
const endInEp2 = el("endInEp2", "end-event", { parentId: "ep2" });
const edgeEndOnEp1 = el("edgeEndOnEp1", "end-event", { boundaryHostId: "ep1" });
const edgeStartOnEp1 = el("edgeStartOnEp1", "start-event", { boundaryHostId: "ep1" });
const ep3 = el("ep3", "subprocess-expanded", { x: 1000, y: 0, width: 200, height: 120 });
const taskInEp3 = el("taskInEp3", "task", { parentId: "ep3" });
const eventEp = el("eventEp", "subprocess-expanded", { x: 1000, y: 300, width: 200, height: 120, properties: { subprocessType: "event" } });
const taskInEventEp = el("taskInEventEp", "task", { parentId: "eventEp" });

const topTask = el("topTask", "task");
const dataObj = el("dataObj", "data-object");
const dataObj2 = el("dataObj2", "data-object");
const annotation = el("annotation", "text-annotation");

// Compensation: an edge-mounted compensation event on compHost.
const compHost = el("compHost", "task");
const edgeCompEvent = el("edgeCompEvent", "intermediate-event", { boundaryHostId: "compHost", eventType: "compensation" });
const compActivity = el("compActivity", "task", { properties: { isForCompensation: true } });

// Edge-mounted send / receive intermediates on their own host tasks.
const sendHost = el("sendHost", "task");
const edgeSend = el("edgeSend", "intermediate-event", { boundaryHostId: "sendHost", flowType: "throwing" });
const recvHost = el("recvHost", "task");
const edgeRecv = el("edgeRecv", "intermediate-event", { boundaryHostId: "recvHost", flowType: "catching" });
const childInSendHost = el("childInSendHost", "task", { parentId: "sendHost" });
const outsideSendHost = el("outsideSendHost", "task");

const WORLD = [
  poolA, poolB, poolC, taskA1, taskB1,
  ep1, startInEp1, taskInEp1, ep2, taskInEp2, startInEp2, endInEp2, edgeEndOnEp1, edgeStartOnEp1,
  ep3, taskInEp3, eventEp, taskInEventEp, topTask, dataObj, dataObj2, annotation,
  compHost, edgeCompEvent, compActivity, sendHost, edgeSend, recvHost, edgeRecv, childInSendHost, outsideSendHost,
];
const CONNS: never[] = [];

const ctxOf = (source: DiagramElement, conns: { type: string; sourceId: string }[] = CONNS) =>
  computeDragContext(source, WORLD, conns as never, source.id);

const classify = (source: DiagramElement, target: DiagramElement, conns: { type: string; sourceId: string }[] = CONNS) =>
  classifyDragTarget(source, target, ctxOf(source, conns), WORLD, conns as never, "bpmn");

describe("computeDragContext — source classification", () => {
  it("a plain task carries no special source flags", () => {
    const c = ctxOf(topTask);
    expect(c.sourceIsData).toBe(false);
    expect(c.fromPool).toBe(false);
    expect(c.fromFreeEndEvent).toBe(false);
    expect(c.fromEdgeMountedStartEvent).toBe(false);
  });
  it("recognises each edge-mounted event kind", () => {
    expect(ctxOf(edgeStartOnEp1).fromEdgeMountedStartEvent).toBe(true);
    expect(ctxOf(edgeEndOnEp1).fromEdgeMountedEndEvent).toBe(true);
    expect(ctxOf(edgeSend).fromEdgeMountedIntermediateSendEvent).toBe(true);
    expect(ctxOf(edgeRecv).fromEdgeMountedIntermediateReceiveEvent).toBe(true);
    expect(ctxOf(edgeCompEvent).fromEdgeMountedCompensationEvent).toBe(true);
  });
  it("a free end event vs an edge-mounted end event", () => {
    expect(ctxOf(endInEp2).fromFreeEndEvent).toBe(true);       // no host
    expect(ctxOf(endInEp2).fromEdgeMountedEndEvent).toBe(false);
    expect(ctxOf(edgeEndOnEp1).fromFreeEndEvent).toBe(false);
  });
  it("pool / data / final-state / event-subprocess sources", () => {
    expect(ctxOf(poolA).fromPool).toBe(true);
    expect(ctxOf(dataObj).sourceIsData).toBe(true);
    expect(ctxOf(annotation).sourceIsData).toBe(true);
    expect(ctxOf(eventEp).fromEventSubprocess).toBe(true);
    expect(ctxOf(taskInEventEp).fromInsideEventSubprocess).toBe(true);
  });
  it("child event vs boundary-on-child, with host parent + ancestors", () => {
    expect(ctxOf(startInEp2).fromChildEvent).toBe(true);       // non-boundary child event
    expect(ctxOf(startInEp2).sourceAncestorIds.has("ep1")).toBe(true);
    expect(ctxOf(startInEp2).sourceAncestorIds.has("ep2")).toBe(true);
  });
  it("compensation event: compTargetsAvailable flips once it already has an association", () => {
    expect(ctxOf(edgeCompEvent).compTargetsAvailable).toBe(true);
    const linked = [{ type: "associationBPMN", sourceId: "edgeCompEvent" }];
    expect(ctxOf(edgeCompEvent, linked).compTargetsAvailable).toBe(false);
  });
});

describe("classifyDragTarget — GREEN (sequence)", () => {
  it("same-EP flow is green; crossing an EP boundary is not", () => {
    expect(classify(startInEp2, taskInEp2).sequence).toBe(true);
    expect(classify(taskInEp2, endInEp2).sequence).toBe(true);
    expect(classify(startInEp1, taskInEp3).sequence).toBe(false); // EP1 → EP3
    expect(classify(startInEp2, topTask).sequence).toBe(false);   // out of EP2
  });
  it("edge-mounted start flows INTO its host's direct children only", () => {
    expect(classify(edgeStartOnEp1, taskInEp1).sequence).toBe(true);   // direct child of ep1
    expect(classify(edgeStartOnEp1, startInEp1).sequence).toBe(false); // can't sequence INTO a start event
    expect(classify(edgeStartOnEp1, taskInEp2).sequence).toBe(false);  // grandchild (in ep2)
    expect(classify(edgeStartOnEp1, topTask).sequence).toBe(false);    // outside
  });
  it("edge-mounted end flows out of its host; is never a source of a valid green elsewhere", () => {
    // As target: reachable from inside the host EP.
    expect(classify(ep2, edgeEndOnEp1).sequence).toBe(true);   // EP2 (in EP1) → EP1's edge end
    expect(classify(topTask, edgeEndOnEp1).sequence).toBe(false);
    // As source: an end event never has outgoing flow.
    expect(classify(edgeEndOnEp1, topTask).sequence).toBe(false);
  });
});

describe("pool boundary — a sequence flow may never cross pools (Bug 1a)", () => {
  // Task 3 in white-box Pool 1, dragging to Activities in white-box Pool 2.
  const pool1 = el("pool1", "pool", { x: 0, y: -300, width: 800, height: 130, properties: { poolType: "white-box" } });
  const pool2 = el("pool2", "pool", { x: 0, y: 0, width: 800, height: 600, properties: { poolType: "white-box" } });
  const task3 = el("task3", "task", { parentId: "pool1" });
  const epInPool2 = el("epInPool2", "subprocess-expanded", { parentId: "pool2", x: 100, y: 100, width: 300, height: 200 });
  const taskInPool2 = el("taskInPool2", "task", { parentId: "pool2", x: 500, y: 100 });
  const w = [pool1, pool2, task3, epInPool2, taskInPool2];
  const cls = (s: DiagramElement, t: DiagramElement) =>
    classifyDragTarget(s, t, computeDragContext(s, w, CONNS as never, s.id), w, CONNS as never, "bpmn");

  it("an EP in another pool is NOT a green sequence target", () => {
    expect(cls(task3, epInPool2).sequence).toBe(false); // was wrongly green
  });
  it("a task in another white-box pool is blue (message), not green", () => {
    expect(cls(task3, taskInPool2).sequence).toBe(false);
    expect(cls(task3, taskInPool2).message).toBe(true);
  });
  it("within the SAME pool a sequence is still legal", () => {
    const task3b = el("task3b", "task", { parentId: "pool1" });
    const w2 = [...w, task3b];
    expect(classifyDragTarget(task3, task3b, computeDragContext(task3, w2, CONNS as never, task3.id), w2, CONNS as never, "bpmn").sequence).toBe(true);
  });

  it("nested EPs INSIDE one pool still flow (Bug 2 topology): outer-EP start → inner EP", () => {
    // outerEp (in pool2) ⊃ innerEp; a start event lives in outerEp.
    const outerEp = el("outerEp", "subprocess-expanded", { parentId: "pool2", x: 100, y: 100, width: 400, height: 300 });
    const innerEp = el("innerEp", "subprocess-expanded", { parentId: "outerEp", x: 150, y: 150, width: 200, height: 150 });
    const seInOuter = el("seInOuter", "start-event", { parentId: "outerEp", x: 110, y: 120 });
    const taskInInner = el("taskInInner", "task", { parentId: "innerEp", x: 160, y: 180 });
    const w3 = [pool2, outerEp, innerEp, seInOuter, taskInInner];
    const cls3 = (s: DiagramElement, t: DiagramElement) =>
      classifyDragTarget(s, t, computeDragContext(s, w3, CONNS as never, s.id), w3, CONNS as never, "bpmn");
    expect(cls3(seInOuter, innerEp).sequence).toBe(true);        // same pool + same EP-scope → legal (green)
    expect(cls3(seInOuter, taskInInner).sequence).toBe(false);   // child of inner EP = different scope
  });
});

describe("classifyDragTarget — BLUE (messageBPMN)", () => {
  it("an element in one white-box pool → an element in a DIFFERENT white-box pool", () => {
    expect(classify(taskA1, taskB1).message).toBe(true);
    expect(classify(taskA1, taskB1).sequence).toBe(false);
  });
  it("a pool source → an element in a different white-box pool", () => {
    expect(classify(poolA, taskB1).message).toBe(true);
  });
  it("a BPMN element → a black-box pool", () => {
    expect(classify(topTask, poolC).message).toBe(true);
    expect(classify(topTask, poolC).sequence).toBe(false);
  });
  it("an edge-mounted start/end/receive event → a pool is NOT a message target", () => {
    expect(classify(edgeStartOnEp1, poolC).message).toBe(false);
    expect(classify(edgeEndOnEp1, poolC).message).toBe(false);
    expect(classify(edgeRecv, poolC).message).toBe(false);
  });
});

describe("classifyDragTarget — PURPLE (associationBPMN)", () => {
  it("data ↔ flow element", () => {
    expect(classify(topTask, dataObj).association).toBe(true);
    expect(classify(dataObj, topTask).association).toBe(true);
  });
  it("data → data is NOT a valid connector (no highlight)", () => {
    const h = classify(dataObj, dataObj2);
    expect(h.association).toBe(false);
    expect(h.sequence).toBe(false);
    expect(h.message).toBe(false);
  });
  it("a child event → a boundary event mounted on an ancestor", () => {
    // startInEp2's ancestors include ep1; edgeEndOnEp1 is mounted on ep1.
    expect(classify(startInEp2, edgeEndOnEp1).association).toBe(true);
  });
});

describe("classifyDragTarget — DARK-YELLOW (compensation)", () => {
  it("an edge-mounted compensation event → an Activity (not its own host)", () => {
    expect(classify(edgeCompEvent, compActivity).compensation).toBe(true);
    expect(classify(edgeCompEvent, topTask).compensation).toBe(true);       // any task is an Activity
    expect(classify(edgeCompEvent, ep3).compensation).toBe(true);           // an EP is an Activity
  });
  it("never its own host, never once already linked, never a non-Activity", () => {
    expect(classify(edgeCompEvent, compHost).compensation).toBe(false);     // own host
    expect(classify(edgeCompEvent, startInEp1).compensation).toBe(false);   // an event is not an Activity
    const linked = [{ type: "associationBPMN", sourceId: "edgeCompEvent" }];
    expect(classify(edgeCompEvent, compActivity, linked).compensation).toBe(false);
  });
  it("a compensation Activity is never a sequence target", () => {
    expect(classify(topTask, compActivity).sequence).toBe(false);
  });
});

describe("classifyDragTarget — edge send / receive intermediates", () => {
  it("send targets anything EXCEPT its host's children", () => {
    expect(classify(edgeSend, outsideSendHost).sequence).toBe(true);
    expect(classify(edgeSend, childInSendHost).sequence).toBe(false); // host's child
  });
  it("receive targets ONLY its host's children", () => {
    expect(classify(edgeRecv, childInSendHost).sequence).toBe(false); // not recvHost's child
    const childInRecvHost = el("childInRecvHost", "task", { parentId: "recvHost" });
    const w = [...WORLD, childInRecvHost];
    const c = computeDragContext(edgeRecv, w, CONNS as never, edgeRecv.id);
    expect(classifyDragTarget(edgeRecv, childInRecvHost, c, w, CONNS as never, "bpmn").sequence).toBe(true);
  });
});

describe("classifyDragTarget — universal gates & event subprocess", () => {
  it("dragging from an EP never highlights its own contents", () => {
    expect(classify(ep2, taskInEp2)).toEqual({ sequence: false, message: false, association: false, compensation: false });
    expect(classify(ep1, ep2)).toEqual({ sequence: false, message: false, association: false, compensation: false });
  });
  it("an Event Expanded Subprocess is never sequence-wired (as source or target)", () => {
    expect(classify(taskInEventEp, topTask).sequence).toBe(false); // out of event-sub
    expect(classify(topTask, eventEp).sequence).toBe(false);       // event-sub as target
    expect(classify(eventEp, topTask).sequence).toBe(false);       // event-sub as source
  });
  it("never a target when it is the source itself", () => {
    expect(classify(topTask, topTask)).toEqual({ sequence: false, message: false, association: false, compensation: false });
  });
});

describe("classifyDragTarget — non-BPMN diagrams (canConnect gate is a no-op)", () => {
  it("a composite-state is a green target when the source is outside it", () => {
    const comp = el("comp", "composite-state", { x: 0, y: 0, width: 200, height: 200 });
    const stateOut = el("stateOut", "state");
    const stateIn = el("stateIn", "state", { parentId: "comp" });
    const w = [comp, stateOut, stateIn];
    const c = computeDragContext(stateOut, w, CONNS as never, stateOut.id);
    expect(classifyDragTarget(stateOut, comp, c, w, CONNS as never, "state-machine").sequence).toBe(true);
    const cin = computeDragContext(stateIn, w, CONNS as never, stateIn.id);
    expect(classifyDragTarget(stateIn, comp, cin, w, CONNS as never, "state-machine").sequence).toBe(false);
  });
  it("context diagrams only pair external-entity ↔ process-system", () => {
    const ent = el("ent", "external-entity");
    const proc = el("proc", "process-system");
    const ent2 = el("ent2", "external-entity");
    const w = [ent, proc, ent2];
    const c = computeDragContext(ent, w, CONNS as never, ent.id);
    expect(classifyDragTarget(ent, proc, c, w, CONNS as never, "context").sequence).toBe(true);
    expect(classifyDragTarget(ent, ent2, c, w, CONNS as never, "context").sequence).toBe(false);
  });
});
