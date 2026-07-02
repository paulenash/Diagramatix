/**
 * Pure helpers that turn a weekly WorkCalendar into sim-clock times.
 *
 * The engine works in an abstract clock whose unit is the scenario's ClockUnit
 * (second/minute/hour/day). A calendar is authored in wall-clock terms — a set
 * of open windows keyed by day-of-week + "HH:MM" — so every helper here converts
 * those windows into clock-unit offsets using SECONDS_PER_UNIT, with sim-clock
 * t=0 anchored to **Monday 00:00** and the pattern repeating every 7 days.
 *
 * An empty calendar (no intervals) is treated as ALWAYS OPEN — the safe fallback
 * for an unconfigured/deleted calendar so a mis-set calendar never silently
 * starves the model. These functions are pure (no engine state) and are the
 * correctness-critical core, so they carry the bulk of the calendar tests.
 */

import { SECONDS_PER_UNIT, type ClockUnit, type WorkCalendar, type CalendarInterval } from "./types";

/** Day-of-week codes for the compact calendar string (0=Mon … 6=Sun). */
const DAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Wall-clock label for a sim time (t=0 ≙ Monday 00:00), e.g. "Mon 14:30" — for
 *  the replay so the user can see the day/time the working calendars act on. */
export function simClockLabel(t: number, clockUnit: ClockUnit): string {
  const weekSec = 7 * 86400;
  let sec = ((t * SECONDS_PER_UNIT[clockUnit]) % weekSec + weekSec) % weekSec;
  const day = Math.floor(sec / 86400); sec -= day * 86400;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return `${DOW[day]} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Serialise a WorkCalendar to a compact, human-readable string for the BPSim
 *  <Calendar> element value: "MO 09:00-12:00; MO 13:00-17:00; TU 09:00-17:00@2"
 *  (the @n suffix is the arrival-rate multiplier, omitted when 1). */
export function serializeWorkCalendar(cal: WorkCalendar): string {
  return (cal.intervals ?? [])
    .filter((iv) => Number.isInteger(iv.day) && iv.day >= 0 && iv.day <= 6)
    .map((iv) => `${DAY_CODES[iv.day]} ${iv.start}-${iv.end}${iv.rate && iv.rate > 0 && iv.rate !== 1 ? `@${iv.rate}` : ""}`)
    .join("; ");
}

/** Parse the compact calendar string back into a WorkCalendar (inverse of
 *  serializeWorkCalendar). Malformed segments are skipped. */
export function parseWorkCalendar(s: string): WorkCalendar {
  const intervals: CalendarInterval[] = [];
  for (const part of (s ?? "").split(";")) {
    const m = /^\s*(MO|TU|WE|TH|FR|SA|SU)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})(?:@([\d.]+))?\s*$/.exec(part);
    if (!m) continue;
    const iv: CalendarInterval = { day: DAY_CODES.indexOf(m[1]), start: m[2], end: m[3] };
    const rate = m[4] ? Number(m[4]) : undefined;
    if (rate !== undefined && rate > 0 && rate !== 1) iv.rate = rate;
    intervals.push(iv);
  }
  return { intervals };
}

/** One open window resolved to clock-unit offsets within a single week. */
interface WeekWindow {
  s: number; // start offset in clock units from the week's Monday 00:00
  e: number; // end offset (exclusive)
  rate: number;
}

/** "HH:MM" → seconds since midnight. "24:00" (end of day) → 86400. Invalid → 0. */
function hhmmToSeconds(v: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((v ?? "").trim());
  if (!m) return 0;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return 0;
  return h * 3600 + min * 60;
}

/** Clock units per 7-day week for the given unit. */
export function weekLengthClock(clockUnit: ClockUnit): number {
  return (7 * 86400) / SECONDS_PER_UNIT[clockUnit];
}

/** Resolve a calendar's intervals into clock-unit windows within one week,
 *  sorted by start. Malformed windows (end ≤ start, day out of range) are
 *  dropped — they're flagged separately by readiness validation. */
export function intervalsToClock(cal: WorkCalendar, clockUnit: ClockUnit): WeekWindow[] {
  const spu = SECONDS_PER_UNIT[clockUnit];
  const out: WeekWindow[] = [];
  for (const iv of cal.intervals ?? []) {
    if (!Number.isInteger(iv.day) || iv.day < 0 || iv.day > 6) continue;
    const startSec = iv.day * 86400 + hhmmToSeconds(iv.start);
    const endSec = iv.day * 86400 + hhmmToSeconds(iv.end);
    if (endSec <= startSec) continue;
    const rate = typeof iv.rate === "number" && iv.rate > 0 ? iv.rate : 1;
    out.push({ s: startSec / spu, e: endSec / spu, rate });
  }
  return out.sort((a, b) => a.s - b.s);
}

/** The offset of `t` within its week, always in [0, weekLength). */
function timeOfWeek(t: number, weekLen: number): number {
  return ((t % weekLen) + weekLen) % weekLen;
}

/** The window (if any) open at `t`. Empty calendar → a synthetic always-open
 *  window so callers uniformly see "open, rate 1". */
function windowAt(t: number, windows: WeekWindow[], weekLen: number): WeekWindow | undefined {
  if (windows.length === 0) return { s: 0, e: weekLen, rate: 1 };
  const tow = timeOfWeek(t, weekLen);
  return windows.find((w) => tow >= w.s && tow < w.e);
}

/** Is the calendar open at clock time `t`? Empty calendar → always true. */
export function isOpenAt(t: number, cal: WorkCalendar, clockUnit: ClockUnit): boolean {
  const weekLen = weekLengthClock(clockUnit);
  return windowAt(t, intervalsToClock(cal, clockUnit), weekLen) !== undefined;
}

/** The arrival-rate multiplier in effect at `t`: the containing window's `rate`
 *  when open, or 0 when closed (no arrivals). Empty calendar → 1. */
export function rateAt(t: number, cal: WorkCalendar, clockUnit: ClockUnit): number {
  const weekLen = weekLengthClock(clockUnit);
  const w = windowAt(t, intervalsToClock(cal, clockUnit), weekLen);
  return w ? w.rate : 0;
}

/** The earliest clock time ≥ `t` at which the calendar is open. Returns `t`
 *  itself when already open (or the calendar is always-open). A gap to the next
 *  open window is at most one week, so scanning the current + next week suffices. */
export function nextOpenAt(t: number, cal: WorkCalendar, clockUnit: ClockUnit): number {
  const windows = intervalsToClock(cal, clockUnit);
  if (windows.length === 0) return t;
  const weekLen = weekLengthClock(clockUnit);
  const tow = timeOfWeek(t, weekLen);
  const weekStart = t - tow;
  // Open now?
  if (windows.some((w) => tow >= w.s && tow < w.e)) return t;
  // Next window start later this week.
  const laterThisWeek = windows.find((w) => w.s > tow);
  if (laterThisWeek) return weekStart + laterThisWeek.s;
  // Otherwise the first window of next week.
  return weekStart + weekLen + windows[0].s;
}

/** A staffing transition on the calendar — schedule capacity full/0 at each. */
export interface CalendarBoundary {
  t: number;
  open: boolean;
}

/** Every open↔closed transition in (0, horizon], as scheduling boundaries.
 *  Computed from the unique window edges across each week, with the actual state
 *  evaluated just at the edge so adjacent windows (e.g. a lunch split) collapse
 *  to a single race-free event rather than a close+open at the same instant. */
export function boundariesIn(cal: WorkCalendar, clockUnit: ClockUnit, horizon: number): CalendarBoundary[] {
  const windows = intervalsToClock(cal, clockUnit);
  if (windows.length === 0 || horizon <= 0) return [];
  const weekLen = weekLengthClock(clockUnit);
  const times = new Set<number>();
  const weeks = Math.floor(horizon / weekLen) + 1;
  for (let w = 0; w <= weeks; w++) {
    const base = w * weekLen;
    for (const win of windows) {
      const start = base + win.s;
      const end = base + win.e;
      if (start > 0 && start <= horizon) times.add(start);
      if (end > 0 && end <= horizon) times.add(end);
    }
  }
  return [...times]
    .sort((a, b) => a - b)
    .map((t) => ({ t, open: isOpenAt(t, cal, clockUnit) }));
}

/** Why a calendar is CLOSED at time `t` — for a human-readable replay cue.
 *  Returns null when open (or always-open). "Lunch" = a gap between two windows
 *  on the same working day; "Weekend" = Sat/Sun with no windows; "Off-hours" =
 *  before/after the day's windows (night) or a non-working weekday. */
export function closedReason(t: number, cal: WorkCalendar, clockUnit: ClockUnit): "Lunch" | "Off-hours" | "Weekend" | null {
  const windows = intervalsToClock(cal, clockUnit);
  if (windows.length === 0) return null; // always open
  const weekLen = weekLengthClock(clockUnit);
  const tow = timeOfWeek(t, weekLen);
  if (windows.some((w) => tow >= w.s && tow < w.e)) return null; // open now
  const dayLen = 86400 / SECONDS_PER_UNIT[clockUnit];
  const day = Math.floor(tow / dayLen); // 0=Mon … 6=Sun
  const dayStart = day * dayLen;
  const today = windows.filter((w) => w.s >= dayStart && w.s < dayStart + dayLen);
  if (today.length === 0) return day >= 5 ? "Weekend" : "Off-hours";
  const gapBetween = today.some((w) => w.e <= tow) && today.some((w) => w.s > tow);
  return gapBetween ? "Lunch" : "Off-hours"; // mid-day gap vs before-first / after-last
}

/** Human-readable readiness warnings for a calendar. Malformed windows (end ≤
 *  start, bad day) are already dropped on save, so the one thing worth flagging
 *  is OVERLAPPING windows on the same day — harmless to the engine (first match
 *  wins) but usually a data-entry mistake, and it makes per-window rates
 *  ambiguous. An empty calendar is intentional (always open), not a warning. */
export function calendarWarnings(cal: WorkCalendar): string[] {
  const warnings: string[] = [];
  const byDay = new Map<number, { s: number; e: number }[]>();
  for (const iv of cal.intervals ?? []) {
    const m1 = /^(\d{1,2}):(\d{2})$/.exec(iv.start ?? "");
    const m2 = /^(\d{1,2}):(\d{2})$/.exec(iv.end ?? "");
    if (!m1 || !m2) continue;
    const s = Number(m1[1]) * 60 + Number(m1[2]);
    const e = Number(m2[1]) * 60 + Number(m2[2]);
    if (e <= s) continue;
    (byDay.get(iv.day) ?? byDay.set(iv.day, []).get(iv.day)!).push({ s, e });
  }
  const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  for (const [day, wins] of byDay) {
    const sorted = [...wins].sort((a, b) => a.s - b.s);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].s < sorted[i - 1].e) { warnings.push(`${DAY[day] ?? day}: overlapping working windows`); break; }
    }
  }
  return warnings;
}
