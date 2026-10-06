/**
 * T5273 — a cancelled customer (Paul, 2026-10-07): cancelling a subscription deletes NOTHING — the account, projects and diagrams stay,
 * the person simply falls to Free. A SuperAdmin can still erase the user and ALL their data on request, and doing so ends any live Stripe
 * subscription first so a deleted account is never billed (and if that cannot be done, nothing is deleted).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import type Stripe from "stripe";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg, createProject, createDiagram } from "../_setup/factories";
import { handleSubscriptionDeleted } from "@/app/api/stripe/webhook/route";
import { getEffectiveSubscriptionLevelId } from "@/app/lib/subscription";
import { eraseUser } from "@/app/lib/account/eraseUser";
import { endSubscriptionNow } from "@/app/lib/stripe/endSubscription";

beforeEach(async () => {
  await truncateAll();
  await prisma.subscriptionLevel.create({ data: { id: "free", name: "Free", sortOrder: 0, stripePriceId: null } });
  await prisma.subscriptionLevel.create({ data: { id: "paid", name: "Paid", sortOrder: 1, stripePriceId: "price_paid" } });
});

async function payingCustomerWithWork() {
  const { user, org } = await createUserWithOrg();
  const project = await createProject({ userId: user.id, orgId: org.id, name: "Their project" });
  const diagram = await createDiagram({ userId: user.id, orgId: org.id, projectId: project.id, name: "Their diagram" });
  await prisma.user.update({
    where: { id: user.id },
    data: { subscriptionLevelId: "paid", stripeCustomerId: "cus_c", stripeSubscriptionId: "sub_c", stripeSubscriptionStatus: "active" },
  });
  return { user, org, project, diagram };
}

describe("T5273 cancelling keeps everything", () => {
  it("when Stripe ends the subscription, the user, org, project and diagram are all still there — only the status changes", async () => {
    const { user, org, project, diagram } = await payingCustomerWithWork();
    const endsUnix = Math.floor(new Date("2026-07-01T00:00:00Z").getTime() / 1000);
    await handleSubscriptionDeleted({ id: "sub_c", status: "canceled", customer: "cus_c", cancel_at: endsUnix } as unknown as Stripe.Subscription);

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after).not.toBeNull();
    expect(after?.stripeSubscriptionStatus).toBe("canceled");
    expect(await prisma.org.findUnique({ where: { id: org.id } })).not.toBeNull();
    expect(await prisma.project.findUnique({ where: { id: project.id } })).not.toBeNull();
    expect(await prisma.diagram.findUnique({ where: { id: diagram.id } })).not.toBeNull();
    expect(await prisma.orgMember.count({ where: { userId: user.id } })).toBe(1);
    // …and once the paid period is over they are on Free, by the lazy rule — not deleted.
    expect(getEffectiveSubscriptionLevelId({ subscriptionLevelId: "paid", subscriptionEndsAt: after!.subscriptionEndsAt }, new Date("2026-08-01T00:00:00Z"))).toBe("free");
  });
});

describe("T5273 a SuperAdmin's complete erasure", () => {
  it("ends the live subscription first, then removes the user and ALL their data", async () => {
    const { user, org, project, diagram } = await payingCustomerWithWork();
    const calls: string[] = [];
    const res = await eraseUser(user.id, { endSubscription: async (id) => { calls.push(id); expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull(); } });
    expect(calls).toEqual(["sub_c"]);                        // called, and while the user still existed
    expect(res.orgsRemoved).toBe(1);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull();
    expect(await prisma.diagram.findUnique({ where: { id: diagram.id } })).toBeNull();
    expect(await prisma.org.findUnique({ where: { id: org.id } })).toBeNull();
  });
  it("if the subscription cannot be ended, NOTHING is deleted", async () => {
    const { user, project, diagram } = await payingCustomerWithWork();
    await expect(eraseUser(user.id, { endSubscription: async () => { throw new Error("stripe is down"); } })).rejects.toThrow("stripe is down");
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
    expect(await prisma.project.findUnique({ where: { id: project.id } })).not.toBeNull();
    expect(await prisma.diagram.findUnique({ where: { id: diagram.id } })).not.toBeNull();
  });
  it("a user with no subscription is erased without touching Stripe", async () => {
    const { user } = await createUserWithOrg();
    let called = false;
    await eraseUser(user.id, { endSubscription: async () => { called = true; } });
    expect(called).toBe(false);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
  });
});

describe("T5273 ending the Stripe subscription", () => {
  it("cancels it; treats 'already gone' (404 / resource_missing) as done; refuses to hide any other failure", async () => {
    const seen: string[] = [];
    await endSubscriptionNow("sub_1", { subscriptions: { cancel: async (id) => { seen.push(id); return {}; } } });
    expect(seen).toEqual(["sub_1"]);
    await expect(endSubscriptionNow("sub_2", { subscriptions: { cancel: async () => { throw Object.assign(new Error("gone"), { statusCode: 404 }); } } })).resolves.toBeUndefined();
    await expect(endSubscriptionNow("sub_3", { subscriptions: { cancel: async () => { throw Object.assign(new Error("gone"), { code: "resource_missing" }); } } })).resolves.toBeUndefined();
    await expect(endSubscriptionNow("sub_4", { subscriptions: { cancel: async () => { throw Object.assign(new Error("boom"), { statusCode: 500 }); } } })).rejects.toThrow("boom");
  });
  it("both erasure routes use eraseUser with it — the SuperAdmin route no longer does a bare user delete", () => {
    const admin = readFileSync("app/api/admin/users/[id]/route.ts", "utf8");
    expect(admin).toContain("eraseUser(id, { endSubscription: endSubscriptionNow })");
    expect(admin).not.toContain("prisma.user.delete(");
    const self = readFileSync("app/api/account/route.ts", "utf8");
    expect(self).toContain("eraseUser(userId, { endSubscription: endSubscriptionNow })");
  });
});
