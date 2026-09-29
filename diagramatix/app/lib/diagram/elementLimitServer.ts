/**
 * The per-diagram element cap for a user, from their subscription level — read
 * on the server for the desktop page and for the phone (GET /api/diagrams/[id]).
 * Admins (SUPERUSER_EMAILS) and assigned reviewers are not capped (null); the
 * BPMN limit applies to BPMN diagrams, the other to the rest.
 */
import { prisma } from "@/app/lib/db";
import { SUPERUSER_EMAILS } from "@/app/lib/superuser";

export async function elementCountLimitFor(
  effectiveUserId: string,
  diagramType: string,
  reviewerAccess = false,
): Promise<number | null> {
  if (reviewerAccess) return null;
  const user = await prisma.user.findUnique({
    where: { id: effectiveUserId },
    select: { email: true, subscriptionLevel: { select: { maxBpmnElementsPerDiagram: true, maxNonBpmnElementsPerDiagram: true } } },
  });
  if (!user || SUPERUSER_EMAILS.has(user.email)) return null;
  return (diagramType === "bpmn" ? user.subscriptionLevel?.maxBpmnElementsPerDiagram : user.subscriptionLevel?.maxNonBpmnElementsPerDiagram) ?? null;
}
