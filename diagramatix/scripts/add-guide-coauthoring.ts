/**
 * Add a "Working Together (Co-authoring)" chapter to the in-app User Guide.
 * Idempotent: re-running upserts the chapter + each section by heading; appended
 * after the current last user-guide chapter.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-guide-coauthoring.ts                          # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-guide-coauthoring.ts # prod
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const COLLECTION = "user-guide";
const SLUG = "co-authoring";
const TITLE = "Working Together (Co-authoring)";

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "Editing a diagram together",
    body: [
      "More than one person can open the **same diagram at the same time** and edit it together. Anyone with **Edit access** — the project owner, people the project is shared with as *Edit*, and Org Admins — can co-author; *View* users follow along read-only.",
      "",
      "You don't turn anything on: just open a diagram someone else is already in, and you're collaborating.",
    ].join("\n"),
  },
  {
    heading: "Who's here — presence",
    body: [
      "The editor header shows a row of **coloured initials** — one chip per person currently in the diagram (you first). Hover a chip for the person's name; it shows *“editing”* when they have something selected.",
      "",
      "A chip appears within a few seconds of someone joining and disappears within about half a minute of them leaving.",
    ].join("\n"),
  },
  {
    heading: "Live cursors",
    body: [
      "When live cursors are enabled for your workspace, you'll also see **each other's cursor** gliding around the canvas in real time, tagged with the person's name and colour. Cursors move with the diagram as you pan and zoom, so they always point at the same place for everyone.",
      "",
      "> Live cursors are an optional real-time layer. Presence, locks and safe saving (below) work everywhere regardless.",
    ].join("\n"),
  },
  {
    heading: "Soft locks — no clashing on the same shape",
    body: [
      "While another editor has an element selected, it shows a **dashed ring in their colour** with their initials, and you can't move, resize, rename or delete it. The lock clears on its own once they deselect or leave.",
      "",
      "This is a gentle nudge to keep out of each other's way — it isn't a hard barrier, and the safe-saving below is always the real backstop.",
    ].join("\n"),
  },
  {
    heading: "Safe saving & automatic merge",
    body: [
      "Everyone's changes save automatically. If two people save at nearly the same moment, Diagramatix **merges** them for you: edits to **different** shapes are combined silently, so nobody's work is lost.",
      "",
      "The only time you'll see a note is a **genuine clash** — the *same* element changed by both of you. Then a small amber banner tells you *“N element(s) you both edited kept their version”* so you can review that one shape. Everything else you did is kept.",
      "",
      "This replaces the old behaviour where the last person to save could unknowingly overwrite everyone else's work.",
    ].join("\n"),
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    let chapter = await prisma.helpChapter.findFirst({ where: { slug: SLUG, collection: COLLECTION }, include: { sections: true } });
    if (!chapter) {
      const last = await prisma.helpChapter.findFirst({ where: { collection: COLLECTION }, orderBy: { sortOrder: "desc" } });
      const at = (last?.sortOrder ?? 0) + 1;
      const created = await prisma.helpChapter.create({ data: { slug: SLUG, collection: COLLECTION, title: TITLE, sortOrder: at } });
      chapter = { ...created, sections: [] };
      console.log(`Created ${COLLECTION} chapter "${TITLE}" at sortOrder ${at}.`);
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
