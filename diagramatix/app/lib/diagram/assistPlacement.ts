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
import { outerSideOfBox, getBoundaryEventOuterSide, pickBoundaryEventSide, oppositeSide } from "./routing";
import { flowScopeOf } from "./canConnect";

export const HALF_TASK_W = 51;   // ½ Task width (Task = 102)
export const HALF_TASK_H = 32;   // ½ Task height (Task = 64) — vertical branch gap
export const HALF_EVENT_W = 18;  // ½ event width (event = 36)
export const BOUNDARY_FOLLOW_GAP = 50;  // R7: gap from a boundary event's outer edge to the following task

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
 * gateway centre); 1 above, 2 below, 3 above², 4 below²… Rows are `h + ½ Task
 * height` apart centre-to-centre so a stacked branch sits just ½ a Task height
 * (32px) clear of its nearest neighbour (#5). Returns a CENTER.
 */
export function placeGatewayBranch(gateway: Box, branchIndex: number, w: number, h: number): Center {
  const x = gateway.x + gateway.width + HALF_TASK_W + w / 2;
  // index 0 → row 0; 1 → -1; 2 → +1; 3 → -2; 4 → +2 …
  const row = Math.ceil(branchIndex / 2);
  const sign = branchIndex % 2 === 1 ? -1 : 1;
  const y = cyOf(gateway) + sign * row * (h + HALF_TASK_H);
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

export type OuterSide = "top" | "bottom" | "left" | "right";

/** Which host edge a boundary event sits on (= the side it faces outward).
 *  Routing's geometry, not a copy of it. */
export function boundaryOuterSide(event: Box, host: Box): OuterSide {
  return outerSideOfBox(event, host);
}

/**
 * True when a boundary event's outgoing flow runs INTO its host — a Start
 * mounted on an expanded subprocess's edge. Asked of canConnect's scope rule
 * (`flowScopeOf`), not restated. Only an expanded subprocess can hold the
 * step: a Start on a task's edge also scopes its flow to its host, but a task
 * has no inside, so that step stays outside (and is left unconnected).
 */
function flowRunsIntoHost(anchor: DiagramElement, els: DiagramElement[]): boolean {
  if (!anchor.boundaryHostId || flowScopeOf(anchor, "source", els) !== anchor.boundaryHostId) return false;
  return els.find((e) => e.id === anchor.boundaryHostId)?.type === "subprocess-expanded";
}

/**
 * Where a step that FOLLOWS `anchor` lives — the container its new element
 * joins, so the flow to it stays in scope. Normally the anchor's own. After a
 * boundary event it is decided by canConnect's scope rule (`flowScopeOf`): a
 * boundary intermediate event's flow continues OUTSIDE its host, in the scope
 * the host itself sits in, so the step joins the HOST's container — never the
 * host. (A Start on a subprocess's edge flows into the subprocess, so its step
 * joins the subprocess.)
 *
 * The anchor's own parentId is not safe to use here. Paul's Event 4 carried
 * its host as its parent, so "add a task after event four" made the task a
 * child of the subprocess: the subprocess grew to swallow it, and the flow was
 * then refused because the two ends were in different scopes.
 */
export function followOnParentId(anchor: DiagramElement, els: DiagramElement[]): string | undefined {
  if (!anchor.boundaryHostId) return anchor.parentId ?? undefined;
  const host = els.find((e) => e.id === anchor.boundaryHostId);
  if (!host) return anchor.parentId && anchor.parentId !== anchor.boundaryHostId ? anchor.parentId : undefined;
  return flowRunsIntoHost(anchor, els) ? host.id : host.parentId ?? undefined;
}

/**
 * R7.07 — keep a boundary event's exit target inside the event's own lane
 * band ("Keep it fully inside the EMIE's own lane"). Clamping is enough while
 * the band has room; when it hasn't — or the clamp would pull the target back
 * over the event (closer than 8px, so no longer recognisably an L) — the target
 * keeps its wanted spot and `grow` says what the band must grow to contain.
 *
 * One rule for both makers: the generated layout (bpmnLayout, which grows its
 * own band) and the editor's add-after (planBoundaryFollowOn, whose reducer
 * grows the lane).
 */
export function clampExitTargetToBand(
  ev: Box,
  side: string | null,
  targetHeight: number,
  wantTop: number,
  band: { y: number; height: number },
  pad: number,
): { top: number; grow?: { top: number; bottom: number } } {
  const lo = band.y + pad;
  const hi = band.y + band.height - pad - targetHeight;
  let top = wantTop;
  if (hi >= lo) top = Math.min(Math.max(top, lo), hi);
  const minGap = 8;                                // still recognisably an L
  const overshootsDown = side === "bottom" && top < ev.y + ev.height + minGap;
  const overshootsUp   = side === "top"    && top + targetHeight > ev.y - minGap;
  if (hi < lo || overshootsDown || overshootsUp) {
    return { top: wantTop, grow: { top: wantTop - pad, bottom: wantTop + targetHeight + pad } };
  }
  return { top };
}

/** The gap the editor keeps between a lane's edge and a child — the same 8px
 *  the reducer's container passes keep. */
export const LANE_CHILD_PAD = 8;

export interface BoundaryFollowOn {
  /** Where the new element goes (a CENTER), clear of `others`. */
  center: Center;
  /** The side the flow will leave the event by — the reducer's own R7.02
   *  answer for a target at `center`, so the placement and the flow agree. */
  side: OuterSide;
  /** The container the new element joins (followOnParentId). */
  parentId?: string;
  /** Set when that container is a lane: the new element must stay in it, and
   *  the reducer grows the lane when it doesn't fit (ADD_ELEMENT keepInLane). */
  laneId?: string;
}

/**
 * Rule R7 in the editor — place a step after a boundary event (voice "add …
 * after <event>" and the ghost next-step accept both ask this).
 *
 * The side comes from R7.02 as the reducer applies it (routing's
 * pickBoundaryEventSide — what boundaryEndSide gives every follow-on that can
 * be connected), asked of the spot the step would take, so the step is placed
 * for the side the flow will actually leave by. Top/bottom exits are then
 * clamped into the host's lane (R7.07) before the free-slot nudge.
 *
 * `others` are the obstacles the caller sees (every element that is not a pool
 * or lane). When the step goes INSIDE the host (a Start's), the host is its
 * container, not an obstacle: counted as one, it pushed every spot inside it
 * back out, and the subprocess then grew round a step placed below it, with
 * the flow running down the inside of its edge. Its children still count.
 */
export function planBoundaryFollowOn(
  anchor: DiagramElement,
  els: DiagramElement[],
  w: number,
  h: number,
  others: Box[],
): BoundaryFollowOn {
  // Out of the host's outer face — or, for a Start whose flow runs into its
  // host, the inner face, so the step lands inside.
  const outer: OuterSide = getBoundaryEventOuterSide(anchor, els) ?? "bottom";
  const inside = flowRunsIntoHost(anchor, els);
  const host = inside ? els.find((e) => e.id === anchor.boundaryHostId) : undefined;
  const obstacles = host
    ? others.filter((b) => !(b.x === host.x && b.y === host.y && b.width === host.width && b.height === host.height))
    : others;
  let side: OuterSide = inside ? oppositeSide(outer) : outer;
  let want = placeAfterBoundaryEvent(anchor, side, w, h);
  const agreed = pickBoundaryEventSide(anchor, boxFromCenter(want, w, h), els);
  if (agreed && agreed !== side) {
    side = agreed;
    want = placeAfterBoundaryEvent(anchor, side, w, h);
  }
  const parentId = followOnParentId(anchor, els);
  const parent = parentId ? els.find((e) => e.id === parentId) : undefined;
  const lane = parent && (parent.type === "lane" || parent.type === "sublane") ? parent : undefined;
  if (lane && (side === "top" || side === "bottom")) {
    const { top } = clampExitTargetToBand(anchor, side, h, want.y - h / 2, lane, LANE_CHILD_PAD);
    want = { x: want.x, y: top + h / 2 };
  }
  return {
    center: findFreeSlot(want, w, h, obstacles),
    side,
    ...(parentId ? { parentId } : {}),
    ...(lane ? { laneId: lane.id } : {}),
  };
}

/**
 * Rule R7 — a task placed AFTER a boundary event goes to the event's bottom-right
 * (event on the bottom edge) or top-right (top edge), with its near edge
 * BOUNDARY_FOLLOW_GAP (50px) beyond the event's outer (lowest/highest) point, and
 * shifted right so the connector can leave the event's outer face and turn into
 * the task's left side. Side-mounted events go straight out. Returns a CENTER.
 */
export function placeAfterBoundaryEvent(event: Box, side: OuterSide, w: number, h: number): Center {
  const ecx = cxOf(event), ecy = cyOf(event);
  const dxRight = event.width / 2 + HALF_TASK_W + w / 2;
  if (side === "bottom") return { x: ecx + dxRight, y: event.y + event.height + BOUNDARY_FOLLOW_GAP + h / 2 };
  if (side === "top") return { x: ecx + dxRight, y: event.y - BOUNDARY_FOLLOW_GAP - h / 2 };
  if (side === "left") return { x: event.x - BOUNDARY_FOLLOW_GAP - w / 2, y: ecy };
  return { x: event.x + event.width + BOUNDARY_FOLLOW_GAP + w / 2, y: ecy };
}
