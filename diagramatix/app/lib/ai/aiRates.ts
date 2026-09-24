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
 * moonshot* → moonshot, gemini* → google, else anthropic), so it works on the
 * client and doesn't depend on env-gated model registration (providerForModel in
 * models.ts returns "anthropic" for kimi/gemini ids when the provider key isn't set).
 */
export function providerOf(model: string): string {
  // OpenRouter ids are namespaced `vendor/model`, so the slash is the tell —
  // and it must be checked BEFORE the vendor prefixes below, or
  // "anthropic/claude-sonnet-4.6" would be billed as Anthropic at Anthropic's
  // own rates rather than OpenRouter's.
  if (model.includes("/") && !model.startsWith("ollama/")) return "openrouter";
  if (/^ollama[/:]/i.test(model)) return "ollama"; // local Ollama (free) — check first
  if (/^(kimi|moonshot)/i.test(model)) return "moonshot";
  if (/^deepseek/i.test(model)) return "deepseek";
  if (/^gemini/i.test(model)) return "google";
  // Azure OpenAI (gpt-*, o1/o3/o4-*) + Microsoft's own Phi/MAI models.
  if (/^(gpt|o[0-9]|phi|mai)/i.test(model)) return "microsoft";
  return "anthropic";
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

/**
 * Is this exactly what the built-in default already says?
 *
 * The rate table OVERRIDES pricing.ts, so a row that merely COPIES a default is
 * not a no-op — it is a private copy of a number that can go stale on its own,
 * and one did. The editable catalog shipped on 2026-07-23 by saving every rate
 * on the screen, defaults included, which wrote ten such copies in one
 * transaction. When Anthropic cancelled the scheduled rise of Claude Sonnet 5
 * from $2/$10 to $3/$15, correcting pricing.ts changed nothing, because the
 * copy still said $3/$15 and the copy wins. The AI Usage report went on billing
 * Sonnet 5 at 1.5x its real cost.
 *
 * So the table is kept for GENUINE overrides only — see the PUT handler in
 * app/api/admin/ai-rates/route.ts, which deletes rather than stores a row that
 * matches. Compared on the numbers, not on identity: "same as the default" has
 * to mean the same money.
 */
export function matchesDefault(
  provider: string, model: string, inputPer1M: number, outputPer1M: number,
): boolean {
  const p = PRICING[model];
  if (!p) return false;                       // unpriced: any row is a real choice
  if (providerOf(model) !== provider) return false;
  return p.in === inputPer1M && p.out === outputPer1M;
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
