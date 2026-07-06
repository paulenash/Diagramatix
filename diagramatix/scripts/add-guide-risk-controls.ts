/**
 * Add a "Risk & Controls (GRC)" chapter to the in-app User Guide, documenting the
 * Risk & Control Matrix: the org-master → project-copy catalog, attaching risks &
 * controls to steps, org-wide numbering + the Org Owner, the console's Catalog /
 * Analytics tabs, the on-canvas red/green highlight, coverage & SoD checks, and
 * control operating-effectiveness from mining. Placed right after "DiagramatixMINER
 * — Process Mining" (effectiveness is proven from mining runs). Idempotent:
 * re-running upserts the chapter + each section body in place by heading.
 *
 * DB-backed guide → NOT bundled in the build; auto-seeded on deploy and runnable
 * against prod to publish:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-guide-risk-controls.ts                                # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-guide-risk-controls.ts      # prod
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SLUG = "risk-controls";
const TITLE = "Risk & Controls (GRC)";
const AFTER_SLUG = "process-mining"; // place immediately after DiagramatixMINER

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "What Risk & Controls does",
    body: [
      "**Risk & Controls** puts **governance, risk and compliance (GRC) on the model**. Instead of keeping a Risk-Control Matrix in a separate spreadsheet that drifts from reality, you attach **Risks** and the **Controls** that mitigate them directly to the real steps of your process — then export the auditor's matrix straight from the diagram.",
      "",
      "A catalog holds seven kinds of GRC object: **Risk, Control, Policy, Regulation, Audit Finding, KRI** (key risk indicator) and **KPI** (key performance indicator). They're joined by a **traceability graph** — a control mitigates a risk, a policy is enforced by a control, a regulation is satisfied by a policy, and so on — so you can trace any obligation from the rule that demands it down to the step that carries it.",
      "",
      "Open it from a project's action menu — **Risk & Controls** — to manage the catalog, or work with individual risks and controls right on a diagram in the Properties Panel.",
    ].join("\n"),
  },
  {
    heading: "The catalog — org master vs. project copy",
    body: [
      "Like Entity Lists, the catalog follows an **org-master → project-copy** pattern:",
      "",
      "- The **organisation** maintains a **master library** — the canonical set of risks, controls and policies everyone starts from.",
      "- Each **project adopts a copy** it can edit independently. Adopting clones the master's items and the links between them into the project, so a project's tweaks never disturb the master or another project.",
      "",
      "Because a project holds its **own** copy, teams can add project-specific risks or refine a control's wording without asking, while the org master stays the single reference.",
    ].join("\n"),
  },
  {
    heading: "Org-wide numbering & the Org Owner",
    body: [
      "Every item carries a short **code** — `R-001` for the first risk, `C-001` for the first control, then `P-` policies, `REG-` regulations, `AF-` audit findings, `KRI-` and `KPI-`.",
      "",
      "Codes are **organisation-wide**: there is a single running sequence per kind across **all** of the org's projects, so the same control reads the *same code everywhere* it appears. Create a new risk in one project and it continues the org's risk sequence — it won't clash with a risk of the same number in another project.",
      "",
      "**Org Owner.** Numbering is driven by the project's **Org Owner** — the organisation the project belongs to — shown as a small chip in the project header. Everyone can see it; **only a SuperAdmin can change it** (via the picker in the header). Reassigning a project to a different Org Owner moves it onto that org's numbering sequence.",
      "",
      "> If you're a SuperAdmin bringing older projects onto org-wide numbering, run `scripts/renumber-org-rcm-codes.ts` once — it renumbers an org's whole catalog consistently (shared controls keep one code) and updates the codes shown on every diagram. It's safe to re-run.",
    ].join("\n"),
  },
  {
    heading: "Attaching risks & controls to a step",
    body: [
      "Select an element on a diagram and open the **Risk & Controls** section in the Properties Panel (it sits below Simulation and is collapsed by default). From there, attach any risk or control from the project's library to that step.",
      "",
      "A step remembers what's attached by **id**, with the code and label cached for display — so the step keeps showing the right risks and controls, and the exported matrix can resolve them, even if a label is later reworded.",
      "",
      "**See the risks and controls at a glance.** While the Risk & Controls section is open, the canvas highlights every step that carries a **Risk with a red ring** and every step that carries a **Control with a green ring** (a step with both gets both rings). Collapse the section and the rings disappear — a quick way to read the risk-and-control landscape of the whole process without clicking through each step.",
    ].join("\n"),
  },
  {
    heading: "The console — Catalog & Analytics",
    body: [
      "The **Risk & Controls console** has two tabs:",
      "",
      "- **Catalog** — the editor: add, edit and link risks, controls, policies and the rest; adopt the org master; export the matrix.",
      "- **Analytics** — an at-a-glance dashboard of the project's GRC posture: how many of each kind you hold, **control coverage** (which risks have a mitigating control and which are gaps), **inherent vs. residual** risk posture by band (high / medium / low), the mix of **control types** (preventive / detective / corrective) and **automation** (manual / automated), how much of the catalog is actually **attached to the model**, and **operating-effectiveness** across your controls.",
      "",
      "The analytics update live from what's in the catalog and on the model — no separate report to run.",
    ].join("\n"),
  },
  {
    heading: "Coverage & segregation-of-duties checks",
    body: [
      "Two governance checks run alongside the normal diagram issue scanner and flag the offending steps:",
      "",
      "- **Control coverage** — a step that carries a **Risk with no mitigating Control** is flagged as a coverage hole.",
      "- **Segregation of duties** — a lane that performs both a *create/raise* activity **and** an *approve* activity is flagged, because one team shouldn't do both.",
      "",
      "Fixing these before an audit is far cheaper than explaining them during one.",
    ].join("\n"),
  },
  {
    heading: "Proving controls actually operate (from mining)",
    body: [
      "A control on paper isn't the same as a control that *works*. Risk & Controls ties each control to **real execution data** from **DiagramatixMINER**:",
      "",
      "- If a mining run reports **governance evidence** for the control's code, effectiveness is `applied ÷ expected` cases.",
      "- Otherwise, a control can name the **conformance deviation** it guards; when a run shows that deviation in N of M cases, the control was **bypassed** N times.",
      "",
      "Either way you get a plain **“bypassed in N of M cases”** figure against the control — evidence, from the process you actually ran, that the control is (or isn't) operating.",
    ].join("\n"),
  },
  {
    heading: "Exporting the Risk-Control Matrix",
    body: [
      "**Export** produces the multi-sheet Excel workbook auditors expect: a flat **Audit Grid** (one row per Activity × Risk × Control with the assurance columns), the **RCM**, a **Control Register** (with operating-effectiveness where a mining run is available), a **GRC Register**, a **Traceability** sheet, and a **Coverage Summary**.",
      "",
      "Framework references such as **SOX** or **ISO 27001** travel with each control as metadata, so the export shows which external obligation every control satisfies.",
    ].join("\n"),
  },
  {
    heading: "Ready-made examples",
    body: [
      "Not sure where to start? Adopt the **Order-to-Cash** GRC example — a complete process with risks and controls already attached to the real steps, plus a bundled mining run so control operating-effectiveness lights up the moment you adopt it. Explore it, then adapt it to your own process.",
    ].join("\n"),
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    // Place immediately after the "DiagramatixMINER" chapter; shift later chapters down.
    let chapter = await prisma.helpChapter.findFirst({ where: { slug: SLUG, collection: "user-guide" }, include: { sections: true } });
    if (!chapter) {
      const after = await prisma.helpChapter.findFirst({ where: { slug: AFTER_SLUG, collection: "user-guide" } });
      const at = (after?.sortOrder ?? 36) + 1;
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
