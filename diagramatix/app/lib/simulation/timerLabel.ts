/**
 * Parse an intermediate timer event's LABEL into a duration, so "Fill missing"
 * can seed a sensible delay instead of a flat default. Three tiers:
 *
 *   1. Fixed elapsed duration — "Wait 3 hours", "2 days", "90 min", "1.5h"
 *   2. Working-time duration   — "10 working days", "3 business hours"
 *   3. Absolute time-of-day    — "until 3pm", "by 17:00", "until 09:30"
 *
 * Pure and unit-free at the edges: durations are normalised to MINUTES (the
 * simulator's default clock unit), working time using an 8h day / 5-day week.
 * Absolute times are returned as 24h "HH:MM". Returns null when nothing parses.
 *
 * NOTE the engine currently advances a delay as plain elapsed time, so the
 * "working" magnitude is filled as a fixed duration and the "until" tier is
 * recognised but not yet applied — calendar-gated + absolute delays are a
 * follow-up in the engine. The parser is complete so that work is data-ready.
 */

export type TimerParse =
  | { mode: "elapsed"; minutes: number }
  | { mode: "working"; minutes: number }
  | { mode: "until"; timeOfDay: string };

const MIN_PER: Record<string, number> = {
  second: 1 / 60, minute: 1, hour: 60, day: 1440, week: 10080,
};
const WORKING_DAY_MIN = 8 * 60;
const WORKING_MIN_PER: Record<string, number> = {
  second: 1 / 60, minute: 1, hour: 60, day: WORKING_DAY_MIN, week: 5 * WORKING_DAY_MIN,
};

/** Map a unit token (any common spelling/abbreviation) to a canonical unit. */
function canonicalUnit(u: string): keyof typeof MIN_PER | null {
  switch (u) {
    case "s": case "sec": case "secs": case "second": case "seconds": return "second";
    case "m": case "min": case "mins": case "minute": case "minutes": return "minute";
    case "h": case "hr": case "hrs": case "hour": case "hours": return "hour";
    case "d": case "day": case "days": return "day";
    case "w": case "wk": case "wks": case "week": case "weeks": return "week";
    default: return null;
  }
}

const UNIT_RE = "(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|wks?|w)";
// number, optional working/business keyword, unit
const DURATION_RE = new RegExp(String.raw`(\d+(?:\.\d+)?)\s*(working|business)?\s*${UNIT_RE}\b`, "i");
// "until / til / by  <time>" — 12h ("3pm", "3:30 pm") or 24h ("17:00")
const UNTIL_RE = /\b(?:until|til|till|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;

export function parseTimerLabel(label: string): TimerParse | null {
  const s = (label || "").trim().toLowerCase();
  if (!s) return null;

  // Tier 3: absolute time-of-day.
  const u = UNTIL_RE.exec(s);
  if (u) {
    let hh = parseInt(u[1], 10);
    const mm = u[2] ? parseInt(u[2], 10) : 0;
    const ap = u[3];
    if (hh <= 23 && mm <= 59) {
      if (ap === "pm" && hh < 12) hh += 12;
      if (ap === "am" && hh === 12) hh = 0;
      return { mode: "until", timeOfDay: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` };
    }
  }

  // Tiers 1 & 2: a numeric duration with a unit.
  const d = DURATION_RE.exec(s);
  if (d) {
    const n = parseFloat(d[1]);
    const working = !!d[2];
    const unit = canonicalUnit(d[3].toLowerCase());
    if (unit && Number.isFinite(n)) {
      const minutes = n * (working ? WORKING_MIN_PER : MIN_PER)[unit];
      return working ? { mode: "working", minutes } : { mode: "elapsed", minutes };
    }
  }
  return null;
}

/** The delay magnitude in minutes for the fillable tiers (elapsed / working),
 *  or null when the label carries no fillable duration. */
export function timerDelayMinutes(label: string): number | null {
  const p = parseTimerLabel(label);
  return p && (p.mode === "elapsed" || p.mode === "working") ? p.minutes : null;
}
