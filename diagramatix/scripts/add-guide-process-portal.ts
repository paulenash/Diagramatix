/**
 * Add a "Process Portal" chapter to the in-app User Guide: the org-wide,
 * search-first discovery of published processes, browse facets, the entity
 * "where-used" search (by IT system / team, with "Involving me"), admin-managed
 * Team Membership, the primary procedure document, and review-due reminders.
 * Placed after the APQC PCF chapter. Idempotent: re-running upserts the chapter
 * + each section body in place by heading.
 *
 * DB-backed guide → NOT bundled in the build; auto-seeded on deploy and runnable
 * against prod to publish:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-guide-process-portal.ts                                # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-guide-process-portal.ts      # prod
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SLUG = "process-portal";
const TITLE = "Process Portal";
const AFTER_SLUG = "pcf"; // place after the APQC PCF chapter

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "What the Process Portal is",
    body: [
      "The **Process Portal** (open it from **📚 Portal** in the dashboard header) is the place everyone in your organisation goes to **find a process** — without needing to know which project it lives in or having edit access to it.",
      "",
      "It is **search-first**: type what you're looking for and the matching published processes appear, or narrow down with the browse facets on the left. Opening one lands you in the clean, read-only viewer with the current published version.",
      "",
      "**Access-scoped, always.** The Portal only ever shows processes you already have permission to open — the published diagrams in projects you own or are shared, plus any published to you in a bundle. It makes those easy to *discover*; it never exposes anything new.",
    ].join("\n"),
  },
  {
    heading: "Searching & browsing",
    body: [
      "**Search** matches a process by its name, its owner, its APQC classification, and the systems and teams it involves — so typing *“SAP”* or *“Marketing”* finds the processes that touch them.",
      "",
      "**Facets** down the side let you narrow by:",
      "",
      "- **Type** — BPMN, State Machine, ArchiMate, and so on",
      "- **Owner** — the Diagram Owner accountable for the process",
      "- **APQC category** — where the process sits in the classification framework",
      "- **Review status** — Current, Due soon, or Overdue for its scheduled re-review",
      "",
      "Every facet shows a live count, and they **combine** — pick a type, then an owner, then a category to zero in. A card shows the process name, type, owner, version, review badge and a link to its procedure; click it to read the process.",
    ].join("\n"),
  },
  {
    heading: "Find processes by system or team (where-used)",
    body: [
      "The Portal also answers the two questions people ask most:",
      "",
      "- **“Which processes use IT System X?”** — filter by the **IT System** facet (or just search the system's name).",
      "- **“What is my team involved in?”** — filter by the **Team / Role** facet.",
      "",
      "Diagramatix reads the **pools, lanes and system shapes** on each published process and matches those names to your **Org Entity Lists** (the governed catalogue of teams, roles and IT systems). Matching is exact, and it **rolls up**: pick a team like *Marketing* and you also get the processes that only name a role beneath it (e.g. *SEO Specialist*).",
      "",
      "Names that aren't in your Entity Lists still appear — flagged as **“uncatalogued”** — so a process is never hidden, and you can see at a glance which labels are worth adding to the catalogue.",
    ].join("\n"),
  },
  {
    heading: "“Involving me” & Team Membership",
    body: [
      "Turn on **👤 Involving me** and the Portal shows just the processes that reference a **team or role you belong to** (or any role beneath it) — your personal process view.",
      "",
      "**Who sets this up.** Team membership is **admin-managed**, not self-service. An **OrgAdmin** assigns members to teams/roles for their own organisation (a **SuperAdmin** can do it for any organisation) from the **Team Membership** page — reached from the **Org Admin** menu (or the SuperAdmin dashboard). Pick a member, tick the teams/roles they belong to from your **Org-Structure Entity List**, and you're done.",
      "",
      "> No Org-Structure list yet? Create one under **Entity Lists** (Teams and Roles), then assign members. Until then, the entity facets simply list the raw names used on your diagrams.",
    ].join("\n"),
  },
  {
    heading: "The primary procedure document",
    body: [
      "A process model is clearer alongside its written **procedure (SOP)**. On any diagram, open **Diagram Properties → Procedure Document** and paste a link — a SharePoint/OneDrive file, an intranet page, or any URL — with an optional display name.",
      "",
      "Once published, that link shows as a prominent **📄 Procedure** on the process card in the Portal and in the read-only viewer, so a reader always has the diagram and the words together. The link travels with the diagram — it's part of the versioned publish snapshot and the diagram export.",
    ].join("\n"),
  },
  {
    heading: "Review-due reminders",
    body: [
      "Process maps go stale silently unless someone is nudged to check them. When you publish a diagram (or a bundle), you can set a **next-review date** or a **review cadence**.",
      "",
      "Diagramatix runs a **daily check** and, when a published process passes its review date, sends a **“review due”** notification to the **Diagram Owner** (for a bundle, the publisher) — once per review cycle, so it reminds without nagging. The same status shows as the **Review** badge in the Portal, so overdue processes are easy to spot and clear.",
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
