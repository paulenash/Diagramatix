/**
 * Global "clean layout" invariants (conflict catcher).
 *
 * Runs findLayoutViolations over a spread of diagrams — simple shapes AND
 * deliberately dense ones that make several rules fire at once. If two rules
 * conflict (e.g. a loop-back lands on the point a merge already uses, or a
 * gateway label collides with a branch), a violation falls out here even though
 * no single per-rule check would notice.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { findLayoutViolations } from "./_helpers/cleanLayout";

const layout = (e: AiElement[], c: AiConnection[]) => layoutBpmnDiagram(e, c);

type Scenario = { name: string; elements: AiElement[]; connections: AiConnection[] };

const SCENARIOS: Scenario[] = [
  {
    name: "linear flow",
    elements: [
      { id: "s", type: "start-event", label: "Start" },
      { id: "t1", type: "task", label: "Step one" },
      { id: "t2", type: "task", label: "Step two" },
      { id: "e", type: "end-event", label: "End" },
    ],
    connections: [
      { sourceId: "s", targetId: "t1" },
      { sourceId: "t1", targetId: "t2" },
      { sourceId: "t2", targetId: "e" },
    ],
  },
  {
    name: "decision split + merge with labels",
    elements: [
      { id: "s", type: "start-event", label: "Start" },
      { id: "g", type: "gateway", label: "Inquiry valid?" },
      { id: "a", type: "task", label: "Process inquiry" },
      { id: "b", type: "task", label: "Reject" },
      { id: "m", type: "gateway", label: "" },
      { id: "e", type: "end-event", label: "End" },
    ],
    connections: [
      { sourceId: "s", targetId: "g" },
      { sourceId: "g", targetId: "a", label: "Yes" },
      { sourceId: "g", targetId: "b", label: "No" },
      { sourceId: "a", targetId: "m" },
      { sourceId: "b", targetId: "m" },
      { sourceId: "m", targetId: "e" },
    ],
  },
  {
    name: "rework loop-back (R8.04) under a forward flow",
    elements: [
      { id: "s", type: "start-event", label: "Start" },
      { id: "a", type: "task", label: "Review" },
      { id: "g", type: "gateway", label: "Approved?" },
      { id: "b", type: "task", label: "Finalise" },
      { id: "e", type: "end-event", label: "End" },
    ],
    connections: [
      { sourceId: "s", targetId: "a" },
      { sourceId: "a", targetId: "g" },
      { sourceId: "g", targetId: "b", label: "Yes" },
      { sourceId: "b", targetId: "e" },
      { sourceId: "g", targetId: "a", label: "No (rework)" }, // backward into an earlier task
    ],
  },
  {
    name: "two pools + bidirectional messages",
    elements: [
      { id: "p1", type: "pool", label: "Member Services", poolType: "white-box" },
      { id: "p2", type: "pool", label: "CRM", poolType: "black-box" },
      { id: "s", type: "start-event", label: "S", pool: "p1" },
      { id: "t", type: "task", label: "Look up member", pool: "p1" },
      { id: "u", type: "task", label: "Update record", pool: "p1" },
      { id: "e", type: "end-event", label: "E", pool: "p1" },
    ],
    connections: [
      { sourceId: "s", targetId: "t" },
      { sourceId: "t", targetId: "u" },
      { sourceId: "u", targetId: "e" },
      { sourceId: "t", targetId: "p2", type: "message", label: "Query" },
      { sourceId: "p2", targetId: "t", type: "message", label: "Result" },
    ],
  },
  {
    name: "data objects + store around a task",
    elements: [
      { id: "s", type: "start-event", label: "S" },
      { id: "t", type: "task", label: "Assess claim" },
      { id: "e", type: "end-event", label: "E" },
      { id: "d1", type: "data-object", label: "Claim form" },
      { id: "d2", type: "data-object", label: "Decision letter" },
      { id: "ds", type: "data-store", label: "Policy DB" },
    ],
    connections: [
      { sourceId: "s", targetId: "t" },
      { sourceId: "t", targetId: "e" },
      { sourceId: "d1", targetId: "t" }, // input
      { sourceId: "t", targetId: "d2" }, // output
      { sourceId: "t", targetId: "ds" },
    ],
  },
  {
    name: "dense — 3-way decision, merge, boundary event, loop-back",
    elements: [
      { id: "s", type: "start-event", label: "Start" },
      { id: "g", type: "gateway", label: "Customer type?" },
      { id: "a", type: "task", label: "Onboard new" },
      { id: "b", type: "task", label: "Verify existing" },
      { id: "c", type: "task", label: "Escalate to manager" },
      { id: "be", type: "intermediate-event", label: "SLA breached", eventType: "timer", boundaryHost: "b", boundarySide: "bottom" },
      { id: "m", type: "gateway", label: "All checks done?" },
      { id: "e", type: "end-event", label: "End" },
    ],
    connections: [
      { sourceId: "s", targetId: "g" },
      { sourceId: "g", targetId: "a", label: "New" },
      { sourceId: "g", targetId: "b", label: "Existing" },
      { sourceId: "g", targetId: "c", label: "VIP" },
      { sourceId: "a", targetId: "m" },
      { sourceId: "b", targetId: "m" },
      { sourceId: "c", targetId: "m" },
      { sourceId: "be", targetId: "c" },     // boundary → escalate
      { sourceId: "m", targetId: "e", label: "Yes" },
      { sourceId: "m", targetId: "g", label: "No (recheck)" }, // backward into the decision
    ],
  },
];

describe("BPMN clean-layout global invariants", () => {
  for (const sc of SCENARIOS) {
    it(`${sc.name} — lays out with no global-invariant breaches`, () => {
      const out = layout(sc.elements, sc.connections);
      const violations = findLayoutViolations(out);
      expect(violations, `\n  - ${violations.join("\n  - ")}`).toEqual([]);
    });
  }
});
