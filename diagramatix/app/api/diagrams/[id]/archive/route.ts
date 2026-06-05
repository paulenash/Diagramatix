import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { archiveDiagram } from "@/app/lib/archive";
import { requireDiagramAccess, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

/** POST — archive (soft-delete) a diagram */
export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  // Owner-only — archive is a destructive (recoverable, but still removes
  // the diagram from active view) action. Editors can't archive.
  try {
    await requireDiagramAccess(session, await cookies(), id, "owner");
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const diagram = await prisma.diagram.findUnique({
    where: { id },
    include: { project: { select: { name: true } } },
  });
  if (!diagram) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await archiveDiagram(
      id,
      session.user.id,
      session.user.email ?? "",
      diagram.projectId,
      diagram.project?.name ?? null,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/diagrams/archive] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
