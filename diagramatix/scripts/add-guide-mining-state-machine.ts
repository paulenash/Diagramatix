/**
 * Add a "Why a state machine? The entity's lifecycle" section to the
 * DiagramatixMINER User Guide chapter (HelpChapter `process-mining`) — a
 * conceptual primer on what the state-machine diagram is FOR: the two views
 * (BPMN activity flow vs entity lifecycle), the two roles (reference vs
 * discovered), and how conformance uses it. Inserted just before "The lifecycle
 * & conformance check". Idempotent: re-running updates the section in place.
 *
 * DB-backed guide → auto-seeded on deploy; runnable against prod to publish:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-guide-mining-state-machine.ts                              # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-guide-mining-state-machine.ts    # prod
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const HEADING = "Why a state machine? The entity's lifecycle";
const ANCHOR = "The lifecycle & conformance check"; // insert immediately before this
const BODY = [
  "DiagramatixMINER produces two very different diagrams from the same log, and they answer two different questions. The **BPMN** answers *“what do people do, and in what order?”* — the activity flow. The **state machine** answers *“what states does the thing being processed pass through, and which moves between them are legal?”* — the **entity lifecycle**.",
  "",
  "That second view is the point. These processes are really the lifecycle of a business entity — an **Invoice**, an **Employee**, a **Registrant**. An invoice isn't fundamentally a list of tasks; it's a thing that is *Received*, then *In Progress*, then *Approved*, then *Paid*. The activities are just what move it from one state to the next. So the state machine is the more durable, governable picture: who does the work and how the steps are arranged will change over time, but *“an invoice may only be paid after it is approved”* is a rule that should always hold.",
  "",
  "**A state machine has two roles in DiagramatixMINER.**",
  "",
  "**1. The reference — your single source of truth.** A state-machine diagram is made of **state** nodes (plus an **initial** and a **final** marker) joined by **transition** connectors, each labelled with the event that triggers it. Together they encode a rulebook: which states exist, where a case is allowed to **start**, where it may legitimately **end**, and which state-to-state moves are **permitted**. This is the model conformance scores reality against — the single source of truth for the entity's states and transitions.",
  "",
  "**2. The discovered candidate — what actually happened.** DiagramatixMINER also *mines* a state machine from the log's state column (**Discover the state machine**): the observed states become nodes and the observed moves become transitions, each labelled with its triggering activity. This is a proposal of the lifecycle reality reveals — handy for spotting states or transitions you didn't know existed, and you can edit it and promote it to become your reference when you don't already have one.",
  "",
  "**No reference yet? Create a draft.** If your project has no reference state machine, the **Conformance** panel offers **＋ Create draft reference** — it scaffolds one from the mined lifecycle in a single click and selects it, so you're never stuck at a dead end. Because that draft mirrors what the log actually did, it will conform almost perfectly at first — that's expected. The real work is to **edit it into your rulebook** (use the **edit reference →** link): prune the transitions and exits that *shouldn't* be allowed. The moment you remove a move and re-check, the cases that took it light up as **undocumented** — and you have a governed source of truth, authored from reality and tightened to your policy.",
  "",
  "**How the reference is used.** Conformance replays every case's real sequence of states against the reference, matching by **label** (the log's status values line up with the diagram's state labels). Where reality departs from the rulebook, it reports a deviation — an **undocumented transition** (a move the reference forbids), an **unknown state**, an **unexpected entry or exit** (a case that started or ended somewhere the reference doesn't sanction), or a **dead transition** (a rule that's allowed but never actually used). The headline **fitness %** is simply the share of cases whose whole lifecycle was legal.",
  "",
  "In short: the **BPMN** shows you the flow, but only the **state machine** can tell you whether the entity's lifecycle obeyed the rules — and, by swapping a permissive reference for a stricter one, *exactly which rule was broken and how often*.",
].join("\n");

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const chapter = await prisma.helpChapter.findUnique({ where: { slug: "process-mining" }, include: { sections: true } });
    if (!chapter) { console.error('No "process-mining" help chapter — run add-guide-process-mining.ts first.'); process.exit(1); }

    const existing = chapter.sections.find((s) => s.heading === HEADING);
    if (existing) {
      await prisma.helpSection.update({ where: { id: existing.id }, data: { bodyMarkdown: BODY } });
      console.log(`Updated existing section "${HEADING}".`);
      return;
    }
    // Insert immediately before the conformance section; shift it + everything after down by one.
    const anchor = chapter.sections.find((s) => s.heading === ANCHOR);
    const at = anchor?.sortOrder ?? (Math.max(0, ...chapter.sections.map((s) => s.sortOrder)) + 1);
    await prisma.helpSection.updateMany({ where: { chapterId: chapter.id, sortOrder: { gte: at } }, data: { sortOrder: { increment: 1 } } });
    await prisma.helpSection.create({ data: { chapterId: chapter.id, heading: HEADING, bodyMarkdown: BODY, sortOrder: at } });
    console.log(`Inserted "${HEADING}" at sortOrder ${at}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
