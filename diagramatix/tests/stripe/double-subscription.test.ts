/**
 * Double-subscription guard (#4). Pins the fix for the 2026-05-24 live bug where
 * a paid user who clicked Upgrade got a SECOND parallel Stripe subscription.
 *
 * Tests the extracted predicate directly with a fake status-fetcher — no Stripe,
 * no mocks. The route (POST /api/stripe/checkout) is a thin caller that 409s when
 * this returns true.
 */
import { describe, it, expect } from "vitest";
import { hasBlockingActiveSubscription, ACTIVE_SUB_STATUSES } from "@/app/lib/stripe/subscriptionGuard";

const NOW = new Date("2026-06-28T00:00:00Z");
const PAST = new Date("2026-06-01T00:00:00Z");
const FUTURE = new Date("2026-07-31T00:00:00Z");

/** A status-fetcher that records whether it was called (it must NOT be hit when
 *  there's no sub id or the sub has already lapsed — that's a wasted Stripe call). */
function fetcher(status: string | null) {
  const calls: string[] = [];
  const fn = async (subId: string) => { calls.push(subId); return status; };
  return Object.assign(fn, { calls });
}

describe("double-subscription guard", () => {
  it("no subscription id → not blocking, Stripe never queried", async () => {
    const f = fetcher("active");
    expect(await hasBlockingActiveSubscription({ stripeSubscriptionId: null, subscriptionEndsAt: null }, f, NOW)).toBe(false);
    expect(f.calls).toEqual([]);
  });

  it("subscription already lapsed (subscriptionEndsAt in the past) → not blocking, Stripe never queried", async () => {
    const f = fetcher("active");
    expect(await hasBlockingActiveSubscription({ stripeSubscriptionId: "sub_1", subscriptionEndsAt: PAST }, f, NOW)).toBe(false);
    expect(f.calls).toEqual([]); // lazy-downgrade to Free — skip the round-trip
  });

  it("live statuses BLOCK a fresh checkout", async () => {
    for (const status of ["active", "trialing", "past_due", "incomplete"]) {
      const f = fetcher(status);
      expect(
        await hasBlockingActiveSubscription({ stripeSubscriptionId: "sub_1", subscriptionEndsAt: FUTURE }, f, NOW),
        `status ${status} should block`,
      ).toBe(true);
      expect(f.calls).toEqual(["sub_1"]);
    }
  });

  it("dead statuses do NOT block (user may start a fresh subscription)", async () => {
    for (const status of ["canceled", "incomplete_expired", "unpaid"]) {
      const f = fetcher(status);
      expect(
        await hasBlockingActiveSubscription({ stripeSubscriptionId: "sub_1", subscriptionEndsAt: FUTURE }, f, NOW),
        `status ${status} should NOT block`,
      ).toBe(false);
    }
  });

  it("Stripe 404 (status null) → subscription gone, not blocking", async () => {
    const f = fetcher(null);
    expect(await hasBlockingActiveSubscription({ stripeSubscriptionId: "sub_gone", subscriptionEndsAt: FUTURE }, f, NOW)).toBe(false);
    expect(f.calls).toEqual(["sub_gone"]);
  });

  it("active sub with no end date or a future end date → blocking", async () => {
    expect(await hasBlockingActiveSubscription({ stripeSubscriptionId: "sub_1", subscriptionEndsAt: null }, fetcher("active"), NOW)).toBe(true);
    expect(await hasBlockingActiveSubscription({ stripeSubscriptionId: "sub_1", subscriptionEndsAt: FUTURE }, fetcher("active"), NOW)).toBe(true);
  });

  it("a propagated (non-404) lookup error is not swallowed", async () => {
    const boom = async () => { throw new Error("stripe down"); };
    await expect(
      hasBlockingActiveSubscription({ stripeSubscriptionId: "sub_1", subscriptionEndsAt: FUTURE }, boom, NOW),
    ).rejects.toThrow("stripe down");
  });

  it("ACTIVE_SUB_STATUSES includes the live set and excludes the dead set", () => {
    for (const s of ["active", "trialing", "past_due", "incomplete"]) expect(ACTIVE_SUB_STATUSES.has(s)).toBe(true);
    for (const s of ["canceled", "incomplete_expired", "unpaid"]) expect(ACTIVE_SUB_STATUSES.has(s)).toBe(false);
  });
});
