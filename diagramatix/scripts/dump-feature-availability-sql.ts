/**
 * Dump the Enterprise SubscriptionLevel row + the full FeatureAvailability
 * matrix from THIS database as idempotent SQL (INSERT ... ON CONFLICT).
 * Run against local (which is already correct) → paste the output into a
 * prod SQL console (Azure Query editor / psql) to bring prod into line.
 *
 *   cd diagramatix && export PATH="$PATH:/c/Program Files/nodejs"
 *   npx tsx scripts/dump-feature-availability-sql.ts > ../scratchpad/prod-seed.sql
 */
import "dotenv/config";
import { pgPool } from "../app/lib/db";

function lit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return `'${v.toISOString()}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function insertRows(table: string, rows: Record<string, unknown>[], conflictCols: string[], updateCols: string[]) {
  const out: string[] = [];
  for (const row of rows) {
    const cols = Object.keys(row);
    const colList = cols.map((c) => `"${c}"`).join(", ");
    const valList = cols.map((c) => lit(row[c])).join(", ");
    const conflict = conflictCols.map((c) => `"${c}"`).join(", ");
    const setClause = updateCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");
    out.push(`INSERT INTO "${table}" (${colList}) VALUES (${valList})\n  ON CONFLICT (${conflict}) DO UPDATE SET ${setClause};`);
  }
  return out.join("\n");
}

async function main() {
  const ent = await pgPool.query(`SELECT * FROM "SubscriptionLevel" WHERE id = 'enterprise'`);
  const fa = await pgPool.query(`SELECT * FROM "FeatureAvailability" ORDER BY "levelId", "featureKey"`);

  console.log("-- Enterprise tier + FeatureAvailability matrix (generated from local).");
  console.log("-- Idempotent: safe to re-run. Does NOT touch users or other tiers.");
  console.log("BEGIN;");
  console.log("\n-- 1) Enterprise SubscriptionLevel row");
  const entUpdate = Object.keys(ent.rows[0] ?? {}).filter((c) => c !== "id");
  console.log(await insertRows("SubscriptionLevel", ent.rows, ["id"], entUpdate));
  console.log(`\n-- 2) FeatureAvailability matrix (${fa.rows.length} rows)`);
  console.log(await insertRows("FeatureAvailability", fa.rows, ["levelId", "featureKey"], ["state", "updatedAt"]));
  console.log("\nCOMMIT;");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
