/**
 * Re-fitting a stack of lanes after one of them changed size — the geometry
 * half of a carve, and nothing else.
 *
 * Lifted out of the reducer on 2026-09-23 so the lane-drop GHOST can show what
 * a drop will do to the bands that are already there. Paul: "in addition move
 * the current name of any sibling whose name will be affected, to its new
 * position and show in the same ghostly way so that new names never appear
 * over the top of old names." The ghost can only do that honestly if it works
 * the new positions out with the very code that will produce them.
 *
 * Pure.
 */
import type { DiagramElement } from "./types";
import { absorbAtEdge, stackFrom, type Band, type StackEdge } from "./laneBands";
import { getLaneHeaderWidth, minHeightForContainer } from "./containerMetrics";

/**
 * Move a lane's whole sub-lane subtree by `dy`, keeping every height, and
 * re-fit it to the lane's x / width.
 *
 * The counterpart to `absorbAtEdge`: a band that did NOT absorb the change
 * keeps its size, so its own dividers must not move either — they simply
 * travel with it. Rescaling it instead is what made every divider in the
 * stack shift when only one boundary was dragged.
 */
export function shiftSublanesBy(
  elements: DiagramElement[],
  laneId: string,
  dy: number,
  laneX: number,
  laneW: number,
): DiagramElement[] {
  const lane = elements.find((e) => e.id === laneId);
  if (!lane) return elements;
  const LANE_LW = getLaneHeaderWidth(lane);
  const subs = elements.filter((e) => e.type === "lane" && e.parentId === laneId);
  if (subs.length === 0) return elements;
  let result = elements;
  for (const sub of subs) {
    const updated: DiagramElement = {
      ...sub,
      x: laneX + LANE_LW,
      y: sub.y + dy,
      width: laneW - LANE_LW,
    };
    result = result.map((e) => (e.id === sub.id ? updated : e));
    result = shiftSublanesBy(result, sub.id, dy, updated.x, updated.width);
  }
  return result;
}

/**
 * Re-fit a lane's sub-lanes to its (already-updated) y / height / x / width,
 * the band at `edge` taking the whole change. Recurses: a sub-lane that
 * absorbs re-fits its own bands at the SAME edge, because the same edge of it
 * is the one that moved. Every other band keeps its height and simply travels,
 * so its dividers stay put (Paul, 2026-09-21: "Only the boundary should move").
 */
export function refitStackAtEdge(
  els: DiagramElement[], laneId: string,
  laneY: number, laneH: number, laneX: number, laneW: number,
  edge: StackEdge, poolFs: number, laneFs: number,
): DiagramElement[] {
  const lane = els.find((e) => e.id === laneId);
  const LANE_LW = lane ? getLaneHeaderWidth(lane) : 36;
  const subs = els.filter((e) => e.type === "lane" && e.parentId === laneId).sort((a, b) => a.y - b.y);
  if (subs.length === 0) return els;
  const bands: Band[] = subs.map((sub) => ({
    height: sub.height,
    min: minHeightForContainer(sub, els, poolFs, laneFs),
  }));
  const delta = laneH - bands.reduce((sum, b) => sum + b.height, 0);
  const heights = absorbAtEdge(bands, delta, edge);
  const ys = stackFrom(laneY, heights);
  const absorbing = edge === "first" ? 0 : subs.length - 1;
  let result = els;
  for (let i = 0; i < subs.length; i++) {
    const newSubX = laneX + LANE_LW;
    const newSubW = laneW - LANE_LW;
    const updatedSub: DiagramElement = { ...subs[i], x: newSubX, y: ys[i], width: newSubW, height: heights[i] };
    result = result.map((e) => (e.id === subs[i].id ? updatedSub : e));
    if (i === absorbing) {
      result = refitStackAtEdge(result, subs[i].id, ys[i], heights[i], newSubX, newSubW, edge, poolFs, laneFs);
    } else {
      result = shiftSublanesBy(result, subs[i].id, ys[i] - subs[i].y, newSubX, newSubW);
    }
  }
  return result;
}

/** A band's box after a carve, with the name it already has. */
export interface MovedBand { id: string; label: string; x: number; y: number; width: number; height: number }

/**
 * The elements after a band has given `give` away at `edge` — the donor
 * resized, and its own sub-lanes re-fitted at the same edge.
 *
 * This is the geometry the reducer applies and the ghost draws. Nothing is
 * ADDED here: the new band is the caller's business.
 */
export function carveGeometry(
  elements: DiagramElement[],
  carve: { donorId: string; edge: StackEdge; give: number },
  poolFs: number,
  laneFs: number,
): DiagramElement[] {
  const donor = elements.find((e) => e.id === carve.donorId);
  if (!donor) return elements;
  const donorY = carve.edge === "first" ? donor.y + carve.give : donor.y;
  const donorH = donor.height - carve.give;
  const resized = elements.map((e) => (e.id === donor.id ? { ...e, y: donorY, height: donorH } : e));
  return refitStackAtEdge(resized, donor.id, donorY, donorH, donor.x, donor.width, carve.edge, poolFs, laneFs);
}

/** Every band the carve moves or resizes, with its box AFTERWARDS. */
export function bandsMovedByCarve(
  elements: DiagramElement[],
  carve: { donorId: string; edge: StackEdge; give: number },
  poolFs: number,
  laneFs: number,
): MovedBand[] {
  const after = carveGeometry(elements, carve, poolFs, laneFs);
  const out: MovedBand[] = [];
  for (const e of after) {
    const was = elements.find((b) => b.id === e.id);
    if (!was) continue;
    if (was.x === e.x && was.y === e.y && was.width === e.width && was.height === e.height) continue;
    out.push({ id: e.id, label: e.label ?? "", x: e.x, y: e.y, width: e.width, height: e.height });
  }
  return out;
}
