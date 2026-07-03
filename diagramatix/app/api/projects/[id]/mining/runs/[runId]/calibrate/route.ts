/**
 * POST — build a simulation "digital twin" from a run: ensure the discovered BPMN
 * exists, write the mined simulation parameters onto it (cycle times, arrival,
 * gateway branch probabilities, per-task teams), create the mined Team library +
 * a working calendar, and a SimulationStudy rooted on the diagram with an
 * as-mined baseline scenario. Returns { studyId, diagramId } so the caller can
 * jump into the Simulator. Idempotent-ish (reuses an existing study/teams/calendar).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { discoverProcess } from "@/app/lib/mining/discoverProcess";
import { calibrateSimulation } from "@/app/lib/mining/calibrateSimulation";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import type { DiagramData } from "@/app/lib/diagram/types";
import type { Variant, Performance, MiningStats } from "@/app/lib/mining/types";

type Params = { params: Promise<{ id: string; runId: string }> };
const MS_PER_UNIT = { second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000 } as const;

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, runId } = await params;
  let orgId: string | null = null;
  try {
    const ctx = await requireProjectAccess(session, await cookies(), id, "edit");
    orgId = ctx.projectOrgId ?? null;
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const userId = session?.user?.id;

  const run = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId: id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const variants = (run.variants ?? []) as unknown as Variant[];
  const perf = (run.performance ?? null) as unknown as Performance | null;
  const stats = (run.stats ?? {}) as unknown as MiningStats;
  if (!perf?.clockUnit || variants.length === 0) {
    return NextResponse.json({ error: "This run has no performance data — re-import the log." }, { status: 400 });
  }

  // ── Ensure a discovered BPMN diagram ──
  let bpmnId = run.discoveredBpmnId ?? null;
  let baseData: DiagramData | null = null;
  if (bpmnId) {
    const d = await prisma.diagram.findFirst({ where: { id: bpmnId, projectId: id }, select: { data: true } });
    baseData = (d?.data ?? null) as DiagramData | null;
    if (!baseData) bpmnId = null;
  }
  if (!bpmnId || !baseData) {
    const { plan } = discoverProcess(variants);
    baseData = layoutBpmnDiagram(plan.elements, plan.connections, { promptLabel: run.name });
    const created = await prisma.diagram.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { name: `${run.name} — discovered`, type: "bpmn", data: baseData as any, userId: userId!, diagramOwnerId: userId ?? null, orgId, projectId: id },
      select: { id: true },
    });
    bpmnId = created.id;
  }

  // ── Calibrate ──
  const cal = calibrateSimulation(baseData, perf);
  await pgPool.query('UPDATE "Diagram" SET data = $1::jsonb, "updatedAt" = NOW() WHERE id = $2', [JSON.stringify(cal.data), bpmnId]);

  // Mined working calendar (upsert by name).
  const CAL_NAME = "Working hours (mined)";
  let calId = (await prisma.simulationCalendar.findFirst({ where: { projectId: id, name: CAL_NAME }, select: { id: true } }))?.id;
  if (!calId) calId = (await prisma.simulationCalendar.create({ data: { name: CAL_NAME, projectId: id } })).id;
  await pgPool.query('UPDATE "SimulationCalendar" SET pattern = $1::jsonb, "updatedAt" = NOW() WHERE id = $2', [JSON.stringify(cal.calendar), calId]);

  // Mined team library (upsert by name; link the calendar).
  for (const t of cal.teams) {
    const existing = await prisma.simulationTeam.findFirst({ where: { projectId: id, name: t.name }, select: { id: true } });
    if (existing) await prisma.simulationTeam.update({ where: { id: existing.id }, data: { capacity: Math.max(1, t.capacity), calendarId: calId } });
    else await prisma.simulationTeam.create({ data: { name: t.name, projectId: id, capacity: Math.max(1, t.capacity), calendarId: calId } });
  }

  // Study + baseline scenario (reuse the run's study if present).
  let studyId = run.studyId ?? null;
  if (studyId) { const s = await prisma.simulationStudy.findFirst({ where: { id: studyId, projectId: id }, select: { id: true } }); if (!s) studyId = null; }
  if (!studyId) {
    const study = await prisma.simulationStudy.create({ data: { name: `${run.name} (mined twin)`, projectId: id, createdById: userId ?? null } });
    await prisma.simulationStudyRoot.create({ data: { studyId: study.id, diagramId: bpmnId } });
    const spanMs = stats.from && stats.to ? stats.to - stats.from : 0;
    const horizon = Math.max(1, Math.round(spanMs / MS_PER_UNIT[cal.clockUnit])) || 480;
    const runConfig = { clockUnit: cal.clockUnit, horizon, warmUp: 0, replications: 5, seed: 1, collectQueues: true };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.simulationScenario.create({ data: { name: "As-mined baseline", studyId: study.id, isBaseline: true, runConfig: runConfig as any } });
    studyId = study.id;
  }

  await prisma.processMiningRun.update({ where: { id: runId }, data: { discoveredBpmnId: bpmnId, studyId } });
  return NextResponse.json({ studyId, diagramId: bpmnId, teams: cal.teams.length }, { status: 200 });
}
