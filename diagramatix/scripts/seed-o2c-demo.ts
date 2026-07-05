/**
 * Seed a SELF-CONTAINED Order-to-Cash demo project — everything wired together in
 * one place so the whole loop works with no manual setup:
 *   • the Order lifecycle reference State Machine,
 *   • a saved mining run (the O2C event log) with CONFORMANCE already computed,
 *   • the Order-to-Cash GRC library (project copy) whose controls already carry
 *     the monitor signatures for the deviations in that run.
 * Open the project → Risk & Controls and the controls show operating
 * effectiveness ("bypassed in N of 200 cases") straight away.
 *
 * Targets the first Owner/Admin org of RC_SEED_EMAIL (default paul@nashcc.com.au).
 * Idempotent: skips if the demo project already exists for that user.
 *
 * Run: DATABASE_URL="<url>" npx tsx scripts/seed-o2c-demo.ts
 */
import { prisma, pgPool } from "../app/lib/db";
import { STARTER_MINING_EXAMPLES } from "../app/lib/mining/exampleSeeds";
import { adoptMiningPackage } from "../app/lib/mining/adoptMiningPackage";
import { checkTransitionConformance, type ReferenceSm } from "../app/lib/mining/transitionConformance";
import { createO2cLibrary } from "../app/lib/riskControls/seedO2c";

const EMAIL = process.env.RC_SEED_EMAIL || "paul@nashcc.com.au";
const PROJECT_NAME = "Order-to-Cash — GRC Demo";

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

  const user = await prisma.user.findFirst({ where: { email: EMAIL }, select: { id: true, name: true } });
  if (!user) { console.log(`No user "${EMAIL}" — nothing to seed.`); return; }
  const membership = await prisma.orgMember.findFirst({ where: { userId: user.id, role: { in: ["Owner", "Admin"] } }, select: { orgId: true } });
  if (!membership) { console.log(`"${EMAIL}" owns/admins no org — nothing to seed.`); return; }

  const existing = await prisma.project.findFirst({ where: { name: PROJECT_NAME, userId: user.id }, select: { id: true } });
  if (existing) { console.log(`Skip — "${PROJECT_NAME}" already exists.`); return; }

  const ex = STARTER_MINING_EXAMPLES.find((e) => e.slug === "order-to-cash-lifecycle");
  if (!ex) { console.log("O2C mining example not found — run gen-mining-examples.ts first."); return; }

  // Adopt the mining package WITHOUT its sampleLog, so adopt pre-creates the run
  // (with the reference State Machine) rather than the import flow.
  const pkg = { ...ex.package, sampleLog: undefined, sampleLogs: undefined };
  const res = await adoptMiningPackage(pkg, { projectName: PROJECT_NAME, userId: user.id, orgId: membership.orgId, ownerName: user.name ?? "" });

  // Compute + persist conformance on the run (JSON via raw SQL, Prisma-7 pattern).
  const refData = ex.package.diagrams[0].data;
  const conf = checkTransitionConformance(ex.package.run.variants, { elements: refData.elements, connectors: refData.connectors } as ReferenceSm);
  if (res.runId) {
    await pgPool.query('UPDATE "ProcessMiningRun" SET conformance = $1::jsonb, "updatedAt" = NOW() WHERE id = $2', [JSON.stringify(conf), res.runId]);
  }

  // Adopt the O2C GRC library into the SAME project (controls carry monitor signatures).
  await prisma.$transaction((tx) => createO2cLibrary(tx, { projectId: res.projectId }));

  console.log(`Seeded "${PROJECT_NAME}" (project ${res.projectId}):`);
  console.log(`  • reference State Machine + mining run — conformance ${conf.conformingCases}/${conf.totalCases} (${(conf.fitness * 100).toFixed(0)}% fitness)`);
  console.log(`  • Order-to-Cash GRC library adopted; controls pre-mapped to the run's deviations`);
  console.log(`  Open it → Risk & Controls to see control operating-effectiveness.`);
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => pgPool.end?.());
