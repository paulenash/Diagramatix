/**
 * POST /api/stripe/webhook
 *
 * Stripe → us. Every subscription state transition flows through here:
 * Checkout completes, renewals charge, users cancel, payments fail.
 * This route is the ONLY place that writes User.subscriptionLevelId
 * for paid tiers — guaranteeing the DB never gets ahead of Stripe's
 * source of truth.
 *
 * Signature verification uses STRIPE_WEBHOOK_SECRET. The body must be
 * read as the raw text the SDK received (not a re-stringified JSON
 * object) for the HMAC to validate — Stripe's library demands the
 * exact bytes off the wire.
 *
 * Idempotency: Stripe may deliver the same event 2+ times. Every
 * handler is written as an idempotent upsert on User by primary key —
 * applying the same event twice yields the same DB state.
 *
 * Events handled:
 *   • checkout.session.completed         — first success after Checkout
 *   • customer.subscription.updated      — sync status / period / tier
 *   • customer.subscription.deleted      — cancel → set grace marker
 *   • invoice.payment_failed             — surface past_due chip
 *   • invoice.payment_succeeded          — confirm active + reset
 *                                          monthly UsageCounters
 *
 * All other events return 200 (acknowledged) but no-op so Stripe stops
 * retrying.
 */

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/app/lib/db";
import { stripe } from "@/app/lib/stripe";
import { monthlyPeriodKey } from "@/app/lib/subscription";

// Stripe SDK uses Node APIs (crypto for HMAC). Edge runtime would
// break signature verification.
export const runtime = "nodejs";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

/** Map a Stripe Price ID back to one of our SubscriptionLevel rows.
 *  Single query, cached lookup is unnecessary — webhooks are
 *  infrequent and the table has 4 rows. */
async function tierIdForStripePriceId(stripePriceId: string): Promise<string | null> {
  const tier = await prisma.subscriptionLevel.findFirst({
    where: { stripePriceId },
    select: { id: true },
  });
  return tier?.id ?? null;
}

