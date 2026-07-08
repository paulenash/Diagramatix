/**
 * Snapshot a (live) run to a new dated ProcessMiningRun, freezing its current
 * stats / variants / performance / governance / conformance so org Compliance
 * Monitoring gains a point-in-time history entry. The discovered/live diagrams
 * are NOT cloned (they stay with the live run); a snapshot is a data record.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string; runId: string }> };

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

  const run = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId: id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const snap = await prisma.processMiningRun.create({
    data: { name: `${run.name} — ${stamp}`, projectId: id, orgId, createdById: session?.user?.id ?? null, referenceSmId: run.referenceSmId },
  });
  await pgPool.query(
    'UPDATE "ProcessMiningRun" SET mapping = $1::jsonb, stats = $2::jsonb, variants = $3::jsonb, performance = $4::jsonb, governance = $5::jsonb, conformance = $6::jsonb, "updatedAt" = NOW() WHERE id = $7',
    [JSON.stringify(run.mapping), JSON.stringify(run.stats), JSON.stringify(run.variants), JSON.stringify(run.performance), JSON.stringify(run.governance ?? null), JSON.stringify(run.conformance ?? null), snap.id],
  );

  return NextResponse.json({ run: { id: snap.id, name: snap.name } }, { status: 201 });
}
