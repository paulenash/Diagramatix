/**
 * Provider-aware AI client resolution (Moonshot/Kimi via its Anthropic-compatible
 * endpoint). `aiClientConfig` + `aiApiKey` pick the right key + base URL for the
 * selected model's provider, with no network call — that's what we pin here.
 */
import { describe, it, expect, afterEach } from "vitest";
import { aiClientConfig, aiApiKey, makeAiClient } from "@/app/lib/ai/anthropicClient";

const ENV_KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "MOONSHOT_API_KEY", "MOONSHOT_BASE_URL", "MOONSHOT_MODELS"] as const;

describe("aiClientConfig / aiApiKey — provider routing", () => {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  afterEach(() => {
    for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]!; }
  });

  it("T0953 — an Anthropic (Claude) model uses ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    delete process.env.ANTHROPIC_BASE_URL;
    expect(aiApiKey("claude-haiku-4-5-20251001")).toBe("sk-ant");
    expect(aiClientConfig("claude-haiku-4-5-20251001")).toEqual({ apiKey: "sk-ant", baseURL: undefined });
    // ANTHROPIC_BASE_URL is honoured when present (enterprise proxy).
    process.env.ANTHROPIC_BASE_URL = "https://proxy.internal";
    expect(aiClientConfig("claude-haiku-4-5-20251001").baseURL).toBe("https://proxy.internal");
    // A caller-resolved key overrides the env for the anthropic branch.
    expect(aiClientConfig("claude-haiku-4-5-20251001", "sk-explicit").apiKey).toBe("sk-explicit");
  });

  it("T0954 — a Moonshot model uses MOONSHOT_API_KEY + the international endpoint by default", () => {
    process.env.MOONSHOT_API_KEY = "sk-moon";
    process.env.MOONSHOT_MODELS = "kimi-latest|Kimi";
    process.env.ANTHROPIC_API_KEY = "sk-ant"; // must NOT be used for a Kimi model
    delete process.env.MOONSHOT_BASE_URL;
    expect(aiApiKey("kimi-latest")).toBe("sk-moon");
    expect(aiClientConfig("kimi-latest")).toEqual({ apiKey: "sk-moon", baseURL: "https://api.moonshot.ai/anthropic" });
    // A caller-passed anthropic key is ignored for a Moonshot model.
    expect(aiClientConfig("kimi-latest", "sk-ant").apiKey).toBe("sk-moon");
  });

  it("T0955 — MOONSHOT_BASE_URL overrides the endpoint (e.g. mainland China)", () => {
    process.env.MOONSHOT_API_KEY = "sk-moon";
    process.env.MOONSHOT_MODELS = "kimi-latest|Kimi";
    process.env.MOONSHOT_BASE_URL = "https://api.moonshot.cn/anthropic";
    expect(aiClientConfig("kimi-latest").baseURL).toBe("https://api.moonshot.cn/anthropic");
  });

  it("T0956 — aiApiKey is undefined when the selected provider's key is missing", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(aiApiKey("claude-haiku-4-5-20251001")).toBeUndefined();
  });

  it("T0961 — a Moonshot client authenticates with Bearer (authToken), not x-api-key", () => {
    // Moonshot's Anthropic-compatible endpoint wants Authorization: Bearer, so the
    // Anthropic SDK must carry the key as authToken (Bearer) with apiKey nulled out
    // (else it sends the x-api-key header Moonshot rejects → 401).
    process.env.MOONSHOT_API_KEY = "sk-moon";
    process.env.MOONSHOT_MODELS = "kimi-k2-0711-preview|Kimi K2";
    const kimi = makeAiClient("kimi-k2-0711-preview");
    expect(kimi.authToken).toBe("sk-moon");
    expect(kimi.apiKey).toBeNull();

    // Claude still uses x-api-key (apiKey), no bearer token.
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    const claude = makeAiClient("claude-haiku-4-5-20251001");
    expect(claude.apiKey).toBe("sk-ant");
  });
});
