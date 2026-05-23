/**
 * POST /api/stripe/portal
 *
 * Opens a Stripe Billing Portal session for the signed-in user. The
 * Portal lets the user update their payment method, view invoices,
 * and cancel the subscription. Cancellation handled there flows back
 * via the customer.subscription.deleted webhook (see Stage 3).
 *
 * Returns:
 *   { url: string }   // redirect the browser here
 *
 * Users without a Stripe Customer (Free users who never subscribed)
 * get a 400 — there's nothing to manage.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { createPortalSession } from "@/app/lib/stripe";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, stripeCustomerId: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!user.stripeCustomerId) {
    return NextResponse.json(
      { error: "No active subscription to manage" },
      { status: 400 },
    );
  }

  const origin = new URL(req.url).origin;
  const returnUrl = `${origin}/dashboard`;

  try {
    const { url } = await createPortalSession({ user, returnUrl });
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[stripe/portal] error:", err);
    const msg = err instanceof Error ? err.message : "Stripe Portal failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
