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
  const d = waypointsToSvgPath(connector.waypoints);
  if (!d) return null;

  const isMessage = connector.type === "message";
  const strokeColor = selected ? "#2563eb" : "#6b7280";
  const markerId = `arrow-${connector.id}`;

  return (
    <>
      <defs>
        <ArrowMarker id={markerId} color={strokeColor} />
      </defs>

      {/* Invisible wider hit area for easier selection */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        style={{ cursor: "pointer" }}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      />

      <path
        d={d}
        fill="none"
        stroke={strokeColor}
        strokeWidth={selected ? 2 : 1.5}
        strokeDasharray={isMessage ? "6 3" : undefined}
        markerEnd={`url(#${markerId})`}
        style={{ pointerEvents: "none" }}
      />

      {connector.label && connector.waypoints.length >= 2 && (() => {
        const mid = Math.floor(connector.waypoints.length / 2);
        const p1 = connector.waypoints[mid - 1];
        const p2 = connector.waypoints[mid];
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
