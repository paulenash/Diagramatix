/**
 * One ordering of subscription tiers, so "Expert and above" means the same
 * thing everywhere.
 *
 * The app had three partial orderings and no shared one: the view-mode cycle in
 * `useSuperAdminChrome` (a rotation order for the logo double-click, not a
 * rank), a local `TIER_ORDER` inside the usage popover that omits `enterprise`
 * altogether, and the authoritative `SubscriptionLevel.sortOrder` in the
 * database, which the browser cannot see. A rule like Paul's "available for
 * Expert users and above" (2026-09-17) needs a rank on the client, and picking
 * one of those three by accident is how `enterprise` quietly stops counting as
 * above expert.
 *
 * The database remains the authority for what a user actually has. This is for
 * comparing two tier NAMES, which is all the UI ever needs to do.
 */

/** Lowest to highest. A name absent from this list ranks below everything. */
export const TIER_ORDER = [
  "free",
  "introductory",
  "professional",
  "expert",
  "enterprise",
] as const;

export type TierName = (typeof TIER_ORDER)[number];

/**
 * The SuperAdmin view-mode names that are not tiers at all.
 *
 * Someone in one of these modes is not previewing a customer, they are looking
 * at the product as themselves, so they outrank every tier.
 */
const ABOVE_ALL_TIERS = new Set<string>(["superadmin", "orgadmin"]);

/** Rank of a tier or view-mode name. Higher is more capable. */
export function tierRank(name: string | null | undefined): number {
  if (!name) return -1;
  const key = name.toLowerCase();
  if (ABOVE_ALL_TIERS.has(key)) return TIER_ORDER.length;
  return (TIER_ORDER as readonly string[]).indexOf(key);
}

/**
 * True when `actual` is at least `required`.
 *
 * An unrecognised `actual` is treated as below everything, which is the safe
 * direction: a typo hides a feature rather than handing it out.
 */
export function atLeastTier(actual: string | null | undefined, required: TierName): boolean {
  return tierRank(actual) >= tierRank(required);
}
