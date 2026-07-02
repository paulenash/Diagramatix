/**
 * Append a Feature-catalog row for Simulator resource calendars / working hours
 * (Tier 1), shipped 2026-07-02.
 *
 * Idempotent: skipped if a row with the same `name` already exists. Inserted as
 * DRAFT (publishedAt stays null) — open /dashboard/admin/features to review the
 * wording, adjust sort order, then Publish All to push to /features.
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-features-simulation-calendars.ts
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-features-simulation-calendars.ts   # prod
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const FEATURES: Array<{ name: string; summary: string; details: string; sortOrder: number }> = [
  {
    name: "Simulation Working Hours & Calendars",
    sortOrder: 330,
    summary:
      "Give teams real shift patterns and sources real operating hours, so simulated throughput, utilisation and queues reflect a working week — not a 24/7 ideal.",
    details: [
      "- A reusable, project-level Calendar library — weekly open windows per weekday, with presets (Mon–Fri 9–5, 9–5 with lunch, 24/7)",
      "- Assign a calendar to any team: it's staffed at full capacity during open windows and stands down when closed",
      "- Work in progress at the end of a shift finishes; new work waits, and anything queued overnight starts the moment the shift reopens",
      "- Model breaks and full-team meetings as gaps between windows",
      "- Operating hours for arrival sources, with an optional per-window rate multiplier for time-varying (peak/off-peak) demand",
      "- Utilisation is measured against staffed time, and the replay shows work banking up out-of-hours and surging when the shift opens",
      "- Starter examples ship with a Business-hours calendar on their human teams",
    ].join("\n"),
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    let inserted = 0, skipped = 0;
    for (const f of FEATURES) {
      const existing = await prisma.feature.findFirst({ where: { name: f.name } });
      if (existing) { skipped++; console.log(`  skip   "${f.name}" (already in catalog)`); continue; }
      await prisma.feature.create({ data: { name: f.name, summary: f.summary, details: f.details, sortOrder: f.sortOrder } });
      inserted++;
      console.log(`  insert "${f.name}"`);
    }
    console.log(`Done: ${inserted} inserted, ${skipped} skipped.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
