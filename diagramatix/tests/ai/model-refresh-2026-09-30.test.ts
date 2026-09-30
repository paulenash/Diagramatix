/**
 * The model list, refreshed 2026-09-30 against each vendor's OWN model list (GET /v1/models or
 * /models on the account's keys) — not against a docs page or memory:
 *   Anthropic  + claude-sonnet-5-5 ($2 / $10)
 *   Moonshot   + kimi-k2.7-code-highspeed ($1.90 / $8)
 *   DeepSeek   deepseek-v4-flash is RETIRED (still accepted, served by V4.1-Flash) → deepseek-flash
 * Google / OpenAI / Microsoft were NOT changed: no key for them in this environment, so their lists
 * could not be verified against the API.
 */
import { describe, it, expect, vi } from "vitest";

vi.stubEnv("DEEPSEEK_API_KEY", "sk-deep");
vi.stubEnv("MOONSHOT_API_KEY", "sk-moon");
vi.stubEnv("MOONSHOT_MODELS", "");
vi.stubEnv("DEEPSEEK_MODELS", "");

import { AI_MODELS, deepseekModels, moonshotModels } from "@/app/lib/ai/models";
import { PRICING } from "@/app/lib/ai/pricing";

describe("T5144 — the model list follows what the vendors' own APIs list", () => {
  it("Sonnet 5.5 is offered (vision), beside Sonnet 5", () => {
    const ids = AI_MODELS.map((m) => m.id);
    expect(ids).toContain("claude-sonnet-5-5");
    expect(ids).toContain("claude-sonnet-5");
    expect(AI_MODELS.find((m) => m.id === "claude-sonnet-5-5")?.vision).toBe(true);
  });

  it("Moonshot offers the fast K2.7 Code as well as the three it had", () => {
    expect(moonshotModels().map((m) => m.id).sort()).toEqual(["kimi-k2.6", "kimi-k2.7-code", "kimi-k2.7-code-highspeed", "kimi-k3"]);
  });

  it("DeepSeek offers deepseek-flash and deepseek-v4-pro; the retired deepseek-v4-flash is no longer offered", () => {
    const ids = deepseekModels().map((m) => m.id);
    expect(ids).toEqual(["deepseek-flash", "deepseek-v4-pro"]);
    expect(ids).not.toContain("deepseek-v4-flash");
  });

  it("every offered model has a rate (the retired name keeps one so old usage still prices)", () => {
    for (const id of ["claude-sonnet-5-5", "kimi-k2.7-code-highspeed", "deepseek-flash", "deepseek-v4-pro", "deepseek-v4-flash"]) {
      expect(PRICING[id], id).toBeDefined();
    }
    expect(PRICING["claude-sonnet-5-5"]).toMatchObject({ in: 2, out: 10 });
    expect(PRICING["kimi-k2.7-code-highspeed"]).toMatchObject({ in: 1.9, out: 8 });
    expect(PRICING["deepseek-flash"]).toMatchObject({ in: 0.3, out: 1.2 });
  });
});

describe("T5145 — Gemini 3.8 Flash and 3.1 Pro (preview) are offered and priced", () => {
  it("the default Google list is 3.8 Flash only (2.5 retired; 3.1 Pro waits on billing), with vision, and both new models have a rate", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "k");
    vi.stubEnv("GOOGLE_BASE_URL", "https://gw.example");
    vi.stubEnv("GOOGLE_MODELS", "");
    const { googleModels } = await import("@/app/lib/ai/models");
    const ms = googleModels();
    expect(ms.map((m) => m.id)).toEqual(["gemini-3.8-flash"]);
    expect(ms.every((m) => m.vision)).toBe(true);
    expect(PRICING["gemini-3.8-flash"]).toMatchObject({ in: 1.5, out: 7.5 });
    expect(PRICING["gemini-3.1-pro-preview"]).toMatchObject({ in: 2, out: 12 });
  });
});
