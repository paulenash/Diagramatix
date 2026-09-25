/**
 * "Put a pool around everything [called X]" — what it will do, decided once.
 *
 * The reducer applies this plan and the voice log reports it, from the same
 * function, so the sentence the user hears and the diagram they see cannot
 * disagree (the pattern `subprocessWrap.ts` set).
 *
 * Paul, 2026-09-25 — four cases, and the message is never a shrug:
 *
 *   1. A white-box pool already holds every process element → say so, change
 *      nothing.
 *   2. Only BLACK-BOX pools, and the loose process elements sit together in
 *      one band clear of them → a NEW pool, named, as wide as the black-box
 *      pools, around the loose elements.
 *   3. Only black-box pools, and the loose elements are SPLIT above and below
 *      one of them → no pool can be drawn round them without swallowing a
 *      participant; refuse, and say which pool is in the way.
 *   4. No pools at all → a new pool around the loose elements, as before.
 *
 * And the case the four do not name — a white-box pool AND elements outside
 * it: that pool GROWS to take them in, keeping its own name (Paul, 2026-09-25:
 * "grow, ignore the name"; the log says so) — "as long as the elements can be
 * enclosed by WIDENING the existing pool". So only elements level with it, to
 * its left or right; one above, below or across its edge is refused by name.
 * This replaces 2026-09-18, when the pool grew upward to reach them.
 *
 * A black-box pool is never grown (Paul, 2026-09-19): it says its insides are
 * not modelled, and putting elements in it would contradict that.
 *
 * Pure.
 */
import type { DiagramElement } from "./types";

export type WrapInPoolPlan =
  | { kind: "grow"; poolId: string; loose: string[]; /** element → the lane it sits level with (or the pool) */ holders: Record<string, string> }
  | { kind: "new"; rect: { x: number; y: number; width: number; height: number }; loose: string[]; widthFrom?: string }
  | { error: string };

/** Clear space round the loose elements, and the pool's own name strip. */
export const WRAP_PAD = 40;
export const WRAP_HEADER_W = 36;

const CONTAINER = new Set<string>(["pool", "lane", "sublane"]);
/**
 * What a pool is drawn around: the PROCESS — events, activities, gateways,
 * data objects and data stores (Paul, 2026-09-25: "include data stores").
 * Annotations, groups, review comments and the rest are left where they are,
 * and a diagram with none of these gets no pool at all.
 */
export const PROCESS_TYPES: ReadonlySet<string> = new Set([
  "task", "subprocess", "subprocess-expanded", "gateway",
  "start-event", "intermediate-event", "end-event", "data-object", "data-store",
]);
const nameOf = (e: DiagramElement) => (e.label?.trim() || (e.type === "pool" ? "a pool" : e.type));

/** A pool is black-box when it says so (or says nothing) and holds no lanes. */
export function isBlackBoxPool(p: DiagramElement, elements: readonly DiagramElement[]): boolean {
  return ((p.properties?.poolType as string | undefined) ?? "black-box") === "black-box"
    && !elements.some((e) => e.type === "lane" && e.parentId === p.id);
}

