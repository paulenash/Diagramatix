/**
 * The per-diagram element cap for a user, from their subscription level — read
 * on the server for the desktop page and for the phone (GET /api/diagrams/[id]).
 * Admins (SUPERUSER_EMAILS) and assigned reviewers are not capped (null); the
 * BPMN limit applies to BPMN diagrams, the other to the rest.
 */
import { prisma } from "@/app/lib/db";
import { SUPERUSER_EMAILS } from "@/app/lib/superuser";
import { resolveEffectiveLevelId } from "@/app/lib/features/effectiveLevel";
import { currentActAsLevel } from "@/app/lib/features/actAs";
import { applyLimitOverrides } from "@/app/lib/features/userOverrides";

export async function elementCountLimitFor(
  effectiveUserId: string,
  diagramType: string,
  reviewerAccess = false,
): Promise<number | null> {
  if (reviewerAccess) return null;
  const user = await prisma.user.findUnique({
    where: { id: effectiveUserId },
    select: { email: true, subscriptionLevelId: true, limitOverrides: true, overridesExpireAt: true, subscriptionLevel: { select: { maxBpmnElementsPerDiagram: true, maxNonBpmnElementsPerDiagram: true } } },
  });
  if (!user) return null;
  const isAdmin = [...SUPERUSER_EMAILS].some((s) => s.toLowerCase() === user.email.toLowerCase());
  // A SuperAdmin acting as a customer level is capped as that level (features/actAs.ts).
  const actAs = isAdmin ? await currentActAsLevel() : null;
  if (isAdmin && !actAs) return null;
  // The EFFECTIVE level — comp, grace and the person's organisations included — the same one the
  // server's limit checks use. (It used to read the stored level, so a comped Expert was still
  // capped as Free in the editor, and a downgraded user by their old tier.)
  const levelId = actAs ?? (await resolveEffectiveLevelId(effectiveUserId)) ?? user.subscriptionLevelId;
  const level = levelId && levelId !== user.subscriptionLevelId
    ? await prisma.subscriptionLevel.findUnique({ where: { id: levelId }, select: { maxBpmnElementsPerDiagram: true, maxNonBpmnElementsPerDiagram: true } })
    : user.subscriptionLevel;
  // This person's own overrides on top of the level (not while a SuperAdmin previews a level as itself).
  const merged = level && !actAs ? applyLimitOverrides(level as never, user.limitOverrides, user.overridesExpireAt) as typeof level : level;
  return (diagramType === "bpmn" ? merged?.maxBpmnElementsPerDiagram : merged?.maxNonBpmnElementsPerDiagram) ?? null;
}
