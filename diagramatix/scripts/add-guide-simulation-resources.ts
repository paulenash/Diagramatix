/**
 * User Guide catch-up for the 2026-08 release (schema 46).
 *
 * Adds the sections describing what shipped and had no documentation:
 * simulation resources / repeats / automation / trace table / overload, gateway
 * branch shares and default flows, comparing two versions of a process, and
 * State Machine history states.
 *
 * Idempotent: chapters and sections are upserted by slug / heading, so it is
 * safe to re-run. RENAMES are applied first, because an upsert-by-heading would
 * otherwise leave the old section behind as a duplicate.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-guide-simulation-resources.ts                           # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-guide-simulation-resources.ts # prod
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const COLLECTION = "user-guide";

type Section = { heading: string; body: string; sortOrder?: number };
type Chapter = { slug: string; title: string; sections: Section[] };

/** oldHeading -> newHeading, applied before the upsert so a renamed section is
 *  edited in place instead of duplicated. */
const RENAMES: Array<{ chapter: string; from: string; to: string }> = [
  { chapter: "simulation", from: "The Team library", to: "Resources — where teams come from" },
];

/**
 * The final reading order of the Simulating Processes chapter, INCLUDING the
 * sections that were already there.
 *
 * The new material has to interleave with the old — the Trace Table belongs
 * after the results, Automation belongs after Resources — so simply appending
 * would read as an afterthought, and picking sortOrder numbers for the new ones
 * alone collides with the numbers the existing ones already hold. Restating the
 * whole order is the only version of this that is both correct and idempotent.
 *
 * Anything not listed keeps its own sortOrder, offset past the end (the trailing
 * reference section deliberately sits at 900).
 */
const SIMULATION_ORDER = [
  "Setup checklist — what every simulation needs",
  "Step by step",
  "Watching the run & intervening (the Operator)",
  "Quickly testing a partial model — auto-fill",
  "Filling a whole process tree at once",
  "Resources — where teams come from",
  "System tasks & the Automation resource",
  "Repeats & multi-instance activities",
  "Working hours & calendars",
  "Studies, scenarios & what-ifs",
  "Running it & reading the results",
  "Reading the Token Trace Table",
  "When the model cannot keep up",
  "The heatmap",
  "Ready-made examples",
  "Multiple processes & BPSim",
];

