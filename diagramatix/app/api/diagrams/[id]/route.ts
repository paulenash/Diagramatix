import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getEffectiveUserId, isReadOnlyImpersonation } from "@/app/lib/superuser";
import { isAssignedReviewer } from "@/app/lib/reviewProjects";
import {
  getCurrentOrgId,
  requireRole,
  WRITE_ROLES,
  OrgContextError,
} from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

async function getAuthorizedDiagram(id: string, userId: string, orgId: string) {
  return prisma.diagram.findFirst({ where: { id, userId, orgId } });
}

async function checkImpersonating(session: Parameters<typeof isReadOnlyImpersonation>[0]) {
  try {
    return isReadOnlyImpersonation(session, await cookies());
  } catch {
    return false;
  }
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let userId = session.user.id;
  try { userId = getEffectiveUserId(session, await cookies()); } catch { /* fallback */ }

  let orgId: string;
  try {
    orgId = await getCurrentOrgId(session, await cookies());
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await params;
  let diagram = await getAuthorizedDiagram(id, userId, orgId);
  // Review Mode (Phase 3): assigned reviewers may read a diagram they
  // don't own.
  if (!diagram && await isAssignedReviewer(session.user.id, id)) {
    diagram = await prisma.diagram.findUnique({ where: { id } });
  }
  if (!diagram) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(diagram);
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (await checkImpersonating(session)) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }

  let orgId: string;
  try {
    ({ orgId } = await requireRole(session, await cookies(), WRITE_ROLES));
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await params;
  let existing = await getAuthorizedDiagram(id, session.user.id, orgId);

  // Review Mode (Phase 3): an assigned reviewer may save to a diagram
  // they don't own. Their write is restricted to the `data` field below
  // (comments round-trip through the diagram JSON) — they can't rename,
  // re-project, or restyle the owner's diagram.
  let reviewerAccess = false;
  if (!existing && await isAssignedReviewer(session.user.id, id)) {
    existing = await prisma.diagram.findUnique({ where: { id } });
    reviewerAccess = !!existing;
  }
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { data } = body;
  // Owner-only mutable fields — ignored for reviewer saves.
  const name = reviewerAccess ? undefined : body.name;
  const projectId = reviewerAccess ? undefined : body.projectId;
  const colorConfig = reviewerAccess ? undefined : body.colorConfig;
  const displayMode = reviewerAccess ? undefined : body.displayMode;

  // Validate project ownership AND org match if non-null projectId supplied
  if (projectId !== undefined && projectId !== null) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: session.user.id, orgId },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }

  try {
    if (name !== undefined || data !== undefined || projectId !== undefined || colorConfig !== undefined || displayMode !== undefined) {
      await prisma.diagram.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(data !== undefined && { data: data as any }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(colorConfig !== undefined && { colorConfig: colorConfig as any }),
          ...(projectId !== undefined && { projectId }),
          ...(displayMode !== undefined && { displayMode }),
        },
      });

      // Auto-snapshot: create history entry on every data-changing save
      if (data !== undefined) {
        const current = await prisma.diagram.findUnique({ where: { id } });
        if (current) {
          const snapshot = {
            name: current.name,
            type: current.type,
            data: current.data,
            colorConfig: current.colorConfig,
            displayMode: current.displayMode,
          };
          await prisma.diagramHistory.create({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: { diagramId: id, snapshot: snapshot as any, userId: session.user.id },
          });
          // Auto-prune: keep only the most recent 50 entries
          const all = await prisma.diagramHistory.findMany({
            where: { diagramId: id },
            select: { id: true, createdAt: true },
            orderBy: { createdAt: "desc" },
          });
          if (all.length > 50) {
            const toDelete = all.slice(50).map(h => h.id);
            await prisma.diagramHistory.deleteMany({ where: { id: { in: toDelete } } });
          }
        }
      }
    }

    const updated = await prisma.diagram.findFirst({ where: { id } });
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PUT /api/diagrams] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (await checkImpersonating(session)) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }

  let orgId: string;
  try {
    ({ orgId } = await requireRole(session, await cookies(), WRITE_ROLES));
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await params;
  const existing = await getAuthorizedDiagram(id, session.user.id, orgId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.diagram.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
