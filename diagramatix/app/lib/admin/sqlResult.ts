/**
 * What the Database tile should report for a query — including a script.
 *
 * THE DEFECT THIS EXISTS FOR. `pgPool.query(sql)` with no params uses the
 * simple query protocol, which accepts several statements in one string. When
 * it does, node-postgres returns an **array** of results and `raw.rows` is
 * `undefined`. The route read `raw.rows ?? []` and `raw.rowCount ?? 0`, so a
 * seed file pasted in whole reported:
 *
 *     undefined completed — 0 row(s) affected
 *
 * Every statement had run and committed. Nothing said so, and nothing
 * distinguished that from a script that had done nothing at all — which is the
 * worst possible answer for the one tool used to change production data.
 *
 * Measured 2026-09-20 against the real driver:
 *     "SELECT 1"           → isArray false, rows [{a:1}]
 *     "SELECT 1; SELECT 2" → isArray true,  rows undefined, length 2
 *
 * Pure, so the distinction is tested rather than eyeballed.
 */

/** The shape node-postgres hands back, narrowed to what is read here. */
export interface RawResultLike {
  rows?: unknown[];
  rowCount?: number | null;
  command?: string;
  fields?: { name: string; dataTypeID: number }[];
}

export interface StatementSummary {
  command: string;
  rowCount: number;
}

export interface FlattenedResult {
  rows: unknown[];
  rowCount: number;
  fields: { name: string; dataTypeID: number }[];
  command?: string;
  /** Present only when more than one statement ran. */
  statements?: StatementSummary[];
}

/**
 * Flatten one result, or a script's worth of them.
 *
 * The statement SHOWN is the last one that returned rows, so a script ending
 * in a verification SELECT displays its own answer — which is why the seed
 * files end that way. Falling back to the final statement means a script of
 * pure writes still reports its command rather than nothing.
 */
export function flattenQueryResult(raw: RawResultLike | RawResultLike[]): FlattenedResult {
  const list = Array.isArray(raw) ? raw : [raw];
  const withRows = [...list].reverse().find((r) => (r.rows?.length ?? 0) > 0);
  const shown = withRows ?? list[list.length - 1];

  const out: FlattenedResult = {
    rows: shown?.rows ?? [],
    rowCount: shown?.rowCount ?? 0,
    fields: (shown?.fields ?? []).map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
    command: shown?.command,
  };
  if (list.length > 1) {
    out.statements = list.map((r) => ({
      command: r.command ?? "?",
      rowCount: r.rowCount ?? 0,
    }));
  }
  return out;
}
