import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";
import { OrgBackupClient } from "./OrgBackupClient";

// /dashboard/org-admin/backup — OrgAdmin (Owner/Admin) or SuperAdmin only.
// Org-scoped backup download + selective additive restore.
export default async function OrgBackupPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  const orgId = await tryGetCurrentOrgId(session, cookieStore);
  if (!orgId) redirect("/dashboard");

  if (!isSuperuser(session)) {
    const m = await prisma.orgMember.findFirst({
      where: { userId: session.user.id, orgId, role: { in: ["Owner", "Admin"] } },
      select: { id: true },
    });
    if (!m) redirect("/dashboard");
  }

  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { name: true } });

  return <OrgBackupClient orgName={org?.name ?? "Your Org"} />;
}
