/**
 * Seed the Mining-Example catalog (DiagramatixMINER) with the starter set
 * (app/lib/mining/exampleSeeds.ts). Upsert by slug so re-running refreshes the
 * bundled content; entries are published so they appear in the gallery and can
 * be adopted immediately. Admins can then edit, duplicate, or author new ones.
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   DATABASE_URL="postgres://postgres:postgres@localhost:5432/diagramatix" npx tsx scripts/seed-mining-examples.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { STARTER_MINING_EXAMPLES, RETIRED_MINING_EXAMPLE_SLUGS } from "../app/lib/mining/exampleSeeds";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    if (RETIRED_MINING_EXAMPLE_SLUGS.length) {
      const retired = await prisma.miningExample.deleteMany({ where: { slug: { in: RETIRED_MINING_EXAMPLE_SLUGS } } });
      if (retired.count) console.log(`Retired ${retired.count} old example(s).`);
    }

    let created = 0, updated = 0;
    for (let i = 0; i < STARTER_MINING_EXAMPLES.length; i++) {
      const ex = STARTER_MINING_EXAMPLES[i];
      const existing = await prisma.miningExample.findUnique({ where: { slug: ex.slug } });
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
      if (existing) { await prisma.miningExample.update({ where: { slug: ex.slug }, data }); updated++; }
      else { await prisma.miningExample.create({ data: { slug: ex.slug, ...data } }); created++; }
    }
    console.log(`Done. Created ${created}, refreshed ${updated} example(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
