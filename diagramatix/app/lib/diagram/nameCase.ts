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

/**
 * A DECISION gateway's label is a question, so it ends in one.
 *
 * Paul, 2026-09-21: "Names of Decision Gateways (their labels) should always
 * have a '?' appended to them." The product already defaulted a new decision
 * to "Decision?", but any label the user gave it afterwards lost the mark —
 * "In stock" instead of "In stock?" — so the diagram read inconsistently
 * depending on how the gateway got its name.
 *
 * Only decisions. A MERGE gateway is not asking anything, and a merge labelled
 * "Approved?" would be a lie about what the shape does.
 *
 * Left alone when the label already ends in a question mark, when it is empty
 * (an unlabelled gateway is normal and a bare "?" would be worse), and when it
 * ends in other sentence punctuation the user clearly chose.
 */
export function decisionLabel(label: string): string {
  const s = String(label ?? "").trim();
  if (!s) return s;
  if (/[?!.]$/.test(s)) return s;
  return `${s}?`;
}

/**
 * Is this element a decision gateway? The role lives in `properties`, and
 * DEFAULTS to decision — which matches `ROLE_OPTS` in the right-click menu and
 * the reducer's own inference.
 */
export function isDecisionGateway(
  el: { type?: string; properties?: Record<string, unknown> } | undefined,
): boolean {
  if (!el || el.type !== "gateway") return false;
  const role = el.properties?.gatewayRole;
  return role === undefined || role === null || role === "decision";
}
