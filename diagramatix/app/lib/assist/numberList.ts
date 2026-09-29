/**
 * A spoken LIST of numbers — the answer to "which ones to delete?":
 * "three, seven, eight and nine", "3 7 8 9", "one through four", "all".
 *
 * Reads with `leadingSpokenNumber` one number at a time, so it inherits the same
 * forgiveness the single pick has ("won" for one, "twenty two" as 22) and the
 * same care: anything that is not a number, a joiner, or a word that means
 * "these numbers" makes the whole utterance NOT a list — a name, or a new
 * command — rather than a partial guess.
 *
 * Pure. Paul, 2026-09-29.
 */
import { leadingSpokenNumber } from "./spokenNumber";

export type NumberList =
  | { kind: "numbers"; numbers: number[] }
  | { kind: "all" }
  | { kind: "out-of-range"; numbers: number[] };

const JOINERS = /^(?:,|and|then|plus|also|&|\.|;)\s*/i;
const LEAD = /^(?:(?:delete|remove|erase|drop|get rid of)\s+)?(?:(?:the\s+)?(?:numbers?|items?)\s+)?/i;
const ALL = /^(?:all|all of them|all of these|every one|everything|the lot|them all)$/i;

/** Read a list of numbers off an utterance; null when it is not one. `max` is how many are numbered on screen. */
export function parseNumberList(utterance: string, max: number): NumberList | null {
  let rest = String(utterance ?? "").trim().replace(/[.!?]+$/, "");
  if (!rest) return null;
  rest = rest.replace(LEAD, "").trim();
  if (ALL.test(rest)) return { kind: "all" };

  const numbers: number[] = [];
  let guard = 0;
  while (rest && guard++ < 60) {
    rest = rest.replace(/^[\s]+/, "");
    const j = rest.match(JOINERS);
    if (j) { rest = rest.slice(j[0].length); continue; }
    // "three through five" / "3-5"
    const got = leadingSpokenNumber(rest);
    if (!got) return null;
    // leadingSpokenNumber also strips a leading "the"/"number"; it returns what followed.
    let n = got.n;
    rest = got.rest;
    const range = rest.match(/^(?:through|thru|-)\s*/i);
    if (range) {
      const upto = leadingSpokenNumber(rest.slice(range[0].length));
      if (!upto || upto.n < n || upto.n - n > 60) return null;
      for (let k = n; k <= upto.n; k++) numbers.push(k);
      rest = upto.rest;
      continue;
    }
    numbers.push(n);
  }
  if (rest || numbers.length === 0) return null;
  const unique = [...new Set(numbers)];
  const bad = unique.filter((n) => n < 1 || n > max);
  return bad.length ? { kind: "out-of-range", numbers: bad } : { kind: "numbers", numbers: unique };
}
