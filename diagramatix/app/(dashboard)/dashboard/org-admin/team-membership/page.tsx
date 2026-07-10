import { redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getCurrentOrgId, requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";
import { TeamMembershipPanel } from "@/app/components/admin/TeamMembershipPanel";

/**
 * Team Membership admin — assign org members to Org-Structure teams/roles for
 * the Portal's "Involving me" view. Open to OrgAdmins (their own org) and
 * SuperAdmins (the currently-active org; switch org context to manage another).
 */
export default async function TeamMembershipPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const cookieStore = await cookies();

  let orgId: string;
  try {
    orgId = await getCurrentOrgId(session, cookieStore);
    await requireOrgAdminFor(session, cookieStore, orgId);
  } catch (err) {
    if (err instanceof OrgContextError) redirect("/dashboard");
    throw err;
  }

  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { name: true } });

  return (
    <div className="dgx-dashboard-bg min-h-screen">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <Link href="/dashboard/org-admin" className="text-gray-400 hover:text-gray-700 text-sm">← Org Admin</Link>
        <h1 className="text-lg font-semibold text-gray-800">Team Membership</h1>
        <span className="text-xs text-gray-400">{org?.name ?? "Your Org"}</span>
      </header>
      <div className="max-w-3xl mx-auto px-6 py-6">
        <TeamMembershipPanel orgId={orgId} orgName={org?.name ?? "Your Org"} />
      </div>
    </div>
  );
}
