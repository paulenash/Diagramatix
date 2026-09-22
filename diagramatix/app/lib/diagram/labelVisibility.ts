/**
 * Which connector labels are hidden right now.
 *
 * Paul, 2026-09-19: "Hide the message labels when moving a Pool across another
 * Pool or group of pool-less elements until they are finally placed correctly."
 *
 * This is the other half of settling message labels at the END of a gesture
 * (see `messageLabel.ts`). Because the final position is now worked out once,
 * from where the pool started and where it ended up, the label's position
 * DURING the drag is not the answer to anything — it is the old offset being
 * carried along a line whose midpoint is moving. Showing it while the pool
 * crosses its partner is showing the user a number that is about to change.
 *
 * So for the length of the crossing the labels come off, and they come back at
 * the drop, in the place the settle chose. The connectors themselves stay
 * visible throughout — it is only the text that would mislead.
 *
 * NARROWED 2026-09-23. Paul: "No need to hide message labels during Pool
 * movements unless the Pool is moved over another Pool with which it has
 * message connectors OR has message connectors with one or more of that Pool's
 * child elements." Hiding for the whole of every pool drag took the text away
 * on moves that could not disturb it — a pool dragged across empty canvas, or
 * past a pool it exchanges nothing with. A label now only goes while the two
 * pools are actually OVERLAPPING, and only on the flows between them.
 *
 * Pure.
 */

interface ElementLike {
  id: string; type: string; parentId?: string | null;
  x?: number; y?: number; width?: number; height?: number;
}
interface ConnectorLike { id: string; type: string; sourceId: string; targetId: string }

const isMessage = (c: ConnectorLike) => c.type === "messageBPMN" || c.type === "message";

/** Rectangles that share any area. Touching edges do not count as over. */
function overlaps(a: ElementLike, b: ElementLike): boolean {
  const ax = a.x ?? 0, ay = a.y ?? 0, aw = a.width ?? 0, ah = a.height ?? 0;
  const bx = b.x ?? 0, by = b.y ?? 0, bw = b.width ?? 0, bh = b.height ?? 0;
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
}

/**
 * The message-flow labels to hide while `draggingId` is being dragged.
 *
 * Empty unless a POOL is being dragged — dragging a task moves one end of a
 * message too, but a task drag is small and local, and hiding labels for it
 * would flicker them on every nudge.
 *
 * Then, for each message flow with one end on the dragged pool or on something
 * inside it: find what the OTHER end belongs to — its own pool, or the element
 * itself when it has no pool (Paul's "group of pool-less elements") — and hide
 * the label only while the dragged pool is over that. A pool moved anywhere
 * else keeps its labels.
 */
export function messageLabelsHiddenWhileDragging(
  draggingId: string | null,
  elements: ElementLike[],
  connectors: ConnectorLike[],
): Set<string> {
  const hidden = new Set<string>();
  // No separate null check: nothing is dragging means nothing is found, and
  // "not a pool" already answers with an empty set. A guard no input can reach
  // would only read as though it were doing something.
  const dragged = elements.find((e) => e.id === draggingId);
  if (!dragged || dragged.type !== "pool") return hidden;

  const byId = new Map(elements.map((e) => [e.id, e] as const));
  /** The pool an endpoint sits in, or the endpoint itself when it has none. */
  const homeOf = (id: string): ElementLike | undefined => {
    let cur = byId.get(id);
    const start = cur;
    for (let i = 0; cur && i < 12; i++) {
      if (cur.type === "pool") return cur;
      if (!cur.parentId) break;
      cur = byId.get(cur.parentId);
    }
    return start;
  };

  for (const c of connectors) {
    if (!isMessage(c)) continue;
    const src = homeOf(c.sourceId);
    const tgt = homeOf(c.targetId);
    // One end here, one end elsewhere — a flow wholly inside the dragged pool
    // travels with it, so nothing about its label is in doubt.
    const mine = src?.id === dragged.id ? src : tgt?.id === dragged.id ? tgt : undefined;
    const theirs = src?.id === dragged.id ? tgt : tgt?.id === dragged.id ? src : undefined;
    if (!mine || !theirs || theirs.id === dragged.id) continue;
    if (overlaps(dragged, theirs)) hidden.add(c.id);
  }
  return hidden;
}
