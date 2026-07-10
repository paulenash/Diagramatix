/**
 * Turn an activity name into a lifecycle STATE name — the leading verb as a past
 * participle (Ship → Shipped, Cancel → Cancelled, Pay → Paid, Initialise →
 * Initialised), the rest of the phrase kept. Used as the DEFAULT state when a log
 * has no explicit state/status column, so inferred states read as conditions
 * ("Shipped") rather than commands ("Ship"). The user can still override any
 * state — e.g. a gerund for a transitional state ("Closing") — in the
 * Activity→State table. Pure; small heuristic + a common-irregular table.
 */
const IRREGULAR: Record<string, string> = {
  send: "sent", pay: "paid", make: "made", begin: "begun", do: "done", buy: "bought",
  build: "built", hold: "held", take: "taken", give: "given", get: "got", put: "put",
  cut: "cut", set: "set", run: "run", read: "read", leave: "left", lose: "lost",
  find: "found", keep: "kept", meet: "met", sell: "sold", tell: "told", think: "thought",
  catch: "caught", teach: "taught", choose: "chosen", write: "written", draw: "drawn",
  know: "known", grow: "grown", show: "shown", bring: "brought", spend: "spent",
  split: "split", freeze: "frozen", pick: "picked", withdraw: "withdrawn",
};
const VOWEL = "aeiou";

/** The past participle of a single verb. Leaves already-inflected words alone. */
export function pastParticiple(word: string): string {
  const w = (word ?? "").trim();
  if (!w) return w;
  // Already past/gerund (Shipped, Closing) → leave as-is. (Not "-en": it's
  // ambiguous — base verbs like "Open"/"Listen" also end in it.)
  if (w.length > 3 && /(?:ed|ing)$/i.test(w)) return w;
  const lower = w.toLowerCase();
  if (IRREGULAR[lower]) { const pp = IRREGULAR[lower]; return /^[A-Z]/.test(w) ? pp.charAt(0).toUpperCase() + pp.slice(1) : pp; }
  if (/e$/i.test(w)) return w + "d";                                  // approve → approved, close → closed
  if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + "ied";           // verify → verified
  const last = lower[lower.length - 1], mid = lower[lower.length - 2], pre = lower[lower.length - 3];
  const isCVC = !!pre && !VOWEL.includes(pre) && VOWEL.includes(mid) && !VOWEL.includes(last) && !"wxy".includes(last);
  // Double the final consonant for a stressed CVC: a one-syllable verb
  // (ship → shipped), a trailing "l" (British: cancel → cancelled), or a common
  // stressed-final-syllable verb (submit → submitted, refer → referred). A
  // multi-syllable verb stressed earlier does NOT double (open → opened).
  const syllables = (lower.match(/[aeiouy]+/g) ?? []).length;
  const dbl = isCVC && (syllables <= 1 || last === "l" || /(?:mit|fer|cur|gin|pel|rol)$/i.test(lower));
  return dbl ? w + last + "ed" : w + "ed";                            // open → opened, deliver → delivered
}

/** An activity → a Capitalised state: past-participle the leading verb, keep the
 *  rest ("Ship Order" → "Shipped Order", "pay invoice" → "Paid invoice"). */
export function activityToState(activity: string): string {
  const a = (activity ?? "").trim();
  if (!a) return a;
  const parts = a.split(/\s+/);
  parts[0] = pastParticiple(parts[0]);
  const s = parts.join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
