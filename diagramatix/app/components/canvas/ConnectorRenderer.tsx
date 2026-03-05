"use client";

import type { Connector } from "@/app/lib/diagram/types";
import { waypointsToSvgPath } from "@/app/lib/diagram/routing";

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

export function ConnectorRenderer({ connector, selected, onSelect }: Props) {
  const waypoints = connector.waypoints;
  if (waypoints.length === 0) return null;

  const isMessage = connector.type === "message";
  const strokeColor = selected ? "#2563eb" : "#6b7280";
  const markerId = `arrow-${connector.id}`;
  const showArrow = connector.directionType === "directed";

  // Slice waypoints to hide invisible leader segments
  const visStart = connector.sourceInvisibleLeader ? 1 : 0;
  const visEnd = connector.targetInvisibleLeader ? waypoints.length - 2 : waypoints.length - 1;
  const visibleWaypoints = waypoints.slice(visStart, visEnd + 1);
  const visibleD = waypointsToSvgPath(visibleWaypoints);
  // Full path for hit area (so you can click near the invisible portion too)
  const fullD = waypointsToSvgPath(waypoints);

  if (!visibleD) return null;

  return (
    <>
      {showArrow && (
        <defs>
          <ArrowMarker id={markerId} color={strokeColor} />
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
        markerEnd={showArrow ? `url(#${markerId})` : undefined}
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
            x={lx}
            y={ly - 6}
            textAnchor="middle"
            fontSize={10}
            fill="#374151"
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {connector.label}
          </text>
        );
      })()}
    </>
  );
}
