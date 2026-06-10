import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import {
  requireDiagramAccess,
  OrgContextError,
} from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

// GET /api/diagrams/[id]/published — the latest non-superseded
// PublishedVersion for the diagram. Used by the published-version banner
// in the editor and (in Phase 3) by the business-user viewer.
//
// Returns 404 if the diagram has never been published.
//
// Phase 1 access: view-level on the diagram (project owner / EDIT / VIEW
// share). The business-user grant path lands in Phase 3.
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await requireDiagramAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const diagram = await prisma.diagram.findUnique({
    where: { id },
    select: { currentPublishedVersionId: true },
  });
  if (!diagram?.currentPublishedVersionId) {
    return NextResponse.json({ error: "No published version" }, { status: 404 });
  }

  const version = await prisma.publishedVersion.findUnique({
    where: { id: diagram.currentPublishedVersionId },
    include: {
      publishedBy: { select: { id: true, name: true, email: true } },
    },
  });
  return NextResponse.json(version);
}
