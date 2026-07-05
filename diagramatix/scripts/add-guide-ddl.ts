/**
 * Refresh the SuperAdmin "Logical DDL Generation" User Guide chapter (slug
 * `generate-ddl`): relabel from "Generate DDL" → "Logical DDL Generation",
 * point the steps at the renamed button, and correct the table counts to match
 * the current generator (31 refs / 24 entity tables). Idempotent: updates the
 * chapter title + its sections by heading. Mirrors scripts/add-guide-*.ts.
 *
 * Run: DATABASE_URL="postgres://postgres:postgres@localhost:5432/diagramatix" npx tsx scripts/add-guide-ddl.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SLUG = "generate-ddl";
const TITLE = "Logical DDL Generation";

// heading === null matches the intro section (which has no heading).
const SECTIONS: { heading: string | null; body: string }[] = [
  {
    heading: null,
    body: "SuperAdmins can generate the Diagramatix **logical data model** — the curated logical schema of the diagram domain (organisations, users, projects, diagrams, elements, connectors, templates and entity lists, plus their reference/lookup tables) — as a SQL DDL file for any supported database type. It is a *logical* model: a normalised, dialect-portable schema, not a dump of every physical runtime table.",
  },
  {
    heading: "How to generate",
    body: [
      "1.  Click **SuperAdmin** on the Dashboard (leftmost menu item, red chip).",
      "2.  Open **Logical DDL Generation** and click **Generate Logical DDL**.",
      "3.  Choose a **Database Type** (PostgreSQL, MySQL, or SQL Server).",
      "4.  Click **Download** — the DDL is saved with dialect-appropriate syntax. The header comment carries the current schema version.",
    ].join("\n"),
  },
  {
    heading: "What the DDL contains",
    body: [
      "-   31 reference/lookup tables with seed INSERT data",
      "-   24 entity tables with full column definitions",
      "-   All foreign keys, indexes, and unique constraints",
      "-   No JSON columns — the fully normalised **logical** data model",
      "-   Schema version number in the header comment",
    ].join("\n"),
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const chapter = await prisma.helpChapter.findFirst({ where: { slug: SLUG, collection: "user-guide" }, include: { sections: { orderBy: { sortOrder: "asc" } } } });
    if (!chapter) { console.error(`No "${SLUG}" user-guide chapter — nothing to do.`); process.exit(1); }

    if (chapter.title !== TITLE) {
      await prisma.helpChapter.update({ where: { id: chapter.id }, data: { title: TITLE } });
      console.log(`Renamed chapter → "${TITLE}".`);
    }
    for (const def of SECTIONS) {
      const existing = chapter.sections.find((s) => (s.heading ?? null) === def.heading);
      if (existing) {
        await prisma.helpSection.update({ where: { id: existing.id }, data: { bodyMarkdown: def.body } });
        console.log(`  updated section "${def.heading ?? "(intro)"}"`);
      } else {
        const sortOrder = Math.max(-1, ...chapter.sections.map((s) => s.sortOrder)) + 1;
        await prisma.helpSection.create({ data: { chapterId: chapter.id, collection: "user-guide", heading: def.heading, bodyMarkdown: def.body, adminOnly: true, sortOrder } });
        console.log(`  inserted section "${def.heading ?? "(intro)"}"`);
      }
    }
    console.log("Logical DDL guide chapter refreshed.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
