/**
 * Reversible pre-egress redaction (ENT-06). Pseudonymise identifiable literals
 * (people / team / system / diagram names) into opaque placeholders BEFORE a
 * prompt leaves the tenant for Anthropic, and restore them in the model's reply.
 * The mapping lives only for the duration of one request and never crosses the
 * wire — the AI vendor sees `Entity_1`, `Entity_2`, … not real names.
 *
 * Vocabulary-driven, not NER: the caller passes the exact sensitive strings it
 * already holds (element labels, resource/team names, run/reference names), so
 * the swap is an exact, boundary-aware literal replacement — reliable, no model
 * guesswork. Free-text with unknown names (raw prompts, transcripts) is out of
 * scope here; see enterprise/09.
 *
 * Enterprise readiness — see diagramatix/enterprise/ (ENT-06). Pure.
 */

export interface Redactor {
  /** Replace every known sensitive literal with its placeholder. */
  redact(text: string): string;
  /** Invert: turn placeholders back into the original literals. */
  restore(text: string): string;
  /** How many distinct literals are mapped (0 = a no-op passthrough). */
  readonly size: number;
}

/** A redactor that changes nothing — returned when there is nothing to redact. */
export const IDENTITY_REDACTOR: Redactor = {
  redact: (s) => s,
  restore: (s) => s,
  size: 0,
};

/** Escape a literal for safe use inside a RegExp source. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace `needle` with `replacement` only where it is NOT flanked by an
 * alphanumeric — so "IT" never matches inside "WAIT"/"ITEM", and token
 * "Entity_1" never matches inside "Entity_10". Uses a replacer function
 * (not a string) so `$` in the replacement stays literal, and checks the
 * preceding char manually to avoid needing a lookbehind.
 */
function replaceBoundaried(text: string, needle: string, replacement: string): string {
  const re = new RegExp(`${escapeRe(needle)}(?![A-Za-z0-9])`, "g");
  return text.replace(re, (m, offset: number, full: string) => {
    const prev = offset > 0 ? full[offset - 1] : "";
    return /[A-Za-z0-9]/.test(prev) ? m : replacement;
  });
}

/** Clean the caller's candidate list: trim, drop empties / very short / pure
 *  numeric, and dedupe (case-sensitive — the prompt carries the literals
 *  verbatim). Order-preserving on first sight so placeholder numbers are stable. */
function cleanEntities(raw: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const s = (r ?? "").trim();
    if (s.length < 2) continue;          // single chars are too collision-prone
    if (/^\d+$/.test(s)) continue;       // bare numbers aren't identifying
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Build a reversible redactor from a list of sensitive literal strings.
 * Returns IDENTITY_REDACTOR when the list is effectively empty.
 */
export function makeRedactor(entities: (string | null | undefined)[]): Redactor {
  const clean = cleanEntities(entities);
  if (clean.length === 0) return IDENTITY_REDACTOR;

  // original -> token, in first-seen order (Entity_1, Entity_2, …).
  const pairs = clean.map((original, i) => ({ original, token: `Entity_${i + 1}` }));
  // Longest original first so "Accounts Payable Clerk" is replaced before the
  // shorter "Accounts Payable" that it contains.
  const byLenDesc = [...pairs].sort((a, b) => b.original.length - a.original.length);

  return {
    size: clean.length,
    redact(text) {
      let out = text;
      for (const { original, token } of byLenDesc) out = replaceBoundaried(out, original, token);
      return out;
    },
    restore(text) {
      // Boundary-aware so "Entity_1" is not matched inside "Entity_10", and a
      // model-added possessive ("Entity_1's") restores to "<name>'s".
      let out = text;
      for (const { original, token } of pairs) out = replaceBoundaried(out, token, original);
      return out;
    },
  };
}
