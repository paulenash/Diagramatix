/**
 * The AI-Generate model list + the setting resolver. `resolveAiModel` turns a
 * stored AppSetting value into a usable model id, so a blank/removed setting can
 * never leave generation pointing at a non-existent model — it falls back to the
 * production default (Haiku 4.5).
 */
import { describe, it, expect, afterEach } from "vitest";
import { AI_MODELS, DEFAULT_AI_MODEL, isKnownAiModel, resolveAiModel, aiModelLabel, allModels, moonshotModels, providerForModel } from "@/app/lib/ai/models";

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

describe("Moonshot (Kimi) provider registry", () => {
  const saved = { key: process.env.MOONSHOT_API_KEY, models: process.env.MOONSHOT_MODELS };
  afterEach(() => {
    if (saved.key === undefined) delete process.env.MOONSHOT_API_KEY; else process.env.MOONSHOT_API_KEY = saved.key;
    if (saved.models === undefined) delete process.env.MOONSHOT_MODELS; else process.env.MOONSHOT_MODELS = saved.models;
  });

  it("T0949 — no Moonshot models are offered unless MOONSHOT_API_KEY is set", () => {
    delete process.env.MOONSHOT_API_KEY;
    process.env.MOONSHOT_MODELS = "kimi-latest|Kimi";
    expect(moonshotModels()).toEqual([]);                       // key gates the whole list
    expect(allModels()).toEqual(AI_MODELS);                     // picker stays Claude-only
    expect(isKnownAiModel("kimi-latest")).toBe(false);
  });

  it("T0950 — with the key set, MOONSHOT_MODELS is parsed (id|Label), tagged provider=moonshot", () => {
    process.env.MOONSHOT_API_KEY = "sk-test";
    process.env.MOONSHOT_MODELS = "kimi-latest|Kimi Latest, moonshot-v1-128k";
    const ms = moonshotModels();
    expect(ms).toEqual([
      { id: "kimi-latest", label: "Kimi Latest", provider: "moonshot" },
      { id: "moonshot-v1-128k", label: "moonshot-v1-128k", provider: "moonshot" }, // bare id → label = id
    ]);
    expect(isKnownAiModel("kimi-latest")).toBe(true);
    expect(providerForModel("kimi-latest")).toBe("moonshot");
    expect(allModels().slice(0, AI_MODELS.length)).toEqual(AI_MODELS); // Claude still first
  });

  it("T0951 — key set but MOONSHOT_MODELS unset → a curated default Kimi list", () => {
    process.env.MOONSHOT_API_KEY = "sk-test";
    delete process.env.MOONSHOT_MODELS;
    const ms = moonshotModels();
    expect(ms.length).toBeGreaterThan(0);
    expect(ms.every((m) => m.provider === "moonshot")).toBe(true);
    expect(ms.some((m) => m.id === "kimi-latest")).toBe(true);
  });

  it("T0952 — Claude ids are always provider=anthropic; unknown ids default to anthropic", () => {
    expect(providerForModel("claude-haiku-4-5-20251001")).toBe("anthropic");
    expect(providerForModel("something-unknown")).toBe("anthropic");
    expect(providerForModel(null)).toBe("anthropic");
  });
});
