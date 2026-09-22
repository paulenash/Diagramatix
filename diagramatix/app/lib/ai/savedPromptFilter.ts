/**
 * Which saved prompts a filter shows.
 *
 * One rule for all three lists that show saved prompts — the new AI Generate
 * console, the sidebar AI Generate panel and the BPMN AI Plan panel. The
 * console had a filter first; the two sidebar panels had none (Paul,
 * 2026-09-22: "Saved Prompts need a filter field on the same line as the
 * heading to the right"). Written once so the three cannot drift into matching
 * different things.
 *
 * It matches the NAME or the TEXT, case-insensitively: somebody hunting for a
 * prompt usually remembers a phrase from inside it rather than what they
 * called it.
 *
 * Pure.
 */
export interface NamedPrompt { name: string; text: string }

export function filterSavedPrompts<T extends NamedPrompt>(prompts: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...prompts];
  return prompts.filter((p) => p.name.toLowerCase().includes(q) || p.text.toLowerCase().includes(q));
}
