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

const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

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

  // A number above twenty: "twenty two", "twenty-seven", "ninety nine" — the
  // template window has dozens of cards, and "twenty two" used to be read as
  // 20 with "two" left over (Paul, 2026-09-29: "I say 22 or 27, I get template 20").
  const hy = head.split("-");
  const tens = TENS[hy[0]];
  if (tens !== undefined) {
    if (hy.length === 2) {
      const u = NUMBER_WORDS.indexOf(hy[1] as (typeof NUMBER_WORDS)[number]);
      if (u >= 1 && u <= 9) return { n: tens + u, rest, corrected: false };
    } else if (hy.length === 1) {
      const nx = rest.match(/^(\S+)\s*([\s\S]*)$/);
      const u = nx ? NUMBER_WORDS.indexOf(nx[1].toLowerCase().replace(/[.,!?;:]+$/g, "") as (typeof NUMBER_WORDS)[number]) : -1;
      if (nx && u >= 1 && u <= 9) return { n: tens + u, rest: nx[2].trim(), corrected: false };
      if (tens >= 30) return { n: tens, rest, corrected: false };
    }
  }

  const asWord = NUMBER_WORDS.indexOf(head as (typeof NUMBER_WORDS)[number]);
  if (asWord >= 0) return { n: asWord, rest, corrected: false };

  const misheard = MISHEARD[head];
  if (misheard !== undefined) return { n: misheard, rest, corrected: true };

  return null;
}

/** The number words, for the recogniser's keyword-boost list. */
export const SPOKEN_NUMBER_WORDS: readonly string[] = NUMBER_WORDS;

/**
 * The recogniser hears a spoken "one" as "the" (Paul, 2026-10-01: "one consistently heard as the"),
 * and "the" is also a filler `leadingSpokenNumber` strips ("the 3") — so a lone "the" arrived as no
 * number at all. Where a number is DUE and nothing else can start the answer, a leading "the" that is
 * not followed by a number can only have been "one":
 *
 *   "the"                    → "one"
 *   "the Approve Order"      → "one Approve Order"
 *   "the 3" / "the lane up"  → unchanged (a number, or a mis-heard number, follows — so "the" is filler)
 *
 * NOT part of `leadingSpokenNumber` itself: the "which one did you mean?" pick uses that too, and
 * there "the Finance one" is a real answer by name. Call this only where an answer must start with a
 * number — "move dividers" and the rename-by-number pick.
 */
export function restoreLostOneNumber(text: string): string {
  const t = String(text ?? "").trim();
  const m = t.match(/^the\b[\s,.]*([\s\S]*)$/i);
  if (!m) return t;
  const rest = m[1].trim();
  if (!rest) return "one";
  const next = rest.split(/\s+/)[0].toLowerCase().replace(/[.,!?;:]+$/g, "");
  const numberLike = /^\d+$/.test(next) || NUMBER_WORDS.includes(next as (typeof NUMBER_WORDS)[number]) || TENS[next] !== undefined || MISHEARD[next] !== undefined;
  return numberLike ? t : `one ${rest}`;
}
