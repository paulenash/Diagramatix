/**
 * Who may have Diagramatix speak — server-only.
 *
 * Paul, 2026-09-25: "Default is on for SuperAdmin users, off for everyone else",
 * and a SuperAdmin turns it on for selected users.
 *
 * WHY THIS IS NOT `gateFeature`. The feature matrix FAILS OPEN — a feature with
 * no row for a level resolves as `available` (`getLevelMatrix`), which is the
 * right default for a feature that already existed when the matrix arrived and
 * the wrong one here. Speech is new, costs money per sentence, and is meant to be
 * off: through `gateFeature` it would have been ON for every user of every tier
 * from the moment it deployed until somebody ran a seed on production. So this
 * gate fails CLOSED, and a missing row means no.
 *
 * The three sources, in order, each of which is a DELIBERATE decision somebody
 * made — never an absence:
 *   1. a SuperAdmin — on, always;
 *   2. the user's own override, set from Registered Users → Features — decides
 *      either way, since it is the most specific thing anyone said;
 *   3. an EXPLICIT `available` row for the user's effective level — so turning
 *      it on for a whole tier later is still a matrix edit, not a code change.
 */

import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { resolveEffectiveLevelId } from "@/app/lib/features/availability";

export const SPEECH_FEATURE_KEY = "voice-feedback";

type SessionLike = { user?: { id?: string | null; email?: string | null } | null } | null;

export async function speechGranted(session: SessionLike): Promise<boolean> {
  const userId = session?.user?.id;
  if (!userId) return false;
  if (isSuperuser(session as never)) return true;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { featureOverrides: true },
  });
  if (!user) return false;

  const override = (user.featureOverrides as Record<string, unknown> | null)?.[SPEECH_FEATURE_KEY];
  if (override !== undefined && override !== null) return override === "available";

  const levelId = await resolveEffectiveLevelId(userId);
  if (!levelId) return false;
  const row = await prisma.featureAvailability.findUnique({
    where: { levelId_featureKey: { levelId, featureKey: SPEECH_FEATURE_KEY } },
    select: { state: true },
  });
  return row?.state === "available";
}
