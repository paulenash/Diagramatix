/**
 * Holidays and absence — dated departures from the weekly pattern.
 *
 * Smaller item 02. A calendar repeats weekly; a department's year does not. The
 * Christmas shutdown, the bank holiday, the summer when a third of the team is
 * away are all DATED, and a weekly pattern cannot express any of them.
 *
 * Two things this file guards hardest. First, the regression bar: a calendar
 * with no exceptions must take the identical code path it always took — this is
 * the most correctness-critical module in the simulator. Second, the silent
 * failure: exceptions without a start date cannot be located, and the calendar
 * must SAY so rather than quietly applying none of them.
 */
import { describe, it, expect } from "vitest";
import {
  isOpenAt, nextOpenAt, advanceWorkingClock, advanceWorkingDays,
  hasExceptions, calendarWarnings,
} from "@/app/lib/simulation/calendar";
import type { WorkCalendar } from "@/app/lib/simulation/types";

/** Mon–Fri 09:00–17:00. t is in HOURS, so t=0 is Monday 00:00. */
const WEEK: WorkCalendar = {
  intervals: [0, 1, 2, 3, 4].map((day) => ({ day, start: "09:00", end: "17:00" })),
};
/** 2026-01-05 is a Monday. */
const MONDAY = "2026-01-05";
const withEx = (exceptions: WorkCalendar["exceptions"], epochDate = MONDAY): WorkCalendar =>
  ({ ...WEEK, epochDate, exceptions });

const H = 1;                 // one hour, in "hour" clock units
const DAY = 24 * H;
/** Monday 10:00 of week 0 is t = 10. Day n at 10:00 is n*24 + 10. */
const at = (day: number, hour: number) => day * DAY + hour;

describe("calendar exceptions — the regression bar", () => {
  it("T3471 - a calendar with no exceptions is untouched, and reports none", () => {
    expect(hasExceptions(WEEK)).toBe(false);
    expect(isOpenAt(at(0, 10), WEEK, "hour")).toBe(true);    // Monday 10:00
    expect(isOpenAt(at(0, 20), WEEK, "hour")).toBe(false);   // Monday 20:00
    expect(isOpenAt(at(5, 10), WEEK, "hour")).toBe(false);   // Saturday
  });

  it("T3472 - exceptions with NO start date are reported, not silently ignored", () => {
    const cal: WorkCalendar = { ...WEEK, exceptions: [{ date: "2026-01-07", intervals: [] }] };
    expect(hasExceptions(cal)).toBe(false);
    // still open on the Wednesday, because the exception could not be located...
    expect(isOpenAt(at(2, 10), cal, "hour")).toBe(true);
    // ...and the calendar says exactly that.
    expect(calendarWarnings(cal).join(" ")).toMatch(/no start date/i);
  });

  it("T3473 - a start date that is not a Monday is flagged, because every date would shift", () => {
    const cal = withEx([{ date: "2026-01-07", intervals: [] }], "2026-01-06"); // a Tuesday
    expect(calendarWarnings(cal).join(" ")).toMatch(/not a Monday/i);
  });

  it("T3474 - a malformed or duplicated exception date is reported", () => {
    expect(calendarWarnings(withEx([{ date: "7 Jan", intervals: [] }])).join(" ")).toMatch(/not a valid/i);
    expect(calendarWarnings(withEx([
      { date: "2026-01-07", intervals: [] },
      { date: "2026-01-07", intervals: [] },
    ])).join(" ")).toMatch(/Two exceptions/i);
  });
});

describe("calendar exceptions — a closed day", () => {
  // Wednesday of week 0 is 2026-01-07.
  const holiday = withEx([{ date: "2026-01-07", intervals: [], note: "Bank holiday" }]);

  it("T3475 - a holiday closes the day that the weekly pattern would open", () => {
    expect(isOpenAt(at(2, 10), WEEK, "hour")).toBe(true);       // normally open
    expect(isOpenAt(at(2, 10), holiday, "hour")).toBe(false);   // closed for the day
    // ...and only that day
    expect(isOpenAt(at(1, 10), holiday, "hour")).toBe(true);    // Tuesday
    expect(isOpenAt(at(3, 10), holiday, "hour")).toBe(true);    // Thursday
  });

  it("T3476 - work waiting on a holiday resumes the next working morning", () => {
    // Tuesday 17:00 — closed. Next open would normally be Wednesday 09:00.
    expect(nextOpenAt(at(1, 17), WEEK, "hour")).toBe(at(2, 9));
    expect(nextOpenAt(at(1, 17), holiday, "hour")).toBe(at(3, 9)); // Thursday
  });

  it("T3477 - working time skips the holiday instead of consuming it", () => {
    // 12 working hours from Tuesday 09:00: normally Tue 9-17 (8h) then Wed 9-13.
    expect(advanceWorkingClock(at(1, 9), 12, WEEK, "hour")).toBe(at(2, 13));
    // with Wednesday closed it lands on the Thursday instead
    expect(advanceWorkingClock(at(1, 9), 12, holiday, "hour")).toBe(at(3, 13));
  });

  it("T3478 - a holiday is not a working day, so a working-DAY deadline moves out", () => {
    // 2 working days from Monday 15:00: Tue, Wed → Wednesday 15:00.
    expect(advanceWorkingDays(at(0, 15), 2, WEEK, "hour")).toBe(at(2, 15));
    // Wednesday is a holiday, so the second working day is Thursday.
    expect(advanceWorkingDays(at(0, 15), 2, holiday, "hour")).toBe(at(3, 15));
  });
});

describe("calendar exceptions — a shutdown and a changed day", () => {
  it("T3479 - a run of closed days is stepped over in one go", () => {
    // Close the whole of Wed, Thu and Fri.
    const shutdown = withEx(["2026-01-07", "2026-01-08", "2026-01-09"].map((date) => ({ date, intervals: [] })));
    // From Tuesday 17:00 the next open moment is the FOLLOWING Monday 09:00.
    expect(nextOpenAt(at(1, 17), shutdown, "hour")).toBe(at(7, 9));
  });

  it("T3480 - an exception can shorten a day rather than close it (a half-day)", () => {
    const halfDay = withEx([{ date: "2026-01-07", intervals: [{ start: "09:00", end: "13:00" }], note: "Christmas Eve" }]);
    expect(isOpenAt(at(2, 10), halfDay, "hour")).toBe(true);    // still open in the morning
    expect(isOpenAt(at(2, 15), halfDay, "hour")).toBe(false);   // shut in the afternoon
    // 6 working hours from Wednesday 09:00: 4 that morning, then 2 on Thursday.
    expect(advanceWorkingClock(at(2, 9), 6, halfDay, "hour")).toBe(at(3, 11));
  });

  it("T3481 - an exception can OPEN a day the weekly pattern closes (a Saturday callout)", () => {
    // 2026-01-10 is the Saturday of week 0.
    const saturday = withEx([{ date: "2026-01-10", intervals: [{ start: "09:00", end: "12:00" }] }]);
    expect(isOpenAt(at(5, 10), WEEK, "hour")).toBe(false);
    expect(isOpenAt(at(5, 10), saturday, "hour")).toBe(true);
  });

  it("T3482 - a night shift written on an exception does not spill into the next day", () => {
    // An exception replaces ONE date. A 22:00-06:00 window on it would otherwise
    // silently re-open the following morning, which nobody means.
    const nightOnHoliday = withEx([{ date: "2026-01-07", intervals: [{ start: "22:00", end: "06:00" }] }]);
    expect(isOpenAt(at(3, 3), nightOnHoliday, "hour")).toBe(false); // Thursday 03:00
  });
});
