/**
 * Subscription enforcement library.
 *
 * Single entry point for limit checks and event-counter increments. Every
 * mutating API route hooks into `checkLimit(userId, metric, ctx)` BEFORE
 * doing work, and `recordUsage(userId, metric)` AFTER successful
 * completion. The popover backed by `getUsageSnapshot(userId)` reads the
 * same data through the same library so the UI never disagrees with the
 * enforcer.
 *
 * Tiers come from the SubscriptionLevel table (SuperAdmin-editable via
 * the Subscription Prices and Limits page). The synthetic "SuperAdmin"
 * tier label is derived from SUPERUSER_EMAILS — SuperAdmins always
 * bypass enforcement, regardless of what subscriptionLevelId the row has.
 *
 * Counters:
 *  - Lifetime (Free's AI / individual exports / individual imports):
 *    periodKey = "all-time". One row per user per metric.
 *  - Monthly anniversary (everything else that resets): periodKey is the
 *    ISO date of the current period's start, computed from the user's
 *    subscriptionAssignedAt anniversary day. e.g. user assigned 15 May →
 *    periods are 15 May, 15 Jun, 15 Jul... If anchor day doesn't exist
 *    in a target month (registered 31 Jan → February), the period start
 *    snaps to the last day of that month.
 *
 * Point-in-time metrics (project count, diagrams-per-type-per-project,
 * archimate total, element counts) are computed from the actual tables
 * — no UsageCounter row needed.
 */

import { prisma } from "./db";
import { SUPERUSER_EMAILS } from "./superuser";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type LimitMetric =
  | "projects"
  | "diagramsPerTypePerProject"
  | "archimateDiagramsTotal"
  | "nonBpmnElementsPerDiagram"
  | "bpmnElementsPerDiagram"
  | "aiAttempts"
  | "individualExports"
  | "individualImports"
  | "bulkExports"
  | "bulkImports";

/** Subset of metrics that are tracked via UsageCounter rows (event-based). */
export type EventMetric = Extract<
  LimitMetric,
  "aiAttempts" | "individualExports" | "individualImports" | "bulkExports" | "bulkImports"
>;

// ─────────────────────────────────────────────────────────────────────────────
// Per-tier feature entitlements (SuperAdmin allocates which features a tier gets)
// ─────────────────────────────────────────────────────────────────────────────

/** Major features that can be allocated per subscription tier. `riskControl`
 *  covers BOTH the Risk-Control Matrix and Compliance Monitoring. */
export type FeatureKey = "simulator" | "processMining" | "riskControl" | "apqc";

export const FEATURE_KEYS: FeatureKey[] = ["simulator", "processMining", "riskControl", "apqc"];

/** Human labels for the admin allocation matrix / messages. */
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  simulator: "Simulator",
  processMining: "Process Mining",
  riskControl: "Risk & Control + Compliance",
  apqc: "APQC Catalog",
};

/** Feature keys that have an Examples gallery (drives the Hide-Examples button). */
export const EXAMPLE_FEATURE_KEYS: FeatureKey[] = ["simulator", "processMining", "riskControl"];

export type Entitlements = Record<FeatureKey, boolean>;

/** The column on SubscriptionLevel that backs each feature key. */
const FEATURE_COLUMN: Record<FeatureKey, "hasSimulator" | "hasProcessMining" | "hasRiskControl" | "hasApqc"> = {
  simulator: "hasSimulator",
  processMining: "hasProcessMining",
  riskControl: "hasRiskControl",
  apqc: "hasApqc",
};

const ALL_FEATURES_ON: Entitlements = { simulator: true, processMining: true, riskControl: true, apqc: true };
const ALL_FEATURES_OFF: Entitlements = { simulator: false, processMining: false, riskControl: false, apqc: false };

/** Pure: derive entitlements from a tier level row. SuperAdmins get everything.
 *  A missing level (shouldn't happen post-seed) is treated as no access. */
export function entitlementsForLevel(
  level: { hasSimulator: boolean; hasProcessMining: boolean; hasRiskControl: boolean; hasApqc: boolean } | null,
  isAdmin = false,
): Entitlements {
  if (isAdmin) return { ...ALL_FEATURES_ON };
  if (!level) return { ...ALL_FEATURES_OFF };
  return {
    simulator: level[FEATURE_COLUMN.simulator],
    processMining: level[FEATURE_COLUMN.processMining],
    riskControl: level[FEATURE_COLUMN.riskControl],
    apqc: level[FEATURE_COLUMN.apqc],
  };
}

