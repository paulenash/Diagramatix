/**
 * Take ONLY the simulation parameters from a filled diagram and lay them over a
 * fresh copy of that diagram (DATA-37).
 *
 * The Simulator console takes a one-shot snapshot of every diagram in the
 * project when it opens. Pressing Fill computed new simulation parameters from
 * that snapshot and wrote the whole snapshot back to each linked child with
 * `unconditional: true` — bypassing the optimistic-concurrency guard. So any
 * edit anyone had made to a sub-process since the console opened was overwritten
 * wholesale, geometry and all, with no conflict, no merge and no warning.
 *
 * The fill only ever sets `properties.sim` on elements. That is the entire
 * change, so that is the entire thing worth writing back: everything else on the
 * fresh row — positions, labels, connectors, elements added since — is left
 * exactly as it is.
 *
 * An element the fill knows about but the fresh row does not has been deleted by
 * somebody, and is not resurrected. An element the fresh row has and the fill
 * does not is untouched.
 */
import type { DiagramData, DiagramElement } from "../diagram/types";

type WithSim = DiagramElement & { properties?: Record<string, unknown> };

/** The `sim` block an element carries, if any. */
function simOf(el: WithSim | undefined): unknown {
  return el?.properties?.sim;
}

export interface MergeSimResult {
  data: DiagramData;
  /** How many elements actually took a new value. */
  applied: number;
}

/**
 * `fresh` is what is in the database now; `filled` is the computed result.
 * Returns fresh with the filled simulation parameters applied.
 */
export function mergeSimProperties(fresh: DiagramData, filled: DiagramData): MergeSimResult {
  const freshEls = (fresh?.elements ?? []) as WithSim[];
  const filledById = new Map(
    ((filled?.elements ?? []) as WithSim[]).map((e) => [e.id, e] as const),
  );

  let applied = 0;
  const elements = freshEls.map((el) => {
    const sim = simOf(filledById.get(el.id));
    if (sim === undefined) return el;
    // Unchanged values are not worth a new object — this runs over every element
    // of every child diagram in the tree.
    if (JSON.stringify(simOf(el)) === JSON.stringify(sim)) return el;
    applied++;
    return { ...el, properties: { ...(el.properties ?? {}), sim } };
  });

  return { data: { ...fresh, elements } as DiagramData, applied };
}
