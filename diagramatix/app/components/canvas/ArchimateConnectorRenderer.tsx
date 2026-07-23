"use client";

/**
 * Independent renderer for ArchiMate relationship connectors.
 *
 * Fully decoupled from ConnectorRenderer.tsx — ArchiMate visuals (markers,
 * dash patterns, endpoint decorations) are owned here so the BPMN/Domain
 * renderer can evolve independently.
 *
 * Handles types:
 *   Structural  — composition, aggregation, assignment, realisation
 *   Dependency  — serving, access, influence, association
 *   Dynamic     — triggering, flow
 *   Other       — specialisation
 *
 * Also exports ArchimateConnectorPreview for the connector-type picker.
 */

import { useContext, useState } from "react";
import type { ArchimateConnectorType, Connector, Point } from "@/app/lib/diagram/types";
import { DisplayModeCtx, ConnectorFontScaleCtx, sketchyFilter } from "@/app/lib/diagram/displayMode";
import { waypointsToSvgPath, waypointsToRoundedPath } from "@/app/lib/diagram/routing";
import {
  styleFor,
  ARCHI_REL_NAME,
  type ArchimateMarkerKind as MarkerKind,
  type ArchimateStyle as Style,
} from "@/app/lib/diagram/archimateConnectorStyle";

interface Props {
  connector: Connector;
  selected: boolean;
  /** Lit by the tree-traversal highlight — shows the relationship-type name. */
  highlight?: boolean;
  onSelect: () => void;
  svgToWorld?: (clientX: number, clientY: number) => Point;
  onUpdateWaypoints?: (id: string, waypoints: Point[]) => void;
  onWaypointsDragEnd?: () => void;
  onUpdateLabel?: (label: string, offsetX: number, offsetY: number, width: number) => void;
}

// ────────────────────────────────────────────────────────────────────
// Marker defs — authored independently of ConnectorRenderer. Do not
// import the BPMN/UML marker components here; keep visuals siloed so
// one set can evolve without affecting the other.
// ────────────────────────────────────────────────────────────────────
function MarkerArrowFilled({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth={10} markerHeight={8} refX={9} refY={4} orient="auto" overflow="visible">
      <polygon points="0 0, 10 4, 0 8" fill={color} />
    </marker>
  );
}
function MarkerArrowOpen({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth={10} markerHeight={8} refX={9} refY={4} orient="auto" overflow="visible">
      <polyline points="0,0 10,4 0,8" fill="none" stroke={color} strokeWidth={1.5} />
    </marker>
  );
}
// Diamond markers used as marker-START (the ArchiMate "whole" end sits at the
// SOURCE per the 3.x spec). orient="auto" points the marker's +x along the path
// (toward the target); refX=1 places the diamond's left tip on the source
// boundary so the body extends outward along the line, away from the element.
function MarkerDiamondFilled({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth={16} markerHeight={10} refX={1} refY={5} orient="auto" overflow="visible">
      <polygon points="1,5 8,1 15,5 8,9" fill={color} stroke={color} strokeWidth={1.2} strokeLinejoin="miter" />
    </marker>
  );
}
function MarkerDiamondOpen({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth={16} markerHeight={10} refX={1} refY={5} orient="auto" overflow="visible">
      <polygon points="1,5 8,1 15,5 8,9" fill="white" stroke={color} strokeWidth={1.2} strokeLinejoin="miter" />
    </marker>
  );
}
function MarkerTriangleOpen({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth={14} markerHeight={10} refX={13} refY={5} orient="auto" overflow="visible">
      <polygon points="1,0 13,5 1,10" fill="white" stroke={color} strokeWidth={1.2} strokeLinejoin="miter" />
    </marker>
  );
}
function MarkerCircleFilled({ id, color }: { id: string; color: string }) {
  // orient="auto" (NOT auto-start-reverse) so the marker's local +x
  // points along the path direction — i.e. TOWARD the target, which is
  // away from the source element's interior. With refX=1 the circle's
  // left edge sits exactly on the source boundary and the rest of the
  // disc extends outward into free space.
  return (
    <marker id={id} markerWidth={8} markerHeight={8} refX={1} refY={4} orient="auto" overflow="visible">
      <circle cx={4} cy={4} r={3} fill={color} stroke={color} strokeWidth={1} />
    </marker>
  );
}

// ────────────────────────────────────────────────────────────────────
// Style resolution per type lives in app/lib/diagram/archimateConnectorStyle
// (pure + unit-tested). The renderer just renders what styleFor returns.
// ────────────────────────────────────────────────────────────────────
function renderMarker(kind: Style["startMarker"] | Style["endMarker"], id: string, color: string) {
  switch (kind) {
    case "arrow-filled":    return <MarkerArrowFilled id={id} color={color} />;
    case "arrow-open":      return <MarkerArrowOpen id={id} color={color} />;
    case "diamond-filled":  return <MarkerDiamondFilled id={id} color={color} />;
    case "diamond-open":    return <MarkerDiamondOpen id={id} color={color} />;
    case "triangle-open":   return <MarkerTriangleOpen id={id} color={color} />;
    case "circle-filled":   return <MarkerCircleFilled id={id} color={color} />;
    default: return null;
  }
}

