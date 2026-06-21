/**
 * Sync the Feature catalog in a database to the committed seed, AND publish.
 *
 * Unlike seed-features.ts (insert-only, never updates, never publishes), this
 * UPSERTS every feature from the canonical FEATURES list — inserting the
 * missing ones and overwriting existing drafts to match the seed — then stamps
 * the published* snapshot so they go live immediately. Use it to bring a drifted
 * environment (e.g. prod) into sync with git.
 *
 * Scope: it only touches features named in the seed. Features that exist ONLY
 * in the target DB are left untouched. Because it overwrites draft copy to match
 * the seed, treat the seed as the source of truth when you run this.
 *
 * Run:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   DATABASE_URL="<target url>" npx tsx scripts/sync-features.ts
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { FEATURES } from "./seed-features";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });

  try {
    const now = new Date();
    let inserted = 0, updated = 0;
    for (let i = 0; i < FEATURES.length; i++) {
      const f = FEATURES[i];
      const existing = await prisma.feature.findFirst({ where: { name: f.name } });
      const hidden = existing?.hidden ?? false;
      const sortOrder = existing?.sortOrder ?? (i + 1) * 10; // keep prod's order; assign for new
      const data = {
        name: f.name, summary: f.summary, details: f.details, hidden, sortOrder,
        // Publish the same content immediately.
        publishedName: f.name, publishedSummary: f.summary, publishedDetails: f.details,
        publishedHidden: hidden, publishedSortOrder: sortOrder, publishedAt: now,
      };
      if (existing) { await prisma.feature.update({ where: { id: existing.id }, data }); updated++; }
      else { await prisma.feature.create({ data }); inserted++; }
    }
    console.log(`Synced ${FEATURES.length} features (inserted ${inserted}, updated ${updated}) — all published.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
