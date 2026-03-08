"use client";

import { useState } from "react";
import type { BpmnTaskType, GatewayType, EventType, DiagramElement, Point, Side } from "@/app/lib/diagram/types";

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface Props {
  element: DiagramElement;
  selected: boolean;
  isDropTarget: boolean;
  isDisallowedTarget?: boolean;
  isMessageBpmnTarget?: boolean;
  isErrorTarget?: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onDoubleClick: () => void;
  onConnectionPointDragStart: (side: Side, worldPos: Point) => void;
  showConnectionPoints: boolean;
  onResizeDragStart?: (handle: ResizeHandle, e: React.MouseEvent) => void;
  svgToWorld?: (clientX: number, clientY: number) => Point;
  shouldSnapBack?: (x: number, y: number) => boolean;
  onMoveEnd?: () => void;
  onUpdateProperties?: (id: string, props: Record<string, unknown>) => void;
  onUpdateLabel?: (id: string, label: string) => void;
}

function ellipseOctagonPoints(cx: number, cy: number, rx: number, ry: number): string {
  const k = Math.SQRT2 - 1;
  return [
    `${cx+rx},${cy-ry*k}`,  `${cx+rx*k},${cy-ry}`,
    `${cx-rx*k},${cy-ry}`,  `${cx-rx},${cy-ry*k}`,
    `${cx-rx},${cy+ry*k}`,  `${cx-rx*k},${cy+ry}`,
    `${cx+rx*k},${cy+ry}`,  `${cx+rx},${cy+ry*k}`,
  ].join(" ");
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
  const hasLoop = el.repeatType === "loop";
  return (
    <g>
      <rect x={el.x} y={el.y} width={el.width} height={el.height}
        rx={4} ry={4} fill="#fef9c3" stroke="#374151" strokeWidth={1.5} />
      {hasLoop && <LoopMarker cx={el.x + el.width / 2} cy={el.y + el.height - 10} />}
    </g>
  );
}

function GatewayMarker({ type, cx, cy }: { type: GatewayType; cx: number; cy: number }) {
  const s = 9;
  switch (type) {
    case "exclusive":
      return (
        <g stroke="#374151" strokeWidth={2.5} strokeLinecap="round">
          <line x1={cx - s * 0.6} y1={cy - s * 0.6} x2={cx + s * 0.6} y2={cy + s * 0.6} />
          <line x1={cx + s * 0.6} y1={cy - s * 0.6} x2={cx - s * 0.6} y2={cy + s * 0.6} />
        </g>
      );
    case "inclusive":
      return <circle cx={cx} cy={cy} r={s * 0.7} fill="none" stroke="#374151" strokeWidth={2} />;
    case "parallel":
      return (
        <g stroke="#374151" strokeWidth={2.5} strokeLinecap="round">
          <line x1={cx - s * 0.7} y1={cy} x2={cx + s * 0.7} y2={cy} />
          <line x1={cx} y1={cy - s * 0.7} x2={cx} y2={cy + s * 0.7} />
        </g>
      );
    case "event-based": {
      const pts: string[] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i * 2 * Math.PI / 5) - Math.PI / 2;
        pts.push(`${cx + s * 0.75 * Math.cos(a)},${cy + s * 0.75 * Math.sin(a)}`);
      }
      return <polygon points={pts.join(" ")} fill="none" stroke="#374151" strokeWidth={1.5} />;
    }
    default: return null;
  }
}

function GatewayShape({ el }: { el: DiagramElement }) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const points = `${cx},${el.y} ${el.x + el.width},${cy} ${cx},${el.y + el.height} ${el.x},${cy}`;
  return (
    <g>
      <polygon points={points} fill="#f3e8ff" stroke="#374151" strokeWidth={1.5} />
      {el.gatewayType && <GatewayMarker type={el.gatewayType} cx={cx} cy={cy} />}
    </g>
  );
}

