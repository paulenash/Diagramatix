/**
 * The user rows the dashboard page needs, fetched once each.
 *
 * The page used to look the same user up four times on the way to its first
 * render — "does the impersonation target exist", "name/email for the header",
 * "name/email for the banner" and "hasChosenTier for the tier picker" — each an
 * awaited round-trip on the cold path a deploy makes slow. There are only two
 * people involved: the EFFECTIVE user (whose dashboard is shown) and the
 * SIGNED-IN user (whose tier picker it is). When nobody is impersonating they
 * are the same row.
 */
export interface DashboardUserRow {
  id: string;
  name: string | null;
  email: string | null;
  hasChosenTier: boolean;
}

export type FindUser = (id: string) => Promise<DashboardUserRow | null>;

export interface DashboardUsers {
  effectiveUserId: string;
  viewing: boolean;
  /** The impersonation target, or the signed-in user when not impersonating. */
  effective: DashboardUserRow | null;
  /** The SIGNED-IN user's flag — an admin viewing someone else must not see
   *  THEIR picker. */
  realHasChosenTier: boolean;
}

export async function loadDashboardUsers(
  findUser: FindUser,
  sessionUserId: string,
  requested: { effectiveUserId: string; viewing: boolean },
  /** Called when the impersonation cookie names a user that no longer exists. */
  onStaleTarget?: () => void,
): Promise<DashboardUsers> {
  let { effectiveUserId, viewing } = requested;
  let effective = await findUser(effectiveUserId);

  if (viewing && !effective) {
    // Stale cookie: fall back to the signed-in user, as the page always has.
    onStaleTarget?.();
    effectiveUserId = sessionUserId;
    viewing = false;
    effective = await findUser(sessionUserId);
  }

  // Not impersonating ⇒ effective IS the signed-in user; no second lookup.
  const real = viewing ? await findUser(sessionUserId) : effective;
  return { effectiveUserId, viewing, effective, realHasChosenTier: real?.hasChosenTier ?? false };
}
