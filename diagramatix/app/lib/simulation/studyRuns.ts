/**
 * The shape of a study's run history, and the pure helpers over it — shared by
 * "Suggested next steps", parameter sweeps and the sensitivity analysis.
 *
 * THIS FILE MUST STAY FREE OF PRISMA. It is reachable from a client component
 * (StudyManager → nextSteps → here), so importing the DB here drags Prisma and
 * `node:module` into the browser bundle and the PRODUCTION BUILD FAILS — which is
 * exactly what happened when the query lived here. Neither `tsc` nor the unit
 * tests catch it; only `npm run build` does. The query now lives in
 * `loadStudyRuns.ts`, and tests/simulation/next-steps.test.ts pins the rule.
 */

import type { RunMetrics } from "./results";
import type { OverrideSet } from "./overrides";
import type { ScenarioRunConfig } from "./types";

export interface StudyRun {
  scenarioId: string;
  scenarioName: string;
  /** The scenario flagged as the study's baseline (at most one). */
  isBaselineScenario: boolean;
  runId: string;
  /** User-given name — set when the run was pinned into the Run History. */
  runName: string | null;
  pinned: boolean;
  startedAt: string;
  /**
   * The configuration this run ACTUALLY ran with — `SimulationRun.configSnapshot`,
   * taken after `clampRunConfig`. Authoritative, unlike the scenario's current
   * `runConfig`, which may have been edited since the run happened.
   */
  config: ScenarioRunConfig;
  /**
   * The scenario's CURRENT override set — deliberately named for what it is.
   *
   * A run does not snapshot its overrides; it snapshots the resulting network
   * (`networkSnapshot`). So for the latest run of a scenario this is exactly
   * what ran, but for an older run it is only what that scenario's overrides
   * look like *now* — editing a scenario rewrites the apparent history of every
   * earlier run under it. Any caller making a claim about what was tried and
   * when must either restrict itself to the latest run per scenario or derive
   * the truth from `networkSnapshot`; it must not present this as fact.
   */
  scenarioOverrides: OverrideSet;
  metrics: RunMetrics;
}

/** The most recent completed run of each scenario, keyed by scenario id. The
 *  subset for which {@link StudyRun.scenarioOverrides} is exactly what ran. */
export function latestRunPerScenario(runs: StudyRun[]): Map<string, StudyRun> {
  const byScenario = new Map<string, StudyRun>();
  for (const r of runs) {
    const seen = byScenario.get(r.scenarioId);
    if (!seen || r.startedAt > seen.startedAt) byScenario.set(r.scenarioId, r);
  }
  return byScenario;
}
