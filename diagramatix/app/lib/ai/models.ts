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
}

export const AI_MODELS: AiModel[] = [
  { id: "claude-fable-5", label: "Fable 5" },
  { id: "claude-opus-4-8", label: "Opus 4.8" },
  { id: "claude-sonnet-5", label: "Sonnet 5" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
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
const DEFAULT_MOONSHOT_MODELS: AiModel[] = [
  { id: "kimi-latest", label: "Kimi Latest", provider: "moonshot" },
  { id: "kimi-k2-0711-preview", label: "Kimi K2", provider: "moonshot" },
  { id: "moonshot-v1-128k", label: "Moonshot v1 128k", provider: "moonshot" },
  { id: "moonshot-v1-128k-vision-preview", label: "Moonshot v1 128k (vision)", provider: "moonshot" },
];

export function moonshotModels(): AiModel[] {
  if (!process.env.MOONSHOT_API_KEY?.trim()) return [];
  const raw = process.env.MOONSHOT_MODELS?.trim();
  if (!raw) return DEFAULT_MOONSHOT_MODELS;
  return raw
    .split(",")
    .map((entry): AiModel | null => {
      const [rawId, ...rest] = entry.split("|");
      const id = rawId.trim();
      if (!id) return null;
      return { id, label: rest.join("|").trim() || id, provider: "moonshot" };
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

/** Resolve a stored setting value to a usable model id: the stored value if it's
 *  a known model, otherwise the production default. Pure — unit-tested. */
export const resolveAiModel = (raw: string | null | undefined): string =>
  isKnownAiModel(raw) ? (raw as string) : DEFAULT_AI_MODEL;
