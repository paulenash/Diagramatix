/**
 * V2 — resolve a mis-heard name by how it SOUNDS, so "escalade" finds
 * "Escalate" without an AI call.
 *
 * MEASURED FIRST, and the measurement changed the design. Against a realistic
 * diagram, the existing passes already handle most multi-word mis-hears —
 * "pic items", "bag order", "quality cheque", "kwality check" all resolve today
 * on token overlap, because one word of two is usually heard correctly. What
 * they cannot do is a reference with nothing to overlap:
 *
 *   "escalade"    → Escalate     one word, one sound wrong
 *   "where house" → Warehouse    the recogniser split a word in two
 *
 * So this pass is deliberately narrow. It runs LAST, only when everything else
 * has failed, and it compares two things:
 *
 *   • a phonetic key, which collapses the spellings English uses for the same
 *     sound (ph/f, ck/k, c/k, x/ks) and drops the vowels that the recogniser
 *     is least reliable about;
 *   • the key with spaces removed, so a word heard as two — or two heard as
 *     one — still lines up.
 *
 * A single edit is allowed between keys, which is what carries escalade →
 * escalate (…LD vs …LT). That tolerance is the risky part, so it applies only
 * to keys long enough for one letter not to be most of the word: short names
 * must match exactly, or "Add" would answer to "Odd".
 *
 * When several labels sound alike the result is AMBIGUOUS, not a guess — which
 * now raises R2's picker and asks. That is the right outcome: sounding similar
 * is exactly the situation where the user should choose.
 *
 * Pure.
 */

/** Below this, one edit is too much of the word — require an exact key match. */
export const MIN_KEY_FOR_FUZZ = 4;

/**
 * A compact phonetic key. Not Double Metaphone — a smaller set of rules aimed
 * at the confusions a speech recogniser actually makes on proper nouns, which
 * is worth far more here than linguistic completeness.
 */
export function phoneticKey(input: string): string {
  let s = input.toLowerCase().replace(/[^a-z\s]/g, "");
  if (!s.trim()) return "";
  // Digraphs first, before any single-letter rule can break them up.
  s = s
    .replace(/ph/g, "f")
    .replace(/gh/g, "f")
    .replace(/ck/g, "k")
    .replace(/sch/g, "sk")
    // Digits, not letters, so the single-letter rules below cannot touch them:
    // mapping "ch" to "x" and then "x" to "ks" would turn church into kirks.
    .replace(/ch/g, "1")      // one symbol for the "ch" sound
    .replace(/sh/g, "1")
    .replace(/th/g, "0")
    .replace(/qu/g, "kw")
    .replace(/wh/g, "w")      // "where" ≈ "ware" — the h is not heard
    .replace(/wr/g, "r")
    .replace(/kn/g, "n")
    .replace(/mb\b/g, "m");
  s = s
    .replace(/c(?=[eiy])/g, "s")
    .replace(/c/g, "k")
    .replace(/q/g, "k")
    .replace(/x/g, "ks")
    .replace(/z/g, "s")
    .replace(/v/g, "f")
    .replace(/j/g, "g")
    .replace(/y/g, "i");
  // Keep a leading vowel — it is the most reliably heard part of a word — and
  // drop the rest, which is where the recogniser wanders most.
  const words = s.split(/\s+/).filter(Boolean).map((w) => {
    const head = /^[aeiou]/.test(w) ? w[0] : "";
    return head + w.slice(head.length).replace(/[aeiou]/g, "");
  });
  // Collapse doubled letters within each word.
  return words.map((w) => w.replace(/(.)\1+/g, "$1")).join(" ");
}

/** Levenshtein, small strings only. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Do these two names plausibly sound the same?
 *
 * Compared with spaces AND without, so a word the recogniser split ("where
 * house") still matches the one it was ("Warehouse").
 */
export function soundsLike(spoken: string, label: string): boolean {
  const a = phoneticKey(spoken);
  const b = phoneticKey(label);
  if (!a || !b) return false;
  if (a === b) return true;

  const aj = a.replace(/\s+/g, "");
  const bj = b.replace(/\s+/g, "");
  if (aj === bj) return true;                       // split or joined differently

  // One edit, but only where one letter is not most of the word.
  if (Math.min(aj.length, bj.length) < MIN_KEY_FOR_FUZZ) return false;
  if (Math.abs(aj.length - bj.length) > 1) return false;
  return editDistance(aj, bj) <= 1;
}

/**
 * Every label that sounds like `spoken`. The caller decides what to do with
 * more than one — which, for a reference, means asking rather than guessing.
 */
export function phoneticMatches<T>(
  spoken: string,
  items: readonly T[],
  labelOf: (item: T) => string | undefined,
): T[] {
  return items.filter((it) => {
    const l = labelOf(it);
    return !!l && soundsLike(spoken, l);
  });
}
