/**
 * The one place a `ProcessMiningRun`'s JSON columns are written.
 *
 * Prisma 7 omits JSON fields from a model's update input, so every one of these
 * writes has to be raw SQL. Before this module there were eleven of them, each
 * spelling its own column names inside a string literal, each responsible for
 * lining up its own `$n` placeholders with its own argument array, and each
 * `JSON.stringify`-ing by hand. Nothing checked any of it: a column renamed, a
 * placeholder off by one, or a `null` written where a value was meant would all
 * compile, and most would fail only at runtime on a path nothing covers.
 *
 * A patch object cannot get any of that wrong. The column list is the type, so
 * a misspelling is a compile error; the SQL is generated from the keys actually
 * present, so a column omitted from a patch is genuinely left alone rather than
 * silently overwritten with `null` — which matters, because `kpiConfig` must
 * survive a live refresh and `analytics` must survive a snapshot restore.
 *
 * `undefined` means "do not touch this column"; `null` means "write SQL NULL".
 * That distinction is the whole point and is easy to lose by hand.
 */

import { pgPool } from "@/app/lib/db";

/** Columns this helper may write, and how each is passed to Postgres. */
const RUN_COLUMNS = {
  mapping: "json",
  stats: "json",
  variants: "json",
  performance: "json",
  analytics: "json",
  governance: "json",
  conformance: "json",
  kpiConfig: "json",
  /** Not JSON, but written ATOMICALLY with `conformance` — a run whose result
   *  and reference disagree is worse than either being stale. */
  referenceSmId: "text",
} as const;

type RunColumn = keyof typeof RUN_COLUMNS;

export type RunPatch = {
  [K in RunColumn]?: K extends "referenceSmId" ? string | null : unknown;
};

/** Quote a column exactly as Postgres needs it (camelCase must be quoted). */
const quoted = (c: RunColumn) => `"${c}"`;

/**
 * Build the UPDATE for a patch, or null when the patch touches nothing.
 *
 * Exposed separately from {@link updateRunJson} so a caller inside a Prisma
 * transaction can run the same statement on the transaction client — an adopt
 * that half-committed would leave a run with scalars but no log.
 */
export function runPatchSql(runId: string, patch: RunPatch): { text: string; values: unknown[] } | null {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of Object.keys(RUN_COLUMNS) as RunColumn[]) {
    const v = patch[key];
    if (v === undefined) continue;                       // absent ≠ null
    values.push(RUN_COLUMNS[key] === "json" ? (v === null ? null : JSON.stringify(v)) : v);
    sets.push(`${quoted(key)} = $${values.length}${RUN_COLUMNS[key] === "json" ? "::jsonb" : ""}`);
  }
  if (sets.length === 0) return null;
  values.push(runId);
  return {
    text: `UPDATE "ProcessMiningRun" SET ${sets.join(", ")}, "updatedAt" = NOW() WHERE id = $${values.length}`,
    values,
  };
}

/** Write a run's JSON columns. Columns absent from `patch` are left untouched. */
export async function updateRunJson(runId: string, patch: RunPatch): Promise<void> {
  const sql = runPatchSql(runId, patch);
  if (!sql) return;
  await pgPool.query(sql.text, sql.values);
}
