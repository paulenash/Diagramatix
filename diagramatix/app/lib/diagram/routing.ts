import type { Bounds, Connector, DiagramData, DiagramElement, Point, RoutingType, Side } from "./types";
import { isUmlConnType } from "./types";

/* ── UML (Domain-diagram) connector routing mode ─────────────────────────
 * Live-toggleable from the editor (bottom-centre switch on Domain diagrams).
 * OFF (default) = the original "always re-pick the closest faces" behaviour —
 * BPMN and all non-UML connectors are NEVER affected by this flag. ON = the
 * experimental "sticky endpoints" mode: UML endpoints stay fixed on their face
 * until a large move makes a different face closest. Only the `isUmlConn`
 * branch of `recomputeAllConnectors` reads this. */
let _umlStickyRouting = true;
export function setUmlStickyRouting(on: boolean): void { _umlStickyRouting = on; }
export function getUmlStickyRouting(): boolean { return _umlStickyRouting; }

/**
 * D4.04 / D4.05 (Domain connector routing) — spread the attachment points of
 * UML connectors that share an element side. N connectors on the same side
 * divide it into N+1 equal sections (offsets 1/(N+1) … N/(N+1)) instead of all
 * stacking at 0.5, leaving room for multiplicity/role labels. Within each side
 * the connectors are ordered by the position of their opposite endpoint, which
 * also removes their mutual crossings (the shared-side case of D4.05). A side
 * with a single connector re-centres at 0.5.
 *
 * Operates on connectors whose `sourceSide`/`targetSide` are already settled;
 * only UML connector types are touched. Returns new Connector objects with
 * `sourceOffsetAlong`/`targetOffsetAlong` set — the caller recomputes waypoints
 * afterwards (the sticky router preserves these offsets while the side holds).
 */
export function spreadUmlEndpoints(connectors: Connector[], elements: DiagramElement[]): Connector[] {
  const elMap = new Map(elements.map((e) => [e.id, e]));
  const centreX = (el: DiagramElement) => el.x + el.width / 2;
  const centreY = (el: DiagramElement) => el.y + el.height / 2;
  type Ref = { i: number; end: "src" | "tgt" };
  const groups = new Map<string, Ref[]>();
  connectors.forEach((c, i) => {
    if (!isUmlConnType(c.type)) return;
    if (!elMap.has(c.sourceId) || !elMap.has(c.targetId)) return;
    const push = (key: string, ref: Ref) => { const l = groups.get(key); if (l) l.push(ref); else groups.set(key, [ref]); };
    push(`${c.sourceId}|${c.sourceSide}`, { i, end: "src" });
    push(`${c.targetId}|${c.targetSide}`, { i, end: "tgt" });
  });
  const srcOff = new Map<number, number>();
  const tgtOff = new Map<number, number>();
  for (const [key, list] of groups) {
    const side = key.split("|")[1];
    if (list.length === 1) {
      const ref = list[0];
      (ref.end === "src" ? srcOff : tgtOff).set(ref.i, 0.5);
      continue;
    }
    const horiz = side === "top" || side === "bottom";
    // Order along the side by the OPPOSITE endpoint's centre → siblings don't cross.
    list.sort((a, b) => {
      const ea = elMap.get(a.end === "src" ? connectors[a.i].targetId : connectors[a.i].sourceId)!;
      const eb = elMap.get(b.end === "src" ? connectors[b.i].targetId : connectors[b.i].sourceId)!;
      return horiz ? centreX(ea) - centreX(eb) : centreY(ea) - centreY(eb);
    });
    list.forEach((ref, idx) => {
      const off = (idx + 1) / (list.length + 1);
      (ref.end === "src" ? srcOff : tgtOff).set(ref.i, off);
    });
  }
  return connectors.map((c, i) => {
    const so = srcOff.get(i), to = tgtOff.get(i);
    if (so === undefined && to === undefined) return c;
    return {
      ...c,
      ...(so !== undefined ? { sourceOffsetAlong: so } : {}),
      ...(to !== undefined ? { targetOffsetAlong: to } : {}),
    };
  });
}

/**
 * D4.05 (Domain) — pull apart connector MID-CHANNEL segments that lie on top of
 * one another. Spreading the endpoints (D4.04) stops them sharing an attachment
 * point, but two connectors between the same pair can still route their long
 * horizontal/vertical trunk through the SAME channel (same y / same x) and
 * overlap. This staggers each conflicting group of parallel, overlapping trunks
 * onto distinct lines spaced `GAP` apart. Only UML connectors are touched;
 * operates on the routed waypoints and returns new Connector objects.
 */
export function deconflictUmlSegments(connectors: Connector[]): Connector[] {
  const GAP = 12;
  const MIN_TRUNK = 24; // ignore short segments (leaders / jogs)

  // Work on a COPY of the raw waypoints — NEVER consolidate: the edge-attachment
  // points are collinear with the invisible leaders, so consolidating would drop
  // them and detach the connector from the element.
  const wps = connectors.map(c => (isUmlConnType(c.type) && Array.isArray(c.waypoints) ? c.waypoints.map(p => ({ ...p })) : null));

  type Trunk = { ci: number; a: number; b: number; coord: number; lo: number; hi: number };
  const findTrunks = (orient: "h" | "v"): Trunk[] => {
    const out: Trunk[] = [];
    wps.forEach((w, ci) => {
      if (!w || w.length < 4) return;
      // Only shift segments STRICTLY between the source-edge and target-edge
      // points (the leaders are the first/last segment), and whose neighbours are
      // perpendicular — so we never move an endpoint or bend a collinear run.
      const c = connectors[ci];
      const srcEdge = c.sourceInvisibleLeader ? 1 : 0;
      const tgtEdge = c.targetInvisibleLeader ? w.length - 2 : w.length - 1;
      let best: Trunk | null = null;
      for (let i = srcEdge + 1; i + 1 < tgtEdge; i++) {
        const p = w[i], q = w[i + 1];
        const isH = Math.abs(p.y - q.y) < 0.5, isV = Math.abs(p.x - q.x) < 0.5;
        if (orient === "h" && isH && !isV) {
          const len = Math.abs(q.x - p.x);
          const beforeV = Math.abs(w[i - 1].x - p.x) < 0.5;   // neighbour before is vertical
          const afterV = Math.abs(w[i + 2].x - q.x) < 0.5;    // neighbour after is vertical
          if (len >= MIN_TRUNK && beforeV && afterV && (!best || len > best.hi - best.lo)) best = { ci, a: i, b: i + 1, coord: p.y, lo: Math.min(p.x, q.x), hi: Math.max(p.x, q.x) };
        } else if (orient === "v" && isV && !isH) {
          const len = Math.abs(q.y - p.y);
          const beforeH = Math.abs(w[i - 1].y - p.y) < 0.5;   // neighbour before is horizontal
          const afterH = Math.abs(w[i + 2].y - q.y) < 0.5;    // neighbour after is horizontal
          if (len >= MIN_TRUNK && beforeH && afterH && (!best || len > best.hi - best.lo)) best = { ci, a: i, b: i + 1, coord: p.x, lo: Math.min(p.y, q.y), hi: Math.max(p.y, q.y) };
        }
      }
      if (best) out.push(best);
    });
    return out;
  };
  const resolve = (orient: "h" | "v") => {
    const ts = findTrunks(orient);
    const used = new Array(ts.length).fill(false);
    for (let i = 0; i < ts.length; i++) {
      if (used[i]) continue;
      const group = [ts[i]]; used[i] = true;
      for (let j = i + 1; j < ts.length; j++) {
        if (used[j]) continue;
        const conflict = group.some(g => Math.abs(g.coord - ts[j].coord) < GAP && ts[j].lo < g.hi - 2 && ts[j].hi > g.lo + 2);
        if (conflict) { group.push(ts[j]); used[j] = true; }
      }
      if (group.length < 2) continue;
      group.sort((a, b) => a.coord - b.coord);
      const mean = group.reduce((s, g) => s + g.coord, 0) / group.length;
      const start = mean - (GAP * (group.length - 1)) / 2;
      group.forEach((g, k) => {
        const newCoord = Math.round(start + k * GAP);
        const w = wps[g.ci]!;
        if (orient === "h") { w[g.a].y = newCoord; w[g.b].y = newCoord; }
        else { w[g.a].x = newCoord; w[g.b].x = newCoord; }
      });
    }
  };
  resolve("h");
  resolve("v");
  return connectors.map((c, ci) => (wps[ci] ? { ...c, waypoints: wps[ci]! } : c));
}

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

// A uml-package's visible silhouette is a folder tab (top-left, sized to the
// name) plus a full-width body below it — an L shape, not the plain bounding
// rectangle. The bbox top edge to the RIGHT of the tab is empty, so a connector
// attaching there floats above the body. Snap those hits down to the body's top
// edge so connectors always meet the visible outline including the name
// rectangle (issue #7). Tab dimensions mirror UmlPackageShape in SymbolRenderer.
function closestPackageEdgePoint(from: Point, el: DiagramElement): Point {
  const p = closestEdgePoint(from, getBounds(el));
  const tabH = Math.min(24, el.height * 0.22);
  const tabW = Math.min(Math.max(60, (el.label?.length ?? 4) * 7 + 16), el.width * 0.6);
  if (Math.abs(p.y - el.y) < 0.5 && p.x > el.x + tabW) {
    return { x: p.x, y: el.y + tabH };
  }
  return p;
}

