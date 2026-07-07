/** One adopted copy of an example per user: before adopting an example, purge any
 *  project this user previously adopted from the SAME example (matched by
 *  `sourceExampleId`), so re-adopting overwrites the prior copy entirely rather
 *  than piling up duplicates. Renamed adopted projects have their
 *  `sourceExampleId` cleared, so they are the user's own work and are left alone. */
import { prisma } from "@/app/lib/db";
import { deleteProjectCascade } from "@/app/lib/projects/deleteProject";

export async function purgePriorExampleCopies(
  sourceExampleId: string,
  actor: { id: string; email: string },
): Promise<number> {
  const prior = await prisma.project.findMany({
    where: { userId: actor.id, sourceExampleId },
    select: { id: true, name: true, orgId: true },
  });
  for (const p of prior) {
    await deleteProjectCascade(p.id, p.orgId, "hard", actor, p.name);
  }
  return prior.length;
}
