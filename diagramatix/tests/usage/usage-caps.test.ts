/**
 * Usage caps (#7b).
 *
 * Tests the real subscription enforcement lib (`checkLimit` / `recordUsage` in
 * app/lib/subscription.ts) against the test DB — no mocks. These are the exact
 * functions every mutating route calls (`checkLimit` BEFORE the work,
 * `recordUsage` AFTER it succeeds). We seed a SubscriptionLevel with a small cap,
 * assign a user to it, and assert:
 *   • an event metric increments the UsageCounter via recordUsage, and checkLimit
 *     blocks once the tier limit is reached;
 *   • a point-in-time metric (projects) blocks when the actual row count hits the
 *     cap;
 *   • an unlimited (null) limit always passes;
 *   • a SuperAdmin bypasses enforcement entirely.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg, createProject } from "../_setup/factories";
import { checkLimit, recordUsage } from "@/app/lib/subscription";

/** Create a tier with the given caps; null = unlimited. */
async function makeTier(id: string, caps: {
  maxProjects?: number | null;
  maxBulkExports?: number | null;
  maxAiAttempts?: number | null;
  aiAttemptsResetMonthly?: boolean;
}) {
  return prisma.subscriptionLevel.create({
    data: {
      id, name: id, sortOrder: 0,
      maxProjects: caps.maxProjects ?? null,
      maxBulkExports: caps.maxBulkExports ?? null,
      maxAiAttempts: caps.maxAiAttempts ?? null,
      aiAttemptsResetMonthly: caps.aiAttemptsResetMonthly ?? true,
    },
  });
}

/** Assign a user (with their own org) to a tier, anchored now (no trial). */
async function userOnTier(tierId: string) {
  const { user, org } = await createUserWithOrg();
  await prisma.user.update({
    where: { id: user.id },
    data: { subscriptionLevelId: tierId, subscriptionAssignedAt: new Date() },
  });
  return { user, org };
}

describe("usage caps", () => {
  beforeEach(async () => { await truncateAll(); });

  it("recordUsage increments the UsageCounter and checkLimit blocks once the cap is hit (event metric)", async () => {
    await makeTier("cap2", { maxBulkExports: 2 });
    const { user } = await userOnTier("cap2");

    // Under the cap → allowed.
    expect((await checkLimit(user.id, "bulkExports")).ok).toBe(true);

    // Consume one — counter goes to 1; still under the cap of 2.
    await recordUsage(user.id, "bulkExports");
    const c1 = await prisma.usageCounter.findFirst({ where: { userId: user.id, metric: "bulk_exports" } });
    expect(c1?.count).toBe(1);
    expect((await checkLimit(user.id, "bulkExports")).ok).toBe(true);

    // Consume the second — counter at 2 == cap → now blocked.
    await recordUsage(user.id, "bulkExports");
    const c2 = await prisma.usageCounter.findFirst({ where: { userId: user.id, metric: "bulk_exports" } });
    expect(c2?.count).toBe(2);

    const blocked = await checkLimit(user.id, "bulkExports");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.metric).toBe("bulkExports");
      expect(blocked.current).toBe(2);
      expect(blocked.limit).toBe(2);
    }

    // Only one counter row total (idempotent upsert on (user, period, metric)).
    expect(await prisma.usageCounter.count({ where: { userId: user.id } })).toBe(1);
  });

  it("a point-in-time metric (projects) blocks when the actual count reaches the cap", async () => {
    await makeTier("p1", { maxProjects: 1 });
    const { user, org } = await userOnTier("p1");

    // No projects yet → allowed.
    expect((await checkLimit(user.id, "projects")).ok).toBe(true);

    // Create one → now at the cap of 1 → blocked.
    await createProject({ userId: user.id, orgId: org.id });
    const blocked = await checkLimit(user.id, "projects");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.current).toBe(1);
      expect(blocked.limit).toBe(1);
    }
  });

  it("a null (unlimited) limit always passes", async () => {
    await makeTier("unlimited", { maxBulkExports: null, maxProjects: null });
    const { user, org } = await userOnTier("unlimited");
    await createProject({ userId: user.id, orgId: org.id });
    await recordUsage(user.id, "bulkExports");
    await recordUsage(user.id, "bulkExports");
    expect((await checkLimit(user.id, "projects")).ok).toBe(true);
    expect((await checkLimit(user.id, "bulkExports")).ok).toBe(true);
  });

  it("a SuperAdmin bypasses enforcement and recordUsage is a no-op for them", async () => {
    // SuperAdmin is identified by email (SUPERUSER_EMAILS), regardless of tier.
    await makeTier("cap0", { maxBulkExports: 0 });
    const { user: admin } = await createUserWithOrg({ email: "paul@nashcc.com.au" });
    await prisma.user.update({
      where: { id: admin.id },
      data: { subscriptionLevelId: "cap0", subscriptionAssignedAt: new Date() },
    });

    // Even with a cap of 0, the admin is allowed.
    expect((await checkLimit(admin.id, "bulkExports")).ok).toBe(true);
    // recordUsage writes no counter for an admin.
    await recordUsage(admin.id, "bulkExports");
    expect(await prisma.usageCounter.count({ where: { userId: admin.id } })).toBe(0);
  });
});
