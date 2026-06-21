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
