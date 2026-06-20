/**
 * Seed the Simulation-Example catalog with the fully-operational starter set
 * (app/lib/simulation/exampleSeeds.ts). Upsert by slug so re-running refreshes
 * the bundled content; entries are published so they appear in the gallery and
 * can be adopted (loaded into a project) immediately. Admins can then edit,
 * duplicate, extend, or author new ones.
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   DATABASE_URL="postgres://postgres:postgres@localhost:5432/diagramatix" npx tsx scripts/seed-simulation-examples.ts
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { STARTER_EXAMPLES } from "../app/lib/simulation/exampleSeeds";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });

  try {
    let created = 0, updated = 0;
    for (let i = 0; i < STARTER_EXAMPLES.length; i++) {
      const ex = STARTER_EXAMPLES[i];
      const existing = await prisma.simulationExample.findUnique({ where: { slug: ex.slug } });
      const data = {
        title: ex.title,
        concept: ex.concept,
        description: ex.description,
        difficulty: ex.difficulty,
        published: true,
        sortOrder: (i + 1) * 10,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        package: ex.package as any,
      };
      if (existing) {
        await prisma.simulationExample.update({ where: { slug: ex.slug }, data });
        updated++;
      } else {
        await prisma.simulationExample.create({ data: { slug: ex.slug, ...data } });
        created++;
      }
    }
    console.log(`Done. Created ${created}, refreshed ${updated} example(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
