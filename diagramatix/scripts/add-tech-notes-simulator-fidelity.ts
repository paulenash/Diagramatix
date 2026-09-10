/**
 * Technical Design Notes — the Simulator's modelling fidelity: distributions,
 * preemption and cost.
 *
 * What is recorded here is what is invisible in the diff and expensive to
 * rediscover: why each of these was missing, what the wrong answer looked like
 * while it was, and which decisions were deliberately NOT taken.
 *
 * Idempotent — re-running upserts the chapter and each section body by heading.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-tech-notes-simulator-fidelity.ts
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-tech-notes-simulator-fidelity.ts
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const COLLECTION = "tech-design";
const SLUG = "simulator-fidelity";
const TITLE = "Simulator — distributions, preemption and cost";

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "How these four were found",
    body: [
      "They were not found by using the product. They were found by putting the engine beside a mature discrete-event suite and asking a different question from the usual one: not *what does it have that we do not*, but **what can a modeller not SAY in ours**.",
      "",
      "That framing matters, because all four had the same character. Nothing was broken. Every model ran, produced numbers, and looked right. What a reader could not tell was that the numbers answered a slightly different question from the one they asked — which is the failure mode this whole codebase is most careful about, and the one no test suite catches unless somebody goes looking.",
    ].join("\n"),
  },
  {
    heading: "Lognormal, and why five distributions were not enough",
    body: [
      "The engine offered fixed, uniform, triangular, truncated normal and negative exponential. Real service times are **right-skewed**: most cases cluster around the median and a minority run far past it.",
      "",
      "Neither shape a modeller had can produce that. A truncated normal is symmetric. A triangular puts a hard ceiling on the longest possible case. **Both therefore understate exactly the cases that make a queue form** — and a queue forming is usually the thing the simulation is being run to find out. The model was not wrong about the average; it was wrong about the shape, and the shape is what queues.",
      "",
      "`lognormal` is parameterised by the **mean and sd of the distribution**, not of its underlying normal. A modeller has the average and spread of the thing they measured; nobody has the parameters of its logarithm. The conversion (σ² = ln(1 + (sd/mean)²), μ = ln(mean) − σ²/2) is internal.",
      "",
      "**Not added, so the question is not reopened from scratch:** gamma / Erlang (multi-phase service — well approximated by lognormal for BPM work) and Weibull (a reliability distribution: time to *failure*, not time to do a job).",
    ].join("\n"),
  },
  {
    heading: "Empirical, and the calibration defect it replaced",
    body: [
      "This one was a live defect, not a missing feature.",
      "",
      "`fitDuration` fitted **triangular(min, median, max)** from the *raw* extremes of the mined sojourn samples. So one case that sat over a long weekend became the model's longest possible service time for that activity — and the triangular then spread probability all the way out to it. The twin ran, produced numbers, and overstated the tail of the one activity somebody had once forgotten about. Nothing anywhere reported a problem.",
      "",
      "Calibration now fits **empirical**: the observed values themselves, resampled. Where the data exists, laying a curve over it is a claim the evidence does not make.",
      "",
      "Two design points inside it, and the second is the one people get wrong:",
      "",
      "- **The fence is an IQR rule, not a percentage.** A fixed 2% trim is useless exactly when it is needed most — 2% of eight samples is zero, and eight samples is precisely where one bad value does the most damage. The rule is the standard far-outlier fence, beyond Q3 + 3×IQR.",
      "- **There is a cap on how much it may remove** (5%, at least one). If a tenth of the observations sit past the fence, **they are not outliers — they are the distribution**, and dropping them would throw away the tail this whole distribution kind exists to reproduce. Both directions are pinned by test: T4013 proves an absurd sample is dropped, T4014 proves a genuinely heavy tail survives.",
      "",
      "Held as a **64-point quantile sketch**, not the raw samples: a mined activity can have fifty thousand of them and they would otherwise be serialised into the diagram and re-read on every open. Evenly spaced order statistics keep the shape exactly; 64 random samples would keep it only on average, and the error would land in the tail.",
    ].join("\n"),
  },
  {
    heading: "Preemption — who stops, not who goes next",
    body: [
      "Queue discipline decides **who is served next**. That is powerless while every server is busy — which is exactly when an urgent case arrives, and exactly when it matters. Without preemption, *\"the emergency jumps the queue\"* modelled a process in which the emergency waits for whatever routine job happened to start ninety seconds earlier.",
      "",
      "**Preempt-RESUME, not restart.** The interrupted case keeps the work already done and finishes the remainder. Restart is the easier implementation and would quietly inflate total work in the model — a process where being interrupted costs you the whole task is a *different* process, and not the common one.",
      "",
      "Implemented on machinery the interrupting-boundary path already proved: `cancelToken` blacklists the pending `SERVICE_END` so it can never fire, and a fresh token carries the remaining service with the case's identity intact — arrival time, properties, call stack — so flow time still measures the case rather than the fragment. Releasing the victim's units is what starts the urgent work, because the pool grants to the head of its queue, so eviction and promotion are one step with no idle window.",
      "",
      "**Two refusals.** Equal priority does not preempt — two equally urgent cases would take turns interrupting each other and neither would finish, a livelock that would surface as a plausible throughput collapse rather than a crash. And the victim is chosen by lowest priority with arrival order as the tie-break, so eviction is deterministic and a run reproduces.",
    ].join("\n"),
  },
  {
    heading: "A test that was wrong, and an engine that was right",
    body: [
      "Worth recording because the instinct it corrects is a common one.",
      "",
      "The first draft of T4023 asserted that preemption **lowers the average flow time**. It does not, and it cannot: the same work is done either way. In the test model the pooled mean actually gets slightly *worse* — 29 to 30, because of the extra interleaving.",
      "",
      "What preemption does is **move the waiting off the case that could not afford it and onto the one that could**: the urgent case goes 38 → 20, the routine one 20 → 40. The test now measures **per segment**, which is the same lesson `flowSamplesBySegment` already exists to teach — a pooled figure can look healthy while the segment that matters misses entirely.",
      "",
      "The engine was right and the assertion was wrong. A test asserting a better average would have been asserting something untrue, and it would have passed the day somebody made preemption cancel work instead of resuming it.",
    ].join("\n"),
  },
  {
    heading: "Cost that does not scale with time",
    body: [
      "Cost was busy-hours × rate and nothing else, which silently assumes **every expense scales with somebody's time**. A great many do not: a credit-bureau check, a courier, a card-scheme fee, a per-search charge.",
      "",
      "They are also exactly the costs a redesign is meant to remove. *\"Stop checking twice\"* saves the bureau fee whether or not it saves a minute — so a model that could not express them could not price the change it was being run to evaluate.",
      "",
      "`SimNode.fixedCost` is charged **once per execution**, and falls out of counts the engine already keeps, so it costs the hot path nothing.",
      "",
      "**Reported separately from resource cost, deliberately.** The two have different remedies: resource cost falls when the work gets faster or the team gets smaller; activity cost falls only when the work stops happening. A single total would hide which lever applies. And an unpriced model reports activity cost as **absent, not zero** — \"nothing was charged\" and \"nothing was measured\" are different claims.",
    ].join("\n"),
  },
  {
    heading: "The regression bar for an engine change",
    body: [
      "The first test in each of the four groups is the important one: **a model that declares none of this runs bit-identically to before.**",
      "",
      "An engine change does not fail by crashing. It fails by every existing study quietly reporting slightly different numbers — which nobody notices until a figure somebody published stops reproducing, months later, with no way left to tell which run was right.",
      "",
      "Every new capability is therefore opt-in at the model level: `preemptive` absent means false, `fixedCost` absent means unpriced, and the new distribution kinds are additional variants rather than replacements. `SimDist` is a discriminated union, so adding to it made the compiler name every site that had to be considered — five of them, including two editors and the BPSim mapping in both directions.",
    ].join("\n"),
  },
  {
    heading: "Known gaps",
    body: [
      "Recorded rather than rediscovered.",
      "",
      "- **`preemptive` is not reachable from the UI, and neither is `discipline`.** Checking where queue discipline is set turned up that it appears only in `app/lib/simulation/` — no `SimulationTeam` column, no API field, no team-editor control. It is reachable from a hand-built network or a BPSim import and nothing else. Making both reachable needs a schema change, and therefore a `PRODUCT_VERSION` bump under Q1 of UPDATE_EVERYTHING.",
      "- **BPSim does not carry costs in either direction.** Neither team `costPerHour` nor the new activity `fixedCost` is exported or imported; adding only the new one would have been lopsided.",
      "- **No cost drivers.** `fixedCost` is a flat per-execution charge. Activity-based costing with driver quantities remains a genuine ARIS advantage.",
      "- **The XSD is unchanged**, and correctly so: sim params ride in `element.properties.sim`, and `PropertiesType` is open — the same reasoning recorded at v1.24 and v1.30. No `SCHEMA_VERSION` bump.",
    ].join("\n"),
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    let chapter = await prisma.helpChapter.findFirst({ where: { slug: SLUG, collection: COLLECTION }, include: { sections: true } });
    if (!chapter) {
      const last = await prisma.helpChapter.findFirst({ where: { collection: COLLECTION }, orderBy: { sortOrder: "desc" } });
      const created = await prisma.helpChapter.create({
        data: { slug: SLUG, collection: COLLECTION, title: TITLE, sortOrder: (last?.sortOrder ?? 0) + 1 },
      });
      chapter = { ...created, sections: [] };
      console.log(`Created chapter "${TITLE}".`);
    } else {
      await prisma.helpChapter.update({ where: { id: chapter.id }, data: { title: TITLE } });
      console.log(`Chapter "${TITLE}" exists — updating sections in place.`);
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
