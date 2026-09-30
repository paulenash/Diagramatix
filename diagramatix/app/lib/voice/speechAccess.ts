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
import { currentActAsLevel } from "@/app/lib/features/actAs";
import { overrideValue, overridesExpired } from "@/app/lib/features/userOverrides";

export const SPEECH_FEATURE_KEY = "voice-feedback";

type SessionLike = { user?: { id?: string | null; email?: string | null } | null } | null;

export async function speechGranted(session: SessionLike): Promise<boolean> {
  const userId = session?.user?.id;
  if (!userId) return false;
  // A SuperAdmin is granted — unless acting as a customer level, when the level's own row decides.
  const actAs = isSuperuser(session as never) ? await currentActAsLevel() : null;
  if (isSuperuser(session as never) && !actAs) return true;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { featureOverrides: true, overridesExpireAt: true },
  });
  if (!user) return false;

  // A personal override (bare string, or { s, base } from the customise panel); none once it has expired.
  const override = actAs || overridesExpired(user.overridesExpireAt)
    ? undefined
    : overrideValue((user.featureOverrides as Record<string, unknown> | null)?.[SPEECH_FEATURE_KEY]);
  if (override !== undefined) return override === "available";

  const levelId = actAs ?? (await resolveEffectiveLevelId(userId));
  if (!levelId) return false;
  const row = await prisma.featureAvailability.findUnique({
    where: { levelId_featureKey: { levelId, featureKey: SPEECH_FEATURE_KEY } },
    select: { state: true },
  });
  return row?.state === "available";
}