function EventMarker({ type, cx, cy, r, filled }: {
  type: EventType; cx: number; cy: number; r: number; filled?: boolean;
}) {
  const s = r * 0.55;
  switch (type) {
    case "message":
      return (
        <g>
          <rect x={cx - s} y={cy - s * 0.65} width={s * 2} height={s * 1.3}
            rx={1} fill={filled ? "#374151" : "white"} stroke="#374151" strokeWidth={1.2} />
          <polyline points={`${cx - s},${cy - s * 0.65} ${cx},${cy} ${cx + s},${cy - s * 0.65}`}
            fill="none" stroke={filled ? "white" : "#374151"} strokeWidth={1.2} />
        </g>
      );
    case "timer":
      return (
        <g>
          <circle cx={cx} cy={cy} r={s} fill="white" stroke="#374151" strokeWidth={1.2} />
          <line x1={cx} y1={cy - s * 0.7} x2={cx} y2={cy} stroke="#374151" strokeWidth={1.2} strokeLinecap="round" />
          <line x1={cx} y1={cy} x2={cx + s * 0.5} y2={cy + s * 0.4} stroke="#374151" strokeWidth={1.2} strokeLinecap="round" />
        </g>
      );
    case "error": {
      const pts = [
        `${cx + s * 0.35},${cy - s * 0.85}`,  // top-right tip
        `${cx - s * 0.1},${cy - s * 0.2}`,    // upper-left kink
        `${cx + s * 0.25},${cy - s * 0.2}`,   // upper-right step
        `${cx - s * 0.35},${cy + s * 0.85}`,  // bottom-left tip
        `${cx + s * 0.1},${cy + s * 0.2}`,    // lower-right kink
        `${cx - s * 0.25},${cy + s * 0.2}`,   // lower-left step
      ].join(" ");
      return (
        <polygon points={pts} fill={filled ? "#374151" : "white"}
          stroke="#374151" strokeWidth={1.2} strokeLinejoin="round" />
      );
    }
    case "signal":
      return (
        <polygon
          points={`${cx},${cy - s * 0.8} ${cx - s * 0.7},${cy + s * 0.5} ${cx + s * 0.7},${cy + s * 0.5}`}
          fill={filled ? "#374151" : "white"} stroke="#374151" strokeWidth={1.2}
        />
      );
    case "terminate":
      return <circle cx={cx} cy={cy} r={s * 0.65} fill="#374151" />;
    case "conditional":
      return (
        <g>
          <rect x={cx - s * 0.65} y={cy - s * 0.75} width={s * 1.3} height={s * 1.5}
            rx={1} fill="white" stroke="#374151" strokeWidth={1.2} />
          <line x1={cx - s * 0.4} y1={cy - s * 0.35} x2={cx + s * 0.4} y2={cy - s * 0.35} stroke="#374151" strokeWidth={1} />
          <line x1={cx - s * 0.4} y1={cy} x2={cx + s * 0.4} y2={cy} stroke="#374151" strokeWidth={1} />
          <line x1={cx - s * 0.4} y1={cy + s * 0.35} x2={cx + s * 0.4} y2={cy + s * 0.35} stroke="#374151" strokeWidth={1} />
        </g>
      );
    default: return null;
  }
}

function StartEventShape({ el }: { el: DiagramElement }) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const r  = el.width / 2;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#dcfce7" stroke="#374151" strokeWidth={2} />
      {el.eventType && el.eventType !== "none" &&
        <EventMarker type={el.eventType} cx={cx} cy={cy} r={r} />}
    </g>
  );
}

function EndEventShape({ el }: { el: DiagramElement }) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const r  = el.width / 2;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#fca5a5" stroke="#374151" strokeWidth={3} />
      {el.eventType && el.eventType !== "none" &&
        <EventMarker type={el.eventType} cx={cx} cy={cy} r={r} filled />}
    </g>
  );
}

function IntermediateEventShape({ el }: { el: DiagramElement }) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const r  = el.width / 2;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#fed7aa" stroke="#374151" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={r - 3} fill="#fed7aa" stroke="#374151" strokeWidth={1.5} />
      {el.eventType && el.eventType !== "none" &&
        <EventMarker type={el.eventType} cx={cx} cy={cy} r={r - 4} filled={el.taskType === "send"} />}
    </g>
  );
}

