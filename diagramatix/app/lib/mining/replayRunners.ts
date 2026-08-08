/**
 * Build "runners" for the log-replay animation — one polyline per (sampled)
 * variant through the discovered model's element centres, plus a normalised
 * [0,1] start offset + duration so the Cases tab can animate tokens flowing over
 * the process (Disco/Apromore-style), weighted by variant frequency. Pure — no
 * DB, no React, no timers.
 */
import type { DiagramData } from "@/app/lib/diagram/types";
import type { Variant } from "./types";
import { activityElementIds } from "./variantView";

export interface Runner { points: { x: number; y: number }[]; start: number; dur: number; weight: number }

function centerOf(data: DiagramData, id: string): { x: number; y: number } | null {
  const e = data.elements.find((x) => x.id === id);
  return e ? { x: e.x + e.width / 2, y: e.y + e.height / 2 } : null;
}

/** Up to `max` runners (top variants by frequency), staggered across the timeline. */
export function buildRunners(data: DiagramData, variants: Variant[], max = 30): Runner[] {
  const map = activityElementIds(data);
  const startEl = data.elements.find((e) => e.type === "start-event");
  const endEl = data.elements.find((e) => e.type === "end-event");
  const top = [...variants].sort((a, b) => b.count - a.count).slice(0, max);
  const runners: Runner[] = [];
  top.forEach((v, i) => {
    const pts: ({ x: number; y: number } | null)[] = [];
    if (startEl) pts.push(centerOf(data, startEl.id));
    for (const a of v.events) { const id = map.get(a); if (id) pts.push(centerOf(data, id)); }
    if (endEl) pts.push(centerOf(data, endEl.id));
    const clean = pts.filter((p): p is { x: number; y: number } => !!p);
    if (clean.length < 2) return;
    runners.push({ points: clean, start: (top.length > 1 ? i / top.length : 0) * 0.6, dur: 0.4, weight: v.count });
  });
  return runners;
}

/** Position along a runner's polyline at local progress t in [0,1]. */
export function pointAt(points: { x: number; y: number }[], t: number): { x: number; y: number } {
  if (points.length === 1) return points[0];
  const clamped = Math.max(0, Math.min(1, t));
  const segs = points.length - 1;
  const f = clamped * segs;
  const i = Math.min(segs - 1, Math.floor(f));
  const local = f - i;
  const a = points[i], b = points[i + 1];
  return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local };
}
