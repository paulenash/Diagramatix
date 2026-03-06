"use client";

import type { DiagramElement, Point, Side } from "@/app/lib/diagram/types";

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface Props {
  element: DiagramElement;
  selected: boolean;
  isDropTarget: boolean;
  isDisallowedTarget?: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onDoubleClick: () => void;
  onConnectionPointDragStart: (side: Side, worldPos: Point) => void;
  showConnectionPoints: boolean;
  onResizeDragStart?: (handle: ResizeHandle, e: React.MouseEvent) => void;
  svgToWorld?: (clientX: number, clientY: number) => Point;
  shouldSnapBack?: (x: number, y: number) => boolean;
}

function wrapText(text: string, maxWidth: number, fontSize = 12): string[] {
  const avgCharWidth = fontSize * 0.55;
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

const CONNECTION_POINT_SIDES: Side[] = ["top", "right", "bottom", "left"];

const HEADER_H = 28;

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

function getClosestSideFromPoint(pt: Point, el: DiagramElement): Side {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const dx = pt.x - cx;
  const dy = pt.y - cy;
  const normX = Math.abs(dx) / (el.width / 2 || 1);
  const normY = Math.abs(dy) / (el.height / 2 || 1);
  if (normX > normY) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
}

function TaskShape({ el }: { el: DiagramElement }) {
  return (
    <rect
      x={el.x} y={el.y} width={el.width} height={el.height}
      rx={4} ry={4} fill="white" stroke="#374151" strokeWidth={1.5}
    />
  );
}

function GatewayShape({ el }: { el: DiagramElement }) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const points = `${cx},${el.y} ${el.x + el.width},${cy} ${cx},${el.y + el.height} ${el.x},${cy}`;
  return <polygon points={points} fill="white" stroke="#374151" strokeWidth={1.5} />;
}

function StartEventShape({ el }: { el: DiagramElement }) {
  return (
    <circle cx={el.x + el.width / 2} cy={el.y + el.height / 2} r={el.width / 2}
      fill="white" stroke="#16a34a" strokeWidth={2} />
  );
}

function EndEventShape({ el }: { el: DiagramElement }) {
  return (
    <circle cx={el.x + el.width / 2} cy={el.y + el.height / 2} r={el.width / 2}
      fill="white" stroke="#dc2626" strokeWidth={3} />
  );
}

function UseCaseShape({ el }: { el: DiagramElement }) {
  return (
    <ellipse
      cx={el.x + el.width / 2} cy={el.y + el.height / 2}
      rx={el.width / 2} ry={el.height / 2}
      fill="#fef9c3" stroke="#374151" strokeWidth={1.5}
    />
  );
}

function HourglassShape({ el }: { el: DiagramElement }) {
  const { x, y, width: w, height: h } = el;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const points = `${x},${y} ${x + w},${y} ${cx},${cy} ${x + w},${y + h} ${x},${y + h} ${cx},${cy}`;
  return <polygon points={points} fill="white" stroke="#374151" strokeWidth={1.5} />;
}

function SystemBoundaryShape({ el }: { el: DiagramElement }) {
  return (
    <g>
      {/* Outer rect with light blue fill */}
      <rect x={el.x} y={el.y} width={el.width} height={el.height}
        fill="rgba(219,234,254,0.3)" stroke="#374151" strokeWidth={1.5} rx={2} />
      {/* Header fill */}
      <rect x={el.x} y={el.y} width={el.width} height={HEADER_H}
        fill="#dbeafe" stroke="none" rx={2} />
      {/* Clip bottom corners of header fill */}
      <rect x={el.x} y={el.y + HEADER_H - 2} width={el.width} height={2} fill="#dbeafe" />
      {/* Header bottom border */}
      <line x1={el.x} y1={el.y + HEADER_H} x2={el.x + el.width} y2={el.y + HEADER_H}
        stroke="#374151" strokeWidth={1} />
    </g>
  );
}