function DataObjectShape({ el }: { el: DiagramElement }) {
  const fold = Math.round(el.width * 0.28);
  const { x, y, width: w, height: h } = el;
  const role         = (el.properties.role         as string | undefined) ?? "none";
  const multiplicity = (el.properties.multiplicity as string | undefined) ?? "single";

  const arrowW = Math.round(w * 0.28);
  const arrowH = Math.round(h * 0.18);
  const ax = x + 3;
  const ay = y + 4;
  const triW  = Math.round(arrowW * 0.7);
  const rectW = Math.round(triW   * 0.5);
  const rectH = Math.round(arrowH * 0.35);
  const ry    = ay + (arrowH - rectH) / 2;
  const markerPts = [
    `${ax},${ry}`,
    `${ax + rectW},${ry}`,
    `${ax + rectW},${ay}`,
    `${ax + rectW + triW},${ay + arrowH / 2}`,
    `${ax + rectW},${ay + arrowH}`,
    `${ax + rectW},${ry + rectH}`,
    `${ax},${ry + rectH}`,
  ].join(" ");

  const lineH   = Math.round(h * 0.14);
  const lineGap = 3;
  const cx  = x + w / 2;
  const ly2 = y + h - 3;
  const ly1 = ly2 - lineH;

  return (
    <g>
      <polygon
        points={`${x},${y} ${x+w-fold},${y} ${x+w},${y+fold} ${x+w},${y+h} ${x},${y+h}`}
        fill="#bfdbfe" stroke="#374151" strokeWidth={1.5}
      />
      <polygon
        points={`${x+w-fold},${y} ${x+w},${y+fold} ${x+w-fold},${y+fold}`}
        fill="#93c5fd" stroke="#374151" strokeWidth={1.5}
      />
      {role === "output" && (
        <polygon points={markerPts} fill="#374151" />
      )}
      {role === "input" && (
        <polygon points={markerPts} fill="white" stroke="#374151" strokeWidth={1.2} />
      )}
      {multiplicity === "collection" && (
        <g stroke="#374151" strokeWidth={1.5}>
          <line x1={cx - lineGap} y1={ly1} x2={cx - lineGap} y2={ly2} />
          <line x1={cx}           y1={ly1} x2={cx}           y2={ly2} />
          <line x1={cx + lineGap} y1={ly1} x2={cx + lineGap} y2={ly2} />
        </g>
      )}
    </g>
  );
}

