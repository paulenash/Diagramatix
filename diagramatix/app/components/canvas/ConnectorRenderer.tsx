"use client";

import type { Connector, Point } from "@/app/lib/diagram/types";
import { waypointsToSvgPath, waypointsToCurvePath } from "@/app/lib/diagram/routing";

interface Props {
  connector: Connector;
  selected: boolean;
  onSelect: () => void;
  svgToWorld?: (clientX: number, clientY: number) => Point;
  onUpdateWaypoints?: (id: string, waypoints: Point[]) => void;
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

export function ConnectorRenderer({ connector, selected, onSelect, svgToWorld, onUpdateWaypoints }: Props) {
  const waypoints = connector.waypoints;
  if (waypoints.length === 0) return null;

  const isMessage = connector.type === "message";
  const strokeColor = selected ? "#2563eb" : "#6b7280";
  const markerId = `arrow-${connector.id}`;
  const openMarkerId = `arrow-open-${connector.id}`;
  const openStartMarkerId = `arrow-open-start-${connector.id}`;
  const showArrow = connector.directionType !== "non-directed";
  const isBothArrow = connector.directionType === "both";
  const isOpenArrow = connector.directionType === "open-directed" || isBothArrow;

  // Trim invisible leader segments for visible rendering
  const visStart = connector.sourceInvisibleLeader ? 1 : 0;
  const visEnd = connector.targetInvisibleLeader ? waypoints.length - 2 : waypoints.length - 1;
  const visibleWaypoints = waypoints.slice(visStart, visEnd + 1);

  const visibleD = connector.routingType === "curvilinear"
    ? waypointsToCurvePath(visibleWaypoints)
    : waypointsToSvgPath(visibleWaypoints);

  const fullD = waypointsToSvgPath(waypoints); // hit area always uses straight lines

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

      {/* Invisible wider hit area */}
      <path
        d={fullD}
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
        strokeWidth={selected ? 2 : 1.5}
        strokeDasharray={isMessage ? "6 3" : undefined}
        markerStart={isBothArrow ? `url(#${openStartMarkerId})` : undefined}
        markerEnd={showArrow ? `url(#${isOpenArrow ? openMarkerId : markerId})` : undefined}
        style={{ pointerEvents: "none" }}
      />

      {connector.label && visibleWaypoints.length >= 2 && (() => {
        const mid = Math.floor(visibleWaypoints.length / 2);
        const p1 = visibleWaypoints[mid - 1];
        const p2 = visibleWaypoints[mid];
        const lx = (p1.x + p2.x) / 2;
        const ly = (p1.y + p2.y) / 2;
        return (
          <text
            x={lx} y={ly - 6}
            textAnchor="middle" fontSize={10} fill="#374151"
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {connector.label}
          </text>
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
