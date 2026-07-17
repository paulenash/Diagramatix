/**
 * UML association-end constraints. An end carries any of four standard boolean
 * constraints — {ordered}, {unique}, {readOnly}, {union} — plus a free-form
 * "other" field for things like "subsets ownedElement, subsets directedRelationship".
 * They render as a single comma-separated list in one { } bracket near the end,
 * e.g. "{readOnly, union, subsets member, subsets ownedElement}".
 */

export interface EndConstraint {
  ordered?: boolean;
  unique?: boolean;
  readOnly?: boolean;
  union?: boolean;
  other?: string;
}

/**
 * Split an association-end role string into its parts. Image ingestion / AI
 * import often deliver the whole "+ /ownedElement" as one token — pull the
 * leading visibility (+ - # ~) and the derived "/" marker out so they land in
 * the right connector fields.
 */
export function parseEndRole(raw: string | null | undefined): { role?: string; visibility?: string; derived?: boolean } {
  if (!raw) return {};
  let s = raw.trim();
  const out: { role?: string; visibility?: string; derived?: boolean } = {};
  const vis = s.match(/^([+\-#~])\s*/);
  if (vis) { out.visibility = vis[1]; s = s.slice(vis[0].length); }
  if (s.startsWith("/")) { out.derived = true; s = s.slice(1).trim(); }
  if (s) out.role = s;
  return out;
}

/** The four canonical booleans, in the order they should be displayed. */
const CANONICAL: Array<{ key: keyof EndConstraint; label: string }> = [
  { key: "ordered", label: "ordered" },
  { key: "unique", label: "unique" },
  { key: "readOnly", label: "readOnly" },
  { key: "union", label: "union" },
];

/**
 * Build the displayed constraint string: the checked canonical constraints (in
 * canonical order) followed by the comma-split "other" tokens, all inside a
 * single { }. Returns null when nothing is set (so callers can skip rendering).
 */
export function buildConstraintText(c: EndConstraint | null | undefined): string | null {
  if (!c) return null;
  const parts: string[] = [];
  for (const { key, label } of CANONICAL) if (c[key]) parts.push(label);
  const other = (c.other ?? "").trim();
  if (other) {
    for (const tok of other.split(",").map(s => s.trim()).filter(Boolean)) parts.push(tok);
  }
  if (!parts.length) return null;
  return `{${parts.join(", ")}}`;
}

/**
 * Parse a constraint string (from image ingestion / AI import) back into the
 * structured flags + other text. Tolerates a missing outer { }, extra spaces,
 * and case-insensitive canonical names. Unknown tokens collect into `other`.
 */
export function parseConstraintText(raw: string | null | undefined): EndConstraint {
  const c: EndConstraint = {};
  if (!raw) return c;
  const inner = raw.trim().replace(/^\{/, "").replace(/\}$/, "");
  const others: string[] = [];
  for (const tok of inner.split(",").map(s => s.trim()).filter(Boolean)) {
    switch (tok.toLowerCase()) {
      case "ordered":  c.ordered = true; break;
      case "unique":   c.unique = true; break;
      case "readonly": c.readOnly = true; break;
      case "union":    c.union = true; break;
      default:         others.push(tok);
    }
  }
  if (others.length) c.other = others.join(", ");
  return c;
}
