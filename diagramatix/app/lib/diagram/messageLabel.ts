/**
 * Keeping a message flow's label where the user put it when its pool moves.
 *
 * A messageBPMN label is stored as an offset from the MIDPOINT of the line. Move
 * one end and the midpoint moves, so the label slides somewhere the user never
 * put it — which is what Paul saw after a pool swap (2026-09-18): the connectors
 * re-attached correctly and "the message labels loose their relative positions
 * with respect to their message connector's attachment point".
 *
 * THE RULE (established the hard way — see the memory note "messageBPMN label
 * preservation across pool cross-over", where several other formulas were tried
 * and rejected):
 *
 *     oldOff  = oldLabelCentre − oldAttach     // attach = the MOVING end
 *     normal  : newLabelCentre = newAttach + oldOff
 *     flipped : newLabelCentre = newAttach − oldOff   // mirror in Y
 *
 * Anchoring to the moving end is the whole trick. It makes the offset invariant
 * while the pool and its label travel together, so a flip becomes a sign change
 * and nothing else. Do NOT reintroduce nearest-endpoint tracking: "nearest"
 * switches ends part-way through a move, and by the time it matters the stored
 * offset no longer means what it should.
 *
 * `useDiagram.ts` CASE A2 implements the same rule inline for the black-box pool
 * drag. It predates this module and should be migrated onto it; until then, a
 * change to the rule belongs in both.
 */
import type { Connector } from "./types";

/** Height of one line of label text. */
const LINE_H = 14;

export interface LabelOffsets {
  labelOffsetX: number;
  labelOffsetY: number;
}

/** The indices of the two attachment waypoints, allowing for invisible leaders. */
function endIndices(conn: Connector): [number, number] {
  const src = conn.sourceInvisibleLeader ? 1 : 0;
  const tgt = conn.targetInvisibleLeader ? conn.waypoints.length - 2 : conn.waypoints.length - 1;
  return [src, tgt];
}

/**
 * New label offsets after one end of a message flow has moved, or null when
 * there is nothing to preserve (no label, or not enough waypoints to measure).
 *
 * `movedEnd` says which end belongs to the thing that moved — the pool.
 */
export function preserveMessageLabel(
  conn: Connector,
  before: Connector,
  movedEnd: "source" | "target",
): LabelOffsets | null {
  if (!conn.label) return null;
  if (before.waypoints.length < 2 || conn.waypoints.length < 2) return null;
  if (before.labelOffsetX == null && before.labelOffsetY == null) return null;

  const [bs, bt] = endIndices(before);
  const [ns, nt] = endIndices(conn);
  const oldSrc = before.waypoints[bs];
  const oldTgt = before.waypoints[bt];
  const newSrc = conn.waypoints[ns];
  const newTgt = conn.waypoints[nt];
  if (!oldSrc || !oldTgt || !newSrc || !newTgt) return null;

  const lineCount = (conn.label.split("\n").length) || 1;
  const halfLabelH = (lineCount * LINE_H) / 2;

  const oldMidX = (oldSrc.x + oldTgt.x) / 2;
  const oldMidY = (oldSrc.y + oldTgt.y) / 2;
  const oldLabelCentreX = oldMidX + (before.labelOffsetX ?? 0);
  const oldLabelCentreY = oldMidY + (before.labelOffsetY ?? 0) + halfLabelH;

  const oldAttach = movedEnd === "source" ? oldSrc : oldTgt;
  const newAttach = movedEnd === "source" ? newSrc : newTgt;
  const oldOffsetX = oldLabelCentreX - oldAttach.x;
  const oldOffsetY = oldLabelCentreY - oldAttach.y;

  // A flip is the moving end changing which side of the other end it sits on.
  const wasBelow = oldAttach.y > (movedEnd === "source" ? oldTgt.y : oldSrc.y);
  const isBelow = newAttach.y > (movedEnd === "source" ? newTgt.y : newSrc.y);
  const flipped = wasBelow !== isBelow;

  const newMidX = (newSrc.x + newTgt.x) / 2;
  const newMidY = (newSrc.y + newTgt.y) / 2;
  const newLabelCentreX = newAttach.x + oldOffsetX;
  const newLabelCentreY = flipped ? newAttach.y - oldOffsetY : newAttach.y + oldOffsetY;

  return {
    labelOffsetX: newLabelCentreX - newMidX,
    labelOffsetY: (newLabelCentreY - halfLabelH) - newMidY,
  };
}

/**
 * Settle every message label ONCE, at the end of a gesture, against the state
 * the gesture started from.
 *
 * This is the answer to Paul's 2026-09-19 question — "can you devise a way so
 * that these labels on moved pools are more reliably placed and in the case of
 * the Pool returned to its starting position are back where they used to be?".
 *
 * `preserveMessageLabel` above is correct for ONE move, and a one-step drag
 * round-tripped exactly. A real drag is one reducer action per mouse sample,
 * and applying the rule at every sample is what broke it: the crossing from one
 * side of the partner to the other lands on whichever sample it lands on, and
 * while the pool overlaps its partner the attachment can sit on the old face
 * while the geometry already says otherwise. A seven-step drag there and back
 * left the label 213px from where it started, below the returned pool; a
 * thirty-step drag left it somewhere else again.
 *
 * Settling once removes the whole class of problem. The result is a function of
 * where the pool STARTED and where it ENDED UP — nothing in between — so it
 * cannot depend on the mouse, and dragging back reverses the same function and
 * restores the offsets exactly.
 *
 * `movedIds` is the set of elements the gesture actually moved, worked out by
 * comparing positions rather than trusting a travelling list, so an element
 * that came along for the ride is counted too.
 */
export function settleMessageLabels(
  connectors: Connector[],
  beforeConnectors: Connector[],
  movedIds: Set<string>,
): Connector[] {
  if (movedIds.size === 0) return connectors;
  const before = new Map(beforeConnectors.map((c) => [c.id, c]));
  let changed = false;
  const out = connectors.map((conn) => {
    if (conn.type !== "messageBPMN" && conn.type !== "message") return conn;
    const prev = before.get(conn.id);
    if (!prev) return conn;                       // created during the gesture
    const srcMoved = movedIds.has(conn.sourceId);
    const tgtMoved = movedIds.has(conn.targetId);
    if (!srcMoved && !tgtMoved) return conn;
    // Both ends moving is a rigid translation as far as the label is concerned,
    // and either end gives the same answer; source keeps it deterministic.
    const offsets = preserveMessageLabel(conn, prev, srcMoved ? "source" : "target");
    if (!offsets) return conn;
    if (offsets.labelOffsetX === conn.labelOffsetX && offsets.labelOffsetY === conn.labelOffsetY) return conn;
    changed = true;
    return { ...conn, ...offsets };
  });
  return changed ? out : connectors;
}

/** Which elements a gesture actually moved, by comparing before and after. */
export function movedElementIds(
  before: { id: string; x: number; y: number }[],
  after: { id: string; x: number; y: number }[],
): Set<string> {
  const was = new Map(before.map((e) => [e.id, e]));
  const ids = new Set<string>();
  for (const e of after) {
    const b = was.get(e.id);
    if (!b) continue;
    if (Math.abs(b.x - e.x) > 0.01 || Math.abs(b.y - e.y) > 0.01) ids.add(e.id);
  }
  return ids;
}
