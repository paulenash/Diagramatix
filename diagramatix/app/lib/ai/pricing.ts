/**
 * Reference price snapshot (USD per 1M tokens) for the models AI Generate can use,
 * powering the cost comparison on the AI Models Selection page.
 *
 * STATIC snapshot — providers change prices; verify and bump the date on refresh:
 *   Claude — anthropic.com/pricing (these are the current list rates)
 *   Kimi / Moonshot — platform.kimi.ai (international USD)
 *
 * Pure data + helpers, safe to import on the client.
 */
export const PRICING_SNAPSHOT_DATE = "2026-07-22";

export interface ModelPrice {
  in: number; // USD per 1M input tokens
  out: number; // USD per 1M output tokens
  note?: string;
}

// Keyed by exact model id. Any id not listed (e.g. `kimi-latest`, which floats to
// Moonshot's current flagship, or a local/custom model) resolves to undefined and
// the UI shows "varies" rather than a wrong fixed number.
const PRICING: Record<string, ModelPrice> = {
  // Claude — Anthropic list pricing
  "claude-fable-5": { in: 10, out: 50 },
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 3, out: 15, note: "intro $2 / $10 through 2026-08-31" },
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
  // Kimi / Moonshot — international USD
  "kimi-k2-0711-preview": { in: 0.6, out: 2.5 },
  "moonshot-v1-128k": { in: 2, out: 5 },
  "moonshot-v1-128k-vision-preview": { in: 2, out: 5 },
  // Newer named Kimi models — priced here for reference, but only appear in the app
  // when their EXACT native ids are registered via MOONSHOT_MODELS.
  "kimi-k2.5": { in: 0.6, out: 3 },
  "kimi-k2.6": { in: 0.95, out: 4 },
  "kimi-k3": { in: 3, out: 15 },
};

/** The reference price for a model id, or undefined when unknown / floating. */
export function pricingFor(id: string): ModelPrice | undefined {
  return PRICING[id];
}

/** A representative single BPMN generation, for a concrete per-run cost estimate. */
export const TYPICAL_GEN = { inTokens: 8000, outTokens: 3000 };

/** Estimated USD cost of one typical generation at a model's rates. */
export function typicalCost(p: ModelPrice): number {
  return (TYPICAL_GEN.inTokens / 1e6) * p.in + (TYPICAL_GEN.outTokens / 1e6) * p.out;
}
