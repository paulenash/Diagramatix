/**
 * How a connector's LINE is drawn — the path, its rounded corners, the humps
 * where it crosses an earlier connector, and the small decorations at its
 * source end — as pure functions (2026-09-28).
 *
 * These lived inside the canvas's ConnectorRenderer (a client component), so
 * the phone viewer and the partner PDF, which draw diagrams on their own, could
 * not reach them and drew sharp-cornered lines with no humps. Paul: "Render
 * sequence connectors as similar to the website rendering as possible,
 * rectilinear with rounded corners and crossing humps." One copy now: the
 * canvas, the phone and the PDF all draw through here.
 *
 * Pure: no React, no DOM.
 */
import type { Connector, Point } from "./types";
import { waypointsToSvgPath, waypointsToCurvePath, waypointsToRoundedPath } from "./routing";
import { visibleWaypoints } from "./canvasPaint";
import { showLabelTether, type LabelTetherMode } from "./labelTether";

// Line segment intersection: returns the parameter t along segment (a1→a2) where it crosses (b1→b2), or null
export function segmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): number | null {
  const dx = a2.x - a1.x, dy = a2.y - a1.y;
  const ex = b2.x - b1.x, ey = b2.y - b1.y;
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-10) return null; // parallel
  const t = ((b1.x - a1.x) * ey - (b1.y - a1.y) * ex) / denom;
  const u = ((b1.x - a1.x) * dy - (b1.y - a1.y) * dx) / denom;
  if (t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99) return t;
  return null;
}

// Build SVG path with small semicircular humps at crossing points
export function pathWithHumps(rawWaypoints: Point[], otherWaypoints: Point[][], humpRadius = 6, cornerRadius = 8): string {
  if (rawWaypoints.length < 2) return "";

  // Remove collinear intermediate points
  const waypoints = [rawWaypoints[0]];
  for (let i = 1; i < rawWaypoints.length - 1; i++) {
    const prev = waypoints[waypoints.length - 1];
    const curr = rawWaypoints[i];
    const next = rawWaypoints[i + 1];
    if (Math.abs((curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x)) > 0.5) {
      waypoints.push(curr);
    }
  }
  waypoints.push(rawWaypoints[rawWaypoints.length - 1]);

  // Collect all crossing t-values per segment
  const segCrossings: { segIdx: number; t: number }[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a1 = waypoints[i], a2 = waypoints[i + 1];
    for (const other of otherWaypoints) {
      for (let j = 0; j < other.length - 1; j++) {
        const t = segmentIntersection(a1, a2, other[j], other[j + 1]);
        if (t !== null) segCrossings.push({ segIdx: i, t });
      }
    }
  }

  if (segCrossings.length === 0) return "";

  // Sort by segment then by t
  segCrossings.sort((a, b) => a.segIdx - b.segIdx || a.t - b.t);

  const d: string[] = [`M ${waypoints[0].x} ${waypoints[0].y}`];

  // Precompute corner rounding for each interior waypoint
  const cornerArcs = new Map<number, { ax: number; ay: number; bx: number; by: number }>();
  for (let i = 1; i < waypoints.length - 1; i++) {
    const prev = waypoints[i - 1], curr = waypoints[i], next = waypoints[i + 1];
    const d1x = curr.x - prev.x, d1y = curr.y - prev.y;
    const d2x = next.x - curr.x, d2y = next.y - curr.y;
    const len1 = Math.hypot(d1x, d1y), len2 = Math.hypot(d2x, d2y);
    if (len1 >= 1 && len2 >= 1) {
      const cr = Math.min(cornerRadius, len1 * 0.45, len2 * 0.45);
      if (cr >= 1) {
        cornerArcs.set(i, {
          ax: curr.x - (d1x / len1) * cr, ay: curr.y - (d1y / len1) * cr,
          bx: curr.x + (d2x / len2) * cr, by: curr.y + (d2y / len2) * cr,
        });
      }
    }
  }

  for (let i = 0; i < waypoints.length - 1; i++) {
    const curr = waypoints[i];
    const next = waypoints[i + 1];

    // Approach point for corner at end of this segment (if any)
    const endCorner = cornerArcs.get(i + 1);
    // The effective end of this segment is the approach point of the next corner, or next waypoint
    const segEnd = endCorner ? { x: endCorner.ax, y: endCorner.ay } : next;

    // Crossing humps on this segment (use original curr→next for t-value calculation)
    const crossings = segCrossings.filter((c) => c.segIdx === i);
    if (crossings.length > 0) {
      const segDx = next.x - curr.x, segDy = next.y - curr.y;
      const segLen = Math.hypot(segDx, segDy);
      if (segLen >= 1) {
        const ux = segDx / segLen, uy = segDy / segLen;
        for (const cross of crossings) {
          const cx = curr.x + segDx * cross.t;
          const cy = curr.y + segDy * cross.t;
          const r = Math.min(humpRadius, segLen * cross.t * 0.4, segLen * (1 - cross.t) * 0.4);
          if (r < 1) continue;
          d.push(`L ${cx - ux * r} ${cy - uy * r}`);
          d.push(`A ${r} ${r} 0 0 1 ${cx + ux * r} ${cy + uy * r}`);
        }
      }
    }

    // Draw to effective end of segment
    d.push(`L ${segEnd.x} ${segEnd.y}`);

    // Corner arc at the end of this segment
    if (endCorner) {
      d.push(`Q ${next.x} ${next.y} ${endCorner.bx} ${endCorner.by}`);
    }
  }

  return d.join(" ");
}

