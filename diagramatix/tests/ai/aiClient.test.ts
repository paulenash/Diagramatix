/**
 * Provider-aware AI client resolution (Moonshot/Kimi via its Anthropic-compatible
 * endpoint). `aiClientConfig` + `aiApiKey` pick the right key + base URL for the
 * selected model's provider, with no network call — that's what we pin here.
 */
import { describe, it, expect, afterEach } from "vitest";
import { aiClientConfig, aiApiKey, makeAiClient } from "@/app/lib/ai/anthropicClient";

const ENV_KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "MOONSHOT_API_KEY", "MOONSHOT_BASE_URL", "MOONSHOT_MODELS", "GOOGLE_API_KEY", "GOOGLE_BASE_URL", "GOOGLE_MODELS", "MICROSOFT_API_KEY", "MICROSOFT_BASE_URL", "MICROSOFT_MODELS", "DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL", "DEEPSEEK_MODELS"] as const;

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

  it("T2824 — a DeepSeek model uses DEEPSEEK_API_KEY + the Anthropic-compatible endpoint by default", () => {
    process.env.DEEPSEEK_API_KEY = "sk-deep";
    delete process.env.DEEPSEEK_BASE_URL; // default endpoint
    expect(aiApiKey("deepseek-v4-flash")).toBe("sk-deep");
    expect(aiClientConfig("deepseek-v4-flash")).toEqual({ apiKey: "sk-deep", baseURL: "https://api.deepseek.com/anthropic" });
    // Provider key wins over a caller-supplied Anthropic fallback.
    expect(aiClientConfig("deepseek-v4-flash", "sk-ant").apiKey).toBe("sk-deep");
  });

  it("T2825 — DEEPSEEK_BASE_URL overrides the endpoint", () => {
    process.env.DEEPSEEK_API_KEY = "sk-deep";
    process.env.DEEPSEEK_BASE_URL = "https://proxy.internal/deepseek";
    expect(aiClientConfig("deepseek-v4-flash").baseURL).toBe("https://proxy.internal/deepseek");
  });

  it("T2826 — without DEEPSEEK_API_KEY the id isn't registered, so it doesn't route to DeepSeek", () => {
    delete process.env.DEEPSEEK_API_KEY;
    // Unregistered → treated as anthropic, NOT the DeepSeek endpoint.
    expect(aiClientConfig("deepseek-v4-flash").baseURL).not.toBe("https://api.deepseek.com/anthropic");
  });

  it("T0956 — aiApiKey is undefined when the selected provider's key is missing", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(aiApiKey("claude-haiku-4-5-20251001")).toBeUndefined();
  });

  it("T1028 — a Google (Gemini) model uses GOOGLE_API_KEY + GOOGLE_BASE_URL, Bearer auth", () => {
    // Gemini is reached via an Anthropic-compatible gateway (e.g. LiteLLM); the
    // models only resolve when BOTH the key and the gateway URL are set.
    process.env.GOOGLE_API_KEY = "sk-goog";
    process.env.GOOGLE_BASE_URL = "http://litellm.internal:4000";
    process.env.ANTHROPIC_API_KEY = "sk-ant"; // must NOT be used for a Gemini model
    expect(aiApiKey("gemini-2.5-pro")).toBe("sk-goog");
    expect(aiClientConfig("gemini-2.5-pro")).toEqual({ apiKey: "sk-goog", baseURL: "http://litellm.internal:4000" });
    // A caller-passed anthropic key is ignored for a Gemini model.
    expect(aiClientConfig("gemini-2.5-pro", "sk-ant").apiKey).toBe("sk-goog");
    // Bearer auth (like Moonshot), not x-api-key.
    const g = makeAiClient("gemini-2.5-pro");
    expect(g.authToken).toBe("sk-goog");
    expect(g.apiKey).toBeNull();
  });

  it("T1036 — a Microsoft (GPT/Phi) model uses MICROSOFT_API_KEY + MICROSOFT_BASE_URL, Bearer auth", () => {
    process.env.MICROSOFT_API_KEY = "sk-msft";
    process.env.MICROSOFT_BASE_URL = "http://litellm.internal:4000";
    process.env.ANTHROPIC_API_KEY = "sk-ant"; // must NOT be used for a GPT/Phi model
    expect(aiApiKey("gpt-4o")).toBe("sk-msft");
    expect(aiClientConfig("gpt-4o")).toEqual({ apiKey: "sk-msft", baseURL: "http://litellm.internal:4000" });
    expect(aiApiKey("phi-4")).toBe("sk-msft");
    expect(aiClientConfig("phi-4", "sk-ant").apiKey).toBe("sk-msft"); // caller anthropic key ignored
    const g = makeAiClient("gpt-4o");
    expect(g.authToken).toBe("sk-msft");
    expect(g.apiKey).toBeNull();
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
