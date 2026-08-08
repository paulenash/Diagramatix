/**
 * GET /api/diagrams/:id/diff-runs — this diagram's saved Diff Processes runs
 * (as either side), reverse-chronological. Powers the "Diff Process Results"
 * button + list on the diagram's properties. Returns lightweight metadata only.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireDiagramAccess, OrgContextError } from "@/app/lib/auth/orgContext";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await requireDiagramAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const runs = await prisma.processDiffRun.findMany({
    where: { OR: [{ aDiagramId: id }, { bDiagramId: id }] },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, aName: true, bName: true, createdAt: true, aiSummary: true,
      createdBy: { select: { name: true, email: true } },
    },
  });
  return NextResponse.json({
    runs: runs.map((r) => ({
      id: r.id, aName: r.aName, bName: r.bName, createdAt: r.createdAt,
      hasAiSummary: !!r.aiSummary,
      author: r.createdBy?.name ?? r.createdBy?.email ?? null,
    })),
  });
}
