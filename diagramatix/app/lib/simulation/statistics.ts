/**
 * Statistics types for one replication + aggregation across replications.
 * Monte-Carlo reports mean/p5/p50/p95 of the per-replication statistics.
 */

export interface NodeStat {
  count: number;     // throughput (tokens serviced) in the stats window
  avgWait: number;   // mean queue wait before service
}
export interface TeamStat {
  utilization: number;
  avgQueue: number;
  maxQueue: number;
  cost: number; // team cost this replication (busy hours × costPerHour)
}

/** One replication's results. */
export interface RepStats {
  arrived: number;
  completed: number;
  avgFlowTime: number;
  perNode: Record<string, NodeStat>;
  perTeam: Record<string, TeamStat>;
}

export interface Stat { mean: number; p5: number; p50: number; p95: number; }

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function statOf(values: number[]): Stat {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  return { mean, p5: percentile(sorted, 5), p50: percentile(sorted, 50), p95: percentile(sorted, 95) };
}

export interface AggregatedStats {
  replications: number;
  arrived: Stat;
  completed: Stat;
  flowTime: Stat;
  /** Total resource cost across all teams (busy hours × rate). */
  totalCost: Stat;
  /** Cost per completed case (totalCost / completed). */
  costPerCase: Stat;
  perNode: Record<string, { count: Stat; wait: Stat }>;
  perTeam: Record<string, { utilization: Stat; avgQueue: Stat; maxQueue: Stat; cost: Stat }>;
}

/** Aggregate per-replication stats into mean/p5/p50/p95 across replications. */
export function aggregate(reps: RepStats[]): AggregatedStats {
  const nodeIds = new Set<string>(); const teamIds = new Set<string>();
  for (const r of reps) {
    Object.keys(r.perNode).forEach((k) => nodeIds.add(k));
    Object.keys(r.perTeam).forEach((k) => teamIds.add(k));
  }
  const perNode: AggregatedStats["perNode"] = {};
  for (const id of nodeIds) {
    perNode[id] = {
      count: statOf(reps.map((r) => r.perNode[id]?.count ?? 0)),
      wait: statOf(reps.map((r) => r.perNode[id]?.avgWait ?? 0)),
    };
  }
  const perTeam: AggregatedStats["perTeam"] = {};
  for (const id of teamIds) {
    perTeam[id] = {
      utilization: statOf(reps.map((r) => r.perTeam[id]?.utilization ?? 0)),
      avgQueue: statOf(reps.map((r) => r.perTeam[id]?.avgQueue ?? 0)),
      maxQueue: statOf(reps.map((r) => r.perTeam[id]?.maxQueue ?? 0)),
      cost: statOf(reps.map((r) => r.perTeam[id]?.cost ?? 0)),
    };
  }
  // Per-replication totals, then aggregate (so percentiles reflect run-to-run
  // variation, not a sum of percentiles).
  const totalCostPerRep = reps.map((r) => Object.values(r.perTeam).reduce((s, t) => s + (t.cost ?? 0), 0));
  const costPerCasePerRep = reps.map((r, i) => (r.completed > 0 ? totalCostPerRep[i] / r.completed : 0));
  return {
    replications: reps.length,
    arrived: statOf(reps.map((r) => r.arrived)),
    completed: statOf(reps.map((r) => r.completed)),
    flowTime: statOf(reps.map((r) => r.avgFlowTime)),
    totalCost: statOf(totalCostPerRep),
    costPerCase: statOf(costPerCasePerRep),
    perNode, perTeam,
  };
}
