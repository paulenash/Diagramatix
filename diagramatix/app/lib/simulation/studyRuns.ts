/**
 * Load every completed run of every scenario in a study — the run history the
 * comparison features read. Extracted from the ad-hoc queries in the `assess`
 * route so "Suggested next steps", parameter sweeps and the sensitivity/tornado
 * analysis all read the same shape from one place.
 *
 * Scoped by projectId as well as studyId: the scenario → study → project chain
 * is checked in the query itself, so a caller cannot reach another project's
 * study by guessing an id (same guarantee the assess route's own loaders give).
 *
 * Runs are returned newest-first per scenario, and runs that errored or never
 * finished are excluded — a run without metrics has nothing to say.
 */

import { prisma } from "@/app/lib/db";
import type { RunMetrics } from "./results";
import type { OverrideSet } from "./overrides";
import { DEFAULT_RUN_CONFIG, type ScenarioRunConfig } from "./types";

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

/**
 * Every completed run in `studyId`, newest-first within each scenario, then by
 * scenario name so the ordering is stable across calls. Returns `[]` when the
 * study does not exist, does not belong to `projectId`, or has no finished runs.
 */
export async function loadStudyRuns(studyId: string, projectId: string): Promise<StudyRun[]> {
  const scenarios = await prisma.simulationScenario.findMany({
    where: { studyId, study: { projectId } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      isBaseline: true,
      overrides: true,
      runs: {
        where: { error: null, finishedAt: { not: null } },
        orderBy: { startedAt: "desc" },
        select: { id: true, name: true, pinned: true, configSnapshot: true, metrics: true, startedAt: true },
      },
    },
  });

  const out: StudyRun[] = [];
  for (const sc of scenarios) {
    const scenarioOverrides = (sc.overrides ?? {}) as unknown as OverrideSet;
    for (const run of sc.runs) {
      // A run row exists from the moment the run starts; metrics are written
      // when it finishes. Belt-and-braces alongside the finishedAt filter —
      // a metrics-less run would break every downstream reader.
      const metrics = run.metrics as unknown as RunMetrics | null;
      if (!metrics || !metrics.stats) continue;
      out.push({
        scenarioId: sc.id,
        scenarioName: sc.name,
        isBaselineScenario: sc.isBaseline,
        runId: run.id,
        runName: run.name ?? null,
        pinned: run.pinned,
        startedAt: run.startedAt.toISOString(),
        config: { ...DEFAULT_RUN_CONFIG, ...((run.configSnapshot ?? {}) as unknown as ScenarioRunConfig) },
        scenarioOverrides,
        metrics,
      });
    }
  }
  return out;
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
