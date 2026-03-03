import type { Bounds, Connector, ConnectorType, DiagramElement, Point } from "./types";

function getBounds(el: DiagramElement): Bounds {
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}

function center(b: Bounds): Point {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
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
  // Prefer a two-segment L-shaped path; try horizontal-then-vertical first
  const mid1: Point = { x: end.x, y: start.y };
  const mid2: Point = { x: start.x, y: end.y };

  const pathA = [start, mid1, end];
  const pathB = [start, mid2, end];

  const hitsMid = (mid: Point) =>
    obstacles.some((obs) => boundsOverlapWithMargin(obs, 8)(mid));

  if (!hitsMid(mid1)) return pathA;
  if (!hitsMid(mid2)) return pathB;

  // Fallback: route via the average midpoint at a safe Y offset
  const bypassY = start.y - 40;
  return [
    start,
    { x: start.x, y: bypassY },
    { x: end.x, y: bypassY },
    end,
  ];
}

export function computeWaypoints(
  source: DiagramElement,
  target: DiagramElement,
  allElements: DiagramElement[],
  connectorType: ConnectorType
): Point[] {
  const sc = center(getBounds(source));
  const tc = center(getBounds(target));

  if (connectorType === "message") {
    // Messages go straight through — no obstacle avoidance
    const startPt = closestEdgePoint(tc, getBounds(source));
    const endPt = closestEdgePoint(sc, getBounds(target));
    return [startPt, endPt];
  }

  // Sequence connectors: orthogonal with obstacle avoidance
  const startPt = closestEdgePoint(tc, getBounds(source));
  const endPt = closestEdgePoint(sc, getBounds(target));

  const obstacles = allElements
    .filter((el) => el.id !== source.id && el.id !== target.id)
    .map(getBounds);

  return buildOrthogonalPath(startPt, endPt, obstacles);
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
    const waypoints = computeWaypoints(source, target, elements, conn.type);
    return { ...conn, waypoints };
  });
}
