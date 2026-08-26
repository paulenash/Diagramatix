/**
 * Which `DiagramRules` categories carry a read-only BUILT-IN as well as the
 * admin's editable text.
 *
 * Most categories are one editable blob. A few are two halves with different
 * lifetimes: a house standard that ships in code and should improve for everyone
 * on a deploy, plus an organisation's own additions that must survive every
 * deploy untouched. The editor shows the built-in above the box and saves only
 * the additions.
 *
 * This registry exists because that arrangement was hardcoded to
 * `category === "staff-narrative"` in two places — the API route that decorates a
 * row and the editor that chooses a component for it — so adding the sixth such
 * category meant editing both. Now a category is built-in-backed if and only if
 * it appears here, and both sites just ask.
 */
import {
  DEFAULT_STAFF_NARRATIVE_BRIEFING, extractAdditionalRules,
} from "@/app/lib/ai/staffNarrative";
import {
  DEFAULT_MD_PROMPT, MD_PROMPT_TYPES, mdPromptCategory, extractMdPromptAdditions,
} from "@/app/lib/valueChain/promptTemplates";

export interface BuiltinRule {
  /** The read-only house standard, shown above the editable box. */
  builtin: string;
  /**
   * The editable portion of a stored row.
   *
   * Not always the whole row: Staff Narrative predates this split and has legacy
   * rows holding the entire briefing, which must be shown as-is rather than
   * offered for editing as though they were additions.
   */
  extractAdditions(stored: string | null | undefined): string;
  /** What the editor calls this category. */
  label: string;
  /** One line under the heading, saying what editing it affects. */
  hint: string;
}

export const BUILTIN_BY_CATEGORY: Record<string, BuiltinRule> = {
  "staff-narrative": {
    builtin: DEFAULT_STAFF_NARRATIVE_BRIEFING,
    extractAdditions: extractAdditionalRules,
    label: "Staff Narrative",
    hint: "The voice and house style of the first-person narrative generated from a BPMN diagram.",
  },
  ...Object.fromEntries(MD_PROMPT_TYPES.map((type) => [
    mdPromptCategory(type),
    {
      builtin: DEFAULT_MD_PROMPT[type],
      extractAdditions: extractMdPromptAdditions,
      label: `Repository prompt — ${type}`,
      hint: `How ${type} diagram prompts are written into a Process Repository .md by the prompt generator.`,
    } satisfies BuiltinRule,
  ])),
};

/** Null for an ordinary single-blob category. */
export const builtinFor = (category: string): BuiltinRule | null =>
  BUILTIN_BY_CATEGORY[category] ?? null;
