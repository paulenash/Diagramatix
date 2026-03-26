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

// Direction vector for a side's outward normal
function sideNormalDir(side: Side): { dx: number; dy: number } {
  switch (side) {
    case "right":  return { dx: 1, dy: 0 };
    case "left":   return { dx: -1, dy: 0 };
    case "bottom": return { dx: 0, dy: 1 };
    case "top":    return { dx: 0, dy: -1 };
  }
}

// Determine which side of an element is closest to a given point
function getClosestSideOfElement(px: number, py: number, el: DiagramElement): Side {
  const cx = el.x + el.width / 2, cy = el.y + el.height / 2;
  const dx = px - cx, dy = py - cy;
  const normX = Math.abs(dx) / (el.width / 2 || 1);
  const normY = Math.abs(dy) / (el.height / 2 || 1);
  if (normX > normY) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
}

// Project a point onto an element's side to get the fractional offset along that side
function getOffsetAlong(el: DiagramElement, side: Side, pt: Point): number {
  const clamp = (v: number) => Math.max(0.1, Math.min(0.9, v));
  if (side === "top" || side === "bottom") return clamp((pt.x - el.x) / el.width);
  return clamp((pt.y - el.y) / el.height);
}

// Check if an axis-aligned segment (horizontal or vertical) intersects an obstacle bounds
function segmentHitsObstacle(p1: Point, p2: Point, obs: Bounds, margin = 4): boolean {
  const left = obs.x - margin, right = obs.x + obs.width + margin;
  const top = obs.y - margin, bottom = obs.y + obs.height + margin;
  // Horizontal segment
  if (Math.abs(p1.y - p2.y) < 1) {
    if (p1.y < top || p1.y > bottom) return false;
    const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
    return maxX > left && minX < right;
  }
  // Vertical segment
  if (Math.abs(p1.x - p2.x) < 1) {
    if (p1.x < left || p1.x > right) return false;
    const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
    return maxY > top && minY < bottom;
  }
  return false;
}

// Check if any segment of a path hits any obstacle
function pathHitsObstacles(path: Point[], obstacles: Bounds[]): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    for (const obs of obstacles) {
      if (segmentHitsObstacle(path[i], path[i + 1], obs)) return true;
    }
  }
  return false;
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

  if (!pathHitsObstacles(pathA, obstacles)) return pathA;
  if (!pathHitsObstacles(pathB, obstacles)) return pathB;

  // Both L-shaped paths blocked — route around ALL obstacles
  const MARGIN = 20;

  // Use ALL obstacles to compute safe routing bounds
  const bottomY = Math.max(start.y, end.y, ...obstacles.map(o => o.y + o.height)) + MARGIN;
  const topY = Math.min(start.y, end.y, ...obstacles.map(o => o.y)) - MARGIN;
  const rightX = Math.max(start.x, end.x, ...obstacles.map(o => o.x + o.width)) + MARGIN;
  const leftX = Math.min(start.x, end.x, ...obstacles.map(o => o.x)) - MARGIN;

  const candidates: { path: Point[]; len: number }[] = [
    { path: [start, { x: start.x, y: bottomY }, { x: end.x, y: bottomY }, end], len: 0 },
    { path: [start, { x: start.x, y: topY }, { x: end.x, y: topY }, end], len: 0 },
    { path: [start, { x: rightX, y: start.y }, { x: rightX, y: end.y }, end], len: 0 },
    { path: [start, { x: leftX, y: start.y }, { x: leftX, y: end.y }, end], len: 0 },
  ];
  // Compute total segment length for each candidate
  for (const c of candidates) {
    let len = 0;
    for (let i = 0; i < c.path.length - 1; i++) {
      len += Math.abs(c.path[i + 1].x - c.path[i].x) + Math.abs(c.path[i + 1].y - c.path[i].y);
    }
    c.len = len;
  }
  // Sort by length — prefer shortest path
  candidates.sort((a, b) => a.len - b.len);

  for (const c of candidates) {
    if (!pathHitsObstacles(c.path, obstacles)) return c.path;
  }

  // Last resort: route far enough outside all obstacles
  const farY = topY - MARGIN;
  const farPath = [start, { x: start.x, y: farY }, { x: end.x, y: farY }, end];
  if (!pathHitsObstacles(farPath, obstacles)) return farPath;

  return candidates[0].path;
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

