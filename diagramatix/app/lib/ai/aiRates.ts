// Server-only. Editable cost-per-token catalog: the static defaults in pricing.ts
// overlaid with SuperAdmin overrides in the AiModelRate table. This is the single
// source of truth for AI cost — the AI Usage report multiplies tokens by these.
// USD-only today (Paul, 2026-07-23); the currency field carries through for later.
import { prisma } from "@/app/lib/db";
import { PRICING } from "./pricing";

export interface EffectiveRate {
  provider: string;
  model: string;
  inputPer1M: number;
  outputPer1M: number;
  currency: string;
  source: "default" | "override";
}

/**
 * Provider for a model id, for pricing purposes — pure/prefix-based (kimi* /
 * moonshot* → moonshot, else anthropic), so it works on the client and doesn't
 * depend on env-gated model registration (providerForModel in models.ts returns
 * "anthropic" for kimi ids when no MOONSHOT_API_KEY is set).
 */
export function providerOf(model: string): string {
  return /^(kimi|moonshot)/i.test(model) ? "moonshot" : "anthropic";
}

/** The built-in default rates, from the pricing.ts snapshot. */
export function defaultRates(): EffectiveRate[] {
  return Object.entries(PRICING).map(([model, p]) => ({
    provider: providerOf(model),
    model,
    inputPer1M: p.in,
    outputPer1M: p.out,
    currency: "USD",
    source: "default" as const,
  }));
}

/** Defaults overlaid with any DB overrides (DB wins). Never throws — falls back
 *  to defaults if the table is unavailable. */
export async function effectiveRates(): Promise<EffectiveRate[]> {
  const byKey = new Map<string, EffectiveRate>();
  for (const r of defaultRates()) byKey.set(`${r.provider}::${r.model}`, r);
  try {
    const rows = await prisma.aiModelRate.findMany();
    for (const row of rows) {
      byKey.set(`${row.provider}::${row.model}`, {
        provider: row.provider,
        model: row.model,
        inputPer1M: row.inputPer1M,
        outputPer1M: row.outputPer1M,
        currency: row.currency,
        source: "override",
      });
    }
  } catch (e) {
    console.error("[ai-rates] falling back to defaults", e instanceof Error ? e.message : e);
  }
  return [...byKey.values()].sort(
    (a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model),
  );
}

/** Effective rates keyed by model id, for per-invocation cost lookups. */
export async function ratesByModel(): Promise<Map<string, EffectiveRate>> {
  return new Map((await effectiveRates()).map((r) => [r.model, r]));
}

/** USD cost of a token count at a rate (pure; undefined rate → 0). */
export function costFrom(
  rate: { inputPer1M: number; outputPer1M: number } | undefined,
  inputTokens: number,
  outputTokens: number,
): number {
  if (!rate) return 0;
  return (inputTokens / 1e6) * rate.inputPer1M + (outputTokens / 1e6) * rate.outputPer1M;
}
