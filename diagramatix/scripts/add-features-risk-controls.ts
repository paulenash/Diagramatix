/**
 * Append a Feature-catalog row for Risk & Control (attach Risks/Controls to
 * process steps + Risk-Control Matrix + coverage/SoD checks), shipped 2026-07-05.
 *
 * Idempotent: skipped if a row with the same `name` already exists. Inserted as
 * DRAFT (publishedAt stays null) — open /dashboard/admin/features to review the
 * wording, adjust sort order, then Publish to push to /features.
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-features-risk-controls.ts
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const FEATURES: Array<{ name: string; summary: string; details: string; sortOrder: number }> = [
  {
    name: "Risk & Control — Risk-Control Matrix",
    sortOrder: 340,
    summary:
      "Attach Risks and Controls to process steps, check control coverage on the model, and export a Risk-Control Matrix — turning your process maps into audit-ready risk documentation.",
    details: [
      "- Maintain an Organisation master library of Risks (likelihood/impact/category) and Controls (preventive/detective/corrective, owner, framework reference); each Project adopts its own editable copy",
      "- Link Controls to the Risks they mitigate, then attach either to any task, gateway or data object on the canvas",
      "- The Diagram scan flags coverage gaps (a Risk with no mitigating Control) and segregation-of-duties breaches (one lane that both raises and approves the same work)",
      "- Export the Risk-Control Matrix to Excel — every Risk, its mitigating Controls, coverage status and where each is attached on the process models",
      "- Reuses your existing model: no separate GRC tool, and controls sit right on the process they govern",
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
    if (inserted > 0) console.log("\nNext: open /dashboard/admin/features to review the draft and Publish.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
