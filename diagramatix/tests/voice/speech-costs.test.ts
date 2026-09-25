/**
 * T4771 — speech shows up in the AI costs.
 *
 * Paul, 2026-09-25: "include it in the AI costs". A spoken reply's usage row
 * carries CHARACTERS in `inputTokens`, and each Aura-2 voice is priced per
 * million of them — so the AI Usage report, which multiplies input by the input
 * rate for every model, costs speech with no special case, and the rate is
 * editable in the catalog like any other.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRICING, DEEPGRAM_TTS_USD_PER_1K_CHARS } from "@/app/lib/ai/pricing";
import { providerOf, costFrom } from "@/app/lib/ai/aiRates";
import { TTS_VOICES } from "@/app/lib/voice/speakParams";
import { summariseCommandUsage, formatCostReport, REPLY_POINT, type UsageRow } from "@/app/lib/assist/usageCost";

const row = (o: Partial<UsageRow>): UsageRow => ({
  invocationPoint: REPLY_POINT, provider: "deepgram", model: "aura-2-theia-en",
  inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0, ...o,
});
const rateFor = (m: string) => {
  const p = PRICING[m];
  return p ? { inputPer1M: p.in, outputPer1M: p.out } : undefined;
};

describe("T4771 — every voice is priced, from ONE number", () => {
  it("each Aura-2 voice costs the per-1k rate × 1000 per million characters, nothing for output", () => {
    for (const v of TTS_VOICES) {
      expect(PRICING[v], v).toBeDefined();
      expect(PRICING[v].in).toBeCloseTo(DEEPGRAM_TTS_USD_PER_1K_CHARS * 1000, 9);
      expect(PRICING[v].out).toBe(0);
    }
  });

  it("so 1,000 characters cost exactly the per-1k list rate", () => {
    const r = rateFor("aura-2-hyperion-en")!;
    expect(costFrom(r, 1000, 0)).toBeCloseTo(DEEPGRAM_TTS_USD_PER_1K_CHARS, 9);
  });

  it("the voices are filed under Deepgram — not Anthropic, where they used to fall through", () => {
    for (const v of TTS_VOICES) expect(providerOf(v), v).toBe("deepgram");
  });
});

describe("T4771 — the Voice Assist Cost button counts what was spoken", () => {
  it("prices spoken replies by the same rate lookup as a model", () => {
    const r = summariseCommandUsage(
      [row({ inputTokens: 60 }), row({ inputTokens: 40, model: "aura-2-draco-en" })],
      rateFor, 0.006, { sinceIso: "x" },
    );
    expect(r.spokenReplies).toBe(2);
    expect(r.spokenChars).toBe(100);
    expect(r.speechCostUsd).toBeCloseTo(100 / 1e6 * 30, 9);
    expect(r.totalUsd).toBeCloseTo(r.speechCostUsd, 9);
  });

  it("a voice with no rate is named, so nobody trusts its zero", () => {
    const r = summariseCommandUsage([row({ inputTokens: 60, model: "aura-3-future-en" })], rateFor, 0.006, { sinceIso: "x" });
    expect(r.unpricedModels).toEqual(["aura-3-future-en"]);
  });

  it("the bar mentions speech only when something was spoken", () => {
    const none = summariseCommandUsage([], rateFor, 0.006, { sinceIso: "x" });
    expect(formatCostReport(none)).toBe("$0.00 so far · 0 AI calls ($0.00) · 0 s voice ($0.00)");
    const some = summariseCommandUsage([row({ inputTokens: 100 })], rateFor, 0.006, { sinceIso: "x" });
    expect(formatCostReport(some)).toBe("$0.0030 so far · 0 AI calls ($0.00) · 0 s voice ($0.00) · 1 spoken ($0.0030)");
  });

  it("only replies that were actually spoken are counted — a failure was never heard or billed", () => {
    const route = readFileSync(join(process.cwd(), "app", "api", "ai", "command", "usage", "route.ts"), "utf8");
    expect(route).toMatch(/invocationPoint:\s*REPLY_POINT,\s*status:\s*"success"/);
  });
});
