/**
 * The one way to write `Diagram.data` (DATA-40).
 *
 * Prisma 7 omits JSON fields from model update inputs, so every server-side
 * write of a diagram's contents is hand-rolled SQL. There were thirteen of them,
 * each deciding for itself what to set and whether to guard anything, and the
 * compare-and-swap that protects the editor's save existed in exactly one — the
 * editor's own route. So every other writer was last-write-wins: it read a blob,
 * thought about it, and wrote the whole thing back over whatever had happened in
 * between. An open editor's next save then quietly reverted it, or it quietly
 * reverted the editor.
 *
 * WHAT THIS GIVES THEM
 *
 *  - `updateDiagramData(id, mutate)` — read, apply, write, with a compare-and-swap
 *    on `version` and a bounded retry. If someone else wrote first the write
 *    affects no rows, so it re-reads and reapplies rather than clobbering. That
 *    is what makes a read-modify-write safe without holding a lock.
 *  - `setDiagramData(id, data, { expectedVersion })` — for a caller that already
 *    has the blob. With an expected version it is a true compare-and-swap and
 *    reports the conflict; without one it is an honest unconditional write, and
 *    says so at the call site rather than by omission.
 *  - `diagramDataSql(...)` — the statement itself, for a caller inside a
 *    transaction. This is the `runStore.runPatchSql` pattern, and it exists
 *    because of a hard constraint: `pgPool` is a SEPARATE pg.Pool from the
 *    Prisma adapter, so a raw write CANNOT join a `prisma.$transaction` (audit
 *    DATA-24). A transaction-bound caller must run the statement on its own
 *    client, and this makes sure it runs the same statement as everyone else.
 *
 * WHAT EVERY WRITE NOW SETS, which was the other half of the mess: `data`,
 * `version = version + 1`, and `updatedAt`. Five of the thirteen were silently
 * skipping `updatedAt`, so a diagram could change without anything that sorts or
 * displays by modification date noticing.
 */
import { pgPool } from "../db";
import type { DiagramData } from "./types";

/** Anything that can run a parameterised statement: `pgPool`, or a `PoolClient`. */
export interface SqlRunner {
  query(text: string, values: unknown[]): Promise<{ rowCount: number | null }>;
}

/** A Prisma interactive-transaction client, which takes its params variadically. */
export interface PrismaTxRunner {
  $executeRawUnsafe(text: string, ...values: unknown[]): Promise<number>;
}

/** The statement, ready to run anywhere. */
export interface DiagramDataStatement {
  text: string;
  values: unknown[];
}

/** How many times a contended read-modify-write is retried before giving up. */
export const MAX_CAS_RETRIES = 5;

/** Thrown when a compare-and-swap loses and the caller asked for a specific version. */
export class DiagramVersionConflict extends Error {
  constructor(
    readonly diagramId: string,
    readonly expectedVersion: number,
    readonly actualVersion: number | null,
  ) {
    super(
      `Diagram ${diagramId} changed underneath this write: expected version ${expectedVersion}, found ${actualVersion ?? "no row"}`,
    );
    this.name = "DiagramVersionConflict";
  }
}

/**
 * The canonical UPDATE. One spelling of the column, one set of fields, in one
 * place — the thirteen call sites disagreed about the quoting AND about whether
 * `updatedAt` was worth setting.
 *
 * With `expectedVersion` it is a compare-and-swap and affects no rows when it
 * loses. Without one it is unconditional, which is correct for a caller that has
 * just read the row inside its own transaction.
 */
export function diagramDataSql(
  diagramId: string,
  data: unknown,
  expectedVersion?: number,
): DiagramDataStatement {
  const json = JSON.stringify(data);
  if (expectedVersion === undefined) {
    return {
      text: 'UPDATE "Diagram" SET "data" = $1::jsonb, version = version + 1, "updatedAt" = NOW() WHERE id = $2',
      values: [json, diagramId],
    };
  }
  return {
    text: 'UPDATE "Diagram" SET "data" = $1::jsonb, version = version + 1, "updatedAt" = NOW() WHERE id = $2 AND version = $3',
    values: [json, diagramId, expectedVersion],
  };
}

