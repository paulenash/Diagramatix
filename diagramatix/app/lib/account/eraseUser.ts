// Server-only. Permanently erase a user and their data, then clean up any org
// they leave empty behind (GDPR right to erasure, ENT-12). Extracted so it's
// unit-testable and reusable by the self-service route + admin flows.
import { prisma } from "@/app/lib/db";

/**
 * Delete `userId` (Prisma onDelete:Cascade removes their Diagram / Project /
 * OrgMember / DiagramTemplate / Prompt / DiagramRules / UsageCounter; published
 * versions/bundles survive with a null author). Then remove any org the user
 * belonged to that is now completely empty — no members and, after the cascade,
 * no projects/diagrams. `Project`/`Diagram` are onDelete:Restrict on the org, so
 * an org that still has another member's data is skipped (never errors the erase).
 */
export async function eraseUser(
  userId: string,
  deps: {
    /** Ends the person's Stripe subscription (stripe/endSubscription.ts) so an erased account is never still billed. The routes pass it;
     *  if it throws, NOTHING is deleted. */
    endSubscription?: (subscriptionId: string) => Promise<void>;
  } = {},
): Promise<{ orgsRemoved: number }> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeSubscriptionId: true, orgMembers: { select: { orgId: true } } },
  });
  const orgIds = me?.orgMembers.map((m) => m.orgId) ?? [];

  // First, so that a failure here leaves the person and their data exactly as they were.
  if (me?.stripeSubscriptionId && deps.endSubscription) await deps.endSubscription(me.stripeSubscriptionId);

  await prisma.user.delete({ where: { id: userId } });

  // The images their AI generations were drawn from (AiSourceImage, 2026-09-28)
  // hang off the org, not the user, so the cascade leaves them. Their diagrams
  // are gone now; an image no remaining diagram names is erased with them.
  await prisma.$executeRaw`
    DELETE FROM "AiSourceImage" a
    WHERE a."createdById" = ${userId}
      AND NOT EXISTS (
        SELECT 1 FROM "Diagram" d
        WHERE d.data -> 'aiGeneration' -> 'sourceImage' ->> 'id' = a.id
      )`;

  // Their phone Generate runs (DiagramGenerateJob) hold the words they spoke.
  // Runs on their own diagrams went with the cascade; runs on diagrams they
  // could edit but did not own go here.
  await prisma.diagramGenerateJob.deleteMany({ where: { userId } });
  // Their "send to support" requests hold their words and their email address.
  await prisma.supportRequest.deleteMany({ where: { userId } });

  let orgsRemoved = 0;
  for (const orgId of orgIds) {
    const counts = await prisma.org.findUnique({
      where: { id: orgId },
      select: { _count: { select: { members: true, projects: true, diagrams: true } } },
    });
    if (counts && counts._count.members === 0 && counts._count.projects === 0 && counts._count.diagrams === 0) {
      try { await prisma.org.delete({ where: { id: orgId } }); orgsRemoved++; }
      catch { /* leave any org that still has restricted dependents */ }
    }
  }
  return { orgsRemoved };
}
