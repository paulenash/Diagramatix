/**
 * Partner API — the published payload, and the core that produces it.
 *
 * `shapeResult` is a hand-written mapping rather than a serialised
 * `SopSkeleton`, and T2975 is why: the skeleton is internal, it will grow fields
 * for SOP reasons, and a partner writing code against it would be broken by our
 * own refactoring. The allow-list test makes a contract change a deliberate edit.
 *
 * `runProcessMap` is exercised against a STUBBED planBpmn — the point of putting
 * it in its own file with no HTTP and no persistence is that its behaviour can
 * be pinned without a server, a database or a penny of AI spend.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import {
  shapeResult, PARTNER_SHAPE_KEYS, PARTNER_ACTIVITY_KEYS,
} from "@/app/lib/partner/shapeResult";

/** A two-lane order process with a system pool, a decision and a hand-off. */
function orderProcess() {
  const els: AiElement[] = [
    { id: "p", type: "pool", label: "Acme", poolType: "white-box" },
    { id: "l1", type: "lane", label: "AP Clerk", parentPool: "p" },
    { id: "l2", type: "lane", label: "Approver", parentPool: "p" },
    { id: "sys", type: "pool", label: "SAP", poolType: "black-box", isSystem: true },
    { id: "s", type: "start-event", label: "Invoice received", pool: "p", lane: "l1" },
    { id: "t1", type: "task", label: "Receive Invoice", taskType: "user", pool: "p", lane: "l1" },
    { id: "t2", type: "task", label: "Check Against PO", taskType: "user", pool: "p", lane: "l1" },
    { id: "g", type: "gateway", label: "Approved?", gatewayType: "exclusive", pool: "p", lane: "l2" },
    { id: "t3", type: "task", label: "Approve Payment", taskType: "user", pool: "p", lane: "l2" },
    { id: "t4", type: "task", label: "Return To Clerk", taskType: "user", pool: "p", lane: "l2" },
    { id: "e", type: "end-event", label: "Invoice approved", pool: "p", lane: "l2" },
    { id: "d", type: "data-object", label: "Invoice", pool: "p", lane: "l1" },
  ];
  const conns: AiConnection[] = [
    { sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "t2" },
    { sourceId: "t2", targetId: "g" },
    { sourceId: "g", targetId: "t3", label: "yes" },
    { sourceId: "g", targetId: "t4", label: "no" },
    { sourceId: "t3", targetId: "e" }, { sourceId: "t4", targetId: "e" },
    { sourceId: "t2", targetId: "sys", type: "message" },
    { sourceId: "t1", targetId: "d" },
  ];
  return layoutBpmnDiagram(els, conns);
}

describe("shapeResult — the published payload", () => {
  it("T2971 — pools and lanes come back nested, in the order a reader sees them", () => {
    const shape = shapeResult(orderProcess());
    const acme = shape.pools.find((p) => p.name === "Acme");
    expect(acme, "the white-box pool must be there").toBeTruthy();
    expect(acme!.external).toBe(false);
    expect(acme!.lanes.map((l) => l.name)).toEqual(["AP Clerk", "Approver"]);

    const sap = shape.pools.find((p) => p.name === "SAP");
    expect(sap?.external, "a system pool is somebody else").toBe(true);
  });

  it("T2972 — activities are ordered from 1 and carry their pool, lane and type", () => {
    const shape = shapeResult(orderProcess());
    expect(shape.activities.length).toBeGreaterThan(0);
    expect(shape.activities.map((a) => a.no)).toEqual(
      shape.activities.map((_, i) => i + 1).slice(0, shape.activities.length),
    );
    const receive = shape.activities.find((a) => a.name === "Receive Invoice");
    expect(receive, "the first task must appear").toBeTruthy();
    expect(receive!.lane).toBe("AP Clerk");
    expect(receive!.pool).toBe("Acme");
    expect(receive!.taskType).toBe("user");
    expect(receive!.id, "an activity carries the element id so it can be pointed at").toBeTruthy();
  });

  it("T2973 — a gateway surfaces as a decision with its branches", () => {
    const shape = shapeResult(orderProcess());
    expect(shape.decisions.length).toBeGreaterThan(0);
    const d = shape.decisions[0];
    expect(d.question).toContain("Approved");
    expect(d.branches.some((b) => /yes/i.test(b.label))).toBe(true);
  });

  it("T2974 — a two-lane process does NOT warn about a single lane", () => {
    const shape = shapeResult(orderProcess());
    expect(shape.warnings.map((w) => w.code)).not.toContain("single_lane");

    // …but a one-lane one does, because a role analysis over it returns nothing
    // and the caller should be told why rather than left to wonder.
    const flat = layoutBpmnDiagram(
      [
        { id: "p", type: "pool", label: "Acme", poolType: "white-box" },
        { id: "s", type: "start-event", label: "In", pool: "p" },
        { id: "t", type: "task", label: "Do It", pool: "p" },
        { id: "e", type: "end-event", label: "Out", pool: "p" },
      ],
      [{ sourceId: "s", targetId: "t" }, { sourceId: "t", targetId: "e" }],
    );
    expect(shapeResult(flat).warnings.map((w) => w.code)).toContain("single_lane");
  });

  it("T2975 — the payload's keys match the allow-list, so nothing leaks into the contract", () => {
    // SopSkeleton is internal and will grow fields. This is what stops one of
    // them appearing in a published contract by accident.
    const shape = shapeResult(orderProcess());
    expect(Object.keys(shape).sort()).toEqual([...PARTNER_SHAPE_KEYS].sort());
    for (const a of shape.activities) {
      expect(Object.keys(a).sort()).toEqual([...PARTNER_ACTIVITY_KEYS].sort());
    }
  });

  it("T2976 — it is deterministic: the same diagram shapes identically twice", () => {
    // The caller SCORES this. A payload that reordered between calls would make
    // any comparison meaningless.
    const data = orderProcess();
    expect(JSON.stringify(shapeResult(data))).toBe(JSON.stringify(shapeResult(data)));
  });
});

