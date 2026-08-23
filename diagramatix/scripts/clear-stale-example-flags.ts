/**
 * Clear `Project.exampleType` on projects that are not actually adopted
 * catalog examples.
 *
 * `exampleType` means "created by adopting a ready-made example". It tints the
 * tile green AND blocks sharing and publishing until the project is renamed.
 * Two ways a project ended up carrying it wrongly:
 *
 *  1. `/api/simulation/import` shares its code with catalog adoption, which
 *     hardcoded `exampleType: "simulation"`. A bundle you imported yourself was
 *     therefore flagged as an example you could never find in the Examples list
 *     — and could not share or publish. (Fixed at source: the flag now follows
 *     `sourceExampleId`.)
 *  2. Projects adopted before `sourceExampleId` existed carry the flag with no
 *     link to any example.
 *
 * Both leave the same fingerprint: `exampleType` set, `sourceExampleId` null.
 * That is what this repairs — a project still linked to a live catalog example
 * is left completely alone.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/clear-stale-example-flags.ts --dry-run
 *   DATABASE_URL="<prod url>" npx tsx scripts/clear-stale-example-flags.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    // Orphaned flag only: set type, no source. A project still pointing at an
    // example is a real adoption and must keep its flag.
    const stale = await prisma.project.findMany({
      where: { exampleType: { not: null }, sourceExampleId: null },
      select: { id: true, name: true, exampleType: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const linked = await prisma.project.count({ where: { exampleType: { not: null }, sourceExampleId: { not: null } } });
    console.log(`genuine adoptions left untouched : ${linked}`);
    console.log(`stale flags to clear             : ${stale.length}`);
    for (const p of stale) console.log(`   ${String(p.exampleType).padEnd(14)} ${p.createdAt.toISOString().slice(0, 10)}  ${p.name}`);

    if (stale.length === 0) { console.log("\nNothing to do."); return; }
    if (dryRun) { console.log("\n--dry-run — nothing written."); return; }

    const { count } = await prisma.project.updateMany({
      where: { id: { in: stale.map((p) => p.id) } },
      data: { exampleType: null },
    });
    console.log(`\nCleared ${count} flag(s). Those projects are now ordinary projects — normal tile, and shareable/publishable.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
