/**
 * Add a SuperAdmin-only User Guide section describing the **Technical Design
 * Notes** feature + the **Document Editor** and how to use it. Lives in the
 * existing SuperAdmin ("admin-roles") chapter of the user-guide collection, as an
 * adminOnly section (hidden from User / OrgAdmin viewers). Idempotent: upsert by
 * heading. Mirrors scripts/add-guide-*.ts.
 *
 * Run: DATABASE_URL="postgres://postgres:postgres@localhost:5432/diagramatix" npx tsx scripts/add-guide-tech-design-notes.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const CHAPTER_SLUG = "admin-roles";        // the "SuperAdmin" user-guide chapter
const HEADING = "Technical Design Notes & the Document Editor";

const BODY = [
  "**Technical Design Notes** is a SuperAdmin-only document that captures the low-level design of the product's deep subsystems — **Simulator**, **DiagramatixMINER** and the **Risk & Control Matrix** — including the import/export **standards** each supports (XES, OCEL, BPSim, OOXML). It's edited in the same WYSIWYG editor as the User Guide, and any document can be exported to a Word **`.docx`** file.",
  "",
  "### Where it lives",
  "",
  "The User Guide editor is now the **Document Editor** (SuperAdmin → **Document Editor**). A dropdown at the top switches between the two documents:",
  "",
  "- **User Guide** — the in-app help all users read at `/help`.",
  "- **Technical Design Notes** — the SuperAdmin-only notes, read at `/tech-notes`.",
  "",
  "The two are fully isolated: saving one never affects the other. There is **no publish cycle** — content is live the moment you save.",
  "",
  "### Editing",
  "",
  "1. Open **SuperAdmin → Document Editor** (or the **Technical Design Notes** tile, which opens the editor with that document pre-selected).",
  "2. Pick **Technical Design Notes** in the document dropdown.",
  "3. Add / reorder chapters and sections and edit with the WYSIWYG toolbar (headings, bold/italic, lists, tables, links, images, symbols) — exactly like the User Guide.",
  "4. **Save notes**. Switching documents with unsaved changes prompts first.",
  "",
  "### Exporting to Word (.docx)",
  "",
  "Use the **Export ▾** menu (edit mode):",
  "",
  "- **Whole document (.docx)** — the entire document as one Word file.",
  "- **This chapter — <name> (.docx)** — just the chapter you're viewing.",
  "",
  "Headings, tables, lists, code blocks and images all carry across. (Symbol shortcodes render as their label text; embedded images come from the Help image library.)",
  "",
  "### Reading",
  "",
  "Open **Read Technical Design Notes** (or `/tech-notes`) for a clean, print-friendly read view with a left-hand chapter nav — no editor chrome. The whole route is SuperAdmin-only.",
  "",
  "> The three seeded chapters (Simulator / Miner / RCM Design) are a living reference — edit them as the design evolves, and add new chapters for other subsystems.",
].join("\n");

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const chapter = await prisma.helpChapter.findFirst({ where: { slug: CHAPTER_SLUG, collection: "user-guide" }, include: { sections: true } });
    if (!chapter) { console.error(`No "${CHAPTER_SLUG}" user-guide chapter — nothing to do.`); process.exit(1); }

    const existing = chapter.sections.find((s) => s.heading === HEADING);
    if (existing) {
      await prisma.helpSection.update({ where: { id: existing.id }, data: { bodyMarkdown: BODY, adminOnly: true } });
      console.log(`Updated existing section "${HEADING}".`);
    } else {
      const sortOrder = Math.max(-1, ...chapter.sections.map((s) => s.sortOrder)) + 1;
      await prisma.helpSection.create({
        data: { chapterId: chapter.id, collection: "user-guide", heading: HEADING, bodyMarkdown: BODY, adminOnly: true, sortOrder },
      });
      console.log(`Inserted section "${HEADING}" into "${chapter.title}".`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
