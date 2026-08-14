/**
 * Monte-Carlo runner — N replications of one assembled network, each on an
 * independent RNG stream derived from the master seed, aggregated into
 * mean/p5/p50/p95 ranges. The network is assembled ONCE and reused across
 * replications (the engine state is per-run, not the network), so cost scales
 * with replications, not re-assembly.
 *
 * Determinism: replication r always uses deriveSeed(seed, r), so the same
 * (network, config) yields bit-identical aggregated stats every time — the
 * basis for reproducible scenario comparison and the Operator's forks.
 */

import { Engine } from "./engine";
import { makeRng, deriveSeed } from "./rng";
import { aggregate, type AggregatedStats, type RepStats } from "./statistics";
import type { SimNetwork } from "./model";
import type { SimRunConfig, PlannedIntervention } from "./types";

/** Upper bounds on a run's cost. A Monte-Carlo's work scales with the number of
 *  simulated events, for which `horizon × replications` is a sound proxy; each
 *  replication also runs the engine synchronously in the request. These caps
 *  keep an editor (or a malformed import) from wedging a server core with an
 *  absurd stored config. Generous enough that any real study fits under them. */
export const RUN_LIMITS = {
  maxHorizon: 100_000,
  maxReplications: 100,
  /** horizon × replications — the dominant cost term. */
  maxWork: 5_000_000,
} as const;

export interface ClampRunConfigResult {
  cfg: SimRunConfig;
  /** True when any field was reduced — the caller can surface a notice. */
  clamped: boolean;
}

/**
 * Clamp a run configuration to {@link RUN_LIMITS} before it reaches the engine.
 * Applied at the API boundary, where `runConfig` is untrusted stored data.
 *
 * Order matters: bound horizon and replications individually first, then, if
 * their product still exceeds `maxWork`, shrink replications (never horizon —
 * a too-short horizon silently changes the model's meaning, whereas fewer
 * replications only widens the confidence interval). warm-up is kept below the
 * horizon so it can't discard the entire run.
 */
export function clampRunConfig(cfg: SimRunConfig): ClampRunConfigResult {
  let clamped = false;
  const clampNum = (v: unknown, min: number, max: number, fallback: number): number => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
    const c = Math.min(max, Math.max(min, Math.floor(n)));
    if (c !== n) clamped = true;
    return c;
  };

  const horizon = clampNum(cfg.horizon, 1, RUN_LIMITS.maxHorizon, 480);
  let replications = clampNum(cfg.replications, 1, RUN_LIMITS.maxReplications, 1);

  if (horizon * replications > RUN_LIMITS.maxWork) {
    replications = Math.max(1, Math.floor(RUN_LIMITS.maxWork / horizon));
    clamped = true;
  }

  // warm-up can't swallow the whole run; a negative/NaN warm-up becomes 0.
  const rawWarm = typeof cfg.warmUp === "number" && Number.isFinite(cfg.warmUp) ? cfg.warmUp : 0;
  const warmUp = Math.min(Math.max(0, Math.floor(rawWarm)), horizon - 1);
  if (warmUp !== rawWarm) clamped = true;

  return { cfg: { ...cfg, horizon, replications, warmUp }, clamped };
}

export interface MonteCarloResult {
  /** mean/p5/p50/p95 across replications. */
  stats: AggregatedStats;
  /** Per-replication raw stats — kept for drill-down + per-rep comparison. */
  reps: RepStats[];
}

/** Run `cfg.replications` replications of `net` and aggregate. Each replication
 *  is a fresh Engine on a derived seed; warm-up + horizon come from `cfg`.
 *  `planned` timed interventions (if any) are scheduled onto every
 *  replication's calendar, so they apply reproducibly across the run. */
export function runMonteCarlo(
  net: SimNetwork,
  cfg: SimRunConfig,
  planned?: PlannedIntervention[],
  teamCosts?: Record<string, number>,
): MonteCarloResult {
  const n = Math.max(1, Math.floor(cfg.replications));
  const opts = (planned && planned.length) || teamCosts
    ? { ...(planned && planned.length ? { planned } : {}), ...(teamCosts ? { teamCosts } : {}) }
    : undefined;
  const reps: RepStats[] = [];
  for (let r = 0; r < n; r++) {
    const rng = makeRng(deriveSeed(cfg.seed, r));
    reps.push(new Engine(net, cfg, rng, opts).run());
  }
  return { stats: aggregate(reps), reps };
}
