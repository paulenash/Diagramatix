"use client";

import type { Connector } from "@/app/lib/diagram/types";
import { waypointsToSvgPath, waypointsToCurvePath } from "@/app/lib/diagram/routing";

interface Props {
  connector: Connector;
  selected: boolean;
  onSelect: () => void;
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

export function ConnectorRenderer({ connector, selected, onSelect }: Props) {
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
    </>
  );
}
