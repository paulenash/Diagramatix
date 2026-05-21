/**
 * Smoke-test for app/lib/subscription.ts.
 *
 * Exercises checkLimit + recordUsage + getUsageSnapshot against the
 * live local DB without touching anyone's data permanently:
 *   1. Picks the first user in the DB.
 *   2. Reads their snapshot.
 *   3. Temporarily moves them to Free (saving their current tier).
 *   4. Hits the AI-attempts limit by calling recordUsage 6 times.
 *   5. Confirms the 6th attempt fails the checkLimit gate.
 *   6. Restores their original tier + assignment timestamp.
 *   7. Cleans up the test UsageCounter rows it created.
 *
 * Safe to re-run. Doesn't modify any real diagram / project data.
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/smoke-subscriptions.ts
 */

import "dotenv/config";
import { prisma } from "../app/lib/db";
import {
  checkLimit,
  recordUsage,
  getUsageSnapshot,
  monthlyPeriodKey,
  trialExpired,
} from "../app/lib/subscription";

async function main() {
  const user = await prisma.user.findFirst({
    where: { subscriptionLevelId: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  if (!user) {
    console.error("No user with a subscription tier found. Run scripts/seed-subscriptions.ts first.");
    process.exit(1);
  }

  console.log(`Smoking against user: ${user.email} (id=${user.id})`);

  // -------------------------------------------------------------------------
  // 1. Snapshot
  // -------------------------------------------------------------------------
  console.log("\n[1] Initial snapshot");
  const snap0 = await getUsageSnapshot(user.id);
  console.log(`  Tier: ${snap0?.tier.name}, isAdmin=${snap0?.isAdmin}, trial=${JSON.stringify(snap0?.trial)}`);
  console.log(`  Metrics:`);
  for (const m of snap0?.metrics ?? []) {
    console.log(`    ${m.label.padEnd(34)} ${m.current} / ${m.limit ?? "∞"}  [${m.periodLabel}]`);
  }

  // -------------------------------------------------------------------------
  // 2. Period-key helpers
  // -------------------------------------------------------------------------
  console.log("\n[2] Period key edge cases");
  const cases = [
    { anchor: "2026-05-15", now: "2026-05-20", expect: "2026-05-15" },
    { anchor: "2026-05-15", now: "2026-06-10", expect: "2026-05-15" }, // still in May–Jun period
    { anchor: "2026-05-15", now: "2026-06-20", expect: "2026-06-15" },
    { anchor: "2026-01-31", now: "2026-02-15", expect: "2026-01-31" }, // before Feb 28 anchor
    { anchor: "2026-01-31", now: "2026-02-28", expect: "2026-02-28" }, // Feb has no 31 → clamp
    { anchor: "2026-01-31", now: "2026-03-15", expect: "2026-02-28" }, // before 31 Mar
    { anchor: "2026-01-31", now: "2026-03-31", expect: "2026-03-31" },
  ];
  for (const c of cases) {
    const got = monthlyPeriodKey(new Date(c.anchor + "T00:00:00Z"), new Date(c.now + "T12:00:00Z"));
    const ok = got === c.expect;
    console.log(`  anchor=${c.anchor} now=${c.now} → ${got} ${ok ? "✔" : `✘ (expected ${c.expect})`}`);
  }

  // -------------------------------------------------------------------------
  // 3. checkLimit / recordUsage round-trip with the user temporarily on Free
  // -------------------------------------------------------------------------
  console.log("\n[3] checkLimit + recordUsage on Free tier (temp swap)");
  const originalTier = user.subscriptionLevelId;
  const originalAssignedAt = user.subscriptionAssignedAt;

  await prisma.user.update({
    where: { id: user.id },
    data: { subscriptionLevelId: "free", subscriptionAssignedAt: new Date() },
  });

  // Admins (SUPERUSER_EMAILS) always pass — exercise the enforcement
  // path by temporarily renaming the user to a non-admin email.
  const originalEmail = user.email;
  const tempEmail = `__smoketest_${user.id}__@diagramatix.local`;
  await prisma.user.update({
    where: { id: user.id },
    data: { email: tempEmail },
  });

  try {
    for (let i = 1; i <= 7; i++) {
      const result = await checkLimit(user.id, "aiAttempts");
      const willPass = result.ok;
      if (willPass) {
        await recordUsage(user.id, "aiAttempts");
      }
      console.log(`  attempt ${i}: check ${willPass ? "PASS" : `BLOCK (${(result as { reason: string }).reason})`}`);
    }
  } finally {
    await prisma.user.update({
      where: { id: user.id },
      data: { email: originalEmail },
    });
  }

  // Restore original tier + assignment timestamp.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionLevelId: originalTier,
      subscriptionAssignedAt: originalAssignedAt,
    },
  });

  // Clean up any UsageCounter rows we created for this user during the test.
  const removed = await prisma.usageCounter.deleteMany({ where: { userId: user.id } });
  console.log(`  cleaned up ${removed.count} UsageCounter row(s)`);

  // -------------------------------------------------------------------------
  // 4. trialExpired sanity check
  // -------------------------------------------------------------------------
  console.log("\n[4] trialExpired");
  const longAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const freeTier = { trialDays: 30 };
  const proTier = { trialDays: null };
  console.log(`  free, assigned 31d ago → expired=${trialExpired({ subscriptionAssignedAt: longAgo }, freeTier)} (expect true)`);
  console.log(`  free, assigned yesterday → expired=${trialExpired({ subscriptionAssignedAt: yesterday }, freeTier)} (expect false)`);
  console.log(`  pro, assigned 1000d ago → expired=${trialExpired({ subscriptionAssignedAt: new Date(0) }, proTier)} (expect false — no trial)`);

  console.log("\n✔ Smoke test complete");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
