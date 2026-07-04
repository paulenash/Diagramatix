/**
 * Add a "Walkthrough — the Accounts Payable sample" section to the
 * DiagramatixMINER User Guide chapter (HelpChapter `process-mining`), a
 * step-by-step of the one-click sample: Load & open → Discover → Conformance →
 * Calibrate & simulate → Replay. Appended at the end of the chapter. Idempotent:
 * re-running updates the section body in place.
 *
 * DB-backed guide → auto-seeded on deploy; runnable against prod to publish:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-guide-mining-sample.ts                              # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-guide-mining-sample.ts    # prod
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const HEADING = "Walkthrough — the Accounts Payable sample";
const BODY = [
  "The fastest way to see the whole loop is the built-in **Accounts Payable — Invoice Lifecycle** sample. It needs no data, no setup, and no modelling — three clicks take you from an empty account to a discovered process, a quantified conformance gap, and an animated, reality-calibrated simulation.",
  "",
  "**Load it.** Open the **File** menu → **Process Mining Examples**. The gallery lists ready-made studies; the Accounts Payable card shows *200 cases · 10 variants · 2 references*. Click **▶ Load & open**. Diagramatix copies the example into a brand-new project of your own — its two reference state machines plus the sample event log — and drops you into the **⛏ DiagramatixMINER** console (after a brief intro) with the log **already loaded in the Import panel**. You don't need a CSV of your own to try everything. Nothing you already have is touched.",
  "",
  "**1. Confirm the analysis, then import.** The **Import an event log** panel is pre-filled with the sample: the columns are mapped (Invoice ID → case, Activity, Timestamp, Invoice Status → state, Resource) and a verification summary shows *200 usable · 0 dropped*, the detected timestamp format and date range, and sample values so you can see the mapping is right. Review it, then click **Import log**. The run *Accounts Payable — January 2026* appears in **Mining runs** — click it for the summary: ~200 **cases**, ~990 **events**, 8 **activities**, 7 **states**, 10 **variants**, about a month's span.",
  "",
  "**2. Discover the process.** Under **Discover the process**, leave the **detail** slider on *all paths* (or drag it right to hide the rarest routes) and click **⚙ Discover process**. Diagramatix builds the BPMN the log implies — tasks for each activity, exclusive gateways at every branch, the rework loop, and the cancel branch — as a real, editable diagram. Click **Open discovered diagram →** to see it on the canvas; connector labels show how often each path was taken.",
  "",
  "**3. Discover the lifecycle.** Click **⚙ Discover state machine** to infer the entity's lifecycle — the states an invoice passed through and the events that moved it between them — as a candidate diagram you could edit and adopt as a reference.",
  "",
  "**4. Check conformance.** Under **Conformance vs the reference**, pick **AP Invoice Lifecycle (Reference)** from the list and click **✓ Check conformance**. Diagramatix replays every invoice's real state changes against that reference and reports a **fitness** score — here about **90%** (roughly 181 of 200 cases replay cleanly). The only deviations are *unexpected-exit*: invoices still in flight (not yet Paid or Cancelled) when the log was cut. Reality matches this permissive lifecycle.",
  "",
  "**5. See a policy gap.** Now switch the picker to **AP Invoice Lifecycle (Strict — no rework)** and check again. This stricter reference forbids resuming a held invoice, so fitness drops to about **72%** and a new top deviation appears: **✕ undocumented transition — On Hold → In Progress — ~39 cases**. That is the classic process-mining finding: your published policy says this can't happen, but the log proves it happened dozens of times. Toggling the two references shows the exact cost of the rework loop.",
  "",
  "**6. Calibrate & simulate.** Under **Simulate a digital twin**, click **▶ Calibrate & simulate**. Diagramatix writes the numbers it mined from the log onto the discovered process — task durations, arrival rate, gateway odds, a team per resource, and a working-hours calendar — builds a study with an *As-mined baseline* scenario, and hands you straight into the **Simulator** on that calibrated model.",
  "",
  "**7. Run & replay.** In the Simulator, run the baseline, then open **Replay**: invoices animate as tokens flowing through the discovered process over a slowed clock, banking up wherever the mined durations and staffing create a queue. Because every parameter came from the real log, this is a *credible* as-is twin — a sound footing for designing and comparing **to-be** improvements.",
  "",
  "That's the full loop — **mine → discover → conform → simulate → improve** — on real data, with no preparation. When you're ready, do the same with your own CSV: **⛏ DiagramatixMINER → Import an event log**.",
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
    const at = Math.max(0, ...chapter.sections.map((s) => s.sortOrder)) + 1;
    await prisma.helpSection.create({ data: { chapterId: chapter.id, heading: HEADING, bodyMarkdown: BODY, sortOrder: at } });
    console.log(`Appended "${HEADING}" at sortOrder ${at}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
