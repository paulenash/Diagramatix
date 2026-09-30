/**
 * Reference price snapshot (USD per 1M tokens) for the models AI Generate can use,
 * powering the cost comparison on the AI Models Selection page.
 *
 * STATIC snapshot — providers change prices; verify and bump the date on refresh:
 *   Claude — anthropic.com/pricing (these are the current list rates)
 *   Kimi / Moonshot — platform.kimi.ai (international USD)
 *   Gemini / Google — ai.google.dev/pricing (your gateway may bill differently)
 *   GPT / Phi (Microsoft) — azure.microsoft.com/pricing (Azure OpenAI + Foundry)
 *   OpenRouter — openrouter.ai/models (a reseller: vendor rate + its margin)
 *
 * Pure data + helpers, safe to import on the client.
 */
export const PRICING_SNAPSHOT_DATE = "2026-07-27";

/**
 * Streaming speech-to-text, USD per minute of open microphone — Deepgram Nova-2
 * streaming, pay-as-you-go list rate (read 2026-09-15). An ESTIMATE for the
 * "cost so far" readout only: Deepgram bills on its own dashboard, by the
 * minute, whether or not anything was said.
 */
export const DEEPGRAM_USD_PER_MINUTE = 0.0059;

/**
 * Text-to-speech, USD per 1,000 characters — Deepgram Aura-2, pay-as-you-go list
 * rate (read 2026-09-25). A 60-character spoken reply is about $0.0018.
 */
export const DEEPGRAM_TTS_USD_PER_1K_CHARS = 0.030;

/**
 * Aura-2 voices, priced so the AI Usage report can cost speech WITHOUT special
 * code: a `voice.reply` row carries its CHARACTER count in `inputTokens`, and
 * this rate is per million of them — $0.030 per 1k chars is $30 per 1M. The
 * report multiplies input by the input rate exactly as it does for a model, and
 * the rates are editable in the catalog like any other.
 *
 * Derived from the one constant above, so the per-1k figure and the catalog
 * figure cannot disagree. Not offered anywhere as a generate model: the model
 * pickers iterate the provider registry (`models.ts`), not this table.
 */
const AURA_2_PER_1M_CHARS: ModelPrice = {
  in: DEEPGRAM_TTS_USD_PER_1K_CHARS * 1000,
  out: 0,
  note: "speech: characters ride in the input column",
};

export interface ModelPrice {
  in: number; // USD per 1M input tokens
  out: number; // USD per 1M output tokens
  note?: string;
}

