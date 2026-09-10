/**
 * POST — sweep one parameter across a range and return the response curve.
 *
 * Runs N complete Monte-Carlos back to back against a network assembled ONCE,
 * each with the swept value applied over the scenario's own overrides. Every
 * point is persisted as a SimulationRun so the curve can be reopened, and each is
 * PINNED — the Run History prunes unpinned runs to the last five, which would eat
 * a sweep the moment it finished.
 *
 * The work is `steps × horizon × replications`, so `clampSweep` bounds it before
 * the engine sees anything: the same guard as a single run, multiplied.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { serverError } from "@/app/lib/apiError";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import type { DiagramData } from "@/app/lib/diagram/types";
import { assemblePortfolio, portfolioClosure } from "@/app/lib/simulation/network";
import { spliceLinkedSubprocesses } from "@/app/lib/simulation/spliceLinks";
import { applyOverrides, type OverrideSet } from "@/app/lib/simulation/overrides";
import type { PoolUnit } from "@/app/lib/simulation/resourcePool";
import { runMonteCarlo, clampSweep } from "@/app/lib/simulation/runner";
import { buildSweep, analyseSweep, type SweepLever, type SweepObjective, type SweepPoint } from "@/app/lib/simulation/sweep";
import { enumerateLevers } from "@/app/lib/simulation/nextSteps";
import { DEFAULT_RUN_CONFIG, type ScenarioRunConfig, type WorkCalendar } from "@/app/lib/simulation/types";
import type { RunMetrics } from "@/app/lib/simulation/results";

type Params = { params: Promise<{ id: string; studyId: string; scenarioId: string }> };

const LEVER_KINDS = ["teamCapacity", "taskCycleTime", "sourceArrival"] as const;
const OBJECTIVES = ["typical", "nearWorst", "throughput", "costPerCase"] as const;

/**
 * GET — what this scenario can sweep, with each lever's current value.
 *
 * Read from the scenario's most recent run rather than re-assembling the network:
 * `teamCapacities` names every team and `nodeLabels` every task and source, which
 * is exactly the set. Reuses the same enumeration the suggestions use, so the two
 * features can never disagree about what a lever is.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id, studyId, scenarioId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const scenario = await prisma.simulationScenario.findFirst({
    where: { id: scenarioId, studyId, study: { projectId: id } }, select: { id: true },
  });
  if (!scenario) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const run = await prisma.simulationRun.findFirst({
    where: { scenarioId, error: null }, orderBy: { startedAt: "desc" }, select: { metrics: true },
  });
  const metrics = (run?.metrics ?? null) as unknown as RunMetrics | null;
  if (!metrics?.stats) {
    // Nothing to enumerate from, and guessing the model's shape would be worse
    // than saying so.
    return NextResponse.json({ levers: [], reason: "Run this scenario once before sweeping — the levers come from its last run." });
  }
  const levers = enumerateLevers(metrics).map((l) => ({
    ...l,
    current: l.kind === "teamCapacity" ? metrics.teamCapacities?.[l.target] : undefined,
  }));
  return NextResponse.json({ levers });
}

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
    select: { id: true, name: true, runConfig: true, overrides: true, variantRootIds: true },
  });
  if (!scenario) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ── Validate the request ────────────────────────────────────────────────
  const body = await req.json().catch(() => ({}));
  const kind = LEVER_KINDS.find((k) => k === body?.lever?.kind);
  const target = typeof body?.lever?.target === "string" ? body.lever.target : "";
  if (!kind || !target) return NextResponse.json({ error: "A lever (kind + target) is required." }, { status: 400 });
  const lever: SweepLever = { kind, target, label: typeof body.lever.label === "string" ? body.lever.label : target };

  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const from = num(body.from, 1), to = num(body.to, 10);
  if (from === to) return NextResponse.json({ error: "The range must cover more than one value." }, { status: 400 });
  const objective: SweepObjective = OBJECTIVES.find((o) => o === body.objective) ?? "nearWorst";

  // ── Gather the model, exactly as a normal run does ──────────────────────
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
  const closure = portfolioClosure(diagrams, rootIds);
  const byId = new Map(diagrams.map((d) => [d.id, d.data]));
  const rootDiagrams = rootIds
    .map((rid) => { const d = byId.get(rid); return d ? { id: rid, data: spliceLinkedSubprocesses(d, rid, byId) } : null; })
    .filter((x): x is { id: string; data: DiagramData } => x !== null);

  const teams = await prisma.simulationTeam.findMany({ where: { projectId: id }, select: { name: true, capacity: true, costPerHour: true, calendarId: true, members: true, discipline: true, preemptive: true } });
  const teamCapacities = Object.fromEntries(teams.map((t) => [t.name, t.capacity]));
  // Named people and their skills, when the team declares any. A team with no
  // members stays a counted pool, exactly as before skills existed.
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
  const teamCosts = Object.fromEntries(teams.filter((t) => t.costPerHour != null).map((t) => [t.name, t.costPerHour as number]));
  const calendars = await prisma.simulationCalendar.findMany({ where: { projectId: id }, select: { id: true, pattern: true } });
  const calendarsById = Object.fromEntries(calendars.map((c) => [c.id, (c.pattern ?? { intervals: [] }) as unknown as WorkCalendar]));
  const teamCalendars: Record<string, WorkCalendar> = {};
  for (const t of teams) if (t.calendarId && calendarsById[t.calendarId]) teamCalendars[t.name] = calendarsById[t.calendarId];

  // ── Bound the work BEFORE running anything ─────────────────────────────
  const rawCfg: ScenarioRunConfig = { ...DEFAULT_RUN_CONFIG, ...((scenario.runConfig ?? {}) as unknown as ScenarioRunConfig) };
  const { cfg: sweepCfg, steps, clamped } = clampSweep(rawCfg, num(body.steps, 8));
  const cfg: ScenarioRunConfig = { ...rawCfg, ...sweepCfg };

  const baseOverrides = (scenario.overrides ?? {}) as unknown as OverrideSet;
  const baseline = assemblePortfolio(rootDiagrams, { teamCapacities, strictTeams: true, teamCalendars, calendarsById, teamUnits, teamDisciplines, teamPreemptive });
  const stepsToRun = buildSweep(lever, from, to, steps);

  try {
    const points: SweepPoint[] = [];
    for (const step of stepsToRun) {
      // The swept value goes ON TOP of the scenario's own overrides, so a sweep
      // explores around the scenario as configured rather than around the study
      // baseline — which is what the user is looking at when they ask.
      const merged: OverrideSet = {
        elements: { ...baseOverrides.elements, ...step.overrides.elements },
        connectors: { ...baseOverrides.connectors },
        teams: { ...baseOverrides.teams, ...step.overrides.teams },
      };
      const net = applyOverrides(baseline, merged);
      const { stats, reps, overload } = runMonteCarlo(net, cfg, cfg.interventions, teamCosts);
      const bottlenecks = Object.entries(stats.perTeam).sort((a, b) => b[1].utilization.mean - a[1].utilization.mean).map(([t]) => t);
      const nodeLabels: Record<string, { label: string; kind: string }> = {};
      for (const n of net.nodes) nodeLabels[n.id] = { label: n.label ?? n.id.split("::").pop() ?? n.id, kind: n.kind };
      const metrics: RunMetrics = {
        stats, bottlenecks, nodeLabels, clockUnit: cfg.clockUnit, teamCapacities,
        repMeans: reps.map((r) => r.avgFlowTime),
        repCompleted: reps.map((r) => r.completed),
        repCost: reps.map((r) => Object.values(r.perTeam).reduce((s, t) => s + (t.cost ?? 0), 0)),
        ...(overload ? { overload } : {}),
      };

      const run = await prisma.simulationRun.create({
        data: {
          scenarioId,
          name: `${lever.label} = ${step.value}`,
          // PINNED: run-history pruning keeps only the last five unpinned runs,
          // which would delete most of a sweep as it was still being built.
          pinned: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          configSnapshot: { ...cfg, sweep: { lever, value: step.value, objective } } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          networkSnapshot: { ...net, closure } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          metrics: metrics as any,
          finishedAt: new Date(),
        },
        select: { id: true },
      });
      points.push({ ...step, metrics, runId: run.id });
    }

    const analysis = analyseSweep(lever, points, objective);
    return NextResponse.json({ analysis, steps: points.length, clamped, replications: cfg.replications }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
