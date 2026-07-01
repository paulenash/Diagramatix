/**
 * A single SimulationRun in the Run History.
 *  PATCH  — name / pin (or clear). Naming a run pins it so pruning keeps it.
 *  DELETE — remove a saved run from the history.
 * Both require edit access and verify the run → scenario → study → project chain.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string; studyId: string; scenarioId: string; runId: string }> };

/** Verify the run belongs to this scenario → study → project. */
async function ownRun(runId: string, scenarioId: string, studyId: string, projectId: string) {
  const run = await prisma.simulationRun.findUnique({
    where: { id: runId },
    include: { scenario: { include: { study: { select: { id: true, projectId: true } } } } },
  });
  if (!run || run.scenarioId !== scenarioId || run.scenario.studyId !== studyId || run.scenario.study.projectId !== projectId) return null;
  return run;
}

async function guard(projectId: string) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return { error: NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 }) };
  }
  try {
    await requireProjectAccess(session, await cookies(), projectId, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return { error: NextResponse.json({ error: err.message }, { status: err.status }) };
    throw err;
  }
  return {};
}

export async function PATCH(req: Request, { params }: Params) {
  const { id, studyId, scenarioId, runId } = await params;
  const g = await guard(id);
  if (g.error) return g.error;
  if (!(await ownRun(runId, scenarioId, studyId, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: { name?: string | null; pinned?: boolean } = {};
  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    data.name = name || null;
    data.pinned = !!name; // naming keeps it; clearing the name unpins it
  }
  if ("pinned" in body && typeof body.pinned === "boolean") data.pinned = body.pinned;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const run = await prisma.simulationRun.update({
    where: { id: runId }, data,
    select: { id: true, name: true, pinned: true, startedAt: true, finishedAt: true },
  });
  return NextResponse.json({ run });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id, studyId, scenarioId, runId } = await params;
  const g = await guard(id);
  if (g.error) return g.error;
  if (!(await ownRun(runId, scenarioId, studyId, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.simulationRun.delete({ where: { id: runId } });
  return NextResponse.json({ ok: true });
}
