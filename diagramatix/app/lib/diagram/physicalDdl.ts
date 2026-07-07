/**
 * Generate the **physical** DDL of the live Diagramatix database — the actual
 * PostgreSQL schema as deployed (whatever `prisma db push` has applied),
 * introspected straight from the catalog. Unlike the curated *logical* model
 * (ddlGenerate.ts), this reflects reality: real table/column names, native
 * types, enums, primary/unique/foreign-key constraints and indexes.
 *
 * Postgres-only by design — it IS the physical database. Takes a minimal
 * query function so it's testable without a live pool.
 */

export interface QueryFn {
  (sql: string): Promise<{ rows: Record<string, unknown>[] }>;
}

const q = (id: string) => `"${id}"`;

export async function buildPhysicalDdl(query: QueryFn, generatedAt = new Date()): Promise<string> {
  // ── Enums ──────────────────────────────────────────────────────────
  const enumRows = (await query(`
    SELECT t.typname AS name, e.enumlabel AS label
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    ORDER BY t.typname, e.enumsortorder
  `)).rows as { name: string; label: string }[];
  const enums = new Map<string, string[]>();
  for (const r of enumRows) (enums.get(r.name) ?? enums.set(r.name, []).get(r.name)!).push(r.label);

  // ── Columns (native types via format_type; defaults via pg_get_expr) ──
  const colRows = (await query(`
    SELECT c.relname AS "table", a.attname AS "column", a.attnum AS "pos",
           pg_catalog.format_type(a.atttypid, a.atttypmod) AS "type",
           a.attnotnull AS "notnull",
           pg_get_expr(ad.adbin, ad.adrelid) AS "default"
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY c.relname, a.attnum
  `)).rows as { table: string; column: string; type: string; notnull: boolean; default: string | null }[];
  const tables = new Map<string, { column: string; type: string; notnull: boolean; default: string | null }[]>();
  for (const r of colRows) (tables.get(r.table) ?? tables.set(r.table, []).get(r.table)!).push(r);

  // ── Constraints (PK / UNIQUE / FK) via pg_get_constraintdef ──────────
  const conRows = (await query(`
    SELECT conname AS "name", contype AS "type", conrelid::regclass::text AS "table",
           pg_get_constraintdef(oid) AS "def"
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace AND contype IN ('p','u','f')
    ORDER BY conrelid::regclass::text, contype DESC, conname
  `)).rows as { name: string; type: string; table: string; def: string }[];
  const constraintNames = new Set(conRows.filter((c) => c.type === "p" || c.type === "u").map((c) => c.name));

  // ── Indexes (skip those backing a PK/unique constraint) ─────────────
  const idxRows = (await query(`
    SELECT indexname AS "name", indexdef AS "def"
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `)).rows as { name: string; def: string }[];

  // ── Assemble ────────────────────────────────────────────────────────
  const out: string[] = [];
  out.push(`-- Diagramatix — PHYSICAL database DDL (PostgreSQL)`);
  out.push(`-- Introspected from the live schema at ${generatedAt.toISOString()}`);
  out.push(`-- This is the actual deployed schema, not the curated logical model.`);
  out.push(``);

  if (enums.size) {
    out.push(`-- ── Enum types ──────────────────────────────────────────`);
    for (const [name, labels] of [...enums].sort((a, b) => a[0].localeCompare(b[0]))) {
      out.push(`CREATE TYPE ${q(name)} AS ENUM (${labels.map((l) => `'${l.replace(/'/g, "''")}'`).join(", ")});`);
    }
    out.push(``);
  }

  out.push(`-- ── Tables ──────────────────────────────────────────────`);
  for (const [table, cols] of [...tables].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push(`CREATE TABLE ${q(table)} (`);
    const lines = cols.map((c) => {
      let line = `  ${q(c.column)} ${c.type}`;
      if (c.notnull) line += ` NOT NULL`;
      if (c.default != null) line += ` DEFAULT ${c.default}`;
      return line;
    });
    out.push(lines.join(",\n"));
    out.push(`);`);
    out.push(``);
  }

  const cons = conRows;
  const pkUnique = cons.filter((c) => c.type === "p" || c.type === "u");
  const fks = cons.filter((c) => c.type === "f");
  if (pkUnique.length) {
    out.push(`-- ── Primary keys & unique constraints ───────────────────`);
    for (const c of pkUnique) out.push(`ALTER TABLE ${q(c.table.replace(/"/g, ""))} ADD CONSTRAINT ${q(c.name)} ${c.def};`);
    out.push(``);
  }

  const extraIdx = idxRows.filter((i) => !constraintNames.has(i.name));
  if (extraIdx.length) {
    out.push(`-- ── Indexes ─────────────────────────────────────────────`);
    for (const i of extraIdx) out.push(`${i.def};`);
    out.push(``);
  }

  if (fks.length) {
    out.push(`-- ── Foreign keys ────────────────────────────────────────`);
    for (const c of fks) out.push(`ALTER TABLE ${q(c.table.replace(/"/g, ""))} ADD CONSTRAINT ${q(c.name)} ${c.def};`);
    out.push(``);
  }

  return out.join("\n");
}
