/**
 * CPS 230 Phase 0 — verify backfill results.
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/verify-orgs.ts
 *
 * Reports row counts for Project/Diagram with NULL orgId (should be 0 after
 * backfill) and lists every User → Org → role mapping.
 */

import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 2 }),
  log: ["error", "warn"],
});

async function main() {
  const projWithoutOrg = await prisma.project.count({ where: { orgId: null } });
  const diagWithoutOrg = await prisma.diagram.count({ where: { orgId: null } });
  const totalProjects = await prisma.project.count();
  const totalDiagrams = await prisma.diagram.count();
  const totalUsers = await prisma.user.count();
  const totalOrgs = await prisma.org.count();
  const totalMembers = await prisma.orgMember.count();

  console.log("─── Counts ──────────────────────────────────────────────");
  console.log(`Users:                       ${totalUsers}`);
  console.log(`Orgs:                        ${totalOrgs}`);
  console.log(`OrgMembers:                  ${totalMembers}`);
  console.log(`Projects total:              ${totalProjects}`);
  console.log(`Projects without orgId:      ${projWithoutOrg}  ${projWithoutOrg === 0 ? "✅" : "❌"}`);
  console.log(`Diagrams total:              ${totalDiagrams}`);
  console.log(`Diagrams without orgId:      ${diagWithoutOrg}  ${diagWithoutOrg === 0 ? "✅" : "❌"}`);
  console.log("─────────────────────────────────────────────────────────");
  console.log();

  const memberships = await prisma.orgMember.findMany({
    include: {
      user: { select: { email: true, name: true } },
      org: { select: { name: true, entityType: true } },
    },
    orderBy: [{ user: { email: "asc" } }],
  });

  console.log("─── Memberships ─────────────────────────────────────────");
  for (const m of memberships) {
    console.log(
      `${m.user.email.padEnd(40)} → ${m.org.name.padEnd(40)} (${m.org.entityType})  [${m.role}]`
    );
  }
  console.log("─────────────────────────────────────────────────────────");

  if (projWithoutOrg === 0 && diagWithoutOrg === 0) {
    console.log();
    console.log("✅ All Projects and Diagrams have an orgId. Safe to tighten to NOT NULL.");
  } else {
    console.log();
    console.log("⚠️  Backfill incomplete. Run scripts/backfill-orgs.ts and re-verify.");
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("Verify failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
