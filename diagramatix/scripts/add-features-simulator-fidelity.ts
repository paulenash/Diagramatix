/**
 * Feature-catalog row for the Simulator's modelling-fidelity work: the shapes,
 * the interruptions and the costs a modeller could not previously express.
 *
 * Idempotent: skipped if a row with the same `name` already exists, and a row
 * seeded under an earlier name is RENAMED rather than duplicated. Inserted as
 * DRAFT (publishedAt stays null) — open /dashboard/admin/features to review the
 * wording, adjust sort order, then Publish.
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-features-simulator-fidelity.ts
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-features-simulator-fidelity.ts   # prod
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const FEATURES: Array<{ name: string; summary: string; details: string; sortOrder: number }> = [
  {
    name: "Simulation that models what actually happens",
    sortOrder: 460,
    summary:
      "Most cases are routine and a few run far past the median; urgent work interrupts what someone is already doing; and plenty of costs do not care how long a task took. A model that cannot say those things produces answers that look right and queue wrongly.",
    details: [
      "- **Right-skewed service times.** A lognormal duration: most cases cluster, a minority run far longer. A symmetric distribution cannot produce that tail — and the tail is what makes a queue form, which is usually the thing being simulated in the first place",
      "- **Or no assumed shape at all.** An empirical duration resamples the values actually observed. Where a mined log exists, laying a curve over it is a claim the evidence does not make",
      "- **Calibration fences its outliers.** A twin fitted from a mined log used to take the raw longest case as its ceiling, so one case that sat over a long weekend set the tail for every future run. The fit now uses the observed values behind a standard outlier fence — with a cap on how much may be trimmed, because if a tenth of the cases are slow they are not outliers, they are the process",
      "- **Preemption — who STOPS, not just who goes next.** Priority alone decides who is served next, which is powerless while every person is busy: exactly when an urgent case arrives, and exactly when it matters. An urgent case can now interrupt work in progress",
      "- **And it resumes.** The interrupted case keeps the work already done and finishes the remainder. Being interrupted costs you the wait, not the whole task",
      "- **Reported per segment.** Preemption does not make a process faster on average — it moves the waiting off the case that could not afford it and onto the one that could, and the report shows both halves rather than a flattering pooled average",
      "- **Costs that do not scale with time.** A per-run charge on an activity — a bureau check, a courier, a card-scheme fee. These are exactly the costs a redesign removes by stopping the work rather than speeding it up",
      "- **Kept separate from resource cost**, because the two have different remedies: one falls when the work gets faster, the other only when the work stops happening",
      "- **Absent, never zero.** An unpriced activity reports as not measured. \"Nothing was charged\" and \"nothing was counted\" are different claims",
      "- BPSim interchange throughout — lognormal and empirical distributions import and export as their standard elements",
    ].join("\n"),
  },
];

/** The retired codename some rows were first seeded under. */
const CODENAME = ["Diagramatix", "MINER"].join("");

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    let inserted = 0, skipped = 0;
    for (const f of FEATURES) {
      let existing = await prisma.feature.findFirst({ where: { name: f.name } });
      if (!existing) {
        const legacyName = f.name.replace("Diagramatix Miner", CODENAME);
        if (legacyName !== f.name) {
          const legacy = await prisma.feature.findFirst({ where: { name: legacyName } });
          if (legacy) {
            await prisma.feature.update({ where: { id: legacy.id }, data: { name: f.name } });
            existing = legacy;
          }
        }
      }
      if (existing) { skipped++; console.log(`  skip   "${f.name}" (already in catalog)`); continue; }
      await prisma.feature.create({ data: { name: f.name, summary: f.summary, details: f.details, sortOrder: f.sortOrder } });
      inserted++;
      console.log(`  insert "${f.name}"`);
    }
    console.log(`Done: ${inserted} inserted, ${skipped} skipped. Review + Publish in /dashboard/admin/features.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
