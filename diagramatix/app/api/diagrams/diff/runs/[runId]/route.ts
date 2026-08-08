/**
 * A single saved Diff Processes run.
 *   GET    — full snapshot (result + aiSummary) to re-display the run.
 *   PATCH  — attach/replace the AI summary (aiSummary/aiModel).
 *   DELETE — remove the run.
 * View = the run's creator, a SuperAdmin, or anyone with access to either
 * diagram. Delete = creator or SuperAdmin (OrgAdmin management is a separate
 * admin surface).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireDiagramAccess } from "@/app/lib/auth/orgContext";
import { isSuperuser } from "@/app/lib/superuser";

type Sess = Parameters<typeof requireDiagramAccess>[0];

async function canView(session: Sess, run: { createdById: string | null; aDiagramId: string | null; bDiagramId: string | null }): Promise<boolean> {
  if (!session?.user?.id) return false;
  if (run.createdById === session.user.id || isSuperuser(session)) return true;
  const jar = await cookies();
  for (const did of [run.aDiagramId, run.bDiagramId]) {
    if (!did) continue;
    try { await requireDiagramAccess(session, jar, did, "view"); return true; } catch { /* try the other */ }
  }
  return false;
}

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const run = await prisma.processDiffRun.findUnique({ where: { id: runId } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canView(session, run))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({
    id: run.id, aName: run.aName, bName: run.bName, createdAt: run.createdAt,
    aDiagramId: run.aDiagramId, bDiagramId: run.bDiagramId,
    result: run.result, aiSummary: run.aiSummary, aiModel: run.aiModel,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const run = await prisma.processDiffRun.findUnique({ where: { id: runId }, select: { createdById: true, aDiagramId: true, bDiagramId: true } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canView(session, run))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const aiSummary = typeof body.aiSummary === "string" ? body.aiSummary : undefined;
  const aiModel = typeof body.aiModel === "string" ? body.aiModel : undefined;
  await prisma.processDiffRun.update({
    where: { id: runId },
    data: { ...(aiSummary !== undefined ? { aiSummary } : {}), ...(aiModel !== undefined ? { aiModel } : {}) },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const run = await prisma.processDiffRun.findUnique({ where: { id: runId }, select: { createdById: true } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (run.createdById !== session.user.id && !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.processDiffRun.delete({ where: { id: runId } });
  return NextResponse.json({ ok: true });
}
