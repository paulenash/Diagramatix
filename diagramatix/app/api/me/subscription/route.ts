/**
 * Self-serve subscription tier change — Free only.
 *
 *   PATCH /api/me/subscription
 *     Body: { tierId: "free" }
 *
 * Free tier is the only tier reachable via this endpoint now. Paid
 * tiers must go through Stripe Checkout (POST /api/stripe/checkout)
 * so the actual payment happens and the webhook can set state.
 *
 * For Free: updates subscriptionLevelId, restamps
 * subscriptionAssignedAt to NOW() (the 30-day Free trial clock starts
 * here), and flips hasChosenTier=true so the welcome TierPicker stops
 * appearing.
 *
 * Impersonation: blocked in view mode (the admin can't change the
 * impersonated user's tier through this endpoint — they use the admin
 * route instead).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";

const ALLOWED_TIER_IDS = new Set(["free", "introductory", "professional", "expert"]);

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cookieStore = await cookies();
    if (isReadOnlyImpersonation(session, cookieStore)) {
      return NextResponse.json(
        { error: "Read-only: viewing another user" },
        { status: 403 },
      );
    }
  } catch {
    /* cookies() may fail in some contexts — proceed normally */
  }

  let body: { tierId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tierId = body.tierId;
  if (typeof tierId !== "string" || !ALLOWED_TIER_IDS.has(tierId)) {
    return NextResponse.json(
      { error: `Unknown tier id: ${String(tierId ?? "(missing)")}` },
      { status: 400 },
    );
  }
  // Paid tiers must go through Stripe Checkout — webhook sets the
  // tier on payment success. This endpoint is now Free-only.
  if (tierId !== "free") {
    return NextResponse.json(
      {
        error: "Paid tiers must be purchased via Stripe Checkout. Use POST /api/stripe/checkout.",
      },
      { status: 400 },
    );
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      subscriptionLevelId: tierId,
      subscriptionAssignedAt: new Date(),
      hasChosenTier: true,
    },
    select: {
      id: true,
      subscriptionLevelId: true,
      subscriptionAssignedAt: true,
      hasChosenTier: true,
    },
  });

  return NextResponse.json({ user: updated });
}

/**
 * POST /api/me/subscription/skip
 * (Implemented as a separate operation under the same resource — we
 * accept POST on the same route with action="skip" to keep the URL
 * surface small. Skip flips hasChosenTier=true without changing the
 * actual tier, so the user stays on Free but the modal stops nagging.)
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { action?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (body.action !== "skip") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: { hasChosenTier: true },
    select: { id: true, hasChosenTier: true },
  });
  return NextResponse.json({ user: updated });
}
