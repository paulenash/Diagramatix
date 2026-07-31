/**
 * Add an "Organisation Hierarchy" chapter to the in-app User Guide: what the
 * project's Org Structure is, how to POPULATE it from the BPMN diagrams you've
 * drawn, and how to REFINE it by moving entries between levels. Placed after the
 * Process Portal chapter. Idempotent: re-running upserts the chapter + each
 * section body in place by heading.
 *
 * DB-backed guide → NOT bundled in the build; runnable against prod to publish:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-guide-org-from-bpmn.ts                             # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-guide-org-from-bpmn.ts   # prod
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SLUG = "org-hierarchy";
const TITLE = "Organisation Hierarchy";
const AFTER_SLUG = "process-portal";

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "What the Organisation Hierarchy is",
    body: [
      "Every project has an **Organisation Hierarchy** — the governed list of **Organisation → Org Unit → Team → Role** that supplies the names for your BPMN **pools and lanes**. Open it from **Project Structure** in the left panel of the project page.",
      "",
      "You can fill it three ways: **Adopt** a ready-made structure from your organisation, build it by hand, or — new — **Populate from BPMN**: derive it automatically from the diagrams you've already drawn.",
    ].join("\n"),
  },
  {
    heading: "Populate from BPMN",
    body: [
      "Click **Populate from BPMN** (next to Adopt) and give the structure a name. Diagramatix reads **every BPMN diagram in the project** and builds the hierarchy from the way you've drawn your pools and lanes:",
      "",
      "- a **white-box Pool** → an **Organisation**",
      "- a **Lane** inside it → an **Org Unit**",
      "- a **Sub-lane** inside that → a **Team**",
      "",
      "Names are **deduped** across the whole project — if five diagrams all have a *Finance* lane, you get **one** Finance Org Unit. Black-box pools (external participants and systems) are left out of the hierarchy.",
      "",
      "It is **non-destructive**: the result is **merged** into whatever structure the project already has. Existing entries are kept untouched, and anything the tool adds is treated as your own addition — so a later **Sync updates** never removes it.",
      "",
      "> No pools or lanes in your diagrams yet? The action simply reports that nothing new was found and leaves your structure unchanged.",
    ].join("\n"),
  },
  {
    heading: "Refine by moving entries between levels",
    body: [
      "The extracted hierarchy is a starting point — tidy it up right in the editor. Hover any entry and use the small controls:",
      "",
      "- **◀ Promote** — move an entry **out** one level (e.g. a Team becomes an Org Unit). It moves up under its grandparent.",
      "- **▶ Demote** — move an entry **in** one level, nesting it under the entry above it.",
      "- **▲ / ▼** — reorder an entry among its siblings.",
      "",
      "When you promote or demote, **the whole branch comes with it** and re-levels automatically, so the hierarchy always stays consistent (Organisation → Org Unit → Team → Role). You can also add a child, rename, or delete an entry as before.",
      "",
      "These same controls are available wherever the hierarchy editor appears — including the organisation-wide **master** structures under **Admin → Entity Lists** — so you can refine there too.",
    ].join("\n"),
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    let chapter = await prisma.helpChapter.findFirst({ where: { slug: SLUG, collection: "user-guide" }, include: { sections: true } });
    if (!chapter) {
      const after = await prisma.helpChapter.findFirst({ where: { slug: AFTER_SLUG, collection: "user-guide" } });
      const at = (after?.sortOrder ?? 40) + 1;
      await prisma.helpChapter.updateMany({ where: { collection: "user-guide", sortOrder: { gte: at } }, data: { sortOrder: { increment: 1 } } });
      const created = await prisma.helpChapter.create({ data: { slug: SLUG, collection: "user-guide", title: TITLE, sortOrder: at } });
      chapter = { ...created, sections: [] };
      console.log(`Created chapter "${TITLE}" at sortOrder ${at}.`);
    } else {
      await prisma.helpChapter.update({ where: { id: chapter.id }, data: { title: TITLE } });
      console.log(`Chapter "${TITLE}" already exists — updating sections in place.`);
    }

    let i = 0;
    for (const s of SECTIONS) {
      const existing = chapter.sections.find((x) => x.heading === s.heading);
      if (existing) {
        await prisma.helpSection.update({ where: { id: existing.id }, data: { bodyMarkdown: s.body, sortOrder: i } });
        console.log(`  update "${s.heading}"`);
      } else {
        await prisma.helpSection.create({ data: { chapterId: chapter.id, heading: s.heading, bodyMarkdown: s.body, sortOrder: i } });
        console.log(`  insert "${s.heading}"`);
      }
      i++;
    }
    console.log("Done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
