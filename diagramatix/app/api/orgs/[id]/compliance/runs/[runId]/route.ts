import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string; runId: string }> };

/**
 * PATCH /api/orgs/[id]/compliance/runs/[runId]  { exclude: boolean }
 * Include or exclude one mining run from this org's Compliance Monitoring
 * aggregation (a throwaway/test run shouldn't pollute the effectiveness trend).
 * SuperAdmin OR Owner/Admin in this org; the run must belong to the org.
 */
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  const { id, runId } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const run = await prisma.processMiningRun.findFirst({ where: { id: runId, project: { orgId: id } }, select: { id: true } });
  if (!run) return NextResponse.json({ error: "Run not found in this org" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const exclude = !!body?.exclude;
  await prisma.processMiningRun.update({ where: { id: runId }, data: { excludeFromCompliance: exclude } });
  return NextResponse.json({ ok: true, id: runId, excluded: exclude });
}
