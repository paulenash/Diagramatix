/**
 * Local / self-hosted model support (app/lib/ai/models.ts): AI_CUSTOM_MODELS lets
 * an on-prem deployment register non-Claude models so they pass validation, are
 * selectable, and resolve — pairing with ANTHROPIC_BASE_URL for local AI.
 */
import { describe, it, expect, afterEach } from "vitest";
import { customModels, allModels, isKnownAiModel, aiModelLabel, resolveAiModel, AI_MODELS, DEFAULT_AI_MODEL } from "@/app/lib/ai/models";

afterEach(() => { delete process.env.AI_CUSTOM_MODELS; });

describe("custom / local AI models", () => {
  it("T0931 — parses AI_CUSTOM_MODELS (id|Label and bare id, trims, ignores blanks)", () => {
    process.env.AI_CUSTOM_MODELS = "llama-3.3-70b|Llama 3.3 70B (local), qwen2.5-vl , , bad|";
    expect(customModels()).toEqual([
      { id: "llama-3.3-70b", label: "Llama 3.3 70B (local)" },
      { id: "qwen2.5-vl", label: "qwen2.5-vl" },   // bare id → label = id
      { id: "bad", label: "bad" },                  // trailing | → label falls back to id
    ]);
  });

  it("T0932 — unset → no custom models; plain Claude behaviour", () => {
    expect(customModels()).toEqual([]);
    expect(allModels()).toEqual(AI_MODELS);
    expect(isKnownAiModel("llama-3.3-70b")).toBe(false);
    expect(resolveAiModel("llama-3.3-70b")).toBe(DEFAULT_AI_MODEL); // unknown → default
  });

  it("T0933 — a configured local model becomes known, labelled and resolvable", () => {
    process.env.AI_CUSTOM_MODELS = "llama-3.3-70b|Llama 3.3 70B (local)";
    expect(isKnownAiModel("llama-3.3-70b")).toBe(true);
    expect(aiModelLabel("llama-3.3-70b")).toBe("Llama 3.3 70B (local)");
    expect(resolveAiModel("llama-3.3-70b")).toBe("llama-3.3-70b"); // kept, not defaulted
    // Claude models still work alongside it.
    expect(isKnownAiModel(DEFAULT_AI_MODEL)).toBe(true);
  });
});
