/**
 * Changing plan on a LIVE paid subscription (Paul, 2026-10-06):
 *
 *   • UPGRADE   — takes effect immediately; the new price is billed from the START of the next subscription month.
 *                 Stripe: swap the subscription item's price with `proration_behavior: "none"` — no charge now, the new price on the
 *                 next renewal. The webhook (customer.subscription.updated) then moves the person's tier straight away.
 *   • DOWNGRADE — takes effect at the END of the current subscription month; no pro-rata refund. Stripe: a subscription SCHEDULE with
 *                 two phases (the current price to the period end, then the lower price). Nothing changes today; when the phase turns,
 *                 Stripe updates the subscription and the same webhook moves the tier. Until then the person keeps what they paid for.
 *
 * "Subscription month" = the anniversary of the day they subscribed (Stripe's default billing-cycle anchor — checkout.ts never sets one),
 * which is also the anchor of our own monthly usage counters (subscriptionAssignedAt).
 *
 * The Stripe client is injected (a minimal surface) so every branch is unit-tested with a fake; the routes pass the real one.
 */

export const PAID_ORDER = ["introductory", "professional", "expert"] as const;
export type PaidTierId = (typeof PAID_ORDER)[number];
const RANK: Record<string, number> = { free: 0, introductory: 1, professional: 2, expert: 3 };

export type ChangeKind = "upgrade" | "downgrade";

/** Pure. What kind of change is `current` → `target`? null when it is no change, or either is not a paid plan we can move between. */
export function changeKind(current: string, target: string): ChangeKind | null {
  if (current === target) return null;
  if (!(target in RANK) || !(current in RANK)) return null;
  if (target === "free") return null;                 // leaving for Free is a cancellation, done in the billing portal
  return RANK[target] > RANK[current] ? "upgrade" : "downgrade";
}

/** Pure. The plans a person may move to from `current`: paid plans below (downgrades) and above (upgrades). */
export function changeOptions(current: string): { downgrades: PaidTierId[]; upgrades: PaidTierId[] } {
  const r = RANK[current] ?? 0;
  return {
    downgrades: PAID_ORDER.filter((t) => RANK[t] < r),
    upgrades: PAID_ORDER.filter((t) => RANK[t] > r),
  };
}

/** Pure. The period end of a subscription — top level on older API versions, on the item on newer ones. */
export function periodEndOf(sub: unknown): Date | null {
  const s = sub as { current_period_end?: number; items?: { data?: { current_period_end?: number }[] } };
  const unix = s.current_period_end ?? s.items?.data?.[0]?.current_period_end ?? null;
  return typeof unix === "number" ? new Date(unix * 1000) : null;
}

/** The slice of the Stripe client this module uses. */
export interface PlanChangeStripe {
  subscriptions: {
    retrieve(id: string): Promise<unknown>;
    update(id: string, params: Record<string, unknown>): Promise<unknown>;
  };
  subscriptionSchedules: {
    create(params: Record<string, unknown>): Promise<unknown>;
    update(id: string, params: Record<string, unknown>): Promise<unknown>;
    release(id: string): Promise<unknown>;
  };
}

interface SubShape {
  id: string;
  status?: string;
  schedule?: string | { id: string } | null;
  items: { data: { id: string; price: { id: string } }[] };
}
const scheduleIdOf = (s: SubShape): string | null => (!s.schedule ? null : typeof s.schedule === "string" ? s.schedule : s.schedule.id);

export interface PlanChangeResult {
  kind: ChangeKind;
  /** When the change takes effect: now (upgrade) or the end of the current period (downgrade). */
  effectiveAt: Date;
  /** The Stripe schedule holding a downgrade, so it can be cancelled; null for an upgrade. */
  scheduleId: string | null;
}

/**
 * Apply a plan change to a live subscription. `currentPriceId` / `newPriceId` are Stripe price ids. Any schedule already on the
 * subscription (an earlier, still-pending downgrade) is released first — a subscription with a schedule cannot be edited directly,
 * and the newest choice wins.
 */
