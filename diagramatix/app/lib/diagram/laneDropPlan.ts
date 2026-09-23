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
import { uniqueContainerLabel } from "./containerNames";
import { bandsMovedByCarve } from "./laneStack";

export interface Rect { x: number; y: number; width: number; height: number }

/**
 * A band as it will be drawn: its box, the width of its OWN header strip (the
 * strip lives inside the box, at its left edge — see `LaneShape`), and the
 * name that will be written down it.
 */
export interface BandPreview extends Rect { headerWidth: number; label: string }

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
  /** How much height it gives up. */
  give: number;
  label: string;
  rect: Rect;
  /** The width of the new band's own header strip. */
  headerWidth: number;
}

export type LaneDropPlan =
  /** An empty pool: one lane filling its body. */
  | { kind: "first-lane"; poolId: string; label: string; rect: Rect; headerWidth: number }
  /** A lane in the pool, or a sublane in a lane — carved from a neighbour. */
  | { kind: "band"; poolId: string; band: "lane" | "sublane"; carve: CarvePlan }
  /** A lane with no sublanes, split down the middle into two. */
  | { kind: "split"; poolId: string; laneId: string; labels: [string, string]; rects: [Rect, Rect]; headerWidth: number }
  /** Nothing would happen — outside any pool, or no room for a band. */
  | { kind: "none"; poolId: string | null };

/**
 * The bands a plan would create, ready to draw: box, own header strip, name.
 * Empty for a plan that would create nothing, which is the red-boundary case.
 */
export function previewBands(plan: LaneDropPlan): BandPreview[] {
  if (plan.kind === "first-lane") return [{ ...plan.rect, headerWidth: plan.headerWidth, label: plan.label }];
  if (plan.kind === "band") return [{ ...plan.carve.rect, headerWidth: plan.carve.headerWidth, label: plan.carve.label }];
  if (plan.kind === "split") {
    return plan.rects.map((r, i) => ({ ...r, headerWidth: plan.headerWidth, label: plan.labels[i] }));
  }
  return [];
}

/**
 * The bands that are ALREADY there and will be moved or resized by the drop,
 * each with the name it already has and the box it is about to have.
 *
 * Paul, 2026-09-23: "in addition move the current name of any sibling whose
 * name will be affected, to its new position and show in the same ghostly way
 * so that new names never appear over the top of old names."
 *
 * The new band takes its room from a neighbour, so that neighbour's name — set
 * down the middle of its header strip — ends up somewhere else. Drawn where it
 * is going, and hidden where it is, the two never sit on top of each other and
 * the whole answer is visible before the mouse is released.
 *
 * Only a carve moves anything: a split leaves the lane's own box alone, and a
 * first lane fills an empty pool.
 */
export function movedBands(
  plan: LaneDropPlan, elements: DiagramElement[], laneFs: number, poolFs = 16,
): Array<BandPreview & { id: string }> {
  if (plan.kind !== "band") return [];
  return bandsMovedByCarve(elements, plan.carve, poolFs, laneFs).map((b) => ({
    id: b.id, x: b.x, y: b.y, width: b.width, height: b.height,
    headerWidth: getLaneHeaderWidth(elements.find((e) => e.id === b.id) ?? ({ properties: {} } as DiagramElement)),
    label: b.label,
  }));
}

/** The ids whose real name must come off while the ghost shows it moving. */
export function movedBandIds(plan: LaneDropPlan, elements: DiagramElement[], laneFs: number, poolFs = 16): string[] {
  if (plan.kind !== "band") return [];
  return bandsMovedByCarve(elements, plan.carve, poolFs, laneFs).map((b) => b.id);
}

const lanesOf = (elements: DiagramElement[], parentId: string): DiagramElement[] =>
  elements.filter((e) => e.type === "lane" && e.parentId === parentId).sort((a, b) => a.y - b.y);

/**
 * The name the new band will REALLY be given — the reducer's own naming, asked
 * here so the ghost can show it before the drop (Paul, 2026-09-23: "Just show
 * the new child or children that will be created with their header regions and
 * proposed initial names").
 */
const nextLaneLabel = (elements: DiagramElement[]): string =>
  uniqueContainerLabel(elements, undefined, "Lane");
const nextSublaneLabel = (elements: DiagramElement[], taken: string[] = []): string =>
  uniqueContainerLabel(
    // The names already promised in this same plan count as taken, so a split
    // never proposes the same name twice.
    [...elements, ...taken.map((label, i) => ({ id: `__planned_${i}`, type: "lane", label } as unknown as DiagramElement))],
    undefined, "Sublane",
  );

