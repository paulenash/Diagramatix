import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";
import { OrgSettingsClient } from "./OrgSettingsClient";

/**
 * Org Settings page.
 *
 * Reachable from:
 *   • /dashboard/admin header (SuperAdmin chip)
 *   • /dashboard header (OrgOwner / OrgAdmin chip)
 *
 * Gating: SuperAdmin OR (OrgRole.Owner or OrgRole.Admin in the user's
 * active Org). The /api/orgs/[id]/settings route the client calls
 * enforces the same rule independently, so a hand-crafted request
 * cannot bypass via the URL.
 *
 * Initial fetch happens server-side to avoid an FOUC on the toggle.
 */
export default async function OrgSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  const orgId = await tryGetCurrentOrgId(session, cookieStore);
  if (!orgId) redirect("/dashboard");

  const su = isSuperuser(session);

  // Membership check — for non-SuperAdmins we need Owner/OrgAdmin in
  // the active Org. Cheap query; runs in parallel with the org fetch
  // since they have no data dependency on each other.
  const [membership, org] = await Promise.all([
    su
      ? Promise.resolve(null)
      : prisma.orgMember.findFirst({
          where: { userId: session.user.id, orgId },
          select: { role: true },
        }),
    prisma.org.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, allowCrossOrgSharing: true },
    }),
  ]);

  if (!su) {
    const role = membership?.role;
    if (role !== "Owner" && role !== "Admin") redirect("/dashboard");
  }
  if (!org) redirect("/dashboard");

  return (
    <OrgSettingsClient
      orgId={org.id}
      orgName={org.name}
      initialAllowCrossOrgSharing={org.allowCrossOrgSharing}
      isSuperAdmin={su}
    />
  );
}