function CompositeStateShape({ el }: { el: DiagramElement }) {
  return (
    <g>
      {/* Outer rounded rect with light lavender fill */}
      <rect x={el.x} y={el.y} width={el.width} height={el.height}
        fill="rgba(237,233,254,0.4)" stroke="#374151" strokeWidth={1.5} rx={12} />
      {/* Header fill */}
      <rect x={el.x} y={el.y} width={el.width} height={HEADER_H}
        fill="#ede9fe" stroke="none" rx={12} />
      {/* Clip bottom corners of header fill */}
      <rect x={el.x} y={el.y + HEADER_H - 2} width={el.width} height={2} fill="#ede9fe" />
      {/* Header bottom border */}
      <line x1={el.x} y1={el.y + HEADER_H} x2={el.x + el.width} y2={el.y + HEADER_H}
        stroke="#374151" strokeWidth={1} />
    </g>
  );
}

// Reusable stick figure
function StickFigure({
  cx, top, headR = 8, bodyLen = 16, armHalfSpan = 18, legSpread = 16, legLen = 12,
}: {
  cx: number; top: number; headR?: number; bodyLen?: number;
  armHalfSpan?: number; legSpread?: number; legLen?: number;
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
  const headR = 10;
  const bodyLen = 16;
  return (
    <StickFigure
      cx={el.x + el.width / 2}
      top={el.y + 2}
      headR={headR}
      bodyLen={bodyLen}
      armHalfSpan={el.width / 2 - 4}
      legSpread={el.width / 2 - 6}
      legLen={12}
    />
  );
}

function TeamShape({ el }: { el: DiagramElement }) {
  const cx = el.x + el.width / 2;
  const top = el.y + 4;
  return (
    <g>
      <StickFigure cx={cx - 30} top={top} headR={6} bodyLen={10} armHalfSpan={14} legSpread={12} legLen={8} />
      <StickFigure cx={cx + 30} top={top} headR={6} bodyLen={10} armHalfSpan={14} legSpread={12} legLen={8} />
      <StickFigure cx={cx}      top={top} headR={9} bodyLen={14} armHalfSpan={14} legSpread={12} legLen={12} />
    </g>
  );
}

function SystemShape({ el }: { el: DiagramElement }) {
  const lineAreaEnd = el.y + el.height / 3;
  const lineSpacing = (lineAreaEnd - el.y - 8) / 2;
  const midY = el.y + 8 + lineSpacing;
  const gap = lineSpacing / 2;
  return (
    <g>
      <rect x={el.x} y={el.y} width={el.width} height={el.height} rx={3} fill="white" stroke="#374151" strokeWidth={1.5} />
      <line x1={el.x + 4} y1={midY - gap} x2={el.x + el.width - 4} y2={midY - gap} stroke="#374151" strokeWidth={1.5} />
      <line x1={el.x + 4} y1={midY}       x2={el.x + el.width - 4} y2={midY}       stroke="#374151" strokeWidth={1.5} />
      <line x1={el.x + 4} y1={midY + gap} x2={el.x + el.width - 4} y2={midY + gap} stroke="#374151" strokeWidth={1.5} />
    </g>
  );
}

function StateShape({ el }: { el: DiagramElement }) {
  return (
    <rect x={el.x} y={el.y} width={el.width} height={el.height}
      rx={12} ry={12} fill="white" stroke="#374151" strokeWidth={1.5} />
  );
}

function InitialStateShape({ el }: { el: DiagramElement }) {
  return (
    <circle cx={el.x + el.width / 2} cy={el.y + el.height / 2} r={el.width / 2} fill="#374151" />
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

function BpmnTaskMarker({ type, x, y }: { type: string; x: number; y: number }) {
  const cx = x + 7;
  const cy = y + 7;
  switch (type) {
    case "task-user":
      return (
        <g>
          <circle cx={cx} cy={y + 4.5} r={2.8} fill="white" stroke="#374151" strokeWidth={1.2} />
          <path d={`M${x + 1} ${y + 14} C${x + 1} ${y + 9} ${x + 13} ${y + 9} ${x + 13} ${y + 14}`}
            fill="white" stroke="#374151" strokeWidth={1.2} strokeLinejoin="round" />
        </g>
      );
    case "task-service": {
      const outerR = 6, innerR = 4.5, holeR = 2.2, teeth = 8;
      const pts: string[] = [];
      for (let i = 0; i < teeth; i++) {
        const base = (i / teeth) * Math.PI * 2;
        const span = (Math.PI / teeth) * 0.55;
        pts.push(`${cx + outerR * Math.cos(base - span)},${cy + outerR * Math.sin(base - span)}`);
        pts.push(`${cx + outerR * Math.cos(base + span)},${cy + outerR * Math.sin(base + span)}`);
        const gap = base + Math.PI / teeth;
        pts.push(`${cx + innerR * Math.cos(gap)},${cy + innerR * Math.sin(gap)}`);
      }
      return (
        <g>
          <polygon points={pts.join(" ")} fill="white" stroke="#374151" strokeWidth={1.2} />
          <circle cx={cx} cy={cy} r={holeR} fill="white" stroke="#374151" strokeWidth={1.2} />
        </g>
      );
    }
    case "task-script":
      return (
        <g>
          <rect x={x + 2} y={y + 1} width={10} height={12} rx={1} fill="white" stroke="#374151" strokeWidth={1.2} />
          <line x1={x + 4} y1={y + 4}  x2={x + 10} y2={y + 4}  stroke="#374151" strokeWidth={1} />
          <line x1={x + 4} y1={y + 7}  x2={x + 10} y2={y + 7}  stroke="#374151" strokeWidth={1} />
          <line x1={x + 4} y1={y + 10} x2={x + 10} y2={y + 10} stroke="#374151" strokeWidth={1} />
        </g>
      );
    case "task-send":
      return (
        <g>
          <rect x={x + 1} y={y + 3} width={12} height={8} rx={1} fill="#374151" stroke="#374151" strokeWidth={1} />
          <polyline points={`${x + 1},${y + 3} ${cx},${y + 8} ${x + 13},${y + 3}`}
            fill="none" stroke="white" strokeWidth={1.2} />
        </g>
      );
    case "task-receive":
      return (
        <g>
          <rect x={x + 1} y={y + 3} width={12} height={8} rx={1} fill="white" stroke="#374151" strokeWidth={1.2} />
          <polyline points={`${x + 1},${y + 3} ${cx},${y + 8} ${x + 13},${y + 3}`}
            fill="none" stroke="#374151" strokeWidth={1.2} />
        </g>
      );
    case "task-manual":
      return (
        <g>
          <rect x={x + 2}   y={y + 7}  width={8}   height={6}   rx={1}    fill="white" stroke="#374151" strokeWidth={1.2} />
          <rect x={x + 3}   y={y + 2}  width={1.6} height={5.5} rx={0.8}  fill="white" stroke="#374151" strokeWidth={1} />
          <rect x={x + 5.2} y={y + 1}  width={1.6} height={6.5} rx={0.8}  fill="white" stroke="#374151" strokeWidth={1} />
          <rect x={x + 7.4} y={y + 2}  width={1.6} height={5.5} rx={0.8}  fill="white" stroke="#374151" strokeWidth={1} />
          <rect x={x + 9.6} y={y + 3}  width={1.4} height={4.5} rx={0.7}  fill="white" stroke="#374151" strokeWidth={1} />
          <rect x={x + 1}   y={y + 8}  width={1.4} height={3.5} rx={0.7}  fill="white" stroke="#374151" strokeWidth={1} />
        </g>
      );
    case "task-business-rule":
      return (
        <g>
          <rect x={x + 1} y={y + 1} width={12} height={12} rx={1} fill="white" stroke="#374151" strokeWidth={1.2} />
          <rect x={x + 1} y={y + 1} width={12} height={4}  fill="#e5e7eb" />
          <rect x={x + 1} y={y + 3} width={12} height={2}  fill="#e5e7eb" />
          <line x1={x + 1} y1={y + 5} x2={x + 13} y2={y + 5} stroke="#374151" strokeWidth={1} />
          <line x1={x + 6} y1={y + 1} x2={x + 6}  y2={y + 13} stroke="#374151" strokeWidth={1} />
        </g>
      );
    default: return null;
  }
}

function BpmnTaskShape({ el }: { el: DiagramElement }) {
  return (
    <g>
      <rect x={el.x} y={el.y} width={el.width} height={el.height}
        rx={4} ry={4} fill="white" stroke="#374151" strokeWidth={1.5} />
      <BpmnTaskMarker type={el.type} x={el.x + 4} y={el.y + 4} />
    </g>
  );
}

function SymbolShape({ el }: { el: DiagramElement }) {
  switch (el.type) {
    case "gateway":        return <GatewayShape el={el} />;
    case "start-event":   return <StartEventShape el={el} />;
    case "end-event":     return <EndEventShape el={el} />;
    case "use-case":      return <UseCaseShape el={el} />;
    case "hourglass":     return <HourglassShape el={el} />;
    case "actor":         return <ActorShape el={el} />;
    case "team":          return <TeamShape el={el} />;
    case "state":         return <StateShape el={el} />;
    case "initial-state": return <InitialStateShape el={el} />;
    case "final-state":   return <FinalStateShape el={el} />;
    case "system-boundary":   return <SystemBoundaryShape el={el} />;
    case "composite-state":   return <CompositeStateShape el={el} />;
    case "system":            return <SystemShape el={el} />;
    case "task-user":
    case "task-service":
    case "task-script":
    case "task-send":
    case "task-receive":
    case "task-manual":
    case "task-business-rule": return <BpmnTaskShape el={el} />;
    default:                  return <TaskShape el={el} />;
  }
}

function getLabelPos(el: DiagramElement): { x: number; y: number; baseline: "hanging" | "middle" | "auto" } {
  if (el.type === "actor" || el.type === "team" || el.type === "hourglass" || el.type === "system") {
    return { x: el.x + el.width / 2, y: el.y + el.height + 12, baseline: "hanging" };
  }
  if (el.type === "system-boundary" || el.type === "composite-state") {
    return { x: el.x + el.width / 2, y: el.y + HEADER_H / 2, baseline: "middle" };
  }
  return { x: el.x + el.width / 2, y: el.y + el.height / 2, baseline: "middle" };
}

const RESIZE_HANDLES: { handle: ResizeHandle; cursor: string }[] = [
  { handle: "nw", cursor: "nw-resize" },
  { handle: "n",  cursor: "ns-resize" },
  { handle: "ne", cursor: "ne-resize" },
  { handle: "e",  cursor: "ew-resize" },
  { handle: "se", cursor: "se-resize" },
  { handle: "s",  cursor: "ns-resize" },
  { handle: "sw", cursor: "sw-resize" },
  { handle: "w",  cursor: "ew-resize" },
];

function getHandlePos(handle: ResizeHandle, el: DiagramElement): { hx: number; hy: number } {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  switch (handle) {
    case "nw": return { hx: el.x,          hy: el.y };
    case "n":  return { hx: cx,             hy: el.y };
    case "ne": return { hx: el.x + el.width, hy: el.y };
    case "e":  return { hx: el.x + el.width, hy: cy };
    case "se": return { hx: el.x + el.width, hy: el.y + el.height };
    case "s":  return { hx: cx,             hy: el.y + el.height };
    case "sw": return { hx: el.x,          hy: el.y + el.height };
    case "w":  return { hx: el.x,          hy: cy };
  }
}

export function SymbolRenderer({
  element,
  selected,
  isDropTarget,
  isDisallowedTarget,
  onSelect,
  onMove,
  onDoubleClick,
  onConnectionPointDragStart,
  showConnectionPoints,
  onResizeDragStart,
  svgToWorld,
  shouldSnapBack,
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
    let lastX = element.x;
    let lastY = element.y;

    function onMouseMove(ev: MouseEvent) {
      if (!dragStart) return;
      lastX = dragStart.elX + (ev.clientX - dragStart.mouseX);
      lastY = dragStart.elY + (ev.clientY - dragStart.mouseY);
      onMove(lastX, lastY);
    }

    function onMouseUp() {
      const origX = dragStart!.elX;
      const origY = dragStart!.elY;
      dragStart = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (shouldSnapBack?.(lastX, lastY)) {
        onMove(origX, origY);
      }
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  const labelInfo = getLabelPos(element);
  const isActorOrTeam = element.type === "actor" || element.type === "team" || element.type === "system";
  const isBoundary = element.type === "system-boundary";  // excluded from connection overlay
  const isContainer = isBoundary || element.type === "composite-state"; // gets resize handles
  const showLabel = element.type !== "initial-state" && element.type !== "final-state";

  return (
    <g
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
      style={{ cursor: isBoundary ? "default" : "move" }}
    >
      <SymbolShape el={element} />

      {showLabel && element.type === 'use-case' ? (() => {
        const innerW = element.width * 0.7;
        const lines = wrapText(element.label, innerW);
        const lineH = 16;
        const totalH = lines.length * lineH;
        const startY = element.y + element.height / 2 - totalH / 2 + lineH * 0.5;
        return (
          <text
            textAnchor="middle"
            fontSize={12}
            fill="#111827"
            style={{ userSelect: "none", pointerEvents: "none" }}
          >
            {lines.map((line, i) => (
              <tspan key={i} x={element.x + element.width / 2} y={startY + i * lineH}>
                {line}
              </tspan>
            ))}
          </text>
        );
      })() : showLabel && (
        <text
          x={labelInfo.x}
          y={labelInfo.y}
          textAnchor="middle"
          dominantBaseline={labelInfo.baseline}
          fontSize={isActorOrTeam ? 11 : 12}
          fill="#111827"
          style={{ userSelect: "none", pointerEvents: "none" }}
        >
          {element.label}
        </text>
      )}

      {/* Selection outline */}
      {selected && !isContainer && (
        <rect
          x={element.x - 3} y={element.y - 3}
          width={element.width + 6} height={element.height + 6}
          fill="none" stroke="#2563eb" strokeWidth={1.5}
          strokeDasharray="4 2" rx={4}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Drop target highlight */}
      {isDropTarget && !isDisallowedTarget && (
        <rect
          x={element.x - 4} y={element.y - 4}
          width={element.width + 8} height={element.height + 8}
          fill="none" stroke="#16a34a" strokeWidth={2} rx={6}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Disallow highlight */}
      {isDisallowedTarget && (
        <rect
          x={element.x - 4} y={element.y - 4}
          width={element.width + 8} height={element.height + 8}
          fill="none" stroke="#dc2626" strokeWidth={2} strokeDasharray="4 2" rx={6}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Resize handles (containers: system-boundary and composite-state) */}
      {selected && isContainer && onResizeDragStart &&
        RESIZE_HANDLES.map(({ handle, cursor }) => {
          const { hx, hy } = getHandlePos(handle, element);
          return (
            <rect
              key={handle}
              x={hx - 4} y={hy - 4}
              width={8} height={8}
              fill="#2563eb" stroke="white" strokeWidth={1}
              style={{ cursor }}
              onMouseDown={(e) => { e.stopPropagation(); onResizeDragStart(handle, e); }}
            />
          );
        })
      }

      {/* Full-body connection overlay for all non-boundary elements */}
      {showConnectionPoints && !isBoundary && (
        <rect
          x={element.x} y={element.y}
          width={element.width} height={element.height}
          fill="transparent" stroke="none"
          style={{ cursor: "crosshair" }}
          onMouseDown={(e) => {
            e.stopPropagation();
            const worldPt = svgToWorld
              ? svgToWorld(e.clientX, e.clientY)
              : { x: element.x + element.width / 2, y: element.y + element.height / 2 };
            const side = getClosestSideFromPoint(worldPt, element);
            onConnectionPointDragStart(side, {
              x: element.x + element.width / 2,
              y: element.y + element.height / 2,
            });
          }}
        />
      )}
    </g>
  );
}