/** Run the statement on a Prisma transaction client, which wants its params spread. */
export function runDiagramDataSqlInTx(
  tx: PrismaTxRunner,
  stmt: DiagramDataStatement,
): Promise<number> {
  return tx.$executeRawUnsafe(stmt.text, ...stmt.values);
}

interface ReadRow { data: unknown; version: number }

async function readDiagram(runner: SqlRunner, diagramId: string): Promise<ReadRow | null> {
  const res = (await runner.query(
    'SELECT "data", version FROM "Diagram" WHERE id = $1',
    [diagramId],
  )) as unknown as { rows?: ReadRow[] };
  const row = res.rows?.[0];
  return row ?? null;
}

export interface UpdateOptions {
  /** Where to run. Defaults to the shared raw pool. */
  runner?: SqlRunner;
  /**
   * Fail rather than retry if the row is not at this version. For a caller that
   * has already shown the user this data and must not silently reapply on top of
   * someone else's change.
   */
  expectedVersion?: number;
}

export interface UpdateResult {
  /** False when `mutate` declined to change anything. */
  changed: boolean;
  /** How many times the write lost the race and was reapplied. */
  retries: number;
}

/**
 * Read the diagram, apply `mutate`, write it back — safely.
 *
 * `mutate` is called with the CURRENT data and returns the new data, or null to
 * mean "nothing to do here". It may be called more than once: if the row changes
 * underneath, the write affects no rows and the whole thing is retried against
 * the new data. So `mutate` must be a pure function of what it is given, and
 * must not depend on a value read earlier outside this call — that is exactly
 * the bug this replaces.
 */
export async function updateDiagramData(
  diagramId: string,
  mutate: (current: DiagramData) => DiagramData | null,
  opts: UpdateOptions = {},
): Promise<UpdateResult> {
  const runner = opts.runner ?? (pgPool as unknown as SqlRunner);

  for (let attempt = 0; attempt <= MAX_CAS_RETRIES; attempt++) {
    const row = await readDiagram(runner, diagramId);
    if (!row) {
      if (opts.expectedVersion !== undefined) {
        throw new DiagramVersionConflict(diagramId, opts.expectedVersion, null);
      }
      return { changed: false, retries: attempt };
    }
    if (opts.expectedVersion !== undefined && row.version !== opts.expectedVersion) {
      throw new DiagramVersionConflict(diagramId, opts.expectedVersion, row.version);
    }

    const next = mutate((row.data ?? {}) as DiagramData);
    if (next === null) return { changed: false, retries: attempt };

    const stmt = diagramDataSql(diagramId, next, row.version);
    const res = await runner.query(stmt.text, stmt.values);
    if ((res.rowCount ?? 0) > 0) return { changed: true, retries: attempt };

    // Lost the race. The row moved, so the mutation has to be applied to what is
    // there now — never to the copy we started from.
    if (opts.expectedVersion !== undefined) {
      const now = await readDiagram(runner, diagramId);
      throw new DiagramVersionConflict(diagramId, opts.expectedVersion, now?.version ?? null);
    }
  }

  throw new Error(
    `Diagram ${diagramId} was changed by someone else ${MAX_CAS_RETRIES + 1} times running; giving up rather than looping`,
  );
}

/**
 * Write a blob the caller already has.
 *
 * With `expectedVersion` this is a compare-and-swap and throws on conflict.
 * Without one it is unconditional — appropriate when the caller has just read
 * the row inside its own transaction, and a lie anywhere else.
 */
export async function setDiagramData(
  diagramId: string,
  data: DiagramData,
  opts: UpdateOptions = {},
): Promise<UpdateResult> {
  const runner = opts.runner ?? (pgPool as unknown as SqlRunner);
  const stmt = diagramDataSql(diagramId, data, opts.expectedVersion);
  const res = await runner.query(stmt.text, stmt.values);
  if ((res.rowCount ?? 0) > 0) return { changed: true, retries: 0 };
  if (opts.expectedVersion !== undefined) {
    const now = await readDiagram(runner, diagramId);
    throw new DiagramVersionConflict(diagramId, opts.expectedVersion, now?.version ?? null);
  }
  return { changed: false, retries: 0 };
}
