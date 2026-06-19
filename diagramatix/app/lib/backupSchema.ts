/**
 * Catalog-driven schema introspection for backup / restore.
 *
 * The backup system used to hand-maintain three things per table — the model
 * list, the per-model Date-column map, and the dependency-ordered insert /
 * truncate sequence. New tables (e.g. EntityList/EntityNode) were silently
 * missed, and a wipe restore would cascade-delete them with nothing to
 * re-insert. This module derives ALL of that from the live Postgres catalog,
 * so every table is included automatically and ordering is always correct.
 *
 * Why the catalog and not Prisma's DMMF: the Prisma 7 "prisma-client"
 * generator exposes no public DMMF, and its embedded runtimeDataModel omits
 * FK direction (relationFromFields / isList) — exactly what insert-ordering
 * needs. The DB catalog is the authoritative source for FK direction,
 * nullability and timestamp columns, with zero dependence on Prisma internals.
 */

import { pgPool } from "./db";

/** A foreign-key edge: `child` rows depend on `parent` rows existing first. */
export interface FkEdge {
  child: string;
  parent: string;
  /** The FK columns on the child table. */
  columns: string[];
  /** True when every FK column is nullable (so the edge can be deferred). */
  nullable: boolean;
}

/** A cyclic FK edge that must be deferred: insert the child with these columns
 *  nulled, then re-link them after the parent table has been populated. */
export interface DeferredEdge {
  child: string;
  parent: string;
  columns: string[];
}

export interface BackupSchema {
  /** Every base table that holds app data (excludes _prisma_migrations). */
  tables: string[];
  /** Dependency-ordered for INSERT (parents before children). Reverse for
   *  truncate, though TRUNCATE … CASCADE makes truncate order moot. */
  insertOrder: string[];
  /** Cyclic nullable FK edges to null-then-relink during restore. */
  deferred: DeferredEdge[];
  /** table → its timestamp/date columns (ISO strings → Date on restore). */
  timestampColumns: Record<string, string[]>;
  /** table → its primary-key column(s) (used to re-link deferred edges). */
  primaryKey: Record<string, string[]>;
}

/** Map a PascalCase table/model name to its Prisma client delegate (camelCase
 *  first letter). Tables are not @@map-ed in this schema, so table name ===
 *  model name. e.g. "DiagramHistory" → "diagramHistory". */
export function delegateName(table: string): string {
  return table.length > 0 ? table[0].toLowerCase() + table.slice(1) : table;
}

async function fetchTables(): Promise<string[]> {
  const { rows } = await pgPool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );
  // Drop Prisma/internal bookkeeping tables (e.g. _prisma_migrations) — they
  // have no client delegate and must not be wiped/restored.
  return rows.map((r) => r.table_name).filter((t) => !t.startsWith("_"));
}

