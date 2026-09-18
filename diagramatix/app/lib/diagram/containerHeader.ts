/**
 * The header strip of a pool or a lane — the named band down its left side —
 * and whether a point is in it.
 *
 * The strip is what you click to select or drag the container; the rest of it
 * is the body, which belongs to whatever is drawn inside. That distinction was
 * already being made in five places, each re-reading the same two property
 * keys with the same 36px fallback, so this is the one copy.
 *
 * Paul, 2026-09-19 gave it one more job: "The right-click menu should show
 * 'Generate SOP …' only when clicked on the Pool or Lane Header region. The
 * right-click menu should show the element matrix when clicked in the body of
 * the pool or lane." — the container's own menu belongs to the container's own
 * strip; the body offers what you can put IN it.
 *
 * The width is user-resizable and stored per container, so it must be read
 * rather than assumed: widening a pool header once made clicks on the right of
 * it silently do nothing.
 *
 * Pure.
 */
import type { DiagramElement } from "./types";

/** The strip width when the container has never been resized. */
export const DEFAULT_HEADER_W = 36;

export const isHeaderContainer = (el: { type: string }): boolean =>
  el.type === "pool" || el.type === "lane";

/** The container's header strip width, honouring a resize. */
export function containerHeaderWidth(el: DiagramElement): number {
  const stored = (el.type === "pool"
    ? el.properties?.poolHeaderWidth
    : el.properties?.laneHeaderWidth) as number | undefined;
  return typeof stored === "number" && stored > 0 ? stored : DEFAULT_HEADER_W;
}

/** Is this world point inside the container's header strip? */
export function inContainerHeader(el: DiagramElement, point: { x: number; y: number }): boolean {
  if (!isHeaderContainer(el)) return false;
  if (point.y < el.y || point.y > el.y + el.height) return false;
  return point.x >= el.x && point.x <= el.x + containerHeaderWidth(el);
}
