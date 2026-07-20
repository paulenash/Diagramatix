import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";
import { ARCHIVE_PROJECT_NAME } from "@/app/lib/archive";
import { AdminSharingClient, type SharedProjectRow, type OrgOption } from "./AdminSharingClient";

type SearchParams = Promise<{ orgId?: string }>;

/**
 * Project Sharing oversight page.
 *
 * Gating: SuperAdmin OR (OrgRole.Owner | OrgRole.Admin in the caller's
 * active Org). Two scopes:
 *   • SuperAdmin — every shared project across every Org, filterable
 *     via a SuperAdmin-only Org picker (`?orgId=...`).
 *   • OrgOwner / OrgAdmin — every shared project in their active Org.
 *
 * "Sharing oversight" = they can see, edit, add to, and remove shares
 * on any project listed here AND open the project / its diagrams as
 * if they were the owner — silently. Slice 7c's elevation makes the
 * downstream guards pass without writing a ProjectShare row for them.
 *
 * The list deliberately includes only projects that ALREADY have at
 * least one share — this is the share oversight view, not a directory
 * of every project. SuperAdmin can browse all projects via the
 * existing per-user lists if they need them.
 */
export default async function AdminSharingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  const activeOrgId = await tryGetCurrentOrgId(session, cookieStore);
  if (!activeOrgId) redirect("/dashboard");

  const su = await isActingSuperuser(session); // mode-aware: false in orgadmin/user view

  // Non-SuperAdmins must be Owner or OrgAdmin in their active Org.
  // SuperAdmins bypass — they don't need OrgMember membership.
  if (!su) {
    const membership = await prisma.orgMember.findFirst({
      where: { userId: session.user.id, orgId: activeOrgId },
      select: { role: true },
    });
    const role = membership?.role;
    if (role !== "Owner" && role !== "Admin") redirect("/dashboard");
  }

  const { orgId: orgIdFilter } = await searchParams;

  // Resolve which Org's projects to show.
  //   • OrgAdmin: always their active Org (ignore any ?orgId override
  //     so a guessed URL can't peek at another Org).
  //   • SuperAdmin: respects ?orgId for filtering; defaults to "all
  //     orgs" when absent.
  const effectiveOrgFilter = su ? (orgIdFilter ?? null) : activeOrgId;

  // Query — every project with at least one share, optionally scoped to
  // one Org. Order by updatedAt desc so recently-touched projects rise.
  const projects = await prisma.project.findMany({
    where: {
      shares: { some: {} },
      name: { not: ARCHIVE_PROJECT_NAME },
      ...(effectiveOrgFilter ? { orgId: effectiveOrgFilter } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { diagrams: true, shares: true } },
      user: { select: { id: true, name: true, email: true } },
      org: { select: { id: true, name: true } },
      shares: {
        select: { role: true, user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    // A hard cap so a misclick on "All Orgs" with 10k+ projects doesn't
    // blow up the response. SuperAdmins should narrow with the Org
    // filter; OrgAdmins are naturally scoped.
    take: 200,
  });

  const rows: SharedProjectRow[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    updatedAt: p.updatedAt.toISOString(),
    orgId: p.orgId,
    orgName: p.org.name,
    owner: p.user
      ? { id: p.user.id, name: p.user.name, email: p.user.email }
      : null,
    diagramCount: p._count.diagrams,
    shareCount: p._count.shares,
    shares: p.shares.map((s) => ({
      role: s.role,
      user: { id: s.user.id, name: s.user.name, email: s.user.email },
    })),
  }));

  // SuperAdmins get an Org filter dropdown. Pull the list of all Orgs
  // up front — typical deployment has a handful, so no pagination
  // needed for this dropdown.
  let orgOptions: OrgOption[] = [];
  if (su) {
    const orgs = await prisma.org.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    orgOptions = orgs;
  }

  return (
    <AdminSharingClient
      rows={rows}
      isSuperAdmin={su}
      activeOrgId={activeOrgId}
      orgOptions={orgOptions}
      currentOrgFilter={effectiveOrgFilter}
    />
  );
}
