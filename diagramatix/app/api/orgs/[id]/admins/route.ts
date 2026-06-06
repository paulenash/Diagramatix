import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/orgs/[id]/admins
 *
 * List every OrgMember in this Org whose role is `Owner` or `Admin`,
 * joined to user identity. Gated SuperAdmin OR (Owner/Admin in this
 * Org) via requireOrgAdminFor.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const admins = await prisma.orgMember.findMany({
    where: { orgId: id, role: { in: ["Owner", "Admin"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      role: true,
      createdAt: true,
      createdBy: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
  return NextResponse.json(admins);
}

/**
 * POST /api/orgs/[id]/admins
 *
 * Body: { userIdOrEmail: string }
 *
 * Promotes the target user to `OrgRole.Admin` in this Org. Behaviour
 * diverges by caller tier:
 *
 *   • **SuperAdmin** — if the target user is already an OrgMember,
 *     update role to Admin. If not, create an OrgMember(role=Admin)
 *     row, effectively adding them to the Org as an OrgAdmin in one
 *     step. SuperAdmin can pull in any registered user.
 *
 *   • **OrgAdmin** — if the target is not already an OrgMember, REJECT
 *     (400). They can promote existing members but not add new ones.
 *     This keeps cross-tenant data isolation: an OrgAdmin can't pull
 *     in arbitrary outsiders.
 *
 * Stamps `createdBy` with the actor's userId for audit hints.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();

  try {
    if (session && isReadOnlyImpersonation(session, await cookies())) {
      return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
    }
  } catch { /* cookies() may fail */ }

  const { id } = await params;
  let isSuperAdmin = false;
  let actorUserId: string;
  try {
    const gate = await requireOrgAdminFor(session, await cookies(), id);
    isSuperAdmin = gate.isSuperAdmin;
    actorUserId = gate.userId;
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const body = (await req.json().catch(() => ({}))) as { userIdOrEmail?: string };
  const key = (body.userIdOrEmail ?? "").trim();
  if (!key) {
    return NextResponse.json({ error: "userIdOrEmail is required" }, { status: 400 });
  }

  // Resolve recipient. Try literal cuid first (cheap), then lowercased
  // email — matches the resolution order used by ProjectShare POST.
  const target =
    (await prisma.user.findUnique({
      where: { id: key },
      select: { id: true, name: true, email: true },
    })) ??
    (await prisma.user.findUnique({
      where: { email: key.toLowerCase() },
      select: { id: true, name: true, email: true },
    }));
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const existing = await prisma.orgMember.findFirst({
    where: { orgId: id, userId: target.id },
    select: { id: true, role: true },
  });

  if (!existing && !isSuperAdmin) {
    // OrgAdmin trying to add a non-member — rejected. The error
    // message tells them to ask a SuperAdmin if they need to bring an
    // outsider in.
    return NextResponse.json(
      {
        error:
          "Only a SuperAdmin can add a user who isn't already an OrgMember. Ask a SuperAdmin to add this user to your Org first.",
      },
      { status: 400 },
    );
  }

  const row = existing
    ? await prisma.orgMember.update({
        where: { id: existing.id },
        data: { role: "Admin" },
        select: {
          id: true,
          userId: true,
          role: true,
          createdAt: true,
          createdBy: true,
          user: { select: { id: true, name: true, email: true } },
        },
      })
    : await prisma.orgMember.create({
        data: {
          orgId: id,
          userId: target.id,
          role: "Admin",
          createdBy: actorUserId,
        },
        select: {
          id: true,
          userId: true,
          role: true,
          createdAt: true,
          createdBy: true,
          user: { select: { id: true, name: true, email: true } },
        },
      });

  return NextResponse.json(row, { status: existing ? 200 : 201 });
}
