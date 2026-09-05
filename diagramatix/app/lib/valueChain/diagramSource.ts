/**
 * Which repository process a generated diagram came from.
 *
 * A diagram generated from the Process Repository is named after its prompt —
 * "V22.06 Investigate Where Warranted" — and the batch runner also appends
 * " (2)" when a name is already taken. That leading code is the only link back
 * to the library for every diagram generated before the source stamp existed,
 * which is most of them.
 *
 * Deliberately strict: it must match at the START and look exactly like a
 * repository code, so a user's own diagram called "V2 draft" is not silently
 * matched against a value chain it has nothing to do with. A wrong match here
 * would put a "your prompt has moved on" warning on an unrelated diagram, which
 * is worse than saying nothing.
 */
const CODE = /^(V\d{2}\.\d{2})(?:\s|$)/;

export function processCodeForDiagram(name: string | null | undefined): string {
  if (!name) return "";
  return CODE.exec(name.trim())?.[1] ?? "";
}
