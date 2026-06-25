/**
 * Visio export — BPMN structure matrix (layer 2).
 *
 * Runs a spread of representative BPMN structures through the real Visio export
 * and asserts the VSDX is structurally sound (every element → exactly one shape,
 * no dangling masters, no duplicate/replicated shapes). This is the regression
 * net to build BEFORE re-attempting Pool/Lane: a change that "replicates pools
 * onto tasks" — or drops/duplicates any shape for any structure — fails here
 * instead of reaching main.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { exportToVsdx, findVsdxViolations } from "./_helpers/vsdx";

const build = (e: AiElement[], c: AiConnection[]) => layoutBpmnDiagram(e, c);

type Scenario = { name: string; elements: AiElement[]; connections: AiConnection[] };

const SCENARIOS: Scenario[] = [
  {
    name: "linear flow",
    elements: [
      { id: "s", type: "start-event", label: "Start" },
      { id: "t1", type: "task", label: "Receive order" },
      { id: "t2", type: "task", label: "Ship order" },
      { id: "e", type: "end-event", label: "Done" },
    ],
    connections: [
      { sourceId: "s", targetId: "t1" },
      { sourceId: "t1", targetId: "t2" },
      { sourceId: "t2", targetId: "e" },
    ],
  },
  {
    name: "pool with two lanes",
    elements: [
      { id: "p", type: "pool", label: "Order Process", poolType: "white-box", lanes: [{ id: "l1", name: "Sales" }, { id: "l2", name: "Warehouse" }] },
      { id: "s", type: "start-event", label: "Start", pool: "p", lane: "l1" },
      { id: "t1", type: "task", label: "Take order", pool: "p", lane: "l1" },
      { id: "t2", type: "task", label: "Pick goods", pool: "p", lane: "l2" },
      { id: "e", type: "end-event", label: "End", pool: "p", lane: "l2" },
    ],
    connections: [
      { sourceId: "s", targetId: "t1" },
      { sourceId: "t1", targetId: "t2" },
      { sourceId: "t2", targetId: "e" },
    ],
  },
  {
    name: "gateways + events",
    elements: [
      { id: "s", type: "start-event", label: "Start" },
      { id: "g", type: "gateway", label: "Approved?" },
      { id: "a", type: "task", label: "Fulfil" },
      { id: "b", type: "task", label: "Reject" },
      { id: "ie", type: "intermediate-event", label: "Wait", eventType: "timer" },
      { id: "m", type: "gateway", label: "" },
      { id: "e", type: "end-event", label: "End" },
    ],
    connections: [
      { sourceId: "s", targetId: "g" },
      { sourceId: "g", targetId: "a", label: "Yes" },
      { sourceId: "g", targetId: "b", label: "No" },
      { sourceId: "a", targetId: "ie" },
      { sourceId: "ie", targetId: "m" },
      { sourceId: "b", targetId: "m" },
      { sourceId: "m", targetId: "e" },
    ],
  },
  {
    name: "expanded subprocess with internals",
    elements: [
      { id: "s", type: "start-event", label: "Start" },
      { id: "sp", type: "subprocess-expanded", label: "Handle claim" },
      { id: "is", type: "start-event", label: "", parentSubprocess: "sp" },
      { id: "it", type: "task", label: "Assess", parentSubprocess: "sp" },
      { id: "ien", type: "end-event", label: "", parentSubprocess: "sp" },
      { id: "e", type: "end-event", label: "End" },
    ],
    connections: [
      { sourceId: "s", targetId: "sp" },
      { sourceId: "is", targetId: "it" },
      { sourceId: "it", targetId: "ien" },
      { sourceId: "sp", targetId: "e" },
    ],
  },
  {
    name: "data objects, store + cross-pool message",
    elements: [
      { id: "p1", type: "pool", label: "Us", poolType: "white-box" },
      { id: "p2", type: "pool", label: "Bank", poolType: "black-box" },
      { id: "s", type: "start-event", label: "S", pool: "p1" },
      { id: "t", type: "task", label: "Process payment", pool: "p1" },
      { id: "e", type: "end-event", label: "E", pool: "p1" },
      { id: "d1", type: "data-object", label: "Invoice" },
      { id: "ds", type: "data-store", label: "Ledger" },
    ],
    connections: [
      { sourceId: "s", targetId: "t" },
      { sourceId: "t", targetId: "e" },
      { sourceId: "d1", targetId: "t" },
      { sourceId: "t", targetId: "ds" },
      { sourceId: "t", targetId: "p2", type: "message", label: "Charge" },
    ],
  },
];

describe("Visio export — BPMN structure matrix", () => {
  for (const sc of SCENARIOS) {
    it(`${sc.name} — exports a structurally valid VSDX`, async () => {
      const data = build(sc.elements, sc.connections);
      const parsed = await exportToVsdx(data);
      const violations = findVsdxViolations(parsed, data);
      expect(violations, `\n  - ${violations.join("\n  - ")}`).toEqual([]);
    });
  }
});
