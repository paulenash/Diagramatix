/**
 * Process MERGE — cherry-picked B→A merge, re-laid-out via layoutBpmnDiagram.
 * Verifies the four operations: change role, change task type, remove, add.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { mergeProcesses, type MergeDecision } from "@/app/lib/diagram/diff/mergeProcess";
import { extractSkeleton } from "@/app/lib/sop/extractSkeleton";

const build = (e: AiElement[], c: AiConnection[]) => layoutBpmnDiagram(e, c);

const A = build(
  [
    { id: "p", type: "pool", label: "Sales", poolType: "white-box",
      lanes: [{ id: "cs", name: "Customer Service" }, { id: "op", name: "Order Processing" }] },
    { id: "s", type: "start-event", label: "Order received", pool: "p", lane: "op" },
    { id: "t1", type: "task", label: "Look up customer", pool: "p", lane: "op", taskType: "user" },
    { id: "t2", type: "task", label: "Validate order", pool: "p", lane: "op", taskType: "user" },
    { id: "t3", type: "task", label: "Approve order", pool: "p", lane: "cs", taskType: "user" },
    { id: "e", type: "end-event", label: "Done", pool: "p", lane: "cs" },
  ],
  [
    { sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "t2" },
    { sourceId: "t2", targetId: "t3" }, { sourceId: "t3", targetId: "e" },
  ],
);

const B = build(
  [
    { id: "p", type: "pool", label: "Sales", poolType: "white-box",
      lanes: [{ id: "cs", name: "Customer Service" }, { id: "op", name: "Order Processing" }] },
    { id: "s", type: "start-event", label: "Order received", pool: "p", lane: "op" },
    { id: "t1", type: "task", label: "Look up customer", pool: "p", lane: "op", taskType: "service" }, // type change
    { id: "t2", type: "task", label: "Validate order", pool: "p", lane: "cs", taskType: "user" },      // role change
    { id: "t4", type: "task", label: "Archive order", pool: "p", lane: "op", taskType: "service" },    // added
    { id: "e", type: "end-event", label: "Done", pool: "p", lane: "cs" },
  ],
  [
    { sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "t2" },
    { sourceId: "t2", targetId: "t4" }, { sourceId: "t4", targetId: "e" },
  ],
);

function stepByLabel(data: ReturnType<typeof build>, label: string) {
  return extractSkeleton(data, { scope: "whole" }).steps.find((s) => s.label === label);
}

describe("mergeProcesses", () => {
  it("applies type change, role change, add and remove, and re-lays-out", () => {
    const decisions: MergeDecision[] = [
      { activity: "Look up customer", kind: "change" }, // user → service
      { activity: "Validate order", kind: "change" },   // → Customer Service
      { activity: "Approve order", kind: "remove" },    // gone
      { activity: "Archive order", kind: "add" },       // new from B
    ];
    const { model, applied } = mergeProcesses(A, B, decisions);
    expect(applied).toBe(4);
    const merged = layoutBpmnDiagram(model.elements, model.connections);

    // Type change applied.
    expect(stepByLabel(merged, "Look up customer")?.taskType).toBe("service");
    // Role change applied.
    expect(stepByLabel(merged, "Validate order")?.role).toBe("Customer Service");
    // Removed.
    expect(stepByLabel(merged, "Approve order")).toBeUndefined();
    // Added, in its B lane.
    const archive = stepByLabel(merged, "Archive order");
    expect(archive).toBeTruthy();
    expect(archive?.role).toBe("Order Processing");
  });

  it("selective merge: only the accepted rows change", () => {
    const { model } = mergeProcesses(A, B, [{ activity: "Look up customer", kind: "change" }]);
    const merged = layoutBpmnDiagram(model.elements, model.connections);
    expect(stepByLabel(merged, "Look up customer")?.taskType).toBe("service");
    // Not accepted → unchanged from A.
    expect(stepByLabel(merged, "Validate order")?.role).toBe("Order Processing");
    expect(stepByLabel(merged, "Approve order")).toBeTruthy();
    expect(stepByLabel(merged, "Archive order")).toBeUndefined();
  });
});