export function isArchimateConnectorType(t: string): t is ArchimateConnectorType {
  return t.startsWith("archi-");
}

// ────────────────────────────────────────────────────────────────────
// Main renderer
// ────────────────────────────────────────────────────────────────────
export function ArchimateConnectorRenderer({
  connector, selected, highlight, onSelect,
  svgToWorld, onUpdateWaypoints, onWaypointsDragEnd,
  onUpdateLabel,
}: Props) {
  const displayMode = useContext(DisplayModeCtx);
  const fontScale = useContext(ConnectorFontScaleCtx);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [editVal, setEditVal] = useState("");

  const waypoints = connector.waypoints;
  if (waypoints.length < 2) return null;

  const archiType = connector.type as ArchimateConnectorType;
  const style = styleFor(archiType, selected);

  // Trim invisible leader segments for visible rendering (same convention
  // as the shared connector but re-implemented here to stay independent).
  const visStart = connector.sourceInvisibleLeader ? 1 : 0;
  const visEnd = connector.targetInvisibleLeader ? waypoints.length - 2 : waypoints.length - 1;
  const visibleWaypoints = waypoints.slice(visStart, visEnd + 1);
  if (visibleWaypoints.length < 2) return null;

  const visibleD =
    connector.routingType === "rectilinear"
      ? waypointsToRoundedPath(visibleWaypoints)
      : waypointsToSvgPath(visibleWaypoints);

  const startMarkerId = `am-start-${connector.id}`;
  const endMarkerId = `am-end-${connector.id}`;

  // Rectilinear interior segment dragging — independent copy.
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
    const initial = connector.waypoints.map((p) => ({ ...p }));
    function onMove(ev: MouseEvent) {
      const cur = svgToWorld!(ev.clientX, ev.clientY);
      const delta = isHorizontal ? cur.y - startWorld.y : cur.x - startWorld.x;
      const newVal = startCoord + delta;
      const updated = initial.map((p, i) =>
        i === wpi || i === wpj
          ? (isHorizontal ? { ...p, y: newVal } : { ...p, x: newVal })
          : p
      );
      onUpdateWaypoints?.(connector.id, updated);
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      onWaypointsDragEnd?.();
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Label anchor: midpoint of visible path.
  const midIdx = Math.floor((visibleWaypoints.length - 1) / 2);
  const a = visibleWaypoints[midIdx];
  const b = visibleWaypoints[midIdx + 1] ?? a;
  const labelCx = (a.x + b.x) / 2 + (connector.labelOffsetX ?? 0);
  const labelCy = (a.y + b.y) / 2 + (connector.labelOffsetY ?? 0);
  const labelText = connector.label ?? "";

  return (
    <>
      <defs>
        {style.startMarker && renderMarker(style.startMarker, startMarkerId, style.strokeColor)}
        {style.endMarker && renderMarker(style.endMarker, endMarkerId, style.strokeColor)}
      </defs>

      {/* Wider transparent hit area — any click within ~9px of the line
          selects the connector. onMouseDown stopPropagation prevents the
          Canvas background mousedown handler from running (it installs a
          window-level mouseup that clears the selection), so the click
          reliably lands on the connector — same approach as BPMN. */}
      <path
        d={visibleD}
        fill="none"
        stroke="transparent"
        strokeWidth={18}
        strokeLinecap="round"
        style={{ cursor: "pointer" }}
        onMouseDown={(e) => { e.stopPropagation(); }}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      />

      {/* visible line */}
      <g filter={sketchyFilter(displayMode)}>
        <path
          d={visibleD}
          fill="none"
          stroke={style.strokeColor}
          strokeWidth={style.strokeWidth}
          strokeDasharray={style.dash}
          markerStart={style.startMarker ? `url(#${startMarkerId})` : undefined}
          markerEnd={style.endMarker ? `url(#${endMarkerId})` : undefined}
          style={{ pointerEvents: "none" }}
        />
      </g>

      {/* Interior segment drag handles for rectilinear — ONLY when selected.
          Rendered unconditionally these transparent 10px-wide handles sit on
          top of the hit area and swallow the selection click (they have no
          onClick→onSelect), making the connector feel unselectable and its
          endpoints immovable. BPMN gates these the same way. */}
      {selected && draggableSegments.map((segIdx) => {
        const p1 = visibleWaypoints[segIdx];
        const p2 = visibleWaypoints[segIdx + 1];
        const isHoriz = Math.abs(p1.y - p2.y) < 1;
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        return (
          <g key={segIdx}>
            <line
              x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke="transparent"
              strokeWidth={10}
              style={{ cursor: isHoriz ? "ns-resize" : "ew-resize" }}
              onMouseDown={(e) => handleSegmentMouseDown(e, segIdx)}
            />
            {/* Visible mid-segment handle, matching BPMN sequence connectors. */}
            <circle
              cx={mx} cy={my} r={4}
              fill="#2563eb" stroke="white" strokeWidth={1.5}
              style={{ cursor: isHoriz ? "ns-resize" : "ew-resize" }}
              onMouseDown={(e) => handleSegmentMouseDown(e, segIdx)}
            />
          </g>
        );
      })}

      {/* Relationship-type name (Serving, Assignment, …) — shown ONLY when the
          connector is highlighted (via the tree traversal) or selected. */}
      {(highlight || selected) && !isEditingLabel && (() => {
        const relName = ARCHI_REL_NAME[archiType] ?? "";
        if (!relName) return null;
        const relW = relName.length * 6 + 12;
        // Nudge above the user label if one is also showing, so they don't collide.
        const dy = labelText ? -18 : 0;
        return (
          <g transform={`translate(${labelCx}, ${labelCy + dy})`} style={{ pointerEvents: "none" }}>
            <rect x={-relW / 2} y={-8} width={relW} height={16} rx={3} fill="white" opacity={0.9} stroke={style.strokeColor} strokeWidth={0.5} />
            <text textAnchor="middle" dominantBaseline="middle" fontSize={9 * fontScale} fontStyle="italic" fill={style.strokeColor}>
              {relName}
            </text>
          </g>
        );
      })()}

      {/* label — minimal: show text; double-click to edit when handler provided.
          For an Influence relationship the label IS the strength marker
          (+/++/+++ or -/--/---); render it 3× larger so the sense/level reads
          clearly on the connector. */}
      {labelText && !isEditingLabel && (() => {
        const isInfluence = archiType === "archi-influence";
        const fs = (isInfluence ? 30 : 10) * fontScale;
        const halfW = isInfluence ? Math.max(18, labelText.length * fs * 0.34) : 40;
        const halfH = isInfluence ? fs * 0.62 : 8;
        return (
        <g transform={`translate(${labelCx}, ${labelCy})`} style={{ pointerEvents: "auto", cursor: onUpdateLabel ? "text" : "default" }}
          onDoubleClick={(e) => {
            if (!onUpdateLabel) return;
            e.stopPropagation();
            setEditVal(labelText);
            setIsEditingLabel(true);
          }}
        >
          <rect x={-halfW} y={-halfH} width={halfW * 2} height={halfH * 2} fill="white" opacity={0.85} />
          <text textAnchor="middle" dominantBaseline="middle" fontSize={fs} fontWeight={isInfluence ? 700 : undefined} fill={style.strokeColor}>
            {labelText}
          </text>
        </g>
        );
      })()}
      {isEditingLabel && onUpdateLabel && (
        <foreignObject x={labelCx - 50} y={labelCy - 10} width={100} height={20}>
          <input
            autoFocus
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onBlur={() => {
              onUpdateLabel(editVal, connector.labelOffsetX ?? 0, connector.labelOffsetY ?? 0, connector.labelWidth ?? 80);
              setIsEditingLabel(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
              else if (e.key === "Escape") { setIsEditingLabel(false); }
            }}
            style={{ width: "100%", fontSize: 10 * fontScale, border: "1px solid #2563eb", padding: "1px 3px", textAlign: "center" }}
          />
        </foreignObject>
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Preview glyph — used by the picker. Draws a single horizontal line
// with the type's markers and dash pattern, fit to (width, height).
// ────────────────────────────────────────────────────────────────────
export function ArchimateConnectorPreview({
  type, width, height,
}: { type: ArchimateConnectorType; width: number; height: number }) {
  const style = styleFor(type, false);
  const y = height / 2;
  const margin = 6;
  const x1 = margin;
  const x2 = width - margin;
  const idSuffix = `prev-${type}`;
  const startId = `am-prev-start-${type}`;
  const endId = `am-prev-end-${type}`;
  return (
    <>
      <defs>
        {style.startMarker && renderMarker(style.startMarker, startId, style.strokeColor)}
        {style.endMarker && renderMarker(style.endMarker, endId, style.strokeColor)}
      </defs>
      <line
        x1={x1} y1={y} x2={x2} y2={y}
        stroke={style.strokeColor}
        strokeWidth={style.strokeWidth}
        strokeDasharray={style.dash}
        markerStart={style.startMarker ? `url(#${startId})` : undefined}
        markerEnd={style.endMarker ? `url(#${endId})` : undefined}
      />
    </>
  );
}
