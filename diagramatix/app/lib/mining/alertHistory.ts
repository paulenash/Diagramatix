/**
 * A run series, expressed as the points the alert rules read.
 *
 * This existed inside `app/api/mining/poll/route.ts` and nowhere else, which
 * was fine while the cron was the only thing that ever asked what the watcher
 * would say. Phase 11 gives the question a screen — "tell me now, rather than
 * when the schedule next runs" — and two independent assemblies of the same
 * history is exactly the shape that produces a panel and an email quietly
 * disagreeing about whether anything is wrong.
 *
 * Pure: the caller does the fetching, this does the arithmetic. In particular
 * `kpiConfig` is taken PER RUN rather than as one current SLA applied backwards
 * over history that predates it — a target set last week does not make last
 * year's cases retrospectively late.
 */
import { fitnessHistory, type ComparableRun } from "./compareRuns";
import { computeOutcomes, type KpiConfig } from "./outcomes";
import type { AlertPoint } from "./alerts";

/** A series member, with the SLA that run was judged under. */
export type HistoryRow = ComparableRun & { kpiConfig: KpiConfig | null };

/**
 * Oldest first, which is the order the alert rules want.
 *
 * A run with no analytics contributes a point with a null late rate rather than
 * being dropped: an observation that cannot be scored is still an observation,
 * and removing it would silently shorten the history that decides whether
 * anything is watched at all.
 */
export function alertPointsFrom(rows: HistoryRow[]): AlertPoint[] {
  const lateBy = new Map<string, number | null>();
  const violationsBy = new Map<string, string[]>();
  for (const r of rows) {
    const outcome = r.analytics ? computeOutcomes(r.analytics, r.variants, r.kpiConfig) : null;
    lateBy.set(r.id, outcome && outcome.total > 0 ? outcome.late / outcome.total : null);
    // Only deviations with at least one case: a rule that matched nothing is
    // not something that "appeared" when it shows up in the next run's list.
    violationsBy.set(r.id, (r.conformance?.violations ?? []).filter((v) => v.cases > 0).map((v) => v.message));
  }
  return fitnessHistory(rows).map((p) => ({
    runId: p.runId,
    name: p.name,
    at: p.at,
    fitness: p.fitness,
    lateRate: lateBy.get(p.runId) ?? null,
    violations: violationsBy.get(p.runId) ?? [],
  }));
}
