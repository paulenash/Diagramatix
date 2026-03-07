import type { Bounds, Connector, DiagramElement, Point, RoutingType, Side } from "./types";

function getBounds(el: DiagramElement): Bounds {
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}

function euclideanDist(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function closestEdgePoint(from: Point, b: Bounds): Point {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const dx = from.x - cx;
  const dy = from.y - cy;

  if (Math.abs(dx) === 0 && Math.abs(dy) === 0) {
    return { x: cx, y: b.y };
  }

  const scaleX = Math.abs(dx) > 0 ? b.width / 2 / Math.abs(dx) : Infinity;
  const scaleY = Math.abs(dy) > 0 ? b.height / 2 / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);

  return {
    x: cx + dx * scale,
    y: cy + dy * scale,
  };
}

function boundsOverlapWithMargin(b: Bounds, margin: number): (p: Point) => boolean {
  return (p: Point) =>
    p.x > b.x - margin &&
    p.x < b.x + b.width + margin &&
    p.y > b.y - margin &&
    p.y < b.y + b.height + margin;
}

function buildOrthogonalPath(
  start: Point,
  end: Point,
  obstacles: Bounds[]
): Point[] {
  const mid1: Point = { x: end.x, y: start.y };
  const mid2: Point = { x: start.x, y: end.y };

  const pathA = [start, mid1, end];
  const pathB = [start, mid2, end];

  const hitsMid = (mid: Point) =>
    obstacles.some((obs) => boundsOverlapWithMargin(obs, 8)(mid));

  if (!hitsMid(mid1)) return pathA;
  if (!hitsMid(mid2)) return pathB;

  const bypassY = start.y - 40;
  return [
    start,
    { x: start.x, y: bypassY },
    { x: end.x, y: bypassY },
    end,
  ];
}

const PERP_OFFSET = 24;

function perpendicularExit(pt: Point, side: Side): Point {
  switch (side) {
    case "right":  return { x: pt.x + PERP_OFFSET, y: pt.y };
    case "left":   return { x: pt.x - PERP_OFFSET, y: pt.y };
    case "top":    return { x: pt.x, y: pt.y - PERP_OFFSET };
    case "bottom": return { x: pt.x, y: pt.y + PERP_OFFSET };
  }
}

function perpendicularApproach(pt: Point, side: Side): Point {
  switch (side) {
    case "right":  return { x: pt.x + PERP_OFFSET, y: pt.y };
    case "left":   return { x: pt.x - PERP_OFFSET, y: pt.y };
    case "top":    return { x: pt.x, y: pt.y - PERP_OFFSET };
    case "bottom": return { x: pt.x, y: pt.y + PERP_OFFSET };
  }
}

function perpendicularExitScaled(pt: Point, side: Side, offset: number): Point {
  switch (side) {
    case "right":  return { x: pt.x + offset, y: pt.y };
    case "left":   return { x: pt.x - offset, y: pt.y };
    case "top":    return { x: pt.x, y: pt.y - offset };
    case "bottom": return { x: pt.x, y: pt.y + offset };
  }
}

// All elements use centre as connection anchor; invisible leaders trim the interior segment
export function getConnectionPointBySide(el: DiagramElement, _side: Side): Point {
  return { x: el.x + el.width / 2, y: el.y + el.height / 2 };
}

// Returns a point along the specified side at a fractional offset (0=start, 0.5=midpoint, 1=end)
function sidePoint(el: DiagramElement, side: Side, offset = 0.5): Point {
  switch (side) {
    case "right":  return { x: el.x + el.width,         y: el.y + el.height * offset };
    case "left":   return { x: el.x,                    y: el.y + el.height * offset };
    case "top":    return { x: el.x + el.width * offset, y: el.y };
    case "bottom": return { x: el.x + el.width * offset, y: el.y + el.height };
  }
}

