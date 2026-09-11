import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";
import { SkillsClient } from "./SkillsClient";

type Props = { searchParams: Promise<{ orgId?: string; from?: string }> };

/**
 * The master Skills list — ORG-level, so an OrgAdmin maintains their own
 * vocabulary rather than waiting on a SuperAdmin.
 *
 * A SuperAdmin does the same for ANY org (Paul, 2026-09-11), which is the same
 * shape as the APQC and Risk & Control screens: `?orgId=` selects, and an org
 * picker switches. For everyone else the parameter is IGNORED rather than
 * refused — a URL is not a permission, and honouring it for a non-admin would
 * make the address bar the access-control surface.
 *
 * `canEdit` only decides what the screen OFFERS. The API gates every write
 * independently, because a hidden button is not a permission check.
 */
export default async function SkillsAdminPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const cookieStore = await cookies();
  const su = await isActingSuperuser(session);
  const { orgId: orgIdParam, from } = await searchParams;

  const activeOrgId = await tryGetCurrentOrgId(session, cookieStore);
  const selectedOrgId = su ? (orgIdParam ?? activeOrgId) : activeOrgId;
  if (!selectedOrgId) redirect("/dashboard");

  // A non-SuperAdmin may READ their own org's list (the pickers need it) but
  // only an Owner/Admin may change it.
  let canEdit = su;
  if (!su) {
    const m = await prisma.orgMember.findFirst({
      where: { userId: session.user.id, orgId: selectedOrgId },
      select: { role: true },
    });
    if (!m) redirect("/dashboard");
    canEdit = m.role === "Owner" || m.role === "Admin";
  }

  const [org, orgs] = await Promise.all([
    prisma.org.findUnique({ where: { id: selectedOrgId }, select: { id: true, name: true } }),
    su ? prisma.org.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  if (!org) redirect("/dashboard");

  return (
    <SkillsClient
      orgId={org.id}
      orgName={org.name}
      isSuperAdmin={su}
      orgs={orgs}
      canEdit={canEdit}
      backHref={from ?? (su ? "/dashboard/admin" : "/dashboard/org-admin")}
    />
  );
}
