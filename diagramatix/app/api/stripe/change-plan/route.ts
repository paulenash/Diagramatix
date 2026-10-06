/**
 * POST   /api/stripe/change-plan   { tierId }  — move a person who already pays to another PAID plan.
 * DELETE /api/stripe/change-plan               — cancel a downgrade that is waiting for the end of the month.
 *
 *   • upgrade   — effective immediately, billed from the start of the next subscription month (no charge today);
 *   • downgrade — effective at the end of the current subscription month, no pro-rata refund.
 *
 * The mechanics and the rules live in app/lib/stripe/planChange.ts (unit-tested with a fake Stripe). Someone on Free has no subscription to
 * change — they subscribe through POST /api/stripe/checkout. Leaving for Free is a cancellation, done in the billing portal.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation, isSuperuser } from "@/app/lib/superuser";
import { stripe } from "@/app/lib/stripe";
import { applyPlanChange, cancelPendingChange, changeKind, type PlanChangeStripe } from "@/app/lib/stripe/planChange";
import { applySubscriptionToUser } from "@/app/api/stripe/webhook/route";

export const runtime = "nodejs";

const LIVE = new Set(["active", "trialing"]);

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isReadOnlyImpersonation(session, await cookies())) return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  if (isSuperuser(session)) return NextResponse.json({ error: "Admins bypass paid tiers — there is no plan to change" }, { status: 403 });

  let body: { tierId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const tierId = body.tierId ?? "";

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, subscriptionLevelId: true, stripeSubscriptionId: true, stripeSubscriptionStatus: true, subscriptionEndsAt: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!user.stripeSubscriptionId || !LIVE.has(user.stripeSubscriptionStatus ?? "")) {
    return NextResponse.json({ error: "You do not have an active paid subscription to change. Use Upgrade to subscribe." }, { status: 409 });
  }
  if (user.subscriptionEndsAt) {
    return NextResponse.json({ error: "Your subscription is set to end. Resume it (System ▸ Resume Subscription) before changing plan." }, { status: 409 });
  }

  const kind = changeKind(user.subscriptionLevelId ?? "free", tierId);
  if (!kind) return NextResponse.json({ error: "That is not a change from your current plan." }, { status: 400 });

  const tier = await prisma.subscriptionLevel.findUnique({ where: { id: tierId }, select: { id: true, name: true, stripePriceId: true } });
  if (!tier) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  if (!tier.stripePriceId) {
    return NextResponse.json({ error: `A Stripe price is not configured for the ${tier.name} plan.` }, { status: 503 });
  }

  try {
    const result = await applyPlanChange(stripe as unknown as PlanChangeStripe, {
      subscriptionId: user.stripeSubscriptionId, kind, newPriceId: tier.stripePriceId,
    });
    if (kind === "downgrade") {
      await prisma.user.update({
        where: { id: user.id },
        data: { pendingSubscriptionLevelId: tier.id, pendingSubscriptionAt: result.effectiveAt, stripeScheduleId: result.scheduleId },
      });
    } else {
      // Upgrade: any earlier downgrade was released by applyPlanChange. Bring the tier up NOW from Stripe's own record (the webhook does
      // the same, idempotently, a moment later) so the person does not wait for it.
      await prisma.user.update({
        where: { id: user.id },
        data: { pendingSubscriptionLevelId: null, pendingSubscriptionAt: null, stripeScheduleId: null },
      });
      const fresh = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      await applySubscriptionToUser(user.id, fresh, { reassignTrial: false });
    }
    return NextResponse.json({ ok: true, kind, tierId: tier.id, effectiveAt: result.effectiveAt.toISOString() });
  } catch (err) {
    console.error("[stripe/change-plan] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "The plan change failed" }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isReadOnlyImpersonation(session, await cookies())) return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, stripeScheduleId: true } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!user.stripeScheduleId) return NextResponse.json({ error: "There is no scheduled change to cancel." }, { status: 409 });
  try {
    await cancelPendingChange(stripe as unknown as PlanChangeStripe, user.stripeScheduleId);
    await prisma.user.update({ where: { id: user.id }, data: { pendingSubscriptionLevelId: null, pendingSubscriptionAt: null, stripeScheduleId: null } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[stripe/change-plan] cancel error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not cancel the scheduled change" }, { status: 500 });
  }
}