// ── runProcessMap, against a stubbed model ──────────────────────────────────

vi.mock("@/app/lib/ai/loadAiRules", () => ({
  loadAiRulesForType: vi.fn(async () => "GREEN RULES"),
}));
const planBpmnMock = vi.fn();
vi.mock("@/app/lib/ai/planBpmn", () => ({
  planBpmn: (...args: unknown[]) => planBpmnMock(...args),
}));

describe("runProcessMap — the core, with no AI spend", () => {
  beforeEach(() => { planBpmnMock.mockReset(); });

  it("T2977 — a description alone produces a diagram and a payload", async () => {
    const { runProcessMap } = await import("@/app/lib/partner/runProcessMap");
    planBpmnMock.mockResolvedValue({
      ok: true, model: "test",
      plan: {
        elements: [
          { id: "p", type: "pool", label: "Acme", poolType: "white-box" },
          { id: "l", type: "lane", label: "Finance", parentPool: "p" },
          { id: "s", type: "start-event", label: "In", pool: "p", lane: "l" },
          { id: "t", type: "task", label: "Check Invoice", pool: "p", lane: "l" },
          { id: "e", type: "end-event", label: "Out", pool: "p", lane: "l" },
        ],
        connections: [{ sourceId: "s", targetId: "t" }, { sourceId: "t", targetId: "e" }],
      },
    });

    const r = await runProcessMap({
      description: "Finance checks each invoice against the purchase order.",
      name: "Invoice check", model: "m", apiKey: "k",
    });
    expect(r.shape.activities.map((a) => a.name)).toContain("Check Invoice");
    expect(r.data.elements.length).toBeGreaterThan(0);
    expect(planBpmnMock).toHaveBeenCalledOnce();
  });

  it("T2978 — the document is FORWARDED to the model", async () => {
    // The gap this slice closed: generateDiagramData accepted no attachment, so
    // a document could not reach planBpmn through the normal path at all.
    const { runProcessMap } = await import("@/app/lib/partner/runProcessMap");
    planBpmnMock.mockResolvedValue({
      ok: true, model: "test",
      plan: { elements: [{ id: "p", type: "pool", label: "A", poolType: "white-box" }], connections: [] },
    });

    await runProcessMap({
      attachment: { type: "pdf", data: "JVBERi0=", name: "sop.pdf" },
      model: "m", apiKey: "k",
    });
    const arg = planBpmnMock.mock.calls[0][0] as { attachment?: { type: string; name?: string }; prompt: string };
    expect(arg.attachment?.type).toBe("pdf");
    expect(arg.attachment?.name).toBe("sop.pdf");
    // …and the prompt tells the model the document is authoritative.
    expect(arg.prompt).toMatch(/attached document/i);
  });

  it("T2979 — neither a description nor a document is refused before any call", async () => {
    const { runProcessMap, ProcessMapError } = await import("@/app/lib/partner/runProcessMap");
    await expect(runProcessMap({ model: "m", apiKey: "k" })).rejects.toBeInstanceOf(ProcessMapError);
    expect(planBpmnMock, "must not spend a model call on an empty request").not.toHaveBeenCalled();
  });

  it("T2980 — a model that cannot produce a plan becomes an actionable error", async () => {
    const { runProcessMap, ProcessMapError } = await import("@/app/lib/partner/runProcessMap");
    planBpmnMock.mockResolvedValue({ ok: false, status: 502, error: "BPMN plan failed: bad JSON" });

    await expect(runProcessMap({ description: "something", model: "m", apiKey: "k" }))
      .rejects.toMatchObject({ code: "ai_plan_failed" });
    // The caller is told what to do about it, not what our parser said.
    await expect(runProcessMap({ description: "something", model: "m", apiKey: "k" }))
      .rejects.toSatisfy((e: unknown) =>
        e instanceof ProcessMapError && !/JSON|parse error|stack/i.test(e.message.replace(/could not build/i, "")));
  });

  it("T2981 — stages are reported in order, and the plan is offered for storage", async () => {
    const { runProcessMap } = await import("@/app/lib/partner/runProcessMap");
    const plan = { elements: [{ id: "p", type: "pool", label: "A", poolType: "white-box" }], connections: [] };
    planBpmnMock.mockResolvedValue({ ok: true, model: "test", plan });

    const stages: string[] = [];
    let captured: unknown = null;
    await runProcessMap({
      description: "x", model: "m", apiKey: "k",
      onStage: (s) => stages.push(s),
      onPlan: (p) => { captured = p; },
    });
    expect(stages).toEqual(["reading", "planning", "shaping"]);
    // Storing the plan is what makes a bad generation replayable offline.
    expect(captured).toBeTruthy();
  });
});
