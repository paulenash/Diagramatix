import "dotenv/config";
import { writeFileSync } from "node:fs";
import { prisma } from "../app/lib/db";

const HEADING = "Choosing a distribution (arrivals & cycle times)";
const SECTION_ID = "ughelp_sim_distributions";
const MD = `Every time value in a simulation — an **Arrival** element's inter-arrival gap and a **Task**'s cycle time — is drawn from a probability *distribution*, so the model captures real variation instead of a single fixed number. Pick the one that best matches what you know about the step, and enter its parameters in the scenario's **clock unit** (e.g. minutes).

| Distribution | Parameters | What it does | Use it for |
| --- | --- | --- | --- |
| **Fixed** | \`value\` | Always exactly \`value\` — no variation | A step that always takes the same time; a constant delay |
| **Uniform** | \`min\`, \`max\` | Every value between \`min\` and \`max\` is equally likely | You only know the range and nothing about the middle |
| **Triangular** | \`min\`, \`mode\`, \`max\` | Peaks at the most-likely \`mode\`, tapering to a \`min\` and \`max\` | Expert estimates (worst / most-likely / best case) — a solid default |
| **Normal** | \`mean\`, \`sd\` | Symmetric bell curve around \`mean\`, spread by \`sd\` (never below 0) | Natural, symmetric variation around an average |
| **Exponential** | \`mean\` (= 1 / rate) | Many short gaps and a few long ones; "memoryless" | Random arrivals (a Poisson process) — the classic inter-arrival choice |
| **Lognormal** | \`mean\`, \`sd\` | Skewed to the right: most values cluster below the mean, with a long tail of the occasional very long one (never below 0). \`mean\` and \`sd\` are those of the times themselves, not of their logarithms | Real work and service times — the usual best choice for a task's cycle time when some cases drag on (see *When to prefer Lognormal*, below) |

**When to prefer Lognormal**

- **Why.** Real task times are *right-skewed*: most cases take about the usual time, and a few take far longer — a complicated claim, a missing document, a customer who calls back. A **Normal** curve is symmetric, so it cannot produce that long tail; a **Triangular** curve has a hard ceiling at its \`max\`, so it cuts the tail off. Both therefore *understate the rare long cases* — and those are exactly the cases that make a queue form, which is what a simulation is run to find out. Lognormal has the tail, is never negative, and needs only the two numbers you can usually measure: the average and the spread.
- **When.** Use it for a task's **cycle time** when you have the average and spread of measured durations (from a mined log or a time study) and a histogram of them leans to the right; or when the work varies in complexity — reviews, approvals, investigations, assessments, support calls. It is the sensible default for knowledge work.
- **How.** Enter the \`mean\` and the \`sd\` of the *times themselves* — for example \`lognormal mean 30, sd 20\` minutes. The larger the \`sd\` is relative to the \`mean\`, the longer the tail: when \`sd\` is about the size of the \`mean\`, the longest cases run several times the average.
- **When not.** If the spread is small compared with the average (say, \`sd\` under about a quarter of the \`mean\`), Lognormal looks like a Normal and a simple **Normal** or **Triangular** is fine. If there is a hard limit — a fixed duration or a cut-off — use **Fixed**, **Uniform** or **Triangular**. For the *gaps between arrivals* of genuinely random demand, **Exponential** remains the classic choice.

**How to use them**

- **Arrivals — inter-arrival time** is the *gap between successive cases*. **Exponential** is the standard choice for genuinely random demand (e.g. \`exponential mean 12\` ≈ a new case every 12 minutes on average). Use **Fixed** for a steady, scheduled feed, and **Triangular** / **Uniform** when demand varies within known bounds. An arrival source can also be tied to a **calendar** so cases only arrive during working hours.
- **Tasks — cycle time** is how long the work takes *once a resource starts it*. **Triangular** and **Normal** are the usual choices when the variation is symmetric or you only have a worst / most-likely / best estimate; **Lognormal** when real work has a long tail of slow cases; use **Fixed** for deterministic steps.
- **More spread → more queueing.** A wider \`min…max\` or a larger \`sd\` produces more variable queues and flow times. Start simple (Fixed or Triangular), then add variation to see how sensitive the process is.
- All values are read in the scenario's **clock unit**, so keep arrivals and cycle times in the same unit.`;

const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  const ch = await prisma.helpChapter.findFirst({ where: { collection: "user-guide", slug: "simulation" }, select: { id: true } });
  if (!ch) throw new Error("simulation chapter not found");
  await prisma.helpSection.deleteMany({ where: { chapterId: ch.id, heading: HEADING, id: { not: SECTION_ID } } });
  await prisma.helpSection.upsert({
    where: { id: SECTION_ID },
    update: { chapterId: ch.id, collection: "user-guide", heading: HEADING, bodyMarkdown: MD, sortOrder: 900 },
    create: { id: SECTION_ID, chapterId: ch.id, collection: "user-guide", heading: HEADING, bodyMarkdown: MD, sortOrder: 900 },
  });
  console.log("local: distributions section added to Simulation chapter");

  const sql = `-- Add the "Choosing a distribution" section to the User Guide Simulation chapter.
-- Run on PROD via SuperAdmin -> Database Access. Idempotent (fixed section id).
DELETE FROM "HelpSection" s USING "HelpChapter" c
  WHERE s."chapterId"=c.id AND c.collection='user-guide' AND c.slug='simulation'
    AND s.heading=${sqlStr(HEADING)} AND s.id<>${sqlStr(SECTION_ID)};
INSERT INTO "HelpSection" ("id","chapterId","collection","heading","bodyMarkdown","adminOnly","sortOrder","createdAt","updatedAt")
SELECT ${sqlStr(SECTION_ID)}, c.id, 'user-guide', ${sqlStr(HEADING)}, $md$${MD}$md$, false, 900, now(), now()
FROM "HelpChapter" c WHERE c.collection='user-guide' AND c.slug='simulation'
ON CONFLICT ("id") DO UPDATE SET
  "chapterId"=EXCLUDED."chapterId", "heading"=EXCLUDED."heading",
  "bodyMarkdown"=EXCLUDED."bodyMarkdown", "sortOrder"=EXCLUDED."sortOrder", "updatedAt"=now();
`;
  writeFileSync("scripts/update-user-guide-distributions.sql", sql, "utf8");
  console.log("wrote scripts/update-user-guide-distributions.sql");
  await prisma.$disconnect();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
