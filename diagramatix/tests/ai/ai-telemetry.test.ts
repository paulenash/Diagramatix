/**
 * AI telemetry context + recordAiInvocation: the AsyncLocalStorage context set by
 * a route is merged into the row, the writer never throws, and every code-defined
 * invocation point has a friendly label + a unique value.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let created: Record<string, unknown>[] = [];
let diagCreated: Record<string, unknown>[] = [];
let failNext = false;
vi.mock("@/app/lib/db", () => ({
  prisma: {
    aiInvocation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (failNext) { failNext = false; throw new Error("db down"); }
        created.push(data);
        return data;
      },
    },
    aiDiagramGeneration: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (failNext) { failNext = false; throw new Error("db down"); }
        diagCreated.push(data);
        return data;
      },
    },
  },
}));

import {
  runWithAiContext,
  enterAiContext,
  recordAiInvocation,
  recordDiagramGenerated,
  AI_INVOCATION_POINTS,
  AI_INVOCATION_POINT_VALUES,
  AI_INVOCATION_POINT_LABELS,
  AI_USER_METERED_POINTS,
  labelForInvocationPoint,
} from "@/app/lib/ai/aiTelemetry";

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { created = []; diagCreated = []; failNext = false; });

describe("aiTelemetry", () => {
  it("T0986 — records the row merged with the route's ALS context", async () => {
    await runWithAiContext(
      { userId: "u1", orgId: "o1", invocationPoint: AI_INVOCATION_POINTS.BpmnGenerate },
      async () => {
        await recordAiInvocation({ provider: "anthropic", model: "claude-opus-4-8", status: "success", inputTokens: 10, outputTokens: 20, retries: 1, truncated: false });
      },
    );
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      provider: "anthropic",
      model: "claude-opus-4-8",
      userId: "u1",
      orgId: "o1",
      invocationPoint: "bpmn.generate",
      status: "success",
      inputTokens: 10,
      outputTokens: 20,
      retries: 1,
    });
  });

  it("T0987 — outside any context, user/org are null and point is 'unknown'", async () => {
    await recordAiInvocation({ provider: "moonshot", model: "kimi-k3", status: "failure", errorCode: "429" });
    expect(created[0]).toMatchObject({ userId: null, orgId: null, invocationPoint: "unknown", status: "failure", errorCode: "429" });
  });

  it("T0988 — never throws even if the DB write fails", async () => {
    failNext = true;
    await expect(recordAiInvocation({ provider: "anthropic", model: "x", status: "success" })).resolves.toBeUndefined();
    expect(created).toHaveLength(0);
  });

  // Regression for the "unknown" mis-attribution bug: enterAiContext uses
  // AsyncLocalStorage.enterWith, which sets the store on the CURRENT async frame.
  // The route must enter the context in its OWN body (after resolving org) so it
  // survives the route's remaining awaits before the AI seam. Each test is wrapped
  // in runWithAiContext so its enterWith is scoped + restored (no cross-test leak).
  it("T1092 — context entered in the handler body reaches the seam across a following await", async () => {
    await runWithAiContext(
      { userId: null, orgId: null, invocationPoint: "unknown" }, // outer sentinel
      async () => {
        // Mirrors: enterAiContext(await resolveAiRouteContext(session, POINT))
        async function resolve() { await tick(); return { userId: "u", orgId: "o", invocationPoint: AI_INVOCATION_POINTS.DiagramGenerate }; }
        enterAiContext(await resolve());
        await tick(); // the route's remaining awaits (req.json, rule load, …)
        await recordAiInvocation({ provider: "anthropic", model: "claude-opus-4-8", status: "success" });
      },
    );
    expect(created[0]).toMatchObject({ invocationPoint: "diagram.generate", userId: "u", orgId: "o" });
  });

  it("T1093 — the OLD form (enterWith INSIDE an awaited helper) loses the context → 'unknown'", async () => {
    await runWithAiContext(
      { userId: null, orgId: null, invocationPoint: "unknown" },
      async () => {
        // The bug: enter-in-helper. enterWith mutates the helper's frame, which is
        // not the frame the caller resumes on — so the seam never sees this context.
        async function enterInHelper() { await tick(); enterAiContext({ userId: "u", orgId: "o", invocationPoint: AI_INVOCATION_POINTS.DiagramGenerate }); }
        await enterInHelper();
        await tick();
        await recordAiInvocation({ provider: "anthropic", model: "claude-opus-4-8", status: "success" });
      },
    );
    // Falls back to the outer sentinel — proving why the old routes logged "unknown".
    expect(created[0].invocationPoint).toBe("unknown");
    expect(created[0].userId).toBeNull();
  });

  it("T1094 — AI_USER_METERED_POINTS = the 12 quota-metered routes; AI Tidy/Vectorize/Compare excluded", () => {
    // These MUST match the routes that call recordUsage(userId, "aiAttempts").
    const expected = new Set([
      AI_INVOCATION_POINTS.BpmnPlan, AI_INVOCATION_POINTS.BpmnGenerate, AI_INVOCATION_POINTS.BpmnRefine,
      AI_INVOCATION_POINTS.FlowchartPlan, AI_INVOCATION_POINTS.FlowchartToBpmnRefine,
      AI_INVOCATION_POINTS.DiagramGenerate, AI_INVOCATION_POINTS.StaffNarrative, AI_INVOCATION_POINTS.GenerateSop,
      AI_INVOCATION_POINTS.ProcessDiff,
      AI_INVOCATION_POINTS.MiningDiscover, AI_INVOCATION_POINTS.MiningDiscoverSm, AI_INVOCATION_POINTS.MiningExplain,
    ]);
    expect(new Set(AI_USER_METERED_POINTS)).toEqual(expected);
    // Raw-only points must NOT count as a User Attempt.
    for (const p of [AI_INVOCATION_POINTS.DictationRefine, AI_INVOCATION_POINTS.IconVectorize, AI_INVOCATION_POINTS.BpmnCompare, AI_INVOCATION_POINTS.ScriptModelCompare, AI_INVOCATION_POINTS.ScriptConformanceReport]) {
      expect(AI_USER_METERED_POINTS.has(p), `${p} must not be metered`).toBe(false);
    }
  });

  it("T1095 — recordDiagramGenerated writes a row and never throws", async () => {
    await recordDiagramGenerated({ userId: "u1", orgId: "o1", diagramType: "bpmn", source: "bpmn-apply" });
    expect(diagCreated).toHaveLength(1);
    expect(diagCreated[0]).toMatchObject({ userId: "u1", orgId: "o1", diagramType: "bpmn", source: "bpmn-apply" });
    // Null user/org allowed (system); a DB failure is swallowed.
    failNext = true;
    await expect(recordDiagramGenerated({ userId: null, orgId: null, diagramType: "flowchart", source: "flowchart-apply" })).resolves.toBeUndefined();
    expect(diagCreated).toHaveLength(1);
  });

  it("T0989 — every invocation point has a label; values are unique", () => {
    for (const v of AI_INVOCATION_POINT_VALUES) {
      expect(AI_INVOCATION_POINT_LABELS[v]).toBeTruthy();
      expect(labelForInvocationPoint(v)).toBe(AI_INVOCATION_POINT_LABELS[v]);
    }
    expect(new Set(AI_INVOCATION_POINT_VALUES).size).toBe(AI_INVOCATION_POINT_VALUES.length);
    // unknown value falls back to itself
    expect(labelForInvocationPoint("nope")).toBe("nope");
  });
});
