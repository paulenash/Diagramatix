/**
 * Add a "DiagramatixMINER — Process Mining" chapter to the in-app User Guide,
 * documenting the mine → discover → conform → simulate loop. Placed right after
 * "Simulating Processes" (the twin hands off to the Simulator). Idempotent:
 * re-running upserts the chapter + each section body in place by heading.
 *
 * DB-backed guide → NOT bundled in the build; auto-seeded on deploy and runnable
 * against prod to publish:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-guide-process-mining.ts                                # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-guide-process-mining.ts      # prod
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SLUG = "process-mining";
const TITLE = "DiagramatixMINER — Process Mining";
const AFTER_SLUG = "simulation"; // place this chapter immediately after "Simulating Processes"

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "What DiagramatixMINER does",
    body: [
      "Diagramatix models the process you *design*. **DiagramatixMINER** reveals the process you *actually run*. Point it at a standard **event log** — the rows any real system emits as work happens (a case id, an activity, a timestamp, and the entity's resulting state) — and it reconstructs the real process for you: the **BPMN implied by the log**, the **lifecycle** of the underlying entity (Invoice, Employee, Registrant…), and where reality **deviates** from the model that's meant to be the single source of truth.",
      "",
      "It closes a full loop: **mine → discover → conform → calibrate → simulate → improve**. The same log that shows you the as-is process also carries the numbers a simulation needs — so one click turns the discovered process into a *credible* digital twin you can run in the **Simulator**, with arrival rates, durations, branch odds, teams and working hours all taken from reality instead of guessed.",
      "",
      "Open it from a project's action menu — **⛏ DiagramatixMINER**. The console is styled like the Simulator (DiagramMATRIX), in mining browns.",
    ].join("\n"),
  },
  {
    heading: "Importing an event log",
    body: [
      "In the **Import** panel, upload a **CSV** export from one or more source systems. DiagramatixMINER parses it in the browser for a quick preview, then processes the full file on the server so large logs aren't capped by an upload limit.",
      "",
      "**Map the columns.** Tell the miner which column is which — it auto-guesses from the header names and you adjust:",
      "",
      "- **Case / entity id** *(required)* — the thing that flows through the process (invoice number, application id). All rows with the same id are one *case*.",
      "- **Activity / event** *(required)* — what happened (\"Submit\", \"Approve\").",
      "- **Timestamp** *(required)* — when it happened (ISO dates or epoch seconds/ms). Rows are ordered by this within each case.",
      "- **State** *(required)* — the entity's resulting state after the event (\"Draft\", \"Pending\", \"Approved\"). This is what conformance checks against your reference lifecycle.",
      "- **Resource** *(optional)* — who or what did the work; feeds mined teams and their capacity.",
      "- **Entity type** *(optional)* — a label for the kind of entity, when a log mixes several.",
      "",
      "The miner groups rows into cases, compresses identical case journeys into **variants** (a distinct sequence + how many cases followed it — the standard, compact form of a log), and saves a **run** you can revisit. The stats show how many cases, events, activities, states and variants it found, and the log's date range. A run persists, so you can re-discover or re-check conformance against a *different* reference later without re-uploading.",
    ].join("\n"),
  },
  {
    heading: "Discovering the process (BPMN)",
    body: [
      "In **Discover process**, the miner builds a **directly-follows graph** — which activity tends to follow which — then turns it into a real, editable **BPMN** diagram: activities become tasks in a pool, a point where work fans out becomes an **exclusive gateway**, points where paths rejoin become merges, and loops fall out naturally. Start and end events are added for you.",
      "",
      "Real logs are noisy, so a **detail slider** filters out the rarest paths: slide toward *simpler* to see the dominant flow (the \"happy path\"), toward *fuller* to include uncommon routes. Connector labels show how often each step was taken.",
      "",
      "The result is an ordinary Diagram — **open it in the editor**, tidy it, rename things, or use it as the starting point for a to-be redesign. Re-discover at any detail level; it refreshes the same diagram.",
    ].join("\n"),
  },
  {
    heading: "The lifecycle & conformance check",
    body: [
      "Because these processes are really the **lifecycle of an entity**, DiagramatixMINER also reads the **state** column and proposes a candidate **State Machine** — the states the entity actually passed through and the transitions between them, each labelled with the activity that triggered it. Like the BPMN, it's an editable diagram you can promote into a reference.",
      "",
      "**Conformance** is the governance payoff. Pick a **reference State Machine** — the drawn diagram that is your single source of truth for the states an entity may occupy and the transitions that are *allowed*. DiagramatixMINER replays every case's real state changes against it and reports a **fitness %** (the share of cases whose whole journey is legal) plus a **deviation table**:",
      "",
      "- **Undocumented transition** — a state change that happened in reality but isn't allowed by the reference.",
      "- **Unknown state** — an observed state your reference doesn't define (often a naming mismatch — the labels must line up).",
      "- **Unexpected entry / exit** — cases that started or ended somewhere the reference doesn't sanction.",
      "- **Dead transition** — a transition your reference allows that **never actually occurs** (a coverage gap, or a rule nobody uses).",
      "",
      "Each deviation is weighted by how many cases it affects, so you see the *material* gaps first — the difference between the process you published and the one people run.",
    ].join("\n"),
  },
  {
    heading: "The digital twin — calibrate & simulate",
    body: [
      "This is where mining meets the Simulator. Press **▶ Calibrate & simulate** and DiagramatixMINER writes the numbers it mined from the log straight onto the discovered BPMN and hands you a ready-to-run study:",
      "",
      "- **Task durations** — a distribution fitted from each activity's real timings (a fixed value when it barely varies, a triangular *min/typical/max* when it does).",
      "- **Arrivals** — how often new cases actually start, fitted from the gaps between case start times.",
      "- **Gateway odds** — each branch's probability taken from how often that path was really taken.",
      "- **Teams & capacity** — a mined team per resource, sized by the most cases that resource handled at once.",
      "- **Working hours** — a calendar derived from *when* the work actually happened, so the twin runs on realistic shifts, not 24/7.",
      "",
      "The console then jumps straight into the **Simulator** on the calibrated model. Because the parameters came from reality, the baseline is a *credible* as-is twin — a sound footing for designing **to-be** variants and comparing them with everything the Simulator offers (scenarios, calendars, as-is/to-be comparison, run history). Improve the process there, then re-mine a fresh log later to confirm the change landed. That's the whole loop: **mine → simulate → improve → conform**.",
    ].join("\n"),
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    // Place immediately after the "Simulating Processes" chapter; shift later chapters down.
    let chapter = await prisma.helpChapter.findFirst({ where: { slug: SLUG, collection: "user-guide" }, include: { sections: true } });
    if (!chapter) {
      const after = await prisma.helpChapter.findFirst({ where: { slug: AFTER_SLUG, collection: "user-guide" } });
      const at = (after?.sortOrder ?? 35) + 1;
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
