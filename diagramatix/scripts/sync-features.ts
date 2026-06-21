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
 *
 * Pass --dry-run to LIST the differences (what would be inserted / updated /
 * left alone) without writing anything:
 *   DATABASE_URL="<target url>" npx tsx scripts/sync-features.ts --dry-run
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { FEATURES } from "./seed-features";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });

  const dryRun = process.argv.includes("--dry-run");
  try {
    const all = await prisma.feature.findMany();
    const byName = new Map(all.map((f) => [f.name, f]));
    const seedNames = new Set(FEATURES.map((f) => f.name));

    const toInsert: string[] = [];
    const toUpdate: string[] = [];
    const inSync: string[] = [];
    for (const f of FEATURES) {
      const ex = byName.get(f.name);
      if (!ex) { toInsert.push(f.name); continue; }
      const reasons: string[] = [];
      if (ex.summary !== f.summary || ex.details !== f.details) reasons.push("draft copy");
      if (ex.publishedSummary !== f.summary || ex.publishedDetails !== f.details) reasons.push("published copy");
      if (!ex.publishedAt) reasons.push("unpublished");
      if (reasons.length) toUpdate.push(`${f.name} — ${reasons.join(", ")}`);
      else inSync.push(f.name);
    }
    const targetOnly = all.filter((f) => !seedNames.has(f.name)).map((f) => f.name);

    if (dryRun) {
      console.log(`\nFeature catalog diff (seed → target). Target has ${all.length} features; seed has ${FEATURES.length}.\n`);
      const list = (title: string, arr: string[]) => console.log(`${title} (${arr.length}):\n${arr.length ? arr.map((x) => `  • ${x}`).join("\n") : "  (none)"}\n`);
      list("WOULD INSERT (in seed, missing on target)", toInsert);
      list("WOULD UPDATE / PUBLISH (present but differs)", toUpdate);
      list("ALREADY IN SYNC + published", inSync);
      list("TARGET-ONLY (not in seed — left untouched)", targetOnly);
      console.log("Dry run — nothing written.");
      return;
    }

    const now = new Date();
    let inserted = 0, updated = 0;
    for (let i = 0; i < FEATURES.length; i++) {
      const f = FEATURES[i];
      const existing = byName.get(f.name);
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
