/**
 * Add an "Importing another vendor's BPMN diagram" chapter to the in-app User
 * Guide: the free-form / imported-layout mode and the AI image-reproduction
 * flow. Placed after the Process Portal chapter. Idempotent: re-running upserts
 * the chapter + each section body in place by heading.
 *
 * DB-backed guide → NOT bundled in the build; auto-seeded on deploy and runnable
 * against prod to publish:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-guide-import-competitor-bpmn.ts                               # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-guide-import-competitor-bpmn.ts     # prod
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SLUG = "import-competitor-bpmn";
const TITLE = "Importing another vendor's BPMN diagram";
const AFTER_SLUG = "process-portal"; // place after the Process Portal chapter

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "Why this exists",
    body: [
      "Diagramatix lays BPMN out its own tidy way: **pools are stacked as full-width horizontal bands**, and **message flows run vertically** between elements that line up. Diagrams drawn in other tools often don't follow those conventions — pools can be any size or sit **side by side**, and messages are drawn **rectilinearly** between elements that aren't lined up at all.",
      "",
      "If you just pasted such a diagram in, Diagramatix would flag it with layout warnings and quietly re-stack the pools and straighten the messages. **Free-form / imported layout** turns that off, so a competitor's diagram can be shown — and kept — exactly as it was drawn.",
    ].join("\n"),
  },
  {
    heading: "The “Free-form / imported layout” switch",
    body: [
      "On any BPMN diagram, open **Diagram Properties** and tick **Free-form / imported layout**. While it's on:",
      "",
      "- **Pools** can be any size and sit anywhere — including side by side — and they no longer snap to a full-width stack when you move or resize one.",
      "- **Message flows** can be **rectilinear** (drawn with right-angle bends, like a sequence flow) and can connect two elements that are **not** vertically aligned.",
      "- The **layout warnings** that enforce Diagramatix's own conventions (pool stacking, lane tiling, overlaps, message alignment) are **suppressed** for this diagram, so an imported model isn't buried in red flags.",
      "",
      "It's a per-diagram setting — turn it off again and the normal rules (and warnings) come straight back. Everything else about the diagram stays fully editable.",
    ].join("\n"),
  },
  {
    heading: "Reproducing a diagram from an image",
    body: [
      "The fastest way to bring in another tool's diagram is a **picture of it**:",
      "",
      "1. Open **AI Generate**, and **attach an image** of the diagram (PNG, JPEG, etc.).",
      "2. Leave **Reproduce original layout** ticked (it appears under the attached image).",
      "3. Generate the plan, review it, and **Apply**.",
      "",
      "Diagramatix reads the picture and rebuilds the model **at the positions it was drawn** — pools, lanes, tasks, gateways, events and the connectors between them — turning on Free-form / imported layout automatically. A clean-up pass lines up columns, fits lanes to their pool and keeps each element in the right pool, so the result is tidy rather than a jittery trace.",
      "",
      "> **Tip:** the AI's placement is only as good as what it can see. Review the applied diagram and nudge anything that landed slightly off — because it's a normal diagram, you can move pools and elements freely without the editor fighting you. If the picture is too rough to place precisely, the import still succeeds using Diagramatix's clean auto-layout instead.",
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
