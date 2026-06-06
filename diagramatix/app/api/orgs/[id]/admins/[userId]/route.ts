import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string; userId: string }> };

/**
 * DELETE /api/orgs/[id]/admins/[userId]
 *
 * Demotes the user — sets their OrgMember.role to "Viewer". Does NOT
 * delete the OrgMember row (they stay in the Org as a regular member).
 *
 * Gated SuperAdmin OR (Owner/Admin in this Org).
 *
 * **Last-admin guard**: refuses to demote the only remaining Owner OR
 * Admin in this Org — every Org must have at least one OrgAdmin. The
 * SuperAdmin path doesn't bypass this; SuperAdmin should promote
 * someone else first.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();

  try {
    if (session && isReadOnlyImpersonation(session, await cookies())) {
      return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
    }
  } catch { /* cookies() may fail */ }

  const { id, userId } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const member = await prisma.orgMember.findFirst({
    where: { orgId: id, userId },
    select: { id: true, role: true },
  });
  if (!member) {
    return NextResponse.json({ error: "Not an OrgMember of this Org" }, { status: 404 });
  }
  if (member.role !== "Owner" && member.role !== "Admin") {
    return NextResponse.json(
      { error: "User is not currently an OrgAdmin of this Org" },
      { status: 400 },
    );
  }

  // Last-admin guard.
  const adminCount = await prisma.orgMember.count({
    where: { orgId: id, role: { in: ["Owner", "Admin"] } },
  });
  if (adminCount <= 1) {
    return NextResponse.json(
      {
        error:
          "Cannot demote the last OrgAdmin in this Org. Promote someone else first.",
      },
      { status: 400 },
    );
  }

  const updated = await prisma.orgMember.update({
    where: { id: member.id },
    data: { role: "Viewer" },
    select: { id: true, userId: true, role: true, orgId: true },
  });
  return NextResponse.json(updated);
}
