/**
 * Stripe client singleton and shared helpers.
 *
 * Single source of truth for the Stripe SDK instance plus the small
 * set of operations the rest of the app needs: creating-or-fetching a
 * Stripe Customer for a given app user, opening a Checkout Session for
 * a tier upgrade, opening a Billing Portal session for self-serve
 * cancellation / card update.
 *
 * Webhook signature verification lives in the webhook route itself
 * (it needs the raw request body + the `STRIPE_WEBHOOK_SECRET`).
 */

import Stripe from "stripe";
import { prisma } from "./db";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  // Don't throw at import time — that would break unrelated routes if
  // the env var is missing during dev. The Stripe-specific routes
  // (checkout, portal, webhook) re-check and surface a 500 with a
  // clearer message when the key is genuinely missing at call time.
  console.warn("[stripe] STRIPE_SECRET_KEY is not set — Stripe routes will fail");
}

export const stripe = new Stripe(STRIPE_SECRET_KEY ?? "sk_test_missing", {
  // Pin the API version so Stripe SDK upgrades don't silently change
  // event payload shapes. Bump deliberately when reviewing release
  // notes. Latest stable as of writing.
  apiVersion: "2026-04-22.dahlia",
  // Identifies our app in Stripe support / dashboards.
  appInfo: {
    name: "Diagramatix",
    version: "1.0.0",
  },
});

/**
 * Find-or-create the Stripe Customer for an app user. Stores the new
 * customer.id on `User.stripeCustomerId` so we don't create duplicates
 * on subsequent Checkout / Portal calls.
 *
 * Stripe rejects requests that try to create a Customer with an email
 * that already exists — but only sometimes (it's not enforced as a
 * unique constraint). The `User.stripeCustomerId` column IS unique on
 * our side, which is the actual source of truth.
 */
export async function getOrCreateStripeCustomer(user: {
  id: string;
  email: string;
  name?: string | null;
  stripeCustomerId: string | null;
}): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;

  // DATA-31: customer-create and the DB persist below are two non-atomic steps.
  // If a previous call created the Stripe customer but the persist failed, the
  // customer exists in Stripe yet User.stripeCustomerId is still null — and the
  // old code would then create a SECOND customer, leaking duplicates (and
  // detaching the first one's payment method / subscription history). Before
  // creating, look for a customer already tagged with our user id and reuse it.
  // (customers.list is immediately consistent; customers.search lags ~1 min.)
  let customerId: string | null = null;
  try {
    const existing = await stripe.customers.list({ email: user.email, limit: 100 });
    const match = existing.data.find(
      (c) => !c.deleted && c.metadata?.diagramatixUserId === user.id,
    );
    if (match) customerId = match.id;
  } catch (e) {
    console.error(`[stripe] customer lookup failed for user ${user.id}; will create a new one`, e);
  }

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      // Embed our user ID so the webhook can correlate back from Stripe
      // events that don't include client_reference_id (e.g. invoice.*
      // events from automatic renewals) — and so the reuse lookup above works.
      metadata: { diagramatixUserId: user.id },
    });
    customerId = customer.id;
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  } catch (e) {
    // The customer is tagged with diagramatixUserId, so the reuse lookup above
    // will pick it up on the next call rather than creating a duplicate — no
    // compensating delete needed (and safer, since it may hold a subscription).
    console.error(`[stripe] failed to persist stripeCustomerId=${customerId} for user ${user.id}; it will be reused on retry`, e);
    throw e;
  }

  return customerId;
}

/**
 * Open a Stripe Checkout Session for a tier upgrade. Returns the
 * hosted-page URL the caller should redirect the user to.
 *
 * `client_reference_id` is set to the app user ID so the webhook's
 * `checkout.session.completed` event can correlate without an extra
 * lookup.
 */
export async function createCheckoutSession(args: {
  user: { id: string; email: string; name?: string | null; stripeCustomerId: string | null };
  /** Stripe Price ID (`price_*`) — must exist as a recurring price in
   *  the same mode (test / live) as STRIPE_SECRET_KEY. */
  stripePriceId: string;
  /** Where Stripe sends the user after a successful checkout. */
  successUrl: string;
  /** Where Stripe sends the user if they cancel out of checkout. */
  cancelUrl: string;
}): Promise<{ url: string; id: string }> {
  const customerId = await getOrCreateStripeCustomer(args.user);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: args.user.id,
    line_items: [{ price: args.stripePriceId, quantity: 1 }],
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    // Surface address collection on the checkout page — handy if we
    // later turn on Stripe Tax for GST. Cheap to enable now.
    billing_address_collection: "auto",
    allow_promotion_codes: false,
  });

  if (!session.url) {
    throw new Error("Stripe Checkout returned no URL");
  }
  return { url: session.url, id: session.id };
}

/**
 * Open a Stripe Billing Portal session for the given user. The Portal
 * lets the user update their card, view invoices, and cancel the
 * subscription. Configuration (which actions are allowed) lives in the
 * Stripe Dashboard — see `Configure customer portal` under Settings.
 */
export async function createPortalSession(args: {
  user: { id: string; email: string; name?: string | null; stripeCustomerId: string | null };
  /** Where Stripe sends the user when they close the portal. */
  returnUrl: string;
}): Promise<{ url: string }> {
  const customerId = await getOrCreateStripeCustomer(args.user);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: args.returnUrl,
  });
  return { url: session.url };
}
