/**
 * The words that say WHERE — "after X", "before X", "here" — and the tidy-up a
 * reference said in a sentence gets before it is looked up.
 *
 * Written once. The add rule, the template rule, the stranded-tail rule, the
 * template window's answers and the greedy-rule guards all read these, so none
 * of them can learn a word the others do not know: "add a task following X"
 * and "add template following X" mean the same "following", and a guard that
 * declines "template <place word> …" declines exactly the place words the
 * template rule reads.
 *
 * Pure. Imports nothing, so every grammar module can use it without a cycle.
 */

/** "after X" — X comes first, and the new thing follows it. */
export const AFTER_WORDS = "(?:after|following|behind|next\\s+to|onto)";

/** "before X" — a template can only go AFTER something; these are refused. */
export const BEFORE_WORDS = "(?:before|ahead\\s+of|in\\s+front\\s+of|preceding)";

/** "here" / "over there" / "right here" — the mouse pointer (M5). */
export const HERE_WORDS = "(?:right\\s+|over\\s+|just\\s+)?(?:here|there)";

/**
 * What may come in front of an "after X" said on its own, after a pause:
 * "and after the start", "that's after Review", "put it after Check Stock"
 * (the stranded-tail rule, Paul 2026-09-21). The template window reads the
 * same tail when "Add template." … "After selected." arrives in two halves.
 */
export const TAIL_LEAD_IN = "(?:and|that'?s|it'?s|put\\s+it|goes)";

/** A reference as it was said: trailing punctuation and surrounding quotes off. */
export function cleanRef(s: string): string {
  return s.trim().replace(/[.,!?;:]+$/g, "").replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
}
