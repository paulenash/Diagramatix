/**
 * One-time (re-runnable) backfill: populate the Process Portal's denormalised
 * Diagram columns — pcfId / pcfHierarchyId / pcfName and procedureDocUrl /
 * procedureDocName — from each diagram's `data` JSON (DiagramData.pcf /
 * .procedureDoc). New saves keep these in step (see app/lib/diagram/denorm.ts);
 * this catches diagrams last saved before the columns existed.
 *
 * Idempotent. Run: DATABASE_URL="…" npx tsx scripts/backfill-diagram-pcf.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { deriveDiagramDenorm } from "../app/lib/diagram/denorm";

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const diagrams = await prisma.diagram.findMany({ select: { id: true, data: true } });
    let changed = 0;
    for (const d of diagrams) {
      const denorm = deriveDiagramDenorm(d.data);
      await prisma.diagram.update({ where: { id: d.id }, data: denorm });
      if (denorm.pcfHierarchyId || denorm.procedureDocUrl) changed++;
    }
    console.log(`Backfilled ${diagrams.length} diagrams (${changed} carry a PCF classification or procedure doc).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
