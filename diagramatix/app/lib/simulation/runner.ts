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
  /** Points in one parameter sweep. A sweep is N complete Monte-Carlos back to
   *  back in a single request, so it multiplies every cost above by its step
   *  count — the one place the existing budget could be blown through without
   *  any single field looking unreasonable. */
  maxSweepSteps: 24,
  /** Runs in one SENSITIVITY analysis (a tornado). Deliberately separate from
   *  maxSweepSteps, and much larger, because the two are bounded by different
   *  things. A sweep's size is a USER CHOICE and more than ~24 points on a curve
   *  buys nothing, so a small cap costs nothing. A tornado's size is 2N+1, set by
   *  THE MODEL — a perfectly ordinary 20-parameter process needs 41 runs, and
   *  reusing the sweep cap silently dropped nine of its parameters while using
   *  barely 70% of maxWork. maxWork is the guard that actually protects the
   *  request; this one only stops a pathological model from queueing thousands. */
  maxSensitivityRuns: 121,
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

export interface ClampSweepResult {
  cfg: SimRunConfig;
  steps: number;
  /** True when steps or replications were reduced — the caller must SAY so
   *  rather than silently returning a coarser curve than was asked for. */
  clamped: boolean;
}

/**
 * Clamp a SENSITIVITY analysis (a tornado) to {@link RUN_LIMITS}. The work is
 * `runs × horizon × replications`, where `runs` is 2N+1 for N parameters.
 *
 * `steps` in the result is the number of RUNS the caller may afford; it keeps
 * the ClampSweepResult shape so both callers read the same way.
 */
export function clampSensitivity(cfg: SimRunConfig, runs: number): ClampSweepResult {
  const base = clampRunConfig(cfg);
  let clamped = base.clamped;
  let n = Math.max(1, Math.min(RUN_LIMITS.maxSensitivityRuns, Math.floor(runs)));
  if (n !== runs) clamped = true;

  const { horizon } = base.cfg;
  let { replications } = base.cfg;
  // Replications give first, exactly as in a sweep: fewer of them only widens
  // the band, which compareSamples then reports honestly as "no difference
  // shown". Dropping PARAMETERS instead would silently shorten the chart, and a
  // tornado missing its biggest lever is worse than no tornado.
  if (n * horizon * replications > RUN_LIMITS.maxWork) {
    replications = Math.max(1, Math.floor(RUN_LIMITS.maxWork / (n * horizon)));
    clamped = true;
  }
  if (n * horizon * replications > RUN_LIMITS.maxWork) {
    n = Math.max(1, Math.floor(RUN_LIMITS.maxWork / (horizon * replications)));
    clamped = true;
  }
  return { cfg: { ...base.cfg, replications }, steps: n, clamped };
}

/**
 * Clamp a SWEEP to {@link RUN_LIMITS}. A sweep runs `steps` full Monte-Carlos
 * synchronously in one request, so the work is `steps × horizon × replications`.
 *
 * Order matters, and differs from a single run: steps are reduced LAST. A sweep
 * with too few points is not a curve at all, whereas fewer replications only
 * widens the confidence band — which the significance test then reports honestly
 * instead of hiding.
 */
export function clampSweep(cfg: SimRunConfig, steps: number): ClampSweepResult {
  const base = clampRunConfig(cfg);
  let clamped = base.clamped;
  let s = Math.max(2, Math.min(RUN_LIMITS.maxSweepSteps, Math.floor(steps)));
  if (s !== steps) clamped = true;

  let { horizon, replications } = base.cfg;
  if (s * horizon * replications > RUN_LIMITS.maxWork) {
    replications = Math.max(1, Math.floor(RUN_LIMITS.maxWork / (s * horizon)));
    clamped = true;
  }
  // Still too big even at one replication each — now the step count has to give.
  if (s * horizon * replications > RUN_LIMITS.maxWork) {
    s = Math.max(2, Math.floor(RUN_LIMITS.maxWork / (horizon * replications)));
    clamped = true;
  }
  return { cfg: { ...base.cfg, replications }, steps: s, clamped };
}

export interface MonteCarloResult {
  /** mean/p5/p50/p95 across replications. */
  stats: AggregatedStats;
  /** Per-replication raw stats — kept for drill-down + per-rep comparison. */
  reps: RepStats[];
  /** Set when the run was stopped short because the model could not keep up:
   *  work arrives faster than the resources can finish it, so the queue grows
   *  for as long as the run continues. The numbers here are a real finding about
   *  the process — the caller must SHOW them rather than present a part-run as
   *  though it were a complete answer. */
  overload?: { at: number; liveTokens: number };
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
  let overload: { at: number; liveTokens: number } | undefined;
  for (let r = 0; r < n; r++) {
    const rng = makeRng(deriveSeed(cfg.seed, r));
    const engine = new Engine(net, cfg, rng, opts);
    reps.push(engine.run());
    // An overloaded model is overloaded in EVERY replication — the arrival rate
    // simply exceeds what the resources can do. Repeating it would burn the same
    // time and memory again for the same answer, so stop and report it once.
    if (engine.overload) { overload = engine.overload; break; }
  }
  return { stats: aggregate(reps), reps, ...(overload ? { overload } : {}) };
}
