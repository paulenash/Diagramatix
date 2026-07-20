import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { SA_MODE_COOKIE } from "@/app/lib/auth/orgPolicy";
import { getCurrentOrgId } from "@/app/lib/auth/orgContext";
import { getEntitlements } from "@/app/lib/subscription";
import { OrgAdminClient } from "./OrgAdminClient";

/**
 * OrgAdmin landing page — a single entry point that lists every Org-
 * scoped management option (Registered Users, Org Settings, Project
 * Sharing). Replaces the previous trio of separate chips on the
 * dashboard header (Paul's 2026-06-09 item 8).
 *
 * Gates on: OrgAdmin (Owner/Admin in the active Org). SuperAdmin
 * still goes through /dashboard/admin since they have a wider set of
 * options; if a SuperAdmin lands here we redirect them across.
 */
export default async function OrgAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  // A SuperAdmin normally has the wider SuperAdmin dashboard — but when they've
  // cycled the logo into the "orgadmin" view they want to act as / demo an
  // OrgAdmin, so stay here and render the OrgAdmin screen for their active org.
  const asOrgAdmin = isSuperuser(session) && cookieStore.get(SA_MODE_COOKIE)?.value === "orgadmin";
  if (isSuperuser(session) && !asOrgAdmin) redirect("/dashboard/admin");

  const activeOrgId = await getCurrentOrgId(session, cookieStore);

  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, orgId: activeOrgId },
    select: { role: true, org: { select: { name: true } } },
  });
  const isOrgAdmin = membership?.role === "Owner" || membership?.role === "Admin";
  if (!isOrgAdmin && !asOrgAdmin) redirect("/dashboard");

  // Feature entitlements for THIS OrgAdmin's own subscription — tiles whose
  // feature isn't included are greyed out (non-clickable).
  const entitlements = await getEntitlements(session.user.id);

  return <OrgAdminClient orgName={membership?.org.name ?? "Your Org"} entitlements={entitlements} />;
}
