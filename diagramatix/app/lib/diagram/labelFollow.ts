/**
 * When a connector label goes with its line, and when it stays put.
 *
 * Paul, 22 September 2026, two rules in two messages:
 *
 *   1. "Connector labels located near a horizontal segment of the connector
 *       they are associated with (i.e. above or below it) should move with
 *       that horizontal segment as it is moved up or down. If they are further
 *       away then when they get very close they should then move with that
 *       segment. This is particularly important for outgoing gateway
 *       connectors but should occur for any sequence connector labels in this
 *       situation."
 *
 *   2. "When moving the gateway the connectors originate from, do not move
 *       these labels as is currently done. Except the label on the middle
 *       vertex connector" — "if it exists!"
 *
 * Both are about the same thing — a label belongs to a PLACE on its line, not
 * to its anchor. A label's position is stored as an offset from an anchor (the
 * gateway vertex for a branch, the midpoint of the ends otherwise), and the
 * anchor is the wrong thing to follow in both cases:
 *
 *   • Dragging a middle segment moves neither end, so the anchor stays still
 *     and so did the label — the line slid out from under the words naming it.
 *   • Moving a gateway moves the branch's first point, so the anchor moved and
 *     every branch label moved with it — even though the top and bottom
 *     branches' labels sit by lines that did not move at all.
 *
 * Pure. Works in world coordinates; callers turn the answer back into an
 * offset.
 */
import type { Connector, DiagramElement, Point } from "./types";
import { connectorLabelBox, baseLabelAnchor } from "./checks/layoutViolations";

/** "Very close": a label this near its segment is attached to it, and travels
 *  with it. The default label sits about 6px off its line, so defaults are
 *  attached.
 *
 *  DOUBLED from 8 to 16 on Paul's instruction, 2026-09-23. 8px only just
 *  cleared the 6px a default label sits at, so a label nudged a little way off
 *  its line — which is most labels anyone has tidied by hand — stopped being
 *  carried by it. Widening the catch costs the case where two horizontal
 *  segments run within 16px of each other and the label belongs to the further
 *  one; `homeSegment` already picks the NEAREST, so even then it chooses the
 *  line the words sit against. */
export const SEGMENT_ATTACH_GAP = 16;

export interface HSeg { y: number; x1: number; x2: number }
interface Box { x: number; y: number; w: number; h: number }

/** The horizontal segments of a route, left end first. */
export function horizontalSegments(wp: readonly Point[]): HSeg[] {
  const out: HSeg[] = [];
  for (let i = 0; i + 1 < wp.length; i++) {
    const a = wp[i], b = wp[i + 1];
    if (Math.abs(a.y - b.y) > 0.5 || Math.abs(a.x - b.x) < 0.5) continue;
    out.push({ y: a.y, x1: Math.min(a.x, b.x), x2: Math.max(a.x, b.x) });
  }
  return out;
}

/**
 * The horizontal segment a drag moved: one whose ends are where they were
 * across, and whose height is not. A segment drag moves exactly one, and only
 * vertically, so the x-span is how it is recognised on both sides.
 */
export function movedHorizontalSegment(
  before: readonly Point[],
  after: readonly Point[],
): { from: HSeg; to: HSeg } | null {
  const was = horizontalSegments(before);
  const now = horizontalSegments(after);
  const sameSpan = (a: HSeg, b: HSeg) => Math.abs(a.x1 - b.x1) < 1 && Math.abs(a.x2 - b.x2) < 1;
  const sameY = (a: HSeg, b: HSeg) => Math.abs(a.y - b.y) <= 0.1;
  for (const to of now) {
    const from = was.find((s) => sameSpan(s, to));
    if (from && !sameY(from, to)) return { from, to };
  }
  // FUSED SPANS. When the dragged segment comes level with a neighbour, the
  // route merges the two into one — on either side of the move — and no span
  // matches exactly any more. Without this the label is left behind for that
  // sample, and, because the stored route is now the fused one, for every
  // sample after it too. So fall back to containment: a segment that has no
  // unchanged twin, whose span holds (or is held by) one at a different height.
  const contains = (outer: HSeg, inner: HSeg) => outer.x1 <= inner.x1 + 1 && outer.x2 >= inner.x2 - 1;
  for (const to of now) {
    if (was.some((s) => sameSpan(s, to) && sameY(s, to))) continue;      // an untouched segment
    const from = was.find((s) => !sameY(s, to) && (contains(s, to) || contains(to, s)));
    if (from) return { from, to };
  }
  return null;
}

