import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getEffectiveUserId, isImpersonating } from "@/app/lib/superuser";
import { archiveDiagram } from "@/app/lib/archive";
import {
  getCurrentOrgId,
  requireRole,
  WRITE_ROLES,
  OrgContextError,
  type OrgRole,
} from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

async function getAuthorizedProject(id: string, userId: string, orgId: string) {
  return prisma.project.findFirst({ where: { id, userId, orgId } });
}

/** Safely check if impersonating — returns false if cookies() fails */
async function checkImpersonating(session: Parameters<typeof isImpersonating>[0]) {
  try {
    return isImpersonating(session, await cookies());
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
  const project = await prisma.project.findFirst({
    where: { id, userId, orgId },
    include: {
      diagrams: {
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, type: true, createdAt: true, updatedAt: true, data: true },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(project);
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
  const existing = await getAuthorizedProject(id, session.user.id, orgId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, colorConfig, description, ownerName, folderTree } = body;

  if (name !== undefined && !name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    const dataUpdate: Record<string, string> = {};
    if (name !== undefined) dataUpdate.name = name.trim();
    if (description !== undefined) dataUpdate.description = description;
    if (ownerName !== undefined) dataUpdate.ownerName = ownerName;
    if (Object.keys(dataUpdate).length > 0) {
      await prisma.project.update({ where: { id }, data: dataUpdate });
    }
    if (colorConfig !== undefined) {
      await prisma.$executeRawUnsafe(
        'UPDATE "Project" SET "colorConfig" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2',
        JSON.stringify(colorConfig),
        id
      );
    }
    if (folderTree !== undefined) {
      await prisma.$executeRawUnsafe(
        'UPDATE "Project" SET "folderTree" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2',
        JSON.stringify(folderTree),
        id
      );
    }
    const updated = await prisma.project.findFirst({ where: { id } });
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PUT /api/projects] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (await checkImpersonating(session)) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const cascade = searchParams.get("cascade");
  const hardDelete = searchParams.get("hardDelete") === "true";

  // Hard-delete requires the strictest role gate — Owner or Admin only.
  // Anything else (cascade=archive or default orphan-on-delete) keeps the
  // existing WRITE_ROLES gate.
  const allowedRoles: OrgRole[] = hardDelete ? ["Owner", "Admin"] : WRITE_ROLES;
  let orgId: string;
  try {
    ({ orgId } = await requireRole(session, await cookies(), allowedRoles));
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await params;
  const existing = await getAuthorizedProject(id, session.user.id, orgId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ?hardDelete=true → admin-only destructive path. Permanently deletes
  // every diagram in the project (NOT archived — gone forever) and then
  // the project itself. DiagramHistory rows cascade-delete via the
  // Prisma onDelete: Cascade on DiagramHistory.diagram. Wrapped in a
  // transaction so partial failures leave nothing behind.
  if (hardDelete) {
    const result = await prisma.$transaction(async (tx) => {
      const purged = await tx.diagram.deleteMany({ where: { projectId: id, orgId } });
      await tx.project.delete({ where: { id } });
      return { purged: purged.count };
    });
    return NextResponse.json({ success: true, hardDeleted: true, purged: result.purged });
  }

  // ?cascade=archive → move every diagram in this project into the system
  // archive (recoverable from /dashboard/deleted-diagrams) BEFORE deleting
  // the project row. Default behaviour (no query param) leaves diagrams
  // orphaned, preserving the existing "move to Unorganised" semantics.
  let archived = 0;
  if (cascade === "archive") {
    const userEmail = session.user.email ?? "";
    const diagrams = await prisma.diagram.findMany({
      where: { projectId: id, orgId },
      select: { id: true },
    });
    for (const d of diagrams) {
      try {
        await archiveDiagram(d.id, session.user.id, userEmail, id, existing.name);
        archived++;
      } catch {
        // If a single diagram fails to archive, skip it and continue.
      }
    }
  }

  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ success: true, archived });
}
