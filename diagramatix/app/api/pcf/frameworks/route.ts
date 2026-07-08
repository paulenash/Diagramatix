import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";

/**
 * GET /api/pcf/frameworks
 * Frameworks visible to the caller's current org (global APQC reference +
 * the org's own reference-imports / tailored). Used by the dashboard
 * "Create APQC Project" dialog, which runs before any project exists.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = await tryGetCurrentOrgId(session, await cookies());
  const frameworks = await prisma.pcfFramework.findMany({
    where: { OR: [{ orgId: null, kind: "reference", isCurrent: true }, ...(orgId ? [{ orgId }] : [])] },
    select: { id: true, name: true, variant: true, version: true, kind: true, division: true },
    orderBy: [{ kind: "asc" }, { variant: "asc" }],
  });
  return NextResponse.json({ frameworks });
}
