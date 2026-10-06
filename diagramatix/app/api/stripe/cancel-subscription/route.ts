/**
 * POST /api/stripe/cancel-subscription   { action: "cancel" | "resume" }
 *
 *   cancel — the subscription ends at the end of the current subscription month (Stripe `cancel_at_period_end`); the person keeps
 *            their plan until then; no pro-rata refund. A pending downgrade is dropped. The user's subscriptionEndsAt is set from
 *            Stripe's own record straight away (the webhook does the same, idempotently), which drives the "ending" notice.
 *   resume — take back a cancellation that has not yet taken effect.
 *
 * Who: a person with a live paid subscription of their own. SuperAdmins and read-only impersonation are refused. A comp grant has nothing
 * to cancel. The rules and the Stripe calls live in app/lib/stripe/planChange.ts (unit-tested with a fake Stripe).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation, isSuperuser } from "@/app/lib/superuser";
import { stripe } from "@/app/lib/stripe";
import { cancelAtPeriodEnd, resumeSubscription, type PlanChangeStripe } from "@/app/lib/stripe/planChange";
import { applySubscriptionToUser } from "@/app/api/stripe/webhook/route";

export const runtime = "nodejs";

const LIVE = new Set(["active", "trialing", "past_due"]);

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isReadOnlyImpersonation(session, await cookies())) return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  if (isSuperuser(session)) return NextResponse.json({ error: "Admins have no paid subscription to cancel" }, { status: 403 });

  let body: { action?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (body.action !== "cancel" && body.action !== "resume") return NextResponse.json({ error: "action must be cancel or resume" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, stripeSubscriptionId: true, stripeSubscriptionStatus: true, subscriptionEndsAt: true },
  });
  if (!user?.stripeSubscriptionId || !LIVE.has(user.stripeSubscriptionStatus ?? "")) {
    return NextResponse.json({ error: "You do not have an active paid subscription." }, { status: 409 });
  }
  const ending = !!user.subscriptionEndsAt;
  if (body.action === "cancel" && ending) return NextResponse.json({ error: "Your subscription is already set to end." }, { status: 409 });
  if (body.action === "resume" && !ending) return NextResponse.json({ error: "Your subscription is not set to end." }, { status: 409 });

  try {
    const client = stripe as unknown as PlanChangeStripe;
    let endsAt: Date | null = null;
    if (body.action === "cancel") {
      endsAt = (await cancelAtPeriodEnd(client, user.stripeSubscriptionId)).endsAt;
      await prisma.user.update({ where: { id: user.id }, data: { pendingSubscriptionLevelId: null, pendingSubscriptionAt: null, stripeScheduleId: null } });
    } else {
      await resumeSubscription(client, user.stripeSubscriptionId);
    }
    // Mirror Stripe's record now rather than wait for the webhook: it sets or clears subscriptionEndsAt from cancel_at_period_end.
    const fresh = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    await applySubscriptionToUser(user.id, fresh, { reassignTrial: false });
    return NextResponse.json({ ok: true, action: body.action, endsAt: endsAt ? endsAt.toISOString() : null });
  } catch (err) {
    console.error("[stripe/cancel-subscription] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "The request failed" }, { status: 500 });
  }
}
