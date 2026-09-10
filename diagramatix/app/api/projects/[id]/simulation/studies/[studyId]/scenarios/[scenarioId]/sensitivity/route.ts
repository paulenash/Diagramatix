/**
 * POST — the tornado: vary every parameter ±X% in turn and rank them by how much
 * the answer moves.
 *
 * A tornado is N one-step sweeps, so this reuses Phase 4's machinery wholesale —
 * the same assembled baseline, the same overrides, the same runner. It runs 2N+1
 * Monte-Carlos (a baseline plus a low and a high per parameter), which is why the
 * clamp counts them all rather than treating it as one run.
 *
 * The clamp is clampSensitivity, NOT clampSweep. A sweep's size is a user choice
 * and 24 points is plenty; a tornado's is 2N+1, set by the model, and an ordinary
 * 20-parameter process needs 41. Sharing the sweep cap silently dropped nine of
 * them while using barely 70% of the real work budget.
 *
 * Parameters that make NO difference are returned with the rest, never filtered
 * away: that half of the chart is the answer to "but you guessed that number".
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { serverError } from "@/app/lib/apiError";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import type { DiagramData } from "@/app/lib/diagram/types";
import { assemblePortfolio } from "@/app/lib/simulation/network";
import { spliceLinkedSubprocesses } from "@/app/lib/simulation/spliceLinks";
import { applyOverrides, type OverrideSet } from "@/app/lib/simulation/overrides";
import { runMonteCarlo, clampSensitivity } from "@/app/lib/simulation/runner";
import {
  enumerateParameters, variationsFor, overrideForParam, buildTornado,
  DEFAULT_VARIATION, type SensitivityRun,
} from "@/app/lib/simulation/sensitivity";
import type { SweepObjective } from "@/app/lib/simulation/sweep";
import { DEFAULT_RUN_CONFIG, type ScenarioRunConfig, type WorkCalendar } from "@/app/lib/simulation/types";
import type { PoolUnit } from "@/app/lib/simulation/resourcePool";
import type { RunMetrics } from "@/app/lib/simulation/results";

type Params = { params: Promise<{ id: string; studyId: string; scenarioId: string }> };
const OBJECTIVES = ["typical", "nearWorst", "throughput", "costPerCase"] as const;

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, studyId, scenarioId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const scenario = await prisma.simulationScenario.findFirst({
    where: { id: scenarioId, studyId, study: { projectId: id } },
    select: { id: true, runConfig: true, overrides: true, variantRootIds: true },
  });
  if (!scenario) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const objective: SweepObjective = OBJECTIVES.find((o) => o === body.objective) ?? "nearWorst";
  const rawPct = typeof body.variationPct === "number" ? body.variationPct : DEFAULT_VARIATION;
  const variationPct = Math.max(0.01, Math.min(0.9, rawPct));

  // ── The model, exactly as a normal run assembles it ────────────────────
  const variantRootIds = Array.isArray(scenario.variantRootIds)
    ? (scenario.variantRootIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  let rootIds = variantRootIds;
  if (rootIds.length === 0) {
    const roots = await prisma.simulationStudyRoot.findMany({ where: { studyId }, select: { diagramId: true } });
    rootIds = roots.map((r) => r.diagramId);
  }
  if (rootIds.length === 0) return NextResponse.json({ error: "This scenario has no diagram to run." }, { status: 400 });

  const projectDiagrams = await prisma.diagram.findMany({ where: { projectId: id, type: "bpmn" }, select: { id: true, data: true } });
  const diagrams = projectDiagrams.map((d) => ({ id: d.id, data: (d.data ?? {}) as unknown as DiagramData }));
  const byId = new Map(diagrams.map((d) => [d.id, d.data]));
  const rootDiagrams = rootIds
    .map((rid) => { const d = byId.get(rid); return d ? { id: rid, data: spliceLinkedSubprocesses(d, rid, byId) } : null; })
    .filter((x): x is { id: string; data: DiagramData } => x !== null);

  const teams = await prisma.simulationTeam.findMany({
    where: { projectId: id },
    select: { name: true, capacity: true, costPerHour: true, calendarId: true, members: true, discipline: true, preemptive: true },
  });
  const teamCapacities = Object.fromEntries(teams.map((t) => [t.name, t.capacity]));
  const teamCosts = Object.fromEntries(teams.filter((t) => t.costPerHour != null).map((t) => [t.name, t.costPerHour as number]));
  const teamUnits: Record<string, PoolUnit[]> = {};
  for (const t of teams) {
    const members = Array.isArray(t.members) ? (t.members as unknown as { name?: string; skills?: string[] }[]) : [];
    const units = members
      .filter((m) => typeof m?.name === "string" && m.name.trim())
      .map((m) => ({ id: m.name!.trim(), name: m.name!.trim(), skills: Array.isArray(m.skills) ? m.skills.filter((x) => typeof x === "string") : [] }));
    if (units.length) teamUnits[t.name] = units;
  }
  // How each team orders its queue, and whether it may interrupt work in
  // progress. Both were engine capabilities with nowhere to store them, so they
  // were reachable only from a hand-built network or a BPSim import.
  const teamDisciplines: Record<string, "fifo" | "priority" | "shortest-first"> = {};
  const teamPreemptive: Record<string, boolean> = {};
  for (const t of teams) {
    if (t.discipline === "priority" || t.discipline === "shortest-first") teamDisciplines[t.name] = t.discipline;
    if (t.preemptive) teamPreemptive[t.name] = true;
  }
  const calendars = await prisma.simulationCalendar.findMany({ where: { projectId: id }, select: { id: true, pattern: true } });
  const calendarsById = Object.fromEntries(calendars.map((c) => [c.id, (c.pattern ?? { intervals: [] }) as unknown as WorkCalendar]));
  const teamCalendars: Record<string, WorkCalendar> = {};
  for (const t of teams) if (t.calendarId && calendarsById[t.calendarId]) teamCalendars[t.name] = calendarsById[t.calendarId];

  const baseOverrides = (scenario.overrides ?? {}) as unknown as OverrideSet;
  const assembled = assemblePortfolio(rootDiagrams, { teamCapacities, strictTeams: true, teamCalendars, calendarsById, teamUnits, teamDisciplines, teamPreemptive });
  // Enumerate from the network the scenario ACTUALLY runs, overrides included —
  // otherwise the baselines shown would not be the ones being perturbed.
  const scenarioNet = applyOverrides(assembled, baseOverrides);
  const parameters = enumerateParameters(scenarioNet);

  // ── Bound the work: a baseline plus two runs per testable parameter ────
  const testable = parameters.map((p) => ({ p, v: variationsFor(p, variationPct) }));
  const points = 1 + testable.filter((t) => t.v).length * 2;
  const rawCfg: ScenarioRunConfig = { ...DEFAULT_RUN_CONFIG, ...((scenario.runConfig ?? {}) as unknown as ScenarioRunConfig) };
  const { cfg: clampedCfg, steps: allowed, clamped } = clampSensitivity(rawCfg, points);
  const cfg: ScenarioRunConfig = { ...rawCfg, ...clampedCfg };

  // If the clamp cut the budget below what a full tornado needs, test the
  // parameters we CAN afford rather than silently returning a partial chart that
  // looks complete. Which ones were dropped is reported.
  const affordable = Math.max(0, Math.floor((allowed - 1) / 2));
  const dropped: string[] = [];
  let budget = affordable;
  const plan = testable.map((t) => {
    if (!t.v) return t;
    if (budget > 0) { budget--; return t; }
    dropped.push(t.p.label);
    return { p: t.p, v: null };
  });

  try {
    const runOne = (ov: OverrideSet): RunMetrics => {
      const merged: OverrideSet = {
        elements: { ...baseOverrides.elements, ...ov.elements },
        connectors: { ...baseOverrides.connectors },
        teams: { ...baseOverrides.teams, ...ov.teams },
      };
      const net = applyOverrides(assembled, merged);
      const { stats, reps } = runMonteCarlo(net, cfg, cfg.interventions, teamCosts);
      const bottlenecks = Object.entries(stats.perTeam).sort((a, b) => b[1].utilization.mean - a[1].utilization.mean).map(([t]) => t);
      return {
        stats, bottlenecks, nodeLabels: {}, clockUnit: cfg.clockUnit, teamCapacities,
        repMeans: reps.map((r) => r.avgFlowTime),
      };
    };

    const baseline = runOne({});
    const runs: SensitivityRun[] = plan.map(({ p, v }) => (v
      ? {
          param: p,
          low: { value: v.low, metrics: runOne(overrideForParam(p, v.low)) },
          high: { value: v.high, metrics: runOne(overrideForParam(p, v.high)) },
        }
      : { param: p, low: null, high: null }));

    const tornado = buildTornado(baseline, runs, objective, variationPct);
    return NextResponse.json({
      tornado,
      parameters: parameters.length,
      tested: runs.filter((r) => r.low && r.high).length,
      clamped,
      // Named, because a chart missing its biggest lever is worse than no chart.
      droppedForBudget: dropped,
      replications: cfg.replications,
    }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