// Keyed by exact model id. Any id not listed (e.g. `kimi-latest`, which floats to
// Moonshot's current flagship, or a local/custom model) resolves to undefined and
// the UI shows "varies" rather than a wrong fixed number.
// Exported so the editable rate catalog (app/lib/ai/aiRates.ts) can seed + overlay
// these as the defaults — this stays the single source of the default numbers.
export const PRICING: Record<string, ModelPrice> = {
  // Claude — Anthropic list pricing
  // Fable 5.1: claude.com/pricing + platform.claude.com models overview, both
  // read 2026-09-13. Same list price as Fable 5, so it ties at the top of the
  // cost gate rather than raising the ceiling.
  "claude-fable-5-1": { in: 10, out: 50 },
  "claude-fable-5": { in: 10, out: 50 },
  // Opus 5.5 undercuts Opus 5 — $4/$20 against $5/$25 — so the newer model is
  // also the cheaper one. Read from platform.claude.com/docs/en/about-claude/pricing
  // and claude.com/pricing, both 2026-09-25.
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-opus-5": { in: 5, out: 25 },
  "claude-opus-4-8": { in: 5, out: 25 },
  // Was recorded here as $3 / $15 with a note calling $2 / $10 an introductory
  // price "through 2026-08-31". Checked 2026-09-25: the scheduled rise to
  // $3 / $15 on 1 September WAS CANCELLED and $2 / $10 is now the standard
  // price, so the number here was not merely stale, it was wrong — the AI Usage
  // report was billing Sonnet 5 at 1.5x its real cost.
  "claude-sonnet-5": { in: 2, out: 10 },
  // Sonnet 5.5: $2 / $10 — platform.claude.com/docs/en/about-claude/pricing, read 2026-09-30.
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
  // Kimi / Moonshot — international USD (platform.kimi.ai). These three are the
  // current default lineup; the rest are priced for reference if registered via
  // MOONSHOT_MODELS.
  "kimi-k3": { in: 3, out: 15 },
  "kimi-k2.6": { in: 0.95, out: 4 },
  "kimi-k2.7-code": { in: 0.95, out: 4 },
  // platform.kimi.ai pricing, read 2026-09-30.
  "kimi-k2.7-code-highspeed": { in: 1.9, out: 8 },
  "kimi-k2.5": { in: 0.6, out: 3 },
  "kimi-k2-0711-preview": { in: 0.6, out: 2.5 },
  "moonshot-v1-128k": { in: 2, out: 5 },
  // Google Gemini — ai.google.dev/pricing (paid tier, standard context). Verify;
  // a gateway (e.g. LiteLLM in front of Vertex) may rate these differently.
  "gemini-2.5-pro": { in: 1.25, out: 10, note: "≤200k context; higher above" },
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
  // ai.google.dev/gemini-api/docs/pricing, read 2026-09-30. 3.8 Flash is discounted to 0.75 / 3.75
  // until 31 Dec 2026; the 1 Jan 2027 price is used so the cost gate does not go stale.
  "gemini-3.8-flash": { in: 1.5, out: 7.5, note: "0.75 / 3.75 until 2026-12-31" },
  "gemini-3.1-pro-preview": { in: 2, out: 12, note: "≤200k prompt; 4 / 18 above" },
  // Microsoft — Azure OpenAI (GPT / o-series) + Microsoft's Phi. Azure bills you
  // directly, so these only drive the cost-gate/bars — editable in the rate catalog.
  // gpt-5-mini / gpt-5.4-mini are the deployed models (dgx-openai); estimates —
  // verify against your Azure region pricing.
  // Paul's figures, 2026-09-30 (Azure had not published them). Cached input is not modelled — the
  // table has no cached column — so the plain input rate is used: the conservative figure.
  "gpt-6.1-sol": { in: 2, out: 10, note: "cached input 0.10" },
  "gpt-6-luna": { in: 0.1, out: 0.5, note: "cached input 0.01" },
  "gpt-5.6-terra": { in: 2, out: 12, note: "cached input 0.20" },
  "gpt-5-mini": { in: 0.25, out: 2 },
  "gpt-5.4-mini": { in: 0.25, out: 2 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "phi-4": { in: 0.125, out: 0.5 },
  // DeepSeek — the account's live models (GET /models, 2026-09-30): deepseek-flash + deepseek-v4-pro.
  // api-docs.deepseek.com/quick_start/pricing has PEAK and OFF-PEAK prices (peak 01:00-04:00 and
  // 06:00-10:00 UTC, Mon-Fri) — roughly Australian working hours — so the PEAK cache-miss rates are
  // used here: the conservative figure for the cost gate. Cache hits are far cheaper.
  "deepseek-flash": { in: 0.3, out: 1.2, note: "peak cache-miss; off-peak 0.15 / 0.6; cache hits far cheaper" },
  "deepseek-v4-pro": { in: 1.32, out: 3.96, note: "peak cache-miss; off-peak 0.66 / 1.98; cache hits far cheaper" },
  // The retired name is still accepted and served by V4.1-Flash at the Flash price — kept so old usage rows still price.
  "deepseek-v4-flash": { in: 0.3, out: 1.2, note: "retired name — served by deepseek-flash" },
  // Generic aliases (both currently resolve to v4-flash) — priced so a direct use
  // isn't "varies".
  "deepseek-chat": { in: 0.28, out: 0.42 },
  "deepseek-reasoner": { in: 0.28, out: 0.42 },

  // OpenRouter — it RESELLS other vendors' models, so the rate is the
  // underlying vendor's plus OpenRouter's margin. Priced at the vendor list
  // rate here, which is the floor rather than the exact figure.
  //
  // These rows are not cosmetic. An UNPRICED model is excluded from
  // `allowedGenerateModels` for every non-SuperAdmin, because the cost ceiling
  // cannot compare it — so without them a user who supplies an OpenRouter key
  // sees no OpenRouter models at all. Any id added to OPENROUTER_MODELS that is
  // not listed here behaves the same way.
  "anthropic/claude-sonnet-4.6": { in: 3, out: 15, note: "resold; OpenRouter adds a margin" },
  "openai/gpt-5.2": { in: 1.25, out: 10, note: "resold; OpenRouter adds a margin" },

  // Deepgram Aura-2 text-to-speech — the voice id IS the model id. See above.
  "aura-2-theia-en": AURA_2_PER_1M_CHARS,
  "aura-2-hyperion-en": AURA_2_PER_1M_CHARS,
  "aura-2-pandora-en": AURA_2_PER_1M_CHARS,
  "aura-2-draco-en": AURA_2_PER_1M_CHARS,
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
