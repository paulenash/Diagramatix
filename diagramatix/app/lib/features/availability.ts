/**
 * Feature-availability resolution — the SINGLE SOURCE OF TRUTH for what features a
 * user gets, in three states: "available" | "disabled" | "hidden". Resolves from
 * the FeatureAvailability matrix (per subscription level), overlaid with the user's
 * SuperUser per-user overrides (User.featureOverrides). SuperAdmins get everything.
 *
 * Precedence:  SuperAdmin → all available
 *              else        → effective-level matrix, then per-user override
 *
 * Config UI: dashboard/admin/feature-availability (the grid) + the per-user popover.
 */
import { prisma } from "@/app/lib/db";
import { getEffectiveSubscriptionLevelId, resolveEffectiveLevelId } from "./effectiveLevel";
import { SUPERUSER_EMAILS } from "@/app/lib/superuser";
import { FEATURE_KEYS } from "./registry";
import { applyDependencies } from "./dependencies";

export type FeatureState = "available" | "disabled" | "hidden";
export type FeatureStateMap = Record<string, FeatureState>;

const VALID: readonly FeatureState[] = ["available", "disabled", "hidden"];
export function coerceState(s: unknown): FeatureState {
  return (VALID as string[]).includes(s as string) ? (s as FeatureState) : "hidden";
}

function isAdminEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").toLowerCase();
  return [...SUPERUSER_EMAILS].some((s) => s.toLowerCase() === e);
}

// The effective-level resolution lives in effectiveLevel.ts (one place, shared with the limits);
// re-exported here because the feature-side callers have always imported it from this module.
export { resolveEffectiveLevelId, clearLevelOrders } from "./effectiveLevel";

/** Every feature available (SuperAdmin bypass). */
export function allAvailable(): FeatureStateMap {
  const m: FeatureStateMap = {};
  for (const k of FEATURE_KEYS) m[k] = "available";
  return m;
}

/** The stored matrix for one subscription level. Gaps FAIL OPEN → `available`: an
 *  unconfigured matrix (e.g. before the seed runs, or a newly-added feature not yet
 *  seeded for this level) never silently locks a feature out. Restriction only
 *  applies once a row explicitly sets `hidden`/`disabled`. */
export async function getLevelMatrix(levelId: string): Promise<FeatureStateMap> {
  const rows = await prisma.featureAvailability.findMany({
    where: { levelId },
    select: { featureKey: true, state: true },
  });
  const m: FeatureStateMap = {};
  for (const k of FEATURE_KEYS) m[k] = "available";
  for (const r of rows) if (FEATURE_KEYS.includes(r.featureKey)) m[r.featureKey] = coerceState(r.state);
  return m;
}

/** Resolve the full state map for a user (comp/grace-aware effective level + override). */
export async function getFeatureStates(userId: string): Promise<FeatureStateMap> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true, subscriptionLevelId: true, subscriptionEndsAt: true,
      compTierLevelId: true, compTierExpiresAt: true, featureOverrides: true,
    },
  });
  if (!u) return {};
  if (isAdminEmail(u.email)) return allAvailable();

  const levelId = (await resolveEffectiveLevelId(userId)) ?? getEffectiveSubscriptionLevelId(u);
  const map = await getLevelMatrix(levelId);
  const overrides = (u.featureOverrides ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(overrides)) if (FEATURE_KEYS.includes(k)) map[k] = coerceState(v);
  // A feature that requires others is only as available as the weakest of them (dependencies.ts) —
  // applied after the overrides, so an override on a prerequisite flows through to what needs it.
  return applyDependencies(map);
}

export function stateOf(map: FeatureStateMap | null | undefined, key: string): FeatureState {
  return (map?.[key] as FeatureState) ?? "hidden";
}
export function isAvailable(map: FeatureStateMap | null | undefined, key: string): boolean {
  return stateOf(map, key) === "available";
}
