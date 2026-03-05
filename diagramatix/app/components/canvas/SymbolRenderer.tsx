"use client";

import type { DiagramElement, Point, Side } from "@/app/lib/diagram/types";

interface Props {
  element: DiagramElement;
  selected: boolean;
  isDropTarget: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onDoubleClick: () => void;
  onConnectionPointDragStart: (side: Side, worldPos: Point) => void;
  showConnectionPoints: boolean;
}

const CONNECTION_POINT_SIDES: Side[] = ["top", "right", "bottom", "left"];

function getConnectionPointPos(
  el: DiagramElement,
  side: Side
): { cx: number; cy: number } {
  switch (side) {
    case "top":
      return { cx: el.x + el.width / 2, cy: el.y };
    case "right":
      return { cx: el.x + el.width, cy: el.y + el.height / 2 };
    case "bottom":
      return { cx: el.x + el.width / 2, cy: el.y + el.height };
    case "left":
      return { cx: el.x, cy: el.y + el.height / 2 };
  }
}

function TaskShape({ el }: { el: DiagramElement }) {
  return (
    <rect
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      rx={4}
      ry={4}
      fill="white"
      stroke="#374151"
      strokeWidth={1.5}
    />
  );
}

function GatewayShape({ el }: { el: DiagramElement }) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const points = `${cx},${el.y} ${el.x + el.width},${cy} ${cx},${el.y + el.height} ${el.x},${cy}`;
  return (
    <polygon
      points={points}
      fill="white"
      stroke="#374151"
      strokeWidth={1.5}
    />
  );
}

function StartEventShape({ el }: { el: DiagramElement }) {
  return (
    <circle
      cx={el.x + el.width / 2}
      cy={el.y + el.height / 2}
      r={el.width / 2}
      fill="white"
      stroke="#16a34a"
      strokeWidth={2}
    />
  );
}

function EndEventShape({ el }: { el: DiagramElement }) {
  return (
    <circle
      cx={el.x + el.width / 2}
      cy={el.y + el.height / 2}
      r={el.width / 2}
      fill="white"
      stroke="#dc2626"
      strokeWidth={3}
    />
  );
}

function UseCaseShape({ el }: { el: DiagramElement }) {
  return (
    <ellipse
      cx={el.x + el.width / 2}
      cy={el.y + el.height / 2}
      rx={el.width / 2}
      ry={el.height / 2}
      fill="white"
      stroke="#374151"
      strokeWidth={1.5}
    />
  );
}

// Reusable stick figure. cx = centre-x, top = y of top of head.
function StickFigure({
  cx,
  top,
  headR = 8,
  bodyLen = 16,
  armHalfSpan = 18,
  legSpread = 16,
  legLen = 20,
}: {
  cx: number;
  top: number;
  headR?: number;
  bodyLen?: number;
  armHalfSpan?: number;
  legSpread?: number;
  legLen?: number;
}) {
  const headCy = top + headR;
  const bodyTop = headCy + headR;
  const bodyBot = bodyTop + bodyLen;
  const armY = bodyTop + bodyLen * 0.5;
  return (
    <g>
      <circle cx={cx} cy={headCy} r={headR} fill="white" stroke="#374151" strokeWidth={1.5} />
      <line x1={cx} y1={bodyTop} x2={cx} y2={bodyBot} stroke="#374151" strokeWidth={1.5} />
      <line x1={cx - armHalfSpan} y1={armY} x2={cx + armHalfSpan} y2={armY} stroke="#374151" strokeWidth={1.5} />
      <line x1={cx} y1={bodyBot} x2={cx - legSpread} y2={bodyBot + legLen} stroke="#374151" strokeWidth={1.5} />
      <line x1={cx} y1={bodyBot} x2={cx + legSpread} y2={bodyBot + legLen} stroke="#374151" strokeWidth={1.5} />
    </g>
  );
}

function ActorShape({ el }: { el: DiagramElement }) {
  const headR = 8;
  const bodyLen = 16;
  // Remaining height after head (headR*2) + body + 2px top margin → legs fill the rest
  const legLen = el.height - 2 - headR * 2 - bodyLen - 4;
  return (
    <StickFigure
      cx={el.x + el.width / 2}
      top={el.y + 2}
      headR={headR}
      bodyLen={bodyLen}
      armHalfSpan={el.width / 2 - 4}
      legSpread={el.width / 2 - 6}
      legLen={Math.max(legLen, 8)}
    />
  );
}

function TeamShape({ el }: { el: DiagramElement }) {
  const cx = el.x + el.width / 2;
  const top = el.y + 4;
  return (
    <g>
      {/* Left figure */}
      <StickFigure cx={cx - 40} top={top + 12} headR={6} bodyLen={12} armHalfSpan={12} legSpread={10} legLen={14} />
      {/* Right figure */}
      <StickFigure cx={cx + 40} top={top + 12} headR={6} bodyLen={12} armHalfSpan={12} legSpread={10} legLen={14} />
      {/* Central figure */}
      <StickFigure cx={cx} top={top} headR={7} bodyLen={14} armHalfSpan={14} legSpread={12} legLen={16} />
    </g>
  );
}