/**
 * How far the label moves when `from` becomes `to`.
 *
 * The label must sit over or under the segment — their spans overlap — or the
 * segment is not the one it names. Then:
 *   • ATTACHED (within the gap, or overlapping the line): it moves the whole
 *     way, keeping its distance.
 *   • FURTHER AWAY: it stays, unless the segment comes within the gap of it —
 *     then it is picked up at exactly that gap, on the side it was on, and
 *     from the next move on it is attached. A segment moving AWAY from a
 *     label it was never touching leaves it alone.
 */
export function labelShiftForSegmentMove(
  box: Box,
  from: HSeg,
  to: HSeg,
  gap = SEGMENT_ATTACH_GAP,
): number {
  const overlaps = box.x < from.x2 && box.x + box.w > from.x1;
  if (!overlaps) return 0;
  const above = box.y + box.h / 2 < from.y;
  const gapBefore = above ? from.y - (box.y + box.h) : box.y - from.y;
  if (gapBefore <= gap) return to.y - from.y;
  const gapAfter = above ? to.y - (box.y + box.h) : box.y - to.y;
  if (gapAfter >= gap) return 0;
  return above ? (to.y - gap - box.h) - box.y : (to.y + gap) - box.y;
}

/**
 * The route as DRAWN — without the invisible leaders that run from a shape's
 * edge to its centre. A label sits beside a line the reader can see; a leader
 * inside a task is not somewhere a label can belong, and counting one let the
 * rule attach a label to a segment that is never drawn.
 */
function drawnRoute(c: Connector): Point[] {
  let w = c.waypoints ?? [];
  if (c.sourceInvisibleLeader && w.length > 2) w = w.slice(1);
  if (c.targetInvisibleLeader && w.length > 2) w = w.slice(0, -1);
  return w;
}

/** The label's offset as it is actually drawn — stored or default. */
function effectiveOffset(c: Connector): { x: number; y: number } | null {
  const box = connectorLabelBox(c);
  const anchor = baseLabelAnchor(c);
  if (!box || !anchor) return null;
  return { x: box.x + box.w / 2 - anchor.x, y: box.y - anchor.y };
}

/** The horizontal segment a label is attached to — over or under it and
 *  within the gap — the nearest if more than one. */
function homeSegment(box: Box, route: readonly Point[], gap = SEGMENT_ATTACH_GAP): HSeg | null {
  let best: HSeg | null = null, bestGap = Infinity;
  for (const s of horizontalSegments(route)) {
    if (!(box.x < s.x2 && box.x + box.w > s.x1)) continue;
    const above = box.y + box.h / 2 < s.y;
    const g = above ? s.y - (box.y + box.h) : box.y - s.y;
    if (g <= gap && g < bestGap) { best = s; bestGap = g; }
  }
  return best;
}

/**
 * Where the label's home segment went in the new route.
 *
 * Of the new horizontal segments still over or under the label, prefer those
 * sharing some of the old home segment's span — it is the same stretch of
 * line — and of those take the one nearest to where the home segment WOULD be
 * if it had moved with the label (`expectedY`).
 *
 * Nearest-to-expected rather than largest-share, because a re-route can SPLIT
 * a segment: a gateway's straight middle branch becomes a Z when the gateway
 * moves up, and both halves share the old span. The label travelled with the
 * gateway, so the half beside the gateway is where it expects its line to be —
 * choosing by share would pick whichever half happened to be longer.
 */
function correspondingSegment(home: HSeg, box: Box, route: readonly Point[], expectedY: number): HSeg | null {
  const over = horizontalSegments(route).filter((s) => box.x < s.x2 && box.x + box.w > s.x1);
  const sharing = over.filter((s) => Math.min(s.x2, home.x2) - Math.max(s.x1, home.x1) > 0.5);
  const pool = sharing.length > 0 ? sharing : over;
  let best: HSeg | null = null, bestDist = Infinity;
  for (const s of pool) {
    const d = Math.abs(s.y - expectedY);
    if (d < bestDist) { best = s; bestDist = d; }
  }
  return best;
}

/**
 * RULE 1 — whenever a sequence flow's ROUTE changes, however it changed: a
 * segment dragged by hand, the task at one end moved, the connector
 * re-routed. Paul, 2026-09-22, after the segment-drag version shipped:
 *
 *   "1. L-shaped connector enters a Task and attaches to the left boundary.
 *       Move the Task upwards, then the horizontal segment of that connector
 *       moves up but the label does not.
 *    2. Re-routing a connector does not move the label with the horizontal
 *       segment."
 *
 * Both were the same gap: the rule ran on ONE action, the segment drag, and a
 * route changes through a dozen. So it runs on the result of any of them.
 *
 * The label is PLACED, not nudged: it ends up the same distance from its home
 * segment as it was before the change, whatever else moved it. That matters
 * because the anchor sometimes moves too — a task-to-task label is anchored at
 * the midpoint of the ends, so moving one end drags it half as far as the
 * segment it sits on; and a gateway's middle branch carries its label with the
 * gateway. Placing it relative to the segment gives the right answer in every
 * one of those cases without having to know which of them happened.
 *
 * A label not attached to any segment is picked up only by a segment that
 * came up to it (`labelShiftForSegmentMove`); otherwise it stays.
 *
 * `before` is the connector as it was; `after` is the same connector as the
 * action left it. Returns the offsets to write, or null. Sequence flows only.
 */
