/**
 * "You have reached your specified API usage limits."
 *
 * Paul, 2026-09-06, part way through regenerating all 277 Process Repository
 * prompts:
 *
 *   V20.10 Close Matter & Capture Lessons  BPMN  failed
 *   400 {"type":"error","error":{"type":"invalid_request_error","message":
 *   "You have reached your specified API usage limits. You will regain access
 *   on 2026-10-01 at 00:00 UTC."}}
 *
 * A spend cap on the account, not a fault in the request — and the important
 * property is that EVERY remaining call will fail the same way. The batch
 * runners treated it as one prompt failing and carried on, so a run with sixty
 * targets left made sixty more doomed calls, and the reason was buried in sixty
 * identical rows rather than stated once.
 *
 * Note it is delivered as a 400 `invalid_request_error`, not a 429, so the retry
 * logic correctly does not retry it — but nothing stopped the LOOP. That is what
 * this is for.
 */
const SIGNS = [
  "reached your specified api usage limits",
  "you will regain access on",
  "credit balance is too low",
  "insufficient_quota",
  "exceeded your current quota",
  "billing_hard_limit_reached",
];

/**
 * True when the account cannot make any further calls, whatever the request.
 *
 * Deliberately NOT matched on "rate limit" or 429: those are a pause, and a
 * batch that abandons itself over a momentary rate limit is worse than one that
 * waits. This is the permanent kind, where continuing cannot help.
 */
export function isQuotaExhausted(err: unknown): boolean {
  const text = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  if (!text) return false;
  return SIGNS.some((s) => text.includes(s));
}

/**
 * The date access returns, when the provider names one. Reported so the message
 * says when to come back rather than only that something stopped.
 */
export function quotaResumesAt(err: unknown): string | null {
  const text = err instanceof Error ? err.message : String(err ?? "");
  const m = /regain access on (\d{4}-\d{2}-\d{2})(?:\s+at\s+([\d:]+\s*\w*))?/i.exec(text);
  return m ? (m[2] ? `${m[1]} at ${m[2]}` : m[1]) : null;
}