export function computeWaypoints(
  source: DiagramElement,
  target: DiagramElement,
  allElements: DiagramElement[],
  sourceSide: Side,
  targetSide: Side,
  routingType: RoutingType,
  sourceOffsetAlong = 0.5,
  targetOffsetAlong = 0.5,
): { waypoints: Point[]; sourceInvisibleLeader: boolean; targetInvisibleLeader: boolean } {
  const startPt = getConnectionPointBySide(source, sourceSide); // source centre
  const endPt   = getConnectionPointBySide(target, targetSide); // target centre

  if (routingType === "direct") {
    // [sourceCenter, srcEdge, tgtEdge, targetCenter]
    const srcEdge = sidePoint(source, sourceSide, sourceOffsetAlong);
    const tgtEdge = sidePoint(target, targetSide, targetOffsetAlong);
    return {
      waypoints: [startPt, srcEdge, tgtEdge, endPt],
      sourceInvisibleLeader: true,
      targetInvisibleLeader: true,
    };
  }

  if (routingType === "curvilinear") {
    // [sourceCenter, srcEdge, cp1, cp2, tgtEdge, targetCenter]
    const srcEdge = sidePoint(source, sourceSide, sourceOffsetAlong);
    const tgtEdge = sidePoint(target, targetSide, targetOffsetAlong);
    const dist   = euclideanDist(srcEdge, tgtEdge);
    const curveOffset = Math.max(60, dist / 3);
    const cp1 = perpendicularExitScaled(srcEdge, sourceSide, curveOffset);
    const cp2 = perpendicularExitScaled(tgtEdge, targetSide, curveOffset);
    return {
      waypoints: [startPt, srcEdge, cp1, cp2, tgtEdge, endPt],
      sourceInvisibleLeader: true,
      targetInvisibleLeader: true,
    };
  }

  // Rectilinear: use offset-aware side points for perpendicular exit/entry
  const srcEdge = sidePoint(source, sourceSide, sourceOffsetAlong);
  const tgtEdge = sidePoint(target, targetSide, targetOffsetAlong);
  const obstacles = allElements
    .filter((el) => el.id !== source.id && el.id !== target.id)
    .map(getBounds);

  const exitPt     = perpendicularExit(srcEdge, sourceSide);
  const approachPt = perpendicularApproach(tgtEdge, targetSide);
  const midPath    = buildOrthogonalPath(exitPt, approachPt, obstacles);

  return {
    waypoints: [startPt, srcEdge, ...midPath, tgtEdge, endPt],
    sourceInvisibleLeader: true,
    targetInvisibleLeader: true,
  };
}

export function waypointsToSvgPath(waypoints: Point[]): string {
  if (waypoints.length === 0) return "";
  const [first, ...rest] = waypoints;
  const d = [`M ${first.x} ${first.y}`];
  for (const pt of rest) {
    d.push(`L ${pt.x} ${pt.y}`);
  }
  return d.join(" ");
}

export function waypointsToCurvePath(waypoints: Point[]): string {
  if (waypoints.length < 4) return waypointsToSvgPath(waypoints);
  // Expects [P0, CP1, CP2, P3] — cubic bezier
  const [p0, cp1, cp2, p3] = waypoints;
  return `M ${p0.x} ${p0.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p3.x} ${p3.y}`;
}

// Removes interior waypoints that are within 8px of the previous point.
// Always preserves the 4 boundary points (srcCenter, srcEdge, tgtEdge, tgtCenter).
export function consolidateWaypoints(wps: Point[]): Point[] {
  const THRESHOLD = 8;
  if (wps.length <= 4) return wps;
  const result = [wps[0], wps[1]];
  for (let i = 2; i < wps.length - 2; i++) {
    const prev = result[result.length - 1];
    if (Math.hypot(wps[i].x - prev.x, wps[i].y - prev.y) >= THRESHOLD)
      result.push(wps[i]);
  }
  result.push(wps[wps.length - 2], wps[wps.length - 1]);
  return result;
}

export function recomputeAllConnectors(
  connectors: Connector[],
  elements: DiagramElement[]
): Connector[] {
  const elementMap = new Map(elements.map((el) => [el.id, el]));
  return connectors.map((conn) => {
    const source = elementMap.get(conn.sourceId);
    const target = elementMap.get(conn.targetId);
    if (!source || !target) return conn;

    // For rectilinear connectors with enough waypoints, preserve user's interior routing.
    // Only the 6 boundary waypoints (srcCenter, srcEdge, exitPt, approachPt, tgtEdge, tgtCenter)
    // are updated; interior turns (indices 3..N-4) are kept as-is.
    if (conn.routingType === "rectilinear") {
      const wp = conn.waypoints;
      const N = wp.length;
      if (N >= 7) {
        const newSrcCenter  = getConnectionPointBySide(source, conn.sourceSide);
        const newTgtCenter  = getConnectionPointBySide(target, conn.targetSide);
        const newSrcEdge    = sidePoint(source, conn.sourceSide, conn.sourceOffsetAlong ?? 0.5);
        const newTgtEdge    = sidePoint(target, conn.targetSide, conn.targetOffsetAlong ?? 0.5);
        const newExitPt     = perpendicularExit(newSrcEdge, conn.sourceSide);
        const newApproachPt = perpendicularApproach(newTgtEdge, conn.targetSide);
        const interior = wp.slice(3, N - 3);
        const newWaypoints = [
          newSrcCenter, newSrcEdge, newExitPt,
          ...interior,
          newApproachPt, newTgtEdge, newTgtCenter,
        ];
        return { ...conn, waypoints: consolidateWaypoints(newWaypoints) };
      }
    }

    // Full recompute for non-rectilinear or connectors with fewer than 7 waypoints
    const { waypoints, sourceInvisibleLeader, targetInvisibleLeader } = computeWaypoints(
      source, target, elements,
      conn.sourceSide, conn.targetSide, conn.routingType,
      conn.sourceOffsetAlong ?? 0.5, conn.targetOffsetAlong ?? 0.5,
    );
    return { ...conn, waypoints, sourceInvisibleLeader, targetInvisibleLeader };
  });
}
