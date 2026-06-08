import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getEffectiveUserId, isReadOnlyImpersonation, isSuperuser } from "@/app/lib/superuser";
import { archiveDiagram } from "@/app/lib/archive";
import {
  requireRole,
  requireProjectAccess,
  OrgContextError,
  type OrgRole,
} from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

/** Safely check if impersonating — returns false if cookies() fails */
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

  // requireProjectAccess collapses owner-or-shared into a single check.
  // 'view' is the floor — owners and editors satisfy it too.
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const project = await prisma.project.findUnique({
    where: { id },
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

  const { id } = await params;
  // Owner-only — project name/description/typography are owner-level
  // changes. Editor-level project-share users get write access to the
  // diagrams inside the project, not the project's own properties.
  try {
    await requireProjectAccess(session, await cookies(), id, "owner");
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, colorConfig, fontConfig, description, ownerName, folderTree } = body;

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
    if (fontConfig !== undefined) {
      await prisma.$executeRawUnsafe(
        'UPDATE "Project" SET "fontConfig" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2',
        JSON.stringify(fontConfig),
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
  const su = isSuperuser(session);

  const { id } = await params;

  // Three-tier delete model (Paul's spec, 2026-06-08):
  //   x   — default — diagrams → Unorganised. Allowed for project Owner
  //         OR OrgAdmin (Owner/Admin in the project's Org) OR SuperAdmin.
  //   x+  — ?cascade=archive — diagrams → system Archive. OrgAdmin only.
  //   x++ — ?hardDelete=true — hard delete project + every diagram.
  //         SuperAdmin AND project Owner only.
  //
  // requireProjectAccess gives us the project's orgId + the caller's
  // resolved project role. We then layer the tier-specific role checks
  // on top. Editor-share users still cannot delete via any tier — the
  // floor of "view" only confirms they belong somewhere, the tier
  // gates do the real authorisation.
  let projectOrgId: string;
  let projectRole: "owner" | "edit" | "view";
  try {
    const access = await requireProjectAccess(session, await cookies(), id, "view");
    projectOrgId = access.projectOrgId;
    projectRole = access.role;
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  const isProjectOwner = projectRole === "owner";

  if (hardDelete) {
    // x++ — SuperAdmin AND project Owner. The SuperAdmin must own the
    // project they're nuking; we deliberately don't let SuperAdmin
    // hard-delete OTHER people's projects from this surface.
    if (!su || !isProjectOwner) {
      return NextResponse.json(
        { error: "Hard delete requires SuperAdmin who owns the project" },
        { status: 403 },
      );
    }
  } else if (cascade === "archive") {
    // x+ — OrgAdmin (any project in the Org). SuperAdmin who isn't also
    // an OrgAdmin does not see this option in the UI; the server check
    // mirrors that.
    const allowedRoles: OrgRole[] = ["Owner", "Admin"];
    try {
      await requireRole(session, await cookies(), allowedRoles);
    } catch (err) {
      if (err instanceof OrgContextError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  } else {
    // x — project Owner OR OrgAdmin OR SuperAdmin.
    if (!isProjectOwner && !su) {
      const allowedRoles: OrgRole[] = ["Owner", "Admin"];
      try {
        await requireRole(session, await cookies(), allowedRoles);
      } catch (err) {
        if (err instanceof OrgContextError) {
          return NextResponse.json({ error: err.message }, { status: err.status });
        }
        throw err;
      }
    }
  }

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const orgId = projectOrgId;

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
