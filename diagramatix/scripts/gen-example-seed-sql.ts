/**
 * Emit ready-to-paste SQL for the starter example catalog — same content as
 * seed-simulation-examples.ts, but as INSERT … ON CONFLICT statements you can
 * run in a SQL editor (e.g. the Azure Postgres query editor) without Node.
 *
 * Writes scripts/seed-simulation-examples.sql. Run:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/gen-example-seed-sql.ts
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { STARTER_EXAMPLES, RETIRED_EXAMPLE_SLUGS } from "../app/lib/simulation/exampleSeeds";

/** Escape a value for a single-quoted SQL literal. */
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

function main() {
  const blocks = STARTER_EXAMPLES.map((ex, i) => {
    const pkg = JSON.stringify(ex.package);
    return [
      `INSERT INTO "SimulationExample"`,
      `  ("id","slug","title","concept","description","difficulty","sortOrder","published","package","createdAt","updatedAt")`,
      `VALUES (`,
      `  ${q("seedex_" + ex.slug)}, ${q(ex.slug)}, ${q(ex.title)}, ${q(ex.concept)},`,
      `  ${q(ex.description)}, ${q(ex.difficulty)}, ${(i + 1) * 10}, true,`,
      `  ${q(pkg)}::jsonb, now(), now()`,
      `)`,
      `ON CONFLICT ("slug") DO UPDATE SET`,
      `  "title"=EXCLUDED."title", "concept"=EXCLUDED."concept", "description"=EXCLUDED."description",`,
      `  "difficulty"=EXCLUDED."difficulty", "sortOrder"=EXCLUDED."sortOrder",`,
      `  "published"=EXCLUDED."published", "package"=EXCLUDED."package", "updatedAt"=now();`,
    ].join("\n");
  });

  const retire = RETIRED_EXAMPLE_SLUGS.length
    ? `DELETE FROM "SimulationExample" WHERE "slug" IN (${RETIRED_EXAMPLE_SLUGS.map(q).join(", ")});`
    : "";

  const sql = [
    "-- Diagramatix Simulator example catalog seed (generated).",
    "-- Idempotent: re-runnable; ON CONFLICT(slug) refreshes content.",
    "-- Paste into the Azure Postgres query editor (or any psql client).",
    "",
    "-- Retire superseded starter examples.",
    retire,
    "",
    blocks.join("\n\n"),
    "",
  ].join("\n");

  const out = join(process.cwd(), "scripts", "seed-simulation-examples.sql");
  writeFileSync(out, sql, "utf8");
  console.log(`Wrote ${out} (${STARTER_EXAMPLES.length} examples, ${sql.length} bytes).`);
}

main();
