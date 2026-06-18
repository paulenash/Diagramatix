/**
 * Append a Feature-catalog row for Entity Lists (governed name sources for
 * BPMN pools/lanes), shipped 2026-06-18.
 *
 * Idempotent: skipped if a row with the same `name` already exists. Inserted
 * as DRAFT (publishedAt stays null) — open /dashboard/admin/features to
 * review the wording, adjust sort order, then Publish All to push to /features.
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-features-entity-lists.ts
 *
 * Or against prod:
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-features-entity-lists.ts
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const FEATURES: Array<{ name: string; summary: string; details: string; sortOrder: number }> = [
  {
    name: "Entity Lists — Governed Pool & Lane Naming",
    sortOrder: 200,
    summary:
      "Name BPMN pools and lanes from a maintained Organisation hierarchy, external-participant list and IT-systems list — consistent across every diagram.",
    details: [
      "- Maintain three reusable lists per Organisation: External Participants, IT Systems, and an Organisation → Org Unit → Team → Role hierarchy",
      "- Each Project adopts an org structure as its own editable copy, so projects tailor names without touching the master",
      "- Renaming a white-box Pool pre-fills the default Organisation name and shows the whole indented structure; type to filter, press Enter to accept, or pick any level",
      "- Lanes draw from the same hierarchy; black-box pools draw from the External Participants or IT Systems list",
      "- A brand-new name prompts where it belongs in the hierarchy and is saved to the project structure on the spot",
      "- Maintained by Project Owners, OrgAdmins and SuperAdmins, with role-appropriate options",
    ].join("\n"),
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });

  try {
    let inserted = 0;
    let skipped = 0;
    for (const f of FEATURES) {
      const existing = await prisma.feature.findFirst({ where: { name: f.name } });
      if (existing) {
        skipped++;
        console.log(`  skip   "${f.name}" (already in catalog)`);
        continue;
      }
      await prisma.feature.create({
        data: { name: f.name, summary: f.summary, details: f.details, sortOrder: f.sortOrder },
      });
      inserted++;
      console.log(`  add    "${f.name}" (sortOrder=${f.sortOrder}, draft)`);
    }
    console.log(`Done. Inserted ${inserted}, skipped ${skipped} existing.`);
    if (inserted > 0) {
      console.log("\nNext: open /dashboard/admin/features to review the draft and hit Publish All to push to /features.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
