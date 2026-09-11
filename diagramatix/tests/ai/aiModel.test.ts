/**
 * The AI-Generate model list + the setting resolver. `resolveAiModel` turns a
 * stored AppSetting value into a usable model id, so a blank/removed setting can
 * never leave generation pointing at a non-existent model — it falls back to the
 * production default (Opus 5).
 */
import { describe, it, expect, afterEach } from "vitest";
import { AI_MODELS, DEFAULT_AI_MODEL, isKnownAiModel, resolveAiModel, aiModelLabel, allModels, moonshotModels, googleModels, microsoftModels, providerForModel, modelVision } from "@/app/lib/ai/models";

describe("AI model list + resolver", () => {
  it("T0577 — the production default is Opus 5, and is reachable with no provider env at all", () => {
    // Paul, 2026-09-11: "Opus 5 is now the default everywhere." It was Kimi K3
    // from 2026-09-04, and Haiku 4.5 before that — regenerating V22 on Haiku
    // measured about a third of the content and duplicate names throughout.
    //
    // A SILENT fallback has to be a model whose output would be accepted: by
    // definition nobody chose it and nobody is told it was used. It also has to
    // be one this deployment can actually CALL, which the Kimi default was not
    // without MOONSHOT_API_KEY — see T3202.
    expect(DEFAULT_AI_MODEL).toBe("claude-opus-5");

    // Reachable with no third-party credentials configured — a built-in, not a
    // model that appears only once some provider env var is set.
    delete process.env.MOONSHOT_API_KEY;
    expect(AI_MODELS.some((m) => m.id === DEFAULT_AI_MODEL)).toBe(true);
    expect(isKnownAiModel(DEFAULT_AI_MODEL)).toBe(true);
  });

  it("T4212 — the DB setting overrides the constant, which is why the constant alone proves nothing", () => {
    // `ai.generate.model` (AppSetting, per environment) is what production
    // actually reads; DEFAULT_AI_MODEL is only the fallback when that row is
    // missing or names something unresolvable. Reading the constant and calling
    // it "the production default" is how this file came to assert Kimi K3 after
    // production had already moved — so state the relationship here, in a test,
    // rather than in a comment nobody re-reads.
    expect(resolveAiModel("claude-sonnet-5")).toBe("claude-sonnet-5");
    expect(resolveAiModel("claude-sonnet-5")).not.toBe(DEFAULT_AI_MODEL);
  });

  it("T0578 — resolveAiModel keeps a known id, else the default, else something callable", () => {
    expect(resolveAiModel("claude-fable-5")).toBe("claude-fable-5"); // known → kept
    expect(resolveAiModel("claude-sonnet-5")).toBe("claude-sonnet-5");

    // The default is a built-in, so it is reachable with NO provider env set.
    delete process.env.MOONSHOT_API_KEY;
    expect(isKnownAiModel(DEFAULT_AI_MODEL)).toBe(true);
    expect(aiModelLabel(DEFAULT_AI_MODEL)).toBe("Opus 5");
    expect(resolveAiModel(null)).toBe(DEFAULT_AI_MODEL);               // unset
    expect(resolveAiModel("")).toBe(DEFAULT_AI_MODEL);                // blank
    expect(resolveAiModel("claude-retired-9")).toBe(DEFAULT_AI_MODEL); // since-removed
  });

  it("T3202 — a SETTING naming an unreachable model resolves to one this deployment can call", () => {
    // moonshotModels() returns nothing without MOONSHOT_API_KEY, so `kimi-k3`
    // is not a KNOWN model there. Returning it anyway would hand the caller an
    // id nothing can call, turning a quality problem into a 503.
    //
    // This used to be tested through the DEFAULT, back when the default itself
    // was kimi-k3. The default is now a built-in and always reachable, so the
    // property is tested where it can still bite: a stored `ai.generate.model`
    // row naming a model whose provider env was later removed.
    delete process.env.MOONSHOT_API_KEY;
    expect(isKnownAiModel("kimi-k3")).toBe(false);      // the offender is genuinely unreachable
    const got = resolveAiModel("kimi-k3");
    expect(got).not.toBe("kimi-k3");
    expect(isKnownAiModel(got)).toBe(true);

    // ...and it IS kept once the provider is configured, so the test above is
    // about reachability and not about rejecting Moonshot ids.
    process.env.MOONSHOT_API_KEY = "sk-test-kimi";
    expect(resolveAiModel("kimi-k3")).toBe("kimi-k3");
    delete process.env.MOONSHOT_API_KEY;
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
    // The defaults are live-verified current-platform ids (kimi-k3 is the flagship).
    expect(ms.some((m) => m.id === "kimi-k3")).toBe(true);
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
    delete process.env.MOONSHOT_MODELS; // curated default list (kimi-k3, k2.6, k2.7-code)
    expect(modelVision("kimi-k3")).toBeUndefined();                    // vision unset (unknown)
    expect(modelVision("kimi-k2.6")).toBeUndefined();
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

describe("Google (Gemini) provider registry", () => {
  const saved = { key: process.env.GOOGLE_API_KEY, base: process.env.GOOGLE_BASE_URL, models: process.env.GOOGLE_MODELS };
  afterEach(() => {
    if (saved.key === undefined) delete process.env.GOOGLE_API_KEY; else process.env.GOOGLE_API_KEY = saved.key;
    if (saved.base === undefined) delete process.env.GOOGLE_BASE_URL; else process.env.GOOGLE_BASE_URL = saved.base;
    if (saved.models === undefined) delete process.env.GOOGLE_MODELS; else process.env.GOOGLE_MODELS = saved.models;
  });

  it("T1029 — no Gemini models unless BOTH GOOGLE_API_KEY and GOOGLE_BASE_URL are set", () => {
    // Gemini has no public Anthropic-compatible endpoint, so the gateway URL is
    // mandatory — the models stay hidden (and the picker Claude-only) until both exist.
    process.env.GOOGLE_API_KEY = "sk-goog";
    delete process.env.GOOGLE_BASE_URL;
    expect(googleModels()).toEqual([]);
    expect(allModels()).toEqual(AI_MODELS);
    delete process.env.GOOGLE_API_KEY;
    process.env.GOOGLE_BASE_URL = "http://gw";
    expect(googleModels()).toEqual([]);
    expect(isKnownAiModel("gemini-2.5-pro")).toBe(false);
  });

  it("T1030 — an unresolved Key Vault reference is treated as no key (not offered)", () => {
    process.env.GOOGLE_API_KEY = "@Microsoft.KeyVault(VaultName=dgx-kv;SecretName=google-api-key)";
    process.env.GOOGLE_BASE_URL = "http://gw";
    expect(googleModels()).toEqual([]);
    process.env.GOOGLE_API_KEY = "sk-real";
    expect(googleModels().length).toBeGreaterThan(0);
  });

  it("T1031 — configured: default lineup or GOOGLE_MODELS, tagged provider=google, vision default true", () => {
    process.env.GOOGLE_API_KEY = "sk-goog";
    process.env.GOOGLE_BASE_URL = "http://gw";
    delete process.env.GOOGLE_MODELS;
    const def = googleModels();
    expect(def.length).toBeGreaterThan(0);
    expect(def.every((m) => m.provider === "google")).toBe(true);
    expect(def.some((m) => m.id === "gemini-2.5-pro")).toBe(true);
    expect(providerForModel("gemini-2.5-pro")).toBe("google");
    // GOOGLE_MODELS override (id|Label); gemini ids default to vision, "-text" opts out.
    process.env.GOOGLE_MODELS = "gemini-3-pro|Gemini 3 Pro, my-gemini-text|Text only";
    const g = googleModels();
    expect(g.find((m) => m.id === "gemini-3-pro")).toEqual({ id: "gemini-3-pro", label: "Gemini 3 Pro", provider: "google", vision: true });
    expect(g.find((m) => m.id === "my-gemini-text")?.vision).toBe(false);
    expect(allModels().slice(0, AI_MODELS.length)).toEqual(AI_MODELS); // Claude still first
  });
});

describe("Microsoft (Azure OpenAI + Phi) provider registry", () => {
  const saved = { key: process.env.MICROSOFT_API_KEY, base: process.env.MICROSOFT_BASE_URL, models: process.env.MICROSOFT_MODELS };
  afterEach(() => {
    if (saved.key === undefined) delete process.env.MICROSOFT_API_KEY; else process.env.MICROSOFT_API_KEY = saved.key;
    if (saved.base === undefined) delete process.env.MICROSOFT_BASE_URL; else process.env.MICROSOFT_BASE_URL = saved.base;
    if (saved.models === undefined) delete process.env.MICROSOFT_MODELS; else process.env.MICROSOFT_MODELS = saved.models;
  });

  it("T1037 — no Microsoft models unless BOTH MICROSOFT_API_KEY and MICROSOFT_BASE_URL are set", () => {
    process.env.MICROSOFT_API_KEY = "sk-msft";
    delete process.env.MICROSOFT_BASE_URL;
    expect(microsoftModels()).toEqual([]);        // gateway URL required (OpenAI-shaped)
    expect(allModels()).toEqual(AI_MODELS);
    delete process.env.MICROSOFT_API_KEY;
    process.env.MICROSOFT_BASE_URL = "http://gw";
    expect(microsoftModels()).toEqual([]);
    expect(isKnownAiModel("gpt-4o")).toBe(false);
  });

  it("T1038 — configured: default lineup or MICROSOFT_MODELS, tagged provider=microsoft; GPT vision, Phi text", () => {
    process.env.MICROSOFT_API_KEY = "sk-msft";
    process.env.MICROSOFT_BASE_URL = "http://gw";
    delete process.env.MICROSOFT_MODELS;
    const def = microsoftModels();
    expect(def.length).toBeGreaterThan(0);
    expect(def.every((m) => m.provider === "microsoft")).toBe(true);
    expect(def.find((m) => m.id === "gpt-4o")?.vision).toBe(true);   // GPT is multimodal
    expect(def.find((m) => m.id === "phi-4")?.vision).toBe(false);   // base Phi is text
    expect(providerForModel("gpt-4o")).toBe("microsoft");
    // Override: GPT/o default to vision, base Phi opts out, a "…-vision" Phi opts in.
    process.env.MICROSOFT_MODELS = "o3-mini|o3-mini, phi-4|Phi-4, phi-4-multimodal|Phi-4 MM";
    const m = microsoftModels();
    expect(m.find((x) => x.id === "o3-mini")?.vision).toBe(true);
    expect(m.find((x) => x.id === "phi-4")?.vision).toBe(false);
    expect(m.find((x) => x.id === "phi-4-multimodal")?.vision).toBe(true);
    expect(allModels().slice(0, AI_MODELS.length)).toEqual(AI_MODELS); // Claude still first
  });
});
