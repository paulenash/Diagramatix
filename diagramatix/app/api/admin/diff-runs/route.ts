/**
 * GET /api/admin/diff-runs — every saved Diff Processes run across all orgs, with
 * org + author info, for the SuperAdmin management screen (grouped by org → user
 * client-side). SuperAdmin only.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const runs = await prisma.processDiffRun.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, aName: true, bName: true, createdAt: true, aiSummary: true, orgId: true, createdById: true,
      org: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  return NextResponse.json({
    runs: runs.map((r) => ({
      id: r.id, aName: r.aName, bName: r.bName, createdAt: r.createdAt, hasAiSummary: !!r.aiSummary,
      orgId: r.orgId, orgName: r.org?.name ?? "(no org)",
      userId: r.createdById, userName: r.createdBy?.name ?? null, userEmail: r.createdBy?.email ?? null,
    })),
  });
}
