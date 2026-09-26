/**
 * The command verbs — one list, read by every rule that has to ask "is this a
 * verb giving an instruction?"
 *
 * It was private to `incompleteCommand.ts`, where it decides whether a bare
 * verb ("Swap.", "Rename.") is the start of a sentence Deepgram split at a
 * pause. Two more rules ask the same question now, and a second copy of the
 * list would go stale the first time a verb was added to one and not the
 * other:
 *
 *   - the add-word repair (`selectedWord.ts`) must NOT read "and a gateway,
 *     connect yes to approve" as "add a gateway …" — a verb opening a second
 *     clause proves the sentence was never an add;
 *   - the stranded-tail rule (`commandGrammar.ts`) must not read "after Review
 *     add a task called Approve" — or "after Review add Approve" — as a bare
 *     "after X" tail.
 *
 * Its own module because `selectedWord.ts` imports it and `incompleteCommand.ts`
 * imports `selectedWord.ts`: kept in `incompleteCommand.ts` it would be an
 * import cycle.
 *
 * Pure.
 */

/**
 * Every verb that means "compress" — ONE list. Six copies had drifted apart
 * (2026-09-26 investigation), and "delete X and compress" was the casualty: the
 * delete rule knew "compact" but not "compress", so it deleted X, dropped the
 * compaction and showed a green tick.
 */
export const COMPRESS_VERBS = [
  "compress", "collapse", "shrink", "reduce", "shorten", "compact", "tighten", "condense", "minimise", "minimize",
] as const;

/**
 * The two strong enough to mark a command inside someone else's sentence. The
 * rest are ordinary words in names ("Reduce Cost", "Collapse Report"), and a
 * bare "Reduce." held for the rest of a sentence would wait ~12 s for nothing.
 */
export const COMPRESS_COMMAND_VERBS = ["compress", "shrink"] as const;

/** A compress verb as a regex source, with the forms people say: "compressed the pool", "compressing Sales". */
export const COMPRESS_VERB_SOURCE = `(?:compress(?:es|ed|ing)?|${COMPRESS_VERBS.filter((v) => v !== "compress").join("|")})`;

/**
 * The verbs a spoken command starts with. A bare one is held for the rest of
 * the sentence (`isIncompleteCommand`) — moved here verbatim, so the hold's
 * decisions are exactly what they were.
 */
export const COMMAND_VERBS = [
  "swap", "rename", "relabel", "label", "edit", "move", "slide", "nudge", "bump", "shift",
  "connect", "link", "join", "disconnect", "unlink", "delete", "remove",
  "add", "insert", "create", "put", "send", "draw", "attach", "place",
  ...COMPRESS_COMMAND_VERBS, "extend", "widen", "wrap", "surround", "enclose", "unwrap", "dissolve",
  "call", "change", "set",
] as const;

/**
 * The convert rule's verbs that are not already above ("make this a user
 * task", "turn the gateway into a parallel gateway").
 *
 * Deliberately NOT in `COMMAND_VERBS`: that list is also the hold's, and a
 * bare "make" or "turn" has always gone straight to the AI. Adding them there
 * would hold them for up to ~12 s — a change nobody asked for. They count only
 * where the question is "does a second command start here?"
 */
export const CONVERT_VERBS = ["make", "turn"] as const;

const VERB_ALT = [...COMMAND_VERBS, ...CONVERT_VERBS].join("|");

/**
 * What follows a verb when it is giving an instruction and never when it is
 * part of a name: "connect IT to Approve", "add A task". A name reads "Send
 * Invoice", "Place Order" — verb, then a noun — and must pass.
 */
const OBJECT_WORDS = "a|an|the|it|this|that|these|those|them";

const LEADS_WITH_VERB = new RegExp(`^[\\s,]*(?:${VERB_ALT})\\b`, "i");
const COMMA_THEN_VERB = new RegExp(`,\\s*(?:${VERB_ALT})\\b`, "i");
const VERB_THEN_OBJECT = new RegExp(`\\b(?:${VERB_ALT})\\s+(?:${OBJECT_WORDS})\\b`, "i");

/**
 * Does a second command start somewhere inside this text?
 *
 * True when a command verb follows a comma ("Review, connect …") or is
 * followed by an article or pronoun ("… add a task", "… connect it"). A verb
 * followed by a noun is not enough — "Send Invoice" and "Place Order" are what
 * activities are called.
 */
export function containsAnotherCommand(text: string): boolean {
  return COMMA_THEN_VERB.test(text) || VERB_THEN_OBJECT.test(text);
}

const VERB_AFTER_A_WORD = new RegExp(`\\s(?:${VERB_ALT}|new)\\b`, "i");

/**
 * Is this ONLY a reference, or does a second command run on after it?
 *
 * The stranded-tail rule's question ("after Review Claim" is a tail; "after
 * Review Claim add Escalate" is a whole sentence). A name may START with a
 * verb — activities are called "Send Invoice" and "Create Order" — so the
 * first word is the name's own. A command verb (or "new") anywhere after it
 * starts another command, with or without an article: read as a tail, "after
 * Review Claim add Escalate" connected Review Claim and silently dropped the
 * add. The price is that a name with a verb-word later in it ("after Price
 * Change") goes to the AI, as every verb did before this rule was shared.
 */
export function hasCommandAfterName(ref: string): boolean {
  const name = ref.trim().replace(/^(?:the|a|an)\s+/i, "");
  return containsAnotherCommand(name) || VERB_AFTER_A_WORD.test(name);
}

/**
 * Does this text open with a command verb (after an optional comma)?
 *
 * Only meaningful where a NAME cannot start — straight after a type word, as in
 * "and a gateway connect yes to approve". Never ask it of a name on its own:
 * "Send Invoice" opens with a verb and is a perfectly good task.
 */
export function startsWithCommandVerb(text: string): boolean {
  return LEADS_WITH_VERB.test(text);
}
