/**
 * Compliance Monitoring — pure org-wide aggregation of control operating-
 * effectiveness OVER TIME, assembled from the process-mining runs retained across
 * an org's projects. No DB, no I/O: the route hands this the runs (each with its
 * `conformance` + `governance` JSON) and the org's control catalog; this rolls
 * them up into the time series + snapshots the console renders.
 *
 * Per (run, control) effectiveness reuses the same two evidence sources as the
 * per-project RCM screen: mined Control IDs (`logControlEffectiveness`, preferred)
 * else a conformance deviation (`controlEffectiveness`). Both expose
 * bypassed/total, from which applied = total − bypassed and expected = total.
 * `ControlObservation` is additive, so an org-level effectiveness for a control
 * code = Σapplied / Σexpected over the matching runs.
 */
import type { ConformanceResult } from "@/app/lib/mining/transitionConformance";
import type { GovernanceStats } from "@/app/lib/mining/types";
import { controlEffectiveness, logControlEffectiveness } from "./controlEffectiveness";

export interface ComplianceRunInput {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  createdAt: string;                       // ISO — supplied by the caller (no clock here)
  conformance: ConformanceResult | null;
  governance: GovernanceStats | null;
}
export interface ComplianceControlInput {
  code: string;
  name: string;
  monitorSignature: string | null;
}

export interface ControlPoint {
  runId: string; createdAt: string; projectId: string; projectName: string;
  applied: number; expected: number; effPct: number | null; bypassed: number;
}
export interface RunSummary {
  runId: string; runName: string; projectId: string; projectName: string; createdAt: string;
  fitnessPct: number | null; overallEffPct: number | null;
}
export interface ControlSeries {
  code: string; name: string; points: ControlPoint[];
  orgEffPct: number | null;                // Σapplied/Σexpected across all points
  latestEffPct: number | null;             // most recent point's effectiveness
  belowThreshold: boolean;
  declining: boolean;                      // last point dropped vs the previous
}
export interface ProjectRow {
  projectId: string; projectName: string;
  latestFitnessPct: number | null; latestEffPct: number | null;
  lastRunAt: string; runCount: number;
}
export interface ComplianceReport {
  runs: RunSummary[];                      // chronological (oldest → newest)
  controls: ControlSeries[];               // measured controls, most-at-risk first
  projects: ProjectRow[];                  // one row per project, by name
  summary: {
    runCount: number; projectCount: number; controlCount: number;
    controlsBelowThreshold: number; decliningControls: number;
    overallEffPct: number | null; latestFitnessPct: number | null;
  };
  threshold: number;
}

const pct = (applied: number, expected: number): number | null =>
  expected > 0 ? Math.round((applied / expected) * 1000) / 10 : null;

/** appliedExpected for one control in one run, or null if the run didn't measure it. */
function measure(control: ComplianceControlInput, run: ComplianceRunInput): { applied: number; expected: number; bypassed: number } | null {
  const e = logControlEffectiveness(control.code, run.governance)
    ?? (run.conformance ? controlEffectiveness(control.monitorSignature, run.conformance) : null);
  if (!e || e.totalCases <= 0) return null;
  const expected = e.totalCases;
  const bypassed = e.bypassedCases;
  return { applied: expected - bypassed, expected, bypassed };
}

export function buildComplianceReport(
  runsIn: ComplianceRunInput[],
  controls: ComplianceControlInput[],
  opts?: { threshold?: number },
): ComplianceReport {
  const threshold = opts?.threshold ?? 80;
  // Chronological by createdAt (string ISO compares correctly), stable by id.
  const runs = [...runsIn].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  // De-dupe controls by code (the org master control is the canonical unit).
  const controlByCode = new Map<string, ComplianceControlInput>();
  for (const c of controls) if (!controlByCode.has(c.code)) controlByCode.set(c.code, c);

  const runSummaries: RunSummary[] = [];
  const pointsByCode = new Map<string, ControlPoint[]>();

  for (const run of runs) {
    let runApplied = 0, runExpected = 0;
    for (const control of controlByCode.values()) {
      const m = measure(control, run);
      if (!m) continue;
      runApplied += m.applied; runExpected += m.expected;
      const pts = pointsByCode.get(control.code) ?? [];
      pts.push({
        runId: run.id, createdAt: run.createdAt, projectId: run.projectId, projectName: run.projectName,
        applied: m.applied, expected: m.expected, bypassed: m.bypassed, effPct: pct(m.applied, m.expected),
      });
      pointsByCode.set(control.code, pts);
    }
    runSummaries.push({
      runId: run.id, runName: run.name, projectId: run.projectId, projectName: run.projectName, createdAt: run.createdAt,
      fitnessPct: run.conformance ? Math.round((run.conformance.fitness ?? 0) * 1000) / 10 : null,
      overallEffPct: pct(runApplied, runExpected),
    });
  }

  // Per-control series (points already chronological — built in run order).
  const controlSeries: ControlSeries[] = [];
  for (const [code, points] of pointsByCode) {
    const totApplied = points.reduce((s, p) => s + p.applied, 0);
    const totExpected = points.reduce((s, p) => s + p.expected, 0);
    const last = points[points.length - 1];
    const prev = points.length > 1 ? points[points.length - 2] : null;
    const latestEffPct = last?.effPct ?? null;
    controlSeries.push({
      code, name: controlByCode.get(code)?.name ?? code, points,
      orgEffPct: pct(totApplied, totExpected),
      latestEffPct,
      belowThreshold: latestEffPct != null && latestEffPct < threshold,
      declining: !!(prev && last && prev.effPct != null && last.effPct != null && last.effPct < prev.effPct),
    });
  }
  // Most-at-risk first: below-threshold, then declining, then lowest effectiveness.
  controlSeries.sort((a, b) =>
    Number(b.belowThreshold) - Number(a.belowThreshold) ||
    Number(b.declining) - Number(a.declining) ||
    (a.latestEffPct ?? 101) - (b.latestEffPct ?? 101) ||
    a.code.localeCompare(b.code));

  // Per-project rows — latest run per project.
  const byProject = new Map<string, RunSummary[]>();
  for (const r of runSummaries) (byProject.get(r.projectId) ?? byProject.set(r.projectId, []).get(r.projectId)!).push(r);
  const projects: ProjectRow[] = [];
  for (const [projectId, rs] of byProject) {
    const latest = rs[rs.length - 1]; // runSummaries are chronological
    projects.push({
      projectId, projectName: latest.projectName,
      latestFitnessPct: latest.fitnessPct, latestEffPct: latest.overallEffPct,
      lastRunAt: latest.createdAt, runCount: rs.length,
    });
  }
  projects.sort((a, b) => a.projectName.localeCompare(b.projectName));

  // Org overall = Σapplied/Σexpected across every point.
  const allApplied = controlSeries.reduce((s, c) => s + c.points.reduce((t, p) => t + p.applied, 0), 0);
  const allExpected = controlSeries.reduce((s, c) => s + c.points.reduce((t, p) => t + p.expected, 0), 0);
  const latestRun = runSummaries[runSummaries.length - 1] ?? null;

  return {
    runs: runSummaries,
    controls: controlSeries,
    projects,
    summary: {
      runCount: runs.length,
      projectCount: byProject.size,
      controlCount: controlSeries.length,
      controlsBelowThreshold: controlSeries.filter((c) => c.belowThreshold).length,
      decliningControls: controlSeries.filter((c) => c.declining).length,
      overallEffPct: pct(allApplied, allExpected),
      latestFitnessPct: latestRun?.fitnessPct ?? null,
    },
    threshold,
  };
}
