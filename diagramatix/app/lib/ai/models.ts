/**
 * The Claude models offered for AI diagram generation — the single source of
 * truth shared by the SuperAdmin model comparison, the AI-Generate default
 * setting, and the admin picker. Add/rename a model here and every surface stays
 * in step.
 */

/** Which vendor endpoint a model is served from. Absent ⇒ "anthropic" (the
 *  default, and how every built-in Claude model is treated). Moonshot/Kimi is
 *  reached via its Anthropic-compatible endpoint, so it reuses the same SDK +
 *  Messages-API shape — only the base URL + key differ (see anthropicClient.ts). */
export type AiProvider = "anthropic" | "moonshot" | "google" | "microsoft" | "ollama" | "deepseek" | "openrouter";

export interface AiModel {
  id: string;
  label: string;
  provider?: AiProvider; // absent ⇒ "anthropic"
  /** Whether the model can read images (vision). Drives the optional Vision-model
   *  picker: `false` = text-only (excluded from the vision picker + flagged if it's
   *  the only model). Absent ⇒ unknown (allowed, not flagged). Claude models are
   *  all multimodal. */
  vision?: boolean;
}

/**
 * Read a provider-key env var, returning undefined for values that can't be a
 * real key. Besides blank, this catches an **unresolved Azure Key Vault reference**:
 * when App Service can't resolve `@Microsoft.KeyVault(...)` (e.g. the managed
 * identity lacks "Key Vault Secrets User" on the vault), it leaves the LITERAL
 * reference string in the env var — non-empty, so the model would show in the
 * picker, but useless as a key (every call 401s "Invalid Authentication"). Treating
 * it as "not set" turns that silent 401 into a clear "AI not configured".
 */
export function resolvedEnvSecret(raw: string | null | undefined): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  if (/^@Microsoft\.KeyVault\(/i.test(v)) return undefined; // unresolved KV reference
  return v;
}

export const AI_MODELS: AiModel[] = [
  { id: "claude-fable-5", label: "Fable 5", vision: true },
  { id: "claude-opus-5", label: "Opus 5", vision: true },
  { id: "claude-opus-4-8", label: "Opus 4.8", vision: true },
  { id: "claude-sonnet-5", label: "Sonnet 5", vision: true },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", vision: true },
];

/**
 * Production default for AI Generate — what an environment uses when the
 * `ai.generate.model` setting is unset or names a model that no longer exists.
 *
 * **Opus 5** (Paul, 2026-09-11) — the default everywhere.
 *
 * The history is worth keeping, because it is the argument for what a fallback
 * has to be. It was Haiku 4.5, chosen when Haiku looked like the best BPMN
 * generator; regenerating V22 measured otherwise — roughly a third of the
 * content, V22.07 losing about 40% of its process, and duplicate names
 * throughout ("30 days" four times on one diagram). It was then Kimi K3 for a
 * week. A SILENT fallback has to be a model whose output would be accepted,
 * because by definition nobody chose it and nobody is told it was used.
 *
 * NOTE: this constant is only what a deployment falls back to. The LIVE default
 * is the `ai.generate.model` AppSetting row, and a row that exists OVERRIDES
 * this — so changing the constant alone does not change the default anywhere
 * the row has been set. See scripts/set-default-ai-model.sql.
 */
export const DEFAULT_AI_MODEL = "claude-opus-5";

/**
 * What to use when even the default is unavailable HERE.
 *
 * `moonshotModels()` returns nothing without `MOONSHOT_API_KEY`, so in an
 * environment with no Moonshot credentials `kimi-k3` is not a known model and
 * resolving to it would hand the caller an id nothing can call — turning a
 * quality problem into a 503. This keeps the promise the resolver's callers rely
 * on: what comes back is always something this deployment can actually run.
 */
const LAST_RESORT_MODEL = AI_MODELS[0].id;

