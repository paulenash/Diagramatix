/**
 * The AI-Generate model list + the setting resolver. `resolveAiModel` turns a
 * stored AppSetting value into a usable model id, so a blank/removed setting can
 * never leave generation pointing at a non-existent model — it falls back to the
 * production default (Haiku 4.5).
 */
import { describe, it, expect } from "vitest";
import { AI_MODELS, DEFAULT_AI_MODEL, isKnownAiModel, resolveAiModel, aiModelLabel } from "@/app/lib/ai/models";

describe("AI model list + resolver", () => {
  it("T0577 — the production default is Haiku 4.5 and is a known model", () => {
    expect(DEFAULT_AI_MODEL).toBe("claude-haiku-4-5-20251001");
    expect(isKnownAiModel(DEFAULT_AI_MODEL)).toBe(true);
    expect(aiModelLabel(DEFAULT_AI_MODEL)).toBe("Haiku 4.5");
  });

  it("T0578 — resolveAiModel keeps a known id but falls back to the default otherwise", () => {
    expect(resolveAiModel("claude-fable-5")).toBe("claude-fable-5"); // known → kept
    expect(resolveAiModel("claude-sonnet-5")).toBe("claude-sonnet-5");
    expect(resolveAiModel(null)).toBe(DEFAULT_AI_MODEL);              // unset
    expect(resolveAiModel("")).toBe(DEFAULT_AI_MODEL);               // blank
    expect(resolveAiModel("claude-retired-9")).toBe(DEFAULT_AI_MODEL); // since-removed
  });

  it("T0579 — every model has an id + label and unknown ids are rejected", () => {
    expect(AI_MODELS.length).toBeGreaterThanOrEqual(2);
    for (const m of AI_MODELS) { expect(m.id).toBeTruthy(); expect(m.label).toBeTruthy(); }
    expect(isKnownAiModel("nope")).toBe(false);
    expect(isKnownAiModel(undefined)).toBe(false);
  });
});
