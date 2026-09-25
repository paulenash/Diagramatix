/**
 * Where a dropped template belongs — THE adoption rule APPLY_TEMPLATE follows.
 *
 * Paul, 2026-09-24: "Note that insert a template may require the current Lane
 * and Pool to be expanded to accommodate the new template." And 2026-09-25,
 * after a template dropped over his process came out torn, with its flows left
 * hanging: "manually placing a template with an EP in it on or over existing
 * diagram elements also does the same thing. Particularly if the EP does not
 * fit into the lane it is initially placed in. All ok if the lane it goes into
 * has been manually prepared for the template. We need a generic fix for this
 * issue independent of voice assist."
 *
 * A template is ONE piece. The lane pass used to give each element the lane
 * its own centre sat in, and each of those lanes then grew separately — so
 * every lane's growth shifted the template elements in the lanes below it, and
 * Paul's template came apart three ways (0, 20 and 81px). Here the piece has
 * one host, and the host makes room for all of it:
 *
 *   • a parent the CALLER gave (the attach after an element — issue 5's
 *     templateAttach.ts) is kept as it is;
 *   • otherwise the host is found by OVERLAP: of the white-box pools the
 *     template's box overlaps vertically, the one it overlaps most — its box
 *     centred at or right of the pool's left edge, and reaching into the pool
 *     or starting within ADOPT_RIGHT_REACH of its right edge ("just grow the
 *     Pool when the template is placed", and not a pool a whole screen away) —
 *     then, inside it, the deepest lane or sub-lane it overlaps most;
 *   • a black-box pool never adopts (`isBlackBoxPool` — an absent poolType is
 *     white-box), and a template left without a host is never left lying over
 *     a pool: off a black-box pool it moves straight up or down; hanging into a
 *     white-box pool from its left (centred left of it — "something placed to
 *     the LEFT was put there deliberately"), it moves left, clear of it;
 *   • a template that brings pools or lanes of its own is adopted by nothing —
 *     its pools (or lanes) are stacked below the diagram's lowest pool,
 *     POOL_GAP apart.
 *
 * Boundary events go with their host (its parent is theirs), and the template's
 * notes and markers (`isLaneUnowned`) travel with it without being adopted.
 *
 * Pure: it plans; the reducer moves, grows and settles.
 */
import type { DiagramElement } from "./types";
import { isBlackBoxPool } from "./blackBoxPoolMenu";
import { isLaneUnowned } from "./containment";
import { POOL_GAP } from "./poolLaneBounds";

/** How far right of a pool a template may start and still be taken in by it. */
export const ADOPT_RIGHT_REACH = 120;

export interface TemplateBox { x: number; y: number; right: number; bottom: number }

export interface TemplateAdoptionPlan {
  /**
   * The flow part — what the host takes in and makes room for (the payload
   * less its notes and markers), the events on its edges included: they sit
   * half outside their host but wholly inside the lane that owns it.
   */
  fragmentIds: Set<string>;
  /** Payload elements the host adopts: the fragment's top level, not boundary-mounted. */
  topLevelIds: Set<string>;
  /** Boundary events mounted on a payload element with no parent in the payload: their parent becomes their host's. */
  boundaryIds: Set<string>;
  /**
   * What CHOOSES the host — the fragment less anything mounted on a boundary,
   * which hangs over the edge of its host and would pull the choice toward
   * the band it pokes into. The room is made for all of `fragmentIds`.
   */
  boxIds: Set<string>;
  /** The container the piece goes into, if any. */
  hostId?: string;
  /** True when the caller parented the piece itself. */
  given: boolean;
  /** Where the WHOLE payload moves before anything else: stacked under the pools, or off a pool that does not take it. */
  move?: { dx: number; dy: number; why: "own-containers" | "clear" };
}

/**
 * A pool, lane or sub-lane: a template that brings one brings a participant of
 * its own, and is never joined into a flow or taken in by a lane. The template
 * list asks the same of its rows in SQL (`/api/templates` `hasContainer`).
 */
export function isTemplateContainer(e: { type: string }): boolean {
  return e.type === "pool" || e.type === "lane" || e.type === "sublane";
}

const vOverlap = (b: TemplateBox, p: DiagramElement) =>
  Math.max(0, Math.min(b.bottom, p.y + p.height) - Math.max(b.y, p.y));
const hOverlap = (b: TemplateBox, p: DiagramElement) =>
  Math.max(0, Math.min(b.right, p.x + p.width) - Math.max(b.x, p.x));

/** The box of these elements. */
export function boxOf(els: readonly DiagramElement[]): TemplateBox | null {
  if (els.length === 0) return null;
  return {
    x: Math.min(...els.map((e) => e.x)), y: Math.min(...els.map((e) => e.y)),
    right: Math.max(...els.map((e) => e.x + e.width)), bottom: Math.max(...els.map((e) => e.y + e.height)),
  };
}