/**
 * Extra models for a self-hosted / on-prem deployment, declared in the
 * `AI_CUSTOM_MODELS` env var (comma-separated `id|Label`, or bare `id`). These
 * pair with `ANTHROPIC_BASE_URL` pointing at a local Anthropic-compatible gateway
 * (e.g. LiteLLM in front of vLLM/Ollama), so an air-gapped tenant can run AI
 * Generate against a local model — no traffic to Anthropic. Server-only: on the
 * client the var is stripped and this returns [] (the client gets the list as a
 * prop). Empty/unset → no custom models (plain Claude behaviour). */
export function customModels(): AiModel[] {
  const raw = process.env.AI_CUSTOM_MODELS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry): AiModel | null => {
      const [rawId, ...rest] = entry.split("|");
      const id = rawId.trim();
      if (!id) return null;
      return { id, label: rest.join("|").trim() || id };
    })
    .filter((m): m is AiModel => m !== null);
}

/**
 * Moonshot (Kimi) models, offered ONLY when `MOONSHOT_API_KEY` is set — so a
 * Claude-only deployment's picker stays clean. Ids come from `MOONSHOT_MODELS`
 * (same `id|Label` syntax as AI_CUSTOM_MODELS); when that's unset we fall back to
 * a small curated default so the feature works out of the box with just the key.
 * Reached via Moonshot's Anthropic-compatible endpoint (anthropicClient.ts).
 * Server-only (env is stripped client-side → [] there; the client gets the list
 * as a prop). */
// Only ids that resolve on the current Kimi platform (platform.kimi.ai /
// api.moonshot.ai) go here — a wrong id 404s "Not found the model … or Permission
// denied". These three were confirmed live against a real account; the legacy ids
// (kimi-latest, kimi-k2-0711-preview, moonshot-v1-*) are retired and 404. Vision is
// left unset (image support is inconclusive on these) — Claude is the image→diagram
// path. Override the whole list with MOONSHOT_MODELS using exact console ids.
const DEFAULT_MOONSHOT_MODELS: AiModel[] = [
  { id: "kimi-k3", label: "Kimi K3", provider: "moonshot" },
  { id: "kimi-k2.6", label: "Kimi K2.6", provider: "moonshot" },
  { id: "kimi-k2.7-code", label: "Kimi K2.7 Code", provider: "moonshot" },
];

export function moonshotModels(unlocked?: ReadonlySet<string>): AiModel[] {
  if (!resolvedEnvSecret(process.env.MOONSHOT_API_KEY) && !unlocked?.has("moonshot")) return [];
  const raw = process.env.MOONSHOT_MODELS?.trim();
  if (!raw) return DEFAULT_MOONSHOT_MODELS;
  return raw
    .split(",")
    .map((entry): AiModel | null => {
      const [rawId, ...rest] = entry.split("|");
      const id = rawId.trim();
      if (!id) return null;
      // Best-effort vision flag from the id ("…vision…" or "kimi-latest"); unknown
      // ids are left undefined (allowed in the vision picker, not flagged).
      const vision = /vision/i.test(id) || /^kimi-latest/i.test(id) ? true : undefined;
      return { id, label: rest.join("|").trim() || id, provider: "moonshot", vision };
    })
    .filter((m): m is AiModel => m !== null);
}

/**
 * DeepSeek models, offered ONLY when `DEEPSEEK_API_KEY` is set. Reached via
 * DeepSeek's Anthropic-compatible endpoint (https://api.deepseek.com/anthropic),
 * so the same SDK + Messages shape works — see anthropicClient.ts. The account's
 * live model ids are `deepseek-v4-flash` (fast/cheap) and `deepseek-v4-pro` (more
 * capable) — confirmed via GET /models. (The generic `deepseek-chat` /
 * `deepseek-reasoner` aliases both currently resolve to v4-flash, so they're NOT
 * used here — we register the two distinct models directly.) No vision on this
 * endpoint. Override with `DEEPSEEK_MODELS` (`id|Label`, comma-separated).
 */
