/**
 * T5272 — changing plan (Paul, 2026-10-06): Free sees an "Upgrade" chip, a paid plan a "Change Subscription" chip, the plan chip itself is
 * display-only. Upgrade = immediate, billed from the start of the next subscription month; downgrade = end of the subscription month, no
 * pro-rata refund. The Stripe calls are pinned with a fake client.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyPlanChange, cancelPendingChange, changeKind, changeNote, changeOptions, periodEndOf, SUBSCRIBE_NOTE, type PlanChangeStripe,
} from "@/app/lib/stripe/planChange";

describe("T5272 which changes are offered", () => {
  it("classifies a move between paid plans, and nothing else", () => {
    expect(changeKind("introductory", "professional")).toBe("upgrade");
    expect(changeKind("introductory", "expert")).toBe("upgrade");
    expect(changeKind("expert", "professional")).toBe("downgrade");
    expect(changeKind("professional", "introductory")).toBe("downgrade");
    expect(changeKind("professional", "professional")).toBeNull();
    expect(changeKind("professional", "free")).toBeNull();        // leaving for Free is a cancellation, in the billing portal
    expect(changeKind("professional", "bogus")).toBeNull();
  });
  it("offers downgrades only to paid plans below, upgrades to plans above", () => {
    expect(changeOptions("free")).toEqual({ downgrades: [], upgrades: ["introductory", "professional", "expert"] });
    expect(changeOptions("introductory")).toEqual({ downgrades: [], upgrades: ["professional", "expert"] });
    expect(changeOptions("professional")).toEqual({ downgrades: ["introductory"], upgrades: ["expert"] });
    expect(changeOptions("expert")).toEqual({ downgrades: ["introductory", "professional"], upgrades: [] });
  });
  it("reads the period end from the subscription (older API) or from its item (newer)", () => {
    expect(periodEndOf({ current_period_end: 1_800_000_000 })?.toISOString()).toBe(new Date(1_800_000_000_000).toISOString());
    expect(periodEndOf({ items: { data: [{ current_period_end: 1_800_000_000 }] } })?.toISOString()).toBe(new Date(1_800_000_000_000).toISOString());
    expect(periodEndOf({ items: { data: [] } })).toBeNull();
  });
  it("tells the person the terms: downgrade at month end with no refund; upgrade at once, billed from next month", () => {
    const end = new Date("2026-11-06T00:00:00Z");
    expect(changeNote("downgrade", end)).toContain("end of your current subscription month");
    expect(changeNote("downgrade", end)).toContain("no pro-rata refund");
    expect(changeNote("upgrade", end)).toContain("Takes effect immediately");
    expect(changeNote("upgrade", end)).toContain("billed from the start of your next subscription month");
    expect(SUBSCRIBE_NOTE).toContain("renews on the same day each month");
  });
});

/** A fake Stripe that records every call. */
function fake(opts: { schedule?: string | null; periodEnd?: number | null } = {}) {
  const calls: { fn: string; args: unknown[] }[] = [];
  const log = (fn: string, ...args: unknown[]) => { calls.push({ fn, args }); };
  const periodEnd = opts.periodEnd === undefined ? 1_800_000_000 : opts.periodEnd;
  const stripe: PlanChangeStripe = {
    subscriptions: {
      retrieve: async (id) => { log("subscriptions.retrieve", id); return { id, schedule: calls.some((c) => c.fn === "schedules.release") ? null : (opts.schedule ?? null), items: { data: [{ id: "si_1", price: { id: "price_cur" }, ...(periodEnd ? { current_period_end: periodEnd } : {}) }] } }; },
      update: async (id, p) => { log("subscriptions.update", id, p); return {}; },
    },
    subscriptionSchedules: {
      create: async (p) => { log("schedules.create", p); return { id: "sched_new", phases: [{ start_date: 1_797_000_000, end_date: 1_800_000_000 }] }; },
      update: async (id, p) => { log("schedules.update", id, p); return {}; },
      release: async (id) => { log("schedules.release", id); return {}; },
    },
  };
  return { stripe, calls };
}

describe("T5272 Stripe: upgrade", () => {
  it("swaps the price with NO proration — nothing charged now, the new price from the next renewal — effective immediately", async () => {
    const { stripe, calls } = fake();
    const r = await applyPlanChange(stripe, { subscriptionId: "sub_1", kind: "upgrade", newPriceId: "price_new" });
    const upd = calls.find((c) => c.fn === "subscriptions.update")!;
    expect(upd.args[1]).toEqual({ items: [{ id: "si_1", price: "price_new" }], proration_behavior: "none" });
    expect(r.kind).toBe("upgrade");
    expect(r.scheduleId).toBeNull();
    expect(Math.abs(r.effectiveAt.getTime() - Date.now())).toBeLessThan(5_000);
    expect(calls.some((c) => c.fn === "schedules.create")).toBe(false);
  });
  it("releases an earlier pending downgrade first (a subscription with a schedule cannot be edited)", async () => {
    const { stripe, calls } = fake({ schedule: "sched_old" });
    await applyPlanChange(stripe, { subscriptionId: "sub_1", kind: "upgrade", newPriceId: "price_new" });
    const order = calls.map((c) => c.fn);
    expect(order.indexOf("schedules.release")).toBeGreaterThan(-1);
    expect(order.indexOf("schedules.release")).toBeLessThan(order.indexOf("subscriptions.update"));
  });
});

