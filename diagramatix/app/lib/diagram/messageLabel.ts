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
