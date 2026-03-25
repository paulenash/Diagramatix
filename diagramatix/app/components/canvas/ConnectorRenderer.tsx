"use client";

import { useState, useContext } from "react";
import type { Connector, Point } from "@/app/lib/diagram/types";
import { DisplayModeCtx, ConnectorFontScaleCtx, sketchyFilter } from "@/app/lib/diagram/displayMode";
import { waypointsToSvgPath, waypointsToCurvePath, waypointsToRoundedPath } from "@/app/lib/diagram/routing";

interface Props {
  connector: Connector;
  selected: boolean;
  onSelect: () => void;
  svgToWorld?: (clientX: number, clientY: number) => Point;
  onUpdateWaypoints?: (id: string, waypoints: Point[]) => void;
  onWaypointsDragEnd?: () => void;
  onUpdateLabel?: (label: string, offsetX: number, offsetY: number, width: number) => void;
  onUpdateCurveHandles?: (id: string, waypoints: Point[], cp1Rel: Point, cp2Rel: Point) => void;
  misaligned?: boolean;
  otherConnectorWaypoints?: Point[][];
  debugMode?: boolean;
  onUpdateEndOffset?: (connectorId: string, field: string, offset: Point) => void;
}

// Line segment intersection: returns the parameter t along segment (a1→a2) where it crosses (b1→b2), or null
function segmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): number | null {
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
function pathWithHumps(rawWaypoints: Point[], otherWaypoints: Point[][], humpRadius = 6, cornerRadius = 8): string {
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


function wrapText(text: string, maxWidth: number, fontSize = 10): string[] {
  const avgCharWidth = fontSize * 0.6;
  const charsPerLine = Math.max(1, Math.floor(maxWidth / avgCharWidth));
  const lines: string[] = [];
  for (const segment of text.split('\n')) {
    const words = segment.split(' ');
    let current = '';
    for (const word of words) {
      if (!current) { current = word; }
      else if (current.length + 1 + word.length <= charsPerLine) { current += ' ' + word; }
      else { lines.push(current); current = word; }
    }
    lines.push(current);
  }
  return lines.length ? lines : [''];
}

function cubicBezierPoint(p0: Point, cp1: Point, cp2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt**3*p0.x + 3*mt**2*t*cp1.x + 3*mt*t**2*cp2.x + t**3*p3.x,
    y: mt**3*p0.y + 3*mt**2*t*cp1.y + 3*mt*t**2*cp2.y + t**3*p3.y,
  };
}

function sideNormal(side: string): Point {
  if (side === "right") return { x:  1, y:  0 };
  if (side === "left")  return { x: -1, y:  0 };
  if (side === "top")   return { x:  0, y: -1 };
  return                       { x:  0, y:  1 }; // bottom
}

function inverseBezierCPs(P0: Point, P3: Point, Q1: Point, Q2: Point): [Point, Point] {
  const A = { x: Q1.x - (8/27)*P0.x - (1/27)*P3.x, y: Q1.y - (8/27)*P0.y - (1/27)*P3.y };
  const B = { x: Q2.x - (1/27)*P0.x - (8/27)*P3.x, y: Q2.y - (1/27)*P0.y - (8/27)*P3.y };
  return [
    { x: 3*A.x - 1.5*B.x, y: 3*A.y - 1.5*B.y },
    { x: 3*B.x - 1.5*A.x, y: 3*B.y - 1.5*A.y },
  ];
}

function closestPointOnSegment(p1: Point, p2: Point, q: Point): Point {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return p1;
  const t = Math.max(0, Math.min(1, ((q.x - p1.x) * dx + (q.y - p1.y) * dy) / lenSq));
  return { x: p1.x + t * dx, y: p1.y + t * dy };
}

function ArrowMarker({ id, color }: { id: string; color: string }) {
  return (
    <marker
      id={id}
      markerWidth={10}
      markerHeight={7}
      refX={9}
      refY={3.5}
      orient="auto"
      overflow="visible"
    >
      <polygon points="0 0, 10 3.5, 0 7" fill={color} />
    </marker>
  );
}

function OpenArrowMarker({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth={10} markerHeight={7} refX={9} refY={3.5} orient="auto" overflow="visible">
      <polyline points="0,0 10,3.5 0,7" fill="none" stroke={color} strokeWidth={1.5} />
    </marker>
  );
}

function OpenArrowMarkerStart({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth={10} markerHeight={7} refX={9} refY={3.5} orient="auto-start-reverse" overflow="visible">
      <polyline points="0,0 10,3.5 0,7" fill="none" stroke={color} strokeWidth={1.5} />
    </marker>
  );
}

// Thinner, shorter open arrowhead for associationBPMN connectors
function OpenArrowMarkerThin({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth={8} markerHeight={5} refX={7} refY={2.5} orient="auto" overflow="visible">
      <polyline points="0,0.5 7,2.5 0,4.5" fill="none" stroke={color} strokeWidth={1} />
    </marker>
  );
}

function OpenArrowMarkerStartThin({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth={8} markerHeight={5} refX={7} refY={2.5} orient="auto-start-reverse" overflow="visible">
      <polyline points="0,0.5 7,2.5 0,4.5" fill="none" stroke={color} strokeWidth={1} />
    </marker>
  );
}

// UML diamond marker (open) — aggregation source end
function UmlDiamondOpen({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth={16} markerHeight={10} refX={1} refY={5} orient="auto" overflow="visible">
      <polygon points="1,5 8,1 15,5 8,9" fill="white" stroke={color} strokeWidth={1.2} strokeLinejoin="miter" />
    </marker>
  );
}

// UML diamond marker (filled) — composition source end
function UmlDiamondFilled({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth={16} markerHeight={10} refX={1} refY={5} orient="auto" overflow="visible">
      <polygon points="1,5 8,1 15,5 8,9" fill={color} stroke={color} strokeWidth={1.2} strokeLinejoin="miter" />
    </marker>
  );
}

// UML open triangle — generalisation source end (points backward toward source element)
function UmlTriangleOpen({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth={14} markerHeight={10} refX={1} refY={5} orient="auto" overflow="visible">
      <polygon points="13,0 1,5 13,10" fill="white" stroke={color} strokeWidth={1.2} strokeLinejoin="miter" />
    </marker>
  );
}

/** Unfilled equilateral triangle (messageBPMN target end) */
function UnfilledTriangleMarker({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth={10} markerHeight={10} refX={8} refY={5} orient="auto" overflow="visible">
      <polygon points="0,0.5 0,9.5 7.8,5" fill="white" stroke={color} strokeWidth={1.5} />
    </marker>
  );
}

/** Small filled circle (messageBPMN source end) */
function CircleMarker({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth={8} markerHeight={8} refX={4} refY={4} orient="auto-start-reverse" overflow="visible">
      <circle cx={4} cy={4} r={3} fill="white" stroke={color} strokeWidth={1.5} />
    </marker>
  );
}

interface InteractionLabelProps {
  connector: Connector;
  selected: boolean;
  visibleWaypoints: Point[];
  svgToWorld?: (clientX: number, clientY: number) => Point;
  onUpdateLabel?: (label: string, offsetX: number, offsetY: number, width: number) => void;
}

function InteractionLabel({ connector, selected, visibleWaypoints, svgToWorld, onUpdateLabel }: InteractionLabelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [isLabelFocused, setIsLabelFocused] = useState(false);
  const fontScale = useContext(ConnectorFontScaleCtx);

  if (visibleWaypoints.length < 2) return null;

  let anchor: Point;
  if (connector.labelAnchor === "source") {
    // Anchor near the source end of the connector
    anchor = visibleWaypoints[0];
  } else if (visibleWaypoints.length === 4) {
    // Cubic bezier (curvilinear / transition connector)
    const [p0, cp1, cp2, p3] = visibleWaypoints;
    anchor = cubicBezierPoint(p0, cp1, cp2, p3, 0.5);
  } else {
    // Straight or rectilinear — midpoint of first and last visible waypoint
    const p0 = visibleWaypoints[0];
    const pN = visibleWaypoints[visibleWaypoints.length - 1];
    anchor = { x: (p0.x + pN.x) / 2, y: (p0.y + pN.y) / 2 };
  }
  const offsetX = connector.labelOffsetX ?? 0;
  const offsetY = connector.labelOffsetY ?? -30;
  const lWidth  = connector.labelWidth ?? 80;
  const label   = connector.label ?? "";
  // Auto-size: measure text width from actual content
  const fontSize = Math.round(10 * fontScale * 10) / 10;
  const avgCharWidth = fontSize * 0.6;
  const rawLines = (label || " ").split('\n');
  const measuredWidth = Math.max(30, ...rawLines.map(l => l.length * avgCharWidth + 12));
  const effectiveLWidth = measuredWidth;
  const lines   = rawLines;
  const lineH   = 14;
  const lHeight = Math.max(lineH, lines.length * lineH);
  const lCx     = anchor.x + offsetX;
  const lTy     = anchor.y + offsetY;
  const lMidY   = lTy + lHeight / 2;

  // Tether attaches at the nearest point on the visible connector to the label centre
  const labelCenter: Point = { x: lCx, y: lMidY };
  let tetherPoint: Point;
  if (visibleWaypoints.length === 4) {
    // Curvilinear bezier — tether from curve midpoint (anchor)
    tetherPoint = anchor;
  } else {
    // Straight or rectilinear: find closest point across all segments
    let bestPoint = visibleWaypoints[0];
    let bestDist = Infinity;
    for (let i = 0; i < visibleWaypoints.length - 1; i++) {
      const pt = closestPointOnSegment(visibleWaypoints[i], visibleWaypoints[i + 1], labelCenter);
      const d = Math.hypot(pt.x - labelCenter.x, pt.y - labelCenter.y);
      if (d < bestDist) { bestDist = d; bestPoint = pt; }
    }
    tetherPoint = bestPoint;
  }

  const hasLabel = label.trim().length > 0;
  if (!hasLabel && !isEditing && connector.labelAnchor !== "source") return null;

  function handleLabelMouseDown(e: React.MouseEvent) {
    if (!svgToWorld || !onUpdateLabel) return;
    e.stopPropagation();
    setIsLabelFocused(true);
    // Clear focus when user clicks elsewhere
    function onWindowMouseDown() {
      setIsLabelFocused(false);
      window.removeEventListener("mousedown", onWindowMouseDown);
    }
    window.addEventListener("mousedown", onWindowMouseDown);

    const startWorld = svgToWorld(e.clientX, e.clientY);
    const startOX = offsetX;
    const startOY = offsetY;
    document.body.style.cursor = "grabbing";

    function onMove(ev: MouseEvent) {
      const cur = svgToWorld!(ev.clientX, ev.clientY);
      onUpdateLabel!(label, startOX + (cur.x - startWorld.x), startOY + (cur.y - startWorld.y), lWidth);
    }
    function onUp() {
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleResizeMouseDown(e: React.MouseEvent) {
    if (!svgToWorld || !onUpdateLabel) return;
    e.stopPropagation();
    const startWorld = svgToWorld(e.clientX, e.clientY);
    const startW = lWidth;
    document.body.style.cursor = "ew-resize";
    function onMove(ev: MouseEvent) {
      const cur = svgToWorld!(ev.clientX, ev.clientY);
      onUpdateLabel!(label, offsetX, offsetY, Math.max(40, startW + (cur.x - startWorld.x) * 2));
    }
    function onUp() {
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation();
    setEditValue(label);
    setIsEditing(true);
  }

  function commitEdit(newText: string) {
    setIsEditing(false);
    onUpdateLabel?.(newText, offsetX, offsetY, lWidth);
  }

  return (
    <g>
      {/* Dotted tether: always visible except when editing — ends at label box boundary */}
      {!isEditing && (() => {
        // Compute intersection of tether line with label box boundary
        const boxL = lCx - effectiveLWidth / 2 - 3;
        const boxR = lCx + effectiveLWidth / 2 + 3;
        const boxT = lTy - 2;
        const boxB = lTy + lHeight + 2;
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
        return (
          <line
            x1={tetherPoint.x} y1={tetherPoint.y} x2={tx} y2={ty}
            stroke="#6b7280" strokeWidth={1} strokeDasharray="4 3"
            style={{ pointerEvents: "none" }}
          />
        );
      })()}
      {/* Hit area + dashed blue highlight when active — transparent fill keeps it clickable */}
      <rect
        x={lCx - effectiveLWidth / 2 - 3} y={lTy - 2}
        width={effectiveLWidth + 6} height={lHeight + 4}
        fill="transparent"
        stroke={(selected || isLabelFocused) ? "#2563eb" : "none"}
        strokeWidth={1} strokeDasharray={(selected || isLabelFocused) ? "4 3" : undefined}
        rx={3}
        style={{ cursor: onUpdateLabel ? "grab" : "default" }}
        onMouseDown={handleLabelMouseDown}
        onDoubleClick={handleDoubleClick}
      />
      {/* Label text (hidden while editing) */}
      {!isEditing && (
        <text textAnchor="middle" fontSize={fontSize} fill="#374151" style={{ pointerEvents: "none", userSelect: "none" }}>
          {lines.map((ln, i) => (
            <tspan key={i} x={lCx} y={lTy + i * lineH + lineH * 0.85}>{ln}</tspan>
          ))}
        </text>
      )}
      {/* Inline textarea — positioned exactly over the label area */}
      {isEditing && (() => {
        const editLines = editValue.split('\n');
        const editMeasured = Math.max(80, ...editLines.map(l => l.length * avgCharWidth + 20));
        const editH = Math.max(28, editLines.length * lineH + 8);
        return (
        <foreignObject x={lCx - editMeasured / 2 - 3} y={lTy} width={editMeasured + 6} height={editH}>
          <textarea
            autoFocus
            value={editValue}
            onFocus={(e) => { const t = e.target; setTimeout(() => { t.setSelectionRange(t.value.length, t.value.length); }, 0); }}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={(e) => commitEdit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setIsEditing(false);
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitEdit(editValue); }
            }}
            style={{
              width: "100%", height: "100%",
              fontSize, fontFamily: "inherit",
              resize: "none", border: "none", outline: "none",
              background: "white", padding: "1px 2px",
              textAlign: "center", lineHeight: "14px",
              boxSizing: "border-box",
            }}
          />
        </foreignObject>
        );
      })()}
      {/* Width resize handle */}
      {(selected || isLabelFocused) && onUpdateLabel && !isEditing && (
        <rect data-interactive
          x={lCx + effectiveLWidth / 2} y={lMidY - 5} width={6} height={10}
          fill="#2563eb" stroke="white" strokeWidth={1} rx={1}
          style={{ cursor: "ew-resize" }}
          onMouseDown={handleResizeMouseDown}
        />
      )}
    </g>
  );
}

export function ConnectorRenderer({ connector, selected, onSelect, svgToWorld, onUpdateWaypoints, onWaypointsDragEnd, onUpdateLabel, onUpdateCurveHandles, misaligned, otherConnectorWaypoints, debugMode, onUpdateEndOffset }: Props) {
  const displayMode = useContext(DisplayModeCtx);
  const connFontScale = useContext(ConnectorFontScaleCtx);
  const [draggingEndLabel, setDraggingEndLabel] = useState<string | null>(null);
  const waypoints = connector.waypoints;
  if (waypoints.length === 0) return null;

  const isMessage = connector.type === "message";
  const isAssocBPMN = connector.type === "associationBPMN";
  const isMessageBPMN = connector.type === "messageBPMN";
  const strokeColor = selected ? "#2563eb"
    : misaligned ? "#dc2626"
    : isMessageBPMN ? "#b0b7c3"
    : "#6b7280";
  const isUmlConn = connector.type === "uml-association" || connector.type === "uml-aggregation"
    || connector.type === "uml-composition" || connector.type === "uml-generalisation";
  const markerId = `arrow-${connector.id}`;
  const openMarkerId = `arrow-open-${connector.id}`;
  const openStartMarkerId = `arrow-open-start-${connector.id}`;
  const umlDiamondId = `uml-diamond-${connector.id}`;
  const umlTriangleId = `uml-triangle-${connector.id}`;
  const showArrow = connector.directionType !== "non-directed";
  const isBothArrow = connector.directionType === "both";
  // associationBPMN always uses open arrowheads (never filled)
  const isOpenArrow = connector.directionType === "open-directed" || isBothArrow ||
    (isAssocBPMN && connector.directionType === "directed");

  // Trim invisible leader segments for visible rendering
  const visStart = connector.sourceInvisibleLeader ? 1 : 0;
  const visEnd = connector.targetInvisibleLeader ? waypoints.length - 2 : waypoints.length - 1;
  const visibleWaypoints = waypoints.slice(visStart, visEnd + 1);

  const visibleD = (() => {
    if ((connector.type === "transition" || connector.type === "flow") && connector.routingType === "curvilinear"
        && visibleWaypoints.length === 4) {
      const [P0, P1, P2, P3] = visibleWaypoints;
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
    if (otherConnectorWaypoints && otherConnectorWaypoints.length > 0
        && (connector.type === "sequence" || connector.type === "association" || connector.type === "uml-association")
        && (connector.routingType === "rectilinear" || connector.routingType === "direct")) {
      const humpPath = pathWithHumps(visibleWaypoints, otherConnectorWaypoints);
      if (humpPath) return humpPath;
    }
    if (connector.routingType === "curvilinear") return waypointsToCurvePath(visibleWaypoints);
    if (connector.routingType === "rectilinear") return waypointsToRoundedPath(visibleWaypoints);
    return waypointsToSvgPath(visibleWaypoints);
  })();

  const fullD = waypointsToSvgPath(waypoints);
  // For curvilinear, use the actual curve for the hit area so clicks near the arc are detected
  const hitD = connector.routingType === "curvilinear" ? visibleD : fullD;

  if (!visibleD) return null;

  // Interior draggable segments for rectilinear connectors:
  // skip first (index 0) and last (index M-2) segments — they connect to element sides
  const M = visibleWaypoints.length;
  const draggableSegments = connector.routingType === "rectilinear" && M >= 4
    ? Array.from({ length: M - 3 }, (_, i) => i + 1)
    : [];

  function handleSegmentMouseDown(e: React.MouseEvent, segIdx: number) {
    e.stopPropagation();
    if (!svgToWorld || !onUpdateWaypoints) return;

    const p1 = visibleWaypoints[segIdx];
    const p2 = visibleWaypoints[segIdx + 1];
    const isHorizontal = Math.abs(p1.y - p2.y) < 1;

    const startWorld = svgToWorld(e.clientX, e.clientY);
    const startCoord = isHorizontal ? p1.y : p1.x;
    const wpi = visStart + segIdx;
    const wpj = visStart + segIdx + 1;
    const initialWaypoints = connector.waypoints.map((p) => ({ ...p }));

    // Capture first/last visible segment directions at drag start to enforce orthogonality
    const seg0Horiz = initialWaypoints.length > visStart + 1 &&
      Math.abs(initialWaypoints[visStart].y - initialWaypoints[visStart + 1].y) < 1;
    const segLastHoriz = initialWaypoints.length > visEnd &&
      Math.abs(initialWaypoints[visEnd - 1].y - initialWaypoints[visEnd].y) < 1;

    function onMove(ev: MouseEvent) {
      const cur = svgToWorld!(ev.clientX, ev.clientY);
      const delta = isHorizontal ? cur.y - startWorld.y : cur.x - startWorld.x;
      const newVal = startCoord + delta;
      const updated = initialWaypoints.map((p, i) => {
        if (i === wpi || i === wpj)
          return isHorizontal ? { ...p, y: newVal } : { ...p, x: newVal };
        return p;
      });

      // Determine whether inserting a bridging corner is needed to keep boundary segments orthogonal.
      // A violation occurs when wpi/wpj is the boundary waypoint AND the drag axis matches
      // the constrained axis of the adjacent fixed segment (srcEdge→exitPt or approachPt→tgtEdge).
      const needStartInsert = wpi === visStart + 1 && (isHorizontal === seg0Horiz);
      const needEndInsert   = wpj === visEnd - 1   && (isHorizontal === segLastHoriz);

      if (!needStartInsert && !needEndInsert) {
        onUpdateWaypoints?.(connector.id, updated);
        return;
      }

      const origExitPt     = { ...initialWaypoints[visStart + 1] };
      const origApproachPt = { ...initialWaypoints[visEnd - 1] };
      // Corner bridges the fixed boundary waypoint to the moved segment
      const startCorner = seg0Horiz
        ? { x: origExitPt.x, y: newVal }
        : { x: newVal, y: origExitPt.y };
      const endCorner = segLastHoriz
        ? { x: origApproachPt.x, y: newVal }
        : { x: newVal, y: origApproachPt.y };

      let finalWaypoints: Point[];
      if (needStartInsert && needEndInsert) {
        // Single segment spanning exitPt→approachPt (M=4)
        finalWaypoints = [
          ...updated.slice(0, wpi), origExitPt, startCorner,
          endCorner, origApproachPt, ...updated.slice(wpj + 1),
        ];
      } else if (needStartInsert) {
        finalWaypoints = [
          ...updated.slice(0, wpi), origExitPt, startCorner,
          ...updated.slice(wpj),
        ];
      } else {
        finalWaypoints = [
          ...updated.slice(0, wpi + 1), endCorner, origApproachPt,
          ...updated.slice(wpj + 1),
        ];
      }
      onUpdateWaypoints?.(connector.id, finalWaypoints);
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      onWaypointsDragEnd?.();
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <>
      {isMessageBPMN ? (
        <defs>
          <UnfilledTriangleMarker id={`msg-end-${connector.id}`}   color={strokeColor} />
          <CircleMarker           id={`msg-start-${connector.id}`} color={strokeColor} />
        </defs>
      ) : isUmlConn ? (
        <defs>
          {connector.type === "uml-association" && showArrow && <OpenArrowMarker id={openMarkerId} color={strokeColor} />}
          {connector.type === "uml-aggregation" && <UmlDiamondOpen id={umlDiamondId} color={strokeColor} />}
          {connector.type === "uml-composition" && <UmlDiamondFilled id={umlDiamondId} color={strokeColor} />}
          {connector.type === "uml-generalisation" && <UmlTriangleOpen id={umlTriangleId} color={strokeColor} />}
        </defs>
      ) : showArrow && (
        <defs>
          {isAssocBPMN
            ? <OpenArrowMarkerThin id={openMarkerId} color={strokeColor} />
            : isOpenArrow
              ? <OpenArrowMarker id={openMarkerId} color={strokeColor} />
              : <ArrowMarker id={markerId} color={strokeColor} />}
          {isBothArrow && (isAssocBPMN
            ? <OpenArrowMarkerStartThin id={openStartMarkerId} color={strokeColor} />
            : <OpenArrowMarkerStart id={openStartMarkerId} color={strokeColor} />)}
        </defs>
      )}

      {/* Invisible wider hit area — follows curve for curvilinear */}
      <path
        d={hitD}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        style={{ cursor: "pointer" }}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      />

      {/* Filtered connector line (hand-drawn wobble) — skip messageBPMN */}
      <g filter={isMessageBPMN ? undefined : sketchyFilter(displayMode)}>
      <path
        d={visibleD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={isAssocBPMN ? (selected ? 2.5 : 2) : (selected ? 2 : 1.5)}
        strokeDasharray={isMessageBPMN ? "10 5" : isAssocBPMN ? "1 7" : (isMessage ? "6 3" : undefined)}
        strokeLinecap={isAssocBPMN ? "round" : undefined}
        markerStart={(displayMode === "hand-drawn" && !isMessageBPMN) ? undefined :
          isMessageBPMN ? `url(#msg-start-${connector.id})`
          : (connector.type === "uml-aggregation" || connector.type === "uml-composition") ? `url(#${umlDiamondId})`
          : connector.type === "uml-generalisation" ? `url(#${umlTriangleId})`
          : isBothArrow ? `url(#${openStartMarkerId})`
          : undefined
        }
        markerEnd={(displayMode === "hand-drawn" && !isMessageBPMN) ? undefined :
          isMessageBPMN ? `url(#msg-end-${connector.id})`
          : connector.type === "uml-association" && showArrow ? `url(#${openMarkerId})`
          : showArrow && !isUmlConn ? `url(#${isOpenArrow ? openMarkerId : markerId})`
          : undefined
        }
        style={{ pointerEvents: "none" }}
      />
      </g>
      {/* Unfiltered arrowheads (crisp in hand-drawn mode) — skip messageBPMN */}
      {displayMode === "hand-drawn" && !isMessageBPMN && (
        <path
          d={visibleD}
          fill="none"
          stroke="transparent"
          strokeWidth={isAssocBPMN ? (selected ? 2.5 : 2) : (selected ? 2 : 1.5)}
          markerStart={
            isMessageBPMN ? `url(#msg-start-${connector.id})`
            : (connector.type === "uml-aggregation" || connector.type === "uml-composition") ? `url(#${umlDiamondId})`
            : connector.type === "uml-generalisation" ? `url(#${umlTriangleId})`
            : isBothArrow ? `url(#${openStartMarkerId})`
            : undefined
          }
          markerEnd={
            isMessageBPMN ? `url(#msg-end-${connector.id})`
            : connector.type === "uml-association" && showArrow ? `url(#${openMarkerId})`
            : showArrow && !isUmlConn ? `url(#${isOpenArrow ? openMarkerId : markerId})`
            : undefined
          }
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Floating connector label */}
      {(connector.type === "transition" || connector.type === "flow" || connector.type === "messageBPMN"
        || (connector.type === "sequence" && connector.label !== undefined)) && (
        <InteractionLabel
          connector={connector}
          selected={selected}
          visibleWaypoints={visibleWaypoints}
          svgToWorld={svgToWorld}
          onUpdateLabel={onUpdateLabel}
        />
      )}

      {/* UML association end annotations (movable) */}
      {(connector.type === "uml-association" || connector.type === "uml-aggregation" ||
        connector.type === "uml-composition") && visibleWaypoints.length >= 2 && (() => {
        const fs = Math.round(10 * connFontScale * 10) / 10;
        const lineH = fs * 1.3;
        const srcPt = visibleWaypoints[0];
        const tgtPt = visibleWaypoints[visibleWaypoints.length - 1];
        const srcNext = visibleWaypoints[1];
        const tgtPrev = visibleWaypoints[visibleWaypoints.length - 2];
        const srcDx = srcNext.x - srcPt.x, srcDy = srcNext.y - srcPt.y;
        const tgtDx = tgtPt.x - tgtPrev.x, tgtDy = tgtPt.y - tgtPrev.y;
        // Default label anchor positions near the edge point
        const defSrcX = srcPt.x + (srcDx !== 0 ? Math.sign(srcDx) * 8 : 0);
        const defSrcY = srcPt.y + (srcDy !== 0 ? Math.sign(srcDy) * 8 : 0);
        const defTgtX = tgtPt.x - (tgtDx !== 0 ? Math.sign(tgtDx) * 8 : 0);
        const defTgtY = tgtPt.y - (tgtDy !== 0 ? Math.sign(tgtDy) * 8 : 0);
        // Perpendicular offsets
        const srcPerpX = Math.abs(srcDy) > Math.abs(srcDx) ? (srcDy > 0 ? -6 : 6) : 0;
        const srcPerpY = Math.abs(srcDx) > Math.abs(srcDy) ? -6 : 0;
        const tgtPerpX = Math.abs(tgtDy) > Math.abs(tgtDx) ? (tgtDy < 0 ? -6 : 6) : 0;
        const tgtPerpY = Math.abs(tgtDx) > Math.abs(tgtDy) ? -6 : 0;

        // Build label groups: role (with visibility), multiplicity, constraint+qualifier
        function buildRole(role?: string, vis?: string): string | null {
          if (role) return vis ? `${vis} ${role}` : role;
          if (vis) return vis;
          return null;
        }
        function buildConstraint(prop?: string, qual?: string): string | null {
          const parts: string[] = [];
          if (prop) parts.push(prop);
          if (qual) parts.push(`[${qual}]`);
          return parts.length > 0 ? parts.join(" ") : null;
        }

        const srcRole = buildRole(connector.sourceRole, connector.sourceVisibility);
        const srcMult = connector.sourceMultiplicity || null;
        const srcConst = buildConstraint(connector.sourcePropertyString, connector.sourceQualifier);
        const tgtRole = buildRole(connector.targetRole, connector.targetVisibility);
        const tgtMult = connector.targetMultiplicity || null;
        const tgtConst = buildConstraint(connector.targetPropertyString, connector.targetQualifier);

        if (!srcRole && !srcMult && !srcConst && !tgtRole && !tgtMult && !tgtConst) return null;

        // Draggable label component
        function EndLabel({ text, anchorX, anchorY, offsetField, offset, anchor, bold }: {
          text: string; anchorX: number; anchorY: number; offsetField: string; offset?: Point; anchor: "start" | "middle" | "end"; bold?: boolean;
        }) {
          const ox = offset?.x ?? 0, oy = offset?.y ?? 0;
          const x = anchorX + ox, y = anchorY + oy;
          function handleMouseDown(e: React.MouseEvent) {
            if (!svgToWorld || !onUpdateEndOffset) return;
            e.stopPropagation();
            const startWorld = svgToWorld(e.clientX, e.clientY);
            const startOx = ox, startOy = oy;
            document.body.style.cursor = "grabbing";
            setDraggingEndLabel(offsetField);
            function onMove(ev: MouseEvent) {
              const cur = svgToWorld!(ev.clientX, ev.clientY);
              onUpdateEndOffset!(connector.id, offsetField, {
                x: startOx + cur.x - startWorld.x,
                y: startOy + cur.y - startWorld.y,
              });
            }
            function onUp() {
              document.body.style.cursor = "";
              setDraggingEndLabel(null);
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
            }
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }
          const isDragging = draggingEndLabel === offsetField;
          return (
            <g>
              {isDragging && (
                <line x1={anchorX} y1={anchorY} x2={x} y2={y}
                  stroke="#9ca3af" strokeWidth={0.7} strokeDasharray="3 2"
                  style={{ pointerEvents: "none" }} />
              )}
              <text textAnchor={anchor} fontSize={fs} fill="#374151"
                x={x} y={y} fontWeight={bold ? "bold" : "normal"}
                style={{ cursor: onUpdateEndOffset ? "grab" : "default", userSelect: "none" }}
                onMouseDown={handleMouseDown}>
                {text}
              </text>
            </g>
          );
        }

        const srcAnchor: "start" | "middle" | "end" = srcDx > 0 ? "start" : srcDx < 0 ? "end" : "middle";
        const tgtAnchor: "start" | "middle" | "end" = tgtDx > 0 ? "end" : tgtDx < 0 ? "start" : "middle";

        return (
          <g>
            {/* Source end labels */}
            {srcRole && <EndLabel text={srcRole}
              anchorX={defSrcX + srcPerpX} anchorY={defSrcY + srcPerpY}
              offsetField="sourceRoleOffset" offset={connector.sourceRoleOffset} anchor={srcAnchor} />}
            {srcMult && <EndLabel text={srcMult} bold
              anchorX={defSrcX + srcPerpX} anchorY={defSrcY + srcPerpY + lineH}
              offsetField="sourceMultOffset" offset={connector.sourceMultOffset} anchor={srcAnchor} />}
            {srcConst && <EndLabel text={srcConst}
              anchorX={defSrcX + srcPerpX} anchorY={defSrcY + srcPerpY + lineH * 2}
              offsetField="sourceConstraintOffset" offset={connector.sourceConstraintOffset} anchor={srcAnchor} />}
            {/* Target end labels */}
            {tgtRole && <EndLabel text={tgtRole}
              anchorX={defTgtX + tgtPerpX} anchorY={defTgtY + tgtPerpY}
              offsetField="targetRoleOffset" offset={connector.targetRoleOffset} anchor={tgtAnchor} />}
            {tgtMult && <EndLabel text={tgtMult} bold
              anchorX={defTgtX + tgtPerpX} anchorY={defTgtY + tgtPerpY + lineH}
              offsetField="targetMultOffset" offset={connector.targetMultOffset} anchor={tgtAnchor} />}
            {tgtConst && <EndLabel text={tgtConst}
              anchorX={defTgtX + tgtPerpX} anchorY={defTgtY + tgtPerpY + lineH * 2}
              offsetField="targetConstraintOffset" offset={connector.targetConstraintOffset} anchor={tgtAnchor} />}
          </g>
        );
      })()}

      {/* UML association name with reading direction arrow */}
      {(connector.type === "uml-association" || connector.type === "uml-aggregation" ||
        connector.type === "uml-composition") && connector.associationName && visibleWaypoints.length >= 2 && (() => {
        const fs = Math.round(10 * connFontScale * 10) / 10;
        const nameOx = connector.associationNameOffset?.x ?? 0;
        const nameOy = connector.associationNameOffset?.y ?? 0;

        // Find the midpoint of the visible path
        let totalLen = 0;
        const segLens: number[] = [];
        for (let i = 0; i < visibleWaypoints.length - 1; i++) {
          const dx = visibleWaypoints[i + 1].x - visibleWaypoints[i].x;
          const dy = visibleWaypoints[i + 1].y - visibleWaypoints[i].y;
          const len = Math.hypot(dx, dy);
          segLens.push(len);
          totalLen += len;
        }
        let half = totalLen / 2;
        let midX = visibleWaypoints[0].x, midY = visibleWaypoints[0].y;
        let segDirX = 0, segDirY = 0;
        for (let i = 0; i < segLens.length; i++) {
          if (half <= segLens[i] || i === segLens.length - 1) {
            const t = segLens[i] > 0 ? half / segLens[i] : 0;
            midX = visibleWaypoints[i].x + t * (visibleWaypoints[i + 1].x - visibleWaypoints[i].x);
            midY = visibleWaypoints[i].y + t * (visibleWaypoints[i + 1].y - visibleWaypoints[i].y);
            segDirX = visibleWaypoints[i + 1].x - visibleWaypoints[i].x;
            segDirY = visibleWaypoints[i + 1].y - visibleWaypoints[i].y;
            break;
          }
          half -= segLens[i];
        }

        // Normalize segment direction
        const segLen = Math.hypot(segDirX, segDirY);
        const ux = segLen > 0 ? segDirX / segLen : 1;
        const uy = segLen > 0 ? segDirY / segLen : 0;

        const labelX = midX + nameOx;
        const labelY = midY + nameOy - 6; // offset above the connector

        const name = connector.associationName;
        const charW = fs * 0.6;
        const nameW = name.length * charW;
        const readDir = connector.readingDirection ?? "none";

        // Arrow positioning: height matches lowercase x-height, centred vertically with text
        const xHeight = fs * 0.5; // approximate lowercase letter height
        const arrowH = xHeight;   // arrow height = x-height
        const arrowW = arrowH * 0.8; // arrow width proportional to height
        const toTarget = readDir === "to-target";
        const toSource = readDir === "to-source";
        // Arrow placed just beyond the text, vertically centred with text middle
        const arrowOff = nameW / 2 + arrowW + 3;
        // Text baseline is at labelY; x-height region is labelY-xHeight to labelY
        // Vertical centre of text = labelY - xHeight/2
        const arrowMidY = labelY - xHeight / 2;

        const isDragging = draggingEndLabel === "associationNameOffset";

        function handleNameMouseDown(e: React.MouseEvent) {
          if (!svgToWorld || !onUpdateEndOffset) return;
          e.stopPropagation();
          const startWorld = svgToWorld(e.clientX, e.clientY);
          const startOx = nameOx, startOy = nameOy;
          document.body.style.cursor = "grabbing";
          setDraggingEndLabel("associationNameOffset");
          function onMove(ev: MouseEvent) {
            const cur = svgToWorld!(ev.clientX, ev.clientY);
            onUpdateEndOffset!(connector.id, "associationNameOffset", {
              x: startOx + cur.x - startWorld.x,
              y: startOy + cur.y - startWorld.y,
            });
          }
          function onUp() {
            document.body.style.cursor = "";
            setDraggingEndLabel(null);
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          }
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }

        return (
          <g>
            {/* Tether line while dragging */}
            {isDragging && (
              <line x1={midX} y1={midY} x2={labelX} y2={labelY}
                stroke="#9ca3af" strokeWidth={0.7} strokeDasharray="3 2"
                style={{ pointerEvents: "none" }} />
            )}
            {/* Name text */}
            <text textAnchor="middle" fontSize={fs} fill="#374151" fontStyle="italic"
              x={labelX} y={labelY}
              style={{ cursor: onUpdateEndOffset ? "grab" : "default", userSelect: "none" }}
              onMouseDown={handleNameMouseDown}>
              {name}
            </text>
            {/* Reading direction arrow — height matches lowercase, centred with text */}
            {toTarget && (
              <polygon
                points={`${labelX + arrowOff - arrowW},${arrowMidY - arrowH / 2} ${labelX + arrowOff},${arrowMidY} ${labelX + arrowOff - arrowW},${arrowMidY + arrowH / 2}`}
                fill="#374151" style={{ pointerEvents: "none" }}
              />
            )}
            {toSource && (
              <polygon
                points={`${labelX - arrowOff + arrowW},${arrowMidY - arrowH / 2} ${labelX - arrowOff},${arrowMidY} ${labelX - arrowOff + arrowW},${arrowMidY + arrowH / 2}`}
                fill="#374151" style={{ pointerEvents: "none" }}
              />
            )}
          </g>
        );
      })()}

      {/* Curvature handles for selected transition connectors (state machine) */}
      {selected && (connector.type === "transition" || connector.type === "flow") && connector.routingType === "curvilinear"
       && visibleWaypoints.length === 4 && onUpdateCurveHandles && svgToWorld && (() => {
        const [P0, P1, P2, P3] = visibleWaypoints;
        const srcEdge = waypoints[1];
        const tgtEdge = waypoints[waypoints.length - 2];
        const STUB = 4;
        const u1 = sideNormal(connector.sourceSide);
        const u2 = sideNormal(connector.targetSide);
        const s1 = { x: srcEdge.x + STUB * u1.x, y: srcEdge.y + STUB * u1.y };
        const s2 = { x: tgtEdge.x + STUB * u2.x, y: tgtEdge.y + STUB * u2.y };
        const H1 = cubicBezierPoint(s1, P1, P2, s2, 1/3);
        const H2 = cubicBezierPoint(s1, P1, P2, s2, 2/3);

        const makeHandleDrag = (whichHandle: 1 | 2) => (e: React.MouseEvent) => {
          e.stopPropagation();
          const currentH1 = H1;
          const currentH2 = H2;
          function onMove(me: MouseEvent) {
            const cur = svgToWorld!(me.clientX, me.clientY);
            const Q1 = whichHandle === 1 ? cur : currentH1;
            const Q2 = whichHandle === 2 ? cur : currentH2;
            const [newP1, newP2] = inverseBezierCPs(s1, s2, Q1, Q2);
            const newWaypoints = [
              waypoints[0], srcEdge, newP1, newP2, tgtEdge, waypoints[waypoints.length - 1],
            ];
            onUpdateCurveHandles!(
              connector.id,
              newWaypoints,
              { x: newP1.x - srcEdge.x, y: newP1.y - srcEdge.y },
              { x: newP2.x - tgtEdge.x, y: newP2.y - tgtEdge.y },
            );
          }
          function onUp() {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          }
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        };

        return (
          <g key="curve-handles" data-interactive>
            <line x1={s1.x} y1={s1.y} x2={H1.x} y2={H1.y}
              stroke="#93c5fd" strokeWidth={1} strokeDasharray="3 2" pointerEvents="none" />
            <line x1={s2.x} y1={s2.y} x2={H2.x} y2={H2.y}
              stroke="#93c5fd" strokeWidth={1} strokeDasharray="3 2" pointerEvents="none" />
            <circle cx={H1.x} cy={H1.y} r={6}
              fill="white" stroke="#2563eb" strokeWidth={1.5}
              style={{ cursor: "grab" }}
              onMouseDown={makeHandleDrag(1)} />
            <circle cx={H2.x} cy={H2.y} r={6}
              fill="white" stroke="#2563eb" strokeWidth={1.5}
              style={{ cursor: "grab" }}
              onMouseDown={makeHandleDrag(2)} />
          </g>
        );
      })()}

      {/* Segment drag handles (rectilinear, selected, interior segments only) */}
      {selected && draggableSegments.map((segIdx) => {
        const p1 = visibleWaypoints[segIdx];
        const p2 = visibleWaypoints[segIdx + 1];
        const isHorizontal = Math.abs(p1.y - p2.y) < 1;
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const hitW = isHorizontal ? Math.abs(p2.x - p1.x) * 0.6 : 12;
        const hitH = isHorizontal ? 12 : Math.abs(p2.y - p1.y) * 0.6;
        return (
          <g key={segIdx} data-interactive>
            <rect
              x={mx - hitW / 2} y={my - hitH / 2}
              width={hitW} height={hitH}
              fill="transparent"
              style={{ cursor: isHorizontal ? "ns-resize" : "ew-resize" }}
              onMouseDown={(e) => handleSegmentMouseDown(e, segIdx)}
            />
            <circle
              cx={mx} cy={my} r={4}
              fill="#2563eb" stroke="white" strokeWidth={1.5}
              style={{ pointerEvents: "none" }}
            />
          </g>
        );
      })}

      {/* Waypoint vertex dots (debug mode only) */}
      {selected && debugMode && visibleWaypoints.map((pt, i) => (
        <circle
          key={`wp-${i}`}
          cx={pt.x} cy={pt.y} r={3}
          fill="#ef4444" stroke="white" strokeWidth={1}
          style={{ pointerEvents: "none" }}
        />
      ))}
    </>
  );
}
