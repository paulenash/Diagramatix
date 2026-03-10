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

function ellipseEdgePoint(from: Point, el: { x: number; y: number; width: number; height: number }): Point {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rx = el.width / 2;
  const ry = el.height / 2;
  const dx = from.x - cx;
  const dy = from.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy - ry };
  const t = 1 / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);
  return { x: cx + dx * t, y: cy + dy * t };
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

// For aligned side pairs (right→left etc.), shrink the stub when elements are close
// so exitPt and approachPt never cross. Non-aligned pairs keep PERP_OFFSET.
function adaptedPerpOffset(
  srcEdge: Point, srcSide: Side,
  tgtEdge: Point, tgtSide: Side
): number {
  let gap: number;
  if      (srcSide === "right"  && tgtSide === "left")   gap = tgtEdge.x - srcEdge.x;
  else if (srcSide === "left"   && tgtSide === "right")  gap = srcEdge.x - tgtEdge.x;
  else if (srcSide === "bottom" && tgtSide === "top")    gap = tgtEdge.y - srcEdge.y;
  else if (srcSide === "top"    && tgtSide === "bottom") gap = srcEdge.y - tgtEdge.y;
  else return PERP_OFFSET;

  if (gap <= 8) return 4;
  return Math.min(PERP_OFFSET, Math.max(4, Math.floor((gap - 4) / 2)));
}

// All elements use centre as connection anchor; invisible leaders trim the interior segment
export function getConnectionPointBySide(el: DiagramElement, _side: Side): Point {
  return { x: el.x + el.width / 2, y: el.y + el.height / 2 };
}

