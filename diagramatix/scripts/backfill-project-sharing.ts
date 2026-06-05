/**
 * Project Sharing — Backfill Diagram.diagramOwnerId for existing rows.
 *
 * After the schema migration that added `Diagram.diagramOwnerId`, every
 * existing diagram's owner column is NULL. This one-shot script sets
 * `diagramOwnerId = project.userId` for each diagram that belongs to a
 * project so the new "Diagram Owner" UI has a meaningful default
 * (= the project owner) the moment it rolls out.
 *
 * Diagrams without a project (legacy stand-alone diagrams, if any) are
 * left at NULL — they have no implicit owner-of-record other than the
 * diagram's own `userId`, which the UI already surfaces.
 *
 * Idempotent: safe to re-run. Only updates rows where diagramOwnerId
 * is still NULL.
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/backfill-project-sharing.ts
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

async function main() {
  console.log("[backfill-project-sharing] starting…");

  // Single SQL UPDATE — sets diagramOwnerId on every diagram that has a
  // project and currently has NULL diagramOwnerId. Doing this in raw SQL
  // beats Prisma's update-many because the right-hand side comes from
  // a different table (Project) which Prisma's API can't express in one
  // statement without a per-row loop.
  const rows = await prisma.$executeRaw`
    UPDATE "Diagram" AS d
    SET    "diagramOwnerId" = p."userId"
    FROM   "Project" AS p
    WHERE  d."projectId"      = p."id"
      AND  d."diagramOwnerId" IS NULL
  `;
  console.log(`[backfill-project-sharing]   diagrams updated: ${rows}`);

  // Sanity counts so the operator can see we hit something sensible.
  const totalWithProject = await prisma.diagram.count({
    where: { NOT: { projectId: null } },
  });
  const stillNull = await prisma.diagram.count({
    where: { NOT: { projectId: null }, diagramOwnerId: null },
  });
  console.log(
    `[backfill-project-sharing]   diagrams with project: ${totalWithProject}, still NULL owner: ${stillNull}`,
  );

  if (stillNull > 0) {
    console.warn(
      `[backfill-project-sharing] WARNING: ${stillNull} diagrams still have NULL diagramOwnerId. ` +
        `These probably reference projects that no longer exist — ` +
        `the SetNull on projectId means they decoupled.`,
    );
  }

  console.log("[backfill-project-sharing] done.");
}

main()
  .catch((err) => {
    console.error("[backfill-project-sharing] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
