/**
 * "Selected" is a command word now, and the recogniser keeps eating it.
 *
 * Once you can say "surround the selected elements", "rename the selected pool",
 * "move the selected task right", the word `selected` carries as much meaning as
 * the verb in front of it — it is what says WHICH thing to act on. And it is
 * routinely returned as "connect" (Paul, 2026-09-17). Two reasons, both ours:
 * `connect` is in the recogniser's keyword boost list and `selected` was not, and
 * the two are close in en-AU once the final consonant is clipped.
 *
 * Boosting `selected` (app/lib/dictation/index.ts) stops most of it at source.
 * This module is the second half, for what still gets through.
 *
 * WHY IT IS SAFE TO REWRITE A REAL COMMAND WORD. `connect` is a verb of its own,
 * so rewriting it anywhere would break "connect Review to Approve". The repair
 * only fires where the token sits DIRECTLY AFTER another command verb, which is
 * a position `connect` never legitimately occupies: nobody says "surround
 * connect" or "rename connect". Everything else is left exactly as spoken.
 *
 * Word boundaries matter here: "rename connector Order Placed to X" must survive
 * untouched, so the patterns match `connect` as a whole word and never the
 * prefix of `connector`.
 *
 * THREE LEADING-WORD REPAIRS LIVE HERE — "selected", "turn" and "add" — and
 * `repairHeardWords` applies all of them. Both the command grammar and the
 * hold (`incompleteCommand.ts`) call that one function, so the parser and the
 * hold can never disagree about what was said: before 2026-09-25 only the
 * parser repaired, and "and a message from review" was not held while "add a
 * message from review" was.
 */
import { SYMBOL_PHRASES } from "./ops";
import { POOL_WORDS, LANE_WORDS, SUBLANE_WORDS, PARTICIPANT_WORDS, BOX_WORDS, MESSAGE_WORDS, wordAlternation } from "./containerWords";
import { BOUNDARY_EVENT_NOUN } from "./boundaryEventPhrase";
import { containsAnotherCommand, startsWithCommandVerb, COMPRESS_COMMAND_VERBS } from "./commandVerbs";

/**
 * Verbs after which a reference to the selection is expected.
 *
 * Paul named surround, enclose, rename, move, delete, nudge and wrap; the rest
 * are the other verbs in the grammar that take a target the same way, since the
 * mishearing is a property of the word and not of which verb precedes it.
 */
const SCOPE_VERBS = [
  // Paul's list.
  "surround", "enclose", "rename", "move", "delete", "nudge", "wrap",
  // The rest of the grammar's target-taking verbs.
  "unwrap", "dissolve", "unpack", "flatten", "explode",
  "label", "remove", "connect", "disconnect", "swap", "colour", "color",
  ...COMPRESS_COMMAND_VERBS, "extend", "align", "select", "copy", "duplicate", "make",
] as const;

/**
 * What comes back instead of "selected".
 *
 * Every entry is a whole word. `connect`/`connected` are the ones Paul hit;
 * the others are near-homophones that lose the same leading syllable. Kept
 * tight on purpose — a wrong repair here silently retargets a command.
 */
const MISHEARD_SELECTED = [
  "connect", "connects", "connected", "connecting",
  "collected", "collect",
  "elected", "select it", "selective", "cellected", "sellected",
] as const;

/** Also accepted as "the selection" once repaired. */
const SELECTION_FORMS = ["selected", "selection", "selections"] as const;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const VERB_ALT = SCOPE_VERBS.map(esc).join("|");
const MISHEARD_ALT = MISHEARD_SELECTED.map(esc).join("|");

/**
 * `<verb> [the] <misheard>` — the verb is kept exactly as spoken (including its
 * case and any leading filler), only the target word is rewritten.
 */
const REPAIR_RE = new RegExp(
  `\\b(${VERB_ALT})(\\s+(?:the|this|that|these|those)\\s+|\\s+)(${MISHEARD_ALT})\\b`,
  "gi",
);

