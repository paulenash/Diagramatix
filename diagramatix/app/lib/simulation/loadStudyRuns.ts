/**
 * The DB half of the study run history: load every completed run of a study.
 *
 * Deliberately SEPARATE from `studyRuns.ts`. That module is reachable from a
 * client component (StudyManager → nextSteps → studyRuns), so it must not pull
 * Prisma into the browser bundle — which is exactly the build failure this split
 * fixes. Types and pure helpers live there; the query lives here, and only routes
 * import this file.
 */

import { prisma } from "@/app/lib/db";
import type { RunMetrics } from "./results";
import type { OverrideSet } from "./overrides";
import { DEFAULT_RUN_CONFIG, type ScenarioRunConfig } from "./types";
import type { StudyRun } from "./studyRuns";

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
