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
import { getEffectiveSubscriptionLevelId } from "@/app/lib/subscription";
import { SUPERUSER_EMAILS } from "@/app/lib/superuser";
import { FEATURE_KEYS } from "./registry";

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

let _orders: Map<string, number> | null = null;
async function levelOrders(): Promise<Map<string, number>> {
  if (!_orders) {
    const ls = await prisma.subscriptionLevel.findMany({ select: { id: true, sortOrder: true } });
    _orders = new Map(ls.map((l) => [l.id, l.sortOrder]));
  }
  return _orders;
}

/**
 * The effective subscription level id for a user, org-aware:
 *   • an active per-user comp grant wins outright (existing behaviour), else
 *   • the HIGHEST of the user's own (grace-adjusted) level and any level assigned
 *     to an org they belong to — so a SuperAdmin can put a whole org (by claimed
 *     email domain) on Enterprise and every member resolves to it.
 */
export async function resolveEffectiveLevelId(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionLevelId: true, subscriptionEndsAt: true, compTierLevelId: true, compTierExpiresAt: true },
  });
  if (!u) return null;
  const now = new Date();
  if (u.compTierLevelId && u.compTierExpiresAt && u.compTierExpiresAt > now) return u.compTierLevelId;

  const individual = getEffectiveSubscriptionLevelId(u, now); // grace-adjusted, no comp
  const memberships = await prisma.orgMember.findMany({
    where: { userId },
    select: { org: { select: { subscriptionLevelId: true } } },
  });
  const orgLevelIds = memberships.map((m) => m.org.subscriptionLevelId).filter((x): x is string => !!x);
  if (!orgLevelIds.length) return individual;

  const orders = await levelOrders();
  let best = individual;
  for (const id of orgLevelIds) if ((orders.get(id) ?? -1) > (orders.get(best) ?? -1)) best = id;
  return best;
}

/** Every feature available (SuperAdmin bypass). */
export function allAvailable(): FeatureStateMap {
  const m: FeatureStateMap = {};
  for (const k of FEATURE_KEYS) m[k] = "available";
  return m;
}

/** The stored matrix for one subscription level (default `hidden` for any gap). */
export async function getLevelMatrix(levelId: string): Promise<FeatureStateMap> {
  const rows = await prisma.featureAvailability.findMany({
    where: { levelId },
    select: { featureKey: true, state: true },
  });
  const m: FeatureStateMap = {};
  for (const k of FEATURE_KEYS) m[k] = "hidden";
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
  return map;
}

export function stateOf(map: FeatureStateMap | null | undefined, key: string): FeatureState {
  return (map?.[key] as FeatureState) ?? "hidden";
}
export function isAvailable(map: FeatureStateMap | null | undefined, key: string): boolean {
  return stateOf(map, key) === "available";
}
