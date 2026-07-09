/**
 * The digital twin: turn mined `performance` numbers into a runnable simulation
 * on the discovered BPMN. Writes cycle times (fitted distributions), the source
 * arrival rate, gateway branch probabilities (from the frequency labels the
 * discovery put on the edges), and per-task teams; returns the mined team library
 * + a working calendar derived from the active-hours histogram. Pure — the route
 * persists the diagram + creates the SimulationTeam/Calendar/Study rows.
 */
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { getSimParams, simPatch } from "@/app/lib/diagram/simParams";
import type { SimDist, ClockUnit, WorkCalendar, CalendarInterval } from "@/app/lib/simulation/types";
import type { Performance } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Fit a service-time distribution to sojourn samples: fixed when constant/scarce,
 *  else a triangular(min, median, max). */
export function fitDuration(samples: number[]): SimDist {
  if (samples.length === 0) return { kind: "fixed", value: 1 };
  const min = Math.max(0, Math.min(...samples)), max = Math.max(...samples);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  if (samples.length < 3 || min === max) return { kind: "fixed", value: Math.max(0, r2(mean)) };
  return { kind: "triangular", min: r2(min), mode: r2(Math.max(min, median(samples))), max: r2(max) };
}

/** Fit an inter-arrival distribution (exponential — the usual arrival model). */
export function fitArrival(samples: number[]): SimDist {
  if (samples.length === 0) return { kind: "exponential", mean: 10 };
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return { kind: "exponential", mean: Math.max(0.01, r2(mean)) };
}

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Turn the 168-bucket active-hours histogram into a working calendar: hours with
 *  >5% of peak activity are "open", merged into per-day intervals. */
export function activeHoursToCalendar(activeHours: number[]): WorkCalendar {
  const peak = Math.max(1, ...activeHours);
  const thr = peak * 0.05;
  const intervals: CalendarInterval[] = [];
  for (let day = 0; day < 7; day++) {
    let start = -1;
    for (let h = 0; h <= 24; h++) {
      const open = h < 24 && (activeHours[day * 24 + h] ?? 0) > thr;
      if (open && start < 0) start = h;
      else if (!open && start >= 0) { intervals.push({ day, start: hh(start), end: hh(h) }); start = -1; }
    }
  }
  return { intervals };
}

const TASK_TYPES = new Set(["task", "subprocess", "subprocess-expanded"]);

export interface Calibration {
  data: DiagramData;                                   // discovered BPMN + sim params
  teams: { name: string; capacity: number }[];         // mined team library
  calendar: WorkCalendar;                              // mined working hours
  clockUnit: ClockUnit;
}

export function calibrateSimulation(data: DiagramData, perf: Performance): Calibration {
  const byId = new Map(data.elements.map((e) => [e.id, e] as const));
  const patchEl = (el: DiagramElement, patch: Parameters<typeof simPatch>[1]) => ({ ...el, properties: { ...el.properties, ...simPatch(el, patch) } });

  // Nearest containing lane/pool label — the team a task falls back to when the
  // log carried no resource for its activity. Keeps every task team-assigned so
  // the twin is runnable without a manual "Fill missing" pass.
  const laneLabelOf = (el: DiagramElement): string | undefined => {
    let cur: DiagramElement | undefined = el.parentId ? byId.get(el.parentId) : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.type === "lane" || cur.type === "pool") { const l = (cur.label ?? "").trim(); if (l) return l; }
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return undefined;
  };

  // Every team a task ends up referencing → so the returned library covers them
  // all (mined resources AND any pool/lane fallback), never leaving an orphan.
  const usedTeams = new Set<string>();
  const elements = data.elements.map((el) => {
    if (TASK_TYPES.has(el.type)) {
      const label = el.label ?? "";
      const team = perf.activityResource[label] ?? laneLabelOf(el);
      if (team) usedTeams.add(team);
      return patchEl(el, { cycleTime: fitDuration(perf.activityDurations[label] ?? []), ...(team ? { teamId: team } : {}) });
    }
    if ((el.type === "start-event" || el.type === "intermediate-event") && !el.boundaryHostId) {
      return patchEl(el, { arrival: fitArrival(perf.interArrival) });
    }
    return el;
  });

  // Gateway branch probabilities from the frequency labels discovery put on edges.
  const connectors = data.connectors.map((c) => ({ ...c }));
  const gwOut = new Map<string, typeof connectors>();
  for (const c of connectors) {
    const src = byId.get(c.sourceId);
    if (src?.type === "gateway") (gwOut.get(c.sourceId) ?? gwOut.set(c.sourceId, []).get(c.sourceId)!).push(c);
  }
  for (const outs of gwOut.values()) {
    const total = outs.reduce((a, c) => a + (parseFloat(c.label ?? "") || 0), 0);
    if (total <= 0) continue;
    for (const c of outs) c.branchProbability = Math.round(100 * (parseFloat(c.label ?? "") || 0) / total);
  }

  // One team per distinct team a task actually references — a mined resource
  // (capacity = its peak concurrency) or a pool/lane fallback (capacity 1). This
  // guarantees the library covers every task's teamId, so the run needs no
  // manual team fix-up.
  const teams = [...usedTeams].map((name) => ({ name, capacity: Math.max(1, perf.resourceConcurrency[name] ?? 1) }));

  return {
    data: { ...data, elements, connectors },
    teams,
    calendar: activeHoursToCalendar(perf.activeHours),
    clockUnit: perf.clockUnit,
  };
}
