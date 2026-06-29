/**
 * Stripe webhook — the subscription state machine. The webhook is the ONLY
 * place that writes paid-tier state onto User, so pinning its handlers nets a
 * whole class of "billing drifted from Stripe" regressions: a renewal that
 * fails to clear past_due, a cancellation that doesn't set the grace marker, a
 * payment-succeeded that wipes the current period's quota, an unknown price id
 * silently mis-mapping a tier.
 *
 * Tests the real, now-exported handlers from app/api/stripe/webhook/route.ts
 * against the test DB — no mocks, no Stripe. We hand each handler a minimal
 * Stripe-shaped object carrying only the fields that handler reads (cast
 * through unknown). The two Stripe-calling handlers (handleCheckoutCompleted,
 * handleSubscriptionUpdated) are out of scope — they hit the network.
 *
 * Lazy downgrade: after a delete sets subscriptionEndsAt, the effective tier
 * resolver (getEffectiveSubscriptionLevelId) — not the webhook — does the
 * Free downgrade once that date passes. We pin both sides of that boundary.
 */
import { describe, it, expect, beforeEach } from "vitest";
import type Stripe from "stripe";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser } from "../_setup/factories";
import { getEffectiveSubscriptionLevelId } from "@/app/lib/subscription";
import {
  applySubscriptionToUser,
  handleSubscriptionDeleted,
  handleInvoicePaymentFailed,
  handleInvoicePaymentSucceeded,
  userIdForSubscription,
  tierIdForStripePriceId,
} from "@/app/api/stripe/webhook/route";

const PRICE_PAID = "price_paid_123";
const NOW = new Date("2026-06-29T00:00:00Z");
const PERIOD_END_UNIX = Math.floor(new Date("2026-07-29T00:00:00Z").getTime() / 1000);

/** A Free tier (no stripePriceId) + a paid tier wired to PRICE_PAID. */
async function makeTiers() {
  await prisma.subscriptionLevel.create({
    data: { id: "free", name: "Free", sortOrder: 0, stripePriceId: null },
  });
  await prisma.subscriptionLevel.create({
    data: { id: "paid", name: "Paid", sortOrder: 1, stripePriceId: PRICE_PAID },
  });
}

/** A user with a Stripe customer id, on Free to start. */
async function makeCustomer(opts?: { customerId?: string; subId?: string }) {
  const u = await createUser();
  return prisma.user.update({
    where: { id: u.id },
    data: {
      subscriptionLevelId: "free",
      subscriptionAssignedAt: new Date("2026-01-15T00:00:00Z"),
      stripeCustomerId: opts?.customerId ?? `cus_${u.id}`,
      stripeSubscriptionId: opts?.subId ?? null,
    },
  });
}

/** Minimal Stripe.Subscription carrying only the fields the handlers read. */
function subscription(o: {
  id?: string;
  status?: string;
  customer?: string;
  priceId?: string | null;
  currentPeriodEnd?: number | null;
  cancelAt?: number | null;
  cancelAtPeriodEnd?: boolean;
}): Stripe.Subscription {
  return {
    id: o.id ?? "sub_1",
    status: o.status ?? "active",
    customer: o.customer ?? "cus_x",
    cancel_at: o.cancelAt ?? null,
    cancel_at_period_end: o.cancelAtPeriodEnd ?? false,
    current_period_end: o.currentPeriodEnd === undefined ? PERIOD_END_UNIX : o.currentPeriodEnd,
    items: { data: o.priceId === null ? [] : [{ price: { id: o.priceId ?? PRICE_PAID } }] },
  } as unknown as Stripe.Subscription;
}

/** Minimal Stripe.Invoice carrying only `subscription`. */
function invoice(subId: string | null): Stripe.Invoice {
  return { subscription: subId } as unknown as Stripe.Invoice;
}