function DataStoreShape({ el }: { el: DiagramElement }) {
  const { x, y, width: w, height: h } = el;
  const cx = x + w / 2;
  const rx = w / 2;
  const ry = Math.max(4, Math.round(h * 0.15));
  const ringGap = ry + 3;
  // Front arc (bottom half of ellipse): clockwise from left to right, sweep=1
  const frontArc = (cy: number) =>
    `M ${x} ${cy} A ${rx} ${ry} 0 0 1 ${x + w} ${cy}`;
  return (
    <g>
      <rect x={x} y={y + ry} width={w} height={h - ry} fill="#60a5fa" stroke="#374151" strokeWidth={1.5} />
      <ellipse cx={cx} cy={y + ry} rx={rx} ry={ry} fill="#60a5fa" stroke="#374151" strokeWidth={1.5} />
      <path d={frontArc(y + ry + ringGap)}     fill="none" stroke="#374151" strokeWidth={1.5} />
      <path d={frontArc(y + ry + ringGap * 2)} fill="none" stroke="#374151" strokeWidth={1.5} />
      <path d={frontArc(y + h)}               fill="none" stroke="#374151" strokeWidth={1.5} />
    </g>
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
      rx={12} ry={12} fill="#dbeafe" stroke="#374151" strokeWidth={1.5} />
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

function SubprocessShape({ el }: { el: DiagramElement }) {
  const hasLoop = el.repeatType === "loop";
  const markerW = 14, markerH = 14;
  // "+" always stays centred; loop marker sits to the right with 4px gap
  const plusCX = el.x + el.width / 2;
  const loopCX = plusCX + markerW / 2 + 4 + 5; // right edge of "+" + 4px gap + arc radius
  const mx = plusCX - markerW / 2;
  const my = el.y + el.height - markerH - 3;
  return (
    <g>
      <rect x={el.x} y={el.y} width={el.width} height={el.height}
        rx={4} ry={4} fill="#fef08a" stroke="#374151" strokeWidth={1.5} />
      <rect x={mx} y={my} width={markerW} height={markerH}
        rx={2} fill="white" stroke="#374151" strokeWidth={1} />
      <line x1={mx + markerW / 2} y1={my + 3} x2={mx + markerW / 2} y2={my + markerH - 3}
        stroke="#374151" strokeWidth={1} />
      <line x1={mx + 3} y1={my + markerH / 2} x2={mx + markerW - 3} y2={my + markerH / 2}
        stroke="#374151" strokeWidth={1} />
      {hasLoop && <LoopMarker cx={loopCX} cy={my} />}
    </g>
  );
}

function ExpandedSubprocessShape({ el }: { el: DiagramElement }) {
  const hasLoop = el.repeatType === "loop";
  return (
    <g>
      <rect x={el.x} y={el.y} width={el.width} height={el.height}
        rx={4} ry={4} fill="#fef08a" stroke="#374151" strokeWidth={1.5} />
      {hasLoop && <LoopMarker cx={el.x + el.width / 2} cy={el.y + el.height - 10} />}
    </g>
  );
}

function BpmnTaskMarker({ taskType, x, y }: { taskType: BpmnTaskType; x: number; y: number }) {
  const cx = x + 7;
  const cy = y + 7;
  switch (taskType) {
    case "user":
      return (
        <g>
          <circle cx={cx} cy={y + 4.5} r={2.8} fill="white" stroke="#374151" strokeWidth={1.2} />
          <path d={`M${x + 1} ${y + 14} C${x + 1} ${y + 9} ${x + 13} ${y + 9} ${x + 13} ${y + 14}`}
            fill="white" stroke="#374151" strokeWidth={1.2} strokeLinejoin="round" />
        </g>
      );
    case "service": {
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
    case "script":
      return (
        <g>
          <rect x={x + 2} y={y + 1} width={10} height={12} rx={1} fill="white" stroke="#374151" strokeWidth={1.2} />
          <line x1={x + 4} y1={y + 4}  x2={x + 10} y2={y + 4}  stroke="#374151" strokeWidth={1} />
          <line x1={x + 4} y1={y + 7}  x2={x + 10} y2={y + 7}  stroke="#374151" strokeWidth={1} />
          <line x1={x + 4} y1={y + 10} x2={x + 10} y2={y + 10} stroke="#374151" strokeWidth={1} />
        </g>
      );
    case "send":
      return (
        <g>
          <rect x={x + 1} y={y + 3} width={12} height={8} rx={1} fill="#374151" stroke="#374151" strokeWidth={1} />
          <polyline points={`${x + 1},${y + 3} ${cx},${y + 8} ${x + 13},${y + 3}`}
            fill="none" stroke="white" strokeWidth={1.2} />
        </g>
      );
    case "receive":
      return (
        <g>
          <rect x={x + 1} y={y + 3} width={12} height={8} rx={1} fill="white" stroke="#374151" strokeWidth={1.2} />
          <polyline points={`${x + 1},${y + 3} ${cx},${y + 8} ${x + 13},${y + 3}`}
            fill="none" stroke="#374151" strokeWidth={1.2} />
        </g>
      );
    case "manual":
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
    case "business-rule":
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

function LoopMarker({ cx, cy }: { cx: number; cy: number }) {
  // Counter-clockwise arc: from right (cx+r, cy) going up/left/down to bottom (cx, cy+r) — 270° sweep
  // At the endpoint (cx, cy+r), CCW tangent points right (+x), so arrowhead points right
  const r = 5;
  return (
    <g>
      <path
        d={`M ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx} ${cy + r}`}
        fill="none" stroke="#374151" strokeWidth={1.5} strokeLinecap="round"
      />
      <polygon
        points={`${cx + 3},${cy + r} ${cx},${cy + r - 2.5} ${cx},${cy + r + 2.5}`}
        fill="#374151"
      />
    </g>
  );
}

function BpmnTaskShape({ el }: { el: DiagramElement }) {
  const hasLoop = el.repeatType === "loop";
  return (
    <g>
      <rect x={el.x} y={el.y} width={el.width} height={el.height}
        rx={4} ry={4} fill="#fef9c3" stroke="#374151" strokeWidth={1.5} />
      {el.taskType && el.taskType !== "none" && (
        <BpmnTaskMarker taskType={el.taskType} x={el.x + 4} y={el.y + 4} />
      )}
      {hasLoop && <LoopMarker cx={el.x + el.width / 2} cy={el.y + el.height - 10} />}
    </g>
  );
}

function PoolShape({ el }: { el: DiagramElement }) {
  const { x, y, width: w, height: h } = el;
  const LW = 30;
  const cx = x + LW / 2;
  const cy = y + h / 2;
  const lines = el.label.split('\n');
  const lineH = 13;
  const isWhiteBox = ((el.properties.poolType as string | undefined) ?? "black-box") === "white-box";
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#f9fafb" stroke="#374151" strokeWidth={1.5} />
      <rect x={x} y={y} width={LW} height={h} fill="#c8956a" stroke="#374151" strokeWidth={1.5}
        style={isWhiteBox ? { cursor: "pointer" } : undefined} />
      <text textAnchor="middle" fontSize={11} fill="#3b1a08" fontWeight="500"
            transform={`rotate(-90,${cx},${cy})`}
            style={{ userSelect: "none", pointerEvents: "none" }}>
        {lines.map((line, i) => (
          <tspan key={i} x={cx} y={cy + (i - (lines.length - 1) / 2) * lineH}>{line}</tspan>
        ))}
      </text>
    </g>
  );
}

function LaneShape({ el }: { el: DiagramElement }) {
  const { x, y, width: w, height: h } = el;
  const LW = 24;
  const cx = x + LW / 2;
  const cy = y + h / 2;
  const lines = el.label.split('\n');
  const lineH = 12;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="#374151" strokeWidth={1} />
      <rect x={x} y={y} width={LW} height={h} fill="#e8c4a0" stroke="#374151" strokeWidth={1} />
      <text textAnchor="middle" fontSize={10} fill="#3b1a08"
            transform={`rotate(-90,${cx},${cy})`}
            style={{ userSelect: "none", pointerEvents: "none" }}>
        {lines.map((line, i) => (
          <tspan key={i} x={cx} y={cy + (i - (lines.length - 1) / 2) * lineH}>{line}</tspan>
        ))}
      </text>
    </g>
  );
}

function SymbolShape({ el }: { el: DiagramElement }) {
  switch (el.type) {
    case "gateway":              return <GatewayShape el={el} />;
    case "start-event":          return <StartEventShape el={el} />;
    case "intermediate-event":   return <IntermediateEventShape el={el} />;
    case "end-event":            return <EndEventShape el={el} />;
    case "data-object":          return <DataObjectShape el={el} />;
    case "data-store":           return <DataStoreShape el={el} />;
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
    case "pool":              return <PoolShape el={el} />;
    case "lane":              return <LaneShape el={el} />;
    case "task":
      return el.taskType !== undefined ? <BpmnTaskShape el={el} /> : <TaskShape el={el} />;
    case "subprocess":          return <SubprocessShape el={el} />;
    case "subprocess-expanded": return <ExpandedSubprocessShape el={el} />;
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
  isMessageBpmnTarget,
  isErrorTarget,
  onSelect,
  onMove,
  onDoubleClick,
  onConnectionPointDragStart,
  showConnectionPoints,
  onResizeDragStart,
  svgToWorld,
  shouldSnapBack,
  onMoveEnd,
  onUpdateProperties,
  onUpdateLabel,
}: Props) {
  const [isEditingGatewayLabel, setIsEditingGatewayLabel] = useState(false);
  const [editGatewayLabelValue, setEditGatewayLabelValue] = useState("");
  let dragStart: { mouseX: number; mouseY: number; elX: number; elY: number } | null = null;

  function handleMouseDown(e: React.MouseEvent) {
    e.stopPropagation();

    // White-box pool: only the 30px header sidebar accepts interaction
    const isWhiteBoxPool = element.type === "pool" &&
      ((element.properties.poolType as string | undefined) ?? "black-box") === "white-box";
    if (isWhiteBoxPool) {
      const POOL_LW = 30;
      const worldPos = svgToWorld ? svgToWorld(e.clientX, e.clientY) : null;
      if (worldPos && worldPos.x > element.x + POOL_LW) return; // body click — ignore
      if (selected) { onSelect(); return; }                      // header re-click — deselect, no drag
    }

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
      } else {
        onMoveEnd?.();
      }
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  const labelInfo = getLabelPos(element);
  const isActorOrTeam = element.type === "actor" || element.type === "team" || element.type === "system";
  const isBoundary = element.type === "system-boundary";  // excluded from connection overlay
  const isPoolLane = element.type === "pool" || element.type === "lane";
  const isWhiteBoxPool = element.type === "pool" &&
    ((element.properties.poolType as string | undefined) ?? "black-box") === "white-box";
  const isContainer = isBoundary || element.type === "composite-state" || isPoolLane; // gets resize handles
  const canResize = isContainer || element.type === "task" || element.type === "subprocess" ||
    element.type === "subprocess-expanded" || element.type === "use-case";
  const showLabel = element.type !== "initial-state" && element.type !== "final-state";

  return (
    <g
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
      style={{ cursor: (isBoundary || isWhiteBoxPool) ? "default" : "move" }}
    >
      <SymbolShape el={element} />

      {showLabel && (
        element.type === 'start-event'        ||
        element.type === 'end-event'          ||
        element.type === 'intermediate-event' ||
        element.type === 'gateway'            ||
        element.type === 'data-object'        ||
        element.type === 'data-store'
      ) ? (() => {
        const labelOffsetX = (element.properties.labelOffsetX as number) ?? 0;
        const labelOffsetY = (element.properties.labelOffsetY as number) ?? 7;
        const labelWidth   = (element.properties.labelWidth   as number) ?? 80;
        const elCenterX    = element.x + element.width / 2;
        const labelCenterX = elCenterX + labelOffsetX;
        const labelTopY    = element.y + element.height + labelOffsetY;
        const lines        = wrapText(element.label, labelWidth);
        const lineH        = 14;
        const totalLabelH  = lines.length * lineH;

        function handleResizeMouseDown(e: React.MouseEvent) {
          e.stopPropagation();
          const startClientX = e.clientX;
          const startWidth = labelWidth;
          function onMove(ev: MouseEvent) {
            const delta = ev.clientX - startClientX;
            const newWidth = Math.max(40, startWidth + delta * 2);
            onUpdateProperties?.(element.id, { labelWidth: newWidth });
          }
          function onUp() {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          }
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }

        function handleLabelMouseDown(e: React.MouseEvent) {
          e.stopPropagation();
          if (!svgToWorld) return;
          const startWorld = svgToWorld(e.clientX, e.clientY);
          const startOffsetX = labelOffsetX;
          const startOffsetY = labelOffsetY;
          document.body.style.cursor = "grabbing";
          function onMove(ev: MouseEvent) {
            const curWorld = svgToWorld!(ev.clientX, ev.clientY);
            const dx = curWorld.x - startWorld.x;
            const dy = curWorld.y - startWorld.y;
            onUpdateProperties?.(element.id, {
              labelOffsetX: startOffsetX + dx,
              labelOffsetY: startOffsetY + dy,
            });
          }
          function onUp() {
            document.body.style.cursor = "";
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          }
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }

        const hitRectX = labelCenterX - labelWidth / 2;
        const hitRectY = labelTopY;
        const elCenter = { x: element.x + element.width / 2, y: element.y + element.height / 2 };
        const labelMidY = labelTopY + totalLabelH / 2;

        return (
          <g>
            {(selected || isEditingGatewayLabel) && (
              <line
                x1={elCenter.x} y1={elCenter.y}
                x2={labelCenterX} y2={labelMidY}
                stroke="#6b7280" strokeWidth={1} strokeDasharray="4 3"
                style={{ pointerEvents: "none" }}
              />
            )}
            <rect
              x={hitRectX} y={hitRectY}
              width={labelWidth} height={Math.max(totalLabelH, 16)}
              fill="transparent"
              stroke={selected ? "#2563eb" : "none"}
              strokeWidth={1}
              strokeDasharray={selected ? "3 2" : undefined}
              style={{ cursor: onUpdateProperties ? "grab" : "default" }}
              onMouseDown={handleLabelMouseDown}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditGatewayLabelValue(element.label);
                setIsEditingGatewayLabel(true);
              }}
            />
            {!isEditingGatewayLabel && (
              <text
                textAnchor="middle"
                fontSize={11}
                fill="#111827"
                style={{ userSelect: "none", pointerEvents: "none" }}
              >
                {lines.map((line, i) => (
                  <tspan key={i} x={labelCenterX} y={labelTopY + i * lineH + lineH * 0.85}>
                    {line}
                  </tspan>
                ))}
              </text>
            )}
            {!isEditingGatewayLabel &&
              element.type === "data-object" &&
              !!(element.properties.state as string | undefined) && (
              <text
                textAnchor="middle"
                x={labelCenterX}
                y={labelTopY + lines.length * lineH + lineH * 0.85}
                fontSize={10}
                fill="#374151"
                style={{ userSelect: "none", pointerEvents: "none" }}
              >
                {`[${element.properties.state as string}]`}
              </text>
            )}
            {isEditingGatewayLabel && (
              <foreignObject x={hitRectX} y={hitRectY} width={labelWidth} height={Math.max(totalLabelH, 28)}>
                <textarea
                  autoFocus
                  value={editGatewayLabelValue}
                  onChange={(e) => setEditGatewayLabelValue(e.target.value)}
                  onBlur={(e) => {
                    setIsEditingGatewayLabel(false);
                    onUpdateLabel?.(element.id, e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setIsEditingGatewayLabel(false);
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      (e.target as HTMLTextAreaElement).blur();
                    }
                  }}
                  style={{
                    width: "100%", height: "100%", fontSize: 11, fontFamily: "inherit",
                    resize: "none", border: "none", outline: "none",
                    background: "white", padding: "1px 2px",
                    textAlign: "center", lineHeight: "14px", boxSizing: "border-box",
                  }}
                />
              </foreignObject>
            )}
            {selected && onUpdateProperties && (
              <rect
                x={hitRectX + labelWidth - 3} y={labelTopY + totalLabelH / 2 - 5}
                width={6} height={10}
                fill="#2563eb" stroke="white" strokeWidth={1} rx={1}
                style={{ cursor: "ew-resize" }}
                onMouseDown={handleResizeMouseDown}
              />
            )}
          </g>
        );
      })() : showLabel && !(
        element.type === 'task' ||
        element.type === 'subprocess' ||
        element.type === 'subprocess-expanded' ||
        element.type === 'use-case' ||
        element.type === 'pool' ||
        element.type === 'lane'
      ) && (
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

      {/* messageBPMN target highlight (darker green) */}
      {isMessageBpmnTarget && (
        <rect
          x={element.x - 4} y={element.y - 4}
          width={element.width + 8} height={element.height + 8}
          fill="none" stroke="#166534" strokeWidth={2} rx={6}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Misaligned messageBPMN target highlight (red) */}
      {isErrorTarget && (
        <rect
          x={element.x - 4} y={element.y - 4}
          width={element.width + 8} height={element.height + 8}
          fill="none" stroke="#dc2626" strokeWidth={2} rx={6}
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

      {/* Resize handles (containers + task/subprocess) */}
      {selected && canResize && onResizeDragStart &&
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
      {showConnectionPoints && !isBoundary && element.type !== "lane" && element.type === "use-case" && (() => {
        const cx = element.x + element.width / 2;
        const cy = element.y + element.height / 2;
        const handler = (e: React.MouseEvent) => {
          e.stopPropagation();
          const worldPt = svgToWorld ? svgToWorld(e.clientX, e.clientY) : { x: cx, y: cy };
          const side = getClosestSideFromPoint(worldPt, element);
          onConnectionPointDragStart(side, { x: cx, y: cy });
        };
        return (
          <polygon
            points={ellipseOctagonPoints(cx, cy, element.width / 2, element.height / 2)}
            fill="transparent" stroke="none"
            style={{ cursor: "crosshair" }}
            onMouseDown={handler}
          />
        );
      })()}
      {showConnectionPoints && !isBoundary && element.type !== "lane" && element.type !== "use-case" && (
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

      {/* Interior label for task/subprocess/subprocess-expanded/use-case — rendered AFTER connection overlay so it is on top */}
      {showLabel && (
        element.type === 'task' ||
        element.type === 'subprocess' ||
        element.type === 'subprocess-expanded' ||
        element.type === 'use-case'
      ) && (() => {
        const PAD = 4;
        const el = element;
        const elCenterX = el.x + el.width / 2;
        const elCenterY = el.y + el.height / 2;
        const defaultW = el.type === 'use-case' ? el.width * 0.7 : el.width - 2 * PAD;
        const labelOffsetX = (el.properties.labelOffsetX as number) ?? 0;
        const labelOffsetY = (el.properties.labelOffsetY as number) ?? 0;
        const labelWidth   = (el.properties.labelWidth   as number) ?? defaultW;
        const labelCenterX = elCenterX + labelOffsetX;
        const labelCenterY = elCenterY + labelOffsetY;
        const lineH = 14;
        const lines = wrapText(el.label, labelWidth);
        const totalLabelH = lines.length * lineH;
        const labelTopY = el.type === 'subprocess-expanded'
          ? el.y + PAD   // pin to top of element
          : labelCenterY - totalLabelH / 2;
        const labelLeftX = labelCenterX - labelWidth / 2;
        const iconReserveTop = (el.type === 'task' && el.taskType && el.taskType !== 'none') ? 20 : 0;
        const iconReserveBot = (el.type === 'subprocess' || el.repeatType === 'loop') ? 20 : 0;
        const minY    = el.y + PAD + iconReserveTop;
        const maxBotY = el.y + el.height - PAD - iconReserveBot;
        function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
        function handleInteriorLabelMouseDown(ev: React.MouseEvent) {
          ev.stopPropagation();
          onSelect();
          if (!svgToWorld) return;
          const startWorld = svgToWorld(ev.clientX, ev.clientY);
          const startOffX = labelOffsetX;
          const startOffY = labelOffsetY;
          const halfW = labelWidth / 2;
          const halfH = totalLabelH / 2;
          function onMove(e: MouseEvent) {
            const curWorld = svgToWorld!(e.clientX, e.clientY);
            const newCX = elCenterX + startOffX + (curWorld.x - startWorld.x);
            const newCY = elCenterY + startOffY + (curWorld.y - startWorld.y);
            const clampedCX = clamp(newCX, el.x + PAD + halfW, el.x + el.width - PAD - halfW);
            const clampedCY = clamp(newCY, minY + halfH, maxBotY - halfH);
            onUpdateProperties?.(el.id, {
              labelOffsetX: clampedCX - elCenterX,
              labelOffsetY: clampedCY - elCenterY,
            });
          }
          function onUp() {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          }
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }
        function handleInteriorResizeMouseDown(ev: React.MouseEvent) {
          ev.stopPropagation();
          const startClientX = ev.clientX;
          const startWidth = labelWidth;
          const maxW = el.type === 'use-case' ? el.width * 0.85 : el.width - 2 * PAD;
          function onMove(e: MouseEvent) {
            const newWidth = clamp(startWidth + (e.clientX - startClientX) * 2, 24, maxW);
            onUpdateProperties?.(el.id, { labelWidth: newWidth });
          }
          function onUp() {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          }
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }
        return (
          <g>
            <rect
              x={labelLeftX} y={labelTopY}
              width={labelWidth} height={totalLabelH}
              fill="transparent"
              stroke={selected ? "#2563eb" : "none"}
              strokeWidth={1}
              strokeDasharray={selected ? "3 2" : undefined}
              style={{ cursor: onUpdateProperties ? "move" : "default" }}
              onMouseDown={handleInteriorLabelMouseDown}
              onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
            />
            <text
              textAnchor="middle"
              fontSize={12}
              fill="#111827"
              style={{ userSelect: "none", pointerEvents: "none" }}
            >
              {lines.map((line, i) => (
                <tspan key={i} x={labelCenterX} y={labelTopY + i * lineH + lineH * 0.85}>
                  {line}
                </tspan>
              ))}
            </text>
            {selected && onUpdateProperties && (
              <rect
                x={labelLeftX + labelWidth - 3} y={labelTopY + totalLabelH / 2 - 5}
                width={6} height={10}
                fill="#2563eb" stroke="white" strokeWidth={1} rx={1}
                style={{ cursor: "ew-resize" }}
                onMouseDown={handleInteriorResizeMouseDown}
              />
            )}
          </g>
        );
      })()}
    </g>
  );
}
