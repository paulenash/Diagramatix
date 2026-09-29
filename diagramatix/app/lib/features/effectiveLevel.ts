/**
 * The EFFECTIVE subscription level of a user — the one place it is decided, for
 * the feature matrix, the numeric limits, the usage snapshot and the editor's
 * element cap alike. (They used to disagree: the feature matrix looked at the
 * person's organisations, the limits did not — an Enterprise-organisation
 * member on Free got Enterprise features but Free's caps.)
 *
 * Precedence:
 *   1. an active comp grant wins outright;
 *   2. else the HIGHEST (by sortOrder) of the user's own level — after the
 *      cancelled-subscription grace downgrade to Free — and any level assigned
 *      to an organisation they belong to. A whole organisation (by claimed email
 *      domain) can therefore be put on Enterprise.
 *
 * A LEAF module: it imports only the database, so subscription.ts and
 * availability.ts can both import it statically (the dynamic `import()` that
 * dodged their cycle is gone).
 */
import { prisma } from "@/app/lib/db";

export type LevelSource = "comp" | "org" | "own";

/**
 * Pure. The user's own level: an active comp grant, else the grace downgrade
 * for a cancelled paid subscription (lazy, no cron), else the stored level,
 * else "free".
 */
export function getEffectiveSubscriptionLevelId(
  user: {
    subscriptionLevelId: string | null;
    subscriptionEndsAt: Date | null;
    compTierLevelId?: string | null;
    compTierExpiresAt?: Date | null;
  },
  now: Date = new Date(),
): string {
  // 1. Comp grant wins if still active.
  if (user.compTierLevelId && user.compTierExpiresAt && user.compTierExpiresAt > now) return user.compTierLevelId;
  // 2. Grace-period downgrade for canceled paid subs.
  if (user.subscriptionEndsAt && user.subscriptionEndsAt <= now && user.subscriptionLevelId !== "free") return "free";
  // 3. Whatever the paid path / TierPicker set.
  return user.subscriptionLevelId ?? "free";
}

/** Pure. The higher (by sortOrder) of a person's own level and their organisations' levels. Unknown ids rank lowest. */
export function highestLevel(ownId: string, orgLevelIds: readonly string[], orders: ReadonlyMap<string, number>): { id: string; source: "org" | "own" } {
  let best = ownId;
  let source: "org" | "own" = "own";
  for (const id of orgLevelIds) {
    if ((orders.get(id) ?? -1) > (orders.get(best) ?? -1)) { best = id; source = "org"; }
  }
  return { id: best, source };
}

// Level sort orders, kept for a minute: a level added or re-ordered in the SuperAdmin editor is
// picked up without a restart.
const ORDERS_TTL_MS = 60_000;
let _orders: Map<string, number> | null = null;
let _ordersAt = 0;
/** Forget the cached level orders (the subscriptions editor calls this after a save; tests). */
export function clearLevelOrders(): void { _orders = null; }
export async function levelOrders(): Promise<Map<string, number>> {
  if (!_orders || Date.now() - _ordersAt > ORDERS_TTL_MS) {
    const ls = await prisma.subscriptionLevel.findMany({ select: { id: true, sortOrder: true } });
    _orders = new Map(ls.map((l) => [l.id, l.sortOrder]));
    _ordersAt = Date.now();
  }
  return _orders;
}

/** The levels assigned to the organisations a user belongs to. */
export async function orgLevelIdsFor(userId: string): Promise<string[]> {
  const memberships = await prisma.orgMember.findMany({
    where: { userId },
    select: { org: { select: { subscriptionLevelId: true } } },
  });
  return memberships.map((m) => m.org.subscriptionLevelId).filter((x): x is string => !!x);
}

/** Apply the organisation rule to an already-resolved own level (comp is decided before this is called). */
export async function withOrgLevel(userId: string, ownId: string): Promise<{ id: string; source: "org" | "own" }> {
  const orgIds = await orgLevelIdsFor(userId);
  if (!orgIds.length) return { id: ownId, source: "own" };
  return highestLevel(ownId, orgIds, await levelOrders());
}

/**
 * The effective level id for a user, org-aware (see the precedence above);
 * null when the user does not exist.
 */
export async function resolveEffectiveLevelId(userId: string): Promise<string | null> {
  const r = await resolveEffectiveLevel(userId);
  return r ? r.id : null;
}

export async function resolveEffectiveLevel(userId: string): Promise<{ id: string; source: LevelSource } | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionLevelId: true, subscriptionEndsAt: true, compTierLevelId: true, compTierExpiresAt: true },
  });
  if (!u) return null;
  const now = new Date();
  if (u.compTierLevelId && u.compTierExpiresAt && u.compTierExpiresAt > now) return { id: u.compTierLevelId, source: "comp" };
  return withOrgLevel(userId, getEffectiveSubscriptionLevelId(u, now));
}
