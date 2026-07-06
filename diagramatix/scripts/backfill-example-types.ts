/**
 * Backfill Project.exampleType for example projects created before the field
 * existed. Going forward the three adopt paths tag projects at creation
 * (simulation / mining / risk-control); this catches the ones already in the DB.
 *
 * SAFE by design — only touches projects that BOTH look like an example/demo by
 * name AND actually carry the matching feature content, so a user's ordinary
 * project is never recoloured. Feature is derived by content precedence:
 * a mining run → "mining"; else a simulation study → "simulation"; else a
 * Risk & Control library → "risk-control". Idempotent (skips already-tagged rows).
 *
 * Run: DATABASE_URL="…" npx tsx scripts/backfill-example-types.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    // Cleanup first: an adopted example that has since been RENAMED away from its
    // "… (example)" / demo name is now the user's own project — drop the tint so
    // it reads as a normal white tile. (Going forward the rename API clears it
    // live; this catches ones renamed before that shipped.)
    const cleaned = await prisma.$executeRawUnsafe(
      `UPDATE "Project" SET "exampleType" = NULL
       WHERE "exampleType" IS NOT NULL
         AND lower("name") NOT LIKE '%(example)%'
         AND lower("name") NOT LIKE '%demo%'`,
    );
    console.log(`Cleared example tint from ${cleaned} renamed project(s).`);

    // Candidates: untagged projects whose name reads as an adopted example or a
    // seeded demo. Postgres ILIKE via a raw name filter through Prisma's contains.
    const candidates = await prisma.project.findMany({
      where: {
        exampleType: null,
        OR: [
          { name: { contains: "(example)" } },
          { name: { contains: "demo", mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true },
    });

    let tagged = 0;
    for (const p of candidates) {
      const [miningRun, simStudy, rcLib] = await Promise.all([
        prisma.processMiningRun.findFirst({ where: { projectId: p.id }, select: { id: true } }),
        prisma.simulationStudy.findFirst({ where: { projectId: p.id }, select: { id: true } }),
        prisma.riskControlLibrary.findFirst({ where: { projectId: p.id }, select: { id: true } }),
      ]);
      const type = miningRun ? "mining" : simStudy ? "simulation" : rcLib ? "risk-control" : null;
      if (!type) continue; // name looked example-ish but no feature content — leave alone
      await prisma.project.update({ where: { id: p.id }, data: { exampleType: type } });
      console.log(`  ${type.padEnd(13)} ← ${p.name}`);
      tagged++;
    }
    console.log(`Done. Tagged ${tagged} of ${candidates.length} candidate project(s).`);
  } finally { await prisma.$disconnect(); }
}

main().catch((e) => { console.error(e); process.exit(1); });
