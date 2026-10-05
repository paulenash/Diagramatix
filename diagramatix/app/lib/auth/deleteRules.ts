// Server-only. WHO MAY DELETE (Paul, 2026-10-05: "OrgAdmins should not be able to delete anything! ONLY SuperAdmins can destructively
// restore or delete anything" — administration only: ordinary users still delete their OWN work, which goes to the archive).
//
//   • superAdminOnlyDelete()        — Org-level things an OrgAdmin used to be able to delete (libraries, structures, teams):
//                                     SuperAdmin only. An OrgAdmin may still create, edit and rename them.
//   • orgAdminCannotDelete(target)  — project / diagram deletes: the owner (and an editor, where the route allows) still delete their
//                                     own; a caller who reaches the project ONLY as an OrgAdmin (implicit owner) does not.
//
// Each returns the 403 to send, or null to carry on. They run FIRST in a DELETE handler. A source scan (tests/auth/
// delete-lockdown.test.ts) fails the build when a DELETE handler under orgs/** or projects/** does not call one of them.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getEffectiveUserId, isSuperuser } from "@/app/lib/superuser";
import { getDiagramAccess, getProjectAccess } from "@/app/lib/auth/orgContext";

export const ORGADMIN_DELETE_MESSAGE = "Only a SuperAdmin can delete this. Ask your SuperAdmin to remove it.";
const refused = () => NextResponse.json({
  error: ORGADMIN_DELETE_MESSAGE,
  // The structured notice the page shows as a modal (subscription/gateNotice.ts), so the person is told, not left with a button that does nothing.
  notice: { kind: "policy", title: "Only a SuperAdmin can delete this", detail: "Ask your SuperAdmin to remove it. You can still create, edit and rename.", upgradeHref: null, upgradeLabel: null },
}, { status: 403 });

/** Org-level delete: SuperAdmin only. */
export async function superAdminOnlyDelete(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return isSuperuser(session) ? null : refused();
}

/** Project / diagram delete: refused when the caller is an implicit owner only by being an OrgAdmin of the Org. */
export async function orgAdminCannotDelete(target: { projectId?: string; diagramId?: string }): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user?.id) return null;                         // the route's own guard answers 401
  if (isSuperuser(session)) return null;                       // a SuperAdmin keeps every power
  const userId = getEffectiveUserId(session, await cookies());
  if (!userId) return null;
  if (target.projectId) return (await getProjectAccess(userId, target.projectId))?.viaOrgAdmin ? refused() : null;
  if (target.diagramId) return (await getDiagramAccess(userId, target.diagramId))?.viaOrgAdmin ? refused() : null;
  return null;
}
