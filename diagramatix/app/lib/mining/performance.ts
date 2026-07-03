/**
 * Mine the timing + resource numbers a simulation needs, straight from the event
 * log's traces — the raw material for the "digital twin" (calibrateSimulation).
 * An activity's duration is its sojourn time (until the next event in the case);
 * inter-arrival is the gap between consecutive cases; resource concurrency (max
 * simultaneous cases per resource) becomes team capacity; the hour-of-week
 * histogram becomes a working calendar. Pure.
 */
import type { CaseTrace, Performance } from "./types";
import type { ClockUnit } from "@/app/lib/simulation/types";

const MS_PER_UNIT: Record<ClockUnit, number> = { second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000 };

/** Pick the clock unit that keeps typical durations human-scaled. */
function pickUnit(medianMs: number): ClockUnit {
  if (medianMs < 60_000) return "second";
  if (medianMs < 3_600_000) return "minute";
  if (medianMs < 86_400_000) return "hour";
  return "day";
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Max number of simultaneously-active intervals (a sweep line). */
function maxOverlap(intervals: [number, number][]): number {
  const pts: [number, number][] = [];
  for (const [s, e] of intervals) { pts.push([s, 1]); pts.push([e, -1]); }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]); // an end (-1) before a start (+1) at the same instant
  let cur = 0, max = 0;
  for (const [, d] of pts) { cur += d; if (cur > max) max = cur; }
  return Math.max(1, max);
}

export function computePerformance(traces: CaseTrace[]): Performance {
  const durMs: Record<string, number[]> = {};
  const allDur: number[] = [];
  for (const t of traces) {
    for (let i = 0; i < t.events.length - 1; i++) {
      const d = t.events[i + 1].timestamp - t.events[i].timestamp;
      if (d >= 0) { (durMs[t.events[i].activity] ??= []).push(d); allDur.push(d); }
    }
  }
  const clockUnit = pickUnit(median(allDur));
  const div = MS_PER_UNIT[clockUnit];

  const activityDurations: Record<string, number[]> = {};
  for (const [a, arr] of Object.entries(durMs)) activityDurations[a] = arr.map((d) => d / div);

  const firsts = traces.map((t) => t.events[0]?.timestamp).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
  const interArrival: number[] = [];
  for (let i = 1; i < firsts.length; i++) interArrival.push((firsts[i] - firsts[i - 1]) / div);

  const actRes: Record<string, Record<string, number>> = {};
  const intervalsByRes: Record<string, [number, number][]> = {};
  const activeHours = new Array<number>(168).fill(0);
  for (const t of traces) {
    for (let i = 0; i < t.events.length; i++) {
      const e = t.events[i];
      if (e.resource) {
        (actRes[e.activity] ??= {})[e.resource] = (actRes[e.activity]?.[e.resource] ?? 0) + 1;
        const end = i < t.events.length - 1 ? t.events[i + 1].timestamp : e.timestamp + 1;
        (intervalsByRes[e.resource] ??= []).push([e.timestamp, end]);
      }
      const dt = new Date(e.timestamp);
      const dow = (dt.getUTCDay() + 6) % 7; // JS Sun=0 → Mon=0
      activeHours[dow * 24 + dt.getUTCHours()]++;
    }
  }

  const activityResource: Record<string, string> = {};
  for (const [a, m] of Object.entries(actRes)) activityResource[a] = Object.entries(m).sort((x, y) => y[1] - x[1])[0][0];
  const resourceConcurrency: Record<string, number> = {};
  for (const [r, ivs] of Object.entries(intervalsByRes)) resourceConcurrency[r] = maxOverlap(ivs);

  return { clockUnit, activityDurations, interArrival, activityResource, resourceConcurrency, activeHours };
}
