import type { Bounds, Connector, DiagramElement, Point, RoutingType, Side } from "./types";

function getBounds(el: DiagramElement): Bounds {
  return { x: el.x, y: el.y, width: el.width, height: el.height };
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

export function getConnectionPointBySide(el: DiagramElement, side: Side): Point {
  // actor/team always use center as connection anchor
  if (el.type === "actor" || el.type === "team") {
    return { x: el.x + el.width / 2, y: el.y + el.height / 2 };
  }
  switch (side) {
    case "top":    return { x: el.x + el.width / 2, y: el.y };
    case "right":  return { x: el.x + el.width, y: el.y + el.height / 2 };
    case "bottom": return { x: el.x + el.width / 2, y: el.y + el.height };
    case "left":   return { x: el.x, y: el.y + el.height / 2 };
  }
}

function isActorOrTeam(el: DiagramElement): boolean {
  return el.type === "actor" || el.type === "team";
}

export function computeWaypoints(
  source: DiagramElement,
  target: DiagramElement,
  allElements: DiagramElement[],
  sourceSide: Side,
  targetSide: Side,
  routingType: RoutingType
): { waypoints: Point[]; sourceInvisibleLeader: boolean; targetInvisibleLeader: boolean } {
  const sourceIsAT = isActorOrTeam(source);
  const targetIsAT = isActorOrTeam(target);

  const startPt = getConnectionPointBySide(source, sourceSide);
  const endPt = getConnectionPointBySide(target, targetSide);

  if (routingType === "direct") {
    if (!sourceIsAT && !targetIsAT) {
      return { waypoints: [startPt, endPt], sourceInvisibleLeader: false, targetInvisibleLeader: false };
    }

    const waypoints: Point[] = [];
    let sourceInvisibleLeader = false;
    let targetInvisibleLeader = false;

    if (sourceIsAT) {
      const edgePt = closestEdgePoint(endPt, getBounds(source));
      waypoints.push(startPt, edgePt);
      sourceInvisibleLeader = true;
    } else {
      waypoints.push(startPt);
    }

    if (targetIsAT) {
      const edgePt = closestEdgePoint(startPt, getBounds(target));
      waypoints.push(edgePt, endPt);
      targetInvisibleLeader = true;
    } else {
      waypoints.push(endPt);
    }

    return { waypoints, sourceInvisibleLeader, targetInvisibleLeader };
  }

  // Rectilinear with perpendicular first/last segments
  const obstacles = allElements
    .filter((el) => el.id !== source.id && el.id !== target.id)
    .map(getBounds);

  let sourceInvisibleLeader = false;
  let targetInvisibleLeader = false;
  const prefix: Point[] = [];
  const suffix: Point[] = [];

  if (sourceIsAT) {
    const edgePt = closestEdgePoint(endPt, getBounds(source));
    const exitPt = perpendicularExit(edgePt, sourceSide);
    prefix.push(startPt, edgePt, exitPt);
    sourceInvisibleLeader = true;
  } else {
    const exitPt = perpendicularExit(startPt, sourceSide);
    prefix.push(startPt, exitPt);
  }

  if (targetIsAT) {
    const edgePt = closestEdgePoint(startPt, getBounds(target));
    const approachPt = perpendicularApproach(edgePt, targetSide);
    suffix.push(approachPt, edgePt, endPt);
    targetInvisibleLeader = true;
  } else {
    const approachPt = perpendicularApproach(endPt, targetSide);
    suffix.push(approachPt, endPt);
  }

  const exitPt = prefix[prefix.length - 1];
  const approachPt = suffix[0];
  const midPath = buildOrthogonalPath(exitPt, approachPt, obstacles);
  // merge: prefix (without last) + midPath + suffix (without first)
  const waypoints = [...prefix.slice(0, -1), ...midPath, ...suffix.slice(1)];

  return { waypoints, sourceInvisibleLeader, targetInvisibleLeader };
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

export function recomputeAllConnectors(
  connectors: Connector[],
  elements: DiagramElement[]
): Connector[] {
  const elementMap = new Map(elements.map((el) => [el.id, el]));
  return connectors.map((conn) => {
    const source = elementMap.get(conn.sourceId);
    const target = elementMap.get(conn.targetId);
    if (!source || !target) return conn;
    const { waypoints, sourceInvisibleLeader, targetInvisibleLeader } = computeWaypoints(
      source,
      target,
      elements,
      conn.sourceSide,
      conn.targetSide,
      conn.routingType
    );
    return { ...conn, waypoints, sourceInvisibleLeader, targetInvisibleLeader };
  });
}
