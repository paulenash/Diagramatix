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
 * Pools, lanes and sub-lanes are named with EVERY word capitalised (Paul, 2026-10-01: "Pool, Lanes and
 * Sublanes should always be named with full capitalisation … I mean capitalise each word in the name"):
 * "claims processing" → "Claims Processing", "the finance team" → "The Finance Team".
 *
 * SMALL WORDS stay lower case unless they come first (Paul, 2026-10-01: "Department of Health … small words not
 * capitalised except 'The Defence Department', i.e. small words at the beginning"): "department of health" →
 * "Department of Health", "bank of new south wales" → "Bank of New South Wales", "the defence department" →
 * "The Defence Department". A small word the model capitalised mid-name ("Department Of Health") is brought back
 * to lower case. (An all-caps word such as the "A" in "Plan A" is left alone.)
 *
 * Activities, events and gateways are phrases and keep `capitaliseFirstWord` ("Send invoice to customer").
 * Any OTHER word that already has a capital anywhere in it is a deliberate choice and is left alone — "IT Support"
 * stays "IT Support", "eCommerce" stays "eCommerce". Only the first LETTER of each space-separated word is
 * touched; the rest of the word, digits and punctuation are as they were.
 */
export const SMALL_WORDS: ReadonlySet<string> = new Set([
  "a", "an", "the", "and", "but", "or", "nor", "for", "of", "on", "in", "at", "to", "by", "as", "per", "via", "vs",
]);

export function titleCaseName(name: string): string {
  const trimmed = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  return trimmed
    .split(" ")
    .map((w, i) => {
      // The word without punctuation round it: "(the)" → "the".
      const bare = w.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
      if (i > 0 && bare && SMALL_WORDS.has(bare.toLowerCase()) && bare !== bare.toUpperCase()) return w.toLowerCase();
      if (/[A-Z]/.test(w)) return w;
      const at = w.search(/[a-z]/);
      return at < 0 ? w : w.slice(0, at) + w[at].toUpperCase() + w.slice(at + 1);
    })
    .join(" ");
}

/** The container types whose names take full capitalisation. */
export const FULLY_CAPITALISED_TYPES: ReadonlySet<string> = new Set(["pool", "lane", "sublane"]);
export const isFullyCapitalised = (type: string): boolean => FULLY_CAPITALISED_TYPES.has(type);

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

const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17",
  eighteen: "18", nineteen: "19", twenty: "20",
};
/** The kind words a NUMBERED name is made of: "Pool 3", "Lane 2", "Task 1", "Step 4". */
const NUMBERED_KINDS = "pool|lane|sub-?lane|task|sub-?process|step|phase|stage|gateway|event|option|level|round|version";
const KIND_THEN_NUMBER_WORD = new RegExp(String.raw`\b(${NUMBERED_KINDS})\s+(${Object.keys(NUMBER_WORDS).join("|")})\b`, "gi");

/**
 * A spoken NAME says its number as a word; the diagram writes it as a digit.
 *
 * Paul's test-diagram session, 2026-09-27: "rename selected to pool three" named
 * the pool "Pool three" (his verdict: partly) — the pool beside it is "Pool 3",
 * and new ones are born "Pool N". So a number word straight after a kind word
 * becomes its digit: "pool three" → "pool 3". Only in a NAME — "move the
 * gateway two elements to the right" is a count, and the grammar reads counts
 * as words.
 */
export function digitsAfterKindWord(name: string): string {
  return String(name ?? "").replace(KIND_THEN_NUMBER_WORD, (_m, kind: string, n: string) => `${kind} ${NUMBER_WORDS[n.toLowerCase()]}`);
}

/**
 * How a name is SAID: its line breaks and runs of spaces as one space. Nobody
 * says a line break — "Pass Claim⏎Check?" is spoken "Pass Claim Check?", and a
 * reply that names it must not break the log line (Paul's second test diagram,
 * 2026-09-27, types its gateway and event names on two and three lines).
 */
export function spokenName(label: string | null | undefined): string {
  return (label ?? "").replace(/\s+/g, " ").trim();
}
