/**
 * Feature dependencies: a feature that `requires` others is only as available
 * as the weakest of them. "Mobile Access" needs Process Review and Voice
 * Assist, so a level that has Mobile Available but Voice Assist Not Available
 * has no Mobile in effect.
 *
 * Effective state = the weaker of the feature's own state and every
 * prerequisite's (order: available > disabled > hidden). Applied ONCE, after the
 * level matrix and the per-user overrides are merged (availability.ts), so the
 * server gate, /api/features, the public matrix and the SuperAdmin preview all
 * agree. Pure.
 */
import { FEATURE_DEF } from "./registry";

export type DepState = "available" | "disabled" | "hidden";

const RANK: Record<DepState, number> = { hidden: 0, disabled: 1, available: 2 };
const weaker = (a: DepState, b: DepState): DepState => (RANK[a] <= RANK[b] ? a : b);

type Requires = Record<string, { requires?: readonly string[] }>;

/**
 * The state map with every dependency applied. A key missing from the map is
 * left alone (an unknown feature stays unknown); a prerequisite missing from
 * the map counts as `hidden`, so a typo in `requires` blocks rather than
 * silently opens.
 */
export function applyDependencies<M extends Record<string, DepState>>(map: M, defs: Requires = FEATURE_DEF): M {
  const out: Record<string, DepState> = { ...map };
  const memo = new Map<string, DepState>();
  const visiting = new Set<string>();

  const effective = (key: string): DepState => {
    const cached = memo.get(key);
    if (cached) return cached;
    let state: DepState = map[key] ?? "hidden";
    if (!visiting.has(key)) {           // a cycle is a registry bug (tested); never loop on it
      visiting.add(key);
      for (const need of defs[key]?.requires ?? []) state = weaker(state, effective(need));
      visiting.delete(key);
    }
    memo.set(key, state);
    return state;
  };

  for (const key of Object.keys(map)) out[key] = effective(key);
  return out as M;
}

/**
 * The first prerequisite of `key` that is not itself Available — the ROOT cause when it is a chain
 * (deepest first) — or null when every prerequisite is Available. For "needs Voice Assist" messages.
 * Works on a resolved map (dependencies already applied) as well as a raw one.
 */
export function blockedBy(map: Record<string, DepState>, key: string, defs: Requires = FEATURE_DEF): string | null {
  const visit = (k: string, seen: Set<string>): string | null => {
    for (const need of defs[k]?.requires ?? []) {
      if (seen.has(need)) continue;
      seen.add(need);
      const deeper = visit(need, seen);
      if (deeper) return deeper;
      if ((map[need] ?? "hidden") !== "available") return need;
    }
    return null;
  };
  return visit(key, new Set([key]));
}

/** Registry check: every `requires` names a real feature, and there is no cycle. Returns problems (empty = fine). */
export function dependencyProblems(defs: Requires): string[] {
  const problems: string[] = [];
  for (const [key, d] of Object.entries(defs)) {
    for (const need of d.requires ?? []) if (!defs[need]) problems.push(`${key} requires unknown feature "${need}"`);
  }
  const state = new Map<string, 1 | 2>();
  const walk = (k: string, path: string[]) => {
    if (state.get(k) === 2) return;
    if (state.get(k) === 1) { problems.push(`dependency cycle: ${[...path, k].join(" → ")}`); return; }
    state.set(k, 1);
    for (const need of defs[k]?.requires ?? []) if (defs[need]) walk(need, [...path, k]);
    state.set(k, 2);
  };
  for (const k of Object.keys(defs)) walk(k, []);
  return problems;
}
