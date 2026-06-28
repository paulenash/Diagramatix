/**
 * Pure output-shape regression net for `validatePlan` (app/lib/ai/planSchema.ts)
 * — the Zod gate the AI plan JSON must pass before the layout engine consumes
 * it. Drives the REAL validatePlan; does not reimplement its rules.
 *
 * The schema (AiPlanSchema):
 *   - elements: array of AiElementSchema { id (min 1), type (enum), label, … }
 *     — `.passthrough()`, so unknown keys are allowed.
 *   - connections: array of AiConnectionSchema { sourceId (min 1),
 *     targetId (min 1), label?, type? } — also `.passthrough()`.
 *
 * NOTE on actual behaviour pinned below:
 *   - The arrays themselves have NO `.min(1)` — an EMPTY elements/connections
 *     array IS accepted. (validatePlan is shape-only; emptiness/zero-element
 *     plans are not rejected here.)
 *   - There is NO cross-reference check — a connection referencing a
 *     non-existent element id is ACCEPTED by validatePlan (referential
 *     integrity is enforced later, by the layout/checks layer, not the schema).
 *   These differ from the task's "if it checks" wording, so they are flagged
 *   explicitly in tests rather than asserted as rejections.
 */
import { describe, it, expect } from "vitest";
import { validatePlan } from "@/app/lib/ai/planSchema";

const wellFormed = () => ({
  elements: [
    { id: "p1", type: "pool", label: "Company", poolType: "white-box" },
    { id: "e1", type: "start-event", label: "Start", pool: "p1" },
    { id: "t1", type: "task", label: "Do thing", taskType: "user", pool: "p1" },
    { id: "e2", type: "end-event", label: "End", pool: "p1" },
  ],
  connections: [
    { sourceId: "e1", targetId: "t1", type: "sequence" },
    { sourceId: "t1", targetId: "e2", type: "sequence" },
  ],
});

describe("validatePlan — accepts well-formed plans", () => {
  it("accepts a complete elements + connections plan", () => {
    const res = validatePlan(wellFormed());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.plan.elements).toHaveLength(4);
      expect(res.plan.connections).toHaveLength(2);
    }
  });

  it("preserves unknown passthrough keys on elements and connections", () => {
    const plan = wellFormed();
    (plan.elements[0] as Record<string, unknown>).customFlag = true;
    (plan.connections[0] as Record<string, unknown>).waypoints = [{ x: 1, y: 2 }];
    const res = validatePlan(plan);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect((res.plan.elements[0] as Record<string, unknown>).customFlag).toBe(true);
      expect((res.plan.connections[0] as Record<string, unknown>).waypoints).toEqual([{ x: 1, y: 2 }]);
    }
  });

  it("accepts every element type in the enum", () => {
    const types = [
      "pool", "lane", "start-event", "end-event", "intermediate-event",
      "task", "gateway", "subprocess", "subprocess-expanded",
      "data-object", "data-store", "text-annotation", "group",
    ];
    const res = validatePlan({
      elements: types.map((t, i) => ({ id: `x${i}`, type: t, label: t })),
      connections: [],
    });
    expect(res.ok).toBe(true);
  });
});

describe("validatePlan — rejects malformed plans", () => {
  it("rejects a missing elements array", () => {
    const res = validatePlan({ connections: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues.some((i) => i.startsWith("elements"))).toBe(true);
  });

  it("rejects a missing connections array", () => {
    const res = validatePlan({ elements: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues.some((i) => i.startsWith("connections"))).toBe(true);
  });

  it("rejects an element with a missing required id", () => {
    const res = validatePlan({
      elements: [{ type: "task", label: "No id" }],
      connections: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues.some((i) => i.includes("id"))).toBe(true);
  });

  it("rejects an element with an empty-string id (min 1)", () => {
    const res = validatePlan({
      elements: [{ id: "", type: "task", label: "Empty id" }],
      connections: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues.some((i) => i.includes("0.id"))).toBe(true);
  });

  it("rejects an element with a type not in the enum", () => {
    const res = validatePlan({
      elements: [{ id: "a", type: "startEvent", label: "Wrong casing" }],
      connections: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues.some((i) => i.includes("type"))).toBe(true);
  });

  it("rejects an element with a wrong-typed label (number, not string)", () => {
    const res = validatePlan({
      elements: [{ id: "a", type: "task", label: 42 }],
      connections: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues.some((i) => i.includes("label"))).toBe(true);
  });

  it("rejects an element with a wrong-typed poolType (not in white-box/black-box)", () => {
    const res = validatePlan({
      elements: [{ id: "p", type: "pool", label: "P", poolType: "grey-box" }],
      connections: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues.some((i) => i.includes("poolType"))).toBe(true);
  });

  it("rejects a connection missing sourceId / targetId", () => {
    const res = validatePlan({
      elements: [{ id: "a", type: "task", label: "A" }],
      connections: [{ targetId: "a" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues.some((i) => i.includes("sourceId"))).toBe(true);
  });

  it("rejects an entirely wrong root type (null)", () => {
    const res = validatePlan(null);
    expect(res.ok).toBe(false);
  });

  it("returns human-readable path-prefixed issues", () => {
    const res = validatePlan({ elements: [{ type: "task", label: "x" }], connections: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.length).toBeGreaterThan(0);
      // Each issue is "<path>: <message>".
      for (const issue of res.issues) expect(issue).toMatch(/: /);
    }
  });
});

describe("validatePlan — pinned actual behaviour (shape-only, no semantics)", () => {
  it("ACCEPTS an empty elements + connections plan (no .min(1) on the arrays)", () => {
    const res = validatePlan({ elements: [], connections: [] });
    expect(res.ok).toBe(true);
  });

  it("ACCEPTS a connection referencing a non-existent element id (no cross-ref check)", () => {
    const res = validatePlan({
      elements: [{ id: "a", type: "task", label: "A" }],
      connections: [{ sourceId: "a", targetId: "ghost" }],
    });
    // validatePlan is shape-only — referential integrity is enforced downstream.
    expect(res.ok).toBe(true);
  });
});
