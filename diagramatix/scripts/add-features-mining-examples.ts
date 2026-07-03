/**
 * Append a Feature-catalog row for DiagramatixMINER Examples — the adoptable
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

const FEATURES: Array<{ name: string; summary: string; details: string; sortOrder: number }> = [
  {
    name: "DiagramatixMINER Examples",
    sortOrder: 350,
    summary:
      "Ready-made process-mining studies you can load in one click — a real event log plus its reference lifecycle — to explore Discovery, Conformance and the digital-twin Simulator without any setup.",
    details: [
      "- A gallery of published examples; Load & open copies one into a new project and opens ⛏ DiagramatixMINER on it",
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
