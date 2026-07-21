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
export type AiProvider = "anthropic" | "moonshot";

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
  { id: "claude-opus-4-8", label: "Opus 4.8", vision: true },
  { id: "claude-sonnet-5", label: "Sonnet 5", vision: true },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", vision: true },
];

/** Production default for AI Generate. Haiku 4.5 is consistently the best BPMN
 *  generator in practice (and the cheapest/fastest), so it's the default until a
 *  SuperAdmin changes it via the AI Generate Model setting. */
export const DEFAULT_AI_MODEL = "claude-haiku-4-5-20251001";

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

export function moonshotModels(): AiModel[] {
  if (!resolvedEnvSecret(process.env.MOONSHOT_API_KEY)) return [];
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

/** Claude models, plus Moonshot/Kimi (when configured), plus any local/custom models. */
export const allModels = (): AiModel[] => [...AI_MODELS, ...moonshotModels(), ...customModels()];

export const isKnownAiModel = (id: string | null | undefined): boolean =>
  !!id && allModels().some((m) => m.id === id);

export const aiModelLabel = (id: string | null | undefined): string =>
  allModels().find((m) => m.id === id)?.label ?? id ?? "(unknown)";

/** The provider serving a model id. Unknown / untagged ids ⇒ "anthropic". */
export const providerForModel = (id: string | null | undefined): AiProvider =>
  allModels().find((m) => m.id === id)?.provider ?? "anthropic";

/** A model's vision capability: true / false / undefined (unknown). */
export const modelVision = (id: string | null | undefined): boolean | undefined =>
  allModels().find((m) => m.id === id)?.vision;

/** Resolve a stored setting value to a usable model id: the stored value if it's
 *  a known model, otherwise the production default. Pure — unit-tested. */
export const resolveAiModel = (raw: string | null | undefined): string =>
  isKnownAiModel(raw) ? (raw as string) : DEFAULT_AI_MODEL;
