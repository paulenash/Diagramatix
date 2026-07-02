/**
 * Choose which model's output should FILL the current diagram after a multi-model
 * AI comparison — the "best" result, rather than a fixed model.
 *
 * Best = the FEWEST connector-conformance issues (the app's layout-quality oracle,
 * findConnectorConformance) among the models that produced a reasonably COMPLETE
 * diagram. The completeness floor matters: a near-empty 2-box diagram trivially
 * has 0 issues, so without it the sparsest output would always "win". Ties break
 * toward the richer diagram (more elements + connections), then the caller's
 * model-preference order (strongest first).
 *
 * Pure + unit-tested so the selection rule can't silently drift.
 */

export interface ComparisonResult {
  model: string;
  ok: boolean;
  issues?: number;
  elements?: number;
  connections?: number;
  diagramId?: string;
}

/** How complete a result is — total drawn objects. */
const size = (r: ComparisonResult) => (r.elements ?? 0) + (r.connections ?? 0);

/** The fraction of the richest result a diagram must reach to be "complete
 *  enough" to compete on conformance (else a sparse diagram wins on 0 issues). */
export const COMPLETENESS_FLOOR = 0.6;

export function pickBestModel<T extends ComparisonResult>(results: T[], order: string[] = []): T | null {
  const ok = results.filter((r) => r.ok && r.diagramId);
  if (ok.length === 0) return null;
  const richest = Math.max(...ok.map(size));
  const complete = ok.filter((r) => size(r) >= richest * COMPLETENESS_FLOOR);
  const pool = complete.length ? complete : ok;
  const rank = (id: string) => { const i = order.indexOf(id); return i === -1 ? order.length : i; };
  return [...pool].sort((a, b) =>
    (a.issues ?? Infinity) - (b.issues ?? Infinity)   // 1. fewest conformance issues
    || size(b) - size(a)                              // 2. then the richer diagram
    || rank(a.model) - rank(b.model),                 // 3. then model preference
  )[0];
}
