/**
 * Stamp the deployed appVersion into the User Guide's Overview.
 *
 * UPDATE_EVERYTHING.md Step 10a — mandatory on every version-bearing release.
 * The Overview text is hand-written content, so it does NOT pick up the runtime
 * version; and the build number is only known after the deploy, which is why
 * this runs against prod at the end rather than riding the commit.
 *
 * Idempotent: rewrites whatever version currently follows "covers version" to
 * the one given, so re-running with the same number changes nothing. It reports
 * loudly rather than silently doing nothing if the sentence has been reworded —
 * a version stamp that quietly stops being applied is worse than one that fails.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/set-guide-version.ts 2.2.2310                           # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/set-guide-version.ts 2.2.2310 # prod
 *   ... --dry-run   to preview without writing
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const COLLECTION = "user-guide";
const CHAPTER = "getting-started";
/** "covers version **1.27**" / "covers version 1.27" — captures the number. */
const VERSION_RE = /(covers version\s+\*{0,2})([0-9]+(?:\.[0-9]+)*)(\*{0,2})/i;

async function main() {
  const version = process.argv.find((a) => /^\d+\.\d+/.test(a));
  const dryRun = process.argv.includes("--dry-run");
  if (!version) {
    console.error("Usage: npx tsx scripts/set-guide-version.ts <appVersion e.g. 2.2.2310> [--dry-run]");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const chapter = await prisma.helpChapter.findFirst({
      where: { slug: CHAPTER, collection: COLLECTION },
      include: { sections: { orderBy: { sortOrder: "asc" } } },
    });
    if (!chapter) throw new Error(`No "${CHAPTER}" chapter in the ${COLLECTION} collection.`);

    const target = chapter.sections.find((s) => VERSION_RE.test(s.bodyMarkdown));
    if (!target) {
      console.error(`\n✗ No section in "${CHAPTER}" contains a "covers version …" sentence.`);
      console.error("  The Overview wording has changed. Update it by hand, then fix VERSION_RE here");
      console.error("  so the next release stamps it again.");
      process.exit(2);
    }

    const was = target.bodyMarkdown.match(VERSION_RE)![2];
    if (was === version) {
      console.log(`Already reads "covers version ${version}" — nothing to do.`);
      return;
    }
    const next = target.bodyMarkdown.replace(VERSION_RE, `$1${version}$3`);

    console.log(`Chapter "${chapter.title}" / section ${JSON.stringify(target.heading ?? "(intro)")}`);
    console.log(`  covers version:  ${was}  ->  ${version}`);
    if (dryRun) { console.log("\n--dry-run — nothing written."); return; }

    await prisma.helpSection.update({ where: { id: target.id }, data: { bodyMarkdown: next } });
    console.log("Written.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
