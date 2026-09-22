/**
 * What dropping the Pool/Lane symbol at a point WOULD do — worked out once,
 * before anything happens.
 *
 * Paul, 2026-09-23: "When adding Lanes, sublanes etc. I want the user to have
 * some feedback about what would happen if they stop the Pool/Lane symbol
 * drag. How about as the drag moves inside the Pool a ghostly image of the new
 * Lane or Sublanes appears inside the Pool to show what would happen so the
 * user can move the cursor further down or up to get either another Lane or 2
 * sublanes within the current lane. If no new lane or sublane is going to be
 * created, then the Pool boundary should turn red to indicate nothing will
 * happen on release."
 *
 * So the drop has to be decided in ONE place, as data, and then either drawn
 * (the ghost) or carried out (the reducer). A preview computed separately from
 * the action is a promise nothing keeps: it drifts the first time either side
 * is touched, and the user is told they will get a lane and gets nothing.
 *
 * The plan carries the exact rectangles the drop would produce, so the ghost
 * is the shape itself and not an impression of it.
 *
 * Pure.
 */
import type { DiagramElement } from "./types";
import { contentBoundsOf, MIN_LEFT_GAP } from "./poolLaneBounds";
import { shrinkRoom, type Band, type StackEdge } from "./laneBands";
import { getLaneHeaderWidth, getPoolHeaderWidth, laneMetrics } from "./containerMetrics";

export interface Rect { x: number; y: number; width: number; height: number }

/** The least a band may be, whatever its name. */
export const MIN_BAND = 40;

/** Carving a band out of one neighbour — the shape of it, and what it costs. */
export interface CarvePlan {
  parentId: string;
  /** Where it lands in the parent's top-to-bottom stack. */
  index: number;
  /** The neighbour that gives the room, and which of its edges gives. */
  donorId: string;
  edge: StackEdge;
  /** How much height it gives, and how far its contents slide to allow it. */
  give: number;
  slide: number;
  label: string;
  rect: Rect;
}

export type LaneDropPlan =
  /** An empty pool: one lane filling its body. */
  | { kind: "first-lane"; poolId: string; label: string; rect: Rect }
  /** A lane in the pool, or a sublane in a lane — carved from a neighbour. */
  | { kind: "band"; poolId: string; band: "lane" | "sublane"; carve: CarvePlan }
  /** A lane with no sublanes, split down the middle into two. */
  | { kind: "split"; poolId: string; laneId: string; labels: [string, string]; rects: [Rect, Rect] }
  /** Nothing would happen — outside any pool, or no room for a band. */
  | { kind: "none"; poolId: string | null };

const lanesOf = (elements: DiagramElement[], parentId: string): DiagramElement[] =>
  elements.filter((e) => e.type === "lane" && e.parentId === parentId).sort((a, b) => a.y - b.y);

/** The next free "Lane N" / "Sublane N", named as the reducer names them. */
const nextLaneLabel = (elements: DiagramElement[]): string =>
  `Lane ${elements.filter((e) => e.type === "lane").length + 1}`;
const nextSublaneLabel = (elements: DiagramElement[], offset = 0): string =>
  `Sublane ${elements.filter((e) => e.type === "lane" && e.parentId).length + 1 + offset}`;

/**
 * Can a band be carved into `parentId` at `index`, and what would it look like?
 *
 * The room comes out of the neighbour it goes next to — the band below it for a
 * band on top, the band above it for one at the bottom, and between two bands
 * the taller of them (or `preferDonorId` when that neighbour is named). It
 * takes the empty space at that edge, beyond the neighbour's contents, up to
 * half its height; when that edge is crowded the neighbour's contents slide
 * away from it into its own free space at the far edge. It never takes more
 * than the neighbour's label — and its own sub-lanes' labels — can spare.
 *
 * `null` when what is left would be too small for the new band's name: the
 * drop would do nothing, which is what turns the pool boundary red.
 */
