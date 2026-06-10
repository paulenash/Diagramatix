import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import {
  requireDiagramAccess,
  OrgContextError,
} from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string; v: string }> };

// GET /api/diagrams/[id]/versions/[v] — fetch a single PublishedVersion's
// frozen snapshot by version number. Used for the rollback-preview UI
// and (in Phase 3) for serving the published canvas to business users.
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, v } = await params;

  try {
    await requireDiagramAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const versionNumber = Number.parseInt(v, 10);
  if (!Number.isFinite(versionNumber) || versionNumber < 1) {
    return NextResponse.json({ error: "Invalid version number" }, { status: 400 });
  }

  const version = await prisma.publishedVersion.findUnique({
    where: { diagramId_versionNumber: { diagramId: id, versionNumber } },
    include: {
      publishedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!version) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }
  return NextResponse.json(version);
}
