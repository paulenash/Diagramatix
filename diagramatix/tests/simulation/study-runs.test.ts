/**
 * `latestRunPerScenario` — the subset of a study's run history for which a
 * scenario's CURRENT overrides are genuinely what ran. Everything that reasons
 * about "which levers have been pulled" depends on picking the right run per
 * scenario, so the selection is pinned here.
 *
 * `loadStudyRuns` itself is a thin Prisma query (scoped by studyId AND
 * projectId); its behaviour is exercised through the routes that use it.
 */
import { describe, it, expect } from "vitest";
import { latestRunPerScenario, type StudyRun } from "@/app/lib/simulation/studyRuns";
import { DEFAULT_RUN_CONFIG } from "@/app/lib/simulation/types";
import type { RunMetrics } from "@/app/lib/simulation/results";

/** A StudyRun with only the fields the selection reads set meaningfully. */
function run(scenarioId: string, runId: string, startedAt: string): StudyRun {
  return {
    scenarioId,
    scenarioName: scenarioId,
    isBaselineScenario: false,
    runId,
    runName: null,
    pinned: false,
    startedAt,
    config: { ...DEFAULT_RUN_CONFIG },
    scenarioOverrides: {},
    metrics: {} as RunMetrics,
  };
}

describe("latestRunPerScenario", () => {
  it("T3370 - keeps the newest run of each scenario, whatever order they arrive in", () => {
    const runs = [
      run("a", "a-old", "2026-09-01T10:00:00.000Z"),
      run("b", "b-new", "2026-09-05T10:00:00.000Z"),
      run("a", "a-new", "2026-09-04T10:00:00.000Z"),
      run("b", "b-old", "2026-09-02T10:00:00.000Z"),
    ];
    const latest = latestRunPerScenario(runs);
    expect(latest.size).toBe(2);
    expect(latest.get("a")?.runId).toBe("a-new");
    expect(latest.get("b")?.runId).toBe("b-new");
  });

  it("T3371 - an empty history yields no rows rather than throwing", () => {
    expect(latestRunPerScenario([]).size).toBe(0);
  });
});
