/**
 * B5 — the guards that make an over-greedy grammar rule DECLINE.
 *
 * Four rules in `commandGrammar.ts` matched far more than they meant to:
 *
 *   "collapse the subprocess"        → compressPool { poolRef: "subprocess" }
 *   "swap Task A with Task B"        → swapLanes   { laneA: "Task A", … }
 *   "move the Assembly Line task up" → moveLane    { ref: "Assembly Line task" }
 *   "add a task before Review"       → a task LABELLED "before Review"
 *
 * The damage is not the wrong op — it is that a match BLOCKS THE FALLBACK. A
 * rule that returns null sends the sentence to the AI, which would very likely
 * have handled it. A rule that matches produces a confidently wrong op and an
 * error message, and the AI never sees the sentence at all. So the fix
 * everywhere is the same shape: recognise the cases the rule cannot really mean
 * and decline them, rather than trying to be cleverer about what they do mean.
 *
 * Two of the rules were loose FOR A REASON worth remembering. The grammar
 * spells pool as `(?:pool|poll|pull)` and lane as `(?:lanes?|lines?)` because
 * the recogniser mishears them — which is exactly why "Assembly LINE" trips the
 * lane rule. Tightening has to keep the mis-hear aliases working where they are
 * genuinely meant, so these guards test STRUCTURE (is the lane word attached to
 * the thing being moved?) rather than removing the aliases.
 *
 * Pure.
 */
import { SYMBOL_PHRASES, SYMBOL_SYNONYMS } from "./ops";
import { AFTER_WORDS, BEFORE_WORDS, HERE_WORDS } from "./placeWords";
import { TEMPLATE_NOUN } from "./templatePhrase";
import { COMPRESS_COMMAND_VERBS, EXPAND_COMMAND_VERB } from "./commandVerbs";

/** Lane and pool words, including the mis-hears the grammar accepts. */
const CONTAINER_WORD = /^(?:pools?|polls?|pulls?|lanes?|lines?|sub-?lanes?|sub-?lines?)$/i;

const norm = (s: string) => s.toLowerCase().replace(/^(?:the|a|an)\s+/i, "").trim();

/**
 * Does this reference name an element KIND that is not a container — "the
 * subprocess", "Task A", "the gateway"?
 *
 * Used to stop the pool and lane rules swallowing a sentence that is plainly
 * about something else. Matched on the FIRST or LAST word so both "the
 * subprocess" and "Task A" are caught, while a pool genuinely called
 * "Task Force" (first word "task"… ) — see the caller, which only applies this
 * where a container was never named.
 */
export function namesNonContainerKind(ref: string): boolean {
  const s = norm(ref);
  if (!s) return false;
  const words = s.split(/\s+/);
  const candidates = new Set<string>();
  // Whole phrase, plus the leading and trailing one- and two-word runs, so
  // "expanded subprocess", "the gateway" and "Task A" are all reachable.
  candidates.add(s);
  candidates.add(words[0]);
  candidates.add(words[words.length - 1]);
  if (words.length > 1) {
    candidates.add(words.slice(0, 2).join(" "));
    candidates.add(words.slice(-2).join(" "));
  }
  // No container check needed: SYMBOL_SYNONYMS holds no pool/lane word (see
  // resolveRef, which says the same), so "the pool" can never match below. A
  // guard for it would be a line no input could reach.
  for (const c of candidates) {
    if (SYMBOL_PHRASES.includes(c) && SYMBOL_SYNONYMS[c]) return true;
  }
  return false;
}

/**
 * Is the lane word attached to the thing being moved, rather than merely
 * somewhere in the sentence?
 *
 * "move Sales lane up" and "move lane 2 up" mean a lane. "move the Assembly
 * Line task up" does not — the lane-ish word belongs to a NAME, and the thing
 * being moved is a task.
 */
export function laneWordIsAttached(ref: string, trailingLaneMatched: boolean): boolean {
  if (trailingLaneMatched) return true;
  const first = norm(ref).split(/\s+/)[0] ?? "";
  return CONTAINER_WORD.test(first);
}

/**
 * Words that introduce a RELATIONSHIP, not a name. An implicit label starting
 * with one of these is the rule mis-reading a positional phrase:
 * "insert a parallel gateway BETWEEN Check Stock and Pick Items" is not a
 * gateway called "between Check Stock and Pick Items".
 *
 * Only ever applied to an IMPLICIT label — the leftover after the type word.
 * An explicit "called …" is the user saying what they want, and "add a task
 * called Before Review" must still work.
 *
 * ("called" is the ONLY escape hatch in practice. The grammar has a quoted-name
 * branch, but `clean()` strips a trailing quote before it runs, so the pair
 * never matches and a bare quoted name arrives as an implicit leftover like any
 * other. Pre-existing, and barely relevant to a voice feature — you cannot say
 * quote marks — but worth knowing before trusting quotes to force a name.)
 */
const POSITIONAL_WORDS = "between|before|after|instead\\s+of|in\\s+place\\s+of|replacing|replaces?|above|below|under(?:neath)?|over|beside|next\\s+to|in\\s+front\\s+of|behind|onto|into|inside|within|from|to";
const POSITIONAL = new RegExp(`^(?:${POSITIONAL_WORDS})\\b`, "i");