export interface SelectedWordRepair {
  /** The utterance, with any misheard "selected" put back. */
  text: string;
  /** True when something was rewritten, so the caller can say so in the log. */
  corrected: boolean;
}

/**
 * Put "selected" back where the recogniser dropped it.
 *
 * Returns the text unchanged, with `corrected: false`, when there is nothing to
 * repair — which is the overwhelmingly common case, so callers can apply this
 * to every utterance without thinking about it.
 */
export function repairSelectedWord(text: string): SelectedWordRepair {
  if (!text) return { text, corrected: false };
  let corrected = false;
  const out = text.replace(REPAIR_RE, (_m, verb: string, gap: string, heard: string) => {
    corrected = true;
    // Preserve whatever filler the speaker used ("the", "these", …) and keep
    // the capitalisation of the word we are replacing, so a sentence-initial
    // "Connect" does not come back as a lower-case "selected" mid-sentence.
    const replacement = /^[A-Z]/.test(heard) ? "Selected" : "selected";
    return `${verb}${gap}${replacement}`;
  });
  return { text: out, corrected };
}

/**
 * "Ten on gold flashing" → "turn on gold flashing" (Paul, 2026-09-18).
 *
 * The recogniser reaches for "ten" where the speaker said "turn". Only repaired
 * at the very start of an utterance and only when the next word is `on` or
 * `off`, which is a shape no sentence beginning with a real "ten" has: nobody
 * says "ten on" or "ten off" to a diagram. Everything else keeps the number.
 *
 * Deliberately narrow because "ten" IS a number, and a numbered pick is the one
 * place it has to survive untouched — a pick is a bare number with nothing
 * after it, so it never matches.
 */
const TURN_MISHEARD = ["ten", "tern", "turned", "tan", "torn", "tun"] as const;

const TURN_RE = new RegExp(`^(${TURN_MISHEARD.map(esc).join("|")})(\\s+(?:on|off)\\b)`, "i");

export function repairTurnWord(text: string): SelectedWordRepair {
  if (!text) return { text, corrected: false };
  let corrected = false;
  const out = text.replace(TURN_RE, (_m, heard: string, rest: string) => {
    corrected = true;
    return (/^[A-Z]/.test(heard) ? "Turn" : "turn") + rest;
  });
  return { text: out, corrected };
}

/** Exported for tests. */
export const TURN_MISHEARD_WORDS = TURN_MISHEARD;

/**
 * "and message" / "Handle message" → "add message" (Paul, 2026-09-25).
 *
 * Both came back as "didn't understand that", and the AI fallback failed too.
 * Paul's note on each: "Should recognise 'Add'". Every grammar rule is anchored
 * on a real verb, so a misheard verb reached nothing. His decision on the bet:
 * "and" is read as "add"; "handle" only in the bare message command. "At" was
 * NOT approved — it is the word that starts a real place phrase ("at a gateway,
 * add a task …"), and a locative split at a pause would add wrong elements.
 */
const MISHEARD_ADD_BARE = ["and", "handle"] as const;
const MISHEARD_ADD_LEADING = ["and"] as const;

/**
 * (a) The bare command, whole utterance only: exactly
 * `(and|handle)[,] [a ]message[ flow]` and trailing punctuation — the shape
 * Paul was heard to say, and nothing wider. No "the", no plural: "delete the
 * gateway … and the message" is a conjunction, and turning it into the
 * numbered message picker would capture the next utterances until "done".
 * Anchored at both ends, so "Handle Message 1" (a message's own name) and
 * "connect Handle Message 1 to Customer" are untouched.
 *
 * Why "handle" at all — a hypothesis, not yet measured: on Paul's diagram
 * `diagramKeyterms` (app/lib/dictation/diagramKeyterms.ts) sends "Handle
 * Timeout" to Deepgram as a keyword in every snapshot of the session, and a
 * boosted "Handle" is a likely reason "add" came back as "Handle". Paul's rule:
 * "every keyword boost is a bet against every other word — fix at BOTH the
 * recogniser and the parser". This fold is the parser half. If replaying the
 * clip with and without the diagram keyterms confirms it, the recogniser half
 * is to stop sending label words that sound like command verbs.
 */
