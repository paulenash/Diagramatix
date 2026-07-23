/**
 * makeAiClient telemetry wrapper: proves the client returned by the seam records
 * a success row (with token usage + truncation) and a failure row (with an error
 * code) on messages.create — invisibly, passing the original result/error through.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted holders so the (hoisted) vi.mock factories can safely reference them.
const h = vi.hoisted(() => {
  const state: { createImpl: (body: unknown) => Promise<unknown>; recorded: Record<string, unknown>[] } = {
    createImpl: async () => ({}),
    recorded: [],
  };
  class FakeAnthropic {
    messages = { create: (body: unknown) => state.createImpl(body) };
    constructor(_opts: unknown) { /* opts (fetch/maxRetries) ignored by the fake */ }
  }
  return { state, FakeAnthropic };
});

vi.mock("@anthropic-ai/sdk", () => ({ default: h.FakeAnthropic }));
vi.mock("@/app/lib/ai/aiTelemetry", () => ({
  recordAiInvocation: async (r: Record<string, unknown>) => { h.state.recorded.push(r); },
}));
vi.mock("@/app/lib/ai/models", () => ({
  providerForModel: () => "anthropic",
  resolvedEnvSecret: (v: unknown) => v,
}));

import { makeAiClient } from "@/app/lib/ai/anthropicClient";

beforeEach(() => { h.state.recorded.length = 0; });

describe("makeAiClient telemetry wrapper", () => {
  it("T0990 — records a success row with token usage + truncation flag", async () => {
    h.state.createImpl = async () => ({ usage: { input_tokens: 111, output_tokens: 222 }, stop_reason: "max_tokens", content: [] });
    const client = makeAiClient("claude-opus-4-8", "key");
    const resp = await client.messages.create({ model: "claude-opus-4-8", max_tokens: 16000, messages: [] });
    // Original response passes through untouched.
    expect((resp as { usage: { input_tokens: number } }).usage.input_tokens).toBe(111);
    // Telemetry captured it.
    expect(h.state.recorded).toHaveLength(1);
    expect(h.state.recorded[0]).toMatchObject({
      provider: "anthropic",
      model: "claude-opus-4-8",
      status: "success",
      inputTokens: 111,
      outputTokens: 222,
      truncated: true,
      retries: 0,
    });
  });

  it("T0991 — records a failure row with an error code and rethrows", async () => {
    h.state.createImpl = async () => { const e = new Error("boom") as Error & { status?: number }; e.status = 503; throw e; };
    const client = makeAiClient("claude-opus-4-8", "key");
    await expect(client.messages.create({ model: "claude-opus-4-8", max_tokens: 1, messages: [] })).rejects.toThrow("boom");
    expect(h.state.recorded).toHaveLength(1);
    expect(h.state.recorded[0]).toMatchObject({ status: "failure", errorCode: "503", provider: "anthropic" });
  });
});
