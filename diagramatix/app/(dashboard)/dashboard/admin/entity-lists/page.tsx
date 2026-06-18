import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";
import { EntityListsClient } from "./EntityListsClient";

type SearchParams = Promise<{ orgId?: string; from?: string }>;

/**
 * Entity Lists maintenance (org master library): External Participants,
 * IT Systems, and Organisation Structures used to name BPMN pools/lanes.
 * Gating mirrors Org Settings: SuperAdmin (Org picker) OR Owner/Admin in
 * the active Org (locked). The /api/orgs/[id]/entity-lists routes re-check
 * every mutation server-side.
 */
export default async function EntityListsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  const activeOrgId = await tryGetCurrentOrgId(session, cookieStore);
  if (!activeOrgId) redirect("/dashboard");

  const su = isSuperuser(session);
  const { orgId: orgIdParam, from } = await searchParams;
  const selectedOrgId = su ? (orgIdParam ?? activeOrgId) : activeOrgId;

  if (!su) {
    const membership = await prisma.orgMember.findFirst({
      where: { userId: session.user.id, orgId: selectedOrgId },
      select: { role: true },
    });
    if (membership?.role !== "Owner" && membership?.role !== "Admin") redirect("/dashboard");
  }

  const [org, orgList] = await Promise.all([
    prisma.org.findUnique({ where: { id: selectedOrgId }, select: { id: true, name: true } }),
    su ? prisma.org.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  if (!org) redirect("/dashboard");

  return (
    <EntityListsClient
      orgId={org.id}
      orgName={org.name}
      isSuperAdmin={su}
      orgs={orgList}
      backHref={from ?? (su ? "/dashboard/admin" : "/dashboard/org-admin")}
    />
  );
}
