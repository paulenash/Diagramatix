import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string; frameworkId: string }> };

/**
 * GET /api/orgs/[id]/pcf/[frameworkId]
 * One framework + its full node tree (flat, ordered). The framework must be a
 * global reference or belong to this org. SuperAdmin OR Owner/Admin.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id, frameworkId } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const framework = await prisma.pcfFramework.findFirst({
    where: { id: frameworkId, OR: [{ orgId: null }, { orgId: id }] },
    select: { id: true, name: true, variant: true, version: true, kind: true, division: true, attributionNote: true },
  });
  if (!framework) return NextResponse.json({ error: "Framework not found" }, { status: 404 });
  const nodes = await prisma.pcfNode.findMany({
    where: { frameworkId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, pcfId: true, hierarchyId: true, name: true, description: true, level: true, parentId: true, changeType: true, metricsAvailable: true, active: true, isCustom: true, orgCode: true },
  });
  return NextResponse.json({ framework, nodes });
}
