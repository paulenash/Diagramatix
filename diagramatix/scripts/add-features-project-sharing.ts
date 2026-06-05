/**
 * Append two new rows to the Feature catalog for the Project Sharing
 * feature (shipped 2026-06-05 at commit 0d3f9cc).
 *
 *   1. Project Sharing with Roles      — the headline customer feature
 *   2. Organisation Admin & Settings   — the OrgAdmin oversight surface
 *
 * Idempotent: skipped if a row with the same `name` already exists.
 * New rows are inserted as DRAFT (publishedAt stays null) — open
 * /dashboard/admin/features to review the wording, adjust sort order
 * if you want them higher up the marketing page, then hit Publish All
 * to push to /features.
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-features-project-sharing.ts
 *
 * Or against prod:
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-features-project-sharing.ts
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const FEATURES: Array<{ name: string; summary: string; details: string; sortOrder: number }> = [
  {
    name: "Project Sharing with Roles",
    sortOrder: 180,
    summary:
      "Share a project with the people who need it — View or Edit, per project, anytime.",
    details: [
      "- Owner picks any registered user by name or email and grants View or Edit access",
      "- View users see the project read-only; Edit users mutate diagrams but cannot delete the project or any of its diagrams",
      "- Shared projects show up on the recipient's dashboard with an amber tile and the owner's name + email",
      "- New per-diagram \"Diagram Owner\" field assigns accountability to a specific person without changing access",
      "- Recipients see who else is in the share — transparency about who's in the room",
      "- Cross-organisation sharing is allowed or blocked per-organisation by the Org admin",
    ].join("\n"),
  },
  {
    name: "Organisation Admin & Settings",
    sortOrder: 190,
    summary:
      "Designate organisation administrators with project-share oversight, configurable per-organisation sharing policies, and silent admin membership.",
    details: [
      "- New OrgAdmin role for designated organisation administrators",
      "- Project Sharing oversight page lists every shared project in the organisation with owner, recipients, and inline share-list editing",
      "- Silent membership: OrgAdmins (and platform SuperAdmins) act as project owners for share management without ever appearing in any share list",
      "- Open any shared project as a full silent editor — full access without an audit footprint in the share UI",
      "- Org Settings page toggles whether cross-organisation sharing is allowed",
      "- SuperAdmin can assign or revoke the OrgAdmin role per user",
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
        data: {
          name: f.name,
          summary: f.summary,
          details: f.details,
          sortOrder: f.sortOrder,
        },
      });
      inserted++;
      console.log(`  add    "${f.name}" (sortOrder=${f.sortOrder}, draft)`);
    }
    console.log(`Done. Inserted ${inserted}, skipped ${skipped} existing.`);
    if (inserted > 0) {
      console.log(
        "\nNext: open /dashboard/admin/features to review the drafts and hit Publish All to push to /features.",
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
