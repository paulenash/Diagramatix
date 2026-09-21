/**
 * A lane's sub-lanes must always exactly fill it.
 *
 * THE BUG THIS EXISTS FOR (Paul, 2026-09-21, with before/after exports).
 * Deleting a lane gives its vertical slice to a neighbour — the "adjacent
 * absorbs" model. The neighbour's `y` and `height` were changed and nothing
 * else was, so when the absorbing lane had SUB-LANES they kept their old
 * sizes and a void opened up:
 *
 *   before   shipping   y= 99 h=262   domestic 99–286 + international 286–361
 *   after    shipping   y=104 h=519   domestic 104–291 + international 291–366
 *                                     ↳ 257px of empty lane below them
 *
 * 257px is exactly the deleted lane's height. The parent grew; its children
 * did not.
 *
 * WHICH SUB-LANE TAKES THE SPACE. The edge that moved decides it. A lane that
 * grew at the bottom gives the space to its BOTTOM-most sub-lane; one that
 * grew at the top, to its TOP-most. That mirrors "the neighbour nearest the
 * space takes it" one level down, and — more importantly — it leaves every
 * other sub-lane exactly as it was. Scaling them all proportionally would
 * silently resize bands the user never mentioned, which is a worse surprise
 * than the void.
 *
 * Recursive, because the sub-lane that grows may have sub-lanes of its own.
 *
 * Pure.
 */
import type { DiagramElement } from "./types";

const isLane = (e: DiagramElement) => e.type === "lane" || e.type === "sublane";

/**
 * Make `laneId`'s direct sub-lanes span it exactly.
 *
 * Returns the elements unchanged when the lane has no sub-lanes, or when they
 * already fill it — so this is safe to call after any lane resize.
 */
export function fillLaneWithSublanes(
  elements: readonly DiagramElement[],
  laneId: string,
): DiagramElement[] {
  const lane = elements.find((e) => e.id === laneId);
  if (!lane) return elements as DiagramElement[];

  const subs = elements
    .filter((e) => isLane(e) && e.parentId === laneId)
    .sort((a, b) => a.y - b.y);
  if (subs.length === 0) return elements as DiagramElement[];

  const top = lane.y;
  const bottom = lane.y + lane.height;
  const subsTop = subs[0].y;
  const subsBottom = subs[subs.length - 1].y + subs[subs.length - 1].height;

  // Already flush — nothing to do, and no pointless new array identities.
  if (Math.abs(subsTop - top) < 0.5 && Math.abs(subsBottom - bottom) < 0.5) {
    return elements as DiagramElement[];
  }

  const grow = new Map<string, { y: number; height: number }>();

  // The top-most sub-lane takes any space opened above it.
  if (Math.abs(subsTop - top) >= 0.5) {
    const first = subs[0];
    grow.set(first.id, { y: top, height: first.y + first.height - top });
  }
  // The bottom-most takes any space opened below.
  if (Math.abs(subsBottom - bottom) >= 0.5) {
    const last = subs[subs.length - 1];
    const y = grow.get(last.id)?.y ?? last.y;
    grow.set(last.id, { y, height: bottom - y });
  }
  if (grow.size === 0) return elements as DiagramElement[];

  let out = (elements as DiagramElement[]).map((e) => {
    const g = grow.get(e.id);
    return g ? { ...e, y: g.y, height: g.height } : e;
  });

  // A sub-lane that grew may itself have sub-lanes with the same problem.
  for (const id of grow.keys()) out = fillLaneWithSublanes(out, id);
  return out;
}

/**
 * The gap between a lane and its sub-lanes, for a test or a diagnostic.
 * Zero when they fill it exactly.
 */
export function sublaneVoid(elements: readonly DiagramElement[], laneId: string): number {
  const lane = elements.find((e) => e.id === laneId);
  if (!lane) return 0;
  const subs = elements.filter((e) => isLane(e) && e.parentId === laneId);
  if (!subs.length) return 0;
  const subsTop = Math.min(...subs.map((s) => s.y));
  const subsBottom = Math.max(...subs.map((s) => s.y + s.height));
  return Math.max(0, subsTop - lane.y) + Math.max(0, lane.y + lane.height - subsBottom);
}
