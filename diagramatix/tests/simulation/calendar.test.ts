/**
 * Pure calendar-maths guards. These helpers convert a weekly WorkCalendar into
 * sim-clock times and are the correctness-critical core of the working-hours
 * feature (t=0 ≙ Monday 00:00, pattern repeats every 7 days), so they get the
 * heaviest coverage: unit conversion, week wrap, multi-window (lunch) gaps,
 * 24/7, empty (always-open) fallback, and per-window arrival rates.
 */
import { describe, it, expect } from "vitest";
import {
  isOpenAt, nextOpenAt, rateAt, boundariesIn, weekLengthClock, calendarWarnings, closedReason,
  serializeWorkCalendar, parseWorkCalendar, simClockLabel,
} from "@/app/lib/simulation/calendar";
import type { WorkCalendar } from "@/app/lib/simulation/types";

// Mon–Fri 09:00–17:00 (single window per weekday).
const NINE_TO_FIVE: WorkCalendar = {
  intervals: [0, 1, 2, 3, 4].map((day) => ({ day, start: "09:00", end: "17:00" })),
};
// Mon 09:00–12:00 and 13:00–17:00 (a lunch gap) — just Monday for clarity.
const WITH_LUNCH: WorkCalendar = {
  intervals: [
    { day: 0, start: "09:00", end: "12:00" },
    { day: 0, start: "13:00", end: "17:00" },
  ],
};
const ALWAYS: WorkCalendar = { intervals: [] };

// Helpers to express clock times in minutes (the default clock unit).
const MIN = (day: number, h: number, m = 0) => day * 24 * 60 + h * 60 + m;

