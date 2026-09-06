import { describe, it, expect } from "vitest";
import { isQuotaExhausted, quotaResumesAt } from "@/app/lib/ai/quotaExhausted";

/**
 * Paul, 2026-09-06, part way through regenerating all 277 repository prompts:
 *
 *   V20.10 Close Matter & Capture Lessons  BPMN  failed
 *   400 {"type":"error","error":{"type":"invalid_request_error","message":
 *   "You have reached your specified API usage limits. You will regain access
 *   on 2026-10-01 at 00:00 UTC."}}
 *
 * A spend cap on the account. The property that matters is that every remaining
 * call fails identically — so the batch must STOP, not carry on making doomed
 * calls and burying the reason in a wall of identical rows.
 */
const REAL = new Error(
  '400 {"type":"error","error":{"type":"invalid_request_error","message":'
  + '"You have reached your specified API usage limits. You will regain access on '
  + '2026-10-01 at 00:00 UTC."},"request_id":"req_011Cemg2pPScD7wViFZVAiHR"}');

describe("a spend cap is recognised and stops the batch", () => {
  it("T3282 the exact message Paul hit is recognised", () => {
    expect(isQuotaExhausted(REAL)).toBe(true);
    expect(isQuotaExhausted(REAL.message)).toBe(true);
  });

  it("T3283 it names the date access comes back, so the message says when", () => {
    expect(quotaResumesAt(REAL)).toBe("2026-10-01 at 00:00 UTC");
  });

  it("T3284 a RATE limit is NOT treated as exhaustion", () => {
    // The distinction is the whole point. A rate limit is a pause and the batch
    // should wait through it; abandoning a 277-prompt run over a momentary 429
    // would be worse than the problem it solves.
    for (const m of [
      "429 rate_limit_error: Number of requests has exceeded your rate limit",
      "overloaded_error: Overloaded",
      "socket hang up",
      "The model ran out of room and stopped mid-prompt",
    ]) {
      expect(isQuotaExhausted(new Error(m)), m).toBe(false);
    }
  });

  it("T3285 other providers' ways of saying the same thing are recognised", () => {
    for (const m of [
      "Your credit balance is too low to access the Anthropic API",
      "insufficient_quota: You exceeded your current quota",
      "billing_hard_limit_reached",
    ]) {
      expect(isQuotaExhausted(new Error(m)), m).toBe(true);
    }
  });

  it("T3286 nothing, and anything unrelated, is not a spend cap", () => {
    expect(isQuotaExhausted(null)).toBe(false);
    expect(isQuotaExhausted(undefined)).toBe(false);
    expect(isQuotaExhausted("")).toBe(false);
    expect(isQuotaExhausted(new Error("Prisma error"))).toBe(false);
    expect(quotaResumesAt(new Error("no date here"))).toBeNull();
  });
});