/** Edge attachment point honouring per-type silhouettes (package L-shape, etc.). */
function edgePointFor(from: Point, el: DiagramElement): Point {
  return el.type === "uml-package" ? closestPackageEdgePoint(from, el) : closestEdgePoint(from, getBounds(el));
}

/** Given a point that lies on an element's rectangular boundary, return
 *  which side it's on. Picks whichever edge the point is closest to so it
 *  tolerates sub-pixel offsets from `closestEdgePoint`. */
function sideFromPoint(el: DiagramElement, pt: Point): Side {
  const dLeft   = Math.abs(pt.x - el.x);
  const dRight  = Math.abs(pt.x - (el.x + el.width));
  const dTop    = Math.abs(pt.y - el.y);
  const dBottom = Math.abs(pt.y - (el.y + el.height));
  const min = Math.min(dLeft, dRight, dTop, dBottom);
  if (min === dLeft)  return "left";
  if (min === dRight) return "right";
  if (min === dTop)   return "top";
  return "bottom";
}

/** Fractional offset (0..1) of a boundary point along a given side. */
function offsetAlongFromPoint(el: DiagramElement, side: Side, pt: Point): number {
  const raw = (side === "top" || side === "bottom")
    ? (pt.x - el.x) / el.width
    : (pt.y - el.y) / el.height;
  return Math.max(0, Math.min(1, raw));
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

/**
 * Returns the side of the host EP that a boundary event is mounted on (= its
 * outer face), or null when the element isn't a boundary event or its host
 * can't be located.
 */
export function getBoundaryEventOuterSide(
  el: DiagramElement,
  allElements: DiagramElement[],
): Side | null {
  if (!el.boundaryHostId) return null;
  const host = allElements.find((h) => h.id === el.boundaryHostId);
  if (!host) return null;
  const ecx = el.x + el.width / 2;
  const ecy = el.y + el.height / 2;
  const distTop    = Math.abs(ecy - host.y);
  const distBottom = Math.abs(ecy - (host.y + host.height));
  const distLeft   = Math.abs(ecx - host.x);
  const distRight  = Math.abs(ecx - (host.x + host.width));
  const min = Math.min(distTop, distBottom, distLeft, distRight);
  if (min === distTop)    return "top";
  if (min === distBottom) return "bottom";
  if (min === distLeft)   return "left";
  return "right";
}

/** Opposite side helper — used to flip outer→inner for boundary events. */
export function oppositeSide(s: Side): Side {
  if (s === "top")    return "bottom";
  if (s === "bottom") return "top";
  if (s === "left")   return "right";
  return "left";
}

/**
 * Pick the correct attachment side on a boundary (edge-mounted) event for a
 * connector whose other endpoint is `other`. Returns the OUTER face when
 * `other` lies outside the host EP; the INNER (opposite) face when it lies
 * inside. Never returns one of the two perpendicular sides that sit ON the
 * EP boundary itself. Returns null when the element isn't a boundary event.
 */
export function pickBoundaryEventSide(
  evt: DiagramElement,
  other: DiagramElement,
  allElements: DiagramElement[],
): Side | null {
  const outer = getBoundaryEventOuterSide(evt, allElements);
  if (!outer) return null;
  const host = allElements.find((h) => h.id === evt.boundaryHostId);
  if (!host) return outer;
  const ocx = other.x + other.width / 2;
  const ocy = other.y + other.height / 2;
  const otherInsideHost =
    ocx > host.x && ocx < host.x + host.width &&
    ocy > host.y && ocy < host.y + host.height;
  return otherInsideHost ? oppositeSide(outer) : outer;
}

/**
 * Pick a symmetric pair of sides for a NEW or rerouted sequence connector
 * such that the source's exit faces the target's centre and vice versa.
 * The asymmetric `getClosestSideOfElement` picks each side from the OTHER
 * endpoint's centre but doesn't guarantee the path won't double back through
 * the source/target body — this helper does, by choosing both sides off the
 * same delta vector. Falls through to `pickBoundaryEventSide` for boundary
 * events on either end.
 */
export function safeSidePair(
  source: DiagramElement,
  target: DiagramElement,
  allElements: DiagramElement[],
): { src: Side; tgt: Side } {
  const sCx = source.x + source.width / 2;
  const sCy = source.y + source.height / 2;
  const tCx = target.x + target.width / 2;
  const tCy = target.y + target.height / 2;
  const dx = tCx - sCx;
  const dy = tCy - sCy;
  const horizontalDominant = Math.abs(dx) >= Math.abs(dy);
  let src: Side;
  let tgt: Side;
  if (horizontalDominant) {
    src = dx > 0 ? "right" : "left";
    tgt = dx > 0 ? "left"  : "right";
  } else {
    src = dy > 0 ? "bottom" : "top";
    tgt = dy > 0 ? "top"    : "bottom";
  }
  // Boundary events override — outer/inner face per host containment.
  const srcOverride = pickBoundaryEventSide(source, target, allElements);
  if (srcOverride) src = srcOverride;
  const tgtOverride = pickBoundaryEventSide(target, source, allElements);
  if (tgtOverride) tgt = tgtOverride;
  return { src, tgt };
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

// Check if any segment of a path hits any obstacle. `margin` widens the
// obstacle's hit rect — pass a generous value (e.g. ½ Task height) when
// you want the path to maintain visible clearance, not just avoid
// crossing the rect interior.
function pathHitsObstacles(path: Point[], obstacles: Bounds[], margin = 4): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    for (const obs of obstacles) {
      if (segmentHitsObstacle(path[i], path[i + 1], obs, margin)) return true;
    }
  }
  return false;
}

// Generous clearance used for "would this L-shape look cramped?" checks
// in both buildOrthogonalPath and computeWaypoints. When an obstacle is
// within this distance of an L-segment we reject the L and force a
// proper detour. Matches the BIG_MARGIN used inside buildOrthogonalPath.
const L_SHAPE_CLEARANCE = 33; // ½ × default Task height (65 px)

