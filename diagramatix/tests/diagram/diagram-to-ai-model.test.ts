/**
 * diagramToAiModel round-trip: layout → convert-back → layout again must yield an
 * equivalent process (same activities, roles, systems, task types). This proves
 * the converter is faithful enough to rebuild a diagram — the foundation the
 * process MERGE relies on.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { diagramToAiModel } from "@/app/lib/diagram/diff/diagramToAiModel";
import { extractSkeleton } from "@/app/lib/sop/extractSkeleton";

const els: AiElement[] = [
  { id: "p", type: "pool", label: "Sales", poolType: "white-box",
    lanes: [{ id: "cs", name: "Customer Service" }, { id: "op", name: "Order Processing" }] },
  { id: "sys", type: "pool", label: "CRM", poolType: "black-box", isSystem: true },
  { id: "s", type: "start-event", label: "Order received", pool: "p", lane: "op", eventType: "message" },
  { id: "t1", type: "task", label: "Look up customer", pool: "p", lane: "op", taskType: "service" },
  { id: "t2", type: "task", label: "Validate order", pool: "p", lane: "op", taskType: "user" },
  { id: "g", type: "gateway", label: "Valid?", pool: "p", lane: "op", gatewayType: "exclusive" },
  { id: "t3", type: "task", label: "Approve order", pool: "p", lane: "cs", taskType: "user" },
  { id: "e", type: "end-event", label: "Done", pool: "p", lane: "cs" },
  { id: "ds", type: "data-store", label: "Orders DB" },
];
const conns: AiConnection[] = [
  { sourceId: "s", targetId: "t1" },
  { sourceId: "t1", targetId: "t2" },
  { sourceId: "t2", targetId: "g" },
  { sourceId: "g", targetId: "t3", label: "yes" },
  { sourceId: "t3", targetId: "e" },
  { sourceId: "t1", targetId: "ds" },
  { sourceId: "t1", targetId: "sys", type: "message" },
];

// A skeleton projection reduced to what a merge cares about, so the comparison
// ignores incidental id/geometry differences.
function project(data: ReturnType<typeof layoutBpmnDiagram>) {
  const sk = extractSkeleton(data, { scope: "whole" });
  return {
    roles: [...sk.roles].sort(),
    systems: [...sk.systems].sort(),
    steps: sk.steps.map((s) => ({ label: s.label, role: s.role, taskType: s.taskType, systems: [...s.systems].sort() }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}

describe("diagramToAiModel round-trip", () => {
  it("rebuilds an equivalent process (roles / systems / steps preserved)", () => {
    const first = layoutBpmnDiagram(els, conns);
    const model = diagramToAiModel(first);
    const second = layoutBpmnDiagram(model.elements, model.connections);
    expect(project(second)).toEqual(project(first));
  });

  it("preserves pool/lane structure and element count", () => {
    const first = layoutBpmnDiagram(els, conns);
    const model = diagramToAiModel(first);
    // Same number of pools, lanes and tasks survive the conversion.
    const count = (data: ReturnType<typeof layoutBpmnDiagram>, type: string) =>
      data.elements.filter((e) => e.type === type).length;
    const second = layoutBpmnDiagram(model.elements, model.connections);
    for (const type of ["pool", "lane", "task", "gateway"]) {
      expect(count(second, type), type).toBe(count(first, type));
    }
  });
});
