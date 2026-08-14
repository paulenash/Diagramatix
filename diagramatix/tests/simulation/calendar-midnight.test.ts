/**
 * Working-calendar windows that cross midnight.
 *
 * A night shift entered as 22:00–06:00 used to be dropped outright, leaving the
 * team unstaffed for that whole day with no warning — the sort of silent gap
 * that shows up as a wrong answer rather than an error. It now opens across the
 * boundary, and the week is cyclic so Sunday's overflow lands on Monday.
 */
import { describe, it, expect } from "vitest";
import { intervalsToClock, isOpenAt, nextOpenAt, crossesMidnight } from "@/app/lib/simulation/calendar";
import type { WorkCalendar } from "@/app/lib/simulation/types";

const MIN_PER_DAY = 1440;
/** Clock time (minutes from Monday 00:00) for a weekday + HH:MM. */
const at = (day: number, hh: number, mm = 0) => day * MIN_PER_DAY + hh * 60 + mm;

const cal = (intervals: WorkCalendar["intervals"]): WorkCalendar => ({ intervals });

describe("crossesMidnight", () => {
  it("is true only when the end is earlier than the start", () => {
    expect(crossesMidnight({ start: "22:00", end: "06:00" })).toBe(true);
    expect(crossesMidnight({ start: "09:00", end: "17:00" })).toBe(false);
    expect(crossesMidnight({ start: "00:00", end: "24:00" })).toBe(false);
    expect(crossesMidnight({ start: "09:00", end: "09:00" })).toBe(false);
  });
});

describe("a night shift that crosses midnight", () => {
  const night = cal([{ day: 0, start: "22:00", end: "06:00" }]); // Monday 22:00 → Tuesday 06:00

  it("produces two windows instead of being dropped", () => {
    const w = intervalsToClock(night, "minute");
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ s: at(0, 22), e: at(1, 0) });  // Mon 22:00 → Tue 00:00
    expect(w[1]).toMatchObject({ s: at(1, 0), e: at(1, 6) });   // Tue 00:00 → Tue 06:00
  });

  it("is open either side of the boundary", () => {
    expect(isOpenAt(at(0, 23), night, "minute")).toBe(true);   // Mon 23:00
    expect(isOpenAt(at(1, 2), night, "minute")).toBe(true);    // Tue 02:00
    expect(isOpenAt(at(1, 5, 59), night, "minute")).toBe(true);
  });

  it("is closed outside it", () => {
    expect(isOpenAt(at(0, 21, 59), night, "minute")).toBe(false);
    expect(isOpenAt(at(1, 6), night, "minute")).toBe(false);    // end is exclusive
    expect(isOpenAt(at(2, 2), night, "minute")).toBe(false);    // Wednesday
  });

  it("defers work that arrives in the closed gap to the next opening", () => {
    // Tuesday lunchtime is outside the shift, and this calendar opens only on
    // Monday nights — so the next opening is a week away, at Monday 22:00.
    expect(nextOpenAt(at(1, 12), night, "minute")).toBe(at(7, 22));
  });
});

describe("Sunday's overflow wraps to Monday", () => {
  const sundayNight = cal([{ day: 6, start: "23:00", end: "03:00" }]);

  it("splits across the week boundary rather than off the end of it", () => {
    const w = intervalsToClock(sundayNight, "minute");
    expect(w).toHaveLength(2);
    // Sorted by start: the Monday head comes first, the Sunday tail second.
    expect(w[0]).toMatchObject({ s: at(0, 0), e: at(0, 3) });
    expect(w[1]).toMatchObject({ s: at(6, 23), e: at(7, 0) });
  });

  it("is open on both sides of the week boundary", () => {
    expect(isOpenAt(at(6, 23, 30), sundayNight, "minute")).toBe(true);  // Sunday night
    expect(isOpenAt(at(0, 1), sundayNight, "minute")).toBe(true);       // Monday small hours
    expect(isOpenAt(at(0, 4), sundayNight, "minute")).toBe(false);
  });
});

describe("ordinary windows are unaffected", () => {
  const office = cal([0, 1, 2, 3, 4].map((day) => ({ day, start: "09:00", end: "17:00" })));

  it("still yields one window per weekday", () => {
    expect(intervalsToClock(office, "minute")).toHaveLength(5);
    expect(isOpenAt(at(0, 12), office, "minute")).toBe(true);
    expect(isOpenAt(at(0, 18), office, "minute")).toBe(false);
    expect(isOpenAt(at(5, 12), office, "minute")).toBe(false); // Saturday
  });

  it("treats an end of 24:00 as the end of the day, not a wrap", () => {
    const late = cal([{ day: 0, start: "18:00", end: "24:00" }]);
    const w = intervalsToClock(late, "minute");
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ s: at(0, 18), e: at(1, 0) });
  });

  it("still drops a zero-length window", () => {
    expect(intervalsToClock(cal([{ day: 0, start: "09:00", end: "09:00" }]), "minute")).toHaveLength(0);
  });

  it("still drops a window on a day outside the week", () => {
    expect(intervalsToClock(cal([{ day: 9, start: "09:00", end: "17:00" }]), "minute")).toHaveLength(0);
  });

  it("carries the rate multiplier onto both halves of a wrap", () => {
    const w = intervalsToClock(cal([{ day: 0, start: "22:00", end: "06:00", rate: 0.3 }]), "minute");
    expect(w.map((x) => x.rate)).toEqual([0.3, 0.3]);
  });
});
