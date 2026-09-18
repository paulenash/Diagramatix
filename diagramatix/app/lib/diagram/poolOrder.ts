/**
 * Reordering the pool stack: "move Pool 1 above Pool 2", "swap Pool 1 with
 * Pool 2" (Paul, 2026-09-18).
 *
 * Asking for it before this existed got you the AI's best guess — "Move Pool 1
 * above Pool 2" came back as "nudge Pool 1 up", which moved it twenty pixels and
 * called that done.
 *
 * Pools are a vertical stack, so reordering is a matter of recomputing where each
 * one starts. Two things make it more than that:
 *
 *   MAKING ROOM IS AUTOMATIC. The stack is laid out again from the top after the
 *   move, so a pool inserted between two others pushes the ones below it down by
 *   exactly its own height. There is no separate "make room" step to get wrong.
 *
 *   THE GAPS ARE KEPT WHERE THEY ARE, not carried around with the pools. The gap
 *   between the first and second pool stays the gap between the first and second
 *   pool, whichever pools those now are, so the stack keeps its overall height
 *   and nothing drifts after a few moves.
 *
 * Contents travel with their pool, worked out the same way a drag works it out —
 * what the pool is drawn around — so a stale parentId cannot drag along an
 * element that is somewhere else entirely.
 */
import type { Connector, DiagramElement } from "./types";
import { expandMoveSet } from "./moveSet";
import { recomputeAllConnectors } from "./routing";
import { preserveMessageLabel } from "./messageLabel";

/** Default gap when there is nothing to copy from. */
const DEFAULT_GAP = 24;

export type PoolPosition = "above" | "below";

export interface ReorderPlan {
  elements: DiagramElement[];
  /**
   * Connectors after the move. A message flow between a pool and something
   * outside it has waypoints in world coordinates, so moving the pool without
   * touching them leaves the message hanging in mid-air, visibly detached
   * (Paul, 2026-09-18: "message attachments ... become disconnected").
   */
  connectors: Connector[];
  /** Pool ids in their new top-to-bottom order. */
  order: string[];
  /** How far each pool moved, for a summary. */
  moved: number;
}

export type ReorderResult = ReorderPlan | { error: string };

const nameOf = (e: DiagramElement) => e.label?.trim() || e.type;

/** Every pool, topmost first. */
export function poolsInOrder(elements: readonly DiagramElement[]): DiagramElement[] {
  return elements.filter((e) => e.type === "pool").sort((a, b) => a.y - b.y);
}

/**
 * Lay the stack out again in `order`, keeping each gap at its slot and moving
 * every pool's contents with it.
 */
