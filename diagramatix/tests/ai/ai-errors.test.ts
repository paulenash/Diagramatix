/**
 * A busy provider is named as such, and never pasted at the user raw.
 *
 * Paul hit this twice on 2026-09-03 through two different code paths — the
 * batch tool showed `✗ 529 {"type":"error","error":{"type":"overloaded_e…` and
 * a manual regeneration showed `AI planning failed: 529 {"type":"error",…` —
 * and then four more times in a row, which is what a genuinely saturated
 * provider looks like. Neither message told him it was upstream, temporary, or
 * nothing to do with his prompt.
 */
import { describe, it, expect } from "vitest";
import { isTransientAiError, describeAiError } from "@/app/lib/ai/aiErrors";

describe("transient AI failures are recognised", () => {
  it("T3163 — overload, rate limit, timeout and 5xx are all transient", () => {
    for (const e of [
      Object.assign(new Error("boom"), { status: 529 }),
      Object.assign(new Error("boom"), { status: 429 }),
      Object.assign(new Error("boom"), { status: 503 }),
      new Error(`529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}`),
      new Error("Request timed out"),
      new Error("socket hang up"),
    ]) expect(isTransientAiError(e), String(e)).toBe(true);
  });

  it("T3164 — a real fault is NOT retried (the negative control)", () => {
    // Retrying these burns tokens to reach the same answer, so the distinction
    // has to hold in both directions.
    for (const e of [
      Object.assign(new Error("bad request"), { status: 400 }),
      new Error("The AI response had no usable elements — please try again."),
      new Error("invalid_request_error: max_tokens is too large"),
    ]) expect(isTransientAiError(e), String(e)).toBe(false);
  });
});

describe("the provider's own JSON never reaches the user", () => {
  it("T3165 — an overload reads as words, and says it is temporary", () => {
    const msg = describeAiError(new Error(`529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"},"request_id":"req_011Ceg"}`));
    expect(msg).not.toContain("{");
    expect(msg).not.toContain("request_id");
    expect(msg.toLowerCase()).toContain("overloaded");
    expect(msg.toLowerCase()).toContain("temporary");
  });

  it("T3166 — an unrecognised failure is truncated, not pasted whole", () => {
    const long = describeAiError(new Error("x".repeat(900)));
    expect(long.length).toBeLessThanOrEqual(200);
    expect(long.endsWith("…")).toBe(true);
  });

  it("T3167 — a key or billing problem is named, since retrying will not help", () => {
    expect(describeAiError(Object.assign(new Error("401 unauthorized"), {})).toLowerCase()).toContain("key");
    expect(describeAiError(new Error("insufficient credit")).toLowerCase()).toMatch(/credit|quota/);
  });
});
