/**
 * Append a Feature-catalog row for the APQC Process Classification Framework
 * (PCF) integration. Idempotent (skipped if the `name` already exists). Inserted
 * as DRAFT — review at /dashboard/admin/features and Publish.
 *
 * Run: cd diagramatix && DATABASE_URL="…" npx tsx scripts/add-features-pcf.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const FEATURES: Array<{ name: string; summary: string; details: string; sortOrder: number }> = [
  {
    name: "Process Classification Framework (APQC PCF)",
    sortOrder: 360,
    summary:
      "Classify and structure your processes against the APQC Process Classification Framework® — the Cross-Industry standard plus industry variants — and tailor your own governed, upgradeable framework.",
    details: [
      "- Browse the full APQC PCF: the Cross-Industry framework and industry variants (Banking, Healthcare, Retail, Telecommunications, Utilities, and more) as a searchable 5-level hierarchy (Category → Process Group → Process → Activity → Task)",
      "- Classify any diagram or process against a PCF element, so your models speak the recognised industry language",
      "- Compose your own tailored framework from one or more industry variants, extend it with your own processes, curate it to your terminology, and scope it to business units/divisions",
      "- Stays current: import new APQC versions with an automatic change diff (added / renamed / removed) that carries your classifications forward — classifications key on APQC's stable process id, so they survive version updates",
      "- Uniquely integrated: report conformance and control operating-effectiveness by APQC process category, tying the standard to your live process models and mined data",
      "- Uses APQC's PCF® under its royalty-free licence with attribution preserved throughout",
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
      console.log(`  add    "${f.name}" (draft)`);
    }
    console.log(`Done. Inserted ${inserted}, skipped ${skipped}.`);
  } finally { await prisma.$disconnect(); }
}

main().catch((err) => { console.error(err); process.exit(1); });