function restack(
  elements: readonly DiagramElement[],
  connectors: readonly Connector[],
  order: readonly string[],
  isContainer: (t: DiagramElement["type"]) => boolean,
  descendantsOf: (els: DiagramElement[], id: string) => Iterable<string>,
): ReorderPlan {
  const pools = poolsInOrder(elements);
  const byId = new Map(pools.map((p) => [p.id, p] as const));

  // Gaps belong to slots, not to pools: slot i is the space between the pool in
  // position i and the one in position i+1, whoever they turn out to be.
  const gaps: number[] = [];
  for (let i = 0; i < pools.length - 1; i++) {
    gaps.push(Math.max(0, pools[i + 1].y - (pools[i].y + pools[i].height)));
  }

  const top = pools.length ? pools[0].y : 0;
  const shiftById = new Map<string, number>();
  let cursor = top;
  for (let i = 0; i < order.length; i++) {
    const pool = byId.get(order[i]);
    if (!pool) continue;
    shiftById.set(pool.id, cursor - pool.y);
    cursor += pool.height + (gaps[i] ?? gaps[gaps.length - 1] ?? DEFAULT_GAP);
  }

  // What travels with each pool — what it is drawn around, not what claims it.
  const els = [...elements] as DiagramElement[];
  const dyById = new Map<string, number>();
  for (const [poolId, dy] of shiftById) {
    if (dy === 0) continue;
    for (const id of expandMoveSet(els, [poolId], isContainer, descendantsOf)) {
      // A pool's own move wins if two pools somehow claim the same element.
      if (!dyById.has(id)) dyById.set(id, dy);
    }
  }

  let moved = 0;
  const out = els.map((e) => {
    const dy = dyById.get(e.id);
    if (!dy) return e;
    if (e.type === "pool") moved++;
    return { ...e, y: e.y + dy };
  });

  // A connector whose two ends moved together keeps its shape — the whole thing
  // just slid down the page. Any other is routed afresh, which is what re-anchors
  // a message flow onto the pool's new edge.
  const shiftOf = (id: string) => dyById.get(id) ?? 0;
  const stale = new Set<string>();
  const translated = connectors.map((c) => {
    const a = shiftOf(c.sourceId);
    const b = shiftOf(c.targetId);
    if (a !== b) { stale.add(c.id); return c; }
    if (a === 0) return c;
    return { ...c, waypoints: c.waypoints.map((p) => ({ ...p, y: p.y + a })) };
  });
  const rerouted = new Map(
    recomputeAllConnectors(translated.filter((c) => stale.has(c.id)), out).map((c) => [c.id, c] as const),
  );
  const byIdBefore = new Map(connectors.map((c) => [c.id, c] as const));
  const finalConnectors = translated.map((c) => {
    const routed = rerouted.get(c.id);
    if (!routed) return c;
    // A message label is stored as an offset from the line's MIDPOINT, so
    // moving one end slides it somewhere the user never put it. Re-anchor it
    // to the end that moved (messageLabel.ts).
    const original = byIdBefore.get(c.id);
    if (!original) return routed;
    const movedEnd = shiftOf(c.sourceId) !== 0 ? "source" as const : "target" as const;
    const adj = preserveMessageLabel(routed, original, movedEnd);
    return adj ? { ...routed, ...adj } : routed;
  });

  return { elements: out, connectors: finalConnectors, order: [...order], moved };
}

/** "Move Pool 1 above Pool 2". */
export function planMovePool(
  elements: readonly DiagramElement[],
  connectors: readonly Connector[],
  poolId: string,
  position: PoolPosition,
  relativeToId: string,
  isContainer: (t: DiagramElement["type"]) => boolean,
  descendantsOf: (els: DiagramElement[], id: string) => Iterable<string>,
): ReorderResult {
  const pools = poolsInOrder(elements);
  const mover = pools.find((p) => p.id === poolId);
  const anchor = pools.find((p) => p.id === relativeToId);
  if (!mover) return { error: "that isn't a pool" };
  if (!anchor) return { error: "the pool to move it next to isn't a pool" };
  if (mover.id === anchor.id) return { error: `${nameOf(mover)} is already where it is` };

  const rest = pools.filter((p) => p.id !== mover.id).map((p) => p.id);
  const at = rest.indexOf(anchor.id);
  const order = [...rest];
  order.splice(position === "above" ? at : at + 1, 0, mover.id);

  if (order.every((id, i) => id === pools[i].id)) {
    return { error: `${nameOf(mover)} is already ${position} ${nameOf(anchor)}` };
  }
  return restack(elements, connectors, order, isContainer, descendantsOf);
}

/** "Swap Pool 1 with Pool 2" — exchange two pools' places in the stack. */
export function planSwapPools(
  elements: readonly DiagramElement[],
  connectors: readonly Connector[],
  aId: string,
  bId: string,
  isContainer: (t: DiagramElement["type"]) => boolean,
  descendantsOf: (els: DiagramElement[], id: string) => Iterable<string>,
): ReorderResult {
  const pools = poolsInOrder(elements);
  const ia = pools.findIndex((p) => p.id === aId);
  const ib = pools.findIndex((p) => p.id === bId);
  if (ia < 0 || ib < 0) return { error: "both of those need to be pools" };
  if (ia === ib) return { error: "those are the same pool" };

  const order = pools.map((p) => p.id);
  [order[ia], order[ib]] = [order[ib], order[ia]];
  return restack(elements, connectors, order, isContainer, descendantsOf);
}

/** The two pools a "swap the selected pools" refers to, or null. */
export function selectedPools(
  elements: readonly DiagramElement[],
  selectedIds: readonly string[],
): [DiagramElement, DiagramElement] | null {
  const picked = poolsInOrder(elements).filter((p) => selectedIds.includes(p.id));
  return picked.length === 2 ? [picked[0], picked[1]] : null;
}
