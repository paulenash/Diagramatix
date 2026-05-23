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
import { createCheckoutSession } from "@/app/lib/stripe";

const PAID_TIER_IDS = new Set(["introductory", "professional", "expert"]);

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
  if (!tier.stripePriceId) {
    // Admin forgot to paste the Price ID in the Subscriptions editor.
    // Surface a clear message so it's obvious how to fix.
    return NextResponse.json(
      {
        error: `Stripe Price ID is not configured for the ${tier.name} tier. An admin needs to set it via Dashboard → Admin → Subscription Prices and Limits.`,
      },
      { status: 503 },
    );
  }

  // Build success / cancel URLs from the incoming request's origin so
  // they resolve correctly across local dev / staging / production
  // without an extra env var.
  const origin = new URL(req.url).origin;
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
