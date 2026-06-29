import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";
import { promoteToAdmin, isManageAdminsError } from "@/app/lib/orgs/manageAdmins";

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

  const result = await promoteToAdmin(id, body.userIdOrEmail ?? "", {
    isSuperAdmin,
    actorUserId,
  });
  if (isManageAdminsError(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.row, { status: result.created ? 201 : 200 });
}
