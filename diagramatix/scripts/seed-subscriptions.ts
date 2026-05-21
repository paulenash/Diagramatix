/**
 * Subscriptions — initial seed.
 *
 * Idempotent: safe to run multiple times.
 *
 *  1. Upserts the four canonical SubscriptionLevel rows (Free, Introductory,
 *     Professional, Expert) with the limits from `new features/Definitions
 *     of subscription levels for Diagramatix.txt`. Re-running updates the
 *     limit columns to the values in this file (so this script doubles as
 *     a "reset to factory defaults").
 *
 *  2. Grandfathers every User that has subscriptionLevelId IS NULL to
 *     "expert" — existing accounts shouldn't hit a new cap at launch.
 *     Users with an existing subscriptionLevelId (i.e. who have been
 *     adjusted by an admin) are left alone.
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/seed-subscriptions.ts
 */

import "dotenv/config";
import { prisma } from "../app/lib/db";

type TierSeed = {
  id: "free" | "introductory" | "professional" | "expert";
  name: string;
  priceMonthly: number;                    // AUD cents
  sortOrder: number;
  maxProjects: number | null;
  maxDiagramsPerTypePerProject: number | null;
  maxArchimateDiagramsTotal: number | null;
  maxNonBpmnElementsPerDiagram: number | null;
  maxBpmnElementsPerDiagram: number | null;
  maxAiAttempts: number | null;
  aiAttemptsResetMonthly: boolean;
  maxIndividualExports: number | null;
  individualExportsResetMonthly: boolean;
  maxIndividualImports: number | null;
  individualImportsResetMonthly: boolean;
  maxBulkExports: number | null;
  maxBulkImports: number | null;
  trialDays: number | null;
};

const TIERS: TierSeed[] = [
  {
    id: "free", name: "Free", priceMonthly: 0, sortOrder: 0,
    maxProjects: 1,
    maxDiagramsPerTypePerProject: 1,
    maxArchimateDiagramsTotal: 0,           // "No Archimate Diagrams"
    maxNonBpmnElementsPerDiagram: 15,
    maxBpmnElementsPerDiagram: 20,
    maxAiAttempts: 5,
    aiAttemptsResetMonthly: false,          // "5 AI Generate attempts in total"
    maxIndividualExports: 2,
    individualExportsResetMonthly: false,   // "2 individual diagram exports" — lifetime
    maxIndividualImports: 2,
    individualImportsResetMonthly: false,   // "2 individual diagram imports" — lifetime
    maxBulkExports: 0,
    maxBulkImports: 0,
    trialDays: 30,                          // Free is time-limited to 30 days from signup
  },
  {
    id: "introductory", name: "Introductory", priceMonthly: 7000, sortOrder: 1,
    maxProjects: 5,
    maxDiagramsPerTypePerProject: 10,
    maxArchimateDiagramsTotal: 2,
    maxNonBpmnElementsPerDiagram: null,
    maxBpmnElementsPerDiagram: null,
    maxAiAttempts: 50, aiAttemptsResetMonthly: true,
    maxIndividualExports: null, individualExportsResetMonthly: true,
    maxIndividualImports: null, individualImportsResetMonthly: true,
    maxBulkExports: 2,
    maxBulkImports: 2,
    trialDays: null,
  },
  {
    id: "professional", name: "Professional", priceMonthly: 15000, sortOrder: 2,
    maxProjects: 10,
    maxDiagramsPerTypePerProject: 35,
    maxArchimateDiagramsTotal: 10,
    maxNonBpmnElementsPerDiagram: null,
    maxBpmnElementsPerDiagram: null,
    maxAiAttempts: 100, aiAttemptsResetMonthly: true,
    maxIndividualExports: null, individualExportsResetMonthly: true,
    maxIndividualImports: null, individualImportsResetMonthly: true,
    maxBulkExports: null,
    maxBulkImports: null,
    trialDays: null,
  },
  {
    id: "expert", name: "Expert", priceMonthly: 27000, sortOrder: 3,
    maxProjects: null,
    maxDiagramsPerTypePerProject: null,
    maxArchimateDiagramsTotal: null,
    maxNonBpmnElementsPerDiagram: null,
    maxBpmnElementsPerDiagram: null,
    maxAiAttempts: 500, aiAttemptsResetMonthly: true,
    maxIndividualExports: null, individualExportsResetMonthly: true,
    maxIndividualImports: null, individualImportsResetMonthly: true,
    maxBulkExports: null,
    maxBulkImports: null,
    trialDays: null,
  },
];

async function main() {
  console.log("Seeding SubscriptionLevel rows...");
  for (const tier of TIERS) {
    const { id, ...data } = tier;
    await prisma.subscriptionLevel.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
    console.log(`  ✔ ${id} (${tier.name})`);
  }

  console.log("\nGrandfathering existing users to Expert...");
  const now = new Date();
  const result = await prisma.user.updateMany({
    where: { subscriptionLevelId: null },
    data: { subscriptionLevelId: "expert", subscriptionAssignedAt: now },
  });
  console.log(`  ✔ ${result.count} user(s) set to expert`);

  // Backfill subscriptionAssignedAt for any user who already has a tier
  // but no assignment timestamp (e.g. an earlier run of this seed before
  // the trial-expiry change). Idempotent — only touches null timestamps.
  const backfill = await prisma.user.updateMany({
    where: { subscriptionAssignedAt: null, subscriptionLevelId: { not: null } },
    data: { subscriptionAssignedAt: now },
  });
  if (backfill.count > 0) {
    console.log(`  ✔ ${backfill.count} user(s) backfilled with subscriptionAssignedAt`);
  }

  const counts = await prisma.user.groupBy({
    by: ["subscriptionLevelId"],
    _count: { id: true },
  });
  console.log("\nUser distribution by tier:");
  for (const row of counts) {
    console.log(`  ${row.subscriptionLevelId ?? "(none)"}: ${row._count.id}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
