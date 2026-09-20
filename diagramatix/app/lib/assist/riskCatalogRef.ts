/**
 * M4 — find a Risk or Control in the project's catalogue from what was said.
 *
 * Catalogue codes are the worst possible thing to dictate. "R-012" is heard as
 * "r012", "R 012", "are 012", "R twelve", "R O 12" — a letter, a separator the
 * recogniser guesses at, and a number whose leading zeros nobody says aloud.
 * Matching the raw string would fail on almost every attempt, so the code is
 * normalised on BOTH sides before comparing, and the numeric part is compared
 * as a number so "R-012", "R12" and "R 012" are one thing.
 *
 * Names are matched too, because "attach the duplicate payment risk to these"
 * is what a person actually says — but only exactly or as a whole-word
 * substring. Fuzzy matching is deliberately absent here: attaching the WRONG
 * control to a step is a governance error that survives into an audit, and it
 * is far better to be told the name was not found than to be given a plausible
 * neighbour. Several matches are reported rather than resolved, for the same
 * reason.
 *
 * Pure.
 */

export interface CatalogItemLike {
  id: string;
  code: string;
  name: string;
  kind: string;
}

/** "R-012" / "r 012" / "are012" → "R12". Null when it is not code-shaped. */
export function normaliseCode(spoken: string): string | null {
  const s = spoken.toLowerCase().replace(/[^a-z0-9]/g, "");
  // "are" and "see" are how the recogniser renders a spoken letter R and C.
  const expanded = s.replace(/^are(?=\d)/, "r").replace(/^see(?=\d)/, "c");
  const m = expanded.match(/^([a-z]{1,3})0*(\d{1,6})$/);
  if (!m) return null;
  return `${m[1].toUpperCase()}${Number(m[2])}`;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * The single catalogue item `spoken` names, or null.
 *
 * Null covers "not found" and "found several" alike — both mean the caller
 * must not act, and the caller says which in its own words.
 */
export function findRiskCatalogItem<T extends CatalogItemLike>(
  catalog: readonly T[],
  spoken: string,
): T | null {
  const said = norm(spoken);
  if (!said || !catalog.length) return null;

  // 1. The code, normalised on both sides.
  const wanted = normaliseCode(said);
  if (wanted) {
    const byCode = catalog.filter((c) => normaliseCode(c.code) === wanted);
    if (byCode.length === 1) return byCode[0];
    if (byCode.length > 1) return null;      // an ambiguous code is a data problem
  }

  // 2. The exact name.
  const exact = catalog.filter((c) => norm(c.name) === said);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  // 3. A whole-phrase substring either way ("duplicate payment" ↔ "Duplicate
  //    payment risk"). Still not fuzzy — every character said must appear.
  const contains = catalog.filter((c) => {
    const n = norm(c.name);
    return n.includes(said) || said.includes(n);
  });
  return contains.length === 1 ? contains[0] : null;
}
