/**
 * DATA-40 — the one way to write `Diagram.data`.
 *
 * There were thirteen hand-rolled raw UPDATEs of a diagram's contents, and the
 * compare-and-swap that protects the editor's save existed in exactly one of
 * them: the editor's own route. Every other writer read a blob, thought about
 * it, and wrote the whole thing back over whatever had happened in between — so
 * an open editor's next save quietly reverted it, or it quietly reverted the
 * editor. Five of the thirteen also skipped `updatedAt`, so a diagram could
 * change without anything that sorts by modification date noticing.
 *
 * The interesting tests here are the racing ones. A compare-and-swap that is
 * never contended is indistinguishable from no guard at all, so the fake pool
 * below can be told to have somebody else write in between.
 */
import { describe, it, expect } from "vitest";
import {
  updateDiagramData,
  setDiagramData,
  diagramDataSql,
  runDiagramDataSqlInTx,
  DiagramVersionConflict,
  MAX_CAS_RETRIES,
  type SqlRunner,
} from "@/app/lib/diagram/updateDiagramData";
import type { DiagramData } from "@/app/lib/diagram/types";

/**
 * A stand-in for the row, honouring the compare-and-swap for real: an UPDATE
 * with a version predicate affects no rows unless the version still matches.
 */
function fakeRow(initial: { data: unknown; version: number } | null) {
  const state = initial ? { ...initial } : null;
  const sql: string[] = [];
  /** Runs before each UPDATE, to simulate somebody else getting there first. */
  let interfere: (() => void) | null = null;

  const runner: SqlRunner & {
    sql: string[];
    state: typeof state;
    onNextWrite(f: () => void): void;
  } = {
    sql,
    get state() { return state; },
    onNextWrite(f) { interfere = f; },
    async query(text: string, values: unknown[]) {
      sql.push(text);
      if (text.startsWith("SELECT")) {
        return { rowCount: state ? 1 : 0, rows: state ? [{ ...state }] : [] } as never;
      }
      if (interfere) { const f = interfere; interfere = null; f(); }
      if (!state) return { rowCount: 0 } as never;
      const wantsVersion = text.includes("AND version = $3");
      if (wantsVersion && state.version !== values[2]) return { rowCount: 0 } as never;
      state.data = JSON.parse(values[0] as string);
      state.version += 1;
      return { rowCount: 1 } as never;
    },
  };
  // `state` is read through the getter above; expose the live object for asserts.
  Object.defineProperty(runner, "live", { get: () => state });
  return runner as typeof runner & { live: { data: unknown; version: number } | null };
}

const data = (name: string): DiagramData =>
  ({ elements: [{ id: name }], connectors: [] }) as unknown as DiagramData;

describe("T4523 — every write sets the same three things", () => {
  it("sets data, bumps the version and touches updatedAt", () => {
    const { text } = diagramDataSql("d1", data("a"));
    expect(text).toContain('"data" = $1::jsonb');
    expect(text).toContain("version = version + 1");
    expect(text, "five of the thirteen writers were skipping this").toContain('"updatedAt" = NOW()');
  });

  it("adds the version predicate only when one is given", () => {
    expect(diagramDataSql("d1", data("a")).text).not.toContain("AND version =");
    expect(diagramDataSql("d1", data("a"), 7).text).toContain("AND version = $3");
    expect(diagramDataSql("d1", data("a"), 7).values[2]).toBe(7);
  });

  it("serialises the blob once, as a parameter", () => {
    // Never interpolated: a diagram's label can contain anything at all.
    const stmt = diagramDataSql("d1", data("a"));
    expect(typeof stmt.values[0]).toBe("string");
    expect(stmt.values[1]).toBe("d1");
    expect(stmt.text).not.toContain("elements");
  });

  it("spreads its parameters for a Prisma transaction client", async () => {
    // pgPool takes an array, tx.$executeRawUnsafe takes them variadically — the
    // difference that would otherwise be rediscovered at every call site.
    const seen: unknown[] = [];
    await runDiagramDataSqlInTx(
      { $executeRawUnsafe: async (text: string, ...v: unknown[]) => { seen.push(text, ...v); return 1; } },
      diagramDataSql("d1", data("a"), 3),
    );
    expect(seen).toHaveLength(4);
    expect(seen[3]).toBe(3);
  });
});

