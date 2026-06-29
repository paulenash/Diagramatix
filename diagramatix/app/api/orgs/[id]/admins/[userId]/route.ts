import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";
import { demoteAdmin, isManageAdminsError } from "@/app/lib/orgs/manageAdmins";

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

  const result = await demoteAdmin(id, userId);
  if (isManageAdminsError(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
