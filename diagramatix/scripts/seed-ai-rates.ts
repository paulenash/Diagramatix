/**
 * Seed the AiModelRate catalog from the pricing.ts snapshot (USD per 1M tokens).
 *
 * Idempotent + non-destructive: inserts a row per (provider, model) only when it
 * doesn't already exist, so SuperAdmin edits made via /api/admin/ai-rates are NEVER
 * clobbered by a re-run. (Un-seeded models still resolve to the code defaults via
 * app/lib/ai/aiRates.ts, so seeding is optional — it just makes every rate visible
 * and editable in the admin UI.)
 *
 * Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/seed-ai-rates.ts
 *
 * Against prod (one-time):
 *   DATABASE_URL="<prod url>" npx tsx scripts/seed-ai-rates.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PRICING } from "../app/lib/ai/pricing";

function providerOf(model: string): string {
  return /^(kimi|moonshot)/i.test(model) ? "moonshot" : "anthropic";
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });

  try {
    let inserted = 0;
    let skipped = 0;
    for (const [model, p] of Object.entries(PRICING)) {
      const provider = providerOf(model);
      const existing = await prisma.aiModelRate.findUnique({
        where: { provider_model: { provider, model } },
      });
      if (existing) {
        skipped++;
        continue;
      }
      await prisma.aiModelRate.create({
        data: { provider, model, inputPer1M: p.in, outputPer1M: p.out, currency: "USD" },
      });
      inserted++;
    }
    console.log(`Done. Inserted ${inserted}, skipped ${skipped} existing.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
