/**
 * The pools above and below follow the edge that moved — ONE rule, one place (Paul, 2026-10-03/04).
 *
 * "If either the top boundary or the bottom boundary moves then all pools above or below the pool being compressed must
 * move respectively with the pool boundary that moved", and the same for moving a pool's bottom boundary by hand or by
 * voice: shrink it and the pools below come up with it; grow it and they go down; likewise the top edge and the pools above.
 * The gaps between the pools are kept, and everything in a moved pool (lanes, elements, edge events, notes) goes with it.
 *
 * Pure. Used by COMPRESS_POOL and by RESIZE_ELEMENT on a pool.
 */
import type { DiagramElement } from "./types";
import { getAllDescendantIds } from "./containment";

/**
 * Move every pool that lay wholly ABOVE `before` by how far its top edge moved, and every pool that lay wholly BELOW it by
 * how far its bottom edge moved. `elements` holds the other pools where they were; the resized pool itself is left alone.
 */
export function shiftNeighbourPools(
  elements: readonly DiagramElement[],
  poolId: string,
  before: { y: number; height: number },
  after: { y: number; height: number },
): DiagramElement[] {
  const dTop = after.y - before.y;
  const dBottom = (after.y + after.height) - (before.y + before.height);
  if (!dTop && !dBottom) return elements as DiagramElement[];
  const shifted = new Map<string, number>();
  for (const p of elements) {
    if (p.type !== "pool" || p.id === poolId) continue;
    const d = p.y + p.height <= before.y + 0.5 ? dTop : p.y >= before.y + before.height - 0.5 ? dBottom : 0;
    if (!d) continue;
    shifted.set(p.id, d);
    for (const id of getAllDescendantIds(elements as DiagramElement[], p.id)) shifted.set(id, d);
  }
  if (!shifted.size) return elements as DiagramElement[];
  return elements.map((e) => (shifted.has(e.id) ? { ...e, y: e.y + shifted.get(e.id)! } : e));
}
