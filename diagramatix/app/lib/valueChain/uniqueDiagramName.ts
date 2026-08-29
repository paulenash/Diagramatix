/**
 * Naming a regenerated diagram that lands in a project already holding one.
 *
 * Paul, 2026-08-29: regenerating a single diagram into an EXISTING project is
 * how you compare a layout fix against what it replaced — so the existing
 * diagram must survive. A clash therefore appends " (2)", " (3)", … rather than
 * overwriting or refusing.
 *
 * The taken-set is mutated as names are handed out, so two diagrams of the same
 * name inside ONE run still come out as "X" and "X (2)" — the run is a stream of
 * separate creates, and re-reading the project between each would race with
 * itself.
 */

/** The next free name for `base`, marking it taken. Mutates `taken`. */
export function uniqueDiagramName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) { taken.add(base); return base; }
  // Deliberately counts from the BASE name, not from the highest existing
  // suffix: "X", "X (2)", "X (4)" should fill the gap at (3) rather than
  // climbing forever.
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`;
    if (!taken.has(candidate)) { taken.add(candidate); return candidate; }
  }
}
