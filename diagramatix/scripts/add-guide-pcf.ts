/**
 * Add a "Process Classification (APQC PCF)" chapter to the in-app User Guide,
 * documenting: browsing the framework, classifying diagrams, Create APQC Project
 * (seed folders), Create APQC Process (decompose / AI / numbering), coverage,
 * by-category compliance, tailored frameworks (compose/curate/divisions), the
 * version-upgrade wizard, and the APQC attribution/licence. Placed right after
 * "Risk & Controls (GRC)". Idempotent: re-running upserts the chapter + each
 * section body in place by heading.
 *
 * DB-backed guide → NOT bundled in the build; auto-seeded on deploy and runnable
 * against prod to publish:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-guide-pcf.ts                                # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-guide-pcf.ts      # prod
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SLUG = "pcf";
const TITLE = "Process Classification (APQC PCF)";
const AFTER_SLUG = "risk-controls"; // place immediately after Risk & Controls

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "What the APQC PCF gives you",
    body: [
      "The **APQC Process Classification Framework® (PCF)** is a recognised industry taxonomy of business processes — a five-level hierarchy from broad **Categories** down through **Process Groups**, **Processes**, **Activities** and **Tasks**. Diagramatix ships the **Cross-Industry** framework plus industry variants (Banking, Healthcare, Retail, Telecommunications, Utilities and more).",
      "",
      "Classifying your models against the PCF lets them **speak the recognised language** of your industry, seeds real structure for you, grounds AI generation on the standard, shows **coverage** (what you've modelled vs. gaps), and — uniquely — lets you build your **own governed, upgradeable framework** on top of the standard.",
      "",
      "Browse it any time from **SuperAdmin/OrgAdmin → Process Classification (APQC PCF)**.",
    ].join("\n"),
  },
  {
    heading: "Classifying a diagram",
    body: [
      "Open a diagram, click empty canvas so nothing is selected, and in the **Diagram Properties** panel use **Classify against APQC PCF** — pick a framework and search for the standard process this diagram represents (by code, by name, or both, e.g. `1.1.1 Assess the external environment`).",
      "",
      "The classification is remembered by APQC's **stable process id**, so it survives framework version updates. The chosen code, name and framework are shown on the panel; **Change** or **Clear** at any time.",
    ].join("\n"),
  },
  {
    heading: "Create APQC Project",
    body: [
      "On the Dashboard, **◎ Create APQC Project** (next to *New Project*) spins up a project whose **folder structure mirrors a chosen PCF branch**. Pick a framework, optionally a **root process**, and a **depth** — with a root, depth is relative to it (e.g. *2 levels below*); without one, it's absolute from Categories. The APQC settings are saved on the project and become the defaults when you generate diagrams inside it.",
    ].join("\n"),
  },
  {
    heading: "Create APQC Process — one-click generation",
    body: [
      "On the project screen, **◎ Create APQC Process** turns a standard process into a real BPMN model in one click:",
      "",
      "- Choose a framework (defaults to the project's) and search for the process; the search is pre-filled from the folder you're in.",
      "- A **higher-level** process **decomposes** — each child activity becomes a **Collapsed Sub-process**, laid out Start → … → End.",
      "- A **Task-level** process is **AI-generated** into a detailed model, grounded on the APQC branch.",
      "- Tick **APQC numbering** to prefix every task / sub-process label with its APQC code; the code is also stored on the element and shown in its Properties.",
      "",
      "The new diagram is tagged with the APQC reference and dropped into the current folder.",
    ].join("\n"),
  },
  {
    heading: "Coverage — what's modelled vs. gaps",
    body: [
      "From a project's **Properties** panel (top folder selected), **View APQC coverage** shows, for the project's framework or branch, which PCF processes are **modelled** (have a classified diagram) and which are **gaps** — a headline percentage, per-category bars, and a drill-down tree with ✓ modelled / ◐ partial / ○ gap markers and links to the modelling diagram. A **gaps-only** filter hides everything you've already covered.",
    ].join("\n"),
  },
  {
    heading: "Compliance by APQC category",
    body: [
      "In the org-wide **Compliance Monitoring** console, the **By APQC category** view rolls **control operating-effectiveness** and **conformance fitness** up by the APQC category each project is aligned to (via its linked framework root) — worst-first, with below-threshold flags. It ties the standard directly to your live process models and mined execution data.",
    ].join("\n"),
  },
  {
    heading: "Building your own tailored framework",
    body: [
      "Beyond classifying against the standard, an org can **compose its own framework**. In **Process Classification (APQC PCF)**, use **New tailored framework**, then:",
      "",
      "- **Compose** branches from any reference variant(s) — every copied node keeps its **provenance** back to APQC (so attribution holds and it can be upgraded).",
      "- **Extend** with your own **custom** processes.",
      "- **Curate** — rename to your terminology (keeps the link to the standard), hide what's irrelevant, set your own codes, and remove.",
      "- Scope a framework to a business unit with a **division**.",
    ].join("\n"),
  },
  {
    heading: "Staying current — the upgrade wizard",
    body: [
      "When APQC releases a new version, a SuperAdmin imports the newer workbook (it supersedes the previous version, which is kept for history). On the reference framework, **⭫ Version upgrade** shows a **diff** — added / renamed / removed processes — and **your usage impact** (how many classified diagrams and tailored nodes are affected, and how many point at removed processes). **Apply** re-points your classifications and tailored-framework provenance to the new version by the stable process id; anything removed is **flagged**, not silently broken.",
    ].join("\n"),
  },
  {
    heading: "Attribution & licence",
    body: [
      "Diagramatix uses APQC's PCF® under APQC's **royalty-free licence**, which permits copying, modifying and redistributing the framework provided **APQC's notice travels with every copy and derivative**. The notice is preserved on every framework (including your tailored ones) and is **automatically included in any export that carries PCF content** (project and single-diagram JSON/XML, and the public process view). *Process Classification Framework* and *PCF* are registered trademarks of APQC.",
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
      const at = (after?.sortOrder ?? 37) + 1;
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
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
