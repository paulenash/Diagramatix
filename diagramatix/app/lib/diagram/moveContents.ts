/**
 * "Move everything in <pool / lane / sub-lane> <n steps | m pixels> to the
 * right / left" (Paul, 2026-09-27) — what moves, and whether it can.
 *
 * WHAT MOVES. Everything drawn inside the container: its flow nodes, data and
 * annotations, at any depth of lane or sub-lane. Not the lanes themselves, and
 * not an expanded subprocess's children or an activity's boundary events one
 * by one — the reducer carries those with their parent (MOVE_ELEMENTS), so
 * listing them too would move them twice.
 *
 * RIGHT: the pool must already be wide enough when the move lands. A group
 * moved past the pool's edge is NOT enclosed by it — the reducer drops the
 * element out of its lane and it becomes loose (probed 2026-09-27: Send
 * Rejection Notification lost its parent). So the pool grows first, to the
 * rightmost content plus the same 40px margin "extend the pools" keeps.
 *
 * LEFT: nothing may cross into a lane's (or the pool's) header strip — the
 * same thing happens there. So a move with no room is refused, saying how far
 * it could go, never shortened silently.
 *
 * FROM A STEP (Paul, 2026-09-27: "Move everything from selected, in
 * <lane_name>, {<n> steps, <m> pixels} to the {right, left}. Never allow
 * overlaps if it can't be done. Assume the lane or pool from the selected
 * element's parent"): only what starts at or after that step moves — the
 * contents whose centre lies at or right of its left edge. What stays can now
 * be in the way on the left, so a move left keeps clear of it as well as of
 * the headers, and is refused with the exact room when it would not.
 *
 * Pure.
 */
import type { DiagramElement } from "./types";
import { containerHeaderWidth } from "./containerHeader";

/** One spoken step — the same 100px a selection moves per step ("move these right"). */
export const CONTENTS_STEP_PX = 100;
/** The right margin "extend the pools" keeps past the rightmost content. */
const RIGHT_MARGIN = 40;
/** How close content may come to a header strip on the left. */
const LEFT_MARGIN = 12;

const isBand = (e: DiagramElement) => e.type === "pool" || e.type === "lane" || e.type === "sublane";

export type MoveContentsPlan =
  | { ids: string[]; grow?: { poolId: string; width: number } }
  | { error: string; room?: number };

/** The pool, lane or sub-lane an element sits in — the nearest band above it. */
export function bandOf(el: DiagramElement, els: readonly DiagramElement[]): DiagramElement | undefined {
  const byId = new Map(els.map((e) => [e.id, e] as const));
  let cur = byId.get(el.parentId ?? "");
  for (let i = 0; cur && i < 16 && !isBand(cur); i++) cur = byId.get(cur.parentId ?? "");
  return cur && isBand(cur) ? cur : undefined;
}

export function planMoveContents(
  els: readonly DiagramElement[],
  container: DiagramElement,
  dx: number,
  /** Only what starts at or after this line moves ("move everything from selected …"). */
  from?: { x: number; name: string },
): MoveContentsPlan {
  const byId = new Map(els.map((e) => [e.id, e] as const));
  const name = (container.label ?? "").replace(/\s+/g, " ").trim() || container.type;
  // Inside = under the container through bands only: a lane's sub-lanes are
  // inside it; an expanded subprocess's children are the subprocess's.
  const bandUnder = (e: DiagramElement): DiagramElement | undefined => {
    let cur = byId.get(e.parentId ?? "");
    for (let i = 0; cur && i < 16; i++) {
      if (cur.id === container.id) return byId.get(e.parentId ?? "");
      if (!isBand(cur)) return undefined;
      cur = byId.get(cur.parentId ?? "");
    }
    return undefined;
  };
  const contents = els.filter((e) => !isBand(e) && !e.boundaryHostId && bandUnder(e));
  const movers = from ? contents.filter((e) => e.x + e.width / 2 >= from.x) : contents;
  if (!movers.length) return { error: from ? `there is nothing from ${from.name} on in ${name} to move` : `there is nothing in ${name} to move` };

  // The extent that moves: the movers, their boundary events and everything inside them.
  const moving = new Set(movers.map((e) => e.id));
  for (let changed = true; changed;) {
    changed = false;
    for (const e of els) {
      if (moving.has(e.id)) continue;
      if ((e.boundaryHostId && moving.has(e.boundaryHostId)) || (e.parentId && moving.has(e.parentId) && !isBand(e))) { moving.add(e.id); changed = true; }
    }
  }
  const extent = els.filter((e) => moving.has(e.id));

  if (dx < 0) {
    // The room on the left: every mover's own band keeps its header clear…
    let room = Math.min(...movers.map((e) => {
      const band = bandUnder(e)!;
      return e.x - (band.x + containerHeaderWidth(band)) - LEFT_MARGIN;
    }));
    // …and nothing that moves comes within the margin of anything that stays.
    const staying = els.filter((e) => !isBand(e) && !moving.has(e.id) && (contents.includes(e) || (e.boundaryHostId && contents.some((c) => c.id === e.boundaryHostId))));
    for (const m of extent) {
      for (const f of staying) {
        const sameRow = m.y < f.y + f.height + LEFT_MARGIN && m.y + m.height > f.y - LEFT_MARGIN;
        if (sameRow && f.x + f.width <= m.x + 0.5) room = Math.min(room, m.x - (f.x + f.width) - LEFT_MARGIN);
      }
    }
    room = Math.floor(room);
    const where = from ? `of ${from.name}` : `in ${name}`;
    if (-dx > room) {
      return room > 0
        ? { error: `only ${room}px of room on the left ${where} — say a smaller move`, room }
        : { error: `there is no room on the left ${where}`, room: 0 };
    }
    return { ids: movers.map((e) => e.id) };
  }

  let pool: DiagramElement | undefined = container.type === "pool" ? container : byId.get(container.parentId ?? "");
  while (pool && pool.type !== "pool") pool = byId.get(pool.parentId ?? "");
  const right = Math.max(...extent.map((e) => e.x + e.width)) + dx + RIGHT_MARGIN;
  const grow = pool && right > pool.x + pool.width ? { poolId: pool.id, width: Math.ceil(right - pool.x) } : undefined;
  return { ids: movers.map((e) => e.id), ...(grow ? { grow } : {}) };
}
