/**
 * EXPERIMENTAL "Test" BPMN connector engine (SuperAdmin-only, opt-in per run).
 *
 * A deterministic alternative to the normal connector routing, applied ONLY to
 * SEQUENCE flows after the standard `layoutBpmnDiagram` has placed every element
 * (positions, overlap, gateway ordering are reused untouched). Message /
 * association / annotation connectors pass through unchanged.
 *
 * Rules (Paul's spec — see plan `sparkling-doodling-moon.md`):
 *   C1 Activities & Events
 *     C1.1 Forward  → middle (offset 0.5) of the two closest facing sides.
 *     C1.2 Backward → middle of the TOP side of BOTH ends ("staple over the top").
 *   C2 Decision gateway (merge = mirror), always the diamond VERTEX (offset 0.5):
 *     C2.1 branch element up-and-right   → gateway TOP vertex.
 *     C2.2 branch element down-and-right → gateway BOTTOM vertex.
 *     C2.3 element level (vertical overlap) → the side vertex facing it (right/left).
 *     Decision incoming / merge outgoing (the "stem") → the facing side vertex.
 *
 * Obstacle avoidance is deliberately OFF — waypoints are simple orthogonal
 * (straight / L / Z / top-staple) paths between the chosen face midpoints.
 */
import type { Connector, DiagramElement, Side, Point } from "./types";

const BACKWARD_EPS = 4; // target this far left of source ⇒ a rework/loop back-edge
const STAPLE_GAP = 40; // how far above both tops a backward "staple" rides
const SEQUENCE_TYPE = "sequence";

const cx = (e: DiagramElement) => e.x + e.width / 2;
const cy = (e: DiagramElement) => e.y + e.height / 2;
const centre = (e: DiagramElement): Point => ({ x: cx(e), y: cy(e) });

/** Midpoint of a named side (= the diamond vertex for a gateway). */
function faceMid(e: DiagramElement, side: Side): Point {
  switch (side) {
    case "top": return { x: cx(e), y: e.y };
    case "bottom": return { x: cx(e), y: e.y + e.height };
    case "left": return { x: e.x, y: cy(e) };
    case "right": return { x: e.x + e.width, y: cy(e) };
  }
}

/** The side of `self` facing `other`, by the dominant centre-delta axis. */
function facingSide(self: DiagramElement, other: DiagramElement): Side {
  const dx = cx(other) - cx(self);
  const dy = cy(other) - cy(self);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

/** True when the two boxes share a horizontal band (vertical extents overlap). */
function overlapsVertically(a: DiagramElement, b: DiagramElement): boolean {
  return !(a.y >= b.y + b.height || a.y + a.height <= b.y);
}

const isGateway = (e: DiagramElement) => e.type === "gateway";
function gatewayRole(e: DiagramElement): "decision" | "merge" | undefined {
  const r = (e.properties as { gatewayRole?: unknown } | undefined)?.gatewayRole;
  return r === "decision" || r === "merge" ? r : undefined;
}

/**
 * The diamond vertex side for a gateway end (C2). `isFan` = the branching side
 * (decision source / merge target): pick top/bottom/side by the other element's
 * position. Otherwise (the single stem end) use the facing horizontal vertex.
 */
function gatewayVertexSide(self: DiagramElement, other: DiagramElement, isFan: boolean): Side {
  const facingH: Side = cx(other) >= cx(self) ? "right" : "left";
  if (!isFan) return facingH;                                 // stem: decision-in / merge-out
  if (overlapsVertically(self, other)) return facingH;        // C2.3 level → side vertex
  return cy(other) < cy(self) ? "top" : "bottom";             // C2.1 up / C2.2 down
}

/** Endpoint side for one end of a sequence connector. */
function pickSide(self: DiagramElement, other: DiagramElement, isSource: boolean, backward: boolean): Side {
  if (isGateway(self)) {
    const role = gatewayRole(self);
    const isFan = (role === "decision" && isSource) || (role === "merge" && !isSource);
    return gatewayVertexSide(self, other, isFan);
  }
  if (backward) return "top";                                 // C1.2 both ends top
  return facingSide(self, other);                             // C1.1 facing side
}

/** Orthogonal path between two face midpoints — NO obstacle avoidance. */
function orthogonalNoAvoid(srcPt: Point, srcSide: Side, tgtPt: Point, tgtSide: Side): Point[] {
  const srcH = srcSide === "left" || srcSide === "right";
  const tgtH = tgtSide === "left" || tgtSide === "right";
  // Backward staple: both exit the top, ride up over the higher of the two.
  if (srcSide === "top" && tgtSide === "top") {
    const topY = Math.min(srcPt.y, tgtPt.y) - STAPLE_GAP;
    return [srcPt, { x: srcPt.x, y: topY }, { x: tgtPt.x, y: topY }, tgtPt];
  }
  if (srcH && tgtH) {
    if (Math.abs(srcPt.y - tgtPt.y) < 1) return [srcPt, tgtPt];
    const midX = (srcPt.x + tgtPt.x) / 2;
    return [srcPt, { x: midX, y: srcPt.y }, { x: midX, y: tgtPt.y }, tgtPt];
  }
  if (!srcH && !tgtH) {
    if (Math.abs(srcPt.x - tgtPt.x) < 1) return [srcPt, tgtPt];
    const midY = (srcPt.y + tgtPt.y) / 2;
    return [srcPt, { x: srcPt.x, y: midY }, { x: tgtPt.x, y: midY }, tgtPt];
  }
  // Mixed (one horizontal exit, one vertical) → single perpendicular elbow.
  if (srcH) return [srcPt, { x: tgtPt.x, y: srcPt.y }, tgtPt];
  return [srcPt, { x: srcPt.x, y: tgtPt.y }, tgtPt];
}

/**
 * Re-derive endpoints + waypoints for every SEQUENCE connector per C1/C2, on top
 * of the finished element geometry. Non-sequence connectors are returned as-is.
 */
export function buildTestConnectors(connectors: Connector[], elements: DiagramElement[]): Connector[] {
  const byId = new Map(elements.map((e) => [e.id, e]));
  return connectors.map((conn) => {
    if (conn.type !== SEQUENCE_TYPE) return conn;
    const src = byId.get(conn.sourceId);
    const tgt = byId.get(conn.targetId);
    if (!src || !tgt || src.id === tgt.id) return conn;

    const backward = cx(tgt) < cx(src) - BACKWARD_EPS;
    const sourceSide = pickSide(src, tgt, true, backward);
    const targetSide = pickSide(tgt, src, false, backward);
    const srcPt = faceMid(src, sourceSide);
    const tgtPt = faceMid(tgt, targetSide);
    const mid = orthogonalNoAvoid(srcPt, sourceSide, tgtPt, targetSide);

    return {
      ...conn,
      sourceSide,
      targetSide,
      sourceOffsetAlong: 0.5,
      targetOffsetAlong: 0.5,
      routingType: "rectilinear",
      sourceInvisibleLeader: true,
      targetInvisibleLeader: true,
      waypoints: [centre(src), ...mid, centre(tgt)],
    };
  });
}
