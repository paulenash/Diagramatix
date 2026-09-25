/**
 * Asking for a template, and where it goes: "add template", "add template after
 * the gateway", "… before Review", "… here".
 *
 * Paul, 2026-09-25, of "add template after selected": "It should allow user to
 * select a template then place the selected template After the selected
 * gateway." The bare "add template" opened the numbered window; anything longer
 * fell through to the add rule, which found no type word in "template" and made
 * a TASK called "Template" after the gateway — and widened every pool for it.
 *
 * The ask itself — verb, determiner, "template" — is written ONCE here
 * (TEMPLATE_PHRASE). The bare command, the anchored command and the add rule's
 * decline (greedyGuards `namesOnlyTemplate`) are all built on it; when they
 * were three lists, "add another template" still made a task called "another
 * template" while "add another template after Review" opened the window.
 *
 * The place words (after / before / here) are placeWords.ts's, shared with the
 * add rule and the stranded-tail rule.
 *
 * Pure.
 */
import { AFTER_WORDS, BEFORE_WORDS, HERE_WORDS, TAIL_LEAD_IN, cleanRef } from "./placeWords";

/** The verbs that ask for a template: the add rule's, and the ones people use for a template. */
const TEMPLATE_VERBS = "(?:add|insert|use|put|place|pick|choose|show|open|drop\\s+in)";

/** "template", "a template", "the templates", "another template", "one more template", "a new template". */
export const TEMPLATE_NOUN = "(?:(?:a|an|the|another|one\\s+more)\\s+)?(?:new\\s+)?templates?";

/** The ask: "add a template", "use another template", "show templates". */
export const TEMPLATE_PHRASE = `${TEMPLATE_VERBS}\\s+${TEMPLATE_NOUN}`;

export type TemplatePlace =
  | { afterRef: string }
  | { beforeRef: string }
  | { at: "pointer" };

/**
 * Read the words after "template": "after X", "before X", or "here". Anything
 * else — "called Intake" — is not a place, and null leaves it to the rules that
 * read names.
 */
export function parseTemplatePlace(tail: string): TemplatePlace | null {
  const t = tail.trim();
  let m = t.match(new RegExp(`^${AFTER_WORDS}\\s+(.+)$`, "i"));
  if (m && cleanRef(m[1])) return { afterRef: cleanRef(m[1]) };
  m = t.match(new RegExp(`^${BEFORE_WORDS}\\s+(.+)$`, "i"));
  if (m && cleanRef(m[1])) return { beforeRef: cleanRef(m[1]) };
  if (new RegExp(`^${HERE_WORDS}[.!?]*$`, "i").test(t)) return { at: "pointer" };
  return null;
}

/** "add template", "templates", "use another template" — the window, and nothing else said. */
export function isBareTemplateCommand(text: string): boolean {
  return new RegExp(`^(?:${TEMPLATE_PHRASE}|templates?)$`, "i").test(text.trim());
}

/**
 * "add template after X" as one command. Punctuation after the template word
 * is allowed: "Add template," is HELD by the fragment buffer (a trailing comma
 * means more is coming) and joined to the next final as "Add template, after
 * selected." — without it that stitched sentence missed this rule and went to
 * the AI. A full stop is the same pause, when the recogniser puts both halves
 * in one final ("Add template. After selected.").
 */
export function parseTemplateCommand(raw: string): TemplatePlace | null {
  const m = raw.trim().match(new RegExp(`^${TEMPLATE_PHRASE}[,;:.]?\\s+(.+)$`, "i"));
  return m ? parseTemplatePlace(m[1]) : null;
}

/**
 * Inside the open window, a stranded "after X" moves the template: "Add
 * template." … "After selected." is how the sentence arrives when the speaker
 * pauses, and by then the window is already open and waiting for a number.
 *
 * The lead-ins are the stranded-tail rule's, plus the ones that only make
 * sense while a template is showing for "it" to mean: "then", "move it",
 * "add it", "attach it". Outside the window "move it after X" is a command of
 * its own, so those stay here.
 */
export function parseTemplateAnswerPlace(utterance: string): TemplatePlace | null {
  const t = utterance.trim().replace(new RegExp(`^(?:${TAIL_LEAD_IN}|then|(?:add|attach|move)\\s+it)[,]?\\s+`, "i"), "");
  const p = parseTemplatePlace(t);
  return p && !("at" in p) ? p : null;
}

/** What the apply layer says when asked for "before". A true "before" is a
 *  splice (W → template → X, pushing X and everything after it right), and a
 *  template often has no single exit to join X by. */
export const TEMPLATE_BEFORE_REFUSAL =
  "a template can only go AFTER something — say “add template after <name>”";
