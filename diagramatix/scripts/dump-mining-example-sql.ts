/**
 * Dump ONE published MiningExample row as idempotent SQL (INSERT … ON CONFLICT),
 * so prod can be updated without running the tsx seed. Data only, no schema change.
 *   cd diagramatix && export PATH="$PATH:/c/Program Files/nodejs"
 *   DATABASE_URL="postgres://postgres:postgres@localhost:5432/diagramatix" \
 *     npx tsx scripts/dump-mining-example-sql.ts <slug> > ../scratchpad/prod-<slug>.sql
 */
import "dotenv/config";
import { pgPool } from "../app/lib/db";

function lit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function main() {
  const slug = process.argv[2] ?? "live-order-processing";
  const ex = await pgPool.query(`SELECT * FROM "MiningExample" WHERE slug = $1`, [slug]);
  if (!ex.rows.length) { console.error(`No MiningExample with slug "${slug}"`); process.exit(1); }
  const r = ex.rows[0];
  r.createdById = null; // local author id may not exist on prod (FK safe)
  const cols = Object.keys(r);
  const colList = cols.map((c) => `"${c}"`).join(", ");
  const valList = cols.map((c) => lit(r[c])).join(", ");
  const setClause = cols.filter((c) => c !== "slug").map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");

  console.log(`-- MiningExample "${slug}" — data only, no schema change. Idempotent; safe to re-run.`);
  console.log("BEGIN;");
  console.log(`INSERT INTO "MiningExample" (${colList}) VALUES (${valList})\n  ON CONFLICT (slug) DO UPDATE SET ${setClause};`);
  console.log("COMMIT;");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