/**
 * The connectors that take part in crossing humps: each of these jumps over
 * the ones of these drawn BEFORE it (earlier in the diagram's list), and is
 * jumped over by the ones after. Message flows and data associations never
 * jump and are never jumped over.
 */
export function isHumpType(type: string): boolean {
  return type === "sequence" || type === "association" || type === "uml-association";
}

/**
 * For every hump-taking connector, the visible routes of the hump-taking
 * connectors before it — what it jumps over (the canvas's rule, above).
 */
export function humpOthersById(connectors: readonly Connector[]): Map<string, Point[][]> {
  const out = new Map<string, Point[][]>();
  const prior: Point[][] = [];
  for (const c of connectors) {
    if (!isHumpType(c.type)) continue;
    out.set(c.id, prior.slice());
    prior.push(visibleWaypoints(c));
  }
  return out;
}

/**
 * The SVG path the canvas draws for a connector's line, from its VISIBLE
 * waypoints (canvasPaint.visibleWaypoints):
 *   • a curved transition / flow (four points: ends and two control points):
 *     a short straight stub at each end, so the arrowhead lies along the
 *     element's edge, and a cubic curve between;
 *   • a sequence / flowline / association crossing an earlier one: rounded
 *     corners with a small semicircular hump at each crossing;
 *   • otherwise a curve, rounded corners (rectilinear) or a straight line.
 */
export function connectorPathD(
  connector: Pick<Connector, "type" | "routingType">,
  vis: Point[],
  others?: Point[][],
): string {
  if ((connector.type === "transition" || connector.type === "flow") && connector.routingType === "curvilinear"
      && vis.length === 4) {
    const [P0, P1, P2, P3] = vis;
    const STUB = 4;
    // Stub directions derived from control points (perpendicular for rects, radial for circles)
    const srcDir = { x: P1.x - P0.x, y: P1.y - P0.y };
    const srcLen = Math.sqrt(srcDir.x ** 2 + srcDir.y ** 2) || 1;
    const s1 = { x: P0.x + (srcDir.x / srcLen) * STUB, y: P0.y + (srcDir.y / srcLen) * STUB };
    const tgtDir = { x: P2.x - P3.x, y: P2.y - P3.y };
    const tgtLen = Math.sqrt(tgtDir.x ** 2 + tgtDir.y ** 2) || 1;
    const s2 = { x: P3.x + (tgtDir.x / tgtLen) * STUB, y: P3.y + (tgtDir.y / tgtLen) * STUB };
    // Path: source edge → stub → curve → stub → target edge
    // Arrowhead on last segment (s2→P3) aligns perpendicular to element edge
    return `M ${P0.x} ${P0.y} L ${s1.x} ${s1.y} C ${P1.x} ${P1.y}, ${P2.x} ${P2.y}, ${s2.x} ${s2.y} L ${P3.x} ${P3.y}`;
  }
  // Crossing humps for sequence and association connectors
  if (others && others.length > 0
      && (connector.type === "sequence" || connector.type === "flowline" || connector.type === "association" || connector.type === "uml-association")
      && (connector.routingType === "rectilinear" || connector.routingType === "direct")) {
    const humpPath = pathWithHumps(vis, others);
    if (humpPath) return humpPath;
  }
  if (connector.routingType === "curvilinear") return waypointsToCurvePath(vis);
  if (connector.routingType === "rectilinear") return waypointsToRoundedPath(vis);
  return waypointsToSvgPath(vis);
}

/**
 * A BPMN sequence flow's source-end decoration: a slash for the DEFAULT flow,
 * a small hollow diamond for a CONDITIONAL flow leaving an activity (never a
 * gateway), 14px along the first segment. Null when neither applies.
 */
export type FlowMarkerShape =
  | { kind: "slash"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "diamond"; points: string };

export function flowMarkerShape(
  connector: Pick<Connector, "type" | "isDefaultFlow" | "branchCondition">,
  vis: Point[],
  sourceType?: string,
): FlowMarkerShape | null {
  if (connector.type !== "sequence" || vis.length < 2) return null;
  const isDefault = connector.isDefaultFlow === true;
  const isConditional = !isDefault && !!connector.branchCondition?.trim()
    && sourceType !== "gateway" && sourceType !== "fork-join";
  if (!isDefault && !isConditional) return null;
  const p0 = vis[0], p1 = vis[1];
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
  const ux = (p1.x - p0.x) / len, uy = (p1.y - p0.y) / len; // along the flow
  const px = -uy, py = ux;                                   // perpendicular
  const mx = p0.x + ux * 14, my = p0.y + uy * 14;            // 14px from the source
  if (isDefault) {
    const s = 5, ax = (ux + px) * s, ay = (uy + py) * s;
    return { kind: "slash", x1: mx - ax, y1: my - ay, x2: mx + ax, y2: my + ay };
  }
  const r = 5;
  const points = `${mx + ux * r},${my + uy * r} ${mx + px * r},${my + py * r} ${mx - ux * r},${my - uy * r} ${mx - px * r},${my - py * r}`;
  return { kind: "diamond", points };
}

