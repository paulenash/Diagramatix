import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import {
  requireDiagramAccess,
  OrgContextError,
} from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

// GET /api/diagrams/[id]/versions — list of all PublishedVersions for the
// diagram, newest first. Used by the editor's "Version history" panel.
//
// Returns metadata only — no `data` / `colorConfig` payload. Callers that
// need the snapshot fetch /versions/[v] individually.
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

  const versions = await prisma.publishedVersion.findMany({
    where: { diagramId: id },
    select: {
      id: true,
      versionNumber: true,
      publishedAt: true,
      releaseNotes: true,
      supersededAt: true,
      nextReviewDateAtPublish: true,
      publishedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { versionNumber: "desc" },
  });

  return NextResponse.json({ versions });
}