/**
 * An implicit name that is only the word "template" — alone ("another
 * template"), or followed by where it should go ("template to the selected",
 * "template after", "template ahead"). The template rule reads every placement
 * it can; one that reaches the add rule is a phrasing it could not, and made a
 * TASK called "Template" (Paul, 2026-09-25). Only the bare word: "add a task
 * Template Review" is somebody's name for a task and is left alone.
 *
 * Built from the template rule's own noun and place words, so the two cannot
 * disagree about what "template" or "following" is. "ahead", "at", "on" and
 * "in" are the extra ones: a placement cut off by a pause, or one the template
 * rule does not read.
 */
const TEMPLATE_WORD_ONLY = new RegExp(
  `^${TEMPLATE_NOUN}(?:[,;:.]?\\s+(?:${POSITIONAL_WORDS}|${AFTER_WORDS}|${BEFORE_WORDS}|${HERE_WORDS}|ahead|at|on|in)\\b.*)?$`,
  "i",
);

export function namesOnlyTemplate(implicitLabel: string): boolean {
  return TEMPLATE_WORD_ONLY.test(norm(implicitLabel));
}

/**
 * The same words appearing LATER in an implicit label.
 *
 * Anchoring to the start was not enough. "Create a participant box for the
 * courier above customer" left the implicit label "participant box for the
 * courier above customer", which does not START with a positional word — so a
 * TASK was created carrying that whole sentence as its name, parked in
 * whichever sub-lane was last (Paul, 2026-09-21).
 *
 * A phrase in the middle of a name is weaker evidence than one at the front,
 * so this list is the unambiguous subset: a name really can contain "to" or
 * "from" ("Send to Customer", "Receive from Supplier"), but "X above Y" and
 * "X between A and B" are relationships every time. Declining costs nothing —
 * the AI gets it, and can place the thing properly.
 */
const POSITIONAL_INSIDE = /\s(?:between|above|below|under(?:neath)?|beside|next\s+to|in\s+front\s+of|behind|instead\s+of|in\s+place\s+of)\s+\S/i;

/**
 * An implicit label that is really ANOTHER COMMAND.
 *
 * "Put Surround everything with a pool." — the recogniser dropped the pause,
 * so the add rule took "put", found no symbol word in the rest, and made a
 * TASK named "Surround everything with a pool" (Paul, 2026-09-21). The
 * existing container guard is anchored at the start of the remainder, and this
 * one starts with a verb.
 *
 * Only words that are unmistakably instructions, and only when a CONTAINER
 * word or "everything" appears with them — "Review everything" is a fine name
 * for a task, and "Surround" on its own might be one. It is the pair that
 * gives it away.
 */
const COMMAND_VERB = new RegExp(`\\b(?:surround|enclose|wrap|${COMPRESS_COMMAND_VERBS.join("|")}|${EXPAND_COMMAND_VERB}|extend|widen|split|swap|disconnect|unlink)\\b`, "i");
const CONTAINER_MENTION = /\b(?:pool|poll|pull|lanes?|sub-?lanes?|everything|all elements|subprocess)\b/i;

export function looksLikeAnotherCommand(implicitLabel: string): boolean {
  const s = norm(implicitLabel);
  return COMMAND_VERB.test(s) && CONTAINER_MENTION.test(s);
}

export function looksPositionalNotAName(implicitLabel: string): boolean {
  const s = norm(implicitLabel);
  return POSITIONAL.test(s) || POSITIONAL_INSIDE.test(s) || looksLikeAnotherCommand(s);
}

/**
 * Does this text name a LANE or POOL where a symbol's name was expected?
 *
 * Paul's log, 2026-09-23: "Add a third lane to pool three." did not match the
 * lane rule — that rule counts "a/one/two/three…", not "a third" — so it fell
 * through to the generic add rule, which created a TASK LABELLED "third lane to
 * pool three" and reported success. A wrong element quietly added is worse than
 * a sentence the AI never saw: the AI canonicalises this one correctly.
 *
 * The lane and pool rules run first, so anything reaching here that still talks
 * about lanes or pools is a phrasing they could not read. Decline it.
 *
 * Checked on the words that would become the NAME, after "called X" has been
 * taken out, so a task someone deliberately calls "Assembly Line" is untouched.
 */
export function namesAContainer(text: string): boolean {
  const s = norm(text);
  const container = /(?:^|\s)(?:pools?|polls?|pulls?|lanes?|lines?|sub-?lanes?|sub-?lines?)(?:\s|$)/i.test(s);
  if (!container) return false;
  // A container word ALONE is very often part of a name — "Assembly Line",
  // "Pool cleaning" — and refusing those would send good commands to the AI.
  // What makes it an instruction rather than a name is the relationship word
  // that puts the container somewhere: "third lane TO pool three".
  return /(?:^|\s)(?:to|in|into|inside|on|onto|under|below|above|of|within|from)(?:\s|$)/i.test(s);
}
