/**
 * Feature-catalog rows for the 2026-08 release (schema 46).
 *
 * Idempotent — a row whose `name` already exists is left alone. New rows insert
 * as DRAFT: open /dashboard/admin/features to review, then Publish All to push
 * them to the public /features page. Publishing is deliberately a human step —
 * these rows are outward-facing marketing copy.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-features-simulation-2026-08.ts                           # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-features-simulation-2026-08.ts # prod
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const FEATURES: Array<{ name: string; summary: string; details: string; sortOrder: number }> = [
  {
    name: "Simulation Resources You Can See",
    sortOrder: 410,
    summary:
      "Every resource in a simulation is one you drew. Nothing is invented behind the scenes, nothing is provisioned silently — if a team affects the answer, it is named on screen where you can change it.",
    details: [
      "- **Harvested from your diagram** — teams come from your swim-lanes and from any team named on a task, across the process you opened *and* every sub-process it links into.",
      "- **Nothing hidden.** A tool that quietly invents a resource gives you an answer you cannot audit. If work is charged to a name that isn't in the library, the results say so — and tell you that work ran with no capacity limit, so its waiting times are understated.",
      "- **Typos surface as findings, not silence.** \"Sales Team\" and \"Sales Taem\" both appear, side by side, so the discrepancy is something you can see and correct rather than something the run absorbs.",
      "- **Scoped to the process you're simulating** — opening one process doesn't provision the teams of every unrelated process in the project.",
      "- **Project-level library** — maintain resources from the project page without opening a diagram.",
    ].join("\n"),
  },
  {
    name: "Repeats & Multi-Instance Simulation",
    sortOrder: 420,
    summary:
      "\"Check each section\" isn't done the same number of times twice. Give a repeating task a distribution for how many passes, and the simulation runs it the way the work is actually done.",
    details: [
      "- **Sequential multi-instance** runs the instances as one uninterrupted block, holding the resource throughout — which is how a person actually works through a list.",
      "- **Parallel multi-instance** runs as many at once as the resource allows; the remainder queue and start as capacity frees. A parallel marker on a one-person team behaves sequentially, and the Simulator says so instead of pretending otherwise.",
      "- **The count is a distribution**, not a guess — because the number of passes varies exactly as much as the durations do.",
      "- **An implausible count is reported before the run**, not silently trimmed: entering 3 *minutes* where 3 *passes* were meant is caught up front, rather than discovered after the run.",
    ].join("\n"),
  },
  {
    name: "System Tasks Run Themselves",
    sortOrder: 430,
    summary:
      "Service, Script and Business-Rule tasks are charged to a shared Automation resource on a 24/7 calendar — so you can draw systems and people in the same lane without the flow zig-zagging between them.",
    details: [
      "- Real processes interleave people and systems at every step. Modelling that faithfully used to mean a separate \"Automation\" lane and a flow that crossed into it and back on every system task.",
      "- Now a task's **marker** decides who does it: User / Manual / none go to the swim-lane's team; **Service, Script and Business Rule** go to **Automation**.",
      "- Automation runs **24/7** — it doesn't wait for office hours, so overnight processing is modelled correctly.",
      "- It is an **ordinary, visible resource**: it appears in the library with a capacity and a cost you control.",
      "- Your diagram stays readable, and the simulation still tells the truth about who is busy.",
    ].join("\n"),
  },
  {
    name: "Honest Simulation Runs",
    sortOrder: 440,
    summary:
      "A model whose queues never drain is a finding about your process, not a crash. The run stops, says why, and points at the bottleneck — instead of showing you a half-finished answer that looks complete.",
    details: [
      "- **When demand exceeds capacity**, the queue grows for as long as the run continues. The Simulator stops and explains, above every figure: how many cases were still in progress, and that the number was still climbing.",
      "- **Partial results are labelled as partial.** Stopping without saying so would present part of a run as a finished answer — the most dangerous kind of wrong number.",
      "- **It tells you what to change** — raise capacity on the named bottleneck, lower the arrival rate, or shorten the longest task.",
      "- **Token Trace Table** — the whole run as a grid, one row per case: where the time went, what waited, what was interrupted. A blank cell means the case never went there; a zero means it did and took no time. Export to CSV.",
    ].join("\n"),
  },
  {
    name: "Compare Two Versions of a Process",
    sortOrder: 450,
    summary:
      "Point at an as-is and a to-be and get the list of what actually changed — steps added, removed, renamed, moved between lanes — as a table, a document, or a plain-English narrative.",
    details: [
      "- Reads the two **models**, not the two pictures: a renamed task is reported as a rename, not as a delete plus an add.",
      "- Covers steps, **connectors, gateways and properties**, including moves between swim-lanes.",
      "- Export as **CSV** for a spreadsheet or **.docx** for a change pack.",
      "- Generate an **AI narrative** — a plain-English summary of what changed and what it implies, grounded in the table rather than invented.",
      "- The artefact to attach to a change request or a process-improvement review, where \"what exactly changed?\" is the first question anyone asks.",
    ].join("\n"),
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    let added = 0;
    for (const f of FEATURES) {
      const existing = await prisma.feature.findFirst({ where: { name: f.name } });
      if (existing) { console.log(`  skip    "${f.name}" (already in the catalog)`); continue; }
      await prisma.feature.create({ data: { name: f.name, summary: f.summary, details: f.details, sortOrder: f.sortOrder } });
      console.log(`  DRAFT + "${f.name}"  (sortOrder ${f.sortOrder})`);
      added++;
    }
    console.log(
      added
        ? `\n${added} draft row(s) added. Review at /dashboard/admin/features, then Publish All to put them on /features.`
        : "\nNothing to add.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
