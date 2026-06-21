/**
 * Emit ready-to-paste SQL that syncs the Feature catalog to the committed seed
 * AND publishes — the SQL-editor equivalent of sync-features.ts, for when you'd
 * rather paste into the Azure Postgres query editor than run tsx against prod.
 *
 * Per feature it does an UPSERT-by-name (no unique constraint on name, so:
 * UPDATE if present, then INSERT if absent) and stamps the published* snapshot.
 * Existing rows keep their sortOrder; new rows get (seed index + 1) * 10. The
 * whole thing is wrapped in a transaction and is idempotent (re-runnable).
 *
 * Writes scripts/sync-features.sql. Run:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/gen-features-sql.ts
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { FEATURES } from "./seed-features";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

function main() {
  const blocks = FEATURES.map((f, i) => {
    const so = (i + 1) * 10;
    const n = q(f.name), s = q(f.summary), d = q(f.details);
    return [
      `-- ${f.name}`,
      `UPDATE "Feature" SET "summary"=${s}, "details"=${d},`,
      `  "publishedName"="name", "publishedSummary"=${s}, "publishedDetails"=${d},`,
      `  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()`,
      `WHERE "name"=${n};`,
      `INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")`,
      `  SELECT gen_random_uuid()::text, ${n}, ${s}, ${d}, false, ${so}, ${n}, ${s}, ${d}, false, ${so}, now(), now(), now()`,
      `  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"=${n});`,
    ].join("\n");
  });

  const sql = [
    "-- Diagramatix Feature catalog sync (generated) — upsert by name + publish.",
    "-- Idempotent + re-runnable. Paste into the prod Postgres SQL editor.",
    "-- Updates existing features to match the seed and (re)publishes them;",
    "-- inserts the ones prod is missing. Features only on prod are left untouched.",
    "",
    "BEGIN;",
    "",
    blocks.join("\n\n"),
    "",
    "COMMIT;",
    "",
  ].join("\n");

  const out = join(process.cwd(), "scripts", "sync-features.sql");
  writeFileSync(out, sql, "utf8");
  console.log(`Wrote ${out} (${FEATURES.length} features, ${sql.length} bytes).`);
}

main();
