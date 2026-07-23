/**
 * AI telemetry context + recordAiInvocation: the AsyncLocalStorage context set by
 * a route is merged into the row, the writer never throws, and every code-defined
 * invocation point has a friendly label + a unique value.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let created: Record<string, unknown>[] = [];
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
  },
}));

import {
  runWithAiContext,
  recordAiInvocation,
  AI_INVOCATION_POINTS,
  AI_INVOCATION_POINT_VALUES,
  AI_INVOCATION_POINT_LABELS,
  labelForInvocationPoint,
} from "@/app/lib/ai/aiTelemetry";

beforeEach(() => { created = []; failNext = false; });

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
