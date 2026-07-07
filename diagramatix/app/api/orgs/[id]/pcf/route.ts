import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/orgs/[id]/pcf
 * Frameworks visible to the org: the current global APQC reference frameworks
 * plus the org's own (imported reference or tailored). SuperAdmin OR Owner/Admin.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const frameworks = await prisma.pcfFramework.findMany({
    where: { OR: [{ orgId: null, kind: "reference", isCurrent: true }, { orgId: id }] },
    select: {
      id: true, name: true, variant: true, version: true, kind: true, division: true,
      attributionNote: true, _count: { select: { nodes: true } },
    },
    orderBy: [{ kind: "asc" }, { variant: "asc" }],
  });
  return NextResponse.json({ frameworks });
}
