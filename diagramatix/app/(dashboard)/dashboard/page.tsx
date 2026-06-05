import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { DashboardClient } from "./DashboardClient";
import { getEffectiveUserId, isImpersonating, isSuperuser, getImpersonationMode } from "@/app/lib/superuser";
import { ARCHIVE_PROJECT_NAME } from "@/app/lib/archive";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";
import { getUsageSnapshot } from "@/app/lib/subscription";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  let effectiveUserId = getEffectiveUserId(session, cookieStore);
  let viewing = isImpersonating(session, cookieStore);

  // Validate impersonation target exists — clear stale cookie if not
  if (viewing) {
    const target = await prisma.user.findUnique({ where: { id: effectiveUserId }, select: { id: true } });
    if (!target) {
      cookieStore.delete("dgx_view_as");
      effectiveUserId = session.user.id;
      viewing = false;
    }
  }

  // Landing on the dashboard means the real user is no longer on a
  // specific diagram — clear so the admin Registered Users screen
  // doesn't keep showing a stale "Working on: X".
  if (!viewing && session.user.id) {
    try {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { currentDiagramId: null, currentDiagramName: null },
      });
    } catch { /* best-effort */ }
  }

  const orgId = await tryGetCurrentOrgId(session, cookieStore);
  if (!orgId) {
    // Should never happen after Phase 0 backfill, but render an empty
    // dashboard rather than crashing.
    return (
      <DashboardClient
        projects={[]}
        unorganized={[]}
        userName={session.user.name ?? "User"}
        userEmail={session.user.email ?? ""}
        version={0}
        readOnly={false}
        viewingAsName=""
        viewingAsEmail=""
        isSuperuser={isSuperuser(session)}
        usageSnapshot={null}
        showTierPicker={false}
        tierCards={[]}
      />
    );
  }

  // Fetch current user name/email from DB (session JWT may be stale after profile edit)
  const currentUser = await prisma.user.findUnique({
    where: { id: effectiveUserId },
    select: { name: true, email: true },
  });

  const [projects, unorganized, org, membership] = await Promise.all([
    // Owned-or-shared, mirroring the Slice 3 API route. Each row carries
    // owner identity (for the "by …" line on shared tiles) and the
    // caller's share role (empty array when caller is owner) so the
    // tile renders without an N+1. orgId stays a strict filter — cross-
    // org shares only surface once the recipient switches into the
    // project's Org context.
    prisma.project.findMany({
      where: {
        orgId,
        name: { not: ARCHIVE_PROJECT_NAME },
        OR: [
          { userId: effectiveUserId },
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
  ]);
  const orgRole = membership?.role ?? "";

  // If impersonating, fetch the target user's info for the banner
  let viewingAsName = "";
  let viewingAsEmail = "";
  if (viewing) {
    const target = await prisma.user.findUnique({
      where: { id: effectiveUserId },
      select: { name: true, email: true },
    });
    viewingAsName = target?.name ?? "";
    viewingAsEmail = target?.email ?? "";
  }

  // Commit count baked into the build via NEXT_PUBLIC_COMMIT_COUNT
  // (set from --build-arg GIT_COMMIT_COUNT in the Dockerfile).
  const commitCount = parseInt(process.env.NEXT_PUBLIC_COMMIT_COUNT ?? "0", 10) || 0;

  const impersonationMode = viewing ? getImpersonationMode(cookieStore) : undefined;

  // Subscription snapshot for the chip + popover. Computed for the
  // EFFECTIVE user so impersonation surfaces the impersonated user's
  // tier and counts. Tolerate null (e.g. user not found mid-flight) —
  // the chip just doesn't render in that case.
  const usageSnapshot = await getUsageSnapshot(effectiveUserId);

  // Tier picker on first sign-in: load hasChosenTier flag for the
  // SIGNED-IN user (not the impersonated one — an admin viewing another
  // user shouldn't see THEIR picker). If false AND no impersonation,
  // we'll render the welcome modal. The four tier rows ship along so
  // the picker can render without a separate client-side fetch.
  const realUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { hasChosenTier: true },
  });
  const showTierPicker = !viewing && !realUser?.hasChosenTier;
  const tierCards = showTierPicker
    ? await prisma.subscriptionLevel.findMany({
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
    : [];

  return (
    <DashboardClient
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
      usageSnapshot={usageSnapshot}
      showTierPicker={showTierPicker}
      tierCards={tierCards}
    />
  );
}