function buildOrthogonalPath(
  start: Point,
  end: Point,
  obstacles: Bounds[],
  // Containment: when both endpoints sit inside an EP (or any other
  // bounded region we want to keep the route inside), pass that rect
  // here. The around-obstacle candidates are clamped so the path stays
  // within the box. Without this, an internal obstacle between two
  // EP children would push the route OUTSIDE the EP boundary.
  containment?: Bounds,
  // Pool bounds — used as a "near boundary" trigger to fall back to
  // the small margin so the detour doesn't crowd the pool wall.
  // Pools are NOT in `obstacles` (connectors route through them).
  poolBounds: Bounds[] = [],
): Point[] {
  const mid1: Point = { x: end.x, y: start.y };
  const mid2: Point = { x: start.x, y: end.y };

  const pathA = [start, mid1, end];
  const pathB = [start, mid2, end];

  // Use generous clearance for the simple L-shape: if the L grazes any
  // obstacle within L_SHAPE_CLEARANCE we'd rather detour properly than
  // sit ~4 px from a shape's edge.
  if (!pathHitsObstacles(pathA, obstacles, L_SHAPE_CLEARANCE)) return pathA;
  if (!pathHitsObstacles(pathB, obstacles, L_SHAPE_CLEARANCE)) return pathB;

  // Both L-shaped paths blocked — route around the obstacles.
  // Margin defaults to ½ default-Task-height (= 33 px) for a visually
  // generous detour. Falls back to 10 px when the wide detour would
  // either (a) squeeze a second obstacle between the blocker and the
  // detour line, or (b) push the detour past a pool wall on the side
  // the detour is heading toward.
  // Each detour direction only considers obstacles whose perpendicular
  // projection overlaps the start↔end span on the OTHER axis — so a
  // far-away obstacle off to the side doesn't push the detour wider
  // than needed.
  const SMALL_MARGIN = 10;
  const BIG_MARGIN = 33; // ½ × default Task height (65 px)
  const POOL_INSET = 4;  // detour line must stay at least this far inside the pool wall
  const xMin = Math.min(start.x, end.x);
  const xMax = Math.max(start.x, end.x);
  const yMin = Math.min(start.y, end.y);
  const yMax = Math.max(start.y, end.y);
  const obsX = obstacles.filter(o => o.x < xMax && o.x + o.width > xMin);
  const obsY = obstacles.filter(o => o.y < yMax && o.y + o.height > yMin);
  const poolsX = poolBounds.filter(p => p.x < xMax && p.x + p.width > xMin);
  const poolsY = poolBounds.filter(p => p.y < yMax && p.y + p.height > yMin);

  // Directional crowding test. `dir` says which way the detour is
  // heading (the side of the blocker the line is being placed on).
  // For each obstacle on that side: trigger if its near edge sits
  // between `line` and `line + dir*BIG_MARGIN` — i.e., the detour
  // would visibly squeeze it. For each pool: trigger only if the
  // wall on the detour's heading direction is at/past `line`
  // (the line would clip or breach the pool boundary).
  function isCrowded(
    line: number,
    axis: "y" | "x",
    dir: 1 | -1,
    blockerEdge: number,
    relevantObs: Bounds[],
    relevantPools: Bounds[],
  ): boolean {
    for (const o of relevantObs) {
      const lo = axis === "y" ? o.y : o.x;
      const hi = lo + (axis === "y" ? o.height : o.width);
      // Near edge = the side facing the blocker.
      const nearEdge = dir > 0 ? lo : hi;
      // Only obstacles strictly past the blocker on the detour side
      // can squeeze (the blocker itself sits at blockerEdge).
      if (dir > 0 ? nearEdge <= blockerEdge + 0.5 : nearEdge >= blockerEdge - 0.5) continue;
      // Squeeze test: near edge is between the detour line and one
      // BIG_MARGIN further out.
      if (dir > 0) {
        if (nearEdge > line && nearEdge <= line + BIG_MARGIN) return true;
      } else {
        if (nearEdge < line && nearEdge >= line - BIG_MARGIN) return true;
      }
    }
    for (const p of relevantPools) {
      const lo = axis === "y" ? p.y : p.x;
      const hi = lo + (axis === "y" ? p.height : p.width);
      // Wall on the detour's heading direction.
      const wall = dir > 0 ? hi : lo;
      // Trigger if the BIG detour line would be at-or-past the wall
      // (allowing a small visual inset before counting as clipped).
      if (dir > 0 ? line > wall - POOL_INSET : line < wall + POOL_INSET) return true;
    }
    return false;
  }

  // Per-call diagnostic. Enable via `window.__DIAGRAMATIX_TRACE_MARGIN = true`
  // in the browser dev tools, then drag/delete and read the console.
  const trace = typeof window !== "undefined"
    && !!(window as unknown as { __DIAGRAMATIX_TRACE_MARGIN?: boolean }).__DIAGRAMATIX_TRACE_MARGIN;

  // SOUTH detour — line below all x-overlapping obstacles.
  let bottomY = yMax;
  if (obsX.length > 0) {
    const blockerBottom = Math.max(...obsX.map(o => o.y + o.height));
    const base = Math.max(bottomY, blockerBottom);
    const tent = base + BIG_MARGIN;
    const crowded = isCrowded(tent, "y", 1, blockerBottom, obsX, poolsX);
    const margin = crowded ? SMALL_MARGIN : BIG_MARGIN;
    bottomY = base + margin;
    if (trace) console.log(`[MARGIN south] base=${base} tent=${tent} pools=${JSON.stringify(poolsX)} obs=${JSON.stringify(obsX)} crowded=${crowded} margin=${margin}`);
  }
  // NORTH detour — line above all x-overlapping obstacles.
  let topY = yMin;
  if (obsX.length > 0) {
    const blockerTop = Math.min(...obsX.map(o => o.y));
    const base = Math.min(topY, blockerTop);
    const tent = base - BIG_MARGIN;
    const crowded = isCrowded(tent, "y", -1, blockerTop, obsX, poolsX);
    const margin = crowded ? SMALL_MARGIN : BIG_MARGIN;
    topY = base - margin;
    if (trace) console.log(`[MARGIN north] base=${base} tent=${tent} crowded=${crowded} margin=${margin}`);
  }
  // EAST detour — line right of all y-overlapping obstacles.
  let rightX = xMax;
  if (obsY.length > 0) {
    const blockerRight = Math.max(...obsY.map(o => o.x + o.width));
    const base = Math.max(rightX, blockerRight);
    const tent = base + BIG_MARGIN;
    const crowded = isCrowded(tent, "x", 1, blockerRight, obsY, poolsY);
    const margin = crowded ? SMALL_MARGIN : BIG_MARGIN;
    rightX = base + margin;
    if (trace) console.log(`[MARGIN east] base=${base} tent=${tent} crowded=${crowded} margin=${margin}`);
  }
  // WEST detour — line left of all y-overlapping obstacles.
  let leftX = xMin;
  if (obsY.length > 0) {
    const blockerLeft = Math.min(...obsY.map(o => o.x));
    const base = Math.min(leftX, blockerLeft);
    const tent = base - BIG_MARGIN;
    const crowded = isCrowded(tent, "x", -1, blockerLeft, obsY, poolsY);
    const margin = crowded ? SMALL_MARGIN : BIG_MARGIN;
    leftX = base - margin;
    if (trace) console.log(`[MARGIN west] base=${base} tent=${tent} crowded=${crowded} margin=${margin}`);
  }

  // Clamp to containment box: keep the routing safely inside the
  // enclosing EP (with a small inset so the route doesn't sit on the
  // EP edge).
  if (containment) {
    const INSET = 4;
    const cTop    = containment.y + INSET;
    const cBottom = containment.y + containment.height - INSET;
    const cLeft   = containment.x + INSET;
    const cRight  = containment.x + containment.width - INSET;
    bottomY = Math.min(bottomY, cBottom);
    topY    = Math.max(topY, cTop);
    rightX  = Math.min(rightX, cRight);
    leftX   = Math.max(leftX, cLeft);
  }

  // Index meaning is needed for both the directional ("forward") test
  // and the per-candidate trace output below.
  const SOUTH = 0, NORTH = 1, EAST = 2, WEST = 3;
  const candidates: { path: Point[]; len: number; idx: number }[] = [
    { path: [start, { x: start.x, y: bottomY }, { x: end.x, y: bottomY }, end], len: 0, idx: SOUTH },
    { path: [start, { x: start.x, y: topY }, { x: end.x, y: topY }, end], len: 0, idx: NORTH },
    { path: [start, { x: rightX, y: start.y }, { x: rightX, y: end.y }, end], len: 0, idx: EAST },
    { path: [start, { x: leftX, y: start.y }, { x: leftX, y: end.y }, end], len: 0, idx: WEST },
  ];
  // Compute total segment length for each candidate
  for (const c of candidates) {
    let len = 0;
    for (let i = 0; i < c.path.length - 1; i++) {
      len += Math.abs(c.path[i + 1].x - c.path[i].x) + Math.abs(c.path[i + 1].y - c.path[i].y);
    }
    c.len = len;
  }
  // Directional split: a candidate is "forward" if its detour line sits
  // on the destination side of the start. WEST when destination is east,
  // NORTH when destination is south, etc. are "backward" — they make
  // the route jog away from the target before circling back, producing
  // visible kinks even when the lengths look comparable. Try every
  // forward candidate (sorted by length) before any backward one, so the
  // kinky detour only wins when no forward detour can clear the obstacles.
  const goingEast = end.x >= start.x;
  const goingSouth = end.y >= start.y;
  function isForward(idx: number): boolean {
    if (idx === SOUTH) return goingSouth;
    if (idx === NORTH) return !goingSouth;
    if (idx === EAST)  return goingEast;
    if (idx === WEST)  return !goingEast;
    return true;
  }
  const forward  = candidates.filter(c => isForward(c.idx)).sort((a, b) => a.len - b.len);
  const backward = candidates.filter(c => !isForward(c.idx)).sort((a, b) => a.len - b.len);
  const ordered = [...forward, ...backward];

  if (trace) {
    const label = (i: number) => i === SOUTH ? "S" : i === NORTH ? "N" : i === EAST ? "E" : "W";
    console.log(`[MARGIN candidates] forward=${forward.map(c => `${label(c.idx)}(${c.len.toFixed(0)})`).join(",")} backward=${backward.map(c => `${label(c.idx)}(${c.len.toFixed(0)})`).join(",")} goingE=${goingEast} goingS=${goingSouth}`);
  }

  for (const c of ordered) {
    const hit = pathHitsObstacles(c.path, obstacles);
    if (trace) console.log(`[MARGIN try ${c.idx === SOUTH ? "S" : c.idx === NORTH ? "N" : c.idx === EAST ? "E" : "W"}] len=${c.len.toFixed(0)} hit=${hit} path=${JSON.stringify(c.path)}`);
    if (!hit) return c.path;
  }

  // Last resort: route far enough outside all obstacles. When containment
  // is set, prefer the shortest containment-clamped candidate over going
  // outside the EP — accept that it may clip an internal obstacle rather
  // than break out of the EP boundary.
  if (!containment) {
    const farY = topY - SMALL_MARGIN;
    const farPath = [start, { x: start.x, y: farY }, { x: end.x, y: farY }, end];
    if (!pathHitsObstacles(farPath, obstacles)) return farPath;
  }

  return ordered[0].path;
}

/**
 * Post-layout obstacle avoidance for a generated diagram (used by the OCEL
 * Domain Diagram). Any connector whose VISIBLE path crosses a non-endpoint
 * element box — exactly what the editor flags red (Canvas `segCrossesRect`) —
 * is re-routed around the offending boxes via `buildOrthogonalPath`, keeping
 * its invisible centre leaders so the arrowhead still lands on the element
 * edge. A connector that is already clear is left untouched. Mutates
 * `data.connectors` in place. Pure w.r.t. the DOM (no window use on this path).
 */