describe("T4524 — a read-modify-write survives somebody else writing first", () => {
  it("applies the change and bumps the version", async () => {
    const r = fakeRow({ data: data("before"), version: 4 });
    const out = await updateDiagramData("d1", () => data("after"), { runner: r });
    expect(out).toEqual({ changed: true, retries: 0 });
    expect(r.live!.version).toBe(5);
    expect(r.live!.data).toEqual(data("after"));
  });

  it("guards the write with the version it read", async () => {
    const r = fakeRow({ data: data("before"), version: 4 });
    await updateDiagramData("d1", () => data("after"), { runner: r });
    const update = r.sql.find((s) => s.startsWith("UPDATE"))!;
    expect(update, "an unguarded write is the whole defect").toContain("AND version = $3");
  });

  it("reapplies against the NEW data rather than clobbering it", async () => {
    // Somebody else writes between the read and the write. The mutation must be
    // applied to what is there now — reapplying the copy we started from is the
    // bug, not the fix.
    const r = fakeRow({ data: data("original"), version: 1 });
    r.onNextWrite(() => { r.live!.data = data("theirs"); r.live!.version = 2; });

    const seen: unknown[] = [];
    const out = await updateDiagramData("d1", (cur) => {
      seen.push(cur);
      return { ...cur, elements: [...(cur.elements ?? []), { id: "mine" }] } as DiagramData;
    }, { runner: r });

    expect(out.changed).toBe(true);
    expect(out.retries, "it lost once and tried again").toBe(1);
    expect(seen[0]).toEqual(data("original"));
    expect(seen[1], "the second attempt saw THEIR data").toEqual(data("theirs"));
    expect(r.live!.data).toEqual({ ...data("theirs"), elements: [{ id: "theirs" }, { id: "mine" }] });
  });

  it("does nothing, and says so, when the mutation declines", async () => {
    const r = fakeRow({ data: data("before"), version: 4 });
    const out = await updateDiagramData("d1", () => null, { runner: r });
    expect(out).toEqual({ changed: false, retries: 0 });
    expect(r.sql.some((s) => s.startsWith("UPDATE")), "no write at all").toBe(false);
    expect(r.live!.version).toBe(4);
  });

  it("does nothing when the diagram is gone", async () => {
    const r = fakeRow(null);
    expect(await updateDiagramData("gone", () => data("x"), { runner: r }))
      .toEqual({ changed: false, retries: 0 });
  });

  it("gives up rather than looping forever under constant contention", async () => {
    const r = fakeRow({ data: data("a"), version: 1 });
    const keepLosing = () => {
      r.live!.version += 1;
      r.onNextWrite(keepLosing);
    };
    r.onNextWrite(keepLosing);
    await expect(updateDiagramData("d1", () => data("mine"), { runner: r }))
      .rejects.toThrow(/giving up rather than looping/);
    expect(MAX_CAS_RETRIES).toBeGreaterThan(0);
  });
});

describe("T4525 — a caller that names a version is told about a conflict", () => {
  it("writes when the version still matches", async () => {
    const r = fakeRow({ data: data("a"), version: 9 });
    const out = await updateDiagramData("d1", () => data("b"), { runner: r, expectedVersion: 9 });
    expect(out.changed).toBe(true);
    expect(r.live!.version).toBe(10);
  });

  it("throws rather than silently reapplying when it does not", async () => {
    // The difference that matters: a caller who has shown this data to a person
    // must not quietly write on top of somebody else's change.
    const r = fakeRow({ data: data("a"), version: 11 });
    await expect(updateDiagramData("d1", () => data("b"), { runner: r, expectedVersion: 9 }))
      .rejects.toBeInstanceOf(DiagramVersionConflict);
    expect(r.live!.version, "and nothing was written").toBe(11);
  });

  it("carries the versions on the error, so a route can answer 409 with them", async () => {
    const r = fakeRow({ data: data("a"), version: 11 });
    const err = await updateDiagramData("d1", () => data("b"), { runner: r, expectedVersion: 9 })
      .then(() => null, (e: unknown) => e as DiagramVersionConflict);
    expect(err, "it must reject, not resolve").toBeInstanceOf(DiagramVersionConflict);
    expect(err!.diagramId).toBe("d1");
    expect(err!.expectedVersion).toBe(9);
    expect(err!.actualVersion).toBe(11);
  });

  it("treats a vanished diagram as a conflict when a version was expected", async () => {
    const r = fakeRow(null);
    await expect(updateDiagramData("gone", () => data("b"), { runner: r, expectedVersion: 1 }))
      .rejects.toBeInstanceOf(DiagramVersionConflict);
  });
});

describe("T4526 — writing a blob the caller already has", () => {
  it("writes it and bumps the version", async () => {
    const r = fakeRow({ data: data("a"), version: 2 });
    expect(await setDiagramData("d1", data("b"), { runner: r })).toEqual({ changed: true, retries: 0 });
    expect(r.live!.version).toBe(3);
  });

  it("is a compare-and-swap when a version is given", async () => {
    const r = fakeRow({ data: data("a"), version: 2 });
    await expect(setDiagramData("d1", data("b"), { runner: r, expectedVersion: 1 }))
      .rejects.toBeInstanceOf(DiagramVersionConflict);
    expect(r.live!.version).toBe(2);
  });

  it("reports rather than throws when there is no version to compare", async () => {
    // An unconditional write that hits nothing is a missing row, not a conflict.
    const r = fakeRow(null);
    expect(await setDiagramData("gone", data("b"), { runner: r })).toEqual({ changed: false, retries: 0 });
  });
});