describe("calendar helpers", () => {
  it("T0554 — week length matches the clock unit", () => {
    expect(weekLengthClock("minute")).toBe(7 * 24 * 60);
    expect(weekLengthClock("hour")).toBe(7 * 24);
    expect(weekLengthClock("second")).toBe(7 * 86400);
    expect(weekLengthClock("day")).toBe(7);
  });

  it("T0555 — isOpenAt reflects a 9–5 window in minute units (t=0 ≙ Mon 00:00)", () => {
    expect(isOpenAt(MIN(0, 8, 59), NINE_TO_FIVE, "minute")).toBe(false); // before open
    expect(isOpenAt(MIN(0, 9, 0), NINE_TO_FIVE, "minute")).toBe(true);   // exactly open
    expect(isOpenAt(MIN(0, 16, 59), NINE_TO_FIVE, "minute")).toBe(true);
    expect(isOpenAt(MIN(0, 17, 0), NINE_TO_FIVE, "minute")).toBe(false);  // end exclusive
    expect(isOpenAt(MIN(0, 2, 0), NINE_TO_FIVE, "minute")).toBe(false);   // night
  });

  it("T0556 — weekend + week wrap are closed / reopen next Monday", () => {
    expect(isOpenAt(MIN(5, 10, 0), NINE_TO_FIVE, "minute")).toBe(false); // Saturday
    expect(isOpenAt(MIN(6, 10, 0), NINE_TO_FIVE, "minute")).toBe(false); // Sunday
    // 7 days on = same as Monday (pattern repeats).
    expect(isOpenAt(MIN(7, 10, 0), NINE_TO_FIVE, "minute")).toBe(true);
  });

  it("T0557 — hour units resolve the same windows", () => {
    expect(isOpenAt(9, NINE_TO_FIVE, "hour")).toBe(true);   // Mon 09:00
    expect(isOpenAt(17, NINE_TO_FIVE, "hour")).toBe(false); // Mon 17:00
    expect(isOpenAt(24 + 9, NINE_TO_FIVE, "hour")).toBe(true); // Tue 09:00
  });

  it("T0558 — a lunch gap reads as closed between the two windows", () => {
    expect(isOpenAt(MIN(0, 11, 30), WITH_LUNCH, "minute")).toBe(true);
    expect(isOpenAt(MIN(0, 12, 30), WITH_LUNCH, "minute")).toBe(false); // lunch
    expect(isOpenAt(MIN(0, 14, 0), WITH_LUNCH, "minute")).toBe(true);
  });

  it("T0559 — nextOpenAt returns t when already open, else the next boundary", () => {
    // Open now → unchanged.
    expect(nextOpenAt(MIN(0, 10, 0), NINE_TO_FIVE, "minute")).toBe(MIN(0, 10, 0));
    // Before open Monday → jumps to 09:00.
    expect(nextOpenAt(MIN(0, 6, 0), NINE_TO_FIVE, "minute")).toBe(MIN(0, 9, 0));
    // After close Monday → next open is Tuesday 09:00.
    expect(nextOpenAt(MIN(0, 18, 0), NINE_TO_FIVE, "minute")).toBe(MIN(1, 9, 0));
    // Saturday → next open is Monday of next week 09:00.
    expect(nextOpenAt(MIN(5, 12, 0), NINE_TO_FIVE, "minute")).toBe(MIN(7, 9, 0));
    // Lunch gap → resumes at 13:00.
    expect(nextOpenAt(MIN(0, 12, 30), WITH_LUNCH, "minute")).toBe(MIN(0, 13, 0));
  });

  it("T0560 — empty calendar is always open (safe fallback)", () => {
    expect(isOpenAt(MIN(6, 3, 0), ALWAYS, "minute")).toBe(true);
    expect(nextOpenAt(MIN(6, 3, 0), ALWAYS, "minute")).toBe(MIN(6, 3, 0));
    expect(rateAt(MIN(6, 3, 0), ALWAYS, "minute")).toBe(1);
    expect(boundariesIn(ALWAYS, "minute", 10000)).toEqual([]);
  });

  it("T0561 — rateAt gives the window multiplier when open, 0 when closed", () => {
    const PEAK: WorkCalendar = {
      intervals: [
        { day: 0, start: "09:00", end: "12:00", rate: 2 }, // busy morning
        { day: 0, start: "12:00", end: "17:00", rate: 1 }, // normal afternoon
      ],
    };
    expect(rateAt(MIN(0, 10, 0), PEAK, "minute")).toBe(2);
    expect(rateAt(MIN(0, 15, 0), PEAK, "minute")).toBe(1);
    expect(rateAt(MIN(0, 20, 0), PEAK, "minute")).toBe(0); // closed → no arrivals
  });

  it("T0562 — boundariesIn emits open/close transitions within the horizon", () => {
    // One 9–5 day, horizon 2 days (2880 min): expect open@540 (9h), close@1020 (17h),
    // and the next day's open@1980 (24h+9h). Weekend has no windows.
    const oneDay: WorkCalendar = { intervals: [{ day: 0, start: "09:00", end: "17:00" }, { day: 1, start: "09:00", end: "17:00" }] };
    const b = boundariesIn(oneDay, "minute", MIN(2, 0, 0));
    expect(b).toEqual([
      { t: MIN(0, 9, 0), open: true },
      { t: MIN(0, 17, 0), open: false },
      { t: MIN(1, 9, 0), open: true },
      { t: MIN(1, 17, 0), open: false },
    ]);
  });

  it("T0563 — adjacent windows (lunch split) collapse to one non-race boundary", () => {
    // 9–12 and 13–17: the 12:00 close and 13:00 open are distinct; but a
    // touching split (9–12,12–17) must NOT emit a close+open at the same instant.
    const touching: WorkCalendar = {
      intervals: [{ day: 0, start: "09:00", end: "12:00" }, { day: 0, start: "12:00", end: "17:00" }],
    };
    const b = boundariesIn(touching, "minute", MIN(1, 0, 0));
    // 12:00 is still open (second window includes it) → a single open=true, no flicker.
    const at12 = b.filter((x) => x.t === MIN(0, 12, 0));
    expect(at12).toEqual([{ t: MIN(0, 12, 0), open: true }]);
    // net transitions: open@9, (no-op@12), close@17.
    expect(b).toEqual([
      { t: MIN(0, 9, 0), open: true },
      { t: MIN(0, 12, 0), open: true },
      { t: MIN(0, 17, 0), open: false },
    ]);
  });

  it("T0570 — calendarWarnings flags overlapping windows, not clean/empty ones", () => {
    expect(calendarWarnings(NINE_TO_FIVE)).toEqual([]);       // one window/day
    expect(calendarWarnings(WITH_LUNCH)).toEqual([]);         // disjoint windows
    expect(calendarWarnings(ALWAYS)).toEqual([]);             // empty = intentional
    const overlap: WorkCalendar = {
      intervals: [{ day: 0, start: "09:00", end: "13:00" }, { day: 0, start: "12:00", end: "17:00" }],
    };
    expect(calendarWarnings(overlap)).toEqual(["Mon: overlapping working windows"]);
  });

  it("T0572 — closedReason classifies the closure (Lunch / Off-hours / Weekend) for the replay cue", () => {
    // Open → null.
    expect(closedReason(MIN(0, 10, 0), NINE_TO_FIVE, "minute")).toBe(null);
    // Before open / after close on a working day → Off-hours (night).
    expect(closedReason(MIN(0, 2, 0), NINE_TO_FIVE, "minute")).toBe("Off-hours");
    expect(closedReason(MIN(0, 20, 0), NINE_TO_FIVE, "minute")).toBe("Off-hours");
    // Saturday / Sunday → Weekend.
    expect(closedReason(MIN(5, 10, 0), NINE_TO_FIVE, "minute")).toBe("Weekend");
    expect(closedReason(MIN(6, 10, 0), NINE_TO_FIVE, "minute")).toBe("Weekend");
    // Mid-day gap between two windows → Lunch.
    expect(closedReason(MIN(0, 12, 30), WITH_LUNCH, "minute")).toBe("Lunch");
    // A weekday with no windows at all → Off-hours, not Weekend.
    expect(closedReason(MIN(1, 10, 0), WITH_LUNCH, "minute")).toBe("Off-hours"); // WITH_LUNCH is Monday-only
    // Always-open calendar is never closed.
    expect(closedReason(MIN(6, 3, 0), ALWAYS, "minute")).toBe(null);
  });

  it("T0580 — serialize/parse round-trips a calendar (for the BPSim <Calendar> value)", () => {
    const rich: WorkCalendar = {
      intervals: [
        { day: 0, start: "09:00", end: "12:00" },
        { day: 0, start: "13:00", end: "17:00", rate: 2 },
        { day: 4, start: "09:00", end: "17:00" },
      ],
    };
    const s = serializeWorkCalendar(rich);
    expect(s).toBe("MO 09:00-12:00; MO 13:00-17:00@2; FR 09:00-17:00");
    expect(parseWorkCalendar(s)).toEqual(rich);       // exact round-trip incl. the rate
    expect(parseWorkCalendar(serializeWorkCalendar(ALWAYS))).toEqual({ intervals: [] });
    expect(parseWorkCalendar("garbage; MO 09:00-17:00; nonsense")).toEqual({ intervals: [{ day: 0, start: "09:00", end: "17:00" }] });
  });

  it("T0583 — simClockLabel shows the day + time of the working week (t=0 ≙ Mon 00:00)", () => {
    expect(simClockLabel(0, "minute")).toBe("Mon 00:00");
    expect(simClockLabel(MIN(0, 9, 30), "minute")).toBe("Mon 09:30");
    expect(simClockLabel(MIN(5, 10, 0), "minute")).toBe("Sat 10:00");
    expect(simClockLabel(24 + 14, "hour")).toBe("Tue 14:00");   // hour units
    expect(simClockLabel(MIN(7, 8, 0), "minute")).toBe("Mon 08:00"); // week wrap
  });
});
