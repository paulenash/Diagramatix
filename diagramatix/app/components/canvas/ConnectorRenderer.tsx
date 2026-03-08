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
  onUpdateLabel?: (label: string, offsetX: number, offsetY: number, width: number) => void;
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

  if (visibleWaypoints.length !== 4) return null;

  const [p0, cp1, cp2, p3] = visibleWaypoints;
  const anchor = cubicBezierPoint(p0, cp1, cp2, p3, 0.5);
  const offsetX = connector.labelOffsetX ?? 0;
  const offsetY = connector.labelOffsetY ?? -30;
  const lWidth  = connector.labelWidth ?? 80;
  const label   = connector.label ?? "";
  const lines   = wrapText(label || " ", lWidth);
  const lineH   = 14;
  const lHeight = Math.max(lineH, lines.length * lineH);
  const lCx     = anchor.x + offsetX;
  const lTy     = anchor.y + offsetY;
  const lMidY   = lTy + lHeight / 2;

  const hasLabel = label.trim().length > 0;
  if (!hasLabel && !isEditing) return null;

  function handleLabelMouseDown(e: React.MouseEvent) {
    if (!svgToWorld || !onUpdateLabel) return;
    e.stopPropagation();
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
      {/* Dotted tether: curve midpoint → label centre */}
      <line
        x1={anchor.x} y1={anchor.y} x2={lCx} y2={lMidY}
        stroke="#6b7280" strokeWidth={1} strokeDasharray="4 3"
        style={{ pointerEvents: "none" }}
      />
      {/* Label background — no border, just white fill */}
      <rect
        x={lCx - lWidth / 2} y={lTy} width={lWidth} height={lHeight}
        fill="white" fillOpacity={0.9}
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
        <foreignObject x={lCx - lWidth / 2} y={lTy} width={lWidth} height={Math.max(lHeight, 28)}>
          <textarea
            autoFocus
            value={editValue}
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
      {/* Width resize handle (visible when selected) */}
      {selected && onUpdateLabel && (
        <rect
          x={lCx + lWidth / 2 - 3} y={lMidY - 5} width={6} height={10}
          fill="#2563eb" stroke="white" strokeWidth={1} rx={1}
          style={{ cursor: "ew-resize" }}
          onMouseDown={handleResizeMouseDown}
        />
      )}
    </g>
  );
}

export function ConnectorRenderer({ connector, selected, onSelect, svgToWorld, onUpdateWaypoints, onUpdateLabel }: Props) {
  const waypoints = connector.waypoints;
  if (waypoints.length === 0) return null;

  const isMessage = connector.type === "message";
  const isAssocBPMN = connector.type === "associationBPMN";
  const strokeColor = selected ? "#2563eb" : "#6b7280";
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

  const visibleD = connector.routingType === "curvilinear"
    ? waypointsToCurvePath(visibleWaypoints)
    : connector.routingType === "rectilinear"
      ? waypointsToRoundedPath(visibleWaypoints)
      : waypointsToSvgPath(visibleWaypoints);

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
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <>
      {showArrow && (
        <defs>
          {isOpenArrow
            ? <OpenArrowMarker id={openMarkerId} color={strokeColor} />
            : <ArrowMarker id={markerId} color={strokeColor} />}
          {isBothArrow && <OpenArrowMarkerStart id={openStartMarkerId} color={strokeColor} />}
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
        strokeDasharray={isAssocBPMN ? "1 7" : (isMessage ? "6 3" : undefined)}
        strokeLinecap={isAssocBPMN ? "round" : undefined}
        markerStart={isBothArrow ? `url(#${openStartMarkerId})` : undefined}
        markerEnd={showArrow ? `url(#${isOpenArrow ? openMarkerId : markerId})` : undefined}
        style={{ pointerEvents: "none" }}
      />

      {/* Floating interaction label */}
      {connector.type === "interaction" && (
        <InteractionLabel
          connector={connector}
          selected={selected}
          visibleWaypoints={visibleWaypoints}
          svgToWorld={svgToWorld}
          onUpdateLabel={onUpdateLabel}
        />
      )}

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
