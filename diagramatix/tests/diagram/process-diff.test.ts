/**
 * Diff Processes — deterministic comparison of two BPMN process versions.
 *
 * Covers the three dimensions the feature reports: WHO (role/lane), WHAT systems,
 * and WHAT is done (activity add/remove + task-type change).
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { diffProcesses, normaliseLabel, interpretAutomationChange, extractReview, diffReview } from "@/app/lib/diagram/diff/processDiff";
import type { DiagramData } from "@/app/lib/diagram/types";

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

  it("has a data-object section (added / removed across the diagram)", () => {
    // A has no data objects; B adds nothing via this fixture, but the section
    // must exist and be well-formed. A dedicated add/remove case:
    const withObj = build(
      [
        { id: "p", type: "pool", label: "P", poolType: "white-box" },
        { id: "s", type: "start-event", label: "S", pool: "p" },
        { id: "t", type: "task", label: "Do it", pool: "p" },
        { id: "e", type: "end-event", label: "E", pool: "p" },
        { id: "d", type: "data-object", label: "Application form" },
      ],
      [
        { sourceId: "s", targetId: "t" }, { sourceId: "t", targetId: "e" },
        { sourceId: "d", targetId: "t" },
      ],
    );
    const bare = build(
      [
        { id: "p", type: "pool", label: "P", poolType: "white-box" },
        { id: "s", type: "start-event", label: "S", pool: "p" },
        { id: "t", type: "task", label: "Do it", pool: "p" },
        { id: "e", type: "end-event", label: "E", pool: "p" },
      ],
      [{ sourceId: "s", targetId: "t" }, { sourceId: "t", targetId: "e" }],
    );
    const d = diffProcesses(bare, "v1", withObj, "v2");
    expect(d.dataObjectDiff.added).toContain("Application form");
    expect(d.dataObjectDiff.removed).toEqual([]);
  });

  it("summarises counts", () => {
    expect(diff.summary.added).toBe(1);
    expect(diff.summary.removed).toBe(1);
    expect(diff.summary.changed).toBeGreaterThanOrEqual(2); // Validate + Look up
    expect(diff.b.stepCount).toBe(3);
  });

  it("interprets task-marker changes as automation shifts", () => {
    expect(interpretAutomationChange("manual", "user")).toMatch(/IT system support/i);
    expect(interpretAutomationChange("user", "service")).toMatch(/Automation introduced/i);
    expect(interpretAutomationChange("user", "script")).toMatch(/Automation introduced/i);
    expect(interpretAutomationChange("service", "user")).toMatch(/now performed by a person/i);
    expect(interpretAutomationChange("user", "manual")).toMatch(/IT support removed/i);
    expect(interpretAutomationChange("user", "user")).toBeNull();
    expect(interpretAutomationChange("service", "script")).toMatch(/approach changed/i);
  });

  it("surfaces automation changes in the diff (Look up customer: user → service)", () => {
    const ac = diff.automationChanges.find((c) => c.activity === "Look up customer");
    expect(ac).toBeTruthy();
    expect(ac?.note).toMatch(/Automation introduced/i);
  });

  it("diffs intermediate + boundary events (new timer / error triggers)", () => {
    const base = build(
      [
        { id: "p", type: "pool", label: "P", poolType: "white-box" },
        { id: "s", type: "start-event", label: "S", pool: "p" },
        { id: "t", type: "task", label: "Wait for approval", pool: "p" },
        { id: "e", type: "end-event", label: "E", pool: "p" },
      ],
      [{ sourceId: "s", targetId: "t" }, { sourceId: "t", targetId: "e" }],
    );
    // B adds a non-interrupting timer boundary event on the task + an inline
    // error intermediate event.
    const withEvents = build(
      [
        { id: "p", type: "pool", label: "P", poolType: "white-box" },
        { id: "s", type: "start-event", label: "S", pool: "p" },
        { id: "t", type: "task", label: "Wait for approval", pool: "p" },
        { id: "bt", type: "intermediate-event", label: "2 days", pool: "p", eventType: "timer",
          boundaryHost: "t", properties: { interruptionType: "non-interrupting" } },
        { id: "ie", type: "intermediate-event", label: "Rejected", pool: "p", eventType: "error" },
        { id: "e", type: "end-event", label: "E", pool: "p" },
      ],
      [{ sourceId: "s", targetId: "t" }, { sourceId: "t", targetId: "ie" }, { sourceId: "ie", targetId: "e" }],
    );
    // `layoutBpmnDiagram` forces every edge-mounted intermediate event to
    // INTERRUPTING (T2896) — that rule is scoped to GENERATED diagrams. A
    // hand-drawn one can still carry a non-interrupting boundary event, and the
    // diff has to report it honestly, so the flag is set here the way the editor
    // would rather than by asking the generator for something it will not make.
    const bt = withEvents.elements.find((el) => el.id === "bt")!;
    bt.properties = { ...(bt.properties ?? {}), interruptionType: "non-interrupting" };

    const ed = diffProcesses(base, "v1", withEvents, "v2").eventDiff;
    const triggers = ed.added.map((e) => e.trigger).sort();
    expect(triggers).toEqual(["error", "timer"]);
    const timer = ed.added.find((e) => e.trigger === "timer");
    expect(timer?.kind).toBe("boundary");
    expect(timer?.interrupting).toBe(false);
    expect(ed.removed).toEqual([]);
  });

  it("T2898 — a GENERATED boundary event is reported as interrupting", () => {
    // The other side of the same coin: straight out of the generator, the same
    // fixture comes back interrupting, so the diff reports it that way. Together
    // with the check above this pins that the diff reads the flag rather than
    // assuming one — which is what makes it useful on a hand-edited diagram.
    const base = build(
      [
        { id: "p", type: "pool", label: "P", poolType: "white-box" },
        { id: "s", type: "start-event", label: "S", pool: "p" },
        { id: "t", type: "task", label: "Wait for approval", pool: "p" },
        { id: "e", type: "end-event", label: "E", pool: "p" },
      ],
      [{ sourceId: "s", targetId: "t" }, { sourceId: "t", targetId: "e" }],
    );
    const generated = build(
      [
        { id: "p", type: "pool", label: "P", poolType: "white-box" },
        { id: "s", type: "start-event", label: "S", pool: "p" },
        { id: "t", type: "task", label: "Wait for approval", pool: "p" },
        { id: "bt", type: "intermediate-event", label: "2 days", pool: "p", eventType: "timer",
          boundaryHost: "t", properties: { interruptionType: "non-interrupting" } },
        { id: "e", type: "end-event", label: "E", pool: "p" },
      ],
      [{ sourceId: "s", targetId: "t" }, { sourceId: "t", targetId: "e" }],
    );
    const ed = diffProcesses(base, "v1", generated, "v2").eventDiff;
    const timer = ed.added.find((e) => e.trigger === "timer");
    expect(timer?.kind).toBe("boundary");
    expect(timer?.interrupting, "the generator overrides the plan's request").toBe(true);
  });

  it("reports review status: pain point + review comment removed = review addressed", () => {
    const el = (id: string, type: string, x: number, label = "", props: Record<string, unknown> = {}) =>
      ({ id, type, label, x, y: 100, width: 80, height: 50, properties: props });
    // Before: a task with a Pain Point next to it, a Review Comment, and a
    // bottleneck connector. After: all annotations removed (review addressed).
    const before = {
      elements: [
        el("t", "task", 100, "Slow approval"),
        el("t2", "task", 300, "Notify"),
        el("pp", "uml-pain-point", 110, "1", { description: "Takes too long" }),
        el("rc", "review-comment", 500, "<p>Please automate this</p>", { authorName: "Mary" }),
      ],
      connectors: [{ id: "c", type: "sequence", sourceId: "t", targetId: "t2", bottleneck: true }],
    } as unknown as DiagramData;
    const after = {
      elements: [el("t", "task", 100, "Slow approval"), el("t2", "task", 300, "Notify")],
      connectors: [{ id: "c", type: "sequence", sourceId: "t", targetId: "t2" }],
    } as unknown as DiagramData;

    const items = extractReview(before);
    expect(items.map((i) => i.kind).sort()).toEqual(["bottleneck", "pain-point", "review-comment"]);
    // Pain point is located near the closest activity.
    expect(items.find((i) => i.kind === "pain-point")?.location).toBe("Slow approval");

    const rd = diffReview(extractReview(before), extractReview(after), "v1", "v2");
    expect(rd.aCounts["pain-point"]).toBe(1);
    expect(rd.bCounts["pain-point"]).toBe(0);
    expect(rd.removed.map((r) => r.kind).sort()).toEqual(["bottleneck", "pain-point", "review-comment"]);
    expect(rd.added).toEqual([]);
    expect(rd.status).toMatch(/resolved|reviewed/i);
  });

  it("review status: annotations only added = review occurred", () => {
    const el = (id: string, type: string, label = "", props: Record<string, unknown> = {}) =>
      ({ id, type, label, x: 100, y: 100, width: 80, height: 50, properties: props });
    const before = { elements: [el("t", "task", "Do")], connectors: [] } as unknown as DiagramData;
    const after = {
      elements: [el("t", "task", "Do"), el("i", "uml-issue", "1", { description: "Missing control" })],
      connectors: [],
    } as unknown as DiagramData;
    const rd = diffReview(extractReview(before), extractReview(after), "v1", "v2");
    expect(rd.added.map((r) => r.kind)).toEqual(["issue"]);
    expect(rd.status).toMatch(/reviewed|annotated/i);
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
