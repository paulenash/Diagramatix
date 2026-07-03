/**
 * Append a Feature-catalog row for DiagramatixMINER (Process Mining), shipped
 * 2026-07-03.
 *
 * Idempotent: skipped if a row with the same `name` already exists. Inserted as
 * DRAFT (publishedAt stays null) — open /dashboard/admin/features to review the
 * wording, adjust sort order, then Publish All to push to /features.
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-features-process-mining.ts
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-features-process-mining.ts   # prod
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const FEATURES: Array<{ name: string; summary: string; details: string; sortOrder: number }> = [
  {
    name: "DiagramatixMINER — Process Mining",
    sortOrder: 340,
    summary:
      "Ingest event logs from your systems and DiagramatixMINER reconstructs the process you actually run — the implied BPMN, the entity's real lifecycle, and where reality deviates from your reference — then calibrates a credible simulation twin in one click.",
    details: [
      "- Import standard CSV event logs (case, activity, timestamp, state, optional resource) with auto-detected column mapping and a live preview",
      "- Discovers the implied BPMN process — an editable diagram with gateways at every branch, loops, and a detail slider to move between the happy path and the full spaghetti",
      "- Proposes a candidate State Machine — the real lifecycle of the underlying entity (Invoice, Employee, Registrant…), with each transition labelled by its triggering activity",
      "- Conformance checking against a reference State Machine: a fitness %, plus undocumented transitions, unknown states, unexpected entries/exits and never-used (dead) transitions — weighted by how many cases they affect",
      "- One-click digital twin: writes mined durations, arrival rates, gateway probabilities, teams/capacity and working-hours calendars onto the discovered process and opens it straight in the Simulator",
      "- Closes the loop — mine → discover → conform → simulate → improve — so to-be redesigns are compared against a baseline calibrated from real data, not guesses",
      "- Runs are saved per project and re-checkable against a different reference without re-uploading",
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
