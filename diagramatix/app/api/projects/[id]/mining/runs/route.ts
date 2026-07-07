/**
 * GET /api/projects/[id]/mining/runs — the project's process-mining runs
 * (lightweight: no variants payload), newest first.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const runs = await prisma.processMiningRun.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, stats: true, mapping: true,
      discoveredBpmnId: true, discoveredSmId: true, referenceSmId: true,
      conformance: true, studyId: true, createdAt: true, excludeFromCompliance: true,
    },
  });
  return NextResponse.json({ runs });
}
