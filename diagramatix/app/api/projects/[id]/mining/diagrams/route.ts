/**
 * GET /api/projects/:id/mining/diagrams → the project's BPMN + state-machine
 * diagrams (id, name, type), for the import-time enrichment pickers (fill teams
 * from a Process Diagram / states from a State Machine). Project view access.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const diagrams = await prisma.diagram.findMany({
    where: { projectId: id, type: { in: ["bpmn", "state-machine"] } },
    select: { id: true, name: true, type: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ diagrams });
}
