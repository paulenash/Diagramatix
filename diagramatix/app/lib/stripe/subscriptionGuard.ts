/**
 * Double-subscription guard — extracted from POST /api/stripe/checkout so the
 * decision is unit-testable without hitting Stripe.
 *
 * Background: on 2026-05-24's live test a user with a paid sub who clicked
 * Upgrade got a SECOND parallel Stripe subscription ($50 Introductory + $120
 * Professional both active on one user). The guard blocks a fresh Checkout when
 * the user already has a live subscription — tier changes must go through the
 * Customer Portal's switch-plans flow instead.
 *
 * No Stripe SDK import here on purpose: the live status is fetched by the caller
 * and passed in via `getStatus`, so this module stays pure + cheap to test.
 */

/** Stripe subscription statuses that count as "the user already pays" — a new
 *  Checkout is blocked. `canceled` / `incomplete_expired` / `unpaid` are
 *  deliberately omitted: those are dead subscriptions, so the user is free to
 *  start a fresh one. */
export const ACTIVE_SUB_STATUSES = new Set<string>([
  "active",
  "trialing",
  "past_due",
  "incomplete",
]);

/**
 * True when the user already has a subscription that should BLOCK a new Checkout.
 *
 * @param getStatus fetches the live Stripe status for a subscription id, or
 *        returns `null` when Stripe 404s (the subscription no longer exists →
 *        treat as gone, allow a fresh Checkout). Any other error must propagate.
 */
export async function hasBlockingActiveSubscription(
  user: { stripeSubscriptionId: string | null; subscriptionEndsAt: Date | null },
  getStatus: (subscriptionId: string) => Promise<string | null>,
  now: Date = new Date(),
): Promise<boolean> {
  if (!user.stripeSubscriptionId) return false;

  // subscriptionEndsAt in the past means the user lazy-downgraded to Free even
  // though stripeSubscriptionId is still populated (the column is only cleared
  // on the customer.subscription.deleted webhook). Skip the Stripe round-trip.
  const expired = user.subscriptionEndsAt !== null && user.subscriptionEndsAt <= now;
  if (expired) return false;

  const status = await getStatus(user.stripeSubscriptionId);
  if (status === null) return false; // 404 — dead/gone, allow a fresh Checkout
  return ACTIVE_SUB_STATUSES.has(status);
}