/** The pool an element sits in, by its parent chain. */
function poolOf(el: DiagramElement | undefined, byId: Map<string, DiagramElement>): DiagramElement | undefined {
  for (let cur = el, i = 0; cur && i < 24; i++) {
    if (cur.type === "pool") return cur;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return undefined;
}

/**
 * The white-box pool a template's box belongs to, and the lane in it — or
 * nothing. See the header for the rule.
 */
export function templateHostByOverlap(existing: readonly DiagramElement[], box: TemplateBox): { poolId: string; hostId: string } | null {
  const cx = (box.x + box.right) / 2;
  const pool = existing
    .filter((p) => p.type === "pool" && !isBlackBoxPool(p))
    .filter((p) => vOverlap(box, p) > 0 && cx >= p.x
      && (hOverlap(box, p) > 0 || box.x - (p.x + p.width) <= ADOPT_RIGHT_REACH))
    .sort((a, b) => vOverlap(box, b) - vOverlap(box, a))[0];
  if (!pool) return null;
  const byId = new Map(existing.map((e) => [e.id, e] as const));
  const lanes = existing.filter((l) => l.type === "lane" && poolOf(l, byId)?.id === pool.id);
  // The deepest band: a lane with sub-lanes is not itself a band.
  const leaves = lanes.filter((l) => !lanes.some((k) => k.parentId === l.id));
  if (leaves.length === 0) return { poolId: pool.id, hostId: pool.id };
  // Most overlap wins; on a tie the lower one, as a centre on a divider joins
  // the lane below it.
  const lane = [...leaves].sort((a, b) => (vOverlap(box, b) - vOverlap(box, a)) || (b.y - a.y))[0];
  return { poolId: pool.id, hostId: lane.id };
}

/**
 * How far to move a box that no pool takes in so that it lies over no pool: off
 * a black-box pool straight up or down, off a white-box pool it hangs into
 * from the left, further left — whichever clear spot is nearest, POOL_GAP off
 * the pool; failing all of them, below every pool it would otherwise cross.
 */
function clearOfPools(existing: readonly DiagramElement[], box: TemplateBox): { dx: number; dy: number } | null {
  const pools = existing.filter((p) => p.type === "pool");
  const covers = (b: TemplateBox, p: DiagramElement) => vOverlap(b, p) > 0 && hOverlap(b, p) > 0;
  const blocking = pools.filter((p) => covers(box, p));
  if (blocking.length === 0) return null;
  const at = (m: { dx: number; dy: number }): TemplateBox =>
    ({ x: box.x + m.dx, right: box.right + m.dx, y: box.y + m.dy, bottom: box.bottom + m.dy });
  const tries = blocking.flatMap((p) => (isBlackBoxPool(p)
    ? [{ dx: 0, dy: p.y - POOL_GAP - box.bottom }, { dx: 0, dy: p.y + p.height + POOL_GAP - box.y }]
    : [{ dx: p.x - POOL_GAP - box.right, dy: 0 }]))
    .filter((m) => !pools.some((p) => covers(at(m), p)))
    .sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy));
  if (tries.length) return tries[0];
  const across = pools.filter((p) => hOverlap(box, p) > 0);
  return { dx: 0, dy: Math.max(...across.map((p) => p.y + p.height)) + POOL_GAP - box.y };
}

/**
 * Plan where a template's payload goes on `existing` (the diagram without it).
 */
export function planTemplateAdoption(
  existing: readonly DiagramElement[],
  payload: readonly DiagramElement[],
): TemplateAdoptionPlan {
  const payloadIds = new Set(payload.map((e) => e.id));
  const plan: TemplateAdoptionPlan = { fragmentIds: new Set(), topLevelIds: new Set(), boundaryIds: new Set(), boxIds: new Set(), given: false };

  // A template that brings containers of its own — pools, or lanes saved
  // without their pool — is a participant of its own, not a piece of somebody
  // else's process. Taken in like a piece, a saved lane became a sub-lane of
  // the lane it was dropped on, beside that lane's own tasks.
  const own = payload.filter(isTemplateContainer);
  if (own.length > 0) {
    const theirs = existing.filter((e) => e.type === "pool");
    if (theirs.length === 0) return plan;
    const lowest = [...theirs].sort((a, b) => (b.y + b.height) - (a.y + a.height))[0];
    const top = Math.min(...own.map((p) => p.y));
    const left = Math.min(...own.map((p) => p.x));
    plan.move = { dx: lowest.x - left, dy: lowest.y + lowest.height + POOL_GAP - top, why: "own-containers" };
    return plan;
  }

  const fragment = payload.filter((e) => !isLaneUnowned(e));
  for (const e of fragment) {
    plan.fragmentIds.add(e.id);
    const ownParent = !!e.parentId && payloadIds.has(e.parentId);
    // A start or end event on a sub-process's rim is the sub-process's own
    // and keeps that parent; an intermediate one on a task goes where the task
    // goes.
    if (e.boundaryHostId && payloadIds.has(e.boundaryHostId)) {
      if (!ownParent) plan.boundaryIds.add(e.id);
      continue;
    }
    plan.boxIds.add(e.id);
    if (!e.boundaryHostId && !ownParent) plan.topLevelIds.add(e.id);
  }
  if (plan.boxIds.size === 0) for (const e of fragment) plan.boxIds.add(e.id);
  const box = boxOf(fragment.filter((e) => plan.boxIds.has(e.id)));
  if (!box) return plan;

  // A parent the caller gave: the one most of the top level was given.
  const existingIds = new Set(existing.map((e) => e.id));
  const givenCount = new Map<string, number>();
  for (const e of fragment) {
    if (plan.topLevelIds.has(e.id) && e.parentId && existingIds.has(e.parentId)) {
      givenCount.set(e.parentId, (givenCount.get(e.parentId) ?? 0) + 1);
    }
  }
  const given = [...givenCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (given) return { ...plan, hostId: given, given: true };

  const host = templateHostByOverlap(existing, box);
  if (host) return { ...plan, hostId: host.hostId };

  const clear = clearOfPools(existing, box);
  if (clear) plan.move = { ...clear, why: "clear" };
  return plan;
}
