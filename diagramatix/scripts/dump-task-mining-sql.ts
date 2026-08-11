/**
 * Dump the Phase 1 Slice 1 Task-Mining DATA as idempotent SQL, so prod can be
 * updated without running the tsx seeds. Emits:
 *   1. the 5 FeatureAvailability rows for `task-mining` (the Expert/Enterprise gate), and
 *   2. the "Task Mining — Enter Invoice" MiningExample row (with its package JSON).
 * No schema change this slice — inserts only. Run against LOCAL (already correct):
 *   cd diagramatix && export PATH="$PATH:/c/Program Files/nodejs"
 *   DATABASE_URL="postgres://postgres:postgres@localhost:5432/diagramatix" \
 *     npx tsx scripts/dump-task-mining-sql.ts > ../scratchpad/prod-task-mining.sql
 */
import "dotenv/config";
import { pgPool } from "../app/lib/db";

function lit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`; // Json/jsonb columns
  return `'${String(v).replace(/'/g, "''")}'`;
}

function upsert(table: string, row: Record<string, unknown>, conflictCols: string[], updateCols: string[]): string {
  const cols = Object.keys(row);
  const colList = cols.map((c) => `"${c}"`).join(", ");
  const valList = cols.map((c) => lit(row[c])).join(", ");
  const conflict = conflictCols.map((c) => `"${c}"`).join(", ");
  const setClause = updateCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");
  return `INSERT INTO "${table}" (${colList}) VALUES (${valList})\n  ON CONFLICT (${conflict}) DO UPDATE SET ${setClause};`;
}

async function main() {
  const fa = await pgPool.query(`SELECT * FROM "FeatureAvailability" WHERE "featureKey" = 'task-mining' ORDER BY "levelId"`);
  const ex = await pgPool.query(`SELECT * FROM "MiningExample" WHERE slug = 'task-mining-enter-invoice'`);

  console.log("-- Task Mining Phase 1 Slice 1 — data only (no schema change). Idempotent; safe to re-run.");
  console.log("BEGIN;");

  console.log(`\n-- 1) FeatureAvailability: the task-mining gate (${fa.rows.length} rows, Expert/Enterprise)`);
  for (const r of fa.rows) {
    console.log(upsert("FeatureAvailability", r, ["levelId", "featureKey"], ["state", "updatedAt"]));
  }

  console.log(`\n-- 2) MiningExample: "Task Mining — Enter Invoice" (${ex.rows.length} row)`);
  for (const r of ex.rows) {
    // Force createdById NULL — the local author id may not exist on prod (FK safe).
    r.createdById = null;
    const cols = Object.keys(r).filter((c) => c !== "slug");
    console.log(upsert("MiningExample", r, ["slug"], cols));
  }

  console.log("\nCOMMIT;");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
