/**
 * Append Feature-catalog rows for the late-July 2026 batch:
 *   • Organisation Hierarchy from BPMN (+ move-between-levels refine)
 *   • AI Usage & Attempt Insights
 *   • ArchiMate 3.2 — Junctions & Groupings
 *
 * Idempotent: skipped if a row with the same `name` already exists. Inserted as
 * DRAFT (publishedAt stays null) — open /dashboard/admin/features to review the
 * wording / sort order, then Publish All to push to /features.
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-features-jul2026-batch.ts                            # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-features-jul2026-batch.ts  # prod
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const FEATURES: Array<{ name: string; summary: string; details: string; sortOrder: number }> = [
  {
    name: "Organisation Hierarchy from BPMN",
    sortOrder: 210,
    summary:
      "Build your Organisation → Org Unit → Team hierarchy straight from the pools, lanes and sub-lanes you've already drawn — then refine it by moving entries between levels.",
    details: [
      "- One click in **Project Structure → Populate from BPMN** reads every BPMN diagram in the project and builds the Organisation Hierarchy: white-box **Pool → Organisation**, **Lane → Org Unit**, **Sub-lane → Team**",
      "- Names are **deduped** across diagrams — one \"Finance\" Org Unit, however many diagrams mention it",
      "- **Non-destructive**: it merges into any existing structure and keeps your own additions (later \"Sync updates\" never removes them)",
      "- **Refine by moving between levels** — promote, demote and reorder entries; the whole moved branch re-levels automatically to stay consistent",
      "- The same move controls work in the org-admin master Entity-List editor, not just in projects",
      "- The result immediately drives pool/lane name suggestions on the canvas",
    ].join("\n"),
  },
  {
    name: "AI Usage & Attempt Insights",
    sortOrder: 220,
    summary:
      "See exactly how AI is being used — your attempts left this month, the diagrams you've generated, and full raw/success/failure analytics per person and per organisation.",
    details: [
      "- Every member sees **AI attempts left this month** (and when they reset) plus **diagrams generated this month** in their usage panel",
      "- Admin **AI Usage** dashboard separates the measures clearly: **Raw Attempts** (every call), **Successes / Failures**, **User Attempts** (the quota-consuming ones), and **# Diagrams generated using AI**",
      "- Per-user and per-organisation breakdowns, over-time charts, tokens and estimated cost",
      "- **Fair counting**: transcript \"AI Tidy\" clean-ups and failed calls are tracked for analytics but never consume a member's monthly attempt allowance",
      "- Monthly allowances are set per subscription tier and enforced automatically",
    ].join("\n"),
  },
  {
    name: "ArchiMate 3.2 — Junctions & Groupings",
    sortOrder: 230,
    summary:
      "And/Or junctions and Grouping containers are now recognised when importing an ArchiMate image, and are first-class, fully-editable shapes on the canvas.",
    details: [
      "- **And / Or junctions** are detected from an imported ArchiMate diagram and wired through the relationships they join",
      "- **Groupings** are proper containers — easy to select (icon or any boundary), move as a unit, resize, double-click to rename, and nest other elements inside",
      "- Updated to the **ArchiMate 3.2** element set, including the Location element and refined icon/box notation on ingestion",
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
    if (inserted > 0) console.log("\nNext: open /dashboard/admin/features to review the draft and hit Publish All to push to /features.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
