import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { getCurrentOrgId } from "@/app/lib/auth/orgContext";
import { ComplianceMonitorConsole } from "./ComplianceMonitorConsole";

type Props = { searchParams: Promise<{ orgId?: string; from?: string }> };

/**
 * Compliance Monitoring — org-wide control operating-effectiveness over time.
 * Gated like org-admin: Owner/Admin in the active org, OR a SuperAdmin (who may
 * pass ?orgId= to inspect any org, mirroring the Sharing screen).
 */
export default async function CompliancePage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const sp = await searchParams;
  const cookieStore = await cookies();
  const su = isSuperuser(session);

  // SuperAdmin may target any org via ?orgId; everyone else uses their active org.
  const orgId = (su && sp.orgId) ? sp.orgId : await getCurrentOrgId(session, cookieStore);
  if (!orgId) redirect("/dashboard");

  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, orgId },
    select: { role: true, org: { select: { name: true } } },
  });
  const isOrgAdmin = membership?.role === "Owner" || membership?.role === "Admin";
  if (!su && !isOrgAdmin) redirect("/dashboard");

  // A SuperAdmin targeting an org they're not a member of still needs the name.
  const orgName = membership?.org.name
    ?? (await prisma.org.findUnique({ where: { id: orgId }, select: { name: true } }))?.name
    ?? "Your Org";
  const backHref = sp.from ?? (su && !isOrgAdmin ? "/dashboard/admin" : "/dashboard/org-admin");

  return <ComplianceMonitorConsole orgId={orgId} orgName={orgName} backHref={backHref} />;
}
