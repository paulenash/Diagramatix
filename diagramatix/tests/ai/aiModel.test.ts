/**
 * The AI-Generate model list + the setting resolver. `resolveAiModel` turns a
 * stored AppSetting value into a usable model id, so a blank/removed setting can
 * never leave generation pointing at a non-existent model — it falls back to the
 * production default (Haiku 4.5).
 */
import { describe, it, expect, afterEach } from "vitest";
import { AI_MODELS, DEFAULT_AI_MODEL, isKnownAiModel, resolveAiModel, aiModelLabel, allModels, moonshotModels, providerForModel, modelVision } from "@/app/lib/ai/models";

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

  it("T0962 — an unresolved Azure Key Vault reference is treated as no key (not offered)", () => {
    // App Service leaves the literal reference string in the env var when it can't
    // resolve the secret — non-empty, so the model WOULD show, but every call 401s.
    process.env.MOONSHOT_API_KEY = "@Microsoft.KeyVault(VaultName=dgx-kv;SecretName=moonshot-api-key)";
    process.env.MOONSHOT_MODELS = "kimi-latest|Kimi";
    expect(moonshotModels()).toEqual([]);                       // hidden, not silently broken
    expect(allModels()).toEqual(AI_MODELS);
    // A real key value resolves normally.
    process.env.MOONSHOT_API_KEY = "sk-real";
    expect(moonshotModels().length).toBeGreaterThan(0);
  });

  it("T0950 — with the key set, MOONSHOT_MODELS is parsed (id|Label), tagged provider=moonshot", () => {
    process.env.MOONSHOT_API_KEY = "sk-test";
    process.env.MOONSHOT_MODELS = "kimi-latest|Kimi Latest, moonshot-v1-128k";
    const ms = moonshotModels();
    expect(ms).toEqual([
      { id: "kimi-latest", label: "Kimi Latest", provider: "moonshot", vision: true }, // kimi-latest → vision
      { id: "moonshot-v1-128k", label: "moonshot-v1-128k", provider: "moonshot", vision: undefined }, // bare id → label = id
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

  it("T0960 — vision capability: Claude all true; Kimi per-model; env ids heuristic", () => {
    // Claude models are all multimodal.
    for (const m of AI_MODELS) expect(m.vision).toBe(true);
    expect(modelVision("claude-haiku-4-5-20251001")).toBe(true);

    process.env.MOONSHOT_API_KEY = "sk-test";
    delete process.env.MOONSHOT_MODELS; // curated default list (kimi-latest + Kimi K2)
    expect(modelVision("kimi-latest")).toBe(true);
    expect(modelVision("kimi-k2-0711-preview")).toBe(false);           // text-only
    // A "vision" id supplied via MOONSHOT_MODELS is flagged multimodal by heuristic.
    process.env.MOONSHOT_MODELS = "moonshot-v1-128k|V1, moonshot-v1-128k-vision-preview|V1 vision";
    expect(modelVision("moonshot-v1-128k")).toBeUndefined();           // unknown → not flagged
    expect(modelVision("moonshot-v1-128k-vision-preview")).toBe(true); // "vision" in id → true

    // Env-declared ids: "vision" in the id → true; otherwise unknown (undefined).
    process.env.MOONSHOT_MODELS = "some-vision-model|V, plain-text-model|T";
    expect(moonshotModels().find((m) => m.id === "some-vision-model")?.vision).toBe(true);
    expect(moonshotModels().find((m) => m.id === "plain-text-model")?.vision).toBeUndefined();
  });
});
