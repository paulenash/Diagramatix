/**
 * Add a "Project Numbering" chapter to the in-app User Guide, documenting the
 * Project re-numbering system: configuring, the two modes, preview + apply, where
 * codes appear, and the "Show non-APQC" highlight. Placed right after the APQC PCF
 * chapter. Idempotent: upserts the chapter + each section by heading.
 *
 * DB-backed guide → NOT bundled in the build; auto-seeded on deploy and runnable
 * against prod:
 *   cd diagramatix && npx tsx scripts/add-guide-numbering.ts                      # local
 *   cd diagramatix && DATABASE_URL="<prod url>" npx tsx scripts/add-guide-numbering.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SLUG = "project-numbering";
const TITLE = "Project Numbering";
const AFTER_SLUG = "pcf"; // place immediately after Process Classification (APQC PCF)

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "What Project Numbering does",
    body: [
      "**Project Numbering** gives a whole project a consistent set of hierarchical codes — on its **folders**, **diagrams** and **activities** — so every process step has a stable reference. You choose between keeping your **APQC** structure or renumbering the project **from the root**, and you always **preview every change** before anything is written.",
      "",
      "Open it from the **Project Properties** panel (select the top of the project in the navigation tree) → **Process Numbering** → **Configure / Renumber…**.",
    ].join("\n"),
  },
  {
    heading: "Two modes",
    body: [
      "**APQC-preserving** *(APQC projects only)* — keeps the APQC folder structure and diagram names exactly as generated, and renumbers each diagram's **activities** contiguously. Steps you've added outside the framework are numbered after the APQC ones, and gaps left by deleted APQC steps close up automatically. APQC numbers stay **bare** (e.g. `…10`, `…11`) and always sort correctly.",
      "",
      "**Full renumber** — renumbers the whole project from the root: folders, diagrams and activities. Codes follow the pattern **`PREFIX` + top-level number, then dotted levels** — for example `ABC2.3.1.4`. The **prefix** is 0–3 uppercase letters you set once for the project. Each level uses a **single digit up to 9**, then **two digits (zero-padded)** once there are 10 or more items at that level.",
    ].join("\n"),
  },
  {
    heading: "Preview and confirm",
    body: [
      "Click **Preview renumber…** to see every affected folder, diagram and activity as **old → new**. On the first run the old value is *(none)*; on an APQC renumber it shows the existing APQC number. Activities are marked APQC vs non-APQC.",
      "",
      "Nothing is changed until you click **Confirm renumber**. **Cancel** or **Back** discard the preview with no effect. Re-running later is safe — if nothing has changed, the preview is empty (codes never stack up).",
    ].join("\n"),
  },
  {
    heading: "Where the codes appear",
    body: [
      "- **Activities** show their code on the **first line** of the step, above the activity name.",
      "- **Diagram** names are prefixed with the diagram's code.",
      "- **Folder** names are prefixed with their code (full renumber only).",
    ].join("\n"),
  },
  {
    heading: "Show non-APQC",
    body: [
      "For an APQC project, the **Show non-APQC (highlight)** toggle (on the same Process Numbering panel) reveals everything that was added **outside** the APQC framework, highlighted in the **APQC colour**:",
      "",
      "- non-APQC **folders and diagrams** are highlighted in the **navigation tree** and on their **tiles**;",
      "- non-APQC **activities** get a highlight ring on the **diagram canvas**.",
      "",
      "It's a quick way to see what's been extended beyond the standard.",
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
      const at = (after?.sortOrder ?? 38) + 1;
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
        await prisma.helpSection.create({ data: { chapterId: chapter.id, collection: "user-guide", heading: s.heading, bodyMarkdown: s.body, sortOrder: i } });
        console.log(`  insert "${s.heading}"`);
      }
      i++;
    }
    console.log("Done.");
  } finally { await prisma.$disconnect(); }
}

main().catch((e) => { console.error(e); process.exit(1); });
