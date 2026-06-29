/**
 * POST /api/stripe/checkout
 *
 * Opens a Stripe Checkout Session for the signed-in user to subscribe
 * to a paid tier. Body:
 *
 *   { tierId: "introductory" | "professional" | "expert" }
 *
 * Returns:
 *
 *   { url: string }   // redirect the browser here
 *
 * The Stripe webhook (Stage 3) does the actual subscription state
 * update on success. This route just creates the session.
 *
 * Free is not a Checkout target — Free signup goes through the
 * existing PATCH /api/me/subscription path. This route rejects Free.
 *
 * Admins (SUPERUSER_EMAILS) get a 403 — they don't need to pay.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { createCheckoutSession, stripe, PAID_TIER_IDS, originFromRequest } from "@/app/lib/stripe";
import { hasBlockingActiveSubscription } from "@/app/lib/stripe/subscriptionGuard";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (isSuperuser(session)) {
    return NextResponse.json(
      { error: "Admins bypass paid tiers — no checkout needed" },
      { status: 403 },
    );
  }

  let body: { tierId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tierId = body.tierId;
  if (!tierId || !PAID_TIER_IDS.has(tierId)) {
    return NextResponse.json(
      { error: `Invalid tierId: ${tierId ?? "(missing)"}. Must be one of ${[...PAID_TIER_IDS].join(", ")}.` },
      { status: 400 },
    );
  }

  const [user, tier] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        subscriptionEndsAt: true,
      },
    }),
    prisma.subscriptionLevel.findUnique({
      where: { id: tierId },
      select: { id: true, name: true, stripePriceId: true },
    }),
  ]);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!tier) {
    return NextResponse.json({ error: "Tier not found" }, { status: 404 });
  }

  // Existing-active-subscription guard (logic in app/lib/stripe/subscriptionGuard.ts,
  // unit-tested there). Without it, a user with a paid sub who clicks Upgrade gets a
  // SECOND parallel sub in Stripe (hit on 2026-05-24's live test: $50 Introductory +
  // $120 Professional both active on one user). The status lookup wraps Stripe's
  // retrieve, mapping a 404 to null (dead sub → allow a fresh Checkout) and
  // surfacing any other error.
  const blocking = await hasBlockingActiveSubscription(user, async (subscriptionId) => {
    try {
      return (await stripe.subscriptions.retrieve(subscriptionId)).status;
    } catch (err) {
      const stripeErr = err as { statusCode?: number };
      if (stripeErr.statusCode === 404) return null;
      console.error("[stripe/checkout] subscription lookup error:", err);
      throw err;
    }
  });
  if (blocking) {
    return NextResponse.json(
      {
        error:
          "You already have an active subscription. To change tier, open Manage Subscription on your dashboard and use the Switch plans option.",
      },
      { status: 409 },
    );
  }

  if (!tier.stripePriceId) {
    // SuperAdmin forgot to paste the Price ID in the Subscriptions
    // editor. Surface a clear message so it's obvious how to fix.
    return NextResponse.json(
      {
        error: `Stripe Price ID is not configured for the ${tier.name} tier. A SuperAdmin needs to set it via Dashboard → SuperAdmin → Subscription Prices and Limits.`,
      },
      { status: 503 },
    );
  }

  // Build success / cancel URLs from the incoming request, preferring
  // X-Forwarded-* headers that Azure App Service sets when proxying
  // to the Next.js standalone server. Without these, `req.url` would
  // resolve to the internal bind address (`http://0.0.0.0:3000/...`)
  // because Next.js standalone doesn't know it's behind a proxy, and
  // Stripe would redirect users to a URL their browser can't reach.
  const origin = originFromRequest(req);
  const successUrl = `${origin}/dashboard?checkout=success`;
  const cancelUrl = `${origin}/dashboard?checkout=cancel`;

  try {
    const { url } = await createCheckoutSession({
      user,
      stripePriceId: tier.stripePriceId,
      successUrl,
      cancelUrl,
    });
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[stripe/checkout] error:", err);
    const msg = err instanceof Error ? err.message : "Stripe Checkout failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
