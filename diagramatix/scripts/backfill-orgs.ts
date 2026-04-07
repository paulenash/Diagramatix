// @ts-nocheck — this is a one-shot historical migration script that
// references a pre-tightening schema state. The file remains in the repo
// for traceability but is not part of the runtime build.
/**
 * CPS 230 Phase 0 — Backfill orgs for existing single-user data.
 *
 * Idempotent: safe to run multiple times. For each User that does not yet
 * have an OrgMember row, this script:
 *   1. Creates one Org named "${user.name ?? user.email}'s Org" (entityType=Other)
 *   2. Creates an OrgMember with role=Owner linking the user to that Org
 *   3. Sets orgId on every Project owned by that user (where currently NULL)
 *   4. Sets orgId on every Diagram owned by that user (where currently NULL)
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/backfill-orgs.ts
 *
 * The PGlite server (port 51214) must be running.
 *
 * After this completes successfully, run the second schema diff that makes
 * Project.orgId and Diagram.orgId NOT NULL.
 */

import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Did you load .env?");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 2 }),
  log: ["error", "warn"],
});

interface Counts {
  users: number;
  usersAlreadyHadOrg: number;
  orgsCreated: number;
  membersCreated: number;
  projectsBackfilled: number;
  diagramsBackfilled: number;
  projectsAlreadyAssigned: number;
  diagramsAlreadyAssigned: number;
}

async function main() {
  const counts: Counts = {
    users: 0,
    usersAlreadyHadOrg: 0,
    orgsCreated: 0,
    membersCreated: 0,
    projectsBackfilled: 0,
    diagramsBackfilled: 0,
    projectsAlreadyAssigned: 0,
    diagramsAlreadyAssigned: 0,
  };

  // Pre-flight summary
  const totalUsers = await prisma.user.count();
  const totalProjects = await prisma.project.count();
  const totalDiagrams = await prisma.diagram.count();
  const projectsWithOrg = await prisma.project.count({ where: { orgId: { not: null } } });
  const diagramsWithOrg = await prisma.diagram.count({ where: { orgId: { not: null } } });
  const totalOrgs = await prisma.org.count();
  const totalMembers = await prisma.orgMember.count();

  console.log("─── Pre-flight ───────────────────────────────────────────");
  console.log(`Users:                     ${totalUsers}`);
  console.log(`Projects:                  ${totalProjects} (${projectsWithOrg} already have orgId)`);
  console.log(`Diagrams:                  ${totalDiagrams} (${diagramsWithOrg} already have orgId)`);
  console.log(`Existing Orgs:             ${totalOrgs}`);
  console.log(`Existing OrgMembers:       ${totalMembers}`);
  console.log("──────────────────────────────────────────────────────────");
  console.log();

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      orgMembers: { select: { id: true, orgId: true }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });

  // Process each user inside its own transaction so a partial failure on one
  // user does not roll back the others.
  for (const user of users) {
    counts.users++;

    if (user.orgMembers.length > 0) {
      // User already has at least one OrgMember row. Use their first org as
      // the default for any Project/Diagram still missing orgId.
      counts.usersAlreadyHadOrg++;
      const defaultOrgId = user.orgMembers[0].orgId;

      const projUpdate = await prisma.project.updateMany({
        where: { userId: user.id, orgId: null },
        data: { orgId: defaultOrgId },
      });
      counts.projectsBackfilled += projUpdate.count;

      const diagUpdate = await prisma.diagram.updateMany({
        where: { userId: user.id, orgId: null },
        data: { orgId: defaultOrgId },
      });
      counts.diagramsBackfilled += diagUpdate.count;

      const projAlready = await prisma.project.count({
        where: { userId: user.id, orgId: { not: null }, NOT: { orgId: defaultOrgId } },
      });
      counts.projectsAlreadyAssigned += projAlready;

      const diagAlready = await prisma.diagram.count({
        where: { userId: user.id, orgId: { not: null }, NOT: { orgId: defaultOrgId } },
      });
      counts.diagramsAlreadyAssigned += diagAlready;

      console.log(
        `[skip-create] ${user.email}: existing org ${defaultOrgId.slice(0, 8)}…  ` +
          `+${projUpdate.count} projects, +${diagUpdate.count} diagrams backfilled`
      );
      continue;
    }

    // Brand new user with no Org. Create one.
    const orgName = `${user.name ?? user.email.split("@")[0] ?? user.email}'s Org`;

    await prisma.$transaction(async (tx) => {
      const org = await tx.org.create({
        data: {
          name: orgName,
          entityType: "Other",
        },
      });
      counts.orgsCreated++;

      await tx.orgMember.create({
        data: {
          orgId: org.id,
          userId: user.id,
          role: "Owner",
        },
      });
      counts.membersCreated++;

      const projUpdate = await tx.project.updateMany({
        where: { userId: user.id, orgId: null },
        data: { orgId: org.id },
      });
      counts.projectsBackfilled += projUpdate.count;

      const diagUpdate = await tx.diagram.updateMany({
        where: { userId: user.id, orgId: null },
        data: { orgId: org.id },
      });
      counts.diagramsBackfilled += diagUpdate.count;

      console.log(
        `[create]      ${user.email}: org ${org.id.slice(0, 8)}…  ` +
          `(${projUpdate.count} projects, ${diagUpdate.count} diagrams)`
      );
    });
  }

  // Post-flight summary + sanity checks
  const remainingProjectsWithoutOrg = await prisma.project.count({ where: { orgId: null } });
  const remainingDiagramsWithoutOrg = await prisma.diagram.count({ where: { orgId: null } });

  console.log();
  console.log("─── Result ───────────────────────────────────────────────");
  console.log(`Users processed:           ${counts.users}`);
  console.log(`  with pre-existing org:   ${counts.usersAlreadyHadOrg}`);
  console.log(`Orgs created:              ${counts.orgsCreated}`);
  console.log(`OrgMembers created:        ${counts.membersCreated}`);
  console.log(`Projects backfilled:       ${counts.projectsBackfilled}`);
  console.log(`Diagrams backfilled:       ${counts.diagramsBackfilled}`);
  if (counts.projectsAlreadyAssigned > 0) {
    console.log(`Projects already on a different org: ${counts.projectsAlreadyAssigned}`);
  }
  if (counts.diagramsAlreadyAssigned > 0) {
    console.log(`Diagrams already on a different org: ${counts.diagramsAlreadyAssigned}`);
  }
  console.log("──────────────────────────────────────────────────────────");
  console.log();
  console.log(`Projects still without orgId: ${remainingProjectsWithoutOrg}`);
  console.log(`Diagrams still without orgId: ${remainingDiagramsWithoutOrg}`);
  console.log();

  if (remainingProjectsWithoutOrg === 0 && remainingDiagramsWithoutOrg === 0) {
    console.log("✅ Backfill complete. All Projects and Diagrams have an orgId.");
    console.log("   You can now apply the NOT NULL tightening to schema.prisma.");
  } else {
    console.log("⚠️  Some rows still have NULL orgId. Investigate before tightening.");
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