export async function POST(req: Request) {
  if (!WEBHOOK_SECRET) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // Stripe needs the raw body. Next.js 16's Request.text() returns it
  // unchanged (no JSON-parse-and-restringify round trip).
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    console.error("[stripe/webhook] signature verification failed:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      default:
        // Acknowledged-but-ignored. Stripe stops retrying on 200.
        console.log(`[stripe/webhook] ignored event: ${event.type}`);
    }
  } catch (err) {
    // Returning a 500 makes Stripe retry. That's usually what we want
    // for transient DB errors; permanent failures (bad data) will keep
    // retrying until the event ages out (~3 days). Log loudly so we
    // notice in the meantime.
    console.error(`[stripe/webhook] handler error for ${event.type}:`, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Event handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * checkout.session.completed
 *
 * Fired the moment Stripe Checkout finishes payment. The session
 * carries our app's user id in `client_reference_id` and the new
 * subscription's id in `subscription`. We pull the subscription
 * itself to get the canonical price + period.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
  if (!userId) {
    console.error("[stripe/webhook] checkout.session.completed missing client_reference_id");
    return;
  }
  if (!subscriptionId) {
    console.error("[stripe/webhook] checkout.session.completed missing subscription id");
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await applySubscriptionToUser(userId, subscription, { reassignTrial: true });
}

/**
 * customer.subscription.updated
 *
 * Fires on tier upgrades / downgrades via the Customer Portal, on
 * renewal, on cancel-at-period-end being scheduled, and on uncanceling.
 * Sync everything from the Stripe subscription as the source of truth.
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userId = await userIdForSubscription(subscription);
  if (!userId) return;
  // DATA-04: Stripe does NOT guarantee webhook delivery order — a stale `updated`
  // event can arrive AFTER a `deleted` and resurrect a canceled subscription (or a
  // late downgrade can clobber a newer upgrade). Re-fetch the CANONICAL current
  // state from Stripe and apply that, so out-of-order delivery always converges to
  // the truth instead of whatever the (possibly stale) event payload says.
  let canonical = subscription;
  try {
    canonical = await stripe.subscriptions.retrieve(subscription.id);
  } catch (e) {
    console.error(`[stripe/webhook] could not re-fetch subscription ${subscription.id}; applying event payload`, e);
  }
  // If the live subscription is actually terminal, don't resurrect it — mirror the
  // deletion path (sets the grace marker) instead of writing an "active" tier back.
  if (canonical.status === "canceled" || canonical.status === "incomplete_expired" || canonical.status === "unpaid") {
    await handleSubscriptionDeleted(canonical);
    return;
  }
  await applySubscriptionToUser(userId, canonical, { reassignTrial: false });
}

/**
 * customer.subscription.deleted
 *
 * The subscription is truly gone (cancel-at-period-end has elapsed, or
 * a hard cancel). Set the grace marker so getEffectiveSubscriptionLevelId
 * downgrades the user to Free on next access. Clear stripeSubscriptionId
 * so a future upgrade creates a fresh subscription.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = await userIdForSubscription(subscription);
  if (!userId) return;

  // Use cancel_at if Stripe scheduled an end (cancel at period end);
  // otherwise the subscription terminated now. current_period_end is
  // also a reasonable fallback for already-ended subs.
  const cancelAt =
    typeof subscription.cancel_at === "number" ? subscription.cancel_at : null;
  const periodEnd =
    typeof (subscription as Stripe.Subscription & { current_period_end?: number })
      .current_period_end === "number"
      ? (subscription as Stripe.Subscription & { current_period_end: number }).current_period_end
      : null;
  const endsAtUnix = cancelAt ?? periodEnd;
  const endsAt = endsAtUnix ? new Date(endsAtUnix * 1000) : new Date();

  await prisma.user.update({
    where: { id: userId },
    data: {
      stripeSubscriptionStatus: "canceled",
      subscriptionEndsAt: endsAt,
      // Don't clear stripeSubscriptionId here — the lazy downgrade
      // path via getEffectiveSubscriptionLevelId still wants to know
      // there was a subscription for diagnostic / re-subscribe UX.
    },
  });
}

/**
 * invoice.payment_failed
 *
 * Stripe will retry automatically per the dunning settings configured
 * in the Stripe dashboard. We just mark the status so the UI can warn
 * the user. If retries ultimately fail, we'll receive a
 * customer.subscription.deleted event later.
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = subscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return;
  const user = await prisma.user.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
    select: { id: true },
  });
  if (!user) return;
  await prisma.user.update({
    where: { id: user.id },
    data: { stripeSubscriptionStatus: "past_due" },
  });
}

/**
 * invoice.payment_succeeded
 *
 * Confirms a successful charge (initial OR renewal). On renewal we
 * clear past_due if it was set, and reset this user's monthly
 * UsageCounter rows so the new period starts at zero.
 */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = subscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return;
  const user = await prisma.user.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
    select: { id: true, subscriptionAssignedAt: true, createdAt: true },
  });
  if (!user) return;

  await prisma.user.update({
    where: { id: user.id },
    data: { stripeSubscriptionStatus: "active" },
  });

  // DATA-17: clear only PRIOR monthly periods, never the current one. The old
  // code deleted ALL non-"all-time" counters every time this event was seen, so a
  // Stripe redelivery / late delivery (after the user had already consumed quota
  // in the new period) wiped that consumption and handed out a fresh allowance.
  // periodKey is the monthly-anniversary date ("YYYY-MM-DD"); a lexical `<` is
  // chronological, so this clears stale periods and is idempotent on replay while
  // leaving the current period's usage intact. (New periods get fresh rows on
  // their own key, so an explicit "reset to zero" isn't actually needed.)
  const currentPeriodKey = monthlyPeriodKey(user.subscriptionAssignedAt ?? user.createdAt);
  await prisma.usageCounter.deleteMany({
    where: {
      userId: user.id,
      NOT: { periodKey: "all-time" },
      periodKey: { lt: currentPeriodKey },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve our userId from a Stripe Subscription. Tries the
 * `metadata.diagramatixUserId` field first (set by
 * `getOrCreateStripeCustomer`); falls back to a DB lookup by
 * `stripeCustomerId` if the metadata isn't there for some reason.
 */
async function userIdForSubscription(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return user?.id ?? null;
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  // The Stripe TS types here are union-heavy — invoice.subscription can
  // be string | Stripe.Subscription | null depending on expansion.
  // Cast through unknown to keep TS happy across SDK versions.
  const sub = (invoice as unknown as { subscription?: string | { id: string } | null })
    .subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

/**
 * Apply a Stripe subscription's state to our User row. Looks up the
 * tier id from the subscription's first price's `id`, sets
 * subscription status / period end / id, and flips hasChosenTier
 * (Checkout completion implies a tier choice was made).
 *
 * `reassignTrial` decides whether to restamp subscriptionAssignedAt.
 * Checkout completion does (start of paid period); routine updates
 * don't (we'd unfairly reset the monthly counter anniversary).
 */
async function applySubscriptionToUser(
  userId: string,
  subscription: Stripe.Subscription,
  options: { reassignTrial: boolean },
) {
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const tierId = priceId ? await tierIdForStripePriceId(priceId) : null;
  if (!tierId) {
    console.error(
      `[stripe/webhook] no SubscriptionLevel found for stripePriceId=${priceId}; user=${userId}`,
    );
    return;
  }

  // current_period_end is on the subscription. Type quirk across SDK
  // versions — read via cast.
  const periodEndUnix =
    (subscription as Stripe.Subscription & { current_period_end?: number })
      .current_period_end ?? null;
  const currentPeriodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : null;

  // cancel_at_period_end being true means the user has scheduled a
  // cancel but is still in the paid period. We populate
  // subscriptionEndsAt now (instead of waiting for the deletion event)
  // so the UI can show "Cancels on <date>" immediately.
  const subscriptionEndsAt = subscription.cancel_at_period_end
    ? currentPeriodEnd
    : null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionLevelId: tierId,
      stripeSubscriptionId: subscription.id,
      stripeSubscriptionStatus: subscription.status,
      currentPeriodEnd,
      subscriptionEndsAt,
      hasChosenTier: true,
      ...(options.reassignTrial
        ? { subscriptionAssignedAt: new Date() }
        : {}),
    },
  });
}