const DEFAULT_DEEPSEEK_MODELS: AiModel[] = [
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "deepseek", vision: false },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", provider: "deepseek", vision: false },
];

export function deepseekModels(unlocked?: ReadonlySet<string>): AiModel[] {
  if (!resolvedEnvSecret(process.env.DEEPSEEK_API_KEY) && !unlocked?.has("deepseek")) return [];
  const raw = process.env.DEEPSEEK_MODELS?.trim();
  if (!raw) return DEFAULT_DEEPSEEK_MODELS;
  return raw
    .split(",")
    .map((entry): AiModel | null => {
      const [rawId, ...rest] = entry.split("|");
      const id = rawId.trim();
      if (!id) return null;
      return { id, label: rest.join("|").trim() || id, provider: "deepseek", vision: false };
    })
    .filter((m): m is AiModel => m !== null);
}

/**
 * Google Gemini models, offered ONLY when BOTH `GOOGLE_API_KEY` and
 * `GOOGLE_BASE_URL` are set. Gemini is NOT Anthropic-Messages-API native, so
 * `GOOGLE_BASE_URL` MUST point at an Anthropic-compatible gateway (e.g. LiteLLM
 * Proxy) that fronts Gemini — the app then reuses the same SDK + Messages-API
 * shape, Bearer-authenticated (see anthropicClient.ts), exactly like Moonshot.
 * Requiring the base URL (no public default exists) keeps the picker from showing
 * a Gemini model that can't actually resolve. Ids come from `GOOGLE_MODELS` (same
 * `id|Label` syntax) — use the exact model names your gateway exposes — else a
 * small curated default. Gemini is multimodal, so vision defaults to true.
 * Server-only (env is stripped client-side → [] there; the client gets the list
 * as a prop). */
const DEFAULT_GOOGLE_MODELS: AiModel[] = [
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "google", vision: true },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google", vision: true },
];

export function googleModels(): AiModel[] {
  if (!resolvedEnvSecret(process.env.GOOGLE_API_KEY) || !process.env.GOOGLE_BASE_URL?.trim()) return [];
  const raw = process.env.GOOGLE_MODELS?.trim();
  if (!raw) return DEFAULT_GOOGLE_MODELS;
  return raw
    .split(",")
    .map((entry): AiModel | null => {
      const [rawId, ...rest] = entry.split("|");
      const id = rawId.trim();
      if (!id) return null;
      // Gemini models are multimodal; a "…-text…" id opts out, else default true.
      const vision = /(-text\b|text-only)/i.test(id) ? false : true;
      return { id, label: rest.join("|").trim() || id, provider: "google", vision };
    })
    .filter((m): m is AiModel => m !== null);
}

/**
 * Microsoft models — Azure OpenAI (GPT / o-series) and Microsoft's own Phi family —
 * offered ONLY when BOTH `MICROSOFT_API_KEY` and `MICROSOFT_BASE_URL` are set. Like
 * Gemini, these speak the OpenAI shape (NOT Anthropic Messages), so
 * `MICROSOFT_BASE_URL` MUST point at an Anthropic-compatible gateway (e.g. LiteLLM
 * Proxy — the same one that can front Gemini) that translates to Azure OpenAI / Phi;
 * the app then reuses the SDK + Messages shape, Bearer-authenticated. Ids come from
 * `MICROSOFT_MODELS` (same `id|Label` syntax) — use the exact model / deployment
 * names your gateway exposes — else a small curated default. GPT/o-series are
 * multimodal (vision true); base Phi is text (vision false; a "…multimodal/vision…"
 * id opts back in). Kept distinct from the SharePoint/Entra `AZURE_*` vars on
 * purpose. Server-only. */
const DEFAULT_MICROSOFT_MODELS: AiModel[] = [
  { id: "gpt-4o", label: "GPT-4o", provider: "microsoft", vision: true },
  { id: "gpt-4o-mini", label: "GPT-4o mini", provider: "microsoft", vision: true },
  { id: "phi-4", label: "Phi-4", provider: "microsoft", vision: false },
];

