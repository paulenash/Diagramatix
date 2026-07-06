import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getEffectiveUserId, isReadOnlyImpersonation, isSuperuser } from "@/app/lib/superuser";
import { deleteProjectCascade, authorizeProjectDelete, type ProjectDeleteMode } from "@/app/lib/projects/deleteProject";
import {
  requireRole,
  requireProjectAccess,
  OrgContextError,
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
  const { name, colorConfig, fontConfig, description, ownerName, folderTree, orgId } = body;

  if (name !== undefined && !name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  // Reassigning a project's owning Org (the "Org Owner", which drives org-wide RCM
  // numbering) is SuperAdmin-only — the owner/OrgAdmin edits everything else.
  if (orgId !== undefined && orgId !== existing.orgId) {
    if (!isSuperuser(session)) {
      return NextResponse.json({ error: "Only a SuperAdmin can change a project's Org Owner" }, { status: 403 });
    }
    const org = await prisma.org.findUnique({ where: { id: orgId }, select: { id: true } });
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 400 });
  }

  try {
    const dataUpdate: Record<string, string> = {};
    if (name !== undefined) dataUpdate.name = name.trim();
    if (description !== undefined) dataUpdate.description = description;
    if (ownerName !== undefined) dataUpdate.ownerName = ownerName;
    if (orgId !== undefined && orgId !== existing.orgId && isSuperuser(session)) dataUpdate.orgId = orgId;
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

  // Three-tier authorization (extracted to authorizeProjectDelete so the rules
  // are unit-tested directly). Compute "is this caller an OrgAdmin in the
  // project's Org?" via a requireRole probe, then ask the lib for the verdict.
  let isOrgAdmin = false;
  try {
    await requireRole(session, await cookies(), ["Owner", "Admin"]);
    isOrgAdmin = true;
  } catch (e) {
    if (e instanceof OrgContextError) isOrgAdmin = false;
    else throw e;
  }

  const decision = authorizeProjectDelete(
    hardDelete ? "hard" : cascade === "archive" ? "archive" : "unorganise",
    { isProjectOwner, isSuperuser: su, isOrgAdmin },
  );
  if (!decision.allowed) {
    return NextResponse.json({ error: decision.message }, { status: 403 });
  }

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const orgId = projectOrgId;

  // Data effects (purge / archive / SetNull-to-Unorganised + demote-published)
  // live in app/lib/projects/deleteProject.ts so the cascade is unit-tested
  // directly. The auth + tier gates above stay here.
  const mode: ProjectDeleteMode = hardDelete ? "hard" : cascade === "archive" ? "archive" : "unorganise";
  try {
    const result = await deleteProjectCascade(
      id, orgId, mode,
      { id: session.user.id, email: session.user.email ?? "" },
      existing.name,
    );
    return NextResponse.json(
      mode === "hard"
        ? { success: true, hardDeleted: true, purged: result.purged }
        : { success: true, archived: result.archived, unpublished: result.unpublished },
    );
  } catch (err) {
    // A foreign-key violation or other DB error here would otherwise surface as
    // an unhandled 500 (HTML), which the client swallows silently. Return a
    // clean JSON message so the UI's "Delete failed" dialog can show the cause.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[DELETE /api/projects/${id}] ${mode} cascade error:`, message);
    return NextResponse.json({ error: `Delete failed: ${message}` }, { status: 500 });
  }
}
