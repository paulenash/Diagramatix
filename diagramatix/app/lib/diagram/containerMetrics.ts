/**
 * How big a pool, lane or sublane has to be for its own name.
 *
 * A container's name is drawn as rotated text down its left-hand header strip,
 * so the name sets the container's minimum HEIGHT and the number of lines sets
 * the strip's WIDTH. Lifted out of the reducer on 2026-09-23 so the lane-drop
 * PLANNER can answer "would this drop fit?" with exactly the arithmetic the
 * reducer then applies — a preview that used its own copy would sooner or
 * later promise something the drop did not do.
 *
 * Pure.
 */
import type { DiagramElement } from "./types";

/** Read a pool's effective header width (stored property override, else 36). */
export function getPoolHeaderWidth(pool: DiagramElement): number {
  const stored = pool.properties?.poolHeaderWidth;
  return typeof stored === "number" && stored > 0 ? stored : 36;
}

export function getLaneHeaderWidth(lane: DiagramElement): number {
  const stored = lane.properties?.laneHeaderWidth;
  return typeof stored === "number" && stored > 0 ? stored : 36;
}

export function poolMetrics(label: string, fontSize: number): { minHeight: number; headerWidth: number } {
  const lines = (label || "").split("\n");
  const charPxWidth = fontSize * 0.6;
  const lineH = fontSize * 1.18;
  const longestLine = Math.max(1, ...lines.map(l => l.length));
  const minHeight = Math.max(50, Math.ceil(longestLine * charPxWidth + 20));
  // Default 36 fits ~2 lines at fontSize 12; widens once 4+ lines need to stack.
  const stackedH = Math.ceil(lines.length * lineH + 8);
  const headerWidth = Math.max(36, stackedH);
  return { minHeight, headerWidth };
}

export function laneMetrics(label: string, fontSize: number): { minHeight: number; headerWidth: number } {
  const lines = (label || "").split("\n");
  const charPxWidth = fontSize * 0.6;
  const lineH = fontSize * 1.2;
  const longestLine = Math.max(1, ...lines.map(l => l.length));
  const minHeight = Math.max(40, Math.ceil(longestLine * charPxWidth + 16));
  const stackedH = Math.ceil(lines.length * lineH + 8);
  const headerWidth = Math.max(36, stackedH);
  return { minHeight, headerWidth };
}
