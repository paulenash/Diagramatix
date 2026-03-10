"use client";

import { useState } from "react";
import type { Connector, Point } from "@/app/lib/diagram/types";
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
    >
      <polygon points="0 0, 10 3.5, 0 7" fill={color} />
    </marker>
  );
}

function OpenArrowMarker({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth={10} markerHeight={7} refX={9} refY={3.5} orient="auto">
      <polyline points="0,0 10,3.5 0,7" fill="none" stroke={color} strokeWidth={1.5} />
    </marker>
  );
}

function OpenArrowMarkerStart({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth={10} markerHeight={7} refX={9} refY={3.5} orient="auto-start-reverse">
      <polyline points="0,0 10,3.5 0,7" fill="none" stroke={color} strokeWidth={1.5} />
    </marker>
  );
}

// Thinner, shorter open arrowhead for associationBPMN connectors
function OpenArrowMarkerThin({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth={8} markerHeight={5} refX={7} refY={2.5} orient="auto">
      <polyline points="0,0.5 7,2.5 0,4.5" fill="none" stroke={color} strokeWidth={1} />
    </marker>
  );
}

function OpenArrowMarkerStartThin({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth={8} markerHeight={5} refX={7} refY={2.5} orient="auto-start-reverse">
      <polyline points="0,0.5 7,2.5 0,4.5" fill="none" stroke={color} strokeWidth={1} />
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
    <marker id={id} markerWidth={8} markerHeight={8} refX={4} refY={4} orient="auto-start-reverse">
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

  if (visibleWaypoints.length < 2) return null;

  let anchor: Point;
  if (visibleWaypoints.length === 4) {
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
  const effectiveLWidth = lWidth;
  const lines   = wrapText(label || " ", effectiveLWidth);
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
  if (!hasLabel && !isEditing) return null;

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
      {/* Dotted tether: only visible when connector is selected or label is being moved */}
      {(selected || isLabelFocused) && (
        <line
          x1={tetherPoint.x} y1={tetherPoint.y} x2={lCx} y2={lMidY}
          stroke="#6b7280" strokeWidth={1} strokeDasharray="4 3"
          style={{ pointerEvents: "none" }}
        />
      )}
      {/* Hit area + dashed blue highlight when active — transparent fill keeps it clickable */}
      <rect
        x={lCx - effectiveLWidth / 2 - 5} y={lTy - 2}
        width={effectiveLWidth + 25} height={lHeight + 4}
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
        <text textAnchor="middle" fontSize={10} fill="#374151" style={{ pointerEvents: "none", userSelect: "none" }}>
          {lines.map((ln, i) => (
            <tspan key={i} x={lCx} y={lTy + i * lineH + lineH * 0.85}>{ln}</tspan>
          ))}
        </text>
      )}
      {/* Inline textarea — positioned exactly over the label area */}
      {isEditing && (
        <foreignObject x={lCx - effectiveLWidth / 2 - 5} y={lTy} width={effectiveLWidth + 25} height={Math.max(lHeight, 28)}>
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
              fontSize: 10, fontFamily: "inherit",
              resize: "none", border: "none", outline: "none",
              background: "white", padding: "1px 2px",
              textAlign: "center", lineHeight: "14px",
              boxSizing: "border-box",
            }}
          />
        </foreignObject>
      )}
      {/* Width resize handle */}
      {(selected || isLabelFocused) && onUpdateLabel && (
        <rect
          x={lCx + effectiveLWidth / 2 - 3} y={lMidY - 5} width={6} height={10}
          fill="#2563eb" stroke="white" strokeWidth={1} rx={1}
          style={{ cursor: "ew-resize" }}
          onMouseDown={handleResizeMouseDown}
        />
      )}
    </g>
  );
}

export function ConnectorRenderer({ connector, selected, onSelect, svgToWorld, onUpdateWaypoints, onWaypointsDragEnd, onUpdateLabel, onUpdateCurveHandles, misaligned }: Props) {
  const waypoints = connector.waypoints;
  if (waypoints.length === 0) return null;

  const isMessage = connector.type === "message";
  const isAssocBPMN = connector.type === "associationBPMN";
  const isMessageBPMN = connector.type === "messageBPMN";
  const strokeColor = selected ? "#2563eb"
    : (isMessageBPMN && misaligned) ? "#dc2626"
    : isMessageBPMN ? "#b0b7c3"
    : "#6b7280";
  const markerId = `arrow-${connector.id}`;
  const openMarkerId = `arrow-open-${connector.id}`;
  const openStartMarkerId = `arrow-open-start-${connector.id}`;
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
    if (connector.type === "transition" && connector.routingType === "curvilinear"
        && visibleWaypoints.length === 4) {
      const [P0, P1, P2, P3] = visibleWaypoints;
      const STUB = 4;
      const u1 = sideNormal(connector.sourceSide);
      const u2 = sideNormal(connector.targetSide);
      const s1 = { x: P0.x + STUB * u1.x, y: P0.y + STUB * u1.y };
      const s2 = { x: P3.x + STUB * u2.x, y: P3.y + STUB * u2.y };
      return `M ${P0.x} ${P0.y} L ${s1.x} ${s1.y} C ${P1.x} ${P1.y}, ${P2.x} ${P2.y}, ${s2.x} ${s2.y} L ${P3.x} ${P3.y}`;
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

      <path
        d={visibleD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={isAssocBPMN ? (selected ? 2.5 : 2) : (selected ? 2 : 1.5)}
        strokeDasharray={isMessageBPMN ? "10 5" : isAssocBPMN ? "1 7" : (isMessage ? "6 3" : undefined)}
        strokeLinecap={isAssocBPMN ? "round" : undefined}
        markerStart={isMessageBPMN ? `url(#msg-start-${connector.id})` : isBothArrow ? `url(#${openStartMarkerId})` : undefined}
        markerEnd={isMessageBPMN ? `url(#msg-end-${connector.id})` : showArrow ? `url(#${isOpenArrow ? openMarkerId : markerId})` : undefined}
        style={{ pointerEvents: "none" }}
      />

      {/* Floating transition label */}
      {(connector.type === "transition" || connector.type === "messageBPMN") && (
        <InteractionLabel
          connector={connector}
          selected={selected}
          visibleWaypoints={visibleWaypoints}
          svgToWorld={svgToWorld}
          onUpdateLabel={onUpdateLabel}
        />
      )}

      {/* Curvature handles for selected transition connectors (state machine) */}
      {selected && connector.type === "transition" && connector.routingType === "curvilinear"
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
          <g key="curve-handles">
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
          <g key={segIdx}>
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
    </>
  );
}
