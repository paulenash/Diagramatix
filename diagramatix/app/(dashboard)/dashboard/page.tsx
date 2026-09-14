import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { DashboardClient } from "./DashboardClient";
import { getEffectiveUserId, isImpersonating, isSuperuser, getImpersonationMode } from "@/app/lib/superuser";
import { ARCHIVE_PROJECT_NAME } from "@/app/lib/archive";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";
import { getUsageSnapshot } from "@/app/lib/subscription";
import { isMicrosoftConnected } from "@/app/lib/microsoft/connection";
import { loadDashboardUsers } from "@/app/lib/dashboard/loadUsers";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();

  // One lookup per person involved (see loadDashboardUsers): validates the
  // impersonation target (clearing a stale cookie), and supplies the header
  // name/email — read from the DB because the session JWT may be stale after
  // a profile edit — the banner, and the signed-in user's tier-picker flag.
  const { effectiveUserId, viewing, effective: currentUser, realHasChosenTier } = await loadDashboardUsers(
    (id) => prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, hasChosenTier: true } }),
    session.user.id,
    { effectiveUserId: getEffectiveUserId(session, cookieStore), viewing: isImpersonating(session, cookieStore) },
    () => cookieStore.delete("dgx_view_as"),
  );

  // The remaining pre-org work is independent, so it runs as one round-trip:
  // SharePoint link (a per-user DB link, bring-your-own — no longer tied to
  // logging in with Microsoft), the active org, and clearing "Working on: X"
  // — landing on the dashboard means the real user is no longer on a specific
  // diagram, and the admin Registered Users screen must not keep showing one.
  const [hasMicrosoft, orgId] = await Promise.all([
    isMicrosoftConnected(session.user.id),
    tryGetCurrentOrgId(session, cookieStore),
    !viewing && session.user.id
      ? prisma.user.update({
          where: { id: session.user.id },
          data: { currentDiagramId: null, currentDiagramName: null },
        }).catch(() => { /* best-effort */ })
      : Promise.resolve(),
  ]);
  if (!orgId) {
    // Should never happen after Phase 0 backfill, but render an empty
    // dashboard rather than crashing.
    return (
      <DashboardClient
        currentUserId={session.user.id}
        projects={[]}
        unorganized={[]}
        userName={session.user.name ?? "User"}
        userEmail={session.user.email ?? ""}
        version={0}
        readOnly={false}
        viewingAsName=""
        viewingAsEmail=""
        isSuperuser={isSuperuser(session)}
        hasMicrosoft={hasMicrosoft}
        usageSnapshot={null}
        showTierPicker={false}
        tierCards={[]}
      />
    );
  }

  // Tier picker on first sign-in: the SIGNED-IN user's flag (not the
  // impersonated one's — an admin viewing another user shouldn't see THEIR
  // picker). If false AND no impersonation, the welcome modal renders, and
  // the tier rows ship along so it needs no separate client-side fetch.
  const showTierPicker = !viewing && !realHasChosenTier;

  const [projects, unorganized, org, membership, usageSnapshot, tierCards] = await Promise.all([
    // Owned-or-shared, mirroring the Slice 3 API route. Each row
    // carries owner identity (for the "by …" line on shared tiles) and
    // the caller's share role (empty array when caller is owner) so
    // the tile renders without an N+1.
    //
    // orgId scopes ONLY the owned-branch. Shared projects surface
    // regardless of which Org they live in — the recipient was given
    // explicit access, so refusing to list it would be confusing.
    // (Every Diagramatix user gets their own Org by default, so a
    // strict org filter on shares would mean shared projects vanish
    // for the recipient unless they switch into the sender's Org —
    // which is exactly what Paul reported.)
    prisma.project.findMany({
      where: {
        name: { not: ARCHIVE_PROJECT_NAME },
        OR: [
          { userId: effectiveUserId, orgId },
          { shares: { some: { userId: effectiveUserId } } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { diagrams: true, shares: true } },
        user: { select: { id: true, name: true, email: true } },
        shares: { where: { userId: effectiveUserId }, select: { role: true } },
      },
    }),
    // Unorganised diagrams: owned by the caller OR assigned to them as
    // the diagram owner-of-record (project-share doesn't apply here —
    // these have no project).
    prisma.diagram.findMany({
      where: {
        orgId,
        projectId: null,
        OR: [
          { userId: effectiveUserId },
          { diagramOwnerId: effectiveUserId },
        ],
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, type: true, createdAt: true, updatedAt: true },
    }),
    prisma.org.findUnique({ where: { id: orgId }, select: { name: true } }),
    // Look up the SIGNED-IN user's role in the active org (NOT the
    // impersonated user's role — admin actions are gated on the actual
    // operator). This is the role used to decide whether destructive
    // actions like hard-delete are exposed in the UI.
    prisma.orgMember.findFirst({
      where: { userId: session.user.id, orgId },
      select: { role: true },
    }),
    // Subscription snapshot for the chip + popover. Computed for the
    // EFFECTIVE user so impersonation surfaces the impersonated user's
    // tier and counts. Tolerate null (e.g. user not found mid-flight) —
    // the chip just doesn't render in that case.
    getUsageSnapshot(effectiveUserId),
    showTierPicker
      ? prisma.subscriptionLevel.findMany({
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            priceMonthly: true,
            maxProjects: true,
            maxDiagramsPerTypePerProject: true,
            maxArchimateDiagramsTotal: true,
            maxAiAttempts: true,
            maxIndividualExports: true,
            maxBulkExports: true,
            trialDays: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const orgRole = membership?.role ?? "";

  // If impersonating, the banner names the target — the same row as the header.
  const viewingAsName = viewing ? currentUser?.name ?? "" : "";
  const viewingAsEmail = viewing ? currentUser?.email ?? "" : "";

  // Commit count baked into the build via NEXT_PUBLIC_COMMIT_COUNT
  // (set from --build-arg GIT_COMMIT_COUNT in the Dockerfile).
  const commitCount = parseInt(process.env.NEXT_PUBLIC_COMMIT_COUNT ?? "0", 10) || 0;

  const impersonationMode = viewing ? getImpersonationMode(cookieStore) : undefined;

  return (
    <DashboardClient
      currentUserId={session.user.id}
      projects={projects}
      unorganized={unorganized}
      userName={currentUser?.name ?? session.user.name ?? "User"}
      userEmail={currentUser?.email ?? session.user.email ?? ""}
      orgName={org?.name ?? ""}
      orgRole={orgRole}
      version={commitCount}
      readOnly={viewing && impersonationMode === "view"}
      viewingAsName={viewingAsName}
      viewingAsEmail={viewingAsEmail}
      impersonationMode={impersonationMode}
      isSuperuser={isSuperuser(session)}
      hasMicrosoft={hasMicrosoft}
      usageSnapshot={usageSnapshot}
      showTierPicker={showTierPicker}
      tierCards={tierCards}
    />
  );
}
