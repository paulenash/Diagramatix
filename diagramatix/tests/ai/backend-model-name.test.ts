/**
 * Local-model name rewriting for the ollama provider. The registry id carries an
 * `ollama/` prefix (so pricing tags it free + modelAccess offers it to everyone),
 * but a DIRECT backend (LM Studio / raw Ollama on the Anthropic Messages API)
 * expects its own bare model name. `OLLAMA_STRIP_MODEL_PREFIX` strips the prefix
 * on the way out; a LiteLLM gateway that mirrors the prefixed names leaves it off.
 */
import { describe, it, expect, afterEach } from "vitest";
import { backendModelName } from "@/app/lib/ai/anthropicClient";

const saved = process.env.OLLAMA_STRIP_MODEL_PREFIX;
afterEach(() => { process.env.OLLAMA_STRIP_MODEL_PREFIX = saved; });

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
