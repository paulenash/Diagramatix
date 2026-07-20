import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";
import { OrgSettingsClient, type OrgDetail, type OrgListItem, type OrgAdminRow } from "./OrgSettingsClient";

type SearchParams = Promise<{ orgId?: string }>;

/**
 * Org Settings page.
 *
 * Reachable from:
 *   • /dashboard/admin header (SuperAdmin chip)
 *   • /dashboard header (OrgOwner / OrgAdmin chip)
 *
 * Gating: SuperAdmin OR (OrgRole.Owner or OrgRole.Admin in the user's
 * active Org). SuperAdmin precedes OrgAdmin — when both apply, treat
 * as SuperAdmin (Org picker, "+ New Org" button, Danger Zone).
 *
 * Server-side data:
 *   • SuperAdmin: list every Org for the picker + the selected Org's
 *     full detail (info + admins). `?orgId=X` lets the picker drive
 *     URL-shareable selection; defaults to the SuperAdmin's active Org.
 *   • OrgAdmin: locked to their active Org. Any `?orgId` is ignored to
 *     keep a guessed URL from peeking elsewhere.
 *
 * The /api/orgs/[id]/settings + /admins routes re-check every mutation
 * server-side, so a hand-crafted request cannot bypass via the URL.
 */
export default async function OrgSettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  const activeOrgId = await tryGetCurrentOrgId(session, cookieStore);
  if (!activeOrgId) redirect("/dashboard");

  const su = isSuperuser(session);

  // Resolve which Org's detail to show.
  //   • SuperAdmin: respects ?orgId, defaults to active Org.
  //   • OrgAdmin: locked to active Org regardless of ?orgId.
  const { orgId: orgIdParam } = await searchParams;
  const selectedOrgId = su ? (orgIdParam ?? activeOrgId) : activeOrgId;

  // Non-SuperAdmin membership check on the SELECTED Org. SuperAdmin
  // bypasses entirely (they may have no OrgMember row in this Org).
  if (!su) {
    const membership = await prisma.orgMember.findFirst({
      where: { userId: session.user.id, orgId: selectedOrgId },
      select: { role: true },
    });
    const role = membership?.role;
    if (role !== "Owner" && role !== "Admin") redirect("/dashboard");
  }

  // Parallel fetch: selected Org detail, selected Org's OrgAdmins,
  // and (SuperAdmin only) the full Org list for the picker.
  const [orgRow, adminsRow, orgListRow] = await Promise.all([
    prisma.org.findUnique({
      where: { id: selectedOrgId },
      select: {
        id: true,
        name: true,
        entityType: true,
        allowCrossOrgSharing: true,
        allowAi: true,
        allowVoiceAi: true,
        allowExternalExport: true,
        allowSharePoint: true,
        allowSupportDiagram: true,
        createdAt: true,
        _count: { select: { members: true, projects: true, diagrams: true } },
      },
    }),
    prisma.orgMember.findMany({
      where: { orgId: selectedOrgId, role: { in: ["Owner", "Admin"] } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        userId: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    su
      ? prisma.org.findMany({
          select: {
            id: true,
            name: true,
            entityType: true,
            _count: { select: { members: true } },
          },
          orderBy: { name: "asc" },
        })
      : Promise.resolve(null),
  ]);

  if (!orgRow) redirect("/dashboard");

  const org: OrgDetail = {
    id: orgRow.id,
    name: orgRow.name,
    entityType: orgRow.entityType,
    allowCrossOrgSharing: orgRow.allowCrossOrgSharing,
    allowAi: orgRow.allowAi,
    allowVoiceAi: orgRow.allowVoiceAi,
    allowExternalExport: orgRow.allowExternalExport,
    allowSharePoint: orgRow.allowSharePoint,
    allowSupportDiagram: orgRow.allowSupportDiagram,
    createdAt: orgRow.createdAt.toISOString(),
    memberCount: orgRow._count.members,
    projectCount: orgRow._count.projects,
    diagramCount: orgRow._count.diagrams,
  };

  const admins: OrgAdminRow[] = adminsRow.map((m) => ({
    id: m.id,
    userId: m.userId,
    role: m.role as "Owner" | "Admin",
    createdAt: m.createdAt.toISOString(),
    user: { id: m.user.id, name: m.user.name, email: m.user.email },
  }));

  const orgList: OrgListItem[] | null = orgListRow
    ? orgListRow.map((o) => ({
        id: o.id,
        name: o.name,
        entityType: o.entityType,
        memberCount: o._count.members,
      }))
    : null;

  return (
    <OrgSettingsClient
      isSuperAdmin={su}
      org={org}
      admins={admins}
      orgList={orgList}
      callerUserId={session.user.id}
    />
  );
}
