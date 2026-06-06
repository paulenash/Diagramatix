import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { ProjectShareRole } from "@/app/generated/prisma/enums";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/shares
 *
 * List of users this project is currently shared with.
 *
 * Readable by ANY access role (owner / edit / view). A viewer needs to
 * see the share list to know who else is in the room — the share list
 * is presence/transparency information, not a privileged action.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const shares = await prisma.projectShare.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(shares);
}

/**
 * DELETE /api/projects/[id]/shares
 *
 * Owner-only. Removes EVERY ProjectShare row for the project in one
 * transaction — the "Stop Sharing" action from the ProjectShareDialog.
 * Idempotent: returns 200 + { removed: 0 } when there's nothing to
 * remove, never a 404.
 *
 * Per-share removal still goes via DELETE /shares/[userId]. This
 * endpoint exists so the Stop Sharing button doesn't need to issue N
 * parallel deletes.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (isReadOnlyImpersonation(session, await cookies())) {
      return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
    }
  } catch { /* cookies() may fail */ }

  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "owner");
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const result = await prisma.projectShare.deleteMany({
    where: { projectId: id },
  });
  return NextResponse.json({ removed: result.count });
}

/**
 * POST /api/projects/[id]/shares
 *
 * Body: { userIdOrEmail: string, role: "VIEW" | "EDIT" }
 *
 * Owner-only. Resolves the target user by id or email, runs the cross-org
 * gate, rejects sharing-with-self, and upserts on (projectId, userId) so
 * a re-share of an existing recipient transparently updates their role.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Impersonation guard — a superuser viewing another user cannot
  // restructure that user's sharing graph.
  try {
    if (isReadOnlyImpersonation(session, await cookies())) {
      return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
    }
  } catch { /* cookies() may fail in some contexts */ }

  const { id } = await params;
  let access;
  try {
    access = await requireProjectAccess(session, await cookies(), id, "owner");
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const body = (await req.json().catch(() => ({}))) as {
    userIdOrEmail?: string;
    role?: string;
  };
  const targetKey = (body.userIdOrEmail ?? "").trim();
  const role: ProjectShareRole | null =
    body.role === "EDIT" ? ProjectShareRole.EDIT
    : body.role === "VIEW" ? ProjectShareRole.VIEW
    : null;
  if (!targetKey) {
    return NextResponse.json({ error: "userIdOrEmail is required" }, { status: 400 });
  }
  if (!role) {
    return NextResponse.json({ error: "role must be VIEW or EDIT" }, { status: 400 });
  }

  // Resolve the recipient. Try the literal id first (cheap cuid lookup),
  // then fall back to email — supports the dialog's "type an email"
  // flow without a separate route.
  const target =
    (await prisma.user.findUnique({
      where: { id: targetKey },
      select: { id: true, name: true, email: true },
    })) ??
    (await prisma.user.findUnique({
      where: { email: targetKey.toLowerCase() },
      select: { id: true, name: true, email: true },
    }));
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.id === access.ownerUserId) {
    return NextResponse.json(
      { error: "Cannot share a project with its own owner" },
      { status: 400 },
    );
  }

  // Cross-org gate: when the target is in a different Org than the
  // project, the project's Org must allow it. We check Org membership
  // here (not at access-resolution time) because the share's lifetime
  // is what counts — a recipient who later joins the project's Org
  // shouldn't need a re-share, but a recipient who never had Org
  // membership and the gate is off must be rejected up front.
  const project = await prisma.project.findUnique({
    where: { id },
    select: { orgId: true, org: { select: { allowCrossOrgSharing: true } } },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (!project.org.allowCrossOrgSharing) {
    const sameOrg = await prisma.orgMember.findFirst({
      where: { userId: target.id, orgId: project.orgId },
      select: { id: true },
    });
    if (!sameOrg) {
      return NextResponse.json(
        { error: "Cross-org sharing is disabled for this org" },
        { status: 400 },
      );
    }
  }

  // Upsert — a duplicate POST is a role change, not an error. Mirrors
  // the PUT semantics so the dialog can avoid juggling create-vs-update
  // ceremony.
  const share = await prisma.projectShare.upsert({
    where: { projectId_userId: { projectId: id, userId: target.id } },
    update: { role },
    create: {
      projectId: id,
      userId: target.id,
      role,
      createdBy: session.user.id,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(share, { status: 201 });
}