export function planCarve(
  elements: DiagramElement[],
  parentId: string,
  index: number,
  label: string,
  laneFs: number,
  preferDonorId?: string,
): CarvePlan | null {
  const parent = elements.find((e) => e.id === parentId);
  if (!parent || (parent.type !== "pool" && parent.type !== "lane")) return null;
  const bands = lanesOf(elements, parentId);
  if (bands.length === 0) return null;
  const at = Math.max(0, Math.min(bands.length, index));

  let donor: DiagramElement;
  let edge: StackEdge;
  const preferred = preferDonorId ? bands.findIndex((b) => b.id === preferDonorId) : -1;
  if (preferred >= 0 && preferred === at) { donor = bands[at]; edge = "first"; }
  else if (preferred >= 0 && preferred === at - 1) { donor = bands[at - 1]; edge = "last"; }
  else if (at === 0) { donor = bands[0]; edge = "first"; }
  else if (at === bands.length) { donor = bands[bands.length - 1]; edge = "last"; }
  else if (bands[at - 1].height >= bands[at].height) { donor = bands[at - 1]; edge = "last"; }
  else { donor = bands[at]; edge = "first"; }

  const bandTree = (lane: DiagramElement, depth = 0): Band => ({
    height: lane.height,
    min: Math.max(MIN_BAND, laneMetrics(lane.label ?? "", laneFs).minHeight),
    bands: depth > 12 ? [] : lanesOf(elements, lane.id).map((sub) => bandTree(sub, depth + 1)),
  });
  const room = shrinkRoom(bandTree(donor), edge);
  const need = Math.max(MIN_BAND, laneMetrics(label, laneFs).minHeight);
  const half = Math.floor(donor.height / 2);
  const content = contentBoundsOf(elements, donor.id);
  // Empty space inside the donor at the edge that gives, and at the far one.
  const emptyNear = !content ? donor.height
    : Math.max(0, edge === "last" ? donor.y + donor.height - (content.y + content.height) - MIN_LEFT_GAP
                                  : content.y - donor.y - MIN_LEFT_GAP);
  const emptyFar = !content ? 0
    : Math.max(0, edge === "last" ? content.y - donor.y - MIN_LEFT_GAP
                                  : donor.y + donor.height - (content.y + content.height) - MIN_LEFT_GAP);
  // Only a donor with no sub-lanes may slide its contents: sliding them past
  // fixed sublane dividers would change which sublane they sit in.
  const hasSubs = lanesOf(elements, donor.id).length > 0;
  const canSlide = content && !hasSubs ? emptyFar : 0;
  const give = Math.floor(Math.min(room, half, emptyNear >= need ? emptyNear : emptyNear + canSlide));
  if (give < need) return null;

  const headerW = parent.type === "pool" ? getPoolHeaderWidth(parent) : getLaneHeaderWidth(parent);
  return {
    parentId, index: at, donorId: donor.id, edge, give,
    slide: Math.max(0, give - emptyNear),
    label,
    rect: {
      x: parent.x + headerW,
      y: edge === "first" ? donor.y : donor.y + donor.height - give,
      width: parent.width - headerW,
      height: give,
    },
  };
}

/**
 * What the Pool/Lane symbol dropped at `at` would do.
 *
 * The zones, top to bottom inside a pool: the outer 20px add a lane above all
 * or below all; within 15px of a divider adds a lane between; inside a lane
 * that has no sublanes the middle third splits it in two and the rest adds a
 * lane beside it; inside a lane that has sublanes the same shape repeats one
 * level down. A pool with a single lane is the exception — wherever it lands,
 * it adds a second lane (Paul, 2026-09-22).
 */