export function avoidObstaclesPostLayout(data: DiagramData): void {
  const elMap = new Map(data.elements.map((e) => [e.id, e] as const));
  // Boxes an association must not cross: real shapes, not backgrounds/notes.
  // Pain points / issues are decorative overlays and are never obstacles.
  const boxes = data.elements.filter(
    (e) => e.type !== "pool" && e.type !== "lane" && e.type !== "text-annotation" && e.type !== "group"
      && e.type !== "uml-pain-point" && e.type !== "uml-issue",
  );
  for (const c of data.connectors) {
    const wps = c.waypoints;
    if (!Array.isArray(wps) || wps.length < 2) continue;
    if (!elMap.has(c.sourceId) || !elMap.has(c.targetId)) continue;
    const obstacles: Bounds[] = boxes
      .filter((e) => e.id !== c.sourceId && e.id !== c.targetId)
      .map(getBounds);
    if (obstacles.length === 0) continue;

    // Visible slice = drop the invisible centre leaders at each end; those are
    // what Canvas trims before its red-crossing test, so match it exactly.
    const s = c.sourceInvisibleLeader ? 1 : 0;
    const e = c.targetInvisibleLeader ? wps.length - 2 : wps.length - 1;
    if (e <= s) continue;
    const visible = wps.slice(s, e + 1);
    // Only reroute what would actually turn red (zero-margin crossing).
    if (!pathHitsObstacles(visible, obstacles, 0)) continue;

    const detour = buildOrthogonalPath(visible[0], visible[visible.length - 1], obstacles);
    c.waypoints = [
      ...(c.sourceInvisibleLeader ? [wps[0]] : []),
      ...detour,
      ...(c.targetInvisibleLeader ? [wps[wps.length - 1]] : []),
    ];
  }
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

/**
 * Constrain a curvilinear control point so the tangent at the edge point
 * stays within an angle tolerance of the perpendicular to the side.
 *
 * For gateways, the perpendicular is to the actual diamond edge (which may
 * be a diagonal), not to the bounding-box side.
 *
 * @param edgePt       The attachment point on the element boundary
 * @param cp           The proposed control point
 * @param side         Which side the connector exits from
 * @param maxTanRatio  tan(maxAngle) — 0 = strictly perpendicular, 0.325 ≈ 18°
 * @param isGateway    If true, use diamond-edge perpendicular
 * @param offsetAlong  The offset along the side (needed for gateway normal calc)
 */
export function constrainControlPoint(
  edgePt: Point, cp: Point, side: Side, maxTanRatio: number,
  isGateway = false, offsetAlong = 0.5
): Point {
  const dx = cp.x - edgePt.x;
  const dy = cp.y - edgePt.y;
  if (dx === 0 && dy === 0) return cp;

  if (isGateway) {
    // Project cp onto the diamond-edge normal direction, with tolerance
    const n = gatewayEdgeNormal(side, offsetAlong);
    // Distance along the normal
    const projLen = dx * n.nx + dy * n.ny;
    if (Math.abs(projLen) < 1) {
      // Nearly zero projection — force along normal
      return { x: edgePt.x + n.nx * 60, y: edgePt.y + n.ny * 60 };
    }
    // Tangential deviation from the normal direction
    const tangDev = dx * (-n.ny) + dy * n.nx; // dot with tangent
    const maxDev = Math.abs(projLen) * maxTanRatio;
    const clampedDev = Math.max(-maxDev, Math.min(maxDev, tangDev));
    // Reconstruct from normal + clamped tangent
    const tx = -n.ny, ty = n.nx; // tangent direction
    return {
      x: edgePt.x + n.nx * projLen + tx * clampedDev,
      y: edgePt.y + n.ny * projLen + ty * clampedDev,
    };
  }

  switch (side) {
    case "top":    // perpendicular is -Y; constrain |dx/dy|
    case "bottom": { // perpendicular is +Y
      const absdy = Math.abs(dy);
      if (absdy < 1) return { x: edgePt.x, y: cp.y }; // nearly zero dy → clamp to vertical
      const maxDx = absdy * maxTanRatio;
      return { x: edgePt.x + Math.max(-maxDx, Math.min(maxDx, dx)), y: cp.y };
    }
    case "left":   // perpendicular is -X; constrain |dy/dx|
    case "right": { // perpendicular is +X
      const absdx = Math.abs(dx);
      if (absdx < 1) return { x: cp.x, y: edgePt.y }; // nearly zero dx → clamp to horizontal
      const maxDy = absdx * maxTanRatio;
      return { x: cp.x, y: edgePt.y + Math.max(-maxDy, Math.min(maxDy, dy)) };
    }
  }
}

/**
 * For a gateway (diamond), compute the outward-normal direction at a point on
 * the diamond edge identified by (side, offset).
 *
 * At offset=0.5 the point is at the vertex → the normal is axis-aligned
 * (straight up for top, straight right for right, etc.).
 * At offset≠0.5 the point is on a diagonal edge → the normal is perpendicular
 * to that edge.
 */
function gatewayEdgeNormal(side: Side, offset: number): { nx: number; ny: number } {
  // Each side has two diagonal edges meeting at the vertex (offset=0.5).
  // For a square diamond (w=h), the diagonals are at 45°.
  // The edge direction and outward normal depend on which half.
  //   top side, first half (offset<0.5): edge from left-vertex to top-vertex
  //     edge direction: (+1, -1) normalised, outward normal: (-1, -1) normalised
  //   top side, second half (offset>0.5): edge from top-vertex to right-vertex
  //     edge direction: (+1, +1) normalised, outward normal: (-1, +1) → wait, outward is UP-LEFT and UP-RIGHT
  //
  // Actually: for a diamond centred at origin with vertices at (0,-h/2), (w/2,0), (0,h/2), (-w/2,0):
  //   Top-left edge (left-vertex → top-vertex): direction (w/2, -h/2), outward normal (-h/2, -w/2) normalised
  //   Top-right edge (top-vertex → right-vertex): direction (w/2, h/2), outward normal (-h/2, w/2) normalised
  // For a square diamond (w=h), these simplify to 45° diagonals.
  //
  // We use unit normals. For simplicity with arbitrary aspect ratio diamonds
  // we just use the 45° assumption (gateways are always square).
  const INV_SQRT2 = 1 / Math.sqrt(2);

  // At the vertex (offset ≈ 0.5), use axis-aligned normal
  if (Math.abs(offset - 0.5) < 0.02) {
    switch (side) {
      case "top":    return { nx: 0, ny: -1 };
      case "right":  return { nx: 1, ny: 0 };
      case "bottom": return { nx: 0, ny: 1 };
      case "left":   return { nx: -1, ny: 0 };
    }
  }

  // On a diagonal edge — return the outward normal to that edge
  switch (side) {
    case "top":
      return offset < 0.5
        ? { nx: -INV_SQRT2, ny: -INV_SQRT2 }  // top-left edge
        : { nx:  INV_SQRT2, ny: -INV_SQRT2 };  // top-right edge
    case "right":
      return offset < 0.5
        ? { nx:  INV_SQRT2, ny: -INV_SQRT2 }  // right-upper edge
        : { nx:  INV_SQRT2, ny:  INV_SQRT2 };  // right-lower edge
    case "bottom":
      return offset < 0.5
        ? { nx:  INV_SQRT2, ny:  INV_SQRT2 }  // bottom-right edge
        : { nx: -INV_SQRT2, ny:  INV_SQRT2 };  // bottom-left edge
    case "left":
      return offset < 0.5
        ? { nx: -INV_SQRT2, ny:  INV_SQRT2 }  // left-lower edge
        : { nx: -INV_SQRT2, ny: -INV_SQRT2 };  // left-upper edge
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
// For gateways, the point moves along the diamond edge for that side.
// Each side spans two diamond edges meeting at the vertex:
//   top:    left-vertex → top-vertex → right-vertex  (offset 0→0.5→1)
//   right:  top-vertex → right-vertex → bottom-vertex
//   bottom: right-vertex → bottom-vertex → left-vertex
//   left:   bottom-vertex → left-vertex → top-vertex
export function sidePoint(el: DiagramElement, side: Side, offset = 0.5): Point {
  if (el.type === "gateway") {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const top: Point    = { x: cx, y: el.y };
    const right: Point  = { x: el.x + el.width, y: cy };
    const bottom: Point = { x: cx, y: el.y + el.height };
    const left: Point   = { x: el.x, y: cy };
    // Each side has a start vertex, the main vertex at 0.5, and an end vertex
    let v0: Point, v1: Point, v2: Point;
    switch (side) {
      case "top":    v0 = left;   v1 = top;    v2 = right;  break;
      case "right":  v0 = top;    v1 = right;  v2 = bottom; break;
      case "bottom": v0 = right;  v1 = bottom; v2 = left;   break;
      case "left":   v0 = bottom; v1 = left;   v2 = top;    break;
    }
    if (offset <= 0.5) {
      const t = offset * 2; // 0→1 over first half
      return { x: v0.x + (v1.x - v0.x) * t, y: v0.y + (v1.y - v0.y) * t };
    } else {
      const t = (offset - 0.5) * 2; // 0→1 over second half
      return { x: v1.x + (v2.x - v1.x) * t, y: v1.y + (v2.y - v1.y) * t };
    }
  }
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
      : edgePointFor(endPt, source);
    const tgtEdge = CIRCULAR_TYPES.has(target.type)
      ? ellipseEdgePoint(startPt, target)
      : edgePointFor(startPt, target);
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
    // For gateways, control point extends perpendicular to the diamond edge the point is on
    function cpForElement(edge: Point, el: DiagramElement, side: Side, offset: number, isCirc: boolean): Point {
      if (isCirc) return radialControlPoint(edge, el, curveOffset);
      if (el.type === "gateway") {
        const n = gatewayEdgeNormal(side, offset);
        return { x: edge.x + n.nx * curveOffset, y: edge.y + n.ny * curveOffset };
      }
      return perpendicularExitScaled(edge, side, curveOffset);
    }
    const cp1 = cpForElement(srcEdge, source, sourceSide, sourceOffsetAlong, srcIsCirc);
    const cp2 = cpForElement(tgtEdge, target, targetSide, targetOffsetAlong, tgtIsCirc);
    return {
      waypoints: [startPt, srcEdge, cp1, cp2, tgtEdge, endPt],
      sourceInvisibleLeader: true,
      targetInvisibleLeader: true,
    };
  }

  // Rectilinear: use offset-aware side points for perpendicular exit/entry
  const srcEdge = sidePoint(source, sourceSide, sourceOffsetAlong);
  const tgtEdge = sidePoint(target, targetSide, targetOffsetAlong);
  // Sequence-flow obstacle set: only BPMN flow-node-like shapes act as
  // obstacles. Edge-mounted (boundary) events are intentionally NOT obstacles
  // so connectors can still attach to them. Data Objects and Data Stores
  // are NOT obstacles (Paul's 2026-06-10 rule) — sequence flow ignores
  // them; they may visually overlap a route without forcing a detour.
  const SEQ_OBSTACLE_TYPES = new Set<string>([
    "task", "subprocess", "subprocess-expanded",
    // Intermediate events are NOT obstacles (like gateways) — they sit ON the
    // flow (e.g. when a connector is split by dropping an event on it), so a
    // sequence flow must pass through / attach to them, never detour around.
    "start-event", "end-event",
    // ArchiMate elements are obstacles for archi-* relationship routing so
    // connectors route AROUND elements (rule A4.07). Only present in
    // archimate diagrams, so this never affects BPMN sequence routing.
    "archimate-shape",
  ]);
  // Walk the ancestor chain so an EP that contains the source/target at
  // ANY depth (not only as a direct parent) is excluded from obstacles.
  // User rule: an EP is an obstacle for a sequence connector unless the
  // connector terminates on one of its descendants.
  function ancestorsOf(elementId: string): Set<string> {
    const result = new Set<string>();
    let cur = allElements.find((e) => e.id === elementId);
    while (cur?.parentId) {
      result.add(cur.parentId);
      cur = allElements.find((e) => e.id === cur!.parentId);
    }
    return result;
  }
  const srcAncestors = ancestorsOf(source.id);
  const tgtAncestors = ancestorsOf(target.id);
  // Innermost containing rectangle that holds BOTH endpoints — used as
  // the route's containment box so internal-obstacle avoidance never
  // pushes the path outside the boundary. Resolution order:
  //   1. Innermost Expanded Subprocess that contains both ends (user
  //      rule: an EP is a containment box for any sequence flow that
  //      starts AND ends inside it).
  //   2. White-box pool that contains both ends — Paul's 2026-06-10
  //      rule. Without this, an obstacle-avoidance detour could
  //      teleport a sequence connector above or below the pool.
  //      Black-box pools are NOT used here because they have no
  //      internal flow elements and so can never host a sequence
  //      flow with both endpoints inside them.
  // If neither applies (cross-pool flow, or no shared container), no
  // containment is applied.
  let containmentBounds: Bounds | undefined = undefined;
  {
    const commonEPs: DiagramElement[] = [];
    for (const ancId of srcAncestors) {
      if (!tgtAncestors.has(ancId)) continue;
      const anc = allElements.find((e) => e.id === ancId);
      if (anc?.type === "subprocess-expanded") commonEPs.push(anc);
    }
    if (commonEPs.length > 0) {
      const innermost = commonEPs.reduce((a, b) =>
        a.width * a.height <= b.width * b.height ? a : b,
      );
      containmentBounds = getBounds(innermost);
    } else {
      // Fall back to a shared white-box pool. Walk ancestors looking
      // for a pool that's in BOTH src and tgt ancestor sets — that's
      // necessarily the same pool. White-box only: black-box pools
      // never contain flow elements, so this branch only matters for
      // cases like SmokeTest1 / Diagram Margin test.
      for (const ancId of srcAncestors) {
        if (!tgtAncestors.has(ancId)) continue;
        const anc = allElements.find((e) => e.id === ancId);
        if (anc?.type !== "pool") continue;
        const poolType = (anc.properties?.poolType as string | undefined) ?? "black-box";
        if (poolType !== "white-box") continue;
        containmentBounds = getBounds(anc);
        break;
      }
    }
  }
  // Pool bounds — passed to buildOrthogonalPath as a "near boundary"
  // hint so detours don't crowd a pool wall. NOT obstacles.
  const poolBounds = allElements
    .filter(el => el.type === "pool")
    .map(getBounds);

  // Descendant sets — a connector terminating ON a container (e.g. an EP) must
  // NOT be blocked by that container's OWN contents. The route only reaches the
  // container's edge; a child hugging that edge (e.g. the EP's internal start
  // event) would otherwise "graze" the approach within clearance and force a
  // needless detour right around the diagram (Test 4: gwSplit → Plan Discussions
  // dived below everything to avoid the target EP's own start event).
  const childrenByParent = new Map<string, string[]>();
  for (const e of allElements) {
    if (!e.parentId) continue;
    const a = childrenByParent.get(e.parentId);
    if (a) a.push(e.id); else childrenByParent.set(e.parentId, [e.id]);
  }
  const collectDesc = (rootId: string): Set<string> => {
    const out = new Set<string>(); const stack = [rootId];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const k of childrenByParent.get(cur) ?? []) { if (!out.has(k)) { out.add(k); stack.push(k); } }
    }
    return out;
  };
  const srcDescendants = collectDesc(source.id);
  const tgtDescendants = collectDesc(target.id);

  const obstacles = allElements
    .filter((el) => {
      if (el.id === source.id || el.id === target.id) return false;
      // Own contents of the source/target container are not obstacles.
      if (srcDescendants.has(el.id) || tgtDescendants.has(el.id)) return false;
      // Don't treat boundary events on source or target as obstacles
      if (el.boundaryHostId === source.id || el.boundaryHostId === target.id) return false;
      // Edge-mounted (boundary) events on ANY host are excluded so connectors
      // can route to them without their host shape blocking the path.
      if (el.boundaryHostId) return false;
      // Don't treat pools or lanes as obstacles (connectors route within them)
      if (el.type === "pool" || el.type === "lane") return false;
      // Only the BPMN flow-node types listed above are obstacles for sequence flow.
      if (!SEQ_OBSTACLE_TYPES.has(el.type)) return false;
      // EPs that contain source OR target (at any depth) are not obstacles —
      // sequence flow must be allowed to enter the EP to reach the
      // descendant endpoint. EPs that DON'T contain either endpoint stay
      // as obstacles, so a sequence connector between two outside elements
      // routes around the EP instead of through it.
      if (el.type === "subprocess-expanded" && (srcAncestors.has(el.id) || tgtAncestors.has(el.id))) return false;
      // An ArchiMate container that holds the source or target is not an
      // obstacle — the connector must enter it to reach the contained element.
      if (el.type === "archimate-shape" && (srcAncestors.has(el.id) || tgtAncestors.has(el.id))) return false;
      // Paul's 2026-06-10 Test 4 rule: when the route has a containment
      // box (a shared EP or white-box pool), tasks / events OUTSIDE that
      // box don't affect the routing inside it. A task in the pool ABOVE
      // or BELOW this pool was incorrectly forcing detours that landed
      // against the pool wall. The obstacle is only relevant if at least
      // part of it sits inside the containment rect — otherwise the
      // route can never collide with it.
      if (containmentBounds) {
        const cRight  = containmentBounds.x + containmentBounds.width;
        const cBottom = containmentBounds.y + containmentBounds.height;
        const elRight  = el.x + el.width;
        const elBottom = el.y + el.height;
        const intersects =
          el.x < cRight && elRight > containmentBounds.x &&
          el.y < cBottom && elBottom > containmentBounds.y;
        if (!intersects) return false;
      }
      return true;
    })
    .map(getBounds);

  // Detour-only obstacle list: includes source / target gateways so a
  // path between exitPt and approachPt cannot cross the gateway body
  // (e.g., a connector aimed at the gateway's BOTTOM vertex from a
  // source ABOVE the gateway must route AROUND, not vertically through
  // the diamond). NOT used for L-shape `pathHitsObstacles` checks —
  // those have endpoints on the gateway boundary and would be flagged
  // by margin=4. Used only for the final `buildOrthogonalPath` fallback
  // which routes the MIDDLE of the path between exitPt / approachPt.
  const obstaclesForDetour = (() => {
    const arr = obstacles.slice();
    if (source.type === "gateway") arr.push(getBounds(source));
    if (target.type === "gateway") arr.push(getBounds(target));
    return arr;
  })();

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
      const simple = Math.abs(exitPt.y - approachPt.y) < 1
        ? [exitPt, approachPt]
        : [exitPt, { x: midX, y: exitPt.y }, { x: midX, y: approachPt.y }, approachPt];
      // P2 / A4.07: the simple Z-path skips obstacle checks — fall back to the
      // detour router if it would cross an element (with clearance).
      midPath = pathHitsObstacles([effectiveSrcEdge, ...simple, effectiveTgtEdge], obstacles, L_SHAPE_CLEARANCE)
        ? buildOrthogonalPath(exitPt, approachPt, obstaclesForDetour, containmentBounds, poolBounds)
        : simple;
    } else {
      midPath = buildOrthogonalPath(exitPt, approachPt, obstaclesForDetour, containmentBounds, poolBounds);
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
      const simple = Math.abs(exitPt.x - approachPt.x) < 1
        ? [exitPt, approachPt]
        : [exitPt, { x: exitPt.x, y: midY }, { x: approachPt.x, y: midY }, approachPt];
      // P2 / A4.07: obstacle-guard the simple Z-path (see above).
      midPath = pathHitsObstacles([effectiveSrcEdge, ...simple, effectiveTgtEdge], obstacles, L_SHAPE_CLEARANCE)
        ? buildOrthogonalPath(exitPt, approachPt, obstaclesForDetour, containmentBounds, poolBounds)
        : simple;
    } else {
      midPath = buildOrthogonalPath(exitPt, approachPt, obstaclesForDetour, containmentBounds, poolBounds);
    }
  } else if (
    exitOutward && approachOutward &&
    effectiveSrcSide === effectiveTgtSide &&
    (effectiveSrcSide === "top" || effectiveSrcSide === "bottom")
  ) {
    // Same vertical side (top↔top or bottom↔bottom) — e.g. a decision and a
    // merge gateway connected top-to-top. Route a clean "staple": both stubs
    // exit the same way, run out to the EXTREME common Y (above both for
    // top, below both for bottom), traverse, and drop back. Without this the
    // pair fell through to the generic detour router, which routes AROUND the
    // target body and produces the overshoot-and-return "kinked connector".
    // Falls back to obstacle-avoidance only if the staple would cross one.
    const commonY = effectiveSrcSide === "top"
      ? Math.min(exitPt.y, approachPt.y)
      : Math.max(exitPt.y, approachPt.y);
    const staple = [exitPt, { x: exitPt.x, y: commonY }, { x: approachPt.x, y: commonY }, approachPt];
    midPath = pathHitsObstacles(staple, obstacles, L_SHAPE_CLEARANCE)
      ? buildOrthogonalPath(exitPt, approachPt, obstaclesForDetour, containmentBounds, poolBounds)
      : staple;
  } else if (
    exitOutward && approachOutward &&
    effectiveSrcSide === effectiveTgtSide &&
    (effectiveSrcSide === "left" || effectiveSrcSide === "right")
  ) {
    // Same horizontal side (left↔left or right↔right): staple out to the
    // extreme common X, traverse, come back. Same rationale as above.
    const commonX = effectiveSrcSide === "left"
      ? Math.min(exitPt.x, approachPt.x)
      : Math.max(exitPt.x, approachPt.x);
    const staple = [exitPt, { x: commonX, y: exitPt.y }, { x: commonX, y: approachPt.y }, approachPt];
    midPath = pathHitsObstacles(staple, obstacles, L_SHAPE_CLEARANCE)
      ? buildOrthogonalPath(exitPt, approachPt, obstaclesForDetour, containmentBounds, poolBounds)
      : staple;
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

    if (a1Perp && !pathHitsObstacles([effectiveSrcEdge, lCorner1, effectiveTgtEdge], obstacles, L_SHAPE_CLEARANCE)) {
      midPath = [lCorner1];
    } else if (a2Perp && !pathHitsObstacles([effectiveSrcEdge, lCorner2, effectiveTgtEdge], obstacles, L_SHAPE_CLEARANCE)) {
      midPath = [lCorner2];
    } else {
      // Fall back to stub-based routing (guarantees perpendicularity, may have more corners).
      // Use obstaclesForDetour so the path can't slice through the
      // source / target gateway body when the natural straight middle
      // would (e.g., source ABOVE gateway, target = gateway BOTTOM
      // vertex — the detour routes the path AROUND the gateway).
      midPath = buildOrthogonalPath(exitPt, approachPt, obstaclesForDetour, containmentBounds, poolBounds);
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
  elements: DiagramElement[],
  /** Free-form / imported layout — when true, message flows are NOT forced
   *  vertical; they route rectilinearly between the closest sides (like a
   *  sequence connector), so a message can connect non-vertically-aligned
   *  elements. Pool/lane geometry is otherwise untouched here. */
  relaxedLayout = false,
): Connector[] {
  const elementMap = new Map(elements.map((el) => [el.id, el]));
  return connectors.map((rawConn) => {
    const source = elementMap.get(rawConn.sourceId);
    const target = elementMap.get(rawConn.targetId);
    if (!source || !target) return rawConn;

    // Free-form / imported message flow — dedicated rules (Paul 2026-07-12):
    //  1/2. Attaches ONLY to the TOP or BOTTOM of its endpoints (activities,
    //       pools, intermediate events) — never left/right. The pair is chosen
    //       by relative vertical position (upper element bottom → lower top).
    //  3.   Routes a rectilinear dogleg and NEVER avoids other elements (it is
    //       rendered on top of everything). It stays segment-moveable: a
    //       user-reshaped interior (>=9 waypoints) is preserved, only the
    //       top/bottom endpoints are re-fitted on recompute.
    if (relaxedLayout && rawConn.type === "messageBPMN") {
      const conn = rawConn;
      const srcCy = source.y + source.height / 2;
      const tgtCy = target.y + target.height / 2;
      const srcSide: Side = srcCy <= tgtCy ? "bottom" : "top";
      const tgtSide: Side = srcCy <= tgtCy ? "top" : "bottom";
      const srcOff = conn.sourceOffsetAlong ?? 0.5;
      const tgtOff = conn.targetOffsetAlong ?? 0.5;
      // Rule 3: pass NO elements → the router does zero obstacle avoidance.
      let waypoints = computeWaypoints(source, target, [], srcSide, tgtSide, "rectilinear", srcOff, tgtOff).waypoints;
      const wp = conn.waypoints;
      if (wp.length >= 9) {
        // Preserve the user's reshaped interior; re-fit only the endpoints.
        const newSrcCenter = getConnectionPointBySide(source, srcSide);
        const newTgtCenter = getConnectionPointBySide(target, tgtSide);
        const newSrcEdge = sidePoint(source, srcSide, srcOff);
        const newTgtEdge = sidePoint(target, tgtSide, tgtOff);
        const perpOff = adaptedPerpOffset(newSrcEdge, srcSide, newTgtEdge, tgtSide);
        const newExitPt = perpendicularExitScaled(newSrcEdge, srcSide, perpOff);
        const newApproachPt = perpendicularExitScaled(newTgtEdge, tgtSide, perpOff);
        const interior = wp.slice(3, wp.length - 3);
        const candidate = consolidateWaypoints(
          rectifyWaypoints([newSrcCenter, newSrcEdge, newExitPt, ...interior, newApproachPt, newTgtEdge, newTgtCenter], srcSide),
        );
        let ortho = true;
        for (let i = 1; i < candidate.length; i++) {
          if (Math.abs(candidate[i].x - candidate[i - 1].x) > 0.5 && Math.abs(candidate[i].y - candidate[i - 1].y) > 0.5) { ortho = false; break; }
        }
        if (ortho) waypoints = candidate;
      }
      return { ...conn, routingType: "rectilinear", waypoints,
        sourceInvisibleLeader: true, targetInvisibleLeader: true,
        sourceSide: srcSide, targetSide: tgtSide,
        sourceOffsetAlong: srcOff, targetOffsetAlong: tgtOff };
    }

    const conn = rawConn;

    // messageBPMN: always vertical when possible — single shared x for both
    // edges. NOT for free-form/imported diagrams (handled as rectilinear above).
    if (conn.type === "messageBPMN" && !relaxedLayout) {
      const BPMN_EVENT_TYPES = new Set(["start-event", "intermediate-event", "end-event"]);
      const srcIsEvent = BPMN_EVENT_TYPES.has(source.type);
      const tgtIsEvent = target.type === "start-event" || target.type === "intermediate-event";
      let x: number;
      let repairedSrcOffset = conn.sourceOffsetAlong;
      if (tgtIsEvent) {
        x = target.x + target.width / 2;
      } else if (srcIsEvent) {
        x = source.x + source.width / 2;
      } else {
        // Use source offset, clamped to both element boundaries to stay vertical
        const rawOffset = conn.sourceOffsetAlong ?? 0.5;
        const rawX = source.x + source.width * rawOffset;
        x = Math.max(source.x, Math.min(source.x + source.width, rawX));
        x = Math.max(target.x, Math.min(target.x + target.width, x));
        repairedSrcOffset = source.width > 0 ? (x - source.x) / source.width : 0.5;
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

    // associationBPMN: when either endpoint is a Data Object, Data Store,
    // or Text Annotation, both endpoints auto-attach exactly where the
    // centre-to-centre line crosses each element's boundary.
    // `closestEdgePoint` returns that intersection directly;
    // `getOffsetAlong` would instead project the other element's
    // coordinate (wrong for anything but horizontally or vertically
    // aligned centres). For non-data associations the stored
    // sides/offsets are preserved.
    if (conn.type === "associationBPMN") {
      const DATA_TYPES = new Set<string>(["data-object", "data-store", "text-annotation"]);
      const involvesData = DATA_TYPES.has(source.type) || DATA_TYPES.has(target.type);
      const srcCx = source.x + source.width / 2, srcCy = source.y + source.height / 2;
      const tgtCx = target.x + target.width / 2, tgtCy = target.y + target.height / 2;
      let srcSide = conn.sourceSide;
      let tgtSide = conn.targetSide;
      let srcOffset = conn.sourceOffsetAlong ?? 0.5;
      let tgtOffset = conn.targetOffsetAlong ?? 0.5;
      let srcEdge: Point;
      let tgtEdge: Point;
      if (involvesData) {
        // Boundary point along the ray from this element's centre toward the other's centre
        srcEdge = closestEdgePoint({ x: tgtCx, y: tgtCy }, getBounds(source));
        tgtEdge = closestEdgePoint({ x: srcCx, y: srcCy }, getBounds(target));
        // Derive persisted side/offset from the boundary point
        srcSide = sideFromPoint(source, srcEdge);
        tgtSide = sideFromPoint(target, tgtEdge);
        srcOffset = offsetAlongFromPoint(source, srcSide, srcEdge);
        tgtOffset = offsetAlongFromPoint(target, tgtSide, tgtEdge);
      } else {
        srcEdge = sidePoint(source, srcSide, srcOffset);
        tgtEdge = sidePoint(target, tgtSide, tgtOffset);
      }
      const startPt = { x: srcCx, y: srcCy };
      const endPt   = { x: tgtCx, y: tgtCy };
      if (typeof window !== "undefined" && (window as unknown as { __DIAGRAMATIX_TRACE?: boolean }).__DIAGRAMATIX_TRACE) {
        console.log(`[TRACE routing.associationBPMN] ${conn.id} involvesData=${involvesData} srcEdge=${JSON.stringify(srcEdge)} tgtEdge=${JSON.stringify(tgtEdge)} side=${srcSide}/${tgtSide} off=${srcOffset.toFixed(2)}/${tgtOffset.toFixed(2)}`);
      }
      // Annotations are always non-directional in BPMN. Force the
      // direction regardless of stored value so legacy connectors with
      // a stale "directed" / "open-directed" still render with no
      // arrowhead.
      const involvesAnnotation = source.type === "text-annotation" || target.type === "text-annotation";
      const directionType = involvesAnnotation ? "non-directed" : conn.directionType;
      return { ...conn,
        sourceSide: srcSide, targetSide: tgtSide,
        sourceOffsetAlong: srcOffset, targetOffsetAlong: tgtOffset,
        directionType,
        waypoints: [startPt, srcEdge, tgtEdge, endPt],
        sourceInvisibleLeader: true, targetInvisibleLeader: true };
    }

    // review-comment-link (Phase 3): a direct line from the review-comment
    // note to the element it concerns. Both ends snap to the boundary
    // point along the centre-to-centre ray (same maths as a data
    // association), so the line never clips through either box.
    if (conn.type === "review-comment-link") {
      const srcCx = source.x + source.width / 2, srcCy = source.y + source.height / 2;
      const tgtCx = target.x + target.width / 2, tgtCy = target.y + target.height / 2;
      const srcEdge = closestEdgePoint({ x: tgtCx, y: tgtCy }, getBounds(source));
      const tgtEdge = closestEdgePoint({ x: srcCx, y: srcCy }, getBounds(target));
      const srcSide = sideFromPoint(source, srcEdge);
      const tgtSide = sideFromPoint(target, tgtEdge);
      return { ...conn,
        sourceSide: srcSide, targetSide: tgtSide,
        sourceOffsetAlong: offsetAlongFromPoint(source, srcSide, srcEdge),
        targetOffsetAlong: offsetAlongFromPoint(target, tgtSide, tgtEdge),
        waypoints: [{ x: srcCx, y: srcCy }, srcEdge, tgtEdge, { x: tgtCx, y: tgtCy }],
        sourceInvisibleLeader: true, targetInvisibleLeader: true };
    }

    // Curvilinear: if the user has adjusted handles, preserve control points relative to edges
    if (conn.routingType === "curvilinear" && conn.cp1RelOffset && conn.cp2RelOffset) {
      const CIRC_TYPES = new Set(["use-case", "process-system"]);
      const srcEdgeRaw = sidePoint(source, conn.sourceSide, conn.sourceOffsetAlong ?? 0.5);
      const tgtEdgeRaw = sidePoint(target, conn.targetSide, conn.targetOffsetAlong ?? 0.5);
      // Project onto circle boundary for circular elements — otherwise the
      // endpoint snaps to the bounding rect when an attached element moves.
      const srcEdge = CIRC_TYPES.has(source.type) ? ellipseEdgePoint(srcEdgeRaw, source) : srcEdgeRaw;
      const tgtEdge = CIRC_TYPES.has(target.type) ? ellipseEdgePoint(tgtEdgeRaw, target) : tgtEdgeRaw;
      const startPt = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
      const endPt   = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
      let cp1 = { x: srcEdge.x + conn.cp1RelOffset.x, y: srcEdge.y + conn.cp1RelOffset.y };
      let cp2 = { x: tgtEdge.x + conn.cp2RelOffset.x, y: tgtEdge.y + conn.cp2RelOffset.y };
      // State-machine angle constraints on transition connectors
      if (conn.type === "transition") {
        const srcRatio = source.type === "gateway" ? 0 : 0.325; // gateway: strictly perp; state: ±18°
        const tgtRatio = target.type === "gateway" ? 0 : 0.325;
        cp1 = constrainControlPoint(srcEdge, cp1, conn.sourceSide, srcRatio,
          source.type === "gateway", conn.sourceOffsetAlong ?? 0.5);
        cp2 = constrainControlPoint(tgtEdge, cp2, conn.targetSide, tgtRatio,
          target.type === "gateway", conn.targetOffsetAlong ?? 0.5);
      }
      return { ...conn, waypoints: [startPt, srcEdge, cp1, cp2, tgtEdge, endPt] };
    }

    // UML connectors (Domain diagrams — associations/aggregations/etc. between
    // classes, enumerations, packages). Two selectable modes:
    //  • OPTIMAL (default): always re-pick the closest faces + project the
    //    other element's centre onto them. Great for large moves / routing
    //    around obstacles, but the endpoints "slide" on both elements as either
    //    end moves.
    //  • STICKY (umlStickyRouting on): each endpoint stays FIXED on its stored
    //    face at its stored offset (so it rides rigidly with its own element)
    //    UNTIL a move is large enough that a DIFFERENT face becomes closest —
    //    then only that end jumps to the new optimal face. Small moves leave
    //    both connection points fixed.
    const isUmlConn = isUmlConnType(conn.type);
    if (isUmlConn) {
      const srcCx = source.x + source.width / 2, srcCy = source.y + source.height / 2;
      const tgtCx = target.x + target.width / 2, tgtCy = target.y + target.height / 2;
      const optSrcSide = getClosestSideOfElement(tgtCx, tgtCy, source);
      const optTgtSide = getClosestSideOfElement(srcCx, srcCy, target);
      const optSrcOffset = getOffsetAlong(source, optSrcSide, { x: tgtCx, y: tgtCy });
      const optTgtOffset = getOffsetAlong(target, optTgtSide, { x: srcCx, y: srcCy });

      // Resolve the side + offset to actually use for each end.
      let useSrcSide = optSrcSide, useSrcOffset = optSrcOffset;
      let useTgtSide = optTgtSide, useTgtOffset = optTgtOffset;
      if (_umlStickyRouting) {
        // Keep the stored offset while the closest side is unchanged (fixed
        // point on the same face); jump to the new optimal side + offset only
        // when the closest face changes.
        if (conn.sourceSide === optSrcSide && conn.sourceOffsetAlong != null) useSrcOffset = conn.sourceOffsetAlong;
        if (conn.targetSide === optTgtSide && conn.targetOffsetAlong != null) useTgtOffset = conn.targetOffsetAlong;
      }

      const umlResult = computeWaypoints(source, target, elements,
        useSrcSide, useTgtSide, conn.routingType, useSrcOffset, useTgtOffset);
      const routed = { ...conn, waypoints: umlResult.waypoints,
        sourceInvisibleLeader: umlResult.sourceInvisibleLeader,
        targetInvisibleLeader: umlResult.targetInvisibleLeader,
        sourceSide: useSrcSide, targetSide: useTgtSide,
        sourceOffsetAlong: useSrcOffset, targetOffsetAlong: useTgtOffset,
      };
      // Sticky mode keeps the connector's positioning stable, so keep any
      // user-dragged label offsets too. Optimal mode resets them (endpoints
      // moved, so the old label positions no longer make sense).
      if (_umlStickyRouting) return routed;
      return { ...routed,
        associationNameOffset: undefined,
        sourceRoleOffset: undefined, sourceMultOffset: undefined,
        sourceConstraintOffset: undefined, sourceUniqueOffset: undefined,
        targetRoleOffset: undefined, targetMultOffset: undefined,
        targetConstraintOffset: undefined, targetUniqueOffset: undefined,
      };
    }

    // ArchiMate connectors: keep the user's chosen attachment (the click/release
    // side + offset) EXCEPT when that side now faces AWAY from the other element
    // — a straight line from it would then cut back THROUGH this element's own
    // body (which happens when the element is dragged to the far side). In that
    // case re-pick the side facing the other element so the connector never
    // travels through the moving element. Each end is judged independently; a
    // side that still faces the other element keeps its exact click-time offset.
    if (conn.type.startsWith("archi-")) {
      const srcCx = source.x + source.width / 2, srcCy = source.y + source.height / 2;
      const tgtCx = target.x + target.width / 2, tgtCy = target.y + target.height / 2;
      let aSrcSide = conn.sourceSide, aTgtSide = conn.targetSide;
      let aSrcOff = conn.sourceOffsetAlong ?? 0.5, aTgtOff = conn.targetOffsetAlong ?? 0.5;
      const sN = sideNormalDir(aSrcSide), tN = sideNormalDir(aTgtSide);
      if (sN.dx * (tgtCx - srcCx) + sN.dy * (tgtCy - srcCy) < 0) {
        // source side points away from the target → re-attach toward it
        aSrcSide = getClosestSideOfElement(tgtCx, tgtCy, source);
        aSrcOff = getOffsetAlong(source, aSrcSide, { x: tgtCx, y: tgtCy });
      }
      if (tN.dx * (srcCx - tgtCx) + tN.dy * (srcCy - tgtCy) < 0) {
        // target side points away from the source → re-attach toward it
        aTgtSide = getClosestSideOfElement(srcCx, srcCy, target);
        aTgtOff = getOffsetAlong(target, aTgtSide, { x: srcCx, y: srcCy });
      }
      const aRes = computeWaypoints(source, target, elements,
        aSrcSide, aTgtSide, conn.routingType, aSrcOff, aTgtOff);
      return { ...conn, waypoints: aRes.waypoints,
        sourceInvisibleLeader: aRes.sourceInvisibleLeader,
        targetInvisibleLeader: aRes.targetInvisibleLeader,
        sourceSide: aSrcSide, targetSide: aTgtSide,
        sourceOffsetAlong: aSrcOff, targetOffsetAlong: aTgtOff };
    }

    // For rectilinear connectors with USER-CUSTOMISED interior routing,
    // try to preserve their waypoints. Auto-generated routes (single L-shape
    // = 7 waypoints, single vertical jog = 8 waypoints) are NOT preserved —
    // they should always recompute from scratch so jogs stay centred between
    // the two elements as they move. Only when N >= 9 do we have evidence of
    // user customisation worth preserving.
    if (conn.routingType === "rectilinear") {
      const wp = conn.waypoints;
      const N = wp.length;
      if (N >= 9) {
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
        // Check if preserved interior routing passes through any obstacle.
        // MUST match the main routing pass (SEQ_OBSTACLE_TYPES): only BPMN
        // flow-node types are obstacles for sequence flow; edge-mounted events
        // are excluded, and EPs containing source or target at any depth are
        // excluded. Data Objects and Data Stores are NOT obstacles (Paul's
        // 2026-06-10 rule) — a route may pass a data artifact without detouring;
        // including them here (a prior inconsistency) rejected valid routes and
        // left a gap around data stores.
        const SEQ_OBS = new Set<string>([
          "task", "subprocess", "subprocess-expanded",
          // Intermediate events excluded (like gateways) — they sit ON the flow.
          "start-event", "end-event",
        ]);
        function ancestorsOfPreserve(elementId: string): Set<string> {
          const result = new Set<string>();
          let cur = elements.find((e) => e.id === elementId);
          while (cur?.parentId) {
            result.add(cur.parentId);
            cur = elements.find((e) => e.id === cur!.parentId);
          }
          return result;
        }
        const preserveSrcAncestors = ancestorsOfPreserve(source.id);
        const preserveTgtAncestors = ancestorsOfPreserve(target.id);
        const obstacles = elements
          .filter(el => {
            if (el.id === source.id || el.id === target.id) return false;
            if (el.type === "pool" || el.type === "lane") return false;
            if (el.boundaryHostId) return false;
            if (!SEQ_OBS.has(el.type)) return false;
            if (el.type === "subprocess-expanded"
                && (preserveSrcAncestors.has(el.id) || preserveTgtAncestors.has(el.id))) return false;
            return true;
          })
          .map(getBounds);
        // Validate every segment is strictly axis-aligned. If the rectify pass
        // failed to make the result orthogonal (e.g. because the user-customised
        // interior is no longer compatible with the new exit/approach), fall
        // through to a full recompute.
        let allOrthogonal = true;
        for (let i = 1; i < candidate.length; i++) {
          const dx = Math.abs(candidate[i].x - candidate[i - 1].x);
          const dy = Math.abs(candidate[i].y - candidate[i - 1].y);
          if (dx > 0.5 && dy > 0.5) { allOrthogonal = false; break; }
        }
        if (allOrthogonal && outwardOk && !pathHitsObstacles(candidate, obstacles)) {
          return { ...conn, waypoints: candidate };
        }
        // Interior routing hits obstacle, goes inward, or is non-orthogonal — fall through
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
        // Recalculate optimal sides — `safeSidePair` picks both sides off
        // the same delta vector so the path can't double back through the
        // source / target body, and overrides with `pickBoundaryEventSide`
        // for boundary-event endpoints (issues 2 + 8).
        const { src: newSrcSide, tgt: newTgtSide } = safeSidePair(source, target, elements);
        // Preserve the user-chosen offset along any side that ends up
        // unchanged. Without this, every drag step that trips this
        // fallback snaps the visible attachment point back to the
        // edge midpoint — even when the side itself wasn't the issue.
        const newSrcOffset = newSrcSide === conn.sourceSide ? (conn.sourceOffsetAlong ?? 0.5) : 0.5;
        const newTgtOffset = newTgtSide === conn.targetSide ? (conn.targetOffsetAlong ?? 0.5) : 0.5;
        const result2 = computeWaypoints(
          source, target, elements,
          newSrcSide, newTgtSide, conn.routingType, newSrcOffset, newTgtOffset,
        );
        return { ...conn, waypoints: result2.waypoints,
          sourceInvisibleLeader: result2.sourceInvisibleLeader,
          targetInvisibleLeader: result2.targetInvisibleLeader,
          sourceSide: newSrcSide, targetSide: newTgtSide,
          sourceOffsetAlong: newSrcOffset, targetOffsetAlong: newTgtOffset,
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
      // Recalculate with optimal facing sides — boundary-event-aware and
      // self-avoidant via `safeSidePair`.
      const { src: reSrcSide, tgt: reTgtSide } = safeSidePair(source, target, elements);
      // Same offset-preservation as the exit/approach fallback above:
      // only re-centre the attachment when the side actually changes.
      const reSrcOffset = reSrcSide === conn.sourceSide ? (conn.sourceOffsetAlong ?? 0.5) : 0.5;
      const reTgtOffset = reTgtSide === conn.targetSide ? (conn.targetOffsetAlong ?? 0.5) : 0.5;
      const result3 = computeWaypoints(source, target, elements, reSrcSide, reTgtSide, conn.routingType, reSrcOffset, reTgtOffset);
      return { ...conn, waypoints: result3.waypoints,
        sourceInvisibleLeader: result3.sourceInvisibleLeader,
        targetInvisibleLeader: result3.targetInvisibleLeader,
        sourceSide: reSrcSide, targetSide: reTgtSide,
        sourceOffsetAlong: reSrcOffset, targetOffsetAlong: reTgtOffset,
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
