import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/pcf
 * The PCF frameworks a diagram in this project can be classified against: the
 * current global APQC reference frameworks + the project's org's tailored ones.
 * View access — the picker is read-only; the classification is saved with the diagram.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  let projectOrgId: string;
  try {
    ({ projectOrgId } = await requireProjectAccess(session, await cookies(), id, "view"));
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const frameworks = await prisma.pcfFramework.findMany({
    where: { OR: [{ orgId: null, kind: "reference", isCurrent: true }, { orgId: projectOrgId }] },
    select: { id: true, name: true, variant: true, version: true, kind: true, division: true },
    orderBy: [{ kind: "asc" }, { variant: "asc" }],
  });
  return NextResponse.json({ frameworks });
}
