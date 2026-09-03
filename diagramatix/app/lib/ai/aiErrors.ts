/**
 * What an AI failure means, and how to say it.
 *
 * Paul, 2026-09-03, twice in one day: a batch run showed
 * `V02.05 ✗ 529 {"type":"error","error":{"type":"overloaded_e…`, and a manual
 * regeneration showed `AI planning failed: 529 {"type":"error",…`. Two
 * different code paths, the same two faults: the provider was merely busy, and
 * the raw provider JSON was pasted at the user.
 *
 * 529 is Anthropic's `overloaded_error` — their servers saturated for a moment.
 * Nothing is wrong with the prompt, the rules or the diagram. The only correct
 * responses are to wait and try again, and to say so in words.
 *
 * Lives here rather than in any one route because there are five entry points
 * into generation — the plan route, generate-bpmn, the model comparison, the
 * batch tool and the partner API — and a fix in one of them is a fix nobody
 * else gets. That is exactly how the batch tool came to be the only place that
 * handled this.
 */

/** Is this the provider being busy, rather than anything being wrong? */
export function isTransientAiError(e: unknown): boolean {
  const status = (e as { status?: number } | undefined)?.status;
  if (status === 408 || status === 409 || status === 429 || status === 529) return true;
  if (typeof status === "number" && status >= 500) return true;
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return m.includes("overloaded")
    || m.includes("rate limit") || m.includes("rate_limit")
    || m.includes("529") || m.includes("503") || m.includes("502")
    || m.includes("timeout") || m.includes("timed out") || m.includes("etimedout")
    || m.includes("econnreset") || m.includes("socket hang up");
}

/**
 * A line worth showing someone.
 *
 * Never the provider's JSON: it is long, it is not about them, and it buries
 * the one word that matters. An unrecognised failure is truncated rather than
 * pasted whole, so an unexpected shape cannot flood the UI either.
 */
export function describeAiError(e: unknown): string {
  const raw = (e instanceof Error ? e.message : String(e)).trim();
  if (/overloaded|\b529\b/i.test(raw)) return "The AI provider is overloaded right now (529). This is temporary — try again in a moment.";
  if (/rate.?limit|\b429\b/i.test(raw)) return "The AI provider rate limit was reached (429). This is temporary — try again in a moment.";
  if (/timeout|timed out|etimedout/i.test(raw)) return "The AI call timed out. This is usually temporary — try again.";
  if (/econnreset|socket hang up/i.test(raw)) return "The connection to the AI provider dropped. Try again.";
  if (/\b401\b|unauthor/i.test(raw)) return "The AI provider rejected the API key (401). Check the key for this model.";
  if (/\b402\b|credit|quota|billing/i.test(raw)) return "The AI account is out of credit or over quota.";
  return raw.length > 200 ? `${raw.slice(0, 197)}…` : raw;
}
