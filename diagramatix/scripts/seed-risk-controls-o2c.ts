/**
 * Seed the ready-made Order-to-Cash GRC library (app/lib/riskControls/o2cSample.ts)
 * as an ORG MASTER for a user's organisations, so it shows up in every project's
 * "Adopt" dropdown in the Risk & Controls panel.
 *
 * Targets the Owner/Admin orgs of RC_SEED_EMAIL (default paul@nashcc.com.au).
 * Idempotent: skips any org that already has a library of the same name.
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   DATABASE_URL="<url>" npx tsx scripts/seed-risk-controls-o2c.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { O2C_SAMPLE } from "../app/lib/riskControls/o2cSample";
import { createO2cLibrary } from "../app/lib/riskControls/seedO2c";

const EMAIL = process.env.RC_SEED_EMAIL || "paul@nashcc.com.au";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    const user = await prisma.user.findFirst({ where: { email: EMAIL }, select: { id: true } });
    if (!user) { console.log(`No user "${EMAIL}" — nothing to seed.`); return; }
    const memberships = await prisma.orgMember.findMany({
      where: { userId: user.id, role: { in: ["Owner", "Admin"] } }, select: { orgId: true },
    });
    const orgIds = [...new Set(memberships.map((m) => m.orgId))];
    if (!orgIds.length) { console.log(`"${EMAIL}" owns/admins no orgs — nothing to seed.`); return; }

    let created = 0, skipped = 0;
    for (const orgId of orgIds) {
      const existing = await prisma.riskControlLibrary.findFirst({ where: { orgId, name: O2C_SAMPLE.name }, select: { id: true } });
      if (existing) { skipped++; console.log(`  skip org ${orgId} (already has "${O2C_SAMPLE.name}")`); continue; }

      // TIMEOUT RAISED FROM PRISMA'S 5s DEFAULT, and this is a fix for a live
      // failure rather than a precaution. On every prod deploy this threw:
      //
      //   Transaction API error: A query cannot be executed on an expired
      //   transaction. The timeout for this transaction was 5000 ms, however
      //   5413 ms passed since the start of the transaction.
      //
      // It rolled back cleanly, so nothing was half-written and nothing looked
      // broken — which is why it went unnoticed: the Order-to-Cash sample GRC
      // library has simply never existed on prod.
      //
      // The cause is round trips, not slowness. The library is written one row
      // at a time — 38 items and their links, each its own query — and against
      // prod latency that is comfortably past five seconds while being fine on
      // a local socket. Raising the ceiling is the honest fix for a seed that
      // runs once; the round-trip count is the thing to reduce if this ever
      // grows (`createMany` with pre-generated ids), and it is noted here so
      // the next person does not have to rediscover why 5s was not enough.
      await prisma.$transaction((tx) => createO2cLibrary(tx, { orgId }), { timeout: 30_000, maxWait: 10_000 });
      created++;
      console.log(`  seeded "${O2C_SAMPLE.name}" (${O2C_SAMPLE.items.length} items, ${O2C_SAMPLE.links.length} links) into org ${orgId}`);
    }
    console.log(`Done. Created ${created}, skipped ${skipped}. Adopt it from a project's Risk & Controls panel.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
