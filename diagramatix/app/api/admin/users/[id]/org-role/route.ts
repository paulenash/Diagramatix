import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import type { OrgRole } from "@/app/lib/auth/orgRoleType";

type Params = { params: Promise<{ id: string }> };

const VALID_ROLES: ReadonlySet<OrgRole> = new Set([
  "Owner",
  "Admin",
  "RiskOwner",
  "ProcessOwner",
  "ControlOwner",
  "InternalAudit",
  "BoardObserver",
  "Viewer",
]);

/**
 * PUT /api/admin/users/[id]/org-role
 *
 * SuperAdmin-only. Sets a user's OrgRole inside a specific Org. Used by
 * the SuperAdmin user table to assign / revoke OrgAdmin (and the other
 * OrgRoles) per user. The body identifies BOTH the orgId (a user can be
 * a member of multiple orgs) and the new role.
 *
 * 403 for any non-SuperAdmin caller. 404 if the OrgMember row doesn't
 * exist (this endpoint mutates existing memberships only — joining a
 * user to a NEW org needs a different path that hasn't been built yet).
 */
export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: userId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    orgId?: string;
    role?: string;
  };
  const orgId = (body.orgId ?? "").trim();
  const role = body.role as OrgRole | undefined;

  if (!orgId) return NextResponse.json({ error: "orgId is required" }, { status: 400 });
  if (!role || !VALID_ROLES.has(role)) {
    return NextResponse.json({ error: "role must be a valid OrgRole" }, { status: 400 });
  }

  // updateMany lets us combine the (userId, orgId) lookup with the
  // update in one statement — we don't need the row back, just the
  // affected-count to distinguish "found and updated" from "no row".
  const result = await prisma.orgMember.updateMany({
    where: { userId, orgId },
    data: { role },
  });
  if (result.count === 0) {
    return NextResponse.json(
      { error: "OrgMember row not found for this (userId, orgId)" },
      { status: 404 },
    );
  }

  const updated = await prisma.orgMember.findFirst({
    where: { userId, orgId },
    select: { id: true, userId: true, orgId: true, role: true },
  });
  return NextResponse.json(updated);
}
