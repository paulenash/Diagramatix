/**
 * Add a "Working hours & calendars" section to the Simulating Processes chapter
 * of the in-app User Guide (HelpChapter `simulation`), documenting Tier-1
 * resource calendars. Inserted right after "The Team library" (calendars are
 * assigned to teams). Idempotent: re-running updates the section body in place.
 *
 * DB-backed guide → NOT auto-deployed; run against prod to publish:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-guide-simulation-calendars.ts                 # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-guide-simulation-calendars.ts
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const HEADING = "Working hours & calendars";
const BODY = [
  "Real teams don't work around the clock, and demand isn't flat. A **working calendar** captures the hours a team is actually staffed (and, optionally, when an arrival source is active) so throughput, utilisation and queues reflect reality instead of a 24/7 ideal.",
  "",
  "**Create a calendar.** In the Simulator's **Calendars** panel, add a named calendar (e.g. *Business hours*, *Night shift*). Each calendar is a weekly pattern of **open windows** — pick a preset (**Mon–Fri 9–5**, **9–5 with lunch**, **24/7**) or add windows per day with start/end times. A gap between windows (e.g. 12:00–13:00) is a break; the team simply isn't available then. Calendars are reusable across the whole project, like the Team library.",
  "",
  "**Assign it.** In the **Teams** panel, choose a calendar in each team's *Calendar* column (leave it **24/7** for teams — or automation — that never stop). A team on a calendar is staffed at its full capacity during open windows and **0 when closed**. Work already in progress at the end of a shift **finishes** — only new tasks wait for the next open window, and anything queued overnight starts the moment the shift opens.",
  "",
  "**Operating hours for arrivals.** In **Simulation Data → Arrivals**, a start/intermediate event can also take a calendar: it only generates arrivals while open. Give a window a **× multiplier** (e.g. ×2 on a busy morning) to model **time-varying demand** — arrivals come faster in that window.",
  "",
  "**Demand and staffing are different calendars — don't cross them.** Work arriving isn't the same as staff being available. Online loan applications keep landing at 2am and on Sundays; they just *queue* until the team clocks on. So put the 9–5 calendar on the **team** (they queue overnight) and leave the **source** at **24/7**. If demand itself rises and falls but never stops, give the source a calendar that stays open 24/7 with per-window **× rate bands** (the **Demand: peak/off-peak** preset) — arrivals slow down at night and on weekends instead of stopping. Only give a source *closed* windows when demand genuinely can't occur then (a phone line or a walk-in branch that's shut).",
  "",
  "**Reading the results.** Utilisation is measured against *staffed* time, so a team busy all through its shift shows ~100% even though it idles nights and weekends. In the **Replay**, tokens visibly bank up at a closed team's tasks and surge through when the shift opens. The week is anchored so simulation time t=0 is **Monday 00:00**.",
  "",
  "The starter examples ship with a *Business hours (9–5 with lunch)* calendar on their human teams so you can see the effect immediately after adopting one.",
].join("\n");

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const chapter = await prisma.helpChapter.findFirst({ where: { slug: "simulation", collection: "user-guide" }, include: { sections: true } });
    if (!chapter) { console.error('No "simulation" help chapter found — nothing to do.'); process.exit(1); }

    const existing = chapter.sections.find((s) => s.heading === HEADING);
    if (existing) {
      await prisma.helpSection.update({ where: { id: existing.id }, data: { bodyMarkdown: BODY } });
      console.log(`Updated existing section "${HEADING}".`);
      return;
    }

    // Insert right after "The Team library"; shift later sections down by one.
    const teamLib = chapter.sections.find((s) => s.heading === "The Team library");
    const at = (teamLib?.sortOrder ?? 5) + 1;
    await prisma.helpSection.updateMany({ where: { chapterId: chapter.id, sortOrder: { gte: at } }, data: { sortOrder: { increment: 1 } } });
    await prisma.helpSection.create({ data: { chapterId: chapter.id, heading: HEADING, bodyMarkdown: BODY, sortOrder: at } });
    console.log(`Inserted "${HEADING}" at sortOrder ${at}.`);
  } finally {
    // no-op
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
