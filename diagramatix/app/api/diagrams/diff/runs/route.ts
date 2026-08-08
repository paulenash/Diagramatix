/**
 * POST /api/diagrams/diff/runs — save a Diff Processes run.
 * Recomputes the diff server-side from the two diagrams (authoritative) and
 * stores the full ProcessDiff snapshot + optional AI summary, so it later
 * re-displays exactly as first produced. aId = "before", bId = "after".
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireDiagramAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import type { DiagramData } from "@/app/lib/diagram/types";
import { diffProcesses } from "@/app/lib/diagram/diff/processDiff";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const aId = typeof body.aId === "string" ? body.aId : "";
  const bId = typeof body.bId === "string" ? body.bId : "";
  const aiSummary = typeof body.aiSummary === "string" && body.aiSummary.trim() ? body.aiSummary : null;
  const aiModel = typeof body.aiModel === "string" ? body.aiModel : null;
  if (!aId || !bId) return NextResponse.json({ error: "aId and bId are required" }, { status: 400 });

  let a, b;
  try {
    const jar = await cookies();
    await requireDiagramAccess(session, jar, aId, "view");
    await requireDiagramAccess(session, jar, bId, "view");
    a = await prisma.diagram.findUnique({ where: { id: aId }, select: { id: true, name: true, data: true, orgId: true } });
    b = await prisma.diagram.findUnique({ where: { id: bId }, select: { id: true, name: true, data: true } });
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!a || !b) return NextResponse.json({ error: "Diagram not found" }, { status: 404 });

  const diff = diffProcesses(
    (a.data ?? { elements: [], connectors: [] }) as unknown as DiagramData, a.name,
    (b.data ?? { elements: [], connectors: [] }) as unknown as DiagramData, b.name,
  );

  const run = await prisma.processDiffRun.create({
    data: {
      orgId: a.orgId ?? null,
      createdById: session.user.id,
      aDiagramId: a.id, bDiagramId: b.id,
      aName: a.name, bName: b.name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result: diff as any,
      aiSummary, aiModel,
    },
    select: { id: true },
  });
  return NextResponse.json({ id: run.id });
}
