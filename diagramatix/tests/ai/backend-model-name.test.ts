/**
 * Local-model name rewriting for the ollama provider. The registry id carries an
 * `ollama/` prefix (so pricing tags it free + modelAccess offers it to everyone),
 * but a DIRECT backend (LM Studio / raw Ollama on the Anthropic Messages API)
 * expects its own bare model name. `OLLAMA_STRIP_MODEL_PREFIX` strips the prefix
 * on the way out; a LiteLLM gateway that mirrors the prefixed names leaves it off.
 */
import { describe, it, expect, afterEach } from "vitest";
import { backendModelName, cappedMaxTokens } from "@/app/lib/ai/anthropicClient";

const saved = process.env.OLLAMA_STRIP_MODEL_PREFIX;
const savedMax = process.env.OLLAMA_MAX_TOKENS;
afterEach(() => {
  process.env.OLLAMA_STRIP_MODEL_PREFIX = saved;
  process.env.OLLAMA_MAX_TOKENS = savedMax;
});

describe("backendModelName", () => {
  it("strips the ollama/ prefix for the ollama provider when the flag is on", () => {
    process.env.OLLAMA_STRIP_MODEL_PREFIX = "true";
    expect(backendModelName("ollama", "ollama/google/gemma-4-e4b")).toBe("google/gemma-4-e4b");
    expect(backendModelName("ollama", "ollama/gemma2:9b")).toBe("gemma2:9b");
  });

  it("leaves the name untouched when the flag is unset (gateway pattern)", () => {
    delete process.env.OLLAMA_STRIP_MODEL_PREFIX;
    expect(backendModelName("ollama", "ollama/google/gemma-4-e4b")).toBe("ollama/google/gemma-4-e4b");
  });

  it("accepts 1/yes/on as truthy, everything else as off", () => {
    for (const on of ["1", "yes", "on", "TRUE"]) {
      process.env.OLLAMA_STRIP_MODEL_PREFIX = on;
      expect(backendModelName("ollama", "ollama/x")).toBe("x");
    }
    for (const off of ["0", "false", "no", ""]) {
      process.env.OLLAMA_STRIP_MODEL_PREFIX = off;
      expect(backendModelName("ollama", "ollama/x")).toBe("ollama/x");
    }
  });

  it("never rewrites a non-ollama provider, even with the flag on", () => {
    process.env.OLLAMA_STRIP_MODEL_PREFIX = "true";
    expect(backendModelName("anthropic", "ollama/x")).toBe("ollama/x");
    expect(backendModelName("moonshot", "kimi-k3")).toBe("kimi-k3");
  });

  it("is a no-op for an ollama id that lacks the prefix", () => {
    process.env.OLLAMA_STRIP_MODEL_PREFIX = "true";
    expect(backendModelName("ollama", "google/gemma-4-e4b")).toBe("google/gemma-4-e4b");
  });
});

describe("cappedMaxTokens", () => {
  it("caps a local (ollama) model to OLLAMA_MAX_TOKENS", () => {
    process.env.OLLAMA_MAX_TOKENS = "4096";
    expect(cappedMaxTokens("ollama/google/gemma-4-e4b", 16000)).toBe(4096);
  });

  it("defaults the local cap to 4096 when the env is unset/invalid", () => {
    delete process.env.OLLAMA_MAX_TOKENS;
    expect(cappedMaxTokens("ollama/google/gemma-4-e4b", 32000)).toBe(4096);
    process.env.OLLAMA_MAX_TOKENS = "not-a-number";
    expect(cappedMaxTokens("ollama/gemma2:2b", 16000)).toBe(4096);
    process.env.OLLAMA_MAX_TOKENS = "0";
    expect(cappedMaxTokens("ollama/gemma2:2b", 16000)).toBe(4096);
  });

  it("leaves cloud models at their full budget", () => {
    process.env.OLLAMA_MAX_TOKENS = "4096";
    // Unknown/untagged ids resolve to the anthropic provider → not capped.
    expect(cappedMaxTokens("claude-opus-4-8", 32000)).toBe(32000);
    expect(cappedMaxTokens("kimi-k3", 16000)).toBe(16000);
  });

  it("honours a raised local cap when the box has headroom", () => {
    process.env.OLLAMA_MAX_TOKENS = "8192";
    expect(cappedMaxTokens("ollama/gemma2:9b", 16000)).toBe(8192);
  });
});
