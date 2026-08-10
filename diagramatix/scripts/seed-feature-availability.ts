/**
 * Feature Availability matrix — seed from menus_and_features/feature-availability.seed.json
 * (derived from "Feature by Subscription Level v1.4.xlsx": 1 → hidden, 80 → available).
 *
 * Idempotent: upserts one FeatureAvailability row per (level, featureKey). Re-running
 * resets the matrix to the spreadsheet defaults — a SuperAdmin's later edits in the
 * admin grid persist until this is re-run, so only run on first deploy / a deliberate
 * reset. Requires the SubscriptionLevel rows (run seed-subscriptions.ts first).
 *
 * Run:  export PATH="$PATH:/c/Program Files/nodejs"; cd diagramatix
 *       npx tsx scripts/seed-feature-availability.ts
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "../app/lib/db";
import { FEATURE_KEYS } from "../app/lib/features/registry";

interface SeedShape { levels: string[]; rows: { key: string; states: Record<string, string> }[] }

async function main() {
  const path = join(process.cwd(), "menus_and_features", "feature-availability.seed.json");
  const seed = JSON.parse(readFileSync(path, "utf8")) as SeedShape;

  // Sanity: every registry key must be seeded, and every seeded level must exist.
  const seededKeys = new Set(seed.rows.map((r) => r.key));
  const missing = FEATURE_KEYS.filter((k) => !seededKeys.has(k));
  if (missing.length) throw new Error(`Seed missing feature rows for: ${missing.join(", ")}`);

  const levels = await prisma.subscriptionLevel.findMany({ select: { id: true } });
  const levelIds = new Set(levels.map((l) => l.id));
  for (const lvl of seed.levels) {
    if (!levelIds.has(lvl)) throw new Error(`SubscriptionLevel "${lvl}" not found — run seed-subscriptions.ts first.`);
  }

  let n = 0;
  for (const row of seed.rows) {
    if (!FEATURE_KEYS.includes(row.key)) { console.warn(`Skipping unknown feature key: ${row.key}`); continue; }
    for (const level of seed.levels) {
      const state = row.states[level] ?? "hidden";
      await prisma.featureAvailability.upsert({
        where: { levelId_featureKey: { levelId: level, featureKey: row.key } },
        create: { levelId: level, featureKey: row.key, state },
        update: { state },
      });
      n++;
    }
  }
  console.log(`✔ Seeded ${n} FeatureAvailability rows (${seed.rows.length} features × ${seed.levels.length} levels).`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
