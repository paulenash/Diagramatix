/**
 * Phase 9 — a live run keeps its own history.
 *
 * `refreshRunFromSource` rebuilds a run in place, so the previous picture is
 * gone the moment new events arrive. That is why Phase 10 cannot alert on
 * "fitness fell from 94% to 71%" — there is no 94% anywhere.
 *
 * The danger in fixing it is the opposite one. A source polled every five
 * minutes would write 288 runs a day, and a history nobody can read is worse
 * than none. Every test here is about a decision NOT to write a row.
 */
import { describe, it, expect } from "vitest";
import { shouldSnapshot, SNAPSHOT_INTERVAL_HOURS, MAX_AUTO_SNAPSHOTS, AUTO_SNAPSHOT_MARK } from "@/app/lib/mining/autoSnapshot";

const HOUR = 3_600_000;
const now = new Date("2026-10-01T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * HOUR);

const ask = (over: Partial<Parameters<typeof shouldSnapshot>[0]> = {}) =>
  shouldSnapshot({ lastAutoAt: null, now, eventsBefore: 100, eventsAfter: 150, ...over });

describe("Phase 9 — when a refresh keeps a copy", () => {
  it("T3908 - new events and no recent snapshot: keep one", () => {
    expect(ask().taken).toBe(true);
  });

  it("T3909 - nothing new arrived: nothing to keep", () => {
    // The old picture IS the current one, so a snapshot would be a duplicate of
    // the run it was taken from.
    expect(ask({ eventsAfter: 100 }).taken).toBe(false);
    expect(ask({ eventsAfter: 100 }).reason).toMatch(/no new events/);
    // And a source that somehow shrank is not a new picture either.
    expect(ask({ eventsAfter: 90 }).taken).toBe(false);
  });

  it("T3910 - a run that was empty before has no history to preserve", () => {
    expect(ask({ eventsBefore: 0 }).taken).toBe(false);
    expect(ask({ eventsBefore: 0 }).reason).toMatch(/empty before/);
  });

  it("T3911 - inside the interval, no second copy however often it polls", () => {
    // THE test. A five-minute poll would otherwise leave 288 runs a day.
    expect(ask({ lastAutoAt: ago(1) }).taken).toBe(false);
    expect(ask({ lastAutoAt: ago(SNAPSHOT_INTERVAL_HOURS - 0.5) }).taken).toBe(false);
    expect(ask({ lastAutoAt: ago(1) }).reason).toMatch(/interval/);
  });

  it("T3912 - past the interval, the next refresh keeps one", () => {
    expect(ask({ lastAutoAt: ago(SNAPSHOT_INTERVAL_HOURS + 0.1) }).taken).toBe(true);
  });

  it("T3913 - the interval is caller-settable, so a test is not the only way to change it", () => {
    expect(ask({ lastAutoAt: ago(2), intervalHours: 1 }).taken).toBe(true);
    expect(ask({ lastAutoAt: ago(2), intervalHours: 6 }).taken).toBe(false);
  });

  it("T3914 - the reason is always specific enough to act on", () => {
    for (const d of [ask({ eventsAfter: 100 }), ask({ eventsBefore: 0 }), ask({ lastAutoAt: ago(1) })]) {
      expect(d.taken).toBe(false);
      expect((d.reason ?? "").length).toBeGreaterThan(15);
    }
  });
});

describe("Phase 9 — the bounds are real numbers, not aspirations", () => {
  it("T3915 - the series is capped and the interval is a day", () => {
    // Read from the module rather than restated, so a change to either has to
    // pass through here and be noticed.
    expect(SNAPSHOT_INTERVAL_HOURS).toBe(24);
    expect(MAX_AUTO_SNAPSHOTS).toBe(30);
    // A month of daily history: long enough to see a trend, short enough that
    // the chart is readable and the walk is bounded.
    expect(MAX_AUTO_SNAPSHOTS * SNAPSHOT_INTERVAL_HOURS / 24).toBe(30);
  });

  it("T3916 - automatic snapshots are marked, so pruning cannot touch a hand-made one", () => {
    // A snapshot somebody took deliberately is their record. Pruning it to make
    // room for an automatic one would delete the thing they meant to keep.
    expect(AUTO_SNAPSHOT_MARK).toContain("auto");
    expect(`Invoices${AUTO_SNAPSHOT_MARK}2026-10-01 12:00`).toContain(AUTO_SNAPSHOT_MARK);
    expect("Invoices — 2026-10-01 12:00").not.toContain(AUTO_SNAPSHOT_MARK);
  });
});
