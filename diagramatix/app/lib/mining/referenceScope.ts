/**
 * Which state machines are sensible conformance references for a given run.
 * A reference must describe the SAME entity's lifecycle — so its states should
 * overlap the run's observed states. This keeps the reference picker scoped: for
 * an OCEL study, an "Order" run doesn't offer the "Item" or "Invoice" state
 * machines (whose states don't overlap), and a run never offers its OWN
 * discovered mirror (you can't be your own reference). Pure. Case-insensitive.
 */

/** Distinct observed state labels of a run (from its variants). */
export function runStates(variants: { states: string[] }[]): string[] {
  const set = new Set<string>();
  for (const v of variants) for (const s of v.states) { const t = (s ?? "").replace(/\s+/g, " ").trim(); if (t) set.add(t); }
  return [...set];
}

/** True when ≥ half of the run's distinct states appear in the state machine —
 *  enough overlap to be that entity's reference; a different entity's SM (little
 *  or no overlap) is excluded. With no run states to judge by, allow it. */
export function isRelevantReference(smStateLabels: string[], states: string[]): boolean {
  const norm = (s: string) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const runSet = new Set(states.map(norm).filter(Boolean));
  if (runSet.size === 0) return true;
  const smSet = new Set(smStateLabels.map(norm).filter(Boolean));
  let hit = 0;
  for (const s of runSet) if (smSet.has(s)) hit++;
  return hit / runSet.size >= 0.5;
}
