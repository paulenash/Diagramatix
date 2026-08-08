/**
 * Bottleneck/frequency HEAT for the discovered model — maps a per-activity metric
 * onto a cool→warm→hot colour and returns a NON-DESTRUCTIVE copy of the diagram
 * with `properties.fillColor` set on each matching activity element. The Insights
 * view renders that copy read-only (SymbolRenderer honours `fillColor`); the saved
 * discovered diagram is never mutated. Pure — no DB, no React.
 */
import type { DiagramData } from "@/app/lib/diagram/types";
import type { RunAnalytics, ActivityMetric } from "./analytics";

export type HeatMetric = "frequency" | "totalTime" | "avgTime";

export const HEAT_METRICS: { key: HeatMetric; label: string; of: (a: ActivityMetric) => number }[] = [
  { key: "totalTime", label: "Total time (bottleneck)", of: (a) => a.totalTimeMs },
  { key: "frequency", label: "Frequency (cases)", of: (a) => a.caseFreq },
  { key: "avgTime", label: "Avg time in step", of: (a) => a.medianDurMs },
];

/** 3-stop cool→warm→hot gradient, t in [0,1] → "rgb(r,g,b)". */
export function heatColor(t: number): string {
  const stops: { p: number; c: [number, number, number] }[] = [
    { p: 0, c: [219, 234, 254] },   // pale blue  (cold)
    { p: 0.5, c: [251, 191, 36] },  // amber      (warm)
    { p: 1, c: [220, 38, 38] },     // red        (hot)
  ];
  const x = Math.max(0, Math.min(1, t));
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (x >= stops[i].p && x <= stops[i + 1].p) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const f = (x - lo.p) / (hi.p - lo.p || 1);
  const c = lo.c.map((v, i) => Math.round(v + (hi.c[i] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Return a copy of `data` with `properties.fillColor` set on every element whose
 *  label matches an activity, coloured by the chosen metric (min→max normalised). */
export function applyHeat(data: DiagramData, analytics: RunAnalytics, metric: HeatMetric): DiagramData {
  const of = (HEAT_METRICS.find((m) => m.key === metric) ?? HEAT_METRICS[0]).of;
  const byActivity = new Map(analytics.activities.map((a) => [a.activity, of(a)]));
  const vals = [...byActivity.values()];
  const max = Math.max(1, ...vals);
  const min = Math.min(0, ...vals);
  const norm = (v: number) => (max === min ? 0.5 : (v - min) / (max - min));
  const elements = data.elements.map((el) => {
    const key = (el.label ?? "").trim();
    if (!key || !byActivity.has(key)) return el;
    return { ...el, properties: { ...el.properties, fillColor: heatColor(norm(byActivity.get(key)!)) } };
  });
  return { ...data, elements };
}