/**
 * Where a gateway branch's documented share ("30%") is written: just past the
 * source-end marker, offset to the side so it never sits on the line.
 */
export function branchPercentPlacement(
  connector: Pick<Connector, "type" | "branchPercent">,
  vis: Point[],
): { x: number; y: number; text: string } | null {
  const pct = connector.branchPercent;
  if (pct === undefined || connector.type !== "sequence" || vis.length < 2) return null;
  const p0 = vis[0], p1 = vis[1];
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
  const ux = (p1.x - p0.x) / len, uy = (p1.y - p0.y) / len;
  const px = -uy, py = ux;
  const along = Math.min(26, len * 0.45);
  return {
    x: p0.x + ux * along + px * 8,
    y: p0.y + uy * along + py * 8,
    text: `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`,
  };
}

/**
 * The dashed leader from a gateway branch to its drifted label: from a third of
 * the way along the branch's first segment to where that line meets the
 * label's INKED box (the text itself, not the padded layout box).
 */
export function labelTetherLine(
  tetherPoint: Point,
  lines: string[],
  fontSize: number,
  lCx: number, lTy: number, lHeight: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const avgCharWidth = fontSize * 0.6;
  const lMidY = lTy + lHeight / 2;
  const inkW = Math.max(...lines.map(l => l.length * avgCharWidth));
  const boxL = lCx - inkW / 2;
  const boxR = lCx + inkW / 2;
  const boxT = lTy;
  const boxB = lTy + lHeight;
  const boxCx = (boxL + boxR) / 2;
  const boxCy = (boxT + boxB) / 2;
  const dx = tetherPoint.x - boxCx;
  const dy = tetherPoint.y - boxCy;
  let tx = lCx, ty = lMidY;
  if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
    const halfW = (boxR - boxL) / 2;
    const halfH = (boxB - boxT) / 2;
    const scaleX = Math.abs(dx) > 0 ? halfW / Math.abs(dx) : Infinity;
    const scaleY = Math.abs(dy) > 0 ? halfH / Math.abs(dy) : Infinity;
    const s = Math.min(scaleX, scaleY);
    tx = boxCx + dx * s;
    ty = boxCy + dy * s;
  }
  return { x1: tetherPoint.x, y1: tetherPoint.y, x2: tx, y2: ty };
}

/** Where a gateway branch's tether starts: a third of the way along its first visible segment. */
export function tetherPointOf(vis: Point[]): Point | null {
  if (vis.length < 2) return null;
  const a = vis[0], b = vis[1];
  return { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 };
}

/**
 * Is a gateway branch's label drawn with its tether at rest? When the stored
 * mode says so, or (no mode) when the label has drifted off its branch: its
 * box no longer within 6px of the tether point. The tether rule itself is
 * labelTether.ts's showLabelTether.
 */
export function branchLabelAdrift(a: {
  hasLabel: boolean;
  sourceIsGateway: boolean;
  mode?: LabelTetherMode;
  tetherPoint: Point;
  lCx: number; lMidY: number; lWidth: number; lHeight: number;
}): boolean {
  const adrift = Math.abs(a.tetherPoint.x - a.lCx) > a.lWidth / 2 + 6
    || Math.abs(a.tetherPoint.y - a.lMidY) > a.lHeight / 2 + 6;
  return showLabelTether({ hasLabel: a.hasLabel, sourceIsGateway: a.sourceIsGateway, mode: a.mode, adrift });
}

/** The connectors the canvas draws a floating label for. */
export function connectorShowsLabel(c: Pick<Connector, "type" | "label">): boolean {
  return c.type === "transition" || c.type === "flow" || c.type === "messageBPMN"
    || c.type === "flowline"
    || (c.type === "uml-dependency" && !!c.label)
    || (c.type === "sequence" && c.label !== undefined);
}

/**
 * A gateway branch label (labelAnchor "source") is SUPPRESSED — not deleted —
 * while its source gateway's marker is Parallel or Event-based, since those
 * markers carry no branch conditions. `sourceGatewayType` is the source's
 * gatewayType when the source is a gateway (default "exclusive"), else undefined.
 */
export function isBranchLabelSuppressed(c: Pick<Connector, "labelAnchor">, sourceGatewayType: string | undefined): boolean {
  if (c.labelAnchor !== "source") return false;
  return sourceGatewayType === "parallel" || sourceGatewayType === "event-based";
}
