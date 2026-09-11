/**
 * Bring-your-own AI key — the request-scoped key context and how it reaches the
 * client config.
 *
 * The test that matters here is T4207. An earlier attempt at this feature made
 * `fallbackApiKey` override the environment for every provider, which meant a
 * route holding an ANTHROPIC key would post it to Moonshot. The existing T0954
 * caught it. These tests pin the property directly, so the next attempt cannot
 * reintroduce it by a different route.
 */
import { describe, it, expect, afterEach } from "vitest";
import { aiClientConfig } from "@/app/lib/ai/anthropicClient";
import { withUserAiKey, currentUserAiKey } from "@/app/lib/ai/aiKeyContext";
import { BYO_PROVIDERS, isByoProvider, keyHint } from "@/app/lib/ai/userAiKey";

const ENV = [
  "ANTHROPIC_API_KEY", "MOONSHOT_API_KEY", "OPENROUTER_API_KEY",
  "DEEPSEEK_API_KEY", "OPENROUTER_BASE_URL", "MOONSHOT_BASE_URL",
] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV) saved[k] = process.env[k];
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("user-supplied AI keys", () => {
  it("T4206 — a user's key for a provider is used for that provider, instead of the deployment's", () => {
    process.env.OPENROUTER_API_KEY = "sk-deployment";
    // Outside any context, the deployment pays.
    expect(aiClientConfig("openai/gpt-5.2").apiKey).toBe("sk-deployment");

    withUserAiKey({ provider: "openrouter", apiKey: "sk-users-own" }, () => {
      const cfg = aiClientConfig("openai/gpt-5.2");
      expect(cfg.apiKey).toBe("sk-users-own");
      // The endpoint still falls back to the provider default — a key alone is
      // enough, which is the entire reason these four providers are offered.
      expect(cfg.baseURL).toBe("https://openrouter.ai/api/v1");
    });

    // ...and the context does not leak past its scope.
    expect(aiClientConfig("openai/gpt-5.2").apiKey).toBe("sk-deployment");
  });

  it("T4207 — a key for ONE provider is never sent to another", () => {
    // THE regression guard. A user with an Anthropic key, generating on a Kimi
    // model: the Kimi call must use the deployment's Moonshot key, and the
    // user's Anthropic key must not leave the machine. The failure mode is not
    // a broken build — it is a working feature that posts a customer's Claude
    // credential to a different vendor.
    process.env.ANTHROPIC_API_KEY = "sk-ant-deployment";
    process.env.MOONSHOT_API_KEY = "sk-moon-deployment";

    withUserAiKey({ provider: "anthropic", apiKey: "sk-ant-USERS-OWN" }, () => {
      const moon = aiClientConfig("kimi-k3");
      expect(moon.apiKey).toBe("sk-moon-deployment");
      expect(moon.apiKey).not.toBe("sk-ant-USERS-OWN");
      // Sanity: the key IS honoured where it belongs, so the assertion above
      // is about provider matching and not about the context being inert.
      expect(aiClientConfig("claude-opus-5").apiKey).toBe("sk-ant-USERS-OWN");
    });
  });

  it("T4208 — an explicit override argument still wins over the context", () => {
    process.env.OPENROUTER_API_KEY = "sk-deployment";
    withUserAiKey({ provider: "openrouter", apiKey: "sk-context" }, () => {
      const cfg = aiClientConfig("openai/gpt-5.2", undefined, {
        apiKey: "sk-explicit", baseUrl: "https://proxy.example/v1",
      });
      expect(cfg.apiKey).toBe("sk-explicit");
      expect(cfg.baseURL).toBe("https://proxy.example/v1");
    });
  });

  it("T4209 — currentUserAiKey only answers for the provider the key belongs to", () => {
    withUserAiKey({ provider: "deepseek", apiKey: "sk-ds" }, () => {
      expect(currentUserAiKey("deepseek")?.apiKey).toBe("sk-ds");
      expect(currentUserAiKey("moonshot")).toBeUndefined();
      expect(currentUserAiKey("anthropic")).toBeUndefined();
    });
    expect(currentUserAiKey("deepseek")).toBeUndefined();
  });

  it("T4210 — only providers reachable with a key ALONE are offered", () => {
    // google/microsoft/ollama need a gateway the deployment runs, so a personal
    // key for them cannot work on its own. Accepting one would fail later, with
    // an error nobody could act on.
    expect(BYO_PROVIDERS).toEqual(["anthropic", "openrouter", "moonshot", "deepseek"]);
    for (const p of ["google", "microsoft", "ollama"]) {
      expect(isByoProvider(p)).toBe(false);
    }
    for (const p of BYO_PROVIDERS) expect(isByoProvider(p)).toBe(true);
  });

  it("T4211 — the stored hint is the last four characters and never the key", () => {
    expect(keyHint("sk-or-v1-abcdefghijkl9WXYZ")).toBe("WXYZ");
    expect(keyHint("sk-or-v1-abcdefghijkl9WXYZ")).not.toContain("sk-");
    expect(keyHint("ab")).toBe("ab"); // too short to trim; nothing is invented
  });
});