describe("T5272 Stripe: downgrade", () => {
  it("schedules the lower price to start when the current period ends — nothing changes today, no refund", async () => {
    const { stripe, calls } = fake();
    const r = await applyPlanChange(stripe, { subscriptionId: "sub_1", kind: "downgrade", newPriceId: "price_low" });
    expect(calls.some((c) => c.fn === "subscriptions.update")).toBe(false);     // the subscription itself is not touched
    const upd = calls.find((c) => c.fn === "schedules.update")!;
    expect(upd.args[0]).toBe("sched_new");
    const p = upd.args[1] as { end_behavior: string; phases: { items: { price: string }[]; start_date?: number; end_date?: number; proration_behavior?: string }[] };
    expect(p.end_behavior).toBe("release");
    expect(p.phases[0].items[0].price).toBe("price_cur");                        // the present price to the period end …
    expect(p.phases[0].end_date).toBe(1_800_000_000);
    expect(p.phases[1].items[0].price).toBe("price_low");                        // … then the lower one
    expect(p.phases[1].proration_behavior).toBe("none");
    expect(r).toMatchObject({ kind: "downgrade", scheduleId: "sched_new" });
    expect(r.effectiveAt.getTime()).toBe(1_800_000_000_000);
  });
  it("refuses to schedule when the period end cannot be read", async () => {
    const { stripe } = fake({ periodEnd: null });
    await expect(applyPlanChange(stripe, { subscriptionId: "sub_1", kind: "downgrade", newPriceId: "price_low" })).rejects.toThrow(/end of the current billing period/);
  });
  it("a pending downgrade is cancelled by releasing its schedule", async () => {
    const { stripe, calls } = fake();
    await cancelPendingChange(stripe, "sched_9");
    expect(calls).toEqual([{ fn: "schedules.release", args: ["sched_9"] }]);
  });
});

describe("T5272 the chips and the window", () => {
  const dash = readFileSync("app/(dashboard)/dashboard/DashboardClient.tsx", "utf8");
  it("the plan chip is display-only for a customer, with Upgrade (Free) or Change Subscription (paid) beside it", () => {
    expect(dash).toContain("const planChip = !usageSnapshot.isAdmin && !usageSnapshot.comp;");
    expect(dash).toContain('const Chip = planChip ? "div" : "button";');
    expect(dash).toContain('{onFree ? "Upgrade" : "Change Subscription"}');
    expect(dash).toContain('data-testid="plan-chip"');
  });
  it('the chip no longer says "Subscription:"', () => {
    expect(dash).not.toContain("<span>Subscription:</span>");
  });
  it("the window shows the plan section to a customer and the comp holder keeps the plain upgrade buttons", () => {
    const pop = readFileSync("app/components/UsagePopover.tsx", "utf8");
    expect(pop).toContain("<PlanChanger snapshot={snapshot}");
    expect(pop).toContain("!snapshot.isAdmin && !snapshot.comp");
    const pc = readFileSync("app/components/PlanChanger.tsx", "utf8");
    expect(pc).toContain("Downgrade to ");
    expect(pc).toContain("Upgrade to ");
    expect(pc).toContain('"/api/stripe/change-plan"');
  });
});

describe("T5272 the route and the webhook", () => {
  const route = readFileSync("app/api/stripe/change-plan/route.ts", "utf8");
  it("only a person with a live paid subscription can change plan; admins and a ending subscription are refused", () => {
    expect(route).toContain('const LIVE = new Set(["active", "trialing"]);');
    expect(route).toContain("isSuperuser(session)");
    expect(route).toContain("if (user.subscriptionEndsAt)");
  });
  it("a downgrade is remembered (tier, date, schedule) and an upgrade clears it and brings the tier up at once", () => {
    expect(route).toContain("pendingSubscriptionLevelId: tier.id, pendingSubscriptionAt: result.effectiveAt, stripeScheduleId: result.scheduleId");
    expect(route).toContain("applySubscriptionToUser(user.id, fresh, { reassignTrial: false })");
  });
  it("the webhook clears a pending downgrade once the tier has turned over or the schedule has gone, and reads the period end from the item too", () => {
    const hook = readFileSync("app/api/stripe/webhook/route.ts", "utf8");
    expect(hook).toContain("tierId === before.pendingSubscriptionLevelId || !subscription.schedule");
    expect(hook).toContain("periodEndOf(subscription)");
  });
  it("the snapshot carries the period end and the pending change", () => {
    const sub = readFileSync("app/lib/subscription.ts", "utf8");
    expect(sub).toContain("periodEnd: user.currentPeriodEnd");
    expect(sub).toContain("pendingChange: user.pendingLevelId && user.pendingAt");
  });
});