export function microsoftModels(): AiModel[] {
  if (!resolvedEnvSecret(process.env.MICROSOFT_API_KEY) || !process.env.MICROSOFT_BASE_URL?.trim()) return [];
  const raw = process.env.MICROSOFT_MODELS?.trim();
  if (!raw) return DEFAULT_MICROSOFT_MODELS;
  return raw
    .split(",")
    .map((entry): AiModel | null => {
      const [rawId, ...rest] = entry.split("|");
      const id = rawId.trim();
      if (!id) return null;
      // GPT / o-series are multimodal; base Phi is text unless the id says otherwise.
      const vision = /^phi/i.test(id) && !/(multimodal|vision)/i.test(id) ? false : true;
      return { id, label: rest.join("|").trim() || id, provider: "microsoft", vision };
    })
    .filter((m): m is AiModel => m !== null);
}

/**
 * Ollama models — one or more LLMs hosted on a LOCAL Ollama server (e.g. a Linux
 * box on your LAN). Offered ONLY when `OLLAMA_BASE_URL` is set. Like Gemini /
 * Microsoft, Ollama does NOT speak the Anthropic Messages API, so `OLLAMA_BASE_URL`
 * MUST point at an Anthropic-compatible gateway (LiteLLM Proxy) that fronts Ollama —
 * run LiteLLM alongside Ollama on that box (see gateway/OLLAMA-SETUP.md). The app
 * then reuses the same SDK + Messages shape, Bearer-authenticated (`OLLAMA_API_KEY`
 * = the LiteLLM master key; optional if the gateway has no auth). Ids come from
 * `OLLAMA_MODELS` (same `id|Label` syntax) and MUST match the gateway's model names
 * — use an `ollama/<model>` prefix so pricing/telemetry tag them as local (free).
 * Local models are text-only unless the id hints vision (llava / vision / multimodal).
 * Because the server makes the call, the Ollama box only needs to be reachable from
 * wherever Diagramatix runs: local dev reaches a LAN box directly; prod (Azure) would
 * need the gateway exposed via a tunnel. Server-only. */
const DEFAULT_OLLAMA_MODELS: AiModel[] = [
  { id: "ollama/llama3.1", label: "Llama 3.1 (local)", provider: "ollama", vision: false },
];

/**
 * OpenRouter — ONE key in front of hundreds of models.
 *
 * Unlike every other provider here it speaks **OpenAI Chat Completions**, not
 * the Anthropic Messages API, so it goes through the openAiShape adapter rather
 * than the SDK directly. That is the whole reason it needs no gateway: the
 * adapter is the gateway, in-process.
 *
 * Model ids are namespaced `vendor/model` (`anthropic/claude-sonnet-4.6`,
 * `openai/gpt-5.2`), which is also what keeps them apart from every other
 * provider's ids when routing.
 *
 * The default list is deliberately SHORT and the env var is the real interface:
 * OpenRouter's catalogue changes weekly, and a hardcoded list is a list that is
 * wrong by the time anyone reads it. Set `OPENROUTER_MODELS` to exactly what
 * this deployment should offer.
 */
const DEFAULT_OPENROUTER_MODELS: AiModel[] = [
  { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6 (OpenRouter)", provider: "openrouter", vision: true },
  { id: "openai/gpt-5.2", label: "GPT-5.2 (OpenRouter)", provider: "openrouter", vision: true },
];

export function openrouterModels(unlocked?: ReadonlySet<string>): AiModel[] {
  if (!resolvedEnvSecret(process.env.OPENROUTER_API_KEY) && !unlocked?.has("openrouter")) return [];
  const raw = process.env.OPENROUTER_MODELS?.trim();
  if (!raw) return DEFAULT_OPENROUTER_MODELS;
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id, ...rest] = entry.split("|");
      const label = rest.join("|").trim() || id.trim();
      // Vision is UNKNOWN for an id somebody typed into an env var, and unknown
      // is stored as unknown — claiming true would offer it for image work it
      // may not do, and claiming false would hide a model that can.
      return { id: id.trim(), label: `${label} (OpenRouter)`, provider: "openrouter" as const };
    })
    .filter((m) => m.id.length > 0);
}

