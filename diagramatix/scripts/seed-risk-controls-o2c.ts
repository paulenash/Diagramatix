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

      await prisma.$transaction((tx) => createO2cLibrary(tx, { orgId }));
      created++;
      console.log(`  seeded "${O2C_SAMPLE.name}" (${O2C_SAMPLE.items.length} items, ${O2C_SAMPLE.links.length} links) into org ${orgId}`);
    }
    console.log(`Done. Created ${created}, skipped ${skipped}. Adopt it from a project's Risk & Controls panel.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
