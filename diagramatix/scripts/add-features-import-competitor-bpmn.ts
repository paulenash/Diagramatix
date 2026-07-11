/**
 * Append a Feature-catalog row for importing other vendors' BPMN diagrams as-is
 * (free-form / imported layout + AI image reproduction). Idempotent (refreshed
 * by `name`). Inserted as DRAFT — review at /dashboard/admin/features and Publish.
 *
 * Run: cd diagramatix && DATABASE_URL="…" npx tsx scripts/add-features-import-competitor-bpmn.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const FEATURES: Array<{ name: string; summary: string; details: string; sortOrder: number }> = [
  {
    name: "Import another vendor's BPMN diagram",
    sortOrder: 400,
    summary:
      "Bring a BPMN diagram drawn in another tool into Diagramatix exactly as it looks — pools any size or side-by-side, message flows drawn straight between elements that aren't lined up — without a wall of layout warnings.",
    details: [
      "- **Reproduce from an image:** attach a picture of the diagram to AI Generate, tick “Reproduce original layout”, and Diagramatix rebuilds it at the positions it was drawn — pools, lanes, tasks, gateways and the connectors between them, kept where they are",
      "- **Free-form / imported layout:** a per-diagram switch (Diagram Properties) that lets pools be any size and sit anywhere (not forced into stacked full-width bands) and lets message flows run rectilinearly between elements that aren't vertically aligned",
      "- **No false errors:** the layout validation that enforces Diagramatix's own conventions is relaxed for these diagrams, so an imported foreign model isn't buried in red flags",
      "- **Still fully editable:** an imported diagram is a normal Diagramatix diagram — move things, edit labels, and draw more, all without the editor snapping pools back into a column or messages back to vertical",
      "- **Safe fallback:** if the picture is too rough to place precisely, the import still succeeds using Diagramatix's clean auto-layout rather than failing",
    ].join("\n"),
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    let inserted = 0, updated = 0;
    for (const f of FEATURES) {
      const existing = await prisma.feature.findFirst({ where: { name: f.name } });
      if (existing) {
        await prisma.feature.update({ where: { id: existing.id }, data: { summary: f.summary, details: f.details, sortOrder: f.sortOrder } });
        updated++;
        console.log(`  update "${f.name}" (text refreshed, publish status kept)`);
        continue;
      }
      await prisma.feature.create({ data: { name: f.name, summary: f.summary, details: f.details, sortOrder: f.sortOrder } });
      inserted++;
      console.log(`  add    "${f.name}" (draft)`);
    }
    console.log(`Done. Inserted ${inserted}, updated ${updated}.`);
  } finally { await prisma.$disconnect(); }
}

main().catch((err) => { console.error(err); process.exit(1); });
