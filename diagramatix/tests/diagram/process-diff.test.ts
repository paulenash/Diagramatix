/**
 * Diff Processes — deterministic comparison of two BPMN process versions.
 *
 * Covers the three dimensions the feature reports: WHO (role/lane), WHAT systems,
 * and WHAT is done (activity add/remove + task-type change).
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { diffProcesses, normaliseLabel } from "@/app/lib/diagram/diff/processDiff";

const build = (elements: AiElement[], connections: AiConnection[]) =>
  layoutBpmnDiagram(elements, connections);

// Version A: two-lane pool, Validate is a USER task in Order Processing; Approve
// in Customer Service. No systems.
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
    { sourceId: "s", targetId: "t1" },
    { sourceId: "t1", targetId: "t2" },
    { sourceId: "t2", targetId: "t3" },
    { sourceId: "t3", targetId: "e" },
  ],
);

// Version B: "Look up customer" is now a SERVICE task touching a CRM data-store
// (system change + type change); "Validate order" MOVED to Customer Service
// (role change); "Approve order" REMOVED; "Archive order" ADDED.
const B = build(
  [
    { id: "p", type: "pool", label: "Sales", poolType: "white-box",
      lanes: [{ id: "cs", name: "Customer Service" }, { id: "op", name: "Order Processing" }] },
    { id: "s", type: "start-event", label: "Order received", pool: "p", lane: "op" },
    { id: "t1", type: "task", label: "Look up customer", pool: "p", lane: "op", taskType: "service" },
    { id: "t2", type: "task", label: "Validate order", pool: "p", lane: "cs", taskType: "user" },
    { id: "t4", type: "task", label: "Archive order", pool: "p", lane: "op", taskType: "service" },
    { id: "e", type: "end-event", label: "Done", pool: "p", lane: "cs" },
    { id: "crm", type: "data-store", label: "CRM" },
  ],
  [
    { sourceId: "s", targetId: "t1" },
    { sourceId: "t1", targetId: "t2" },
    { sourceId: "t2", targetId: "t4" },
    { sourceId: "t4", targetId: "e" },
    { sourceId: "t1", targetId: "crm" },
  ],
);

const rowFor = (diff: ReturnType<typeof diffProcesses>, label: string) =>
  diff.rows.find((r) => normaliseLabel(r.activity) === normaliseLabel(label))!;

describe("diffProcesses", () => {
  const diff = diffProcesses(A, "v1", B, "v2");

  it("classifies added / removed activities", () => {
    expect(rowFor(diff, "Archive order").status).toBe("added");
    expect(rowFor(diff, "Approve order").status).toBe("removed");
  });

  it("detects a role (who) change", () => {
    const r = rowFor(diff, "Validate order");
    expect(r.status).toBe("changed");
    expect(r.who.changed).toBe(true);
    expect(r.who.a).toBe("Order Processing");
    expect(r.who.b).toBe("Customer Service");
  });

  it("detects a task-type (what is done) change", () => {
    const r = rowFor(diff, "Look up customer");
    expect(r.taskType.changed).toBe(true);
    expect(r.taskType.a).toMatch(/User/);
    expect(r.taskType.b).toMatch(/Service/);
  });

  it("detects a systems change", () => {
    const r = rowFor(diff, "Look up customer");
    expect(r.systems.changed).toBe(true);
    expect(r.systems.a).toEqual([]);
    expect(r.systems.b).toEqual(["CRM"]);
    expect(diff.systemDiff.added).toContain("CRM");
  });

  it("summarises counts", () => {
    expect(diff.summary.added).toBe(1);
    expect(diff.summary.removed).toBe(1);
    expect(diff.summary.changed).toBeGreaterThanOrEqual(2); // Validate + Look up
    expect(diff.b.stepCount).toBe(3);
  });

  it("normaliseLabel is case/space/punctuation insensitive", () => {
    expect(normaliseLabel("  Validate  Order. ")).toBe(normaliseLabel("validate order"));
  });

  it("diffs message flows (added / removed / relabelled)", () => {
    // A: one message Look up customer → CRM ("query"). B: relabels it ("lookup"),
    // adds a new Validate order → Customer message, and drops nothing else.
    const mkA = build(
      [
        { id: "p", type: "pool", label: "Sales", poolType: "white-box" },
        { id: "crm", type: "pool", label: "CRM", poolType: "black-box", isSystem: true },
        { id: "s", type: "start-event", label: "Start", pool: "p" },
        { id: "t1", type: "task", label: "Look up customer", pool: "p" },
        { id: "e", type: "end-event", label: "End", pool: "p" },
      ],
      [
        { sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "e" },
        { sourceId: "t1", targetId: "crm", type: "message", label: "query" },
      ],
    );
    const mkB = build(
      [
        { id: "p", type: "pool", label: "Sales", poolType: "white-box" },
        { id: "crm", type: "pool", label: "CRM", poolType: "black-box", isSystem: true },
        { id: "cust", type: "pool", label: "Customer", poolType: "black-box" },
        { id: "s", type: "start-event", label: "Start", pool: "p" },
        { id: "t1", type: "task", label: "Look up customer", pool: "p" },
        { id: "e", type: "end-event", label: "End", pool: "p" },
      ],
      [
        { sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "e" },
        { sourceId: "t1", targetId: "crm", type: "message", label: "lookup" },
        { sourceId: "t1", targetId: "cust", type: "message", label: "confirm" },
      ],
    );
    const md = diffProcesses(mkA, "v1", mkB, "v2").messageDiff;
    // relabelled query → lookup on the same endpoint pair
    expect(md.changed).toEqual([{ from: "Look up customer", to: "CRM", a: "query", b: "lookup" }]);
    // brand-new message to the Customer pool
    expect(md.added).toEqual([{ from: "Look up customer", to: "Customer", label: "confirm" }]);
    expect(md.removed).toEqual([]);
  });
});