// Control point along the radial outward direction from element centre through the edge point
function radialControlPoint(edgePt: Point, el: DiagramElement, offset: number): Point {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const dx = edgePt.x - cx;
  const dy = edgePt.y - cy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { x: edgePt.x, y: edgePt.y - offset };
  return { x: edgePt.x + (dx / len) * offset, y: edgePt.y + (dy / len) * offset };
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
    const CIRCULAR_TYPES = new Set(["use-case", "process-system"]);
    const srcEdge = CIRCULAR_TYPES.has(source.type)
      ? ellipseEdgePoint(endPt, source)
      : closestEdgePoint(endPt, getBounds(source));
    const tgtEdge = CIRCULAR_TYPES.has(target.type)
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
    const CIRC_TYPES = new Set(["use-case", "process-system"]);
    const srcEdgeRaw = sidePoint(source, sourceSide, sourceOffsetAlong);
    const tgtEdgeRaw = sidePoint(target, targetSide, targetOffsetAlong);
    // Project onto circle boundary for circular elements
    const srcIsCirc = CIRC_TYPES.has(source.type);
    const tgtIsCirc = CIRC_TYPES.has(target.type);
    const srcEdge = srcIsCirc ? ellipseEdgePoint(srcEdgeRaw, source) : srcEdgeRaw;
    const tgtEdge = tgtIsCirc ? ellipseEdgePoint(tgtEdgeRaw, target) : tgtEdgeRaw;
    const dist   = euclideanDist(srcEdge, tgtEdge);
    const curveOffset = Math.max(60, dist / 3);
    // For circular elements, control point extends along the radial normal (outward from centre)
    const cp1 = srcIsCirc ? radialControlPoint(srcEdge, source, curveOffset) : perpendicularExitScaled(srcEdge, sourceSide, curveOffset);
    const cp2 = tgtIsCirc ? radialControlPoint(tgtEdge, target, curveOffset) : perpendicularExitScaled(tgtEdge, targetSide, curveOffset);
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
      // Don't treat boundary events on source or target as obstacles
      if (el.boundaryHostId === source.id || el.boundaryHostId === target.id) return false;
      // Don't treat the target's parent subprocess-expanded as an obstacle
      if (target.parentId && el.id === target.parentId && el.type === "subprocess-expanded") return false;
      // Don't treat the source's parent subprocess-expanded as an obstacle
      if (source.parentId && el.id === source.parentId && el.type === "subprocess-expanded") return false;
      // Don't treat pools or lanes as obstacles (connectors route within them)
      if (el.type === "pool" || el.type === "lane") return false;
      return true;
    })
    .map(getBounds);

  // Check if exit/approach stubs land inside an obstacle — if so, pick better sides
  function pointInsideAnyObstacle(pt: Point, obs: Bounds[]): boolean {
    return obs.some(o => pt.x > o.x && pt.x < o.x + o.width && pt.y > o.y && pt.y < o.y + o.height);
  }

  let effectiveSrcSide = sourceSide;
  let effectiveTgtSide = targetSide;
  let effectiveSrcEdge = srcEdge;
  let effectiveTgtEdge = tgtEdge;

  const testPerpOff = adaptedPerpOffset(srcEdge, sourceSide, tgtEdge, targetSide);
  const testExitPt = perpendicularExitScaled(srcEdge, sourceSide, Math.min(testPerpOff, Math.min(source.width, source.height) * 0.5));
  const testApproachPt = perpendicularExitScaled(tgtEdge, targetSide, Math.min(testPerpOff, Math.min(target.width, target.height) * 0.5));

  if (pointInsideAnyObstacle(testExitPt, obstacles) || pointInsideAnyObstacle(testApproachPt, obstacles)) {
    // Current sides cause exit/approach inside an obstacle — recalculate optimal facing sides
    const srcCx = source.x + source.width / 2, srcCy = source.y + source.height / 2;
    const tgtCx = target.x + target.width / 2, tgtCy = target.y + target.height / 2;
    const ddx = tgtCx - srcCx, ddy = tgtCy - srcCy;
    // Try all 4 side combinations and pick one where exit/approach don't hit obstacles
    const sidePairs: [Side, Side][] = [
      [ddx > 0 ? "right" : "left", ddx > 0 ? "left" : "right"],
      [ddy > 0 ? "bottom" : "top", ddy > 0 ? "top" : "bottom"],
      [ddx > 0 ? "left" : "right", ddx > 0 ? "right" : "left"],
      [ddy > 0 ? "top" : "bottom", ddy > 0 ? "bottom" : "top"],
    ];
    for (const [ss, ts] of sidePairs) {
      const se = sidePoint(source, ss, 0.5);
      const te = sidePoint(target, ts, 0.5);
      const po = adaptedPerpOffset(se, ss, te, ts);
      const ep = perpendicularExitScaled(se, ss, Math.min(po, Math.min(source.width, source.height) * 0.5));
      const ap = perpendicularExitScaled(te, ts, Math.min(po, Math.min(target.width, target.height) * 0.5));
      if (!pointInsideAnyObstacle(ep, obstacles) && !pointInsideAnyObstacle(ap, obstacles)) {
        effectiveSrcSide = ss;
        effectiveTgtSide = ts;
        effectiveSrcEdge = se;
        effectiveTgtEdge = te;
        break;
      }
    }
  }

  const perpOff    = adaptedPerpOffset(effectiveSrcEdge, effectiveSrcSide, effectiveTgtEdge, effectiveTgtSide);
  const srcPerpOff = Math.min(perpOff, Math.min(source.width, source.height) * 0.5);
  const tgtPerpOff = Math.min(perpOff, Math.min(target.width, target.height) * 0.5);
  const exitPt     = perpendicularExitScaled(effectiveSrcEdge, effectiveSrcSide, srcPerpOff);
  const approachPt = perpendicularExitScaled(effectiveTgtEdge, effectiveTgtSide, tgtPerpOff);

  const srcDir = sideNormalDir(effectiveSrcSide);
  const tgtDir = sideNormalDir(effectiveTgtSide);

  // Verify exit/approach stubs go outward
  const exitOutward = (exitPt.x - srcEdge.x) * srcDir.dx >= 0 && (exitPt.y - srcEdge.y) * srcDir.dy >= 0;
  const approachOutward = (approachPt.x - tgtEdge.x) * tgtDir.dx >= 0 && (approachPt.y - tgtEdge.y) * tgtDir.dy >= 0;

  let midPath: Point[];
  if (
    exitOutward && approachOutward &&
    ((sourceSide === "right" && targetSide === "left") ||
    (sourceSide === "left"  && targetSide === "right"))
  ) {
    // Facing horizontal sides — verify exit goes toward approach (outward direction)
    const goesRight = sourceSide === "right";
    const exitTowardApproach = goesRight ? exitPt.x <= approachPt.x : exitPt.x >= approachPt.x;
    if (exitTowardApproach) {
      const midX = (exitPt.x + approachPt.x) / 2;
      midPath = Math.abs(exitPt.y - approachPt.y) < 1
        ? [exitPt, approachPt]
        : [exitPt, { x: midX, y: exitPt.y }, { x: midX, y: approachPt.y }, approachPt];
    } else {
      midPath = buildOrthogonalPath(exitPt, approachPt, obstacles);
    }
  } else if (
    exitOutward && approachOutward &&
    ((sourceSide === "bottom" && targetSide === "top") ||
    (sourceSide === "top"    && targetSide === "bottom"))
  ) {
    // Facing vertical sides — verify exit goes toward approach
    const goesDown = sourceSide === "bottom";
    const exitTowardApproach = goesDown ? exitPt.y <= approachPt.y : exitPt.y >= approachPt.y;
    if (exitTowardApproach) {
      const midY = (exitPt.y + approachPt.y) / 2;
      midPath = Math.abs(exitPt.x - approachPt.x) < 1
        ? [exitPt, approachPt]
        : [exitPt, { x: exitPt.x, y: midY }, { x: approachPt.x, y: midY }, approachPt];
    } else {
      midPath = buildOrthogonalPath(exitPt, approachPt, obstacles);
    }
  } else {
    // Perpendicular sides (e.g., right→top, bottom→left, etc.)
    // Try L-shape paths that maintain perpendicularity at both ends

    // L-shape corner options
    const lCorner1: Point = { x: effectiveTgtEdge.x, y: effectiveSrcEdge.y };
    const lCorner2: Point = { x: effectiveSrcEdge.x, y: effectiveTgtEdge.y };

    // Check perpendicularity: first segment must go in the source normal direction,
    // second segment must arrive from the target normal direction
    function isPerpendicular(corner: Point): boolean {
      const dx1 = corner.x - effectiveSrcEdge.x, dy1 = corner.y - effectiveSrcEdge.y;
      const srcOk = (srcDir.dx !== 0 && Math.abs(dy1) < 0.5) || (srcDir.dy !== 0 && Math.abs(dx1) < 0.5);
      const srcOutward = dx1 * srcDir.dx >= 0 && dy1 * srcDir.dy >= 0;
      const dx2 = corner.x - effectiveTgtEdge.x, dy2 = corner.y - effectiveTgtEdge.y;
      const tgtOk = (tgtDir.dx !== 0 && Math.abs(dy2) < 0.5) || (tgtDir.dy !== 0 && Math.abs(dx2) < 0.5);
      const tgtOutward = dx2 * tgtDir.dx >= 0 && dy2 * tgtDir.dy >= 0;
      return srcOk && srcOutward && tgtOk && tgtOutward;
    }

    const a1Perp = isPerpendicular(lCorner1);
    const a2Perp = isPerpendicular(lCorner2);

    if (a1Perp && !pathHitsObstacles([effectiveSrcEdge, lCorner1, effectiveTgtEdge], obstacles)) {
      midPath = [lCorner1];
    } else if (a2Perp && !pathHitsObstacles([effectiveSrcEdge, lCorner2, effectiveTgtEdge], obstacles)) {
      midPath = [lCorner2];
    } else {
      // Fall back to stub-based routing (guarantees perpendicularity, may have more corners)
      midPath = buildOrthogonalPath(exitPt, approachPt, obstacles);
    }
  }

  return {
    waypoints: [startPt, effectiveSrcEdge, ...midPath, effectiveTgtEdge, endPt],
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

export function waypointsToRoundedPath(rawWaypoints: Point[], r = 8): string {
  if (rawWaypoints.length < 2) return "";
  if (rawWaypoints.length === 2)
    return `M ${rawWaypoints[0].x} ${rawWaypoints[0].y} L ${rawWaypoints[1].x} ${rawWaypoints[1].y}`;

  // Remove collinear intermediate points (same direction consecutive segments)
  const waypoints = [rawWaypoints[0]];
  for (let i = 1; i < rawWaypoints.length - 1; i++) {
    const prev = waypoints[waypoints.length - 1];
    const curr = rawWaypoints[i];
    const next = rawWaypoints[i + 1];
    const d1x = curr.x - prev.x, d1y = curr.y - prev.y;
    const d2x = next.x - curr.x, d2y = next.y - curr.y;
    // Cross product ~ 0 means collinear
    if (Math.abs(d1x * d2y - d1y * d2x) > 0.5) {
      waypoints.push(curr);
    }
  }
  waypoints.push(rawWaypoints[rawWaypoints.length - 1]);

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

    // Clamp to 45% of each neighbouring segment so adjacent corners don't overlap
    const ar = Math.min(r, len1 * 0.45, len2 * 0.45);

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

    // messageBPMN: always vertical when possible — single shared x for both edges
    if (conn.type === "messageBPMN") {
      const BPMN_EVENT_TYPES = new Set(["start-event", "intermediate-event", "end-event"]);
      const tgtIsEvent = target.type === "start-event" || target.type === "intermediate-event";
      let x: number;
      let repairedSrcOffset = conn.sourceOffsetAlong;
      if (tgtIsEvent) {
        x = target.x + target.width / 2;
      } else {
        const rawOffset = conn.sourceOffsetAlong ?? 0.5;
        const offsetAlong = BPMN_EVENT_TYPES.has(source.type) ? 0.5 : rawOffset;
        const srcX = source.x + source.width * offsetAlong;
        const minX = Math.max(source.x, target.x);
        const maxX = Math.min(source.x + source.width, target.x + target.width);
        if (maxX > minX) {
          // Overlap exists: clamp to make perpendicular and update offset
          x = Math.max(minX, Math.min(maxX, srcX));
          repairedSrcOffset = source.width > 0 ? (x - source.x) / source.width : 0.5;
        } else {
          // No overlap: diagonal (will show red)
          x = srcX;
        }
      }
      // Both edges use the SAME x for perpendicularity
      const srcEdge: Point = conn.sourceSide === "bottom"
        ? { x, y: source.y + source.height } : { x, y: source.y };
      const tgtEdge: Point = conn.targetSide === "top"
        ? { x, y: target.y } : { x, y: target.y + target.height };
      const startPt = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
      const endPt   = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
      return { ...conn, waypoints: [startPt, srcEdge, tgtEdge, endPt],
        sourceInvisibleLeader: true, targetInvisibleLeader: true,
        sourceOffsetAlong: repairedSrcOffset };
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

    // UML connectors: always optimize attachment points to closest positions
    const isUmlConn = conn.type === "uml-association" || conn.type === "uml-aggregation"
      || conn.type === "uml-composition" || conn.type === "uml-generalisation";
    if (isUmlConn) {
      const srcCx = source.x + source.width / 2, srcCy = source.y + source.height / 2;
      const tgtCx = target.x + target.width / 2, tgtCy = target.y + target.height / 2;
      const optSrcSide = getClosestSideOfElement(tgtCx, tgtCy, source);
      const optTgtSide = getClosestSideOfElement(srcCx, srcCy, target);
      const optSrcOffset = getOffsetAlong(source, optSrcSide, { x: tgtCx, y: tgtCy });
      const optTgtOffset = getOffsetAlong(target, optTgtSide, { x: srcCx, y: srcCy });
      const umlResult = computeWaypoints(source, target, elements,
        optSrcSide, optTgtSide, conn.routingType, optSrcOffset, optTgtOffset);
      return { ...conn, waypoints: umlResult.waypoints,
        sourceInvisibleLeader: umlResult.sourceInvisibleLeader,
        targetInvisibleLeader: umlResult.targetInvisibleLeader,
        sourceSide: optSrcSide, targetSide: optTgtSide,
        sourceOffsetAlong: optSrcOffset, targetOffsetAlong: optTgtOffset,
        associationNameOffset: undefined,
        sourceRoleOffset: undefined, sourceMultOffset: undefined,
        sourceConstraintOffset: undefined, sourceUniqueOffset: undefined,
        targetRoleOffset: undefined, targetMultOffset: undefined,
        targetConstraintOffset: undefined, targetUniqueOffset: undefined,
      };
    }

    // For rectilinear connectors with enough waypoints, try to preserve user's interior routing.
    // Only the 6 boundary waypoints (srcCenter, srcEdge, exitPt, approachPt, tgtEdge, tgtCenter)
    // are updated; interior turns (indices 3..N-4) are kept as-is.
    // But if the result hits obstacles, fall through to full recompute.
    if (conn.routingType === "rectilinear") {
      const wp = conn.waypoints;
      const N = wp.length;
      if (N >= 7) {
        const newSrcCenter  = getConnectionPointBySide(source, conn.sourceSide);
        const newTgtCenter  = getConnectionPointBySide(target, conn.targetSide);
        const newSrcEdge    = sidePoint(source, conn.sourceSide, conn.sourceOffsetAlong ?? 0.5);
        const newTgtEdge    = sidePoint(target, conn.targetSide, conn.targetOffsetAlong ?? 0.5);
        const perpOff       = adaptedPerpOffset(newSrcEdge, conn.sourceSide, newTgtEdge, conn.targetSide);
        const newExitPt     = perpendicularExitScaled(newSrcEdge, conn.sourceSide, perpOff);
        const newApproachPt = perpendicularExitScaled(newTgtEdge, conn.targetSide, perpOff);
        const interior = wp.slice(3, N - 3);
        const merged = [
          newSrcCenter, newSrcEdge, newExitPt,
          ...interior,
          newApproachPt, newTgtEdge, newTgtCenter,
        ];
        const rectified = rectifyWaypoints(merged, conn.sourceSide);
        const candidate = consolidateWaypoints(rectified);
        // Validate outward perpendicularity: first visible segment must go outward from source,
        // last visible segment must arrive from outward of target
        const srcNorm = sideNormalDir(conn.sourceSide);
        const tgtNorm = sideNormalDir(conn.targetSide);
        const vs = 1; // after srcCenter (invisible leader)
        const ve = candidate.length - 2; // before tgtCenter
        let outwardOk = true;
        if (candidate.length >= 4) {
          // Check exit direction: srcEdge(vs) → next point(vs+1) must go outward
          const exitDx = candidate[vs + 1].x - candidate[vs].x;
          const exitDy = candidate[vs + 1].y - candidate[vs].y;
          if ((srcNorm.dx !== 0 && exitDx * srcNorm.dx <= 0) || (srcNorm.dy !== 0 && exitDy * srcNorm.dy <= 0)) outwardOk = false;
          // Check approach direction: prev point(ve-1) → tgtEdge(ve) must arrive inward
          const appDx = candidate[ve].x - candidate[ve - 1].x;
          const appDy = candidate[ve].y - candidate[ve - 1].y;
          if ((tgtNorm.dx !== 0 && appDx * (-tgtNorm.dx) <= 0) || (tgtNorm.dy !== 0 && appDy * (-tgtNorm.dy) <= 0)) outwardOk = false;
        }
        // Check if preserved interior routing passes through any obstacle
        const obstacles = elements
          .filter(el => el.id !== source.id && el.id !== target.id
            && el.type !== "pool" && el.type !== "lane"
            && el.boundaryHostId !== source.id && el.boundaryHostId !== target.id)
          .map(getBounds);
        if (outwardOk && !pathHitsObstacles(candidate, obstacles)) {
          return { ...conn, waypoints: candidate };
        }
        // Interior routing hits obstacle or goes inward — fall through to full recompute
      }
    }

    // Full recompute — first try with stored sides
    const result1 = computeWaypoints(
      source, target, elements,
      conn.sourceSide, conn.targetSide, conn.routingType,
      conn.sourceOffsetAlong ?? 0.5, conn.targetOffsetAlong ?? 0.5,
    );

    // Validate outward perpendicularity of the result
    if (conn.routingType === "rectilinear" && result1.waypoints.length >= 4) {
      const wp = result1.waypoints;
      const srcN = sideNormalDir(conn.sourceSide);
      const tgtN = sideNormalDir(conn.targetSide);
      const exitDx = wp[2].x - wp[1].x, exitDy = wp[2].y - wp[1].y;
      // Exit must go in the source normal direction (not backwards)
      const exitOk = (srcN.dx !== 0 ? exitDx * srcN.dx > 0 : true)
                  && (srcN.dy !== 0 ? exitDy * srcN.dy > 0 : true);
      const ve = wp.length - 2;
      const appDx = wp[ve].x - wp[ve - 1].x, appDy = wp[ve].y - wp[ve - 1].y;
      // Approach must come from the target normal direction (arriving inward)
      const appOk = (tgtN.dx !== 0 ? appDx * (-tgtN.dx) > 0 : true)
                 && (tgtN.dy !== 0 ? appDy * (-tgtN.dy) > 0 : true);

      if (!exitOk || !appOk) {
        // Recalculate optimal sides based on current element positions
        const srcCx = source.x + source.width / 2, srcCy = source.y + source.height / 2;
        const tgtCx = target.x + target.width / 2, tgtCy = target.y + target.height / 2;
        const dx = tgtCx - srcCx, dy = tgtCy - srcCy;
        const newSrcSide: Side = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "bottom" : "top");
        const newTgtSide: Side = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "left" : "right") : (dy > 0 ? "top" : "bottom");
        const result2 = computeWaypoints(
          source, target, elements,
          newSrcSide, newTgtSide, conn.routingType, 0.5, 0.5,
        );
        return { ...conn, waypoints: result2.waypoints,
          sourceInvisibleLeader: result2.sourceInvisibleLeader,
          targetInvisibleLeader: result2.targetInvisibleLeader,
          sourceSide: newSrcSide, targetSide: newTgtSide,
          sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5,
          associationNameOffset: undefined,
          sourceRoleOffset: undefined, sourceMultOffset: undefined,
          sourceConstraintOffset: undefined, sourceUniqueOffset: undefined,
          targetRoleOffset: undefined, targetMultOffset: undefined,
          targetConstraintOffset: undefined, targetUniqueOffset: undefined,
        };
      }
    }

    // Final validation: check no visible waypoint is inside an obstacle element
    const finalWp = result1.waypoints;
    const fvs = result1.sourceInvisibleLeader ? 1 : 0;
    const fve = result1.targetInvisibleLeader ? finalWp.length - 2 : finalWp.length - 1;
    const obsElements = elements.filter(el =>
      el.id !== source.id && el.id !== target.id
      && el.type !== "pool" && el.type !== "lane"
      && el.boundaryHostId !== source.id && el.boundaryHostId !== target.id);
    let waypointInsideObs = false;
    for (let i = fvs; i <= fve; i++) {
      const pt = finalWp[i];
      for (const obs of obsElements) {
        if (pt.x > obs.x && pt.x < obs.x + obs.width && pt.y > obs.y && pt.y < obs.y + obs.height) {
          waypointInsideObs = true; break;
        }
      }
      if (waypointInsideObs) break;
    }
    if (waypointInsideObs) {
      // Recalculate with optimal facing sides
      const srcCx = source.x + source.width / 2, srcCy = source.y + source.height / 2;
      const tgtCx = target.x + target.width / 2, tgtCy = target.y + target.height / 2;
      const ddx = tgtCx - srcCx, ddy = tgtCy - srcCy;
      const reSrcSide: Side = Math.abs(ddx) >= Math.abs(ddy) ? (ddx > 0 ? "right" : "left") : (ddy > 0 ? "bottom" : "top");
      const reTgtSide: Side = Math.abs(ddx) >= Math.abs(ddy) ? (ddx > 0 ? "left" : "right") : (ddy > 0 ? "top" : "bottom");
      const result3 = computeWaypoints(source, target, elements, reSrcSide, reTgtSide, conn.routingType, 0.5, 0.5);
      return { ...conn, waypoints: result3.waypoints,
        sourceInvisibleLeader: result3.sourceInvisibleLeader,
        targetInvisibleLeader: result3.targetInvisibleLeader,
        sourceSide: reSrcSide, targetSide: reTgtSide,
        sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5,
        associationNameOffset: undefined,
        sourceRoleOffset: undefined, sourceMultOffset: undefined,
        sourceConstraintOffset: undefined, sourceUniqueOffset: undefined,
        targetRoleOffset: undefined, targetMultOffset: undefined,
        targetConstraintOffset: undefined, targetUniqueOffset: undefined,
      };
    }

    return { ...conn, waypoints: result1.waypoints,
      sourceInvisibleLeader: result1.sourceInvisibleLeader,
      targetInvisibleLeader: result1.targetInvisibleLeader };
  });
}
