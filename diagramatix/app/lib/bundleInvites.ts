/**
 * Bundle invite-by-email helpers.
 *
 * Two concerns live here:
 *   1. Promoting any PendingBundleAudience rows for a given email into
 *      real PublicationBundleAudience grants. Called whenever a user
 *      signs in OR registers — both paths funnel into the same helper
 *      so we never miss an invite.
 *   2. The normalisation rule for invite emails. Stored lowercased so
 *      the promotion lookup matches regardless of how the inviter typed
 *      it; same rule applied on the inviter and invitee sides.
 */

import { prisma } from "@/app/lib/db";
import { createNotification } from "@/app/lib/notifications";

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Promote every PendingBundleAudience matching the user's email into a
 * real PublicationBundleAudience row, idempotently. Safe to call on
 * every sign-in; if there are no pending entries, no work is done.
 *
 * Returns the number of bundles the user was just granted access to,
 * so the caller can route them straight to the bundle index when the
 * count is exactly 1 (the most common invitation scenario).
 */
export async function promotePendingAudienceMemberships(
  userId: string,
  email: string,
): Promise<{ promoted: number; firstBundleId: string | null }> {
  const lookup = normaliseEmail(email);
  if (!lookup) return { promoted: 0, firstBundleId: null };

  // Walk every pending row for this email — there may be several across
  // different bundles. Promote each in a transaction so the audience
  // row creation and the pending row deletion either both happen or
  // neither does.
  const pending = await prisma.pendingBundleAudience.findMany({
    where: { email: lookup },
    select: { id: true, bundleId: true, invitedById: true, bundle: { select: { id: true, name: true, supersededAt: true } } },
  });
  if (pending.length === 0) return { promoted: 0, firstBundleId: null };

  let promoted = 0;
  let firstBundleId: string | null = null;
  for (const row of pending) {
    // Bundle archived between invite and acceptance: just drop the
    // pending row so it doesn't clog the table forever. No grant, no
    // notification — the bundle has nothing left to view.
    if (row.bundle.supersededAt) {
      await prisma.pendingBundleAudience.delete({ where: { id: row.id } }).catch(() => {});
      continue;
    }
    try {
      // Grant + pending-row delete are atomic: either the user becomes an
      // audience member AND the pending row goes, or neither happens.
      await prisma.$transaction(async (tx) => {
        await tx.publicationBundleAudience.create({
          data: {
            bundleId: row.bundleId,
            userId,
            addedById: row.invitedById,
          },
        });
        await tx.pendingBundleAudience.delete({ where: { id: row.id } });
      });
      promoted++;
      if (!firstBundleId) firstBundleId = row.bundleId;
      // The notification is best-effort and OUTSIDE the transaction — a failure
      // here must not roll back the grant nor be mistaken for a promotion
      // failure (which below would keep the pending row for retry).
      try {
        await createNotification(userId, "bundle-published", {
          bundleId: row.bundleId,
          bundleName: row.bundle.name,
          fromUserId: row.invitedById ?? undefined,
        });
      } catch (notifyErr) {
        console.warn("[bundle-invites] promoted but notification failed", row.id, notifyErr instanceof Error ? notifyErr.message : notifyErr);
      }
    } catch (err) {
      // DATA-09: only DROP the pending row when it is genuinely redundant —
      // i.e. the user is ALREADY an audience member (a unique-constraint
      // collision, Prisma P2002). For ANY OTHER error (deadlock, DB blip, a
      // transient failure) the invite must be KEPT so a later acceptance can
      // retry it; deleting it here silently and permanently discards access the
      // invitee was promised.
      const alreadyMember = typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
      if (alreadyMember) {
        await prisma.pendingBundleAudience.delete({ where: { id: row.id } }).catch(() => {});
      } else {
        console.warn("[bundle-invites] promote failed — invite kept for retry", row.id, err instanceof Error ? err.message : err);
      }
    }
  }

  return { promoted, firstBundleId };
}