function StateShape({ el }: { el: DiagramElement }) {
  return (
    <rect
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      rx={12}
      ry={12}
      fill="white"
      stroke="#374151"
      strokeWidth={1.5}
    />
  );
}

function InitialStateShape({ el }: { el: DiagramElement }) {
  return (
    <circle
      cx={el.x + el.width / 2}
      cy={el.y + el.height / 2}
      r={el.width / 2}
      fill="#374151"
    />
  );
}

function FinalStateShape({ el }: { el: DiagramElement }) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const r = el.width / 2;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="white" stroke="#374151" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={r - 5} fill="#374151" />
    </g>
  );
}

function SymbolShape({ el }: { el: DiagramElement }) {
  switch (el.type) {
    case "gateway": return <GatewayShape el={el} />;
    case "start-event": return <StartEventShape el={el} />;
    case "end-event": return <EndEventShape el={el} />;
    case "use-case": return <UseCaseShape el={el} />;
    case "actor": return <ActorShape el={el} />;
    case "team": return <TeamShape el={el} />;
    case "state": return <StateShape el={el} />;
    case "initial-state": return <InitialStateShape el={el} />;
    case "final-state": return <FinalStateShape el={el} />;
    default: return <TaskShape el={el} />;
  }
}

function getLabelPos(el: DiagramElement): { x: number; y: number } {
  if (el.type === "actor" || el.type === "team") {
    return { x: el.x + el.width / 2, y: el.y + el.height + 12 };
  }
  return { x: el.x + el.width / 2, y: el.y + el.height / 2 };
}

export function SymbolRenderer({
  element,
  selected,
  isDropTarget,
  onSelect,
  onMove,
  onDoubleClick,
  onConnectionPointDragStart,
  showConnectionPoints,
}: Props) {
  let dragStart: { mouseX: number; mouseY: number; elX: number; elY: number } | null = null;

  function handleMouseDown(e: React.MouseEvent) {
    e.stopPropagation();
    onSelect();
    dragStart = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      elX: element.x,
      elY: element.y,
    };

    function onMouseMove(ev: MouseEvent) {
      if (!dragStart) return;
      const dx = ev.clientX - dragStart.mouseX;
      const dy = ev.clientY - dragStart.mouseY;
      onMove(dragStart.elX + dx, dragStart.elY + dy);
    }

    function onMouseUp() {
      dragStart = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  const labelPos = getLabelPos(element);
  const isActorOrTeam = element.type === "actor" || element.type === "team";

  return (
    <g
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
      style={{ cursor: "move" }}
    >
      <SymbolShape el={element} />

      {element.type !== "initial-state" && !isActorOrTeam && (
        <text
          x={labelPos.x}
          y={labelPos.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={12}
          fill="#111827"
          style={{ userSelect: "none", pointerEvents: "none" }}
        >
          {element.label}
        </text>
      )}

      {isActorOrTeam && (
        <text
          x={labelPos.x}
          y={labelPos.y}
          textAnchor="middle"
          dominantBaseline="hanging"
          fontSize={11}
          fill="#111827"
          style={{ userSelect: "none", pointerEvents: "none" }}
        >
          {element.label}
        </text>
      )}

      {/* Selection outline */}
      {selected && (
        <rect
          x={element.x - 3}
          y={element.y - 3}
          width={element.width + 6}
          height={element.height + 6}
          fill="none"
          stroke="#2563eb"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          rx={4}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Drop target highlight */}
      {isDropTarget && (
        <rect
          x={element.x - 4}
          y={element.y - 4}
          width={element.width + 8}
          height={element.height + 8}
          fill="none"
          stroke="#16a34a"
          strokeWidth={2}
          rx={6}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Connection points — on bounding rect edges; drag anchors at center for actor/team */}
      {showConnectionPoints &&
        CONNECTION_POINT_SIDES.map((side) => {
          const pos = getConnectionPointPos(element, side);
          const dragWorldPos: Point = isActorOrTeam
            ? { x: element.x + element.width / 2, y: element.y + element.height / 2 }
            : { x: pos.cx, y: pos.cy };
          return (
            <circle
              key={side}
              cx={pos.cx}
              cy={pos.cy}
              r={5}
              fill="#2563eb"
              stroke="white"
              strokeWidth={1.5}
              style={{ cursor: "crosshair" }}
              onMouseDown={(e) => {
                e.stopPropagation();
                onConnectionPointDragStart(side, dragWorldPos);
              }}
            />
          );
        })}
    </g>
  );
}
