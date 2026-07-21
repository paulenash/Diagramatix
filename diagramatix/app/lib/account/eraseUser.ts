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
export async function eraseUser(userId: string): Promise<{ orgsRemoved: number }> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { orgMembers: { select: { orgId: true } } },
  });
  const orgIds = me?.orgMembers.map((m) => m.orgId) ?? [];

  await prisma.user.delete({ where: { id: userId } });

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
