/**
 * Regenerate DiagramTemplate.thumbnailSvg for every template from its OWN
 * current `data`. Use it to:
 *   - roll out a palette / renderer change to all stored thumbnails, and
 *   - backfill legacy templates (user or built-in) that have no thumbnail yet,
 * WITHOUT touching `data` — so any hand edits to a template are preserved
 * (unlike the seed, which regenerates built-in thumbnails from the seed's own
 * fragment geometry).
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/regen-template-thumbnails.ts                 # local, all templates
 *   npx tsx scripts/regen-template-thumbnails.ts --builtin       # only built-ins
 *   DATABASE_URL="<prod url>" npx tsx scripts/regen-template-thumbnails.ts  # prod
 *
 * Idempotent — safe to re-run. thumbnailSvg is a plain String column, so it
 * writes cleanly via Prisma (no raw-pg JSON dance needed).
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { renderTemplateThumbnailSvg } from "../app/lib/diagram/templateThumbnail";
import type { TemplateData } from "../app/lib/diagram/types";

async function main() {
  const onlyBuiltin = process.argv.includes("--builtin");
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  let updated = 0, skipped = 0;
  try {
    const rows = await prisma.diagramTemplate.findMany({
      where: onlyBuiltin ? { templateType: "builtin" } : {},
      select: { id: true, name: true, templateType: true, data: true },
      orderBy: [{ templateType: "asc" }, { name: "asc" }],
    });
    console.log(`Regenerating thumbnails for ${rows.length} template(s)${onlyBuiltin ? " (built-in only)" : ""}…\n`);

    for (const r of rows) {
      const data = r.data as unknown as TemplateData;
      const svg = renderTemplateThumbnailSvg(data);
      if (!svg) {
        skipped++;
        console.log(`  skip   "${r.name}" (${r.templateType}) — no elements`);
        continue;
      }
      await prisma.diagramTemplate.update({ where: { id: r.id }, data: { thumbnailSvg: svg } });
      updated++;
      console.log(`  regen  "${r.name}" (${r.templateType})`);
    }

    console.log(`\nDone. Regenerated ${updated} thumbnail(s), skipped ${skipped}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