export function ollamaModels(): AiModel[] {
  if (!process.env.OLLAMA_BASE_URL?.trim()) return [];
  const raw = process.env.OLLAMA_MODELS?.trim();
  if (!raw) return DEFAULT_OLLAMA_MODELS;
  return raw
    .split(",")
    .map((entry): AiModel | null => {
      const [rawId, ...rest] = entry.split("|");
      const id = rawId.trim();
      if (!id) return null;
      const vision = /(llava|vision|multimodal)/i.test(id);
      return { id, label: rest.join("|").trim() || id, provider: "ollama", vision };
    })
    .filter((m): m is AiModel => m !== null);
}

/** Claude models, plus Moonshot/Kimi, Google/Gemini, Microsoft/Azure and local
 *  Ollama (each when configured), plus any local/custom models. */
/**
 * Every model this deployment can call.
 *
 * `unlocked` names providers the CURRENT USER has supplied their own key for.
 * Their models are then listed even though the deployment has no key of its own
 * — otherwise storing a key unlocks nothing, because the picker is built from
 * the deployment's environment and has never heard of the provider.
 *
 * Omitted everywhere except the model-picker route, so every other caller keeps
 * the deployment-only view it has always had.
 */
export const allModels = (unlocked?: ReadonlySet<string>): AiModel[] => [
  ...AI_MODELS, ...moonshotModels(unlocked), ...googleModels(), ...microsoftModels(),
  ...deepseekModels(unlocked), ...openrouterModels(unlocked), ...ollamaModels(), ...customModels(),
];

export const isKnownAiModel = (id: string | null | undefined): boolean =>
  !!id && allModels().some((m) => m.id === id);

export const aiModelLabel = (id: string | null | undefined): string =>
  allModels().find((m) => m.id === id)?.label ?? id ?? "(unknown)";

/**
 * The provider for a NAMESPACED id, from its shape alone.
 *
 * OpenRouter ids are `vendor/model`, and the slash is the tell. This matters
 * when the registry cannot answer: `openrouterModels()` returns nothing unless
 * the DEPLOYMENT has a key, so a user running on their OWN OpenRouter key asks
 * about an id the registry has never heard of. Falling through to "anthropic"
 * there would post an OpenRouter model name to Anthropic — a guaranteed failure,
 * and one whose error message points at the wrong vendor.
 *
 * `aiRates.providerOf` carries the fuller prefix table for BILLING, where every
 * id must be attributed to something. This is deliberately narrower: it only
 * answers where the id shape is unambiguous, so an unknown bare name still
 * defaults to Anthropic exactly as it always has.
 */
export function providerFromIdShape(id: string): AiProvider | undefined {
  if (id.includes("/") && !/^ollama[/:]/i.test(id)) return "openrouter";
  return undefined;
}

/** The provider serving a model id. Unknown / untagged ids ⇒ "anthropic". */
export const providerForModel = (id: string | null | undefined): AiProvider =>
  allModels().find((m) => m.id === id)?.provider
    ?? (id ? providerFromIdShape(id) : undefined)
    ?? "anthropic";

/** A model's vision capability: true / false / undefined (unknown). */
export const modelVision = (id: string | null | undefined): boolean | undefined =>
  allModels().find((m) => m.id === id)?.vision;

/** Resolve a stored setting value to a usable model id: the stored value if it's
 *  a known model, else the production default, else something this deployment can
 *  actually reach. Pure — unit-tested. */
export const resolveAiModel = (raw: string | null | undefined): string =>
  isKnownAiModel(raw) ? (raw as string)
    : isKnownAiModel(DEFAULT_AI_MODEL) ? DEFAULT_AI_MODEL
    : LAST_RESORT_MODEL;
