/**
 * Append Feature-catalog rows for the co-authoring + domain-managed-org work
 * shipped 2026-08-03. Idempotent (skipped if a row with the same `name` exists).
 * New rows insert as DRAFT — open /dashboard/admin/features to review, then
 * Publish All to push to /features.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-features-coauthoring.ts                          # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-features-coauthoring.ts # prod
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const FEATURES: Array<{ name: string; summary: string; details: string; sortOrder: number }> = [
  {
    name: "Live Co-authoring",
    sortOrder: 200,
    summary:
      "Edit the same diagram together in real time — see who's here, who's holding what, and never overwrite each other's work.",
    details: [
      "- **Presence** — coloured initials of everyone in the diagram, updated live",
      "- **Live cursors** — see each other's cursor move around the canvas, name-tagged (real-time)",
      "- **Soft locks** — an element someone else is editing shows their coloured ring; you can't clash on it",
      "- **No silent clobber** — a version guard means two people saving at once never lose a whole document",
      "- **Automatic merge** — edits to different elements merge silently; only a genuine same-element clash is flagged",
      "- Works for anyone with Edit access to the diagram (project owner, Edit sharees, OrgAdmins)",
    ].join("\n"),
  },
  {
    name: "Domain-managed Organisations",
    sortOrder: 210,
    summary:
      "Claim your email domain so everyone who signs up on it automatically joins the right organisation — no stray personal orgs.",
    details: [
      "- An organisation \"claims\" one or more email domains (e.g. yourcompany.com)",
      "- Anyone registering with a matching email auto-joins that organisation at a configurable role",
      "- They don't get — and can't create — a personal organisation, so your tenant stays tidy",
      "- Set the claimed domains and the join-role from Org Settings (SuperAdmin)",
      "- Everyone else keeps the default: their own personal organisation",
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
      console.log(`  add    "${f.name}" (sortOrder=${f.sortOrder}, draft)`);
    }
    console.log(`Done. Inserted ${inserted}, skipped ${skipped} existing.`);
    if (inserted > 0) console.log("\nNext: /dashboard/admin/features → review the drafts → Publish All.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
