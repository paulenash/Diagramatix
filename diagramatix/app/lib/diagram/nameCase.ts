/**
 * Item names start with a capital.
 *
 * Dictation hands back a sentence, not a name: say "rename it to approve order"
 * and the recogniser returns a lower-case "approve order", which then sits on
 * the diagram looking like a typo next to every name that was typed. Paul asked
 * for the first word to be capitalised on every rename (2026-09-17).
 *
 * ONLY THE FIRST WORD. Not title case — "Approve order", not "Approve Order".
 * Process steps are phrases, and forcing every word up produces "Send To
 * Customer For Approval", which reads worse than what the user said and is not
 * what anyone types by hand.
 *
 * AND ONLY WHEN THE FIRST WORD IS PLAINLY LOWER-CASE. A first word that already
 * contains a capital is left exactly as it is, because the capital is almost
 * certainly deliberate: iPhone, eCommerce, mRNA, XML. Blindly upper-casing the
 * first letter turns those into IPhone, ECommerce, MRNA — worse than the
 * problem being fixed. Same for a name starting with a digit or a symbol:
 * "3rd party check" has nothing to capitalise, and reaching past the digit to
 * the next letter would give "3Rd party check".
 */

/**
 * WHICH ELEMENTS THE RULE APPLIES TO (Paul, 2026-09-21): "Activity names,
 * gateway and event labels should always start with a capitalised word."
 *
 * Containers are NOT here. Pools, lanes and sub-lanes have their own naming
 * rules — never the bare kind word, always unique — and those run in the same
 * reducer branch; stacking a third rule on top would make a rename harder to
 * predict than it already is. Annotations, review comments and data objects
 * are free text, not names.
 */
export const CAPITALISED_TYPES: ReadonlySet<string> = new Set([
  // Activities
  "task", "subprocess", "subprocess-expanded", "call-activity", "transaction",
  // Gateways
  "gateway",
  // Events
  "start-event", "intermediate-event", "end-event",
]);

/** True when this element type's label must start with a capital. */
export function needsCapital(type: string): boolean {
  return CAPITALISED_TYPES.has(type);
}

/**
 * Capitalise the first word of an item name, leaving the rest untouched.
 *
 * Safe to apply to anything: a name that is already capitalised, empty, or
 * starts with something that has no case comes back unchanged.
 */
export function capitaliseFirstWord(name: string): string {
  const s = String(name ?? "");
  const trimmed = s.trim();
  if (!trimmed) return trimmed;

  const first = trimmed[0];
  // Nothing to do unless the very first character is a lower-case letter.
  if (first !== first.toLowerCase() || first === first.toUpperCase()) return trimmed;

  // A deliberate capital anywhere in the first word means hands off.
  const firstWord = trimmed.split(/\s+/)[0];
  if (/[A-Z]/.test(firstWord)) return trimmed;

  return first.toUpperCase() + trimmed.slice(1);
}

/** True when this name would be changed — for a log line that says so. */
export function wouldCapitalise(name: string): boolean {
  const trimmed = String(name ?? "").trim();
  return trimmed !== "" && capitaliseFirstWord(trimmed) !== trimmed;
}