export function labelFollowOnRouteChange(
  before: Connector,
  after: Connector,
): { labelOffsetX: number; labelOffsetY: number } | null {
  if (after.type !== "sequence" || !after.label?.trim()) return null;
  const oldBox = connectorLabelBox(before);
  const box = connectorLabelBox(after);
  const off = effectiveOffset(after);
  if (!oldBox || !box || !off) return null;

  let wantY: number | null = null;
  const home = homeSegment(oldBox, drawnRoute(before));
  if (home) {
    const now = correspondingSegment(home, box, drawnRoute(after), home.y + (box.y - oldBox.y));
    if (!now) return null;                       // nothing over or under it any more — leave it
    wantY = oldBox.y + (now.y - home.y);
  } else {
    const moved = movedHorizontalSegment(drawnRoute(before), drawnRoute(after));
    if (!moved) return null;
    const dy = labelShiftForSegmentMove(oldBox, moved.from, moved.to);
    if (Math.abs(dy) < 0.1) return null;
    wantY = oldBox.y + dy;
  }
  const shift = wantY - box.y;
  if (Math.abs(shift) < 0.1) return null;
  return { labelOffsetX: off.x, labelOffsetY: off.y + shift };
}

/**
 * Apply rule 1 across a whole action: every labelled sequence flow whose route
 * changed. Returns the SAME array when nothing needed placing.
 */
export function labelsFollowTheirSegments(wasConns: readonly Connector[], conns: Connector[]): Connector[] {
  const was = new Map(wasConns.map((c) => [c.id, c] as const));
  let changed = false;
  const out = conns.map((c) => {
    const b = was.get(c.id);
    if (!b || b.waypoints === c.waypoints) return c;          // route untouched
    const follow = labelFollowOnRouteChange(b, c);
    if (!follow) return c;
    changed = true;
    return { ...c, ...follow };
  });
  return changed ? out : conns;
}

/** Is this the branch leaving a gateway's SIDE vertex — the middle one? */
export function leavesMiddleVertex(c: Pick<Connector, "sourceSide">): boolean {
  return c.sourceSide === "left" || c.sourceSide === "right";
}

/**
 * RULE 2 — an element move. For every labelled branch leaving a gateway that
 * moved, from its TOP or BOTTOM vertex, while its target did not: put the
 * label back where it was in the world. The middle-vertex branch — if there is
 * one — is left to travel with the gateway, as before.
 *
 * "While its target did not" is what keeps a group move a group move: when the
 * gateway and everything it points at travel together, so do the labels.
 *
 * Returns the SAME array when nothing needed holding.
 */
export function holdGatewayBranchLabels(
  wasEls: readonly DiagramElement[],
  wasConns: readonly Connector[],
  els: readonly DiagramElement[],
  conns: Connector[],
): Connector[] {
  const wasById = new Map(wasEls.map((e) => [e.id, e] as const));
  const byId = new Map(els.map((e) => [e.id, e] as const));
  const wasConnById = new Map(wasConns.map((c) => [c.id, c] as const));
  const moved = (id: string) => {
    const a = wasById.get(id), b = byId.get(id);
    return !!a && !!b && (Math.abs(a.x - b.x) > 0.01 || Math.abs(a.y - b.y) > 0.01);
  };
  let changed = false;
  const out = conns.map((c) => {
    if (!c.label || !c.label.trim() || leavesMiddleVertex(c)) return c;
    if (byId.get(c.sourceId)?.type !== "gateway") return c;
    if (!moved(c.sourceId) || moved(c.targetId)) return c;
    const was = wasConnById.get(c.id);
    if (!was) return c;
    const oldBox = connectorLabelBox(was);
    const newBox = connectorLabelBox(c);
    const off = effectiveOffset(c);
    if (!oldBox || !newBox || !off) return c;
    const dx = oldBox.x - newBox.x, dy = oldBox.y - newBox.y;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return c;
    changed = true;
    return { ...c, labelOffsetX: off.x + dx, labelOffsetY: off.y + dy };
  });
  return changed ? out : conns;
}
