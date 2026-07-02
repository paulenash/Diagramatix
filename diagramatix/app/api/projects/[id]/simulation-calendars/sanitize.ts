import type { WorkCalendar, CalendarInterval } from "@/app/lib/simulation/types";

const HHMM = /^(\d{1,2}):(\d{2})$/;

/** Coerce arbitrary request JSON into a well-formed WorkCalendar: a list of
 *  open windows { day 0-6, start/end "HH:MM", rate>0 }. Malformed entries are
 *  dropped rather than rejected so the editor can save incrementally; deeper
 *  validation (overlaps, end≤start) is surfaced by readiness, not blocked here. */
export function sanitizePattern(raw: unknown): WorkCalendar {
  const src = (raw && typeof raw === "object" ? raw : {}) as { intervals?: unknown };
  const list = Array.isArray(src.intervals) ? src.intervals : [];
  const intervals: CalendarInterval[] = [];
  for (const it of list) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const day = Number(o.day);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    const start = typeof o.start === "string" && HHMM.test(o.start) ? o.start : null;
    const end = typeof o.end === "string" && HHMM.test(o.end) ? o.end : null;
    if (!start || !end) continue;
    const iv: CalendarInterval = { day, start, end };
    if (typeof o.rate === "number" && o.rate > 0 && o.rate !== 1) iv.rate = o.rate;
    intervals.push(iv);
  }
  return { intervals };
}
