/**
 * AI cost-rate catalog: the editable AiModelRate overlay on the pricing.ts
 * defaults, and the pure cost maths the AI Usage report multiplies tokens by.
 */
import { describe, it, expect, beforeEach } from "vitest";

// Mutable stand-in for the AiModelRate rows the DB would return.
const rateRows: Array<{ provider: string; model: string; inputPer1M: number; outputPer1M: number; currency: string }> = [];
import { vi } from "vitest";
vi.mock("@/app/lib/db", () => ({ prisma: { aiModelRate: { findMany: async () => rateRows } } }));

import { effectiveRates, costFrom, providerOf } from "@/app/lib/ai/aiRates";
import { PRICING } from "@/app/lib/ai/pricing";

beforeEach(() => { rateRows.length = 0; });

describe("aiRates", () => {
  it("T0983 — providerOf maps kimi/moonshot ids to moonshot, else anthropic", () => {
    expect(providerOf("kimi-k3")).toBe("moonshot");
    expect(providerOf("moonshot-v1-128k")).toBe("moonshot");
    expect(providerOf("claude-opus-4-8")).toBe("anthropic");
    expect(providerOf("some-local-model")).toBe("anthropic");
  });

  it("T0984 — costFrom multiplies tokens by the per-1M rate (undefined → 0)", () => {
    // 1M in @ $5 + 1M out @ $25 = $30.
    expect(costFrom({ inputPer1M: 5, outputPer1M: 25 }, 1_000_000, 1_000_000)).toBeCloseTo(30, 6);
    // 8000 in @ $1 + 3000 out @ $5 = 0.008 + 0.015 = 0.023.
    expect(costFrom({ inputPer1M: 1, outputPer1M: 5 }, 8000, 3000)).toBeCloseTo(0.023, 6);
    expect(costFrom(undefined, 9999, 9999)).toBe(0);
  });

  it("T0985 — effectiveRates = defaults, overlaid by DB rows (DB wins), incl. new models", async () => {
    // With no overrides, a known default comes through unchanged, source=default.
    let rates = await effectiveRates();
    const opus = rates.find((r) => r.model === "claude-opus-4-8");
    expect(opus).toBeTruthy();
    expect(opus!.inputPer1M).toBe(PRICING["claude-opus-4-8"].in);
    expect(opus!.source).toBe("default");

    // Override opus + introduce a brand-new custom model.
    rateRows.push({ provider: "anthropic", model: "claude-opus-4-8", inputPer1M: 99, outputPer1M: 199, currency: "USD" });
    rateRows.push({ provider: "anthropic", model: "local-llama", inputPer1M: 0, outputPer1M: 0, currency: "USD" });
    rates = await effectiveRates();
    const opus2 = rates.find((r) => r.model === "claude-opus-4-8")!;
    expect(opus2.inputPer1M).toBe(99);
    expect(opus2.outputPer1M).toBe(199);
    expect(opus2.source).toBe("override");
    expect(rates.find((r) => r.model === "local-llama")?.source).toBe("override");
  });
});
