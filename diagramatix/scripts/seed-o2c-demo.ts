/**
 * Seed a SELF-CONTAINED Order-to-Cash demo project in the user's org — the real
 * O2C project diagrams with Risks/Controls attached to the steps + the GRC
 * library + a mining run with conformance, so ◆ Risk & Controls shows control
 * operating-effectiveness immediately. Convenience wrapper: builds the same
 * package the catalog ships (buildO2cExamplePackage) and adopts it via the shared
 * adopt engine (adoptRiskControlExample).
 *
 * Targets the first Owner/Admin org of RC_SEED_EMAIL (default paul@nashcc.com.au).
 * Idempotent: skips once reconstituted; upgrades the older synthetic demo.
 *
 * Run: DATABASE_URL="<url>" npx tsx scripts/seed-o2c-demo.ts
 */
import { prisma, pgPool } from "../app/lib/db";
import { adoptRiskControlExample } from "../app/lib/riskControls/adoptRiskControlExample";
import { buildO2cExamplePackage } from "./seed-risk-control-examples";

const EMAIL = process.env.RC_SEED_EMAIL || "paul@nashcc.com.au";
const PROJECT_NAME = "Order-to-Cash — GRC Demo";

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

  const user = await prisma.user.findFirst({ where: { email: EMAIL }, select: { id: true, name: true } });
  if (!user) { console.log(`No user "${EMAIL}" — nothing to seed.`); return; }
  // Prefer an Owner/Admin org, but fall back to ANY org membership so a differing
  // prod role setup can't silently skip the demo.
  const membership =
    (await prisma.orgMember.findFirst({ where: { userId: user.id, role: { in: ["Owner", "Admin"] } }, select: { orgId: true } }))
    ?? (await prisma.orgMember.findFirst({ where: { userId: user.id }, select: { orgId: true } }));
  if (!membership) { console.log(`"${EMAIL}" belongs to no org — nothing to seed.`); return; }
  console.log(`Seeding for "${EMAIL}" into org ${membership.orgId}…`);

  const pkg = buildO2cExamplePackage();
  const expected = pkg.diagrams.length + (pkg.mining ? 1 : 0);   // + the reference State Machine
  const existing = await prisma.project.findFirst({ where: { name: PROJECT_NAME, userId: user.id }, select: { id: true, _count: { select: { diagrams: true } } } });
  if (existing) {
    if (existing._count.diagrams === expected) { console.log(`Skip — "${PROJECT_NAME}" already up to date (${expected} diagrams).`); return; }
    console.log(`Rebuilding "${PROJECT_NAME}" (had ${existing._count.diagrams} diagrams, expected ${expected})…`);
    await prisma.riskControlLibrary.deleteMany({ where: { projectId: existing.id } });
    await prisma.processMiningRun.deleteMany({ where: { projectId: existing.id } });
    await prisma.diagram.deleteMany({ where: { projectId: existing.id } });
    await prisma.project.delete({ where: { id: existing.id } });
  }

  const res = await adoptRiskControlExample(pkg, { userId: user.id, orgId: membership.orgId, ownerName: user.name ?? "", projectName: PROJECT_NAME });

  console.log(`Seeded "${PROJECT_NAME}" (project ${res.projectId}) — ${pkg.diagrams.length} diagrams, GRC library + mining run with conformance.`);
  console.log(`  Open it → ◆ Risk & Controls to see control operating-effectiveness.`);
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => pgPool.end?.());
