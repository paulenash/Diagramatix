import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getEffectiveUserId } from "@/app/lib/superuser";
import { requireDiagramAccess, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

/** GET /api/diagrams/[id]/history — list snapshots for a diagram, newest first */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  // History is reachable by any access role (owner/edit/view): a viewer
  // can see what's changed. Archived-diagram path remains as a fallback
  // for diagrams that were archived out of the active view.
  let allowed = false;
  try {
    await requireDiagramAccess(session, await cookies(), id, "view");
    allowed = true;
  } catch (err) {
    if (err instanceof OrgContextError) {
      if (err.status === 404 || err.status === 403) {
        // Archive fallback: an archived diagram returns 403 from the new
        // helper (no project access, owner-side links via projectId may
        // be dropped). If it was originally owned by the caller, allow.
        let userId = session.user.id;
        try { userId = getEffectiveUserId(session, await cookies()); } catch { /* ignore */ }
        const archived = await prisma.diagram.findUnique({ where: { id } });
        if (archived) {
          const data = (archived.data as Record<string, unknown>) ?? {};
          const meta = (data._archive as Record<string, unknown>) ?? {};
          if (meta._archivedFromUserId === userId) allowed = true;
        }
        if (!allowed) {
          return NextResponse.json({ error: err.message }, { status: err.status });
        }
      } else {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
    } else {
      throw err;
    }
  }
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const history = await prisma.diagramHistory.findMany({
    where: { diagramId: id },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json(history);
}
