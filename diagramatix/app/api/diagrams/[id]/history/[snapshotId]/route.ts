import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getEffectiveUserId, isImpersonating } from "@/app/lib/superuser";
import { getCurrentOrgId, requireRole, WRITE_ROLES, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string; snapshotId: string }> };

/** GET /api/diagrams/[id]/history/[snapshotId] — fetch a single snapshot's full data */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let userId = session.user.id;
  try { userId = getEffectiveUserId(session, await cookies()); } catch { /* ignore */ }

  let orgId: string;
  try { orgId = await getCurrentOrgId(session, await cookies()); }
  catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { id, snapshotId } = await params;
  let diagram = await prisma.diagram.findFirst({ where: { id, userId, orgId } });
  if (!diagram) {
    // Archived-diagram path: allow if the original owner was this user
    const archived = await prisma.diagram.findUnique({ where: { id } });
    if (archived) {
      const data = (archived.data as Record<string, unknown>) ?? {};
      const meta = (data._archive as Record<string, unknown>) ?? {};
      if (meta._archivedFromUserId === userId) diagram = archived;
    }
  }
  if (!diagram) return NextResponse.json({ error: "Diagram not found" }, { status: 404 });

  const snap = await prisma.diagramHistory.findFirst({ where: { id: snapshotId, diagramId: id } });
  if (!snap) return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });

  return NextResponse.json(snap);
}

/** POST /api/diagrams/[id]/history/[snapshotId] — restore a snapshot (replace current diagram) */
export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const impersonating = await (async () => { try { return isImpersonating(session, await cookies()); } catch { return false; } })();
    if (impersonating) return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  } catch { /* ignore */ }

  let orgId: string;
  try { ({ orgId } = await requireRole(session, await cookies(), WRITE_ROLES)); }
  catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { id, snapshotId } = await params;
  const diagram = await prisma.diagram.findFirst({ where: { id, userId: session.user.id, orgId } });
  if (!diagram) return NextResponse.json({ error: "Diagram not found" }, { status: 404 });

  const snap = await prisma.diagramHistory.findFirst({ where: { id: snapshotId, diagramId: id } });
  if (!snap) return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });

  const s = snap.snapshot as { name?: string; type?: string; data?: unknown; colorConfig?: unknown; displayMode?: string };

  // Before restoring, save the CURRENT state as a history entry too (so restore is reversible)
  const currentSnap = {
    name: diagram.name,
    type: diagram.type,
    data: diagram.data,
    colorConfig: diagram.colorConfig,
    displayMode: diagram.displayMode,
  };
  await prisma.diagramHistory.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { diagramId: id, snapshot: currentSnap as any, userId: session.user.id },
  });

  await prisma.diagram.update({
    where: { id },
    data: {
      ...(s.name !== undefined && { name: s.name }),
      ...(s.type !== undefined && { type: s.type }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(s.data !== undefined && { data: s.data as any }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(s.colorConfig !== undefined && { colorConfig: s.colorConfig as any }),
      ...(s.displayMode !== undefined && { displayMode: s.displayMode }),
    },
  });

  const updated = await prisma.diagram.findUnique({ where: { id } });
  return NextResponse.json(updated);
}