export function planWrapInPool(elements: readonly DiagramElement[]): WrapInPoolPlan {
  const byId = new Map(elements.map((e) => [e.id, e] as const));
  const inContainer = (e: DiagramElement) => {
    let cur: DiagramElement | undefined = e;
    for (let i = 0; cur?.parentId && i < 12; i++) {
      const p = byId.get(cur.parentId);
      if (p && CONTAINER.has(p.type)) return true;
      cur = p;
    }
    return false;
  };
  // A boundary event rides its host, so it is never loose on its own account.
  const process = elements.filter((e) => PROCESS_TYPES.has(e.type) && !e.boundaryHostId);
  if (process.length === 0) return { error: "there are no events, activities, gateways, data objects or data stores to put in a pool" };
  const loose = process.filter((e) => !inContainer(e));
  const pools = elements.filter((e) => e.type === "pool");
  const whites = pools.filter((p) => !isBlackBoxPool(p, elements));

  // 1 — nothing outside a pool.
  if (loose.length === 0) {
    if (whites.length === 1) return { error: `everything is already in ${nameOf(whites[0])} — nothing to put in a new pool` };
    return { error: "everything is already in a pool — nothing to put in a new pool" };
  }
  const ids = loose.map((e) => e.id);

  // The unnamed case: a white-box pool is there, and it WIDENS — never taller.
  if (whites.length > 0) {
    const pool = whites.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
    const top = pool.y, bottom = pool.y + pool.height;
    const off = loose.find((e) => e.y < top || e.y + e.height > bottom);
    if (off) {
      const where = off.y + off.height <= top ? "above" : off.y >= bottom ? "below" : "across the edge of";
      return { error: `can't take ${nameOf(off)} into ${nameOf(pool)} by widening it — it sits ${where} it; move it level with the pool first` };
    }
    // Each element joins the lane it sits level with — the DEEPEST one, so a
    // sublane beats its lane. Not "the first lane": an element beside Lane 3
    // parented to Lane 1 is the stale parentage that moved a whole diagram.
    const inPool = (e: DiagramElement): boolean => {
      let cur: DiagramElement | undefined = e;
      for (let i = 0; cur?.parentId && i < 12; i++) { if (cur.parentId === pool.id) return true; cur = byId.get(cur.parentId); }
      return false;
    };
    const lanes = elements.filter((e) => (e.type === "lane" || e.type === "sublane") && inPool(e));
    const holders: Record<string, string> = {};
    for (const e of loose) {
      const cy = e.y + e.height / 2;
      const level = lanes.filter((l) => cy >= l.y && cy <= l.y + l.height).sort((a, b) => a.height - b.height)[0];
      holders[e.id] = level?.id ?? pool.id;
    }
    return { kind: "grow", poolId: pool.id, loose: ids, holders };
  }

  const minX = Math.min(...loose.map((e) => e.x));
  const minY = Math.min(...loose.map((e) => e.y));
  const maxX = Math.max(...loose.map((e) => e.x + e.width));
  const maxY = Math.max(...loose.map((e) => e.y + e.height));

  // 4 — no pools: round the loose elements.
  if (pools.length === 0) {
    return {
      kind: "new", loose: ids,
      rect: { x: minX - WRAP_PAD - WRAP_HEADER_W, y: minY - WRAP_PAD, width: (maxX - minX) + 2 * WRAP_PAD + WRAP_HEADER_W, height: (maxY - minY) + 2 * WRAP_PAD },
    };
  }

  // 3 — only black-box pools. Refuse when one sits between the loose elements,
  // or across them: any pool drawn round them would swallow it.
  for (const p of pools) {
    const top = p.y, bottom = p.y + p.height;
    const above = loose.some((e) => e.y + e.height <= top);
    const below = loose.some((e) => e.y >= bottom);
    const across = loose.find((e) => e.y < bottom && e.y + e.height > top);
    if (above && below) {
      return { error: `can't put one pool around them — they are split above and below ${nameOf(p)}; move them to one side of it first` };
    }
    if (across) {
      return { error: `can't put a pool around them — ${nameOf(across)} overlaps ${nameOf(p)}; move it clear first` };
    }
  }

  // 2 — together in one band: a new pool, the black-box pools' width, fitted
  // into the gap between the nearest one above and the nearest one below.
  const ceiling = Math.max(-Infinity, ...pools.filter((p) => p.y + p.height <= minY).map((p) => p.y + p.height));
  const floor = Math.min(Infinity, ...pools.filter((p) => p.y >= maxY).map((p) => p.y));
  const y = Math.max(minY - WRAP_PAD, ceiling);
  const bottom = Math.min(maxY + WRAP_PAD, floor);
  const widest = pools.reduce((a, b) => (a.width >= b.width ? a : b));
  // Their width — unless an element reaches past it, when the pool widens
  // rather than leave it outside.
  const x = Math.min(widest.x, minX - WRAP_PAD - WRAP_HEADER_W);
  const right = Math.max(widest.x + widest.width, maxX + WRAP_PAD);
  return { kind: "new", loose: ids, rect: { x, y, width: right - x, height: bottom - y }, widthFrom: nameOf(widest) };
}
