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
        subscriptionLevel: { select: { id: true, name: true } },
        subscriptionEndsAt: true,
        compTierLevelId: true,
        compTierExpiresAt: true,
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
      select: { id: true, name: true },
    }),
  ]);
  const tierNameById = new Map(allTiers.map(t => [t.id, t.name]));

  const now = new Date();

  // Serialise dates + map the synthetic "Administration" tier for users
  // in the SUPERUSER_EMAILS allowlist (those bypass enforcement so their
  // stored tier — usually Expert from the grandfather seed — is moot).
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
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt.toISOString(),
      lastSeenAt: u.lastSeenAt ? u.lastSeenAt.toISOString() : null,
      currentDiagramId: u.currentDiagramId,
      currentDiagramName: u.currentDiagramName,
      _count: u._count,
      subscriptionLabel: isAdmin ? "Administration" : effectiveName,
      // New: surfaced to the admin table so the chip can render
      // "Free → Expert · COMP" and show days remaining.
      underlyingLabel: !isAdmin && showUnderlying ? underlyingName : null,
      compExpiresAt: !isAdmin && compActive && u.compTierExpiresAt
        ? u.compTierExpiresAt.toISOString()
        : null,
      isAdmin,
    };
  });

  return <AdminClient users={usersForClient} currentUserId={session.user.id} />;
}