// Returns a point along the specified side at a fractional offset (0=start, 0.5=midpoint, 1=end)
export function sidePoint(el: DiagramElement, side: Side, offset = 0.5): Point {
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
    // Use closest boundary point on each element, along the line between their centres.
    // Use-case elements use the exact ellipse boundary; all others use the bounding rectangle.
    // The invisible leaders hide center→edge; the visible segment is edge→edge.
    const srcEdge = source.type === "use-case"
      ? ellipseEdgePoint(endPt, source)
      : closestEdgePoint(endPt, getBounds(source));
    const tgtEdge = target.type === "use-case"
      ? ellipseEdgePoint(startPt, target)
      : closestEdgePoint(startPt, getBounds(target));
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
    .filter((el) => {
      if (el.id === source.id || el.id === target.id) return false;
      // Don't treat the target's parent subprocess-expanded as an obstacle
      if (target.parentId && el.id === target.parentId && el.type === "subprocess-expanded") return false;
      return true;
    })
    .map(getBounds);

  const perpOff    = adaptedPerpOffset(srcEdge, sourceSide, tgtEdge, targetSide);
  const exitPt     = perpendicularExitScaled(srcEdge, sourceSide, 2);
  const approachPt = perpendicularExitScaled(tgtEdge, targetSide, perpOff);

  let midPath: Point[];
  if (
    (sourceSide === "right" && targetSide === "left") ||
    (sourceSide === "left"  && targetSide === "right")
  ) {
    // Center the vertical segment midway between the two facing horizontal edges
    const midX = (exitPt.x + approachPt.x) / 2;
    midPath = Math.abs(exitPt.y - approachPt.y) < 1
      ? [exitPt, approachPt]
      : [exitPt, { x: midX, y: exitPt.y }, { x: midX, y: approachPt.y }, approachPt];
  } else if (
    (sourceSide === "bottom" && targetSide === "top") ||
    (sourceSide === "top"    && targetSide === "bottom")
  ) {
    // Center the horizontal segment midway between the two facing vertical edges
    const midY = (exitPt.y + approachPt.y) / 2;
    midPath = Math.abs(exitPt.x - approachPt.x) < 1
      ? [exitPt, approachPt]
      : [exitPt, { x: exitPt.x, y: midY }, { x: approachPt.x, y: midY }, approachPt];
  } else {
    midPath = buildOrthogonalPath(exitPt, approachPt, obstacles);
  }

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

export function waypointsToRoundedPath(waypoints: Point[], r = 8): string {
  if (waypoints.length < 2) return "";
  if (waypoints.length === 2)
    return `M ${waypoints[0].x} ${waypoints[0].y} L ${waypoints[1].x} ${waypoints[1].y}`;

  const parts: string[] = [`M ${waypoints[0].x} ${waypoints[0].y}`];

  for (let i = 1; i < waypoints.length - 1; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    const next = waypoints[i + 1];

    const d1x = curr.x - prev.x;
    const d1y = curr.y - prev.y;
    const len1 = Math.sqrt(d1x * d1x + d1y * d1y);

    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;
    const len2 = Math.sqrt(d2x * d2x + d2y * d2y);

    if (len1 < 1 || len2 < 1) {
      parts.push(`L ${curr.x} ${curr.y}`);
      continue;
    }

    // Clamp radius to half the shorter neighbouring segment
    const ar = Math.min(r, len1 / 2, len2 / 2);

    // Approach point (on incoming segment, r before corner)
    const ax = curr.x - (d1x / len1) * ar;
    const ay = curr.y - (d1y / len1) * ar;

    // Departure point (on outgoing segment, r after corner)
    const bx = curr.x + (d2x / len2) * ar;
    const by = curr.y + (d2y / len2) * ar;

    parts.push(`L ${ax} ${ay}`);
    parts.push(`Q ${curr.x} ${curr.y} ${bx} ${by}`);
  }

  const last = waypoints[waypoints.length - 1];
  parts.push(`L ${last.x} ${last.y}`);
  return parts.join(" ");
}

export function waypointsToCurvePath(waypoints: Point[]): string {
  if (waypoints.length < 4) return waypointsToSvgPath(waypoints);
  // Expects [P0, CP1, CP2, P3] — cubic bezier
  const [p0, cp1, cp2, p3] = waypoints;
  return `M ${p0.x} ${p0.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p3.x} ${p3.y}`;
}

// Returns true if the segment at segIdx (0 = exitPt→interior[0]) should be horizontal.
function segIsHoriz(sourceSide: Side, segIdx: number): boolean {
  const startHoriz = sourceSide === "right" || sourceSide === "left";
  return startHoriz ? segIdx % 2 === 0 : segIdx % 2 !== 0;
}

// Ensures every segment in a rectilinear waypoint array is strictly horizontal or vertical.
// Boundary points (0,1,2 and N-3,N-2,N-1) are left unchanged.
// Interior points are snapped via forward sweep + one backward fix for the approach segment.
export function rectifyWaypoints(waypoints: Point[], sourceSide: Side): Point[] {
  const N = waypoints.length;
  if (N < 7) return waypoints;
  const result = waypoints.map((p) => ({ ...p }));

  for (let i = 3; i <= N - 4; i++) {
    const segIdx = i - 3; // 0 = exitPt→interior[0]
    if (segIsHoriz(sourceSide, segIdx)) {
      result[i].y = result[i - 1].y;
    } else {
      result[i].x = result[i - 1].x;
    }
  }

  // Snap last interior → approachPt; uses the opposite axis from the forward sweep, no conflict.
  const lastInterior = N - 4;
  const approachSegIdx = lastInterior - 2; // = N - 6
  if (segIsHoriz(sourceSide, approachSegIdx)) {
    result[lastInterior].y = result[N - 3].y;
  } else {
    result[lastInterior].x = result[N - 3].x;
  }

  return result;
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

    // messageBPMN: always vertical, x derived from sourceOffsetAlong (fraction of source width)
    if (conn.type === "messageBPMN") {
      const BPMN_EVENT_TYPES = new Set(["start-event", "intermediate-event", "end-event"]);
      const tgtIsEvent = target.type === "start-event" || target.type === "intermediate-event";
      let x: number;
      if (tgtIsEvent) {
        x = target.x + target.width / 2;
      } else {
        const rawOffset = conn.sourceOffsetAlong ?? 0.5;
        const offsetAlong = BPMN_EVENT_TYPES.has(source.type) ? 0.5 : rawOffset;
        const srcX = source.x + source.width * offsetAlong;
        const minX = Math.max(source.x, target.x);
        const maxX = Math.min(source.x + source.width, target.x + target.width);
        x = maxX > minX ? Math.max(minX, Math.min(maxX, srcX)) : srcX;
      }
      const srcEdge: Point = conn.sourceSide === "bottom"
        ? { x, y: source.y + source.height } : { x, y: source.y };
      const tgtEdge: Point = conn.targetSide === "top"
        ? { x, y: target.y } : { x, y: target.y + target.height };
      const startPt = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
      const endPt   = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
      return { ...conn, waypoints: [startPt, srcEdge, tgtEdge, endPt],
        sourceInvisibleLeader: true, targetInvisibleLeader: true };
    }

    // Curvilinear: if the user has adjusted handles, preserve control points relative to edges
    if (conn.routingType === "curvilinear" && conn.cp1RelOffset && conn.cp2RelOffset) {
      const srcEdge = sidePoint(source, conn.sourceSide, conn.sourceOffsetAlong ?? 0.5);
      const tgtEdge = sidePoint(target, conn.targetSide, conn.targetOffsetAlong ?? 0.5);
      const startPt = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
      const endPt   = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
      const cp1 = { x: srcEdge.x + conn.cp1RelOffset.x, y: srcEdge.y + conn.cp1RelOffset.y };
      const cp2 = { x: tgtEdge.x + conn.cp2RelOffset.x, y: tgtEdge.y + conn.cp2RelOffset.y };
      return { ...conn, waypoints: [startPt, srcEdge, cp1, cp2, tgtEdge, endPt] };
    }

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
        const perpOff       = adaptedPerpOffset(newSrcEdge, conn.sourceSide, newTgtEdge, conn.targetSide);
        const newExitPt     = perpendicularExitScaled(newSrcEdge, conn.sourceSide, 2);
        const newApproachPt = perpendicularExitScaled(newTgtEdge, conn.targetSide, perpOff);
        const interior = wp.slice(3, N - 3);
        const merged = [
          newSrcCenter, newSrcEdge, newExitPt,
          ...interior,
          newApproachPt, newTgtEdge, newTgtCenter,
        ];
        const rectified = rectifyWaypoints(merged, conn.sourceSide);
        return { ...conn, waypoints: consolidateWaypoints(rectified) };
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