export function planLaneDrop(
  elements: DiagramElement[],
  at: { x: number; y: number },
  laneFs: number,
): LaneDropPlan {
  const pool = elements.find(
    (e) => e.type === "pool" && at.x >= e.x && at.x <= e.x + e.width && at.y >= e.y && at.y <= e.y + e.height,
  );
  if (!pool) return { kind: "none", poolId: null };
  const poolId = pool.id;
  const lanes = lanesOf(elements, poolId);
  const TOP_BOTTOM = 20;
  const SEPARATOR = 15;
  const LANE_EDGE = 10;

  // An empty pool takes one lane filling its body.
  if (lanes.length === 0) {
    const headerW = getPoolHeaderWidth(pool);
    return {
      kind: "first-lane", poolId, label: nextLaneLabel(elements),
      rect: { x: pool.x + headerW, y: pool.y, width: pool.width - headerW, height: pool.height },
    };
  }

  const asBand = (carve: CarvePlan | null, band: "lane" | "sublane"): LaneDropPlan =>
    carve ? { kind: "band", poolId, band, carve } : { kind: "none", poolId };
  const lane = (index: number) => asBand(planCarve(elements, poolId, index, nextLaneLabel(elements), laneFs), "lane");

  // A pool with ONE lane always just gets a second one.
  if (lanes.length === 1) return lane(1);

  const poolBot = pool.y + pool.height;
  if (at.y - pool.y <= TOP_BOTTOM) return lane(0);
  if (poolBot - at.y <= TOP_BOTTOM) return lane(lanes.length);
  for (let i = 0; i < lanes.length - 1; i++) {
    if (Math.abs(at.y - (lanes[i].y + lanes[i].height)) <= SEPARATOR) return lane(i + 1);
  }

  const cursorLane = lanes.find((ln) => at.y >= ln.y && at.y <= ln.y + ln.height);
  if (!cursorLane) return { kind: "none", poolId };
  const subs = lanesOf(elements, cursorLane.id);
  const laneIndexAt = (y: number) => lanes.filter((l) => l.y < y - 0.5).length;
  const sublane = (index: number) =>
    asBand(planCarve(elements, cursorLane.id, index, nextSublaneLabel(elements), laneFs), "sublane");

  if (subs.length === 0) {
    // The middle third splits the lane into two sublanes; either side adds a
    // lane below it.
    if (at.y >= cursorLane.y + cursorLane.height / 3 && at.y <= cursorLane.y + (cursorLane.height * 2) / 3) {
      const headerW = getLaneHeaderWidth(cursorLane);
      const halfH = Math.max(MIN_BAND, Math.round(cursorLane.height / 2));
      const x = cursorLane.x + headerW;
      const width = cursorLane.width - headerW;
      // Both halves must fit their own names, or the split does nothing.
      const labels: [string, string] = [nextSublaneLabel(elements), nextSublaneLabel(elements, 1)];
      const needs = labels.map((l) => Math.max(MIN_BAND, laneMetrics(l, laneFs).minHeight));
      if (halfH < needs[0] || cursorLane.height - halfH < needs[1]) return { kind: "none", poolId };
      return {
        kind: "split", poolId, laneId: cursorLane.id, labels,
        rects: [
          { x, y: cursorLane.y, width, height: halfH },
          { x, y: cursorLane.y + halfH, width, height: cursorLane.height - halfH },
        ],
      };
    }
    return lane(laneIndexAt(cursorLane.y + cursorLane.height));
  }

  // A lane that already has sublanes: its own edges add LANES beside it, and
  // everything between adds a sublane, or splits one.
  const dyInLane = at.y - cursorLane.y;
  if (dyInLane <= LANE_EDGE) return lane(laneIndexAt(cursorLane.y));
  if (cursorLane.y + cursorLane.height - at.y <= LANE_EDGE) return lane(laneIndexAt(cursorLane.y + cursorLane.height));

  const splitTarget = subs.find((s) => at.y >= s.y + s.height / 3 && at.y <= s.y + (s.height * 2) / 3);
  if (splitTarget) {
    const headerW = getLaneHeaderWidth(splitTarget);
    const halfH = Math.max(MIN_BAND, Math.round(splitTarget.height / 2));
    const labels: [string, string] = [nextSublaneLabel(elements), nextSublaneLabel(elements, 1)];
    const needs = labels.map((l) => Math.max(MIN_BAND, laneMetrics(l, laneFs).minHeight));
    if (halfH < needs[0] || splitTarget.height - halfH < needs[1]) return { kind: "none", poolId };
    return {
      kind: "split", poolId, laneId: splitTarget.id, labels,
      rects: [
        { x: splitTarget.x + headerW, y: splitTarget.y, width: splitTarget.width - headerW, height: halfH },
        { x: splitTarget.x + headerW, y: splitTarget.y + halfH, width: splitTarget.width - headerW, height: splitTarget.height - halfH },
      ],
    };
  }
  const subIndexAt = (y: number) => subs.filter((sl) => sl.y < y - 0.5).length;
  if (at.y <= subs[0].y + subs[0].height / 3) return sublane(0);
  const lastSub = subs[subs.length - 1];
  if (at.y >= lastSub.y + (lastSub.height * 2) / 3) return sublane(subs.length);
  const cursorSub = subs.find((sl) => at.y >= sl.y && at.y <= sl.y + sl.height);
  if (!cursorSub) return { kind: "none", poolId };
  const upperHalf = at.y - cursorSub.y < cursorSub.height / 2;
  return sublane(subIndexAt(upperHalf ? cursorSub.y : cursorSub.y + cursorSub.height));
}

/**
 * Do two plans say the same thing? The canvas asks on every drag-over tick and
 * re-renders only when the answer has actually changed — a ghost redrawn at
 * every pixel of pointer travel would flicker.
 */
export function samePlan(a: LaneDropPlan | null, b: LaneDropPlan | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind || a.poolId !== b.poolId) return false;
  const sameRect = (r: Rect, t: Rect) => r.x === t.x && r.y === t.y && r.width === t.width && r.height === t.height;
  if (a.kind === "first-lane" && b.kind === "first-lane") return sameRect(a.rect, b.rect);
  if (a.kind === "band" && b.kind === "band") {
    return a.carve.parentId === b.carve.parentId && a.carve.donorId === b.carve.donorId
      && a.carve.edge === b.carve.edge && sameRect(a.carve.rect, b.carve.rect);
  }
  if (a.kind === "split" && b.kind === "split") {
    return a.laneId === b.laneId && sameRect(a.rects[0], b.rects[0]) && sameRect(a.rects[1], b.rects[1]);
  }
  return a.kind === "none";
}