export async function applyPlanChange(
  stripe: PlanChangeStripe,
  args: { subscriptionId: string; kind: ChangeKind; newPriceId: string },
): Promise<PlanChangeResult> {
  let sub = (await stripe.subscriptions.retrieve(args.subscriptionId)) as SubShape;
  const existing = scheduleIdOf(sub);
  if (existing) {
    await stripe.subscriptionSchedules.release(existing);
    sub = (await stripe.subscriptions.retrieve(args.subscriptionId)) as SubShape;
  }
  const item = sub.items.data[0];
  if (!item) throw new Error("The subscription has no items to change");
  const periodEnd = periodEndOf(sub);

  if (args.kind === "upgrade") {
    // The new price from the next renewal, nothing charged now. Access follows the webhook, immediately.
    await stripe.subscriptions.update(sub.id, {
      items: [{ id: item.id, price: args.newPriceId }],
      proration_behavior: "none",
    });
    return { kind: "upgrade", effectiveAt: new Date(), scheduleId: null };
  }

  // Downgrade: current price until the period turns over, then the lower one. No refund for the part-month already paid.
  if (!periodEnd) throw new Error("Could not read the end of the current billing period");
  const schedule = (await stripe.subscriptionSchedules.create({ from_subscription: sub.id })) as {
    id: string; phases: { start_date: number; end_date: number }[];
  };
  const current = schedule.phases[0];
  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    phases: [
      { items: [{ price: item.price.id, quantity: 1 }], start_date: current.start_date, end_date: current.end_date },
      { items: [{ price: args.newPriceId, quantity: 1 }], proration_behavior: "none" },
    ],
  });
  return { kind: "downgrade", effectiveAt: periodEnd, scheduleId: schedule.id };
}

/** Cancel a pending downgrade: release the schedule, the subscription carries on at its present price. */
export async function cancelPendingChange(stripe: PlanChangeStripe, scheduleId: string): Promise<void> {
  await stripe.subscriptionSchedules.release(scheduleId);
}

/**
 * Cancel at the end of the current subscription month (no refund; the person keeps their plan until then). A pending downgrade is
 * released first — cancelling supersedes it. Returns when the subscription ends.
 */
export async function cancelAtPeriodEnd(stripe: PlanChangeStripe, subscriptionId: string): Promise<{ endsAt: Date | null }> {
  const sub = (await stripe.subscriptions.retrieve(subscriptionId)) as SubShape;
  const sched = scheduleIdOf(sub);
  if (sched) await stripe.subscriptionSchedules.release(sched);
  await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
  return { endsAt: periodEndOf(sub) };
}

/** Take back a cancellation that has not taken effect yet: the subscription simply carries on. */
export async function resumeSubscription(stripe: PlanChangeStripe, subscriptionId: string): Promise<void> {
  await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false });
}

/** Pure. What the person is told before cancelling. */
export function cancelNote(planName: string, endsAt: Date | null): string {
  const on = endsAt ? ` (${fmtDate(endsAt)})` : "";
  return `Your subscription will end at the end of your current subscription month${on}. You keep your ${planName} plan until then and are not charged again. There is no pro-rata refund for the part of the month already paid. After that you move to the Free plan; your projects and diagrams are not deleted, and you can subscribe again at any time.`;
}

/** Pure. What the person is told before resuming. */
export function resumeNote(planName: string): string {
  return `Your ${planName} subscription will carry on and renew as usual instead of ending.`;
}

const fmtDate = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

/** Pure. A date as the plan window shows it ("6 November 2026"). */
export const formatPlanDate = fmtDate;

/** Pure. What the person is told before confirming a change (the dialog and the window say the same thing). */
export function changeNote(kind: ChangeKind, periodEnd: Date | null): string {
  const on = periodEnd ? ` (${fmtDate(periodEnd)})` : "";
  return kind === "downgrade"
    ? `Takes effect at the end of your current subscription month${on}. You keep your current plan until then. There is no pro-rata refund for the part of the month already paid.`
    : `Takes effect immediately. You are not charged today — the new price is billed from the start of your next subscription month${on}.`;
}

/** The wording for someone subscribing from Free: billing starts now and renews on the same day each month. */
export const SUBSCRIBE_NOTE =
  "Billing starts when you subscribe and renews on the same day each month. Upgrades later take effect immediately and are billed from the start of the next month; downgrades take effect at the end of the month, with no pro-rata refund.";
