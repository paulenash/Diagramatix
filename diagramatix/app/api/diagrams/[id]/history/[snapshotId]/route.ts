import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getEffectiveUserId, isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireDiagramAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { restoreDiagramSnapshot, PublishError } from "@/app/lib/diagram/publishVersion";

type Params = { params: Promise<{ id: string; snapshotId: string }> };

/** GET /api/diagrams/[id]/history/[snapshotId] — fetch a single snapshot's full data */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, snapshotId } = await params;
  // View is enough — peeking at an old snapshot is a read.
  let allowed = false;
  try {
    await requireDiagramAccess(session, await cookies(), id, "view");
    allowed = true;
  } catch (err) {
    if (err instanceof OrgContextError) {
      if (err.status === 404 || err.status === 403) {
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
  if (!allowed) return NextResponse.json({ error: "Diagram not found" }, { status: 404 });

  const snap = await prisma.diagramHistory.findFirst({ where: { id: snapshotId, diagramId: id } });
  if (!snap) return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });

  return NextResponse.json(snap);
}

/** POST /api/diagrams/[id]/history/[snapshotId] — restore a snapshot (replace current diagram) */
export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const impersonating = await (async () => { try { return isReadOnlyImpersonation(session, await cookies()); } catch { return false; } })();
    if (impersonating) return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  } catch { /* ignore */ }

  const { id, snapshotId } = await params;
  // Owner-only — a restore overwrites the current diagram with a past
  // snapshot, which is structurally a destructive replace.
  try {
    await requireDiagramAccess(session, await cookies(), id, "owner");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  try {
    const updated = await restoreDiagramSnapshot(id, snapshotId, session.user.id);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof PublishError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
