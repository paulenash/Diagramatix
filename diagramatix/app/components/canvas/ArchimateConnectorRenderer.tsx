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

interface Props {
  connector: Connector;
  selected: boolean;
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
// Diamond markers used as marker-END: refX=15 places the right tip at
// the target boundary so the diamond sits just before the element with
// its point touching the edge.
function MarkerDiamondFilled({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth={16} markerHeight={10} refX={15} refY={5} orient="auto" overflow="visible">
      <polygon points="1,5 8,1 15,5 8,9" fill={color} stroke={color} strokeWidth={1.2} strokeLinejoin="miter" />
    </marker>
  );
}
function MarkerDiamondOpen({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth={16} markerHeight={10} refX={15} refY={5} orient="auto" overflow="visible">
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
// Style resolution per type. Dash patterns + markers + routing hints.
// ────────────────────────────────────────────────────────────────────
type MarkerKind = "arrow-filled" | "arrow-open" | "triangle-open" | "diamond-filled" | "diamond-open" | "circle-filled";

interface Style {
  dash?: string;
  strokeColor: string;
  startMarker: MarkerKind | null;
  endMarker: MarkerKind | null;
  strokeWidth: number;
  label?: string; // small overlay label (e.g., "+" for influence) — future use
}

function styleFor(type: ArchimateConnectorType, selected: boolean): Style {
  const color = selected ? "#2563eb" : "#333333";
  const base: Style = { strokeColor: color, startMarker: null, endMarker: null, strokeWidth: selected ? 1.8 : 1.4 };
  switch (type) {
    // Structural — diamond sits at the target (whole) end
    case "archi-composition":
      return { ...base, startMarker: null, endMarker: "diamond-filled" };
    case "archi-aggregation":
      return { ...base, startMarker: null, endMarker: "diamond-open" };
    case "archi-assignment":
      return { ...base, startMarker: "circle-filled", endMarker: "arrow-filled" };
    case "archi-realisation":
      return { ...base, endMarker: "triangle-open", dash: "5 3" };
    // Dependency
    case "archi-serving":
      return { ...base, endMarker: "arrow-open" };
    case "archi-access":
      return { ...base, endMarker: "arrow-open", dash: "2 3" };
    case "archi-influence":
      return { ...base, endMarker: "arrow-open", dash: "2 3" };
    case "archi-association":
      return { ...base, endMarker: null };
    // Dynamic
    case "archi-triggering":
      return { ...base, endMarker: "arrow-filled", dash: "6 3" };
    case "archi-flow":
      return { ...base, endMarker: "arrow-open", dash: "8 3 2 3" };
    // Other
    case "archi-specialisation":
      return { ...base, endMarker: "triangle-open" };
  }
}

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
  connector, selected, onSelect,
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

      {/* wider transparent hit area */}
      <path
        d={visibleD}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        style={{ cursor: "pointer" }}
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

      {/* interior segment drag handles for rectilinear */}
      {draggableSegments.map((segIdx) => {
        const p1 = visibleWaypoints[segIdx];
        const p2 = visibleWaypoints[segIdx + 1];
        const isHoriz = Math.abs(p1.y - p2.y) < 1;
        return (
          <line
            key={segIdx}
            x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
            stroke="transparent"
            strokeWidth={10}
            style={{ cursor: isHoriz ? "ns-resize" : "ew-resize" }}
            onMouseDown={(e) => handleSegmentMouseDown(e, segIdx)}
          />
        );
      })}

      {/* label — minimal: show text; double-click to edit when handler provided */}
      {labelText && !isEditingLabel && (
        <g transform={`translate(${labelCx}, ${labelCy})`} style={{ pointerEvents: "auto", cursor: onUpdateLabel ? "text" : "default" }}
          onDoubleClick={(e) => {
            if (!onUpdateLabel) return;
            e.stopPropagation();
            setEditVal(labelText);
            setIsEditingLabel(true);
          }}
        >
          <rect x={-40} y={-8} width={80} height={16} fill="white" opacity={0.85} />
          <text textAnchor="middle" dominantBaseline="middle" fontSize={10 * fontScale} fill={style.strokeColor}>
            {labelText}
          </text>
        </g>
      )}
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
