/**
 * The Claude models offered for AI diagram generation — the single source of
 * truth shared by the SuperAdmin model comparison, the AI-Generate default
 * setting, and the admin picker. Add/rename a model here and every surface stays
 * in step.
 */

export interface AiModel {
  id: string;
  label: string;
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

/** Claude models plus any configured local/custom models. */
export const allModels = (): AiModel[] => [...AI_MODELS, ...customModels()];

export const isKnownAiModel = (id: string | null | undefined): boolean =>
  !!id && allModels().some((m) => m.id === id);

export const aiModelLabel = (id: string | null | undefined): string =>
  allModels().find((m) => m.id === id)?.label ?? id ?? "(unknown)";

/** Resolve a stored setting value to a usable model id: the stored value if it's
 *  a known model, otherwise the production default. Pure — unit-tested. */
export const resolveAiModel = (raw: string | null | undefined): string =>
  isKnownAiModel(raw) ? (raw as string) : DEFAULT_AI_MODEL;