describe("stripe webhook — subscription state machine", () => {
  beforeEach(async () => { await truncateAll(); await makeTiers(); });

  describe("tierIdForStripePriceId", () => {
    it("maps a known price id to its tier; unknown → null", async () => {
      expect(await tierIdForStripePriceId(PRICE_PAID)).toBe("paid");
      expect(await tierIdForStripePriceId("price_nope")).toBeNull();
    });
  });

  describe("userIdForSubscription", () => {
    it("resolves by stripeCustomerId; unknown customer → null", async () => {
      const u = await makeCustomer({ customerId: "cus_known" });
      expect(await userIdForSubscription(subscription({ customer: "cus_known" }))).toBe(u.id);
      expect(await userIdForSubscription(subscription({ customer: "cus_ghost" }))).toBeNull();
    });
  });

  describe("applySubscriptionToUser", () => {
    it("maps priceId → tier and stamps subscription fields", async () => {
      const u = await makeCustomer();
      await applySubscriptionToUser(
        u.id,
        subscription({ id: "sub_abc", status: "active", priceId: PRICE_PAID }),
        { reassignTrial: false },
      );
      const after = await prisma.user.findUnique({ where: { id: u.id } });
      expect(after?.subscriptionLevelId).toBe("paid");
      expect(after?.stripeSubscriptionId).toBe("sub_abc");
      expect(after?.stripeSubscriptionStatus).toBe("active");
      expect(after?.hasChosenTier).toBe(true);
      // No cancel scheduled → no end marker.
      expect(after?.subscriptionEndsAt).toBeNull();
      expect(after?.currentPeriodEnd?.getTime()).toBe(PERIOD_END_UNIX * 1000);
    });

    it("cancel_at_period_end:true sets subscriptionEndsAt to current_period_end", async () => {
      const u = await makeCustomer();
      await applySubscriptionToUser(
        u.id,
        subscription({ cancelAtPeriodEnd: true, currentPeriodEnd: PERIOD_END_UNIX }),
        { reassignTrial: false },
      );
      const after = await prisma.user.findUnique({ where: { id: u.id } });
      expect(after?.subscriptionEndsAt?.getTime()).toBe(PERIOD_END_UNIX * 1000);
    });

    it("reassignTrial:true restamps subscriptionAssignedAt; false leaves it", async () => {
      const original = new Date("2026-01-15T00:00:00Z");
      const u1 = await makeCustomer();
      await applySubscriptionToUser(u1.id, subscription({ id: "sub_keep" }), { reassignTrial: false });
      const a1 = await prisma.user.findUnique({ where: { id: u1.id } });
      expect(a1?.subscriptionAssignedAt?.getTime()).toBe(original.getTime());

      const u2 = await makeCustomer();
      await applySubscriptionToUser(u2.id, subscription({ id: "sub_restamp" }), { reassignTrial: true });
      const a2 = await prisma.user.findUnique({ where: { id: u2.id } });
      expect(a2?.subscriptionAssignedAt?.getTime()).not.toBe(original.getTime());
    });

    it("unknown priceId is a no-op (no tier written)", async () => {
      const u = await makeCustomer();
      await applySubscriptionToUser(
        u.id,
        subscription({ priceId: "price_unknown" }),
        { reassignTrial: false },
      );
      const after = await prisma.user.findUnique({ where: { id: u.id } });
      // Stayed on Free; no Stripe sub id written.
      expect(after?.subscriptionLevelId).toBe("free");
      expect(after?.stripeSubscriptionId).toBeNull();
      expect(after?.hasChosenTier).toBe(false);
    });
  });

  describe("handleSubscriptionDeleted", () => {
    it("sets status canceled + grace end and KEEPS stripeSubscriptionId", async () => {
      const u = await makeCustomer({ customerId: "cus_del", subId: "sub_del" });
      await prisma.user.update({
        where: { id: u.id },
        data: { subscriptionLevelId: "paid", stripeSubscriptionStatus: "active" },
      });
      await handleSubscriptionDeleted(
        subscription({ customer: "cus_del", id: "sub_del", cancelAt: PERIOD_END_UNIX }),
      );
      const after = await prisma.user.findUnique({ where: { id: u.id } });
      expect(after?.stripeSubscriptionStatus).toBe("canceled");
      expect(after?.subscriptionEndsAt?.getTime()).toBe(PERIOD_END_UNIX * 1000);
      expect(after?.stripeSubscriptionId).toBe("sub_del"); // not cleared
    });

    it("unknown customer → no-op", async () => {
      await handleSubscriptionDeleted(subscription({ customer: "cus_ghost" }));
      // Nothing to assert beyond "did not throw"; no user matched.
      expect(true).toBe(true);
    });
  });

  describe("handleInvoicePaymentFailed", () => {
    it("sets status past_due", async () => {
      const u = await makeCustomer({ subId: "sub_pf" });
      await prisma.user.update({
        where: { id: u.id },
        data: { stripeSubscriptionStatus: "active" },
      });
      await handleInvoicePaymentFailed(invoice("sub_pf"));
      const after = await prisma.user.findUnique({ where: { id: u.id } });
      expect(after?.stripeSubscriptionStatus).toBe("past_due");
    });

    it("unknown subscription → no-op", async () => {
      const u = await makeCustomer({ subId: "sub_known" });
      await prisma.user.update({ where: { id: u.id }, data: { stripeSubscriptionStatus: "active" } });
      await handleInvoicePaymentFailed(invoice("sub_other"));
      const after = await prisma.user.findUnique({ where: { id: u.id } });
      expect(after?.stripeSubscriptionStatus).toBe("active"); // untouched
    });

    it("no subscription on invoice → no-op", async () => {
      await handleInvoicePaymentFailed(invoice(null));
      expect(true).toBe(true);
    });
  });

  describe("handleInvoicePaymentSucceeded", () => {
    it("sets status active and clears ONLY prior-period UsageCounter rows", async () => {
      const u = await makeCustomer({ subId: "sub_ps" });
      await prisma.user.update({
        where: { id: u.id },
        data: { stripeSubscriptionStatus: "past_due", subscriptionAssignedAt: new Date("2026-01-15T00:00:00Z") },
      });
      // The current monthly periodKey is the most recent 15th-anniversary at/before now.
      const { monthlyPeriodKey } = await import("@/app/lib/subscription");
      const currentKey = monthlyPeriodKey(new Date("2026-01-15T00:00:00Z"), new Date());

      // Seed counters: one prior period (lexically < current), the current
      // period, and an all-time lifetime counter.
      const priorKey = "2026-01-15"; // far in the past relative to currentKey
      await prisma.usageCounter.create({ data: { userId: u.id, periodKey: priorKey, metric: "ai_attempts", count: 5 } });
      await prisma.usageCounter.create({ data: { userId: u.id, periodKey: currentKey, metric: "ai_attempts", count: 3 } });
      await prisma.usageCounter.create({ data: { userId: u.id, periodKey: "all-time", metric: "individual_exports", count: 9 } });

      await handleInvoicePaymentSucceeded(invoice("sub_ps"));

      const after = await prisma.user.findUnique({ where: { id: u.id } });
      expect(after?.stripeSubscriptionStatus).toBe("active");

      // Prior period gone; current + all-time survive.
      expect(await prisma.usageCounter.findFirst({ where: { userId: u.id, periodKey: priorKey } })).toBeNull();
      expect(await prisma.usageCounter.findFirst({ where: { userId: u.id, periodKey: currentKey } })).not.toBeNull();
      expect(await prisma.usageCounter.findFirst({ where: { userId: u.id, periodKey: "all-time" } })).not.toBeNull();
    });

    it("unknown subscription → no-op", async () => {
      await handleInvoicePaymentSucceeded(invoice("sub_nobody"));
      expect(true).toBe(true);
    });
  });

  describe("lazy downgrade via getEffectiveSubscriptionLevelId", () => {
    it("after a delete with subscriptionEndsAt in the PAST → Free; FUTURE → still paid", async () => {
      const past = new Date(NOW.getTime() - 86_400_000); // yesterday
      const future = new Date(NOW.getTime() + 86_400_000); // tomorrow

      // Paid user, grace already lapsed → effective tier is Free.
      expect(
        getEffectiveSubscriptionLevelId(
          { subscriptionLevelId: "paid", subscriptionEndsAt: past },
          NOW,
        ),
      ).toBe("free");

      // Paid user, still in grace → keeps the paid tier.
      expect(
        getEffectiveSubscriptionLevelId(
          { subscriptionLevelId: "paid", subscriptionEndsAt: future },
          NOW,
        ),
      ).toBe("paid");
    });
  });
});