const ADD_BARE_RE = new RegExp(
  `^(${MISHEARD_ADD_BARE.join("|")}),?\\s+((?:a\\s+)?message(?:\\s+flow)?[.?!,]*)$`,
  "i",
);

/**
 * (b) The leading word before an add: "and a|an [new] <thing> …", or the bare
 * singular "and message …" (the observed pair). <thing> is every noun an add
 * can name, read from the lists the grammar itself reads — symbol types,
 * container words, participant / box / message words and the boundary-event
 * phrase — so a word the grammar learns is folded the same day. "New" is only
 * ever a modifier: "and a new one" is not an add. No counts, "another" or
 * "the" — Paul was not heard to say them, and "and the gateway" is how a
 * conjunction sounds.
 */
const ADD_TYPE_ALT = [
  BOUNDARY_EVENT_NOUN,
  wordAlternation([
    ...SYMBOL_PHRASES, ...POOL_WORDS, ...LANE_WORDS, ...SUBLANE_WORDS,
    ...PARTICIPANT_WORDS, ...BOX_WORDS, ...MESSAGE_WORDS,
  ]),
].join("|");
const ADD_LEADING_RE = new RegExp(
  `^(${MISHEARD_ADD_LEADING.join("|")}),?\\s+((?:(?:a|an)\\s+(?:new\\s+)?(?:${ADD_TYPE_ALT}))|(?:${wordAlternation(MESSAGE_WORDS)}))(?=[\\s.,!?;:]|$)`,
  "i",
);

const asAdd = (heard: string) => (/^[A-Z]/.test(heard) ? "Add" : "add");

export function repairAddWord(text: string): SelectedWordRepair {
  if (!text) return { text, corrected: false };
  const bare = text.match(ADD_BARE_RE);
  if (bare) return { text: `${asAdd(bare[1])} ${bare[2]}`, corrected: true };
  const lead = text.match(ADD_LEADING_RE);
  if (!lead) return { text, corrected: false };
  // The second-clause guard. What follows the type word is a name, a position
  // or nothing — never another command. "And a gateway, connect yes to
  // approve" and "and a task called review connect it to approve" are two
  // sentences, and folding them made a gateway or task NAMED after the second
  // one. A verb followed by a noun still folds: "and a task called send
  // invoice" is a task called Send invoice.
  const tail = text.slice(lead[0].length);
  if (startsWithCommandVerb(tail) || containsAnotherCommand(tail)) return { text, corrected: false };
  return { text: `${asAdd(lead[1])} ${lead[2]}${tail}`, corrected: true };
}

/** Exported for tests. */
export const MISHEARD_ADD_BARE_WORDS = MISHEARD_ADD_BARE;
export const MISHEARD_ADD_LEADING_WORDS = MISHEARD_ADD_LEADING;

/**
 * Every leading-word repair, in order. The ONE entry point: the grammar and the
 * hold both call this, never the repairs one by one. "Turn" first and
 * "selected" last, as the grammar always ran them; "add" between, since none of
 * the three can produce another's trigger.
 */
export function repairHeardWords(text: string): string {
  return repairSelectedWord(repairAddWord(repairTurnWord(text).text).text).text;
}

/** True when this word already refers to the selection. */
export function isSelectionWord(word: string): boolean {
  return (SELECTION_FORMS as readonly string[]).includes(word.trim().toLowerCase());
}

/** Exported for the dictation keyword-boost list and for tests. */
export const SELECTED_BOOST_WORDS = SELECTION_FORMS;
export const SCOPE_VERBS_FOR_SELECTED = SCOPE_VERBS;
export const MISHEARD_SELECTED_WORDS = MISHEARD_SELECTED;
