/**
 * Seed the ready-made Order-to-Cash GRC library (app/lib/riskControls/o2cSample.ts)
 * as an ORG MASTER for a user's organisations, so it shows up in every project's
 * "Adopt" dropdown in the Risk & Controls panel.
 *
 * Targets the Owner/Admin orgs of RC_SEED_EMAIL (default paul@nashcc.com.au).
 * Idempotent: skips any org that already has a library of the same name.
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   DATABASE_URL="<url>" npx tsx scripts/seed-risk-controls-o2c.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { O2C_SAMPLE, type SampleItem } from "../app/lib/riskControls/o2cSample";

const EMAIL = process.env.RC_SEED_EMAIL || "paul@nashcc.com.au";

/** Map a sample item to the RiskControlItem create-data, gating fields by kind. */
function itemData(libraryId: string, it: SampleItem, sortOrder: number) {
  const isRisk = it.kind === "Risk", isControl = it.kind === "Control", generic = !isRisk;
  return {
    libraryId, kind: it.kind, code: it.code, name: it.name, sortOrder,
    description: it.description ?? null,
    likelihood: isRisk ? it.likelihood ?? null : null,
    impact: isRisk ? it.impact ?? null : null,
    riskCategory: isRisk ? it.riskCategory ?? null : null,
    residualLikelihood: isRisk ? it.residualLikelihood ?? null : null,
    residualImpact: isRisk ? it.residualImpact ?? null : null,
    controlType: isControl ? it.controlType ?? null : null,
    automation: isControl ? it.automation ?? null : null,
    frequency: isControl ? it.frequency ?? null : null,
    owner: generic ? it.owner ?? null : null,
    frameworkRef: generic ? it.frameworkRef ?? null : null,
    evidence: isControl ? it.evidence ?? null : null,
    testMethod: isControl ? it.testMethod ?? null : null,
    testFrequency: isControl ? it.testFrequency ?? null : null,
    monitorSignature: isControl ? it.monitorSignature ?? null : null,
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    const user = await prisma.user.findFirst({ where: { email: EMAIL }, select: { id: true } });
    if (!user) { console.log(`No user "${EMAIL}" — nothing to seed.`); return; }
    const memberships = await prisma.orgMember.findMany({
      where: { userId: user.id, role: { in: ["Owner", "Admin"] } }, select: { orgId: true },
    });
    const orgIds = [...new Set(memberships.map((m) => m.orgId))];
    if (!orgIds.length) { console.log(`"${EMAIL}" owns/admins no orgs — nothing to seed.`); return; }

    let created = 0, skipped = 0;
    for (const orgId of orgIds) {
      const existing = await prisma.riskControlLibrary.findFirst({ where: { orgId, name: O2C_SAMPLE.name }, select: { id: true } });
      if (existing) { skipped++; console.log(`  skip org ${orgId} (already has "${O2C_SAMPLE.name}")`); continue; }

      await prisma.$transaction(async (tx) => {
        const lib = await tx.riskControlLibrary.create({ data: { name: O2C_SAMPLE.name, orgId } });
        const idByCode = new Map<string, string>();
        const sort: Record<string, number> = {};
        for (const it of O2C_SAMPLE.items) {
          const so = (sort[it.kind] = (sort[it.kind] ?? -1) + 1);
          const row = await tx.riskControlItem.create({ data: itemData(lib.id, it, so) });
          idByCode.set(it.code, row.id);
        }
        for (const ln of O2C_SAMPLE.links) {
          const s = idByCode.get(ln.source), t = idByCode.get(ln.target);
          if (s && t) await tx.riskControlLink.create({ data: { libraryId: lib.id, sourceId: s, targetId: t } });
        }
      });
      created++;
      console.log(`  seeded "${O2C_SAMPLE.name}" (${O2C_SAMPLE.items.length} items, ${O2C_SAMPLE.links.length} links) into org ${orgId}`);
    }
    console.log(`Done. Created ${created}, skipped ${skipped}. Adopt it from a project's Risk & Controls panel.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
