/**
 * Shared hierarchical-code helpers for the Link-Scan (BPMN process codes) and the
 * Project re-numbering system.
 *
 * The BPMN-code helpers (`CODE_RE`, `extractCode`, `stripCodeTail`, `normalize`)
 * were lifted verbatim from `app/api/projects/[id]/scan-links/route.ts` so both
 * features share one definition — scan-links now imports them from here.
 *
 * The re-numbering helpers (`RENUMBER_CODE_RE`, `stripLeadingCode`, `widthFor`,
 * `pad`, `dottedCompare`) generate/parse codes of the form `{PREFIX}{n}.{m}.{k}…`
 * (0–3 uppercase letters attached to the first number, then dot-separated 1–2
 * digit level groups), e.g. `ABC2.3.1.4`.
 */

export function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Leading BPMN "process code": AAAnnn.nn[.nn…] — 1–3 letters, then dotted groups
 *  (at least one). Uppercased. Used by scan-links matching. */
export const CODE_RE = /^([A-Za-z]{1,3}\d{1,3}(?:\.\d{1,3})+)\b/;
export function extractCode(name: string): string | null {
  const m = name.trim().match(CODE_RE);
  return m ? m[1].toUpperCase() : null;
}

/** Drop a leading BPMN code + separator, return the LOWERCASED remainder (for
 *  matching). "P03.1.1: Change Structure" → "change structure". */
export function stripCodeTail(name: string): string {
  const trimmed = name.trim();
  const m = trimmed.match(CODE_RE);
  const tail = (m ? trimmed.slice(m[0].length) : trimmed).replace(/^[\s\-:_.]+/, "");
  return normalize(tail);
}

// ── Re-numbering helpers ─────────────────────────────────────────────

/** A re-numbering code as a leading token: 0–3 uppercase letters + digits with a
 *  dot chain (`ABC2.3`), OR bare dotted digits (`1.1.1`) — but NOT a bare number
 *  (so a name like "12 Monkeys" is never mistaken for a code). Followed by a
 *  separator or end. */
export const RENUMBER_CODE_RE = /^([A-Z]{1,3}\d{1,2}(?:\.\d{1,2})*|\d{1,2}(?:\.\d{1,2})+)(?=[\s:._\-]|$)/;

/** Recover the base descriptive text from a coded name/label, PRESERVING case.
 *  Prefers a known code (what the previous run stored) — strips it if the text
 *  starts with it — then falls back to the structured regex. Also handles a
 *  first-line code separated by a newline ("CODE\nName" → "Name"). Idempotent. */
export function stripLeadingCode(text: string, knownCode?: string | null): string {
  let s = text ?? "";
  if (knownCode && (s === knownCode || s.startsWith(knownCode))) {
    const rest = s.slice(knownCode.length);
    // Only treat as a code prefix if a separator (or end) follows.
    if (rest === "" || /^[\s:._\-]/.test(rest)) s = rest;
  } else {
    const m = s.match(RENUMBER_CODE_RE);
    if (m) s = s.slice(m[0].length);
  }
  return s.replace(/^[\s:._\-]+/, "").trim();
}

/** Digit width for a level from its sibling count: ≤9 → 1, ≥10 → 2 (clamped). */
export function widthFor(count: number): number {
  return count >= 10 ? 2 : 1;
}

/** Zero-padded 1-based index at a given width. */
export function pad(index1: number, width: number): string {
  return String(index1).padStart(width, "0");
}

/** Compare two dotted-numeric codes (e.g. "1.1.10" vs "1.1.2") numerically per
 *  segment, so sort order is natural rather than lexical. */
export function dottedCompare(a: string, b: string): number {
  const pa = a.split("."), pb = b.split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = parseInt(pa[i] ?? "0", 10) || 0;
    const nb = parseInt(pb[i] ?? "0", 10) || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}
