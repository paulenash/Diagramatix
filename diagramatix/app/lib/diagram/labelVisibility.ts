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
 * So for the length of the drag the labels come off, and they come back at the
 * drop, in the place the settle chose. The connectors themselves stay visible
 * throughout — it is only the text that would mislead.
 *
 * Scoped to the pool being dragged: a message flow between two other things is
 * not affected by this move and its label is still telling the truth.
 *
 * Pure.
 */

interface ElementLike { id: string; type: string }
interface ConnectorLike { id: string; type: string; sourceId: string; targetId: string }

const isMessage = (c: ConnectorLike) => c.type === "messageBPMN" || c.type === "message";

/**
 * The message-flow labels to hide while `draggingId` is being dragged.
 *
 * Empty unless a POOL is being dragged — dragging a task moves one end of a
 * message too, but a task drag is small and local, and hiding labels for it
 * would flicker them on every nudge.
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
  for (const c of connectors) {
    if (!isMessage(c)) continue;
    if (c.sourceId === draggingId || c.targetId === draggingId) hidden.add(c.id);
  }
  return hidden;
}
