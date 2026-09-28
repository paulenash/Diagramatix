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
import type { DiagramData, DiagramElement } from "./types";
import { isAnyLane } from "./laneKind";

/** Read a pool's effective header width (stored property override, else 36). */
export function getPoolHeaderWidth(pool: DiagramElement): number {
  const stored = pool.properties?.poolHeaderWidth;
  return typeof stored === "number" && stored > 0 ? stored : 36;
}

export function getLaneHeaderWidth(lane: DiagramElement): number {
  const stored = lane.properties?.laneHeaderWidth;
  return typeof stored === "number" && stored > 0 ? stored : 36;
}

/** A Standard Flowchart vertical swimlane's top header strip height (stored
 *  property override, else 36). */
export function getVSwimlaneHeaderHeight(el: DiagramElement): number {
  const stored = el.properties?.vlaneHeaderHeight as number | undefined;
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

/**
 * Minimum height required for a pool / lane / sublane such that:
 *   - its own rotated label fits along its vertical extent
 *   - its children (lanes / sublanes) each fit their own minimum heights
 *
 * Used by RESIZE_ELEMENT to clamp user-driven resizes so labels can never
 * be cropped past the container boundary.
 */
export function minHeightForContainer(
  el: DiagramElement,
  elements: DiagramElement[],
  poolFs: number,
  laneFs: number,
): number {
  // Both shapes of a sub-lane count (laneKind.ts). A stamped `type: "sublane"`
  // fell through to the bare 40 below, so its name was never a floor and a
  // lane holding stamped sub-lanes counted only its own name.
  if (el.type === "pool") {
    const own = poolMetrics(el.label, poolFs).minHeight;
    const lanes = elements.filter(e => isAnyLane(e) && e.parentId === el.id);
    if (lanes.length === 0) return own;
    const lanesH = lanes.reduce((s, l) => s + minHeightForContainer(l, elements, poolFs, laneFs), 0);
    return Math.max(own, lanesH);
  }
  if (isAnyLane(el)) {
    const own = laneMetrics(el.label, laneFs).minHeight;
    const sublanes = elements.filter(e => isAnyLane(e) && e.parentId === el.id);
    if (sublanes.length === 0) return own;
    const subH = sublanes.reduce((s, l) => s + minHeightForContainer(l, elements, poolFs, laneFs), 0);
    return Math.max(own, subH);
  }
  return 40;
}

/**
 * Recursively proportionally re-stack a parent lane's sublanes to fit its
 * (already-updated) y/height/x/width. Used when a pool or lane boundary is
 * dragged so deeper levels (sub-sublanes etc.) also resize to fill their
 * parent. Uses dynamic header widths and respects each descendant's
 * label-driven minimum height.
 *
 * Returns updated elements (immutable). The caller is expected to have
 * already applied the new (x, y, width, height) to `parentLane` itself in
 * `elementsArr`.
 */

/** One-time load heal: bring every pool's header strip up to a width that fits its
 *  (multi-line) label at the pool font. Older diagrams (and any generated before the
 *  header-sizing fix) stored a strip sized for a smaller font and tripped the B32
 *  "Pool label overflows the header region" warning. White-box pools grow LEFT by
 *  the shortfall so their lanes stay exactly where they are; black-box pools (no
 *  lanes) just widen the strip. Returns the SAME reference when nothing needs it, so
 *  a healthy diagram isn't marked dirty.
 *
 *  The desktop editor applies it on open (useDiagram's healOnLoad). It lives here,
 *  pure, so every other place that DRAWS a stored diagram — the phone viewer, the
 *  partner PDF — draws the pool the desktop draws (2026-09-28: a three-line pool
 *  name in an unhealed 36px strip ran out of the pool and under its lanes). */
export function healPoolHeaderWidths(d: DiagramData): DiagramData {
  if (!Array.isArray(d.elements)) return d;
  const poolFs = d.poolFontSize ?? 16;
  let changed = false;
  const elements = d.elements.map((e) => {
    if (e.type !== "pool") return e;
    const need = poolMetrics(e.label ?? "", poolFs).headerWidth;
    const stored = typeof e.properties?.poolHeaderWidth === "number" ? (e.properties.poolHeaderWidth as number) : 36;
    if (stored >= need) return e;
    changed = true;
    const delta = need - stored;
    const isBlackBox = (e.properties?.poolType as string | undefined) === "black-box";
    const next: DiagramElement = { ...e, properties: { ...e.properties, poolHeaderWidth: need } };
    if (!isBlackBox) { next.x = e.x - delta; next.width = e.width + delta; } // grow left; lanes unmoved
    return next;
  });
  return changed ? { ...d, elements } : d;
}
