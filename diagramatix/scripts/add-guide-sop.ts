/**
 * Add a "Standard Operating Procedures (SOPs)" chapter to the in-app User Guide:
 * generating an SOP from a BPMN diagram (whole / lane / pool / subprocess / linked
 * group), the role-SOP hand-offs, editing / regenerating / deleting, exporting to
 * Word with an org/project template, and where SOPs live. Placed after the AI
 * Diagram Generation chapter. Idempotent: re-running upserts the chapter + each
 * section body in place by heading.
 *
 * DB-backed guide → NOT bundled in the build; runnable against prod to publish:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-guide-sop.ts                             # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-guide-sop.ts   # prod
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SLUG = "sop";
const TITLE = "Standard Operating Procedures (SOPs)";
const AFTER_SLUG = "ai-generate";

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "What an SOP is",
    body: [
      "A **Standard Operating Procedure (SOP)** is a written, step-by-step procedure your team can follow. Diagramatix generates one directly from a **BPMN** process diagram, so the words always match the model.",
      "",
      "Generation is grounded: a deterministic reader first walks the diagram and extracts the exact steps, responsible roles, systems, inputs/outputs, decisions and hand-offs — nothing is invented — and only then does the AI turn that into readable prose under your organisation's house style. Each SOP is an editable document you can refine, publish, and export to **Microsoft Word**.",
    ].join("\n"),
  },
  {
    heading: "Generating an SOP",
    body: [
      "Open a **BPMN diagram that lives in a project** and click **Generate SOP** in the toolbar. Choose a **scope**:",
      "",
      "- **Whole diagram** — the full end-to-end process.",
      "- **A Lane (role SOP)** — only the steps that one role performs, with the hand-offs to and from other lanes (see below).",
      "- **A Pool** — one participant's part of the process.",
      "- **A Subprocess** — one subprocess (its linked child diagram if it has one).",
      "- **A linked group (suite)** — one procedure per diagram linked from this one, assembled into a single suite document.",
      "",
      "For a lane / pool / subprocess, pick the specific element from the **Which …?** list, then click **Generate SOP**. It takes around 15–30 seconds, then opens the editable SOP with a picture of the diagram embedded.",
      "",
      "> **Tip:** you can also **right-click a lane or pool** on the canvas and choose **Generate SOP for this lane/pool** to jump straight to a role SOP.",
    ].join("\n"),
  },
  {
    heading: "Role (Lane) SOPs and hand-offs",
    body: [
      "A **Lane** or **Pool** SOP is a role-specific procedure. It contains only that role's steps — but it keeps the **global step numbers** from the whole process, so a role SOP legitimately reads \"step 1 … step 3 … step 7\" (never renumbered).",
      "",
      "It also spells out the role's **interfaces** in a **Hand-offs** section:",
      "",
      "- **Receives** — the work handed to this role from other lanes, naming who sends it and what is passed.",
      "- **Hands off** — the work this role passes on, naming the receiving lane and what is passed.",
      "",
      "The figure for a lane / pool SOP is **cropped** to just that swim-lane, so the picture shows the role's slice of the process.",
    ].join("\n"),
  },
  {
    heading: "Editing, regenerating and deleting",
    body: [
      "The SOP opens in a full-page editor. Each section has an editable **heading** and a rich-text **body** (the same editor used elsewhere in Diagramatix). You can:",
      "",
      "- reorder sections with **↑ / ↓**, delete one with **✕**, or add one with **+ Add section**;",
      "- edit the **title**, set the status to **Draft** or **Published**;",
      "- **Remove figure** to drop the embedded diagram picture;",
      "- **Regenerate** — re-run the AI over the source diagram, replacing the text sections while keeping the figure (useful after you've changed the diagram);",
      "- **Delete** the SOP entirely.",
      "",
      "Click **Save** to store your edits. Regenerating and generating both count as one AI attempt.",
    ].join("\n"),
  },
  {
    heading: "Exporting to Word, and Word templates",
    body: [
      "Click **Export .docx** in the SOP editor to download the procedure as a Microsoft Word document, with the diagram embedded.",
      "",
      "The export adopts your organisation's **Word template** — its fonts and heading styles. Upload one at:",
      "",
      "- **Organisation level** — *OrgAdmin → SOP Templates*. Mark one as the **Default**; it's used for every SOP unless a project overrides it.",
      "- **Project level** — the **SOP Templates** link on the project screen. A project template overrides the org default for SOPs generated in that project.",
      "",
      "On each SOP Templates page, give the template a name, choose a **.docx** (or **.dotx**) file up to 8 MB, and click **Add**. Leave the file empty for a name-only template that uses the built-in look. If no template is set, exports use Diagramatix's built-in styling.",
    ].join("\n"),
  },
  {
    heading: "Where your SOPs live",
    body: [
      "Every SOP generated in a project is listed in the **Standard Operating Procedures** section of the project's left panel — open one, or delete it from there.",
      "",
      "A **whole-diagram** SOP is also linked automatically as the diagram's **Procedure Document** (Diagram Properties → Procedure Document), so it's reachable straight from the model and in the Process Portal.",
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
      const at = (after?.sortOrder ?? 31) + 1;
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
