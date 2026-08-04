/**
 * Pure geometry for the Tier-1 "assist-while-you-draw" ghost placement rules
 * (no React / DOM), so it's unit-testable and shared. Positions returned as
 * CENTERS, matching `addElement` (the reducer subtracts half-size).
 *
 * Rules (Paul, 2026-08-04):
 *  1. Inline — target's near edge 51px (½ Task width) from the source's far
 *     edge; vertical centres aligned.
 *  2. Gateway branches — 1st inline, then fan out ±rows (above, below, above²,
 *     below²…), each row 51px (nearest-edge) from its neighbour.
 *  3. Boundary event — trigger-less intermediate event on the host boundary,
 *     near edge 18px (½ event width) from a corner; 1st bottom-right, 2nd
 *     top-right, then alternate 18px from the last neighbour; give up when full.
 *  4. No overlap — nudge to the NEAREST slot whose box is ≥51px clear.
 */
import type { DiagramElement, SymbolType } from "./types";
import { getSymbolDefinition } from "./symbols/definitions";

export const HALF_TASK_W = 51;   // ½ Task width (Task = 102)
export const HALF_EVENT_W = 18;  // ½ event width (event = 36)

export interface Box { x: number; y: number; width: number; height: number }
export interface Center { x: number; y: number }

export function sizeOf(type: SymbolType): { w: number; h: number } {
  const d = getSymbolDefinition(type);
  return { w: d.defaultWidth, h: d.defaultHeight };
}

const cxOf = (e: Box) => e.x + e.width / 2;
const cyOf = (e: Box) => e.y + e.height / 2;

/** Rule 1 — inline to the right, vertical centres aligned. Returns a CENTER. */
export function placeInline(source: Box, w: number, h: number): Center {
  return {
    x: source.x + source.width + HALF_TASK_W + w / 2,
    y: source.y + source.height / 2,
  };
}

/**
 * Rule 2 — gateway branch by index. Branch 0 is inline (same line as the
 * gateway centre); 1 above, 2 below, 3 above², 4 below²… Rows are `h + 51`
 * apart centre-to-centre so nearest edges are 51px clear. Returns a CENTER.
 */
export function placeGatewayBranch(gateway: Box, branchIndex: number, w: number, h: number): Center {
  const x = gateway.x + gateway.width + HALF_TASK_W + w / 2;
  // index 0 → row 0; 1 → -1; 2 → +1; 3 → -2; 4 → +2 …
  const row = Math.ceil(branchIndex / 2);
  const sign = branchIndex % 2 === 1 ? -1 : 1;
  const y = cyOf(gateway) + sign * row * (h + HALF_TASK_W);
  return { x, y };
}

/**
 * Rule 3 — next boundary-event CENTER on the host, or null when both edges are
 * full ("give up"). `existing` = the host's current boundary events (any that
 * sit on its top/bottom edge). Offset is measured corner → NEAR edge = 18px.
 *
 * 1st: bottom edge, near (right) edge 18px from the bottom-right corner.
 * 2nd: top edge, near edge 18px from the top-right corner.
 * Then whichever edge has room, 18px from the leftmost event already on it.
 */
export function placeBoundaryEvent(
  host: Box,
  existing: DiagramElement[],
  eventW = HALF_EVENT_W * 2,
  eventH = HALF_EVENT_W * 2,
): Center | null {
  const rightX = host.x + host.width;
  const leftLimit = host.x; // events must stay within the host's horizontal span
  // Split existing boundary events by which horizontal edge they hug.
  const onEdge = (e: DiagramElement, edgeY: number) => Math.abs(cyOf(e) - edgeY) < eventH;
  const bottomY = host.y + host.height;
  const topY = host.y;
  const bottom = existing.filter((e) => onEdge(e, bottomY)).sort((a, b) => a.x - b.x);
  const top = existing.filter((e) => onEdge(e, topY)).sort((a, b) => a.x - b.x);

  // Rightmost free near-edge X for the next event on an edge (its RIGHT edge).
  const nextRightEdge = (row: DiagramElement[]) =>
    row.length === 0
      ? rightX - HALF_EVENT_W                      // 18px in from the right corner
      : Math.min(...row.map((e) => e.x)) - HALF_EVENT_W; // 18px left of the leftmost neighbour

  const centerFor = (rightEdge: number, edgeY: number): Center | null => {
    const cx = rightEdge - eventW / 2;
    if (cx - eventW / 2 < leftLimit) return null; // ran off the left corner → no room
    return { x: cx, y: edgeY };
  };

  // 1st → bottom, 2nd → top, then the edge with the most room (fewest events).
  if (bottom.length === 0) return centerFor(nextRightEdge(bottom), bottomY);
  if (top.length === 0) return centerFor(nextRightEdge(top), topY);
  const useBottom = bottom.length <= top.length;
  const edgeY = useBottom ? bottomY : topY;
  const row = useBottom ? bottom : top;
  const here = centerFor(nextRightEdge(row), edgeY);
  if (here) return here;
  // preferred edge full — try the other
  const otherY = useBottom ? topY : bottomY;
  const otherRow = useBottom ? top : bottom;
  return centerFor(nextRightEdge(otherRow), otherY);
}

/** AABB overlap test with `pad` breathing room on the moving box. */
function overlaps(a: Box, others: Box[], pad: number): boolean {
  const ax1 = a.x - pad, ay1 = a.y - pad, ax2 = a.x + a.width + pad, ay2 = a.y + a.height + pad;
  return others.some((b) => ax1 < b.x + b.width && ax2 > b.x && ay1 < b.y + b.height && ay2 > b.y);
}

/**
 * Rule 4 — nearest free slot. Given a desired CENTER for a w×h box, return the
 * nearest center whose box keeps ≥`clearance` from every `others` box. Spirals
 * outward in `clearance`-sized steps (right, down, up, then diagonals) and picks
 * the closest clear candidate; falls back to the desired center if none found.
 */
export function findFreeSlot(
  center: Center,
  w: number,
  h: number,
  others: Box[],
  clearance = HALF_TASK_W,
  maxRings = 12,
): Center {
  const boxAt = (c: Center): Box => ({ x: c.x - w / 2, y: c.y - h / 2, width: w, height: h });
  if (!overlaps(boxAt(center), others, clearance)) return center;

  const step = clearance + Math.max(w, h) / 2;
  // Directions ordered by preference: right, down, up, then diagonals.
  const dirs: Center[] = [
    { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 0 }, { x: -1, y: 1 }, { x: -1, y: -1 },
  ];
  for (let ring = 1; ring <= maxRings; ring++) {
    for (const d of dirs) {
      const cand = { x: center.x + d.x * step * ring, y: center.y + d.y * step * ring };
      if (!overlaps(boxAt(cand), others, clearance)) return cand;
    }
  }
  return center; // give up gracefully — better a slight overlap than nowhere
}

/** Convert a CENTER + size to a top-left Box (for callers that need bounds). */
export function boxFromCenter(c: Center, w: number, h: number): Box {
  return { x: c.x - w / 2, y: c.y - h / 2, width: w, height: h };
}
