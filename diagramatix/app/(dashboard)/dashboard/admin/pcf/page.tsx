import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";
import { PcfClient } from "./PcfClient";

type Props = { searchParams: Promise<{ orgId?: string; from?: string }> };

/**
 * APQC Process Classification Framework (PCF) — browse the reference frameworks
 * (Cross-Industry + industry variants) and the org's tailored frameworks.
 * Owner/Admin in the active org, or a SuperAdmin (who may pass ?orgId=).
 */
export default async function PcfPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const cookieStore = await cookies();
  const su = isSuperuser(session);
  const { orgId: orgIdParam, from } = await searchParams;
  const activeOrgId = await tryGetCurrentOrgId(session, cookieStore);
  const selectedOrgId = su ? (orgIdParam ?? activeOrgId) : activeOrgId;
  if (!selectedOrgId) redirect("/dashboard");

  if (!su) {
    const m = await prisma.orgMember.findFirst({ where: { userId: session.user.id, orgId: selectedOrgId }, select: { role: true } });
    if (!(m?.role === "Owner" || m?.role === "Admin")) redirect("/dashboard");
  }

  const [org, orgs] = await Promise.all([
    prisma.org.findUnique({ where: { id: selectedOrgId }, select: { id: true, name: true } }),
    su ? prisma.org.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  if (!org) redirect("/dashboard");

  return (
    <PcfClient
      orgId={org.id}
      orgName={org.name}
      isSuperAdmin={su}
      orgs={orgs}
      backHref={from ?? (su ? "/dashboard/admin" : "/dashboard/org-admin")}
    />
  );
}
