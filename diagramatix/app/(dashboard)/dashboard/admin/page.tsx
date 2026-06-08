import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser, SUPERUSER_EMAILS } from "@/app/lib/superuser";
import { getEffectiveSubscriptionLevelId } from "@/app/lib/subscription";
import { AdminClient } from "./AdminClient";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isSuperuser(session)) redirect("/dashboard");

  const [users, allTiers] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        lastSeenAt: true,
        currentDiagramId: true,
        currentDiagramName: true,
        subscriptionLevelId: true,
        subscriptionAssignedAt: true,
        subscriptionLevel: { select: { id: true, name: true, trialDays: true } },
        subscriptionEndsAt: true,
        compTierLevelId: true,
        compTierExpiresAt: true,
        // Surface the user's primary OrgMember row (oldest membership
        // wins, mirroring getCurrentOrgId's fallback) so the SuperAdmin
        // table can show + edit the OrgRole inline.
        orgMembers: {
          orderBy: { createdAt: "asc" },
          take: 1,
          select: {
            orgId: true,
            role: true,
            org: { select: { name: true } },
          },
        },
        _count: {
          select: {
            projects: true,
            diagrams: true,
          },
        },
      },
    }),
    // Fetch every tier once so we can look up names for grace-period
    // downgrades + comp grants without N+1 queries per user.
    prisma.subscriptionLevel.findMany({
      select: { id: true, name: true, trialDays: true },
    }),
  ]);
  const tierNameById = new Map(allTiers.map(t => [t.id, t.name]));
  const trialDaysById = new Map(allTiers.map(t => [t.id, t.trialDays]));

  const now = new Date();

  // Serialise dates + map the synthetic "SuperAdmin" tier label for
  // users in the SUPERUSER_EMAILS allowlist (those bypass enforcement
  // so their stored tier — usually Expert from the grandfather seed —
  // is moot).
  const usersForClient = users.map(u => {
    const effectiveId = getEffectiveSubscriptionLevelId(
      {
        subscriptionLevelId: u.subscriptionLevelId,
        subscriptionEndsAt: u.subscriptionEndsAt,
        compTierLevelId: u.compTierLevelId,
        compTierExpiresAt: u.compTierExpiresAt,
      },
      now,
    );
    const effectiveName = tierNameById.get(effectiveId) ?? "—";
    const compActive =
      u.compTierLevelId !== null &&
      u.compTierExpiresAt !== null &&
      u.compTierExpiresAt > now;
    // Underlying name = what the user would see without comp (same
    // helper, but with comp columns blanked out).
    const underlyingId = getEffectiveSubscriptionLevelId(
      {
        subscriptionLevelId: u.subscriptionLevelId,
        subscriptionEndsAt: u.subscriptionEndsAt,
      },
      now,
    );
    const underlyingName = tierNameById.get(underlyingId) ?? "—";
    const showUnderlying = compActive && underlyingName !== effectiveName;
    const isAdmin = SUPERUSER_EMAILS.has(u.email);
    const primaryOrg = u.orgMembers[0] ?? null;
    // Trial-days remaining for any tier with a trialDays window — most
    // visibly Free (seeded with 30 days), but tier admins may add a
    // trial to any tier. Null when the user has no assignment date,
    // when the tier has no trial, or when the trial window is already
    // expired. We pass the integer days the UI should render in
    // purple next to the tier label.
    const effectiveTrialDays = trialDaysById.get(effectiveId) ?? null;
    let freeDaysLeft: number | null = null;
    if (effectiveTrialDays !== null && u.subscriptionAssignedAt) {
      const expiry = new Date(
        u.subscriptionAssignedAt.getTime() + effectiveTrialDays * 24 * 60 * 60 * 1000,
      );
      const days = Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000);
      if (days > 0) freeDaysLeft = days;
    }
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt.toISOString(),
      lastSeenAt: u.lastSeenAt ? u.lastSeenAt.toISOString() : null,
      currentDiagramId: u.currentDiagramId,
      currentDiagramName: u.currentDiagramName,
      _count: u._count,
      subscriptionLabel: isAdmin ? "SuperAdmin" : effectiveName,
      // New: surfaced to the admin table so the chip can render
      // "Free → Expert · COMP" and show days remaining.
      underlyingLabel: !isAdmin && showUnderlying ? underlyingName : null,
      compExpiresAt: !isAdmin && compActive && u.compTierExpiresAt
        ? u.compTierExpiresAt.toISOString()
        : null,
      /** Whole-days remaining on the effective tier's trial window.
       *  Rendered as a purple pill next to the tier name. Null when
       *  the tier has no trial or the trial has already expired. */
      trialDaysLeft: !isAdmin ? freeDaysLeft : null,
      isAdmin,
      // Primary OrgMember (oldest membership). Null only when the user
      // somehow has no OrgMember row — should be impossible after the
      // Phase 0 backfill but the UI handles it gracefully.
      primaryOrg: primaryOrg
        ? { orgId: primaryOrg.orgId, role: primaryOrg.role, orgName: primaryOrg.org.name }
        : null,
    };
  });

  const commitCount = parseInt(process.env.NEXT_PUBLIC_COMMIT_COUNT ?? "0", 10) || 0;
  return <AdminClient users={usersForClient} currentUserId={session.user.id} commitCount={commitCount} />;
}
