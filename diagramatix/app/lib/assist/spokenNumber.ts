/**
 * The number at the front of a spoken pick ("3 Approve Order", "one Sales").
 *
 * WHY THIS IS ITS OWN MODULE. Two flows need it — rename-by-number and
 * message-by-number — and both had their own copy of a word-to-digit list.
 * More importantly it has to absorb a mishearing we CAUSED ourselves: the
 * recogniser is given `lane:3` as a keyword boost, the strongest weight in the
 * list, so on a numbered pick it reliably hears "lane" for "one" (Paul,
 * 2026-09-17). Boosting a BPMN word helps everywhere except the one place a
 * bare number is expected, and that is exactly where it hurts most, because a
 * pick is the shortest utterance a user ever makes and has the least context to
 * recover from.
 *
 * The map below is therefore applied ONLY to the leading token, and only where
 * a number is what the flow is waiting for. "Rename lane 2 to Sales" is
 * untouched; so is picking item 5 and naming it "Lane Manager", because there
 * the leading token is "five" and only the leading token is rewritten.
 */

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen", "twenty",
] as const;

/**
 * What the recogniser returns instead of each number word. Kept deliberately
 * tight: every entry is a real substitution seen in use or a near-homophone in
 * en-AU, not a guess. A word that could plausibly START A NAME is only listed
 * where the number reading is overwhelmingly more likely — which is why "for"
 * and "to" are here (nobody names a task "For Approval" starting at the pick
 * prompt) but "sex" and "ate" are not worth the risk of being wrong.
 */
const MISHEARD: Record<string, number> = {
  // The one that prompted this: `lane` is boosted at weight 3.
  lane: 1, lanes: 1, line: 1, lines: 1, wan: 1, won: 1, juan: 1, wun: 1,
  to: 2, too: 2, tu: 2, tue: 2,
  tree: 3, free: 3, thee: 3,
  for: 4, fore: 4, faw: 4,
  hive: 5,
  sicks: 6,
  nein: 9, nyne: 9,
  tenn: 10,
};

export interface LeadingNumber {
  /** The number the user picked. */
  n: number;
  /** Whatever followed it, trimmed — the new name, or "" when they only said the number. */
  rest: string;
  /** True when the leading token had to be corrected, so the caller can say so. */
  corrected: boolean;
}

/**
 * Read a leading number off a spoken pick, tolerating a filler prefix
 * ("number 3", "item 3", "the 3") and a misheard number word.
 * Returns null when the utterance does not start with a number at all.
 */
export function leadingSpokenNumber(text: string): LeadingNumber | null {
  const cleaned = String(text ?? "").trim().replace(/^[\s,.]+/, "");
  if (!cleaned) return null;

  // Strip a filler prefix before looking for the number itself.
  const withoutFiller = cleaned.replace(/^(?:number|item|the|no\.?)\s+/i, "");
  const m = withoutFiller.match(/^(\S+)\s*([\s\S]*)$/);
  if (!m) return null;

  const head = m[1].toLowerCase().replace(/[.,!?;:]+$/g, "");
  const rest = m[2].trim();

  // A digit, as spoken by someone reading the badge.
  if (/^\d+$/.test(head)) return { n: parseInt(head, 10), rest, corrected: false };

  const asWord = NUMBER_WORDS.indexOf(head as (typeof NUMBER_WORDS)[number]);
  if (asWord >= 0) return { n: asWord, rest, corrected: false };

  const misheard = MISHEARD[head];
  if (misheard !== undefined) return { n: misheard, rest, corrected: true };

  return null;
}

/** The number words, for the recogniser's keyword-boost list. */
export const SPOKEN_NUMBER_WORDS: readonly string[] = NUMBER_WORDS;
