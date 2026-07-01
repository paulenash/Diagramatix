import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import type { DiagramData } from "@/app/lib/diagram/types";
import { assemblePortfolio, portfolioClosure } from "@/app/lib/simulation/network";
import { spliceLinkedSubprocesses } from "@/app/lib/simulation/spliceLinks";
import { applyOverrides, type OverrideSet } from "@/app/lib/simulation/overrides";
import { runMonteCarlo } from "@/app/lib/simulation/runner";
import { checkSimReadiness } from "@/app/lib/simulation/readiness";
import { runIdsToPrune } from "@/app/lib/simulation/runHistory";
import { DEFAULT_RUN_CONFIG, type ScenarioRunConfig } from "@/app/lib/simulation/types";

type Params = { params: Promise<{ id: string; studyId: string; scenarioId: string }> };

/** Scenario → study → project chain check. */
async function loadScenario(scenarioId: string, studyId: string, projectId: string) {
  const sc = await prisma.simulationScenario.findUnique({
    where: { id: scenarioId },
    include: { study: { select: { id: true, projectId: true } } },
  });
  if (!sc || sc.studyId !== studyId || sc.study.projectId !== projectId) return null;
  return sc;
}

/** GET — run history for the scenario (newest first), without the heavy
 *  network snapshots. */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id, studyId, scenarioId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!(await loadScenario(scenarioId, studyId, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const runs = await prisma.simulationRun.findMany({
    where: { scenarioId },
    orderBy: { startedAt: "desc" },
    select: { id: true, name: true, pinned: true, metrics: true, error: true, startedAt: true, finishedAt: true },
  });
  return NextResponse.json({ runs });
}

/** POST — assemble the study's roots into a portfolio network, apply the
 *  scenario's sparse overrides, schedule its planned interventions, run the
 *  Monte-Carlo, and persist a SimulationRun. Synchronous for now (small
 *  portfolios); large ones become a queued + polled job later. */
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
  const scenario = await loadScenario(scenarioId, studyId, id);
  if (!scenario) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ── Gather inputs ──────────────────────────────────────────────────────
  // Process variant (As-is vs To-be): run this scenario's own diagram(s) when
  // set, otherwise the study's roots.
  const variantRootIds = Array.isArray(scenario.variantRootIds)
    ? (scenario.variantRootIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  let rootIds: string[];
  if (variantRootIds.length > 0) {
    rootIds = variantRootIds;
  } else {
    const roots = await prisma.simulationStudyRoot.findMany({ where: { studyId }, select: { diagramId: true } });
    rootIds = roots.map((r) => r.diagramId);
  }
  if (rootIds.length === 0) return NextResponse.json({ error: "Scenario has no diagram to run (set a variant, or add study roots)" }, { status: 400 });

  // Every BPMN diagram in the project — feeds the closure + portfolio assembly.
  const projectDiagrams = await prisma.diagram.findMany({
    where: { projectId: id, type: "bpmn" },
    select: { id: true, data: true },
  });
  const diagrams = projectDiagrams.map((d) => ({ id: d.id, data: (d.data ?? {}) as unknown as DiagramData }));
  const closure = portfolioClosure(diagrams, rootIds);
  // Roll up linked subprocesses: flatten each root's `linkedDiagramId`
  // subprocesses into inline expanded subprocesses (drill-down), so the linked
  // child diagrams' tasks/teams/times simulate as part of the run.
  const byId = new Map(diagrams.map((d) => [d.id, d.data]));
  const rootDiagrams = rootIds
    .map((rid) => { const d = byId.get(rid); return d ? { id: rid, data: spliceLinkedSubprocesses(d, rid, byId) } : null; })
    .filter((x): x is { id: string; data: DiagramData } => x !== null);

  // Real pool capacities from the project's team library (keyed by name —
  // tasks reference a team by the name stored in sim.teamId).
  const teams = await prisma.simulationTeam.findMany({ where: { projectId: id }, select: { name: true, capacity: true, costPerHour: true } });
  const teamCapacities = Object.fromEntries(teams.map((t) => [t.name, t.capacity]));
  // Cost per hour by team name → per-team + total cost in the results.
  const teamCosts = Object.fromEntries(teams.filter((t) => t.costPerHour != null).map((t) => [t.name, t.costPerHour as number]));

  const cfg: ScenarioRunConfig = { ...DEFAULT_RUN_CONFIG, ...((scenario.runConfig ?? {}) as unknown as ScenarioRunConfig) };
  const overrides = (scenario.overrides ?? {}) as unknown as OverrideSet;

  // ── Pre-run readiness check ────────────────────────────────────────────
  // Surface un-set parameters (missing teams, gateway probabilities, arrival
  // rates, un-initialised properties) so the user can complete the setup before
  // running with silent defaults. `?force=true` runs anyway (the "Run anyway"
  // path from the dialog).
  const force = new URL(req.url).searchParams.get("force") === "true";
  if (!force) {
    const issues = checkSimReadiness(rootDiagrams.map((r) => r.data), teams);
    if (issues.length > 0) return NextResponse.json({ needsSetup: true, issues });
  }

  // ── Assemble + run ─────────────────────────────────────────────────────
  const baseline = assemblePortfolio(rootDiagrams, { teamCapacities });
  const net = applyOverrides(baseline, overrides);

  const run = await prisma.simulationRun.create({
    data: {
      scenarioId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      configSnapshot: cfg as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      networkSnapshot: { ...net, closure } as any,
    },
  });
  await prisma.simulationScenario.update({ where: { id: scenarioId }, data: { status: "RUNNING" } });

  // Prune the scenario's transient (unpinned) run history, keeping the most
  // recent few — named/pinned runs in the Run History are always kept.
  const allRuns = await prisma.simulationRun.findMany({ where: { scenarioId }, select: { id: true, pinned: true, startedAt: true } });
  const stale = runIdsToPrune(allRuns, 5).filter((rid) => rid !== run.id);
  if (stale.length) await prisma.simulationRun.deleteMany({ where: { id: { in: stale } } });

  try {
    const { stats } = runMonteCarlo(net, cfg, cfg.interventions, teamCosts);
    // Bottleneck ranking: teams by mean utilisation (highest first).
    const bottlenecks = Object.entries(stats.perTeam)
      .sort((a, b) => b[1].utilization.mean - a[1].utilization.mean)
      .map(([teamId]) => teamId);
    // Node labels (+ kind) so the results report reads cleanly instead of
    // showing namespaced ids.
    const nodeLabels: Record<string, { label: string; kind: string }> = {};
    for (const n of net.nodes) nodeLabels[n.id] = { label: n.label ?? n.id.split("::").pop() ?? n.id, kind: n.kind };
    const metrics = { stats, bottlenecks, nodeLabels, clockUnit: cfg.clockUnit, teamCapacities };

    const finished = await prisma.simulationRun.update({
      where: { id: run.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { metrics: metrics as any, finishedAt: new Date() },
    });
    await prisma.simulationScenario.update({ where: { id: scenarioId }, data: { status: "DONE" } });
    return NextResponse.json({ run: { id: finished.id, metrics, finishedAt: finished.finishedAt } }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Simulation failed";
    await prisma.simulationRun.update({ where: { id: run.id }, data: { error: message, finishedAt: new Date() } });
    await prisma.simulationScenario.update({ where: { id: scenarioId }, data: { status: "FAILED" } });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