/**
 * Can a band be carved into `parentId` at `index`, and what would it look like?
 *
 * The room comes out of the neighbour it goes next to — the band below it for a
 * band on top, the band above it for one at the bottom, and between two bands
 * the taller of them (or `preferDonorId` when that neighbour is named).
 *
 * It takes the EMPTY space at that edge if there is enough of it, or the empty
 * space at the other end of the stack if that end has it, and otherwise HALVES
 * the neighbour — which may leave an element across the new divider, for the
 * user to sort out (Paul, 2026-09-23). It never takes more than the
 * neighbour's label, or its sub-lanes' labels, can spare.
 *
 * `null` only when what is left could not carry the new band's NAME down its
 * header. That refusal is what turns the pool boundary red.
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
  const need = Math.max(MIN_BAND, laneMetrics(label, laneFs).minHeight);
  const room = shrinkRoom(bandTree(donor), edge);
  const content = contentBoundsOf(elements, donor.id);

  // EMPTY SPACE FIRST, THEN HALVE. Paul, 2026-09-23: "always add the new lane
  // by trying to locate it at the top or the bottom where there are no
  // existing elements, if possible. If this is not possible just divide the
  // Pool in two and let the user resolve the lane divider issue if some
  // elements now straddle two lanes. … Only reject adding at any level if the
  // new lane/sublane etc. has not enough space for the name in its header
  // region."
  //
  // So there are exactly two answers and one refusal. The empty space at an
  // edge is the good answer, and the edge with room is preferred over the edge
  // the index asked for — a lane added "at the top" of a pool whose top lane is
  // full, but whose bottom lane is empty, is better placed at the bottom than
  // refused. Halving is the fallback, and it may leave an element across the
  // new divider; that is the user's to sort out, and they can see it.
  const emptyAt = (band: DiagramElement, at: StackEdge): number => {
    const inside = contentBoundsOf(elements, band.id);
    if (!inside) return band.height;
    return Math.max(0, at === "last"
      ? band.y + band.height - (inside.y + inside.height) - MIN_LEFT_GAP
      : inside.y - band.y - MIN_LEFT_GAP);
  };

  let give = Math.floor(Math.min(room, Math.max(need, emptyAt(donor, edge))));
  let fromEmptySpace = emptyAt(donor, edge) >= need;
  if (!fromEmptySpace) {
    // The other end of the stack, when it has the room this end has not.
    const other = edge === "first" ? bands[bands.length - 1] : bands[0];
    const otherEdge: StackEdge = edge === "first" ? "last" : "first";
    if (other && other.id !== donor.id && emptyAt(other, otherEdge) >= need
        && shrinkRoom(bandTree(other), otherEdge) >= need) {
      donor = other;
      edge = otherEdge;
      give = Math.floor(Math.min(shrinkRoom(bandTree(donor), edge), emptyAt(donor, edge)));
      fromEmptySpace = true;
    }
  }
  if (!fromEmptySpace) {
    // Halve the donor. Content may end up straddling the new divider.
    give = Math.floor(Math.min(room, donor.height / 2));
  }
  // The ONLY refusal: what is left could not carry the name down its header.
  if (give < need) return null;
  void content;

  const headerW = parent.type === "pool" ? getPoolHeaderWidth(parent) : getLaneHeaderWidth(parent);
  // Its own strip matches its siblings', which the reducer keeps in step.
  const ownHeaderW = getLaneHeaderWidth(bands[0]);
  return {
    parentId, index: at, donorId: donor.id, edge, give,
    label, headerWidth: ownHeaderW,
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
      kind: "first-lane", poolId, label: nextLaneLabel(elements), headerWidth: 36,
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
      const first = nextSublaneLabel(elements);
      const labels: [string, string] = [first, nextSublaneLabel(elements, [first])];
      const needs = labels.map((l) => Math.max(MIN_BAND, laneMetrics(l, laneFs).minHeight));
      if (halfH < needs[0] || cursorLane.height - halfH < needs[1]) return { kind: "none", poolId };
      return {
        kind: "split", poolId, laneId: cursorLane.id, labels,
        headerWidth: getLaneHeaderWidth(cursorLane),
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
    const firstSub = nextSublaneLabel(elements);
    const labels: [string, string] = [firstSub, nextSublaneLabel(elements, [firstSub])];
    const needs = labels.map((l) => Math.max(MIN_BAND, laneMetrics(l, laneFs).minHeight));
    if (halfH < needs[0] || splitTarget.height - halfH < needs[1]) return { kind: "none", poolId };
    return {
      kind: "split", poolId, laneId: splitTarget.id, labels,
      headerWidth: getLaneHeaderWidth(splitTarget),
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
