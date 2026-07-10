import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { isAssignedReviewer } from "@/app/lib/reviewProjects";
import {
  requireDiagramAccess,
  requireProjectAccess,
  OrgContextError,
} from "@/app/lib/auth/orgContext";
import { deriveDiagramDenorm } from "@/app/lib/diagram/denorm";

type Params = { params: Promise<{ id: string }> };

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

  const { id } = await params;

  // View access satisfies GET. requireDiagramAccess handles:
  //   • shared-project access (view/edit/owner all qualify),
  //   • the legacy orphan-diagram path (caller is the original userId), and
  //   • the cross-org gate.
  // Reviewer access is the one path it doesn't cover — assigned reviewers
  // may read a diagram they have no project access to.
  let allowed = false;
  try {
    await requireDiagramAccess(session, await cookies(), id, "view");
    allowed = true;
  } catch (err) {
    if (err instanceof OrgContextError) {
      if (err.status === 404) {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      if (err.status === 403 && (await isAssignedReviewer(session.user.id, id))) {
        allowed = true;
      } else {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
    } else {
      throw err;
    }
  }
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const diagram = await prisma.diagram.findUnique({ where: { id } });
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

  const { id } = await params;
  const body = await req.json();
  const { data } = body;

  // Three write paths converge here, in order of precedence:
  //   1. Reviewer save — assigned reviewers can write `data` only
  //      (comments round-trip through diagram JSON). They can't rename,
  //      re-project, restyle, or reassign owner.
  //   2. Editor share — `data`, `name`, `colorConfig`, `displayMode`. NOT
  //      `projectId` (a move means changing access scope, owner-only) or
  //      `diagramOwnerId` (accountability change, owner-only).
  //   3. Project owner — everything.
  // Determine which path applies, then validate the body against it.
  let role: "owner" | "edit" | "view" | "reviewer" | null = null;
  let existing: { projectId: string | null; userId: string; orgId: string } | null = null;
  try {
    const access = await requireDiagramAccess(session, await cookies(), id, "edit");
    role = access.role === "owner" ? "owner" : "edit";
    existing = access.diagram;
  } catch (err) {
    if (err instanceof OrgContextError) {
      if (err.status === 404) {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      // Try the reviewer path before giving up. Same access model we had
      // before sharing landed — kept untouched.
      if (err.status === 403 && (await isAssignedReviewer(session.user.id, id))) {
        existing = await prisma.diagram.findUnique({
          where: { id },
          select: { projectId: true, userId: true, orgId: true },
        });
        role = existing ? "reviewer" : null;
      } else {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
    } else {
      throw err;
    }
  }
  if (!role || !existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Per-role write whitelist. Strip everything the caller isn't allowed
  // to set BEFORE building the Prisma update — defence-in-depth even if
  // the client misbehaves.
  const reviewerAccess = role === "reviewer";
  const isOwner = role === "owner";
  const name = reviewerAccess ? undefined : body.name;
  const projectId = isOwner ? body.projectId : undefined;
  const diagramOwnerId = isOwner ? body.diagramOwnerId : undefined;
  const colorConfig = reviewerAccess ? undefined : body.colorConfig;
  const displayMode = reviewerAccess ? undefined : body.displayMode;

  // If the owner is moving the diagram into another project, verify they
  // also own that target project — otherwise a malicious or buggy client
  // could "park" a diagram inside someone else's project.
  if (projectId !== undefined && projectId !== null) {
    try {
      await requireProjectAccess(session, await cookies(), projectId, "owner");
    } catch (err) {
      if (err instanceof OrgContextError) {
        return NextResponse.json({ error: err.message }, { status: err.status === 403 ? 403 : 404 });
      }
      throw err;
    }
  }

  try {
    if (
      name !== undefined ||
      data !== undefined ||
      projectId !== undefined ||
      diagramOwnerId !== undefined ||
      colorConfig !== undefined ||
      displayMode !== undefined
    ) {
      await prisma.diagram.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(data !== undefined && { data: data as any }),
          // Keep the Portal's browse/governance columns in step with the
          // diagram's classification + procedure-doc link + entity refs on
          // every data save (entityRefs is a JSON column — hence the cast).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(data !== undefined && (deriveDiagramDenorm(data) as any)),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(colorConfig !== undefined && { colorConfig: colorConfig as any }),
          ...(projectId !== undefined && { projectId }),
          ...(diagramOwnerId !== undefined && { diagramOwnerId }),
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

  const { id } = await params;
  // Owner-only. Editor share-users cannot delete diagrams — that's a
  // hard rule of the share model: shares are about safe collaboration,
  // destructive actions stay with the project owner.
  try {
    await requireDiagramAccess(session, await cookies(), id, "owner");
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  await prisma.diagram.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
