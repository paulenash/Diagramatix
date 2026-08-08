/**
 * GET /api/org-admin/diff-runs — every saved Diff Processes run in the caller's
 * org, with author info, for the OrgAdmin management screen (grouped by user
 * client-side). OrgAdmin (Owner/Admin) or SuperAdmin.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireRole, OrgContextError } from "@/app/lib/auth/orgContext";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let orgId: string;
  try {
    ({ orgId } = await requireRole(session, await cookies(), ["Owner", "Admin"]));
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const runs = await prisma.processDiffRun.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, aName: true, bName: true, createdAt: true, aiSummary: true, createdById: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  return NextResponse.json({
    runs: runs.map((r) => ({
      id: r.id, aName: r.aName, bName: r.bName, createdAt: r.createdAt, hasAiSummary: !!r.aiSummary,
      userId: r.createdById, userName: r.createdBy?.name ?? null, userEmail: r.createdBy?.email ?? null,
    })),
  });
}
