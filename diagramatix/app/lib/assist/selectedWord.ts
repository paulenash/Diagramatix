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
 */

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
  "compress", "extend", "align", "select", "copy", "duplicate", "make",
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

/** True when this word already refers to the selection. */
export function isSelectionWord(word: string): boolean {
  return (SELECTION_FORMS as readonly string[]).includes(word.trim().toLowerCase());
}

/** Exported for the dictation keyword-boost list and for tests. */
export const SELECTED_BOOST_WORDS = SELECTION_FORMS;
export const SCOPE_VERBS_FOR_SELECTED = SCOPE_VERBS;
export const MISHEARD_SELECTED_WORDS = MISHEARD_SELECTED;