const CHAPTERS: Chapter[] = [
  {
    slug: "simulation",
    title: "Simulating Processes",
    sections: [
      {
        heading: "Resources — where teams come from",
        body: [
          "Resources are **shared pools of people (or machines)**. Open the Simulator and use the **Resources — people & automation** panel to set each one's **capacity**: how many can work at once. Capacity is what makes queues form; without it nothing ever waits.",
          "",
          "**Every resource is one you drew.** Teams are collected from your **swim-lanes** (and from any team typed directly onto a task) across the process you opened *and every sub-process it links into*. Nothing is invented behind the scenes — if a name is in the list, something in your diagrams refers to it.",
          "",
          "**Matched by name.** A task uses a team by the **name** in its **◈ Simulation** section, or it inherits its swim-lane's. Two tasks naming the same team — even on different diagrams — **compete** for the same pool. It also means a typo makes a *different* team: if you see both \"Sales Team\" and \"Sales Taem\" listed, that is the diagram telling you one of them is wrong. Fix the lane or the task rather than papering over it here.",
          "",
          "**Only what is in the list can be used.** If a run charges work to a name that is not a resource, the results say so plainly — that work ran with **no capacity limit**, so its waiting times are understated. Worth reading rather than dismissing.",
          "",
          "Resources belong to the **project**, so one library serves every process in it. You can maintain them without opening a diagram: **⚙ Resources** on the project page.",
        ].join("\n"),
      },
      {
        heading: "Filling a whole process tree at once",
        body: [
          "**⚙ Fill missing simulation data** fills the process you are looking at **and every sub-process it links into** — not just the diagram on screen. A run splices linked sub-processes in, so their tasks are real work in the result; filling only the top level leaves the levels beneath it empty, and the numbers then come from somewhere you cannot see.",
          "",
          "Each level takes its **own** swim-lanes as its resources, so a sub-process owned by a different team is charged to that team. Values **you** entered are never overwritten — fill only ever adds what is missing, and **Unfill** removes what it added.",
          "",
          "**Sub-process start events are set to a fixed 0.** A linked sub-process is *entered* by a case that already exists — nothing new arrives there — so its start event takes no time. The same goes for a start event drawn inside an expanded sub-process. Fill states that explicitly, so the panel shows an answer instead of a blank you would wonder about.",
          "",
          "> Because the fill reaches sub-processes, pressing it changes more than the diagram in front of you. It only ever adds missing values, but it is worth knowing.",
        ].join("\n"),
      },
      {
        heading: "Repeats & multi-instance activities",
        body: [
          "A task marked with a **repeat** or **multi-instance** marker is done more than once per case, and the Simulator asks **how many times** — as a distribution, not a single number, because \"check each section of the message\" is rarely the same count twice.",
          "",
          "- **Sequential multi-instance (☰)** — the instances run **one after another** as a single uninterrupted block. The resource is held for the whole run of them, which is usually how a person actually works through a list.",
          "- **Parallel multi-instance (⫴)** — as many instances run **at once** as the resource allows. If the team has not enough spare capacity the remainder queue and start as capacity frees up, so a parallel marker on a one-person team behaves sequentially. The Simulator flags that rather than pretending otherwise.",
          "- **Loop (↻)** — repeats until its condition is met; the count distribution says how many passes to expect.",
          "",
          "Set the count in the task's **◈ Simulation** section, beside the cycle time. The cycle time is the duration of **one** instance — the Simulator multiplies, so do not pre-multiply it yourself.",
          "",
          "**An implausible count is reported before the run**, not silently trimmed. A distribution that can produce thousands of passes is nearly always a typo — 3 *minutes* entered where 3 *passes* were meant — and finding out afterwards costs you the whole run.",
        ].join("\n"),
      },
      {
        heading: "System tasks & the Automation resource",
        body: [
          "Real processes interleave people and systems: a person checks something, a **service task** posts it, a person handles the exception. Drawing that faithfully would mean an \"Automation\" lane with the flow zig-zagging in and out of it at every step.",
          "",
          "You do not have to. A task's **marker** decides who does it:",
          "",
          "| Marker | Charged to |",
          "|---|---|",
          "| User, Manual, or none | its **swim-lane's** team |",
          "| **Service**, **Script**, **Business Rule** | the shared **Automation** resource |",
          "| Send / Receive | its **swim-lane's** team |",
          "",
          "So a service task sitting in the Sales Team lane is **not** charged to Sales Team — it goes to **Automation**, which runs on a **24/7 calendar** and does not wait for office hours. Your diagram stays readable and the simulation still tells the truth about who is busy.",
          "",
          "Automation is an ordinary resource: it appears in the **Resources** panel, and you set its capacity and cost like any other.",
        ].join("\n"),
      },
      {
        heading: "Reading the Token Trace Table",
        body: [
          "The **Trace Table** is the whole run as a grid: one row per case, one column per element, each cell the **time spent** there. Switch the cell to **wait** or **service** to see where the time actually went. Columns follow the flow, and the worst element is called out as the bottleneck.",
          "",
          "**A blank cell means the case never went there** — it took a different branch. A cell showing **0** means it *did* go there and it took no time (a sub-process boundary, a pass-through). Zeros are dimmed so a column of them does not drown out the durations that matter.",
          "",
          "Rows outnumber the cases that arrived, because the engine also creates tokens to run a sub-process body or a boundary handler. Those are counted separately as **+ internal**, so the arithmetic still adds up.",
          "",
          "Filter with the outcome chips (completed / interrupted / in progress), or take the grid to a spreadsheet with **⇩ CSV**.",
        ].join("\n"),
      },
      {
        heading: "When the model cannot keep up",
        body: [
          "If work arrives faster than your resources can finish it, the queue never drains — it grows for as long as the run continues. That is not a technical failure. It is a **real finding about the process**, and usually the most important thing on the screen.",
          "",
          "The Simulator stops such a run rather than letting it grow without limit, and says so above the results:",
          "",
          "> ⚠ **Stopped early — the model cannot keep up.** *N* cases were still in progress and the number was still climbing.",
          "",
          "The figures below that warning cover only the part of the run that completed, so read them as a symptom, not an answer. Then do one of three things and run it again:",
          "",
          "- **raise capacity** on the busiest resource (the bottleneck is named for you),",
          "- **lower the arrival rate** at the start event, or",
          "- **shorten the longest task** — often the real fix, since cycle time is what consumes the capacity.",
          "",
          "If none of those is wrong, the process genuinely cannot cope with the demand you gave it. Better to know that here than in production.",
        ].join("\n"),
      },
    ],
  },
  {
    slug: "gateway-branching",
    title: "Gateway Branching & Default Flows",
    sections: [
      {
        heading: "Branch shares on the diagram",
        body: [
          "Each outgoing branch of an **exclusive** or **inclusive** gateway can carry a **branch %** — the documented split, drawn on the connector and authored in the editor. It is part of the *drawing*: what the process does, stated for a reader.",
          "",
          "That is deliberately separate from the **branch probability** in the ◈ Simulation section, exactly as a task's documented cycle time is separate from its simulation cycle time. One is what you are telling people; the other is what the model runs. **↧ Use diagram values** copies the first into the second when you want them to agree.",
          "",
          "A running total appears as you type. For an **exclusive** gateway the shares should total **100%** — every case takes exactly one branch. For an **inclusive** gateway they need not: the branches are independent, so 90% + 30% is perfectly sensible and means 27% of cases take both.",
        ].join("\n"),
      },
      {
        heading: "The default flow",
        body: [
          "Tick **Default flow** on one outgoing branch to mark the path taken when no other condition applies. It is drawn with the standard BPMN slash through the line's tail.",
          "",
          "The rules the editor enforces, because BPMN requires them:",
          "",
          "- **At most one per gateway** — ticking a second clears the first.",
          "- **A default carries no share of its own** — it is the remainder, by definition.",
          "- **Not offered on parallel or event-based gateways**, which evaluate no conditions and so cannot have one.",
          "",
          "**An inclusive gateway with no default is flagged**, both in the panel and in the Simulator's readiness list. Its branches are independent, so a case matching none of them has nowhere to go — and the engine then has to keep it alive on the first edge, which visibly distorts that branch's numbers.",
          "",
          "Default flows **round-trip through `.bpmn`**: exported onto the gateway, where BPMN keeps them, and recognised on import.",
        ].join("\n"),
      },
    ],
  },
  {
    slug: "diff-processes",
    title: "Comparing Two Versions of a Process",
    sections: [
      {
        heading: "What Diff Processes shows you",
        body: [
          "**Diff Processes** compares two BPMN diagrams — typically an *as-is* and a *to-be*, or two points in a diagram's history — and lists what actually differs: steps **added**, **removed**, **renamed** or **moved between lanes**, and changed **connectors**, **gateways** and **properties**.",
          "",
          "It reads the two models rather than comparing pictures, so renaming a task is reported as a rename, not as a delete plus an add.",
        ].join("\n"),
      },
      {
        heading: "Running a comparison",
        body: [
          "Pick the two diagrams and run the comparison; you get a table to work through. From there you can:",
          "",
          "- export it as **CSV** for a spreadsheet, or as a **.docx** for a change pack;",
          "- generate an **AI narrative** — a plain-English summary of what changed and what it implies, grounded in the table rather than invented.",
          "",
          "This is the artefact to attach to a change request or a process-improvement review, where \"what exactly changed?\" is the first question anyone asks.",
        ].join("\n"),
      },
    ],
  },
  {
    slug: "state-machine-history",
    title: "State Machine — History States",
    sections: [
      {
        heading: "Remembering where you were",
        body: [
          "A **history state** records which sub-state a composite state was in when it was interrupted, so returning to it resumes where it left off instead of starting again.",
          "",
          "- **Shallow history (H)** — resumes the **immediate** sub-state that was active.",
          "- **Deep history (H\\*)** — resumes the **full nested configuration**, however many levels down it went.",
          "",
          "Both are placed from the State Machine palette and connect like any other pseudostate. Use them wherever something can be suspended and resumed — an order paused for a credit check, a claim waiting on a document — and making the customer start over would be the wrong behaviour.",
        ].join("\n"),
      },
    ],
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    // Renames first, so the upsert below edits in place instead of duplicating.
    for (const r of RENAMES) {
      const ch = await prisma.helpChapter.findFirst({ where: { slug: r.chapter, collection: COLLECTION }, include: { sections: true } });
      const old = ch?.sections.find((s) => s.heading === r.from);
      if (old) {
        await prisma.helpSection.update({ where: { id: old.id }, data: { heading: r.to } });
        console.log(`rename  "${r.from}" -> "${r.to}"`);
      }
    }

    for (const c of CHAPTERS) {
      let chapter = await prisma.helpChapter.findFirst({ where: { slug: c.slug, collection: COLLECTION }, include: { sections: true } });
      if (!chapter) {
        const last = await prisma.helpChapter.findFirst({ where: { collection: COLLECTION }, orderBy: { sortOrder: "desc" } });
        const at = (last?.sortOrder ?? 0) + 1;
        const created = await prisma.helpChapter.create({ data: { slug: c.slug, collection: COLLECTION, title: c.title, sortOrder: at } });
        chapter = { ...created, sections: [] };
        console.log(`\nCHAPTER + "${c.title}" (sortOrder ${at})`);
      } else {
        console.log(`\nCHAPTER = "${c.title}" — updating sections in place`);
      }
      // Where a chapter is entirely ours, number its sections by their position
      // here. Appending after the current last instead would renumber them a
      // little further out on every re-run — the script is meant to be safe to
      // run repeatedly, and "safe" has to mean the result stops changing.
      const ours = chapter.sections.every((x) => c.sections.some((y) => y.heading === x.heading));
      let next = Math.max(0, ...chapter.sections.map((s) => s.sortOrder)) + 1;
      for (const [i, s] of c.sections.entries()) {
        const at = s.sortOrder ?? (ours ? i + 1 : next++);
        const existing = chapter.sections.find((x) => x.heading === s.heading);
        if (existing) {
          await prisma.helpSection.update({ where: { id: existing.id }, data: { bodyMarkdown: s.body, sortOrder: at } });
          console.log(`  update  "${s.heading}"  (sortOrder ${at})`);
        } else {
          await prisma.helpSection.create({ data: { chapterId: chapter.id, heading: s.heading, bodyMarkdown: s.body, sortOrder: at } });
          console.log(`  insert  "${s.heading}"  (sortOrder ${at})`);
        }
      }
    }
    // Restate the reading order of the chapter the new sections interleave with.
    const sim = await prisma.helpChapter.findFirst({ where: { slug: "simulation", collection: COLLECTION }, include: { sections: true } });
    if (sim) {
      console.log("\nORDER  Simulating Processes");
      for (const [i, heading] of SIMULATION_ORDER.entries()) {
        const s = sim.sections.find((x) => x.heading === heading);
        if (!s) { console.log(`  ?? missing section "${heading}" — order left alone`); continue; }
        const at = i + 1; // 0 is the chapter intro (heading null)
        if (s.sortOrder !== at) {
          await prisma.helpSection.update({ where: { id: s.id }, data: { sortOrder: at } });
          console.log(`  ${String(s.sortOrder).padStart(3)} -> ${String(at).padStart(3)}  ${heading}`);
        }
      }
    }

    console.log("\nDone.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
