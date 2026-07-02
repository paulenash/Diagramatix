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

export const isKnownAiModel = (id: string | null | undefined): boolean =>
  !!id && AI_MODELS.some((m) => m.id === id);

export const aiModelLabel = (id: string | null | undefined): string =>
  AI_MODELS.find((m) => m.id === id)?.label ?? id ?? "(unknown)";

/** Resolve a stored setting value to a usable model id: the stored value if it's
 *  a known model, otherwise the production default. Pure — unit-tested. */
export const resolveAiModel = (raw: string | null | undefined): string =>
  isKnownAiModel(raw) ? (raw as string) : DEFAULT_AI_MODEL;
