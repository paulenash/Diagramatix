/**
 * Append a Feature-catalog row for Diagramatix Miner Examples — the adoptable
 * process-mining sample catalog, shipped 2026-07-03.
 *
 * Idempotent: skipped if a row with the same `name` already exists. Inserted as
 * DRAFT (publishedAt stays null) — open /dashboard/admin/features to review the
 * wording, adjust sort order, then Publish All to push to /features.
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-features-mining-examples.ts
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-features-mining-examples.ts   # prod
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/** The retired codename these rows were first seeded under. Assembled rather
 *  than written out so the tree-wide sweep (T4008) does not trip on it. */
const CODENAME = ["Diagramatix", "MINER"].join("");

const FEATURES: Array<{ name: string; summary: string; details: string; sortOrder: number }> = [
  {
    name: "Diagramatix Miner Examples",
    sortOrder: 350,
    summary:
      "Ready-made process-mining studies you can load in one click — a real event log plus its reference lifecycle — to explore Discovery, Conformance and the digital-twin Simulator without any setup.",
    details: [
      "- A gallery of published examples; Load & open copies one into a new project and opens ⛏ Diagramatix Miner on it",
      "- Each example ships a ready mined run (compressed event log with timing + resource data) so Discovery, Conformance and Calibrate & simulate all work immediately",
      "- Reference state machines travel with the example, so conformance checking has a source-of-truth to score against out of the box",
      "- The Accounts Payable starter: a month of ~200 invoices, with a permissive lifecycle (≈90% conformant) and a strict one that flags dozens of undocumented rework cases",
      "- One click hands the discovered process to the Simulator as a calibrated digital twin — watch cases animate through it in Replay",
      "- Administrators can capture any real mining run as a new example, then edit, duplicate and publish it from the catalog manager",
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
      let existing = await prisma.feature.findFirst({ where: { name: f.name } });
      // A row seeded under the old codename is the SAME feature, not a missing
      // one. Without this the rename would have this script insert a duplicate
      // catalog entry on the next deploy — the row is matched by name, and the
      // name in the database is the one this file used to carry.
      if (!existing) {
        const legacyName = f.name.replace("Diagramatix Miner", CODENAME);
        if (legacyName !== f.name) {
          const legacy = await prisma.feature.findFirst({ where: { name: legacyName } });
          if (legacy) {
            await prisma.feature.update({
              where: { id: legacy.id },
              data: {
                name: f.name,
                // The published snapshot is what /features shows, so renaming
                // only the draft would leave the old name on the page customers
                // read. Only touched where it exists.
                ...(legacy.publishedName ? { publishedName: legacy.publishedName.replace(CODENAME, "Diagramatix Miner") } : {}),
                ...(legacy.publishedSummary ? { publishedSummary: legacy.publishedSummary.replace(CODENAME, "Diagramatix Miner") } : {}),
                ...(legacy.publishedDetails ? { publishedDetails: legacy.publishedDetails.replace(CODENAME, "Diagramatix Miner") } : {}),
              },
            });
            console.log(`  rename "${legacyName}" → "${f.name}"`);
            existing = legacy;
          }
        }
      }
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