async function fetchTimestampColumns(): Promise<Record<string, string[]>> {
  const { rows } = await pgPool.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type IN ('timestamp without time zone','timestamp with time zone','date')`,
  );
  const map: Record<string, string[]> = {};
  for (const r of rows) (map[r.table_name] ??= []).push(r.column_name);
  return map;
}

async function fetchPrimaryKeys(): Promise<Record<string, string[]>> {
  const { rows } = await pgPool.query<{ table_name: string; column_name: string }>(
    `SELECT c.relname AS table_name, a.attname AS column_name
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indisprimary AND n.nspname = 'public'`,
  );
  const map: Record<string, string[]> = {};
  for (const r of rows) (map[r.table_name] ??= []).push(r.column_name);
  return map;
}

async function fetchForeignKeys(): Promise<FkEdge[]> {
  // pg_constraint gives the FK columns (conkey) on the child (conrelid) and
  // the referenced table (confrelid). all-not-null over the FK columns tells
  // us whether the edge can be deferred (nullable) when breaking a cycle.
  // Use string_agg (not ARRAY()) — node-pg doesn't always parse an anonymous
  // ARRAY() result back into a JS array, so we join + split ourselves.
  const { rows } = await pgPool.query<{
    child: string; parent: string; columns: string; all_notnull: boolean;
  }>(
    `SELECT child.relname AS child,
            parent.relname AS parent,
            (SELECT string_agg(att.attname, ',' ORDER BY k.ord)
               FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
               JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum) AS columns,
            (SELECT bool_and(att.attnotnull) FROM unnest(con.conkey) AS k(attnum)
               JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum) AS all_notnull
       FROM pg_constraint con
       JOIN pg_class child ON child.oid = con.conrelid
       JOIN pg_class parent ON parent.oid = con.confrelid
       JOIN pg_namespace ns ON ns.oid = child.relnamespace
      WHERE con.contype = 'f' AND ns.nspname = 'public'`,
  );
  return rows.map((r) => ({
    child: r.child,
    parent: r.parent,
    columns: (r.columns ?? "").split(",").filter(Boolean),
    nullable: !r.all_notnull,
  }));
}

/**
 * Topologically order tables so parents insert before children. Self-edges
 * (a table referencing itself, e.g. EntityNode.parentId) are ignored — a
 * single createMany resolves intra-statement self-references. Cross-table
 * cycles (e.g. Diagram ↔ PublishedVersion) are broken by deferring a nullable
 * edge: that edge's child column(s) are nulled on insert and re-linked after.
 */
function planOrder(tables: string[], fks: FkEdge[]): { insertOrder: string[]; deferred: DeferredEdge[] } {
  const deferred: DeferredEdge[] = [];
  // Build the working edge set (parent → child), excluding self-edges.
  let edges = fks.filter((e) => e.child !== e.parent);

  // Break cycles: while a topo sort can't consume every node, find a nullable
  // edge participating in the remaining cycle and defer it.
  for (;;) {
    const order = kahn(tables, edges);
    if (order) return { insertOrder: order, deferred };
    // A cycle remains. Restrict to nodes still in the cycle and cut a nullable
    // edge among them. Prefer cutting nullable edges; error if none exists.
    const inCycle = remainingCycleNodes(tables, edges);
    const cut = edges.find((e) => e.nullable && inCycle.has(e.child) && inCycle.has(e.parent));
    if (!cut) {
      throw new Error(
        `Cannot order backup tables: FK cycle with no nullable edge among [${[...inCycle].join(", ")}]`,
      );
    }
    deferred.push({ child: cut.child, parent: cut.parent, columns: cut.columns });
    edges = edges.filter((e) => e !== cut);
  }
}

/** Kahn's algorithm. Returns a full ordering, or null if a cycle blocks it. */
function kahn(nodes: string[], edges: FkEdge[]): string[] | null {
  const indeg = new Map<string, number>(nodes.map((n) => [n, 0]));
  const out = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const e of edges) {
    indeg.set(e.child, (indeg.get(e.child) ?? 0) + 1);
    out.get(e.parent)!.push(e.child);
  }
  // Deterministic: process ready nodes alphabetically.
  const ready = nodes.filter((n) => (indeg.get(n) ?? 0) === 0).sort();
  const order: string[] = [];
  while (ready.length) {
    const n = ready.shift()!;
    order.push(n);
    for (const m of out.get(n) ?? []) {
      const d = (indeg.get(m) ?? 0) - 1;
      indeg.set(m, d);
      if (d === 0) { ready.push(m); ready.sort(); }
    }
  }
  return order.length === nodes.length ? order : null;
}

/** Nodes still carrying in/out edges after a partial sort — i.e. the cycle. */
function remainingCycleNodes(nodes: string[], edges: FkEdge[]): Set<string> {
  const indeg = new Map<string, number>(nodes.map((n) => [n, 0]));
  const out = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const e of edges) {
    indeg.set(e.child, (indeg.get(e.child) ?? 0) + 1);
    out.get(e.parent)!.push(e.child);
  }
  const ready = nodes.filter((n) => (indeg.get(n) ?? 0) === 0);
  const removed = new Set<string>();
  while (ready.length) {
    const n = ready.shift()!;
    removed.add(n);
    for (const m of out.get(n) ?? []) {
      const d = (indeg.get(m) ?? 0) - 1;
      indeg.set(m, d);
      if (d === 0) ready.push(m);
    }
  }
  return new Set(nodes.filter((n) => !removed.has(n)));
}

let cached: BackupSchema | null = null;

/** Introspect the live catalog and return the full backup schema plan.
 *  Cached for the process lifetime (the schema doesn't change at runtime). */
export async function getBackupSchema(): Promise<BackupSchema> {
  if (cached) return cached;
  const [tables, timestampColumns, primaryKey, fks] = await Promise.all([
    fetchTables(),
    fetchTimestampColumns(),
    fetchPrimaryKeys(),
    fetchForeignKeys(),
  ]);
  const { insertOrder, deferred } = planOrder(tables, fks);
  cached = { tables, insertOrder, deferred, timestampColumns, primaryKey };
  return cached;
}

/** Convert ISO-string timestamp columns back to Date for a row of `table`. */
export function reviveDates(
  table: string,
  row: Record<string, unknown>,
  timestampColumns: Record<string, string[]>,
): Record<string, unknown> {
  const cols = timestampColumns[table];
  if (!cols || cols.length === 0) return row;
  const out: Record<string, unknown> = { ...row };
  for (const c of cols) {
    const v = out[c];
    if (typeof v === "string") out[c] = new Date(v);
  }
  return out;
}
