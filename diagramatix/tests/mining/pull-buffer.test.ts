/**
 * Phase 0.4 — a test floor under `pull.ts`'s buffer maths.
 *
 * `appendRowsToSource` is the only place a live source's history is kept, and it
 * is shared by the webhook ingest and both pull connectors. Everything it can
 * get wrong is silent: a column misaligned by one, a cap applied at the wrong
 * end, a file whose columns arrive in a different order than last time. The run
 * still refreshes, still shows cases, and is wrong.
 *
 * The DB is mocked; what is under test is the alignment and the cap.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const writes: { sql: string; values: unknown[] }[] = [];
const updates: Record<string, unknown>[] = [];

vi.mock("@/app/lib/db", () => ({
  pgPool: { query: async (sql: string, values: unknown[]) => { writes.push({ sql, values }); return { rows: [] }; } },
  prisma: {
    miningSource: {
      update: async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return data; },
      findUnique: async () => null,
    },
  },
}));

const { appendRowsToSource } = await import("@/app/lib/mining/pull");

/** The buffer as persisted by the last write. */
const persisted = () => JSON.parse(writes[writes.length - 1].values[0] as string) as string[][];

const source = (headerFields: string[], buffer: string[][] = [], maxEvents = 100000) =>
  ({ id: "src-1", maxEvents, headerFields, buffer, config: {}, cursor: {} });

beforeEach(() => { writes.length = 0; updates.length = 0; });

describe("Phase 0.4 — realigning incoming rows to the source's own columns", () => {
  it("T3725 - a file whose columns are in a different order is realigned, not appended raw", () => {
    // Yesterday's export had case,act,ts; today's has ts,case,act. Appending as
    // given would put timestamps in the case-id column for every new row, and
    // the source would keep refreshing without complaint.
    const s = source(["case", "act", "ts"]);
    return appendRowsToSource(s, ["ts", "case", "act"], [["2026-01-01T00:00:00Z", "c1", "Receive"]]).then(() => {
      expect(persisted()).toEqual([["c1", "Receive", "2026-01-01T00:00:00Z"]]);
    });
  });

  it("T3726 - a column the source does not know about is dropped", async () => {
    await appendRowsToSource(source(["case", "act"]), ["case", "act", "extra"], [["c1", "Receive", "ignore me"]]);
    expect(persisted()).toEqual([["c1", "Receive"]]);
  });

  it("T3727 - a column the file is missing becomes empty, not undefined", async () => {
    // An `undefined` here reaches the buffer as `null` through JSON and then
    // fails a `.trim()` somewhere downstream.
    await appendRowsToSource(source(["case", "act", "who"]), ["case", "act"], [["c1", "Receive"]]);
    expect(persisted()).toEqual([["c1", "Receive", ""]]);
  });

  it("T3728 - values are stringified, so a numeric cell does not arrive as a number", async () => {
    await appendRowsToSource(source(["case", "act"]), ["case", "act"], [[42 as unknown as string, "Receive"]]);
    expect(persisted()).toEqual([["42", "Receive"]]);
  });
});

describe("Phase 0.4 — the rolling cap", () => {
  it("T3729 - the buffer accumulates onto what is already there", async () => {
    await appendRowsToSource(source(["case"], [["old"]]), ["case"], [["new"]]);
    expect(persisted()).toEqual([["old"], ["new"]]);
  });

  it("T3730 - over the cap it drops the OLDEST, keeping the most recent window", async () => {
    // Slicing from the wrong end would freeze the run at its first N events and
    // quietly stop it being live at all.
    const existing = [["e1"], ["e2"], ["e3"]];
    await appendRowsToSource(source(["case"], existing, 4), ["case"], [["e4"], ["e5"]]);
    expect(persisted()).toEqual([["e2"], ["e3"], ["e4"], ["e5"]]);
  });

  it("T3731 - a source with no cap set gets the default, not a cap of zero", async () => {
    // `maxEvents || 100000` — a 0 in the column must not empty the buffer.
    await appendRowsToSource(source(["case"], [], 0), ["case"], [["e1"]]);
    expect(persisted()).toEqual([["e1"]]);
  });

  it("T3732 - the counters record what the buffer HOLDS, and the count returned is what ARRIVED", async () => {
    const added = await appendRowsToSource(source(["case"], [["old"]], 2), ["case"], [["a"], ["b"]]);
    expect(added).toBe(2);                       // two rows arrived
    expect(updates[0].eventCount).toBe(2);       // the buffer holds two after the cap
    expect(updates[0].lastIngestAt).toBeInstanceOf(Date);
  });

  it("T3733 - an empty delivery writes nothing at all", async () => {
    // A poll that found no new files must not move lastIngestAt: staleness is
    // the cheapest alarm the plan has, and this is the field it will read.
    expect(await appendRowsToSource(source(["case"], [["old"]]), ["case"], [])).toBe(0);
    expect(writes).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("T3734 - a source with no headerFields yet produces empty rows rather than throwing", async () => {
    await appendRowsToSource(source([]), ["case"], [["c1"]]);
    expect(persisted()).toEqual([[]]);
  });
});