export type EnforcementOk = { ok: true };
export type EnforcementBlocked = {
  ok: false;
  /** Free-form, user-facing message. The route layer can pass it straight
   *  through in the 402/403 response body. */
  reason: string;
  /** Either a LimitMetric or "trial" when the block is due to trial expiry. */
  metric: LimitMetric | "trial";
  current: number;
  limit: number;
};
export type EnforcementResult = EnforcementOk | EnforcementBlocked;

/** Extra context that the various metrics need from the caller. */
export interface CheckContext {
  /** For diagramsPerTypePerProject. */
  projectId?: string;
  /** For diagramsPerTypePerProject and archimate. */
  diagramType?: string;
  /** For element-count metrics — the proposed total element count the
   *  caller wants to allow. e.g. adding the 16th element → pass 16. */
  proposedElementCount?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Period-key computation (anniversary-day monthly)
// ─────────────────────────────────────────────────────────────────────────────

/** ISO date string ("YYYY-MM-DD") of the most recent anniversary date at
 *  or before `now`, falling back to the last day of the target month if
 *  the anchor day doesn't exist there (e.g. anchor 31, in February).
 *
 *  Edge case: if the computed period start would land BEFORE the anchor
 *  itself (i.e. `now` is somehow before the user was assigned), the
 *  anchor date is returned — the user is in their first-ever period. */
export function monthlyPeriodKey(anchor: Date, now: Date = new Date()): string {
  const start = monthlyPeriodStart(anchor, now);
  return isoDateUTC(start);
}

function monthlyPeriodStart(anchor: Date, now: Date): Date {
  const anchorDay = anchor.getUTCDate();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  const thisMonthStart = clampDayUTC(year, month, anchorDay);
  if (now.getTime() >= thisMonthStart.getTime()) {
    return maxDate(thisMonthStart, anchor);
  }

  // Period started last month.
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const prevMonthStart = clampDayUTC(prevYear, prevMonth, anchorDay);
  return maxDate(prevMonthStart, anchor);
}

/** Builds a UTC date for `year/month/day` but clamps `day` to the last
 *  day of `month` if it overshoots. */
function clampDayUTC(year: number, month: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function isoDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Returns the periodKey to use for an event metric for a given user/tier.
 *  "all-time" for lifetime counters; monthly anniversary date otherwise. */
function periodKeyForEventMetric(
  user: { subscriptionAssignedAt: Date | null; createdAt: Date },
  tier: SubscriptionLevelRow,
  metric: EventMetric,
  now: Date = new Date(),
): string {
  const isLifetime =
    (metric === "aiAttempts" && !tier.aiAttemptsResetMonthly) ||
    (metric === "individualExports" && !tier.individualExportsResetMonthly) ||
    (metric === "individualImports" && !tier.individualImportsResetMonthly);
  if (isLifetime) return "all-time";

  // Bulk metrics are always monthly (no resetMonthly flag on the tier).
  const anchor = user.subscriptionAssignedAt ?? user.createdAt;
  return monthlyPeriodKey(anchor, now);
}

// ─────────────────────────────────────────────────────────────────────────────
// Trial expiry
// ─────────────────────────────────────────────────────────────────────────────

/** True iff the user's current tier has a trialDays limit and that window
 *  has elapsed since subscriptionAssignedAt. */
export function trialExpired(
  user: { subscriptionAssignedAt: Date | null },
  tier: { trialDays: number | null },
  now: Date = new Date(),
): boolean {
  if (tier.trialDays === null) return false;
  if (!user.subscriptionAssignedAt) return false;
  const expiry = new Date(
    user.subscriptionAssignedAt.getTime() + tier.trialDays * 24 * 60 * 60 * 1000,
  );
  return now.getTime() >= expiry.getTime();
}

/** Milliseconds until trial expiry (negative if already expired). null if
 *  the tier has no trial window or the user has no assignment date. */
export function trialMillisRemaining(
  user: { subscriptionAssignedAt: Date | null },
  tier: { trialDays: number | null },
  now: Date = new Date(),
): number | null {
  if (tier.trialDays === null) return null;
  if (!user.subscriptionAssignedAt) return null;
  const expiry = new Date(
    user.subscriptionAssignedAt.getTime() + tier.trialDays * 24 * 60 * 60 * 1000,
  );
  return expiry.getTime() - now.getTime();
}

// ─────────────────────────────────────────────────────────────────────────────
// Limit lookup
// ─────────────────────────────────────────────────────────────────────────────

/** Map a LimitMetric to its tier-row column. null means unlimited. */
function tierLimitFor(tier: SubscriptionLevelRow, metric: LimitMetric): number | null {
  switch (metric) {
    case "projects":                    return tier.maxProjects;
    case "diagramsPerTypePerProject":   return tier.maxDiagramsPerTypePerProject;
    case "archimateDiagramsTotal":      return tier.maxArchimateDiagramsTotal;
    case "nonBpmnElementsPerDiagram":   return tier.maxNonBpmnElementsPerDiagram;
    case "bpmnElementsPerDiagram":      return tier.maxBpmnElementsPerDiagram;
    case "aiAttempts":                  return tier.maxAiAttempts;
    case "individualExports":           return tier.maxIndividualExports;
    case "individualImports":           return tier.maxIndividualImports;
    case "bulkExports":                 return tier.maxBulkExports;
    case "bulkImports":                 return tier.maxBulkImports;
  }
}

/** Map an EventMetric to its UsageCounter.metric string (snake_case as
 *  documented in the schema). */
function eventMetricDbKey(metric: EventMetric): string {
  switch (metric) {
    case "aiAttempts":         return "ai_attempts";
    case "individualExports":  return "individual_exports";
    case "individualImports":  return "individual_imports";
    case "bulkExports":        return "bulk_exports";
    case "bulkImports":        return "bulk_imports";
  }
}

const METRIC_LABELS: Record<LimitMetric, string> = {
  projects:                  "Projects",
  diagramsPerTypePerProject: "Diagrams per type per project",
  archimateDiagramsTotal:    "Archimate diagrams (total)",
  nonBpmnElementsPerDiagram: "Elements per non-BPMN diagram",
  bpmnElementsPerDiagram:    "Elements per BPMN diagram",
  aiAttempts:                "AI Generate attempts",
  individualExports:         "Individual diagram exports",
  individualImports:         "Individual diagram imports",
  bulkExports:               "Bulk exports",
  bulkImports:               "Bulk imports",
};

// ─────────────────────────────────────────────────────────────────────────────
// User / tier loading
// ─────────────────────────────────────────────────────────────────────────────

type SubscriptionLevelRow = NonNullable<
  Awaited<ReturnType<typeof prisma.subscriptionLevel.findUnique>>
>;
type UserWithTier = {
  id: string;
  email: string;
  createdAt: Date;
  subscriptionAssignedAt: Date | null;
  subscriptionEndsAt: Date | null;
  /** The EFFECTIVE tier — comp wins when active, otherwise the
   *  underlying. Null only if neither is set (shouldn't happen in
   *  practice since registration assigns Free). */
  subscriptionLevel: SubscriptionLevelRow | null;
  /** The UNDERLYING tier — what the user would be on if the comp
   *  weren't active. Populated whenever a comp is overriding a
   *  different tier; same as `subscriptionLevel` when no comp.
   *  Lets the UI render `Free → Expert · COMP`. */
  underlyingLevel: SubscriptionLevelRow | null;
  /** When the effective tier is from an active admin comp grant, this
   *  carries the grant metadata so the UI can show "(comp · expires X)"
   *  and the admin popover can offer a Revoke button. Null when the
   *  effective tier comes from the regular paid/free path. */
  comp: { tierLevelId: string; expiresAt: Date; grantedAt: Date | null } | null;
};

/**
 * Resolve the EFFECTIVE subscription tier id for a user, accounting for:
 *
 *   1. An active admin-granted comp tier (highest priority — comp wins
 *      over both the paid sub and any grace-period downgrade).
 *   2. A canceled-and-expired Stripe subscription — when
 *      `subscriptionEndsAt` has passed, the user lazy-downgrades to
 *      Free without a cron job.
 *   3. The user's stored `subscriptionLevelId`, defaulting to "free"
 *      when null.
 *
 * Pure function. Doesn't touch the DB; the caller must already have
 * read the relevant columns.
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
  if (
    user.compTierLevelId &&
    user.compTierExpiresAt &&
    user.compTierExpiresAt > now
  ) {
    return user.compTierLevelId;
  }
  // 2. Grace-period downgrade for canceled paid subs.
  if (
    user.subscriptionEndsAt &&
    user.subscriptionEndsAt <= now &&
    user.subscriptionLevelId !== "free"
  ) {
    return "free";
  }
  // 3. Whatever the paid path / TierPicker set.
  return user.subscriptionLevelId ?? "free";
}

async function loadUserWithTier(userId: string): Promise<UserWithTier | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscriptionLevel: true },
  });
  if (!u) return null;
  // Resolve the effective tier via the same helper UI / API uses. This
  // collapses the comp-vs-paid-vs-canceled-grace decision into a single
  // string the rest of the system can treat uniformly.
  const now = new Date();
  const effectiveId = getEffectiveSubscriptionLevelId(
    {
      subscriptionLevelId: u.subscriptionLevelId,
      subscriptionEndsAt: u.subscriptionEndsAt,
      compTierLevelId: u.compTierLevelId,
      compTierExpiresAt: u.compTierExpiresAt,
    },
    now,
  );
  // Underlying tier (what the user would be on without the comp).
  // This is `u.subscriptionLevel` straight from the Prisma include,
  // possibly downgraded to Free by the grace-period rule. Compute
  // separately from the effective tier so the UI can show both.
  const underlyingId = getEffectiveSubscriptionLevelId(
    {
      subscriptionLevelId: u.subscriptionLevelId,
      subscriptionEndsAt: u.subscriptionEndsAt,
      // Comp columns deliberately omitted — we want the
      // "without-comp" answer here.
    },
    now,
  );
  let underlyingLevel = u.subscriptionLevel;
  if (underlyingLevel && underlyingId !== underlyingLevel.id) {
    underlyingLevel = await prisma.subscriptionLevel.findUnique({
      where: { id: underlyingId },
    });
  }
  // Effective tier (comp wins when active).
  let effectiveLevel = underlyingLevel;
  if (effectiveId !== underlyingId) {
    effectiveLevel = await prisma.subscriptionLevel.findUnique({
      where: { id: effectiveId },
    });
  }
  const compActive =
    u.compTierLevelId !== null &&
    u.compTierExpiresAt !== null &&
    u.compTierExpiresAt > now;
  return {
    id: u.id,
    email: u.email,
    createdAt: u.createdAt,
    subscriptionAssignedAt: u.subscriptionAssignedAt,
    subscriptionEndsAt: u.subscriptionEndsAt,
    subscriptionLevel: effectiveLevel,
    underlyingLevel,
    comp: compActive
      ? {
          tierLevelId: u.compTierLevelId!,
          expiresAt: u.compTierExpiresAt!,
          grantedAt: u.compTierGrantedAt,
        }
      : null,
  };
}

function isAdminEmail(email: string): boolean {
  return SUPERUSER_EMAILS.has(email);
}

/** Resolve a user's feature entitlements from their EFFECTIVE tier (comp /
 *  grace-period aware). SuperAdmins get everything. */
export async function getEntitlements(userId: string): Promise<Entitlements> {
  const user = await loadUserWithTier(userId);
  if (!user) return { ...ALL_FEATURES_OFF };
  return entitlementsForLevel(user.subscriptionLevel, isAdminEmail(user.email));
}

/** Single-feature check used by API-route gates. */
export async function hasFeatureAccess(userId: string, key: FeatureKey): Promise<boolean> {
  return (await getEntitlements(userId))[key];
}

// ─────────────────────────────────────────────────────────────────────────────
// Current-usage computation
// ─────────────────────────────────────────────────────────────────────────────

/** Artifacts (data-object / data-store / text-annotation) are excluded
 *  from element counts per the subscription spec. Shared with the
 *  snapshot's element-max computation below. */
const ELEMENT_ARTIFACT_TYPES = new Set([
  "data-object", "data-store", "text-annotation",
]);

async function currentUsageFor(
  user: UserWithTier,
  metric: LimitMetric,
  ctx: CheckContext,
  now: Date,
): Promise<number> {
  switch (metric) {
    case "projects":
      return prisma.project.count({ where: { userId: user.id } });

    case "diagramsPerTypePerProject": {
      // Per-action check: count diagrams matching the (project, type) tuple.
      if (ctx.projectId && ctx.diagramType) {
        return prisma.diagram.count({
          where: { projectId: ctx.projectId, type: ctx.diagramType },
        });
      }
      // Snapshot path (no ctx): worst-case across every (project, type)
      // pair the user owns. Tells the popover "are you at the cap in any
      // single project for any single type?" — same shape as the limit.
      const groups = await prisma.diagram.groupBy({
        by: ["projectId", "type"],
        where: { userId: user.id, projectId: { not: null } },
        _count: { id: true },
      });
      let max = 0;
      for (const g of groups) {
        if (g._count.id > max) max = g._count.id;
      }
      return max;
    }

    case "archimateDiagramsTotal":
      return prisma.diagram.count({
        where: { userId: user.id, type: "archimate" },
      });

    case "nonBpmnElementsPerDiagram":
    case "bpmnElementsPerDiagram": {
      // Per-action check: caller passes the proposed total count.
      if (typeof ctx.proposedElementCount === "number") {
        return ctx.proposedElementCount;
      }
      // Snapshot path (no ctx): max non-artifact element count across
      // every diagram the user owns of the matching type. Loads `data`
      // for each diagram so artifacts can be excluded; for popover use
      // (one call per modal open) the cost is acceptable.
      const isBpmn = metric === "bpmnElementsPerDiagram";
      const diagrams = await prisma.diagram.findMany({
        where: {
          userId: user.id,
          ...(isBpmn ? { type: "bpmn" } : { type: { not: "bpmn" } }),
        },
        select: { data: true },
      });
      let elementMax = 0;
      for (const d of diagrams) {
        const els = (d.data as { elements?: { type?: string }[] } | null)?.elements;
        if (!Array.isArray(els)) continue;
        let n = 0;
        for (const e of els) {
          if (e && typeof e === "object" && !ELEMENT_ARTIFACT_TYPES.has(e.type ?? "")) n++;
        }
        if (n > elementMax) elementMax = n;
      }
      return elementMax;
    }

    case "aiAttempts":
    case "individualExports":
    case "individualImports":
    case "bulkExports":
    case "bulkImports": {
      if (!user.subscriptionLevel) return 0;
      const key = periodKeyForEventMetric(user, user.subscriptionLevel, metric, now);
      const row = await prisma.usageCounter.findUnique({
        where: {
          userId_periodKey_metric: {
            userId: user.id,
            periodKey: key,
            metric: eventMetricDbKey(metric),
          },
        },
      });
      return row?.count ?? 0;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Check whether the given user is permitted to perform an action covered
 *  by `metric`. Admins (SUPERUSER_EMAILS) always pass. Returns
 *  `{ ok: true }` on success; `{ ok: false, reason, … }` when the action
 *  should be blocked. The route layer is expected to translate a blocked
 *  result into a 402 (Payment Required) for event/limit metrics or a 403
 *  for trial expiry, and surface `reason` to the user.
 *
 *  This function is read-only — it does NOT consume any counter. The
 *  caller must invoke `recordUsage` separately after the action succeeds. */
export async function checkLimit(
  userId: string,
  metric: LimitMetric,
  ctx: CheckContext = {},
  now: Date = new Date(),
): Promise<EnforcementResult> {
  const user = await loadUserWithTier(userId);
  if (!user) {
    return { ok: false, reason: "User not found", metric, current: 0, limit: 0 };
  }

  // Admins bypass everything.
  if (isAdminEmail(user.email)) return { ok: true };

  const tier = user.subscriptionLevel;
  if (!tier) {
    // No tier assigned — treat as Free-equivalent and block.
    return {
      ok: false,
      reason: "No active subscription tier",
      metric,
      current: 0,
      limit: 0,
    };
  }

  // Trial expiry blocks ALL creation / AI / export / import actions,
  // even when the user is still within the (now-irrelevant) numeric cap.
  if (trialExpired(user, tier, now)) {
    return {
      ok: false,
      reason: `Your ${tier.name} trial has expired. Upgrade to continue.`,
      metric: "trial",
      current: 0,
      limit: 0,
    };
  }

  const limit = tierLimitFor(tier, metric);
  if (limit === null) return { ok: true }; // Unlimited.

  const current = await currentUsageFor(user, metric, ctx, now);
  if (current >= limit) {
    return {
      ok: false,
      reason: `${METRIC_LABELS[metric]} limit reached on the ${tier.name} tier (${current} of ${limit}).`,
      metric,
      current,
      limit,
    };
  }

  return { ok: true };
}

/** Increment a user's event counter for `metric` by `delta` (default 1).
 *  No-op for admins (SUPERUSER_EMAILS) and for users without an assigned
 *  tier. Idempotency at the DB layer: a unique constraint on
 *  (userId, periodKey, metric) means concurrent increments collapse into
 *  one row; the `update` branch uses an atomic `{ increment: delta }`. */
export async function recordUsage(
  userId: string,
  metric: EventMetric,
  delta: number = 1,
  now: Date = new Date(),
): Promise<void> {
  const user = await loadUserWithTier(userId);
  if (!user) return;
  if (isAdminEmail(user.email)) return;
  if (!user.subscriptionLevel) return;

  const periodKey = periodKeyForEventMetric(user, user.subscriptionLevel, metric, now);
  const dbMetric = eventMetricDbKey(metric);

  await prisma.usageCounter.upsert({
    where: {
      userId_periodKey_metric: { userId, periodKey, metric: dbMetric },
    },
    create: { userId, periodKey, metric: dbMetric, count: delta },
    update: { count: { increment: delta } },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage snapshot — drives the admin popover and the user's own chip
// ─────────────────────────────────────────────────────────────────────────────

export interface UsageMetricRow {
  metric: LimitMetric;
  label: string;
  current: number;
  /** null = unlimited. */
  limit: number | null;
  /** Human-readable period descriptor: "this month", "lifetime",
   *  "current count" (point-in-time), or "—" (unlimited / admin). */
  periodLabel: string;
  /** ISO date string of the period's end (for monthly counters), so the
   *  popover can display "resets on YYYY-MM-DD". null for non-monthly. */
  periodEndsAt: string | null;
  overLimit: boolean;
}

export interface UsageSnapshot {
  /** Effective tier (the one whose limits apply). When a comp grant
   *  is active and overrides a different underlying tier, this carries
   *  the comp tier; otherwise it's the underlying tier. */
  tier: { id: string; name: string };
  /** Set only when a comp is active AND it overrides a DIFFERENT
   *  underlying tier — lets the UI render `Free → Expert · COMP`.
   *  Null when there's no comp, or when the comp tier happens to
   *  match the underlying tier (no visual change needed). */
  underlyingTier: { id: string; name: string } | null;
  isAdmin: boolean;
  trial: {
    /** null when the user's tier has no trial window. */
    daysRemaining: number | null;
    expired: boolean;
  };
  /** Active admin-granted comp grant, if any. Null when the effective
   *  tier comes from the regular paid / free path. UI uses this to
   *  show "(comp · expires X)" badges and the admin Revoke button. */
  comp: {
    tierLevelId: string;
    /** ISO-8601 string so it survives JSON serialisation through the
     *  API route. UI parses back to Date for display. */
    expiresAt: string;
    grantedAt: string | null;
  } | null;
  metrics: UsageMetricRow[];
  /** Per-tier feature access for the effective tier (SuperAdmin → all true).
   *  Drives hiding of feature launch buttons / example galleries and greying
   *  of OrgAdmin tiles. */
  entitlements: Entitlements;
}

const ALL_METRICS: LimitMetric[] = [
  "projects",
  "diagramsPerTypePerProject",
  "archimateDiagramsTotal",
  "nonBpmnElementsPerDiagram",
  "bpmnElementsPerDiagram",
  "aiAttempts",
  "individualExports",
  "individualImports",
  "bulkExports",
  "bulkImports",
];

/** Build a full usage snapshot for the popover. Pure read-only. */
export async function getUsageSnapshot(
  userId: string,
  now: Date = new Date(),
): Promise<UsageSnapshot | null> {
  const user = await loadUserWithTier(userId);
  if (!user) return null;

  const admin = isAdminEmail(user.email);
  const tier = user.subscriptionLevel;

  // For SuperAdmins (SUPERUSER_EMAILS), surface a synthetic "SuperAdmin"
  // tier label so the usage popover and admin table chip read
  // consistently. They bypass all enforcement so the stored tier (often
  // Expert from the grandfather seed) is moot.
  const tierDescriptor = admin
    ? { id: "superadmin", name: "SuperAdmin" }
    : { id: tier?.id ?? "none", name: tier?.name ?? "(none)" };

  // Trial summary.
  const trialMs = tier ? trialMillisRemaining(user, tier, now) : null;
  const trial = {
    daysRemaining: trialMs === null ? null : Math.ceil(trialMs / (24 * 60 * 60 * 1000)),
    expired: tier ? trialExpired(user, tier, now) : false,
  };

  // For each metric, compute current + limit + period label.
  const rows: UsageMetricRow[] = [];
  for (const metric of ALL_METRICS) {
    const limit = admin || !tier ? null : tierLimitFor(tier, metric);
    const current = await currentUsageFor(
      user,
      metric,
      // No element-count context here — that's a per-action check, not a
      // snapshot. Element-count rows in the popover show "—" / 0.
      {},
      now,
    );

    let periodLabel: string;
    let periodEndsAt: string | null = null;

    if (admin) {
      periodLabel = "—";
    } else if (isEventMetric(metric)) {
      if (!tier) {
        periodLabel = "—";
      } else {
        const key = periodKeyForEventMetric(user, tier, metric, now);
        if (key === "all-time") {
          periodLabel = "lifetime";
        } else {
          // Monthly. The period ends one day BEFORE the next anniversary.
          const start = new Date(key + "T00:00:00.000Z");
          const next = nextMonthlyPeriodStart(user.subscriptionAssignedAt ?? user.createdAt, start);
          periodEndsAt = isoDateUTC(new Date(next.getTime() - 24 * 60 * 60 * 1000));
          periodLabel = `this month (resets ${isoDateUTC(next)})`;
        }
      }
    } else if (metric === "diagramsPerTypePerProject") {
      // Worst-case value: the highest count across every (project, type)
      // pair the user owns. Tells them "are you at the cap somewhere?".
      periodLabel = "max in any project";
    } else if (
      metric === "bpmnElementsPerDiagram" ||
      metric === "nonBpmnElementsPerDiagram"
    ) {
      // Worst-case value: the highest element count across every diagram
      // of this type. Tells them "is any single diagram at the cap?".
      periodLabel = "max in any diagram";
    } else {
      periodLabel = "current count";
    }

    rows.push({
      metric,
      label: METRIC_LABELS[metric],
      current,
      limit,
      periodLabel,
      periodEndsAt,
      overLimit: limit !== null && current >= limit,
    });
  }

  // Underlying tier — only worth surfacing to the UI when it actually
  // differs from the effective tier (i.e. a comp is overriding it).
  // When effective === underlying, the UI just shows one badge.
  const showUnderlying =
    user.comp !== null &&
    user.underlyingLevel !== null &&
    user.underlyingLevel.id !== tierDescriptor.id;
  return {
    tier: tierDescriptor,
    underlyingTier: showUnderlying
      ? { id: user.underlyingLevel!.id, name: user.underlyingLevel!.name }
      : null,
    isAdmin: admin,
    trial,
    comp: user.comp
      ? {
          tierLevelId: user.comp.tierLevelId,
          expiresAt: user.comp.expiresAt.toISOString(),
          grantedAt: user.comp.grantedAt ? user.comp.grantedAt.toISOString() : null,
        }
      : null,
    metrics: rows,
    entitlements: entitlementsForLevel(tier, admin),
  };
}

function isEventMetric(m: LimitMetric): m is EventMetric {
  return (
    m === "aiAttempts" ||
    m === "individualExports" ||
    m === "individualImports" ||
    m === "bulkExports" ||
    m === "bulkImports"
  );
}

/** Step the period forward by one anchor-day. Used to compute when the
 *  current period ends (= when the next one starts). */
function nextMonthlyPeriodStart(anchor: Date, currentStart: Date): Date {
  const anchorDay = anchor.getUTCDate();
  const year = currentStart.getUTCFullYear();
  const month = currentStart.getUTCMonth();
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  return clampDayUTC(nextYear, nextMonth, anchorDay);
}
