/**
 * GET  — one run in full (incl. variants + performance), for the console.
 * PATCH — toggle whether the run feeds org Compliance Monitoring (exclude a
 *          throwaway/test run). Project edit access.
 * DELETE — remove a run (the discovered diagrams are ordinary diagrams and are
 *          left intact).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string; runId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id, runId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const run = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId: id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ run });
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, runId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const existing = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId: id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body?.excludeFromCompliance === "boolean") data.excludeFromCompliance = body.excludeFromCompliance;
  // Persist the chosen conformance reference so selecting one survives navigating
  // away to edit it (and back) — not just after a conformance run.
  if ("referenceSmId" in (body ?? {})) data.referenceSmId = typeof body.referenceSmId === "string" && body.referenceSmId ? body.referenceSmId : null;
  // KPI/SLA outcome config is a JSON column — Prisma 7 omits JSON writes, so use raw SQL.
  const hasKpi = "kpiConfig" in (body ?? {});
  if (Object.keys(data).length === 0 && !hasKpi) {
    return NextResponse.json({ error: "Nothing to update (excludeFromCompliance, referenceSmId or kpiConfig)" }, { status: 400 });
  }
  if (Object.keys(data).length > 0) await prisma.processMiningRun.update({ where: { id: runId }, data });
  if (hasKpi) {
    const kpi = body.kpiConfig && typeof body.kpiConfig === "object" ? body.kpiConfig : null;
    await pgPool.query('UPDATE "ProcessMiningRun" SET "kpiConfig" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2', [JSON.stringify(kpi), runId]);
  }
  return NextResponse.json({ ok: true, id: runId, ...data });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, runId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const existing = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId: id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.processMiningRun.delete({ where: { id: runId } });
  return NextResponse.json({ ok: true });
}
