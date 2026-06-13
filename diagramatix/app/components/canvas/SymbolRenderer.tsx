"use client";

import { useState, createContext, useContext } from "react";
import type { BpmnTaskType, GatewayType, EventType, DiagramElement, Point, Side, SymbolType } from "@/app/lib/diagram/types";
import { type SymbolColorConfig, resolveColor } from "@/app/lib/diagram/colors";
import { DisplayModeCtx, FontScaleCtx, PoolFontSizeCtx, LaneFontSizeCtx, ProcessFontSizeCtx, sketchyFilter } from "@/app/lib/diagram/displayMode";
import { wrapText } from "@/app/lib/diagram/textMetrics";
import { ArchimateShape } from "./ArchimateShape";

/** React context carrying the active project colour config.  Shape components
 *  read from it; when undefined, resolveColor falls back to defaults. */
const SymbolColorCtx = createContext<SymbolColorConfig | undefined>(undefined);

/** Set of lane IDs whose parent is also a lane (sublanes) */
export const SublaneIdsCtx = createContext<Set<string>>(new Set());

/** Linear interpolate between two #rrggbb colours. `frac=0` returns `hex`,
 *  `frac=1` returns `toward`. Used to tint pool/lane bodies to a very light
 *  shade of their header colour. */
function lerpHex(hex: string, toward: string, frac: number): string {
  const parse = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = parse(hex);
  const [r2, g2, b2] = parse(toward);
  const c = (a: number, b: number) => Math.round(a + (b - a) * frac).toString(16).padStart(2, "0");
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface Props {
  element: DiagramElement;
  selected: boolean;
  isDropTarget: boolean;
  isDisallowedTarget?: boolean;
  isMessageBpmnTarget?: boolean;
  isAssocBpmnTarget?: boolean;
  isErrorTarget?: boolean;
  isElementDragTarget?: boolean;
  onSelect: (e?: React.MouseEvent) => void;
  onMove: (x: number, y: number, unconstrained?: boolean) => void;
  onDoubleClick: () => void;
  onConnectionPointDragStart: (side: Side, worldPos: Point) => void;
  showConnectionPoints: boolean;
  onResizeDragStart?: (handle: ResizeHandle, e: React.MouseEvent) => void;
  svgToWorld?: (clientX: number, clientY: number) => Point;
  shouldSnapBack?: (x: number, y: number) => boolean;
  onMoveEnd?: () => void;
  onUpdateProperties?: (id: string, props: Record<string, unknown>) => void;
  onUpdateLabel?: (id: string, label: string) => void;
  /** Focus-edit zoom hooks — fired when the user double-clicks the
   *  separate-label area of an event / gateway / data-object /
   *  data-store. Shape-dblclick is intentionally no-op for these
   *  types now (see Canvas.startEditingLabel), so the label is the
   *  only entry point for both opening the inline editor AND
   *  triggering the canvas snap. */
  onLabelFocusEditStart?: (centerX: number, centerY: number, worldWidth: number) => void;
  onLabelFocusEditEnd?: () => void;
  colorConfig?: SymbolColorConfig;
  multiSelected?: boolean;
  onGroupMove?: (dx: number, dy: number) => void;
  onGroupMoveEnd?: () => void;
  onDrillBack?: () => void;
  showValueDisplay?: boolean;
  /** Called when a click on an already-selected task/subprocess should enter
   *  connection-creation mode (without dragging or editing the label). */
  onEnterConnectionMode?: () => void;
  /** Cancel any in-progress connection-creation mode (e.g. when the user
   *  starts holding to drag instead). */
  onCancelConnectionMode?: () => void;
  /** True if this element is the source for an in-progress connection-creation
   *  mode (set by Canvas after onEnterConnectionMode fires). */
  inConnectionMode?: boolean;
  /** Debug mode — overlays live poolH/elemH labels on pools and elements. */
  debugMode?: boolean;
  /** Lane swap controls — set on a selected top-level lane to enable the
   *  ↑ / ↓ buttons inside the lane header. The Canvas decides whether
   *  each direction is possible (i.e. whether a sibling lane exists in
   *  that direction) and passes the booleans through. Sub-lanes don't
   *  receive these props in the first cut. */
  canSwapLaneUp?: boolean;
  canSwapLaneDown?: boolean;
  onSwapLane?: (direction: "up" | "down") => void;
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

const VALUE_COLORS: Record<string, string> = {
  VA: "#16a34a",    // vivid green
  NNVA: "#ea580c",  // vivid orange
  NVA: "#dc2626",   // vivid red
};

const ShowValueDisplayCtx = createContext(false);
export const ProcessGroupDepthCtx = createContext<Map<string, number>>(new Map());
export const LaneDepthCtx = createContext<Map<string, number>>(new Map());
export const DatabaseCtx = createContext<string | undefined>(undefined);
/** Map from archimate-shape id → descendant depth (0 = leaf, 1 = parent of
 *  leaves, 2 = grandparent, …). Drives the per-level lightening of
 *  container fills and the label-at-top position. Computed in Canvas.tsx. */
export const ArchimateDepthCtx = createContext<Map<string, number>>(new Map());

function ValueBadge({ el, show: showProp }: { el: DiagramElement; show?: boolean }) {
  const showCtx = useContext(ShowValueDisplayCtx);
  if (!(showProp ?? showCtx)) return null;
  const va = (el.properties.valueAnalysis as string | undefined) ?? "none";
  const ct = el.properties.cycleTime as number | undefined;
  const wt = el.properties.waitTime as number | undefined;
  const tu = (el.properties.timeUnit as string | undefined) ?? "none";
  const tuCustom = (el.properties.timeUnitCustom as string | undefined) ?? "";
  const unitLabel = tu === "other" ? tuCustom : tu === "none" ? "" : tu;
  const hasValue = va !== "none";
  const hasTimes = (ct !== undefined && ct !== 0) || (wt !== undefined && wt !== 0);
  if (!hasValue && !hasTimes) return null;
  const color = hasValue ? (VALUE_COLORS[va] ?? "#374151") : "#6b7280";
  const x = el.x + el.width + 3;
  const baseY = el.y + el.height;
  let timesText = "";
  if (hasTimes) {
    const parts: string[] = [];
    if (ct !== undefined && ct !== 0) parts.push(`CT=${ct}`);
    if (wt !== undefined && wt !== 0) parts.push(`WT=${wt}`);
    timesText = `(${parts.join(", ")}${unitLabel ? ":" + unitLabel : ""})`;
  }
  return (
    <g>
      {hasValue && (
        <text x={x} y={baseY} fontSize={9} fontWeight="bold" fill={color}
          textAnchor="start" dominantBaseline="auto">
          {va}
        </text>
      )}
      {hasTimes && (
        <text x={x} y={baseY + (hasValue ? 10 : 0)} fontSize={8} fontWeight="bold" fill={color}
          textAnchor="start" dominantBaseline="auto">
          {timesText}
        </text>
      )}
    </g>
  );
}

function TaskShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  return (
    <g>
      <rect x={el.x} y={el.y} width={el.width} height={el.height}
        rx={4} ry={4} fill={resolveColor("task", colors)} stroke="#374151" strokeWidth={1.5} />
      <RepeatMarker el={el} cx={el.x + el.width / 2} cy={el.y + el.height - 10} />
      {/* ValueBadge rendered in main SymbolRenderer */}
    </g>
  );
}

function GatewayMarker({ type, cx, cy }: { type: GatewayType; cx: number; cy: number }) {
  const s = 11.7;
  switch (type) {
    case "exclusive": {
      // 70° top angle → half-angle 35° from vertical
      const dx = s * 0.7 * Math.sin(35 * Math.PI / 180);
      const dy = s * 0.7 * Math.cos(35 * Math.PI / 180);
      return (
        <g stroke="#374151" strokeWidth={5} strokeLinecap="round">
          <line x1={cx - dx} y1={cy - dy} x2={cx + dx} y2={cy + dy} />
          <line x1={cx + dx} y1={cy - dy} x2={cx - dx} y2={cy + dy} />
        </g>
      );
    }
    case "inclusive":
      return <circle cx={cx} cy={cy} r={s * 0.7} fill="none" stroke="#374151" strokeWidth={3.75} />;
    case "parallel":
      return (
        <g stroke="#374151" strokeWidth={5} strokeLinecap="round">
          <line x1={cx - s * 0.7} y1={cy} x2={cx + s * 0.7} y2={cy} />
          <line x1={cx} y1={cy - s * 0.7} x2={cx} y2={cy + s * 0.7} />
        </g>
      );
    case "event-based": {
      const pts: string[] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i * 2 * Math.PI / 5) - Math.PI / 2;
        pts.push(`${cx + s * 0.5 * Math.cos(a)},${cy + s * 0.5 * Math.sin(a)}`);
      }
      return (
        <g>
          <circle cx={cx} cy={cy} r={s * 0.95} fill="none" stroke="#374151" strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={s * 0.75} fill="none" stroke="#374151" strokeWidth={1.5} />
          <polygon points={pts.join(" ")} fill="none" stroke="#374151" strokeWidth={1.5} />
        </g>
      );
    }
    default: return null;
  }
}

function GatewayShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const points = `${cx},${el.y} ${el.x + el.width},${cy} ${cx},${el.y + el.height} ${el.x},${cy}`;
  return (
    <g>
      <polygon points={points} fill={resolveColor("gateway", colors)} stroke="#374151" strokeWidth={1.5} />
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
    case "timer": {
      const tr = s * 1.1;
      // Hour tick marks — 12 small lines around inside of clock face
      const ticks = Array.from({ length: 12 }, (_, i) => {
        const angle = (i * 30 - 90) * Math.PI / 180;
        const outerR = tr * 0.88;
        const innerR = tr * 0.72;
        return (
          <line key={i}
            x1={cx + Math.cos(angle) * innerR} y1={cy + Math.sin(angle) * innerR}
            x2={cx + Math.cos(angle) * outerR} y2={cy + Math.sin(angle) * outerR}
            stroke="#374151" strokeWidth={0.8} />
        );
      });
      // Minute hand pointing to ~3 minutes past — 18° from 12
      const minAngle = (18 - 90) * Math.PI / 180;
      // Hour hand pointing to 3 — 90° from 12
      const hrAngle = (90 - 90) * Math.PI / 180;
      return (
        <g>
          <circle cx={cx} cy={cy} r={tr} fill="white" stroke="#374151" strokeWidth={1.2} />
          {ticks}
          <line x1={cx} y1={cy} x2={cx + Math.cos(minAngle) * tr * 0.6} y2={cy + Math.sin(minAngle) * tr * 0.6}
            stroke="#374151" strokeWidth={1.2} strokeLinecap="round" />
          <line x1={cx} y1={cy} x2={cx + Math.cos(hrAngle) * tr * 0.45} y2={cy + Math.sin(hrAngle) * tr * 0.45}
            stroke="#374151" strokeWidth={1.5} strokeLinecap="round" />
        </g>
      );
    }
    case "error": {
      // Asymmetric diagonal lightning bolt per bpmn-js EVENT_ERROR path proportions
      const pts = [
        `${cx - s},${cy + s * 0.95}`,          // P0: bottom-left
        `${cx - s * 0.25},${cy}`,              // P1: left kink
        `${cx + s * 0.53},${cy + s * 0.89}`,   // P2: inner bottom-right
        `${cx + s},${cy - s * 0.95}`,          // P3: top-right tip
        `${cx + s * 0.40},${cy + s * 0.22}`,   // P4: inner right kink
        `${cx - s * 0.33},${cy - s * 0.74}`,   // P5: upper-left inner
      ].join(" ");
      return (
        <polygon points={pts} fill={filled ? "#374151" : "white"}
          stroke="#374151" strokeWidth={1.2} strokeLinejoin="round" />
      );
    }
    case "signal": {
      const sg = s * 1.4;
      return (
        <polygon
          points={`${cx},${cy - sg * 0.8} ${cx - sg * 0.7},${cy + sg * 0.5} ${cx + sg * 0.7},${cy + sg * 0.5}`}
          fill={filled ? "#374151" : "white"} stroke="#374151" strokeWidth={1.2}
        />
      );
    }
    case "terminate":
      return <circle cx={cx} cy={cy} r={s * 1.17} fill="#374151" />;
    case "escalation": {
      const es = s * 1.2;
      return (
        <polygon
          points={`${cx},${cy - es * 0.9} ${cx - es * 0.63},${cy + es * 0.6} ${cx},${cy + es * 0.1} ${cx + es * 0.63},${cy + es * 0.6}`}
          fill={filled ? "#374151" : "white"} stroke="#374151" strokeWidth={1.2} strokeLinejoin="round"
        />
      );
    }
    case "cancel": {
      const cs = s * 0.975;
      const pts = [
        `${cx},${cy - cs * 0.3}`,
        `${cx + cs * 0.7},${cy - cs}`,
        `${cx + cs},${cy - cs * 0.7}`,
        `${cx + cs * 0.3},${cy}`,
        `${cx + cs},${cy + cs * 0.7}`,
        `${cx + cs * 0.7},${cy + cs}`,
        `${cx},${cy + cs * 0.3}`,
        `${cx - cs * 0.7},${cy + cs}`,
        `${cx - cs},${cy + cs * 0.7}`,
        `${cx - cs * 0.3},${cy}`,
        `${cx - cs},${cy - cs * 0.7}`,
        `${cx - cs * 0.7},${cy - cs}`,
      ].join(" ");
      return (
        <polygon points={pts} fill={filled ? "#374151" : "white"}
          stroke="#374151" strokeWidth={1.2} strokeLinejoin="round" />
      );
    }
    case "compensation": {
      const cw = s * 0.7;
      const ch = s * 0.85;
      return (
        <g>
          <polygon
            points={`${cx - cw * 0.1},${cy - ch} ${cx - cw * 2.1},${cy} ${cx - cw * 0.1},${cy + ch}`}
            fill={filled ? "#374151" : "white"} stroke="#374151" strokeWidth={1.2} strokeLinejoin="round" />
          <polygon
            points={`${cx + cw * 1.1 + 3},${cy - ch} ${cx - cw * 0.9 + 3},${cy} ${cx + cw * 1.1 + 3},${cy + ch}`}
            fill={filled ? "#374151" : "white"} stroke="#374151" strokeWidth={1.2} strokeLinejoin="round" />
        </g>
      );
    }
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
    case "link": {
      const lw = s * 1.1;
      const lh = s * 0.525;
      const th = s * 1.125;
      const tw = s * 1.3;
      const pts = [
        `${cx - lw},${cy - lh}`,
        `${cx},${cy - lh}`,
        `${cx},${cy - th}`,
        `${cx + tw},${cy}`,
        `${cx},${cy + th}`,
        `${cx},${cy + lh}`,
        `${cx - lw},${cy + lh}`,
      ].join(" ");
      return (
        <polygon points={pts} fill={filled ? "#374151" : "white"}
          stroke="#374151" strokeWidth={1.2} strokeLinejoin="round" />
      );
    }
    default: return null;
  }
}

function StartEventShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const r  = el.width / 2;
  const fill = resolveColor("start-event", colors);
  const nonInterrupting = el.properties.interruptionType === "non-interrupting";
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke="#374151" strokeWidth={1.2}
        strokeDasharray={nonInterrupting ? "4 3" : undefined} />
      {el.eventType && el.eventType !== "none" &&
        <EventMarker type={el.eventType} cx={cx} cy={cy} r={r} />}
    </g>
  );
}

function EndEventShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const r  = el.width / 2;
  const fill = resolveColor("end-event", colors);
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke="#374151" strokeWidth={3.5} />
      {el.eventType && el.eventType !== "none" &&
        <EventMarker type={el.eventType} cx={cx} cy={cy} r={r} filled />}
    </g>
  );
}

function IntermediateEventShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const r  = el.width / 2;
  const fill = resolveColor("intermediate-event", colors);
  const nonInterrupting = el.properties.interruptionType === "non-interrupting";
  const dash = nonInterrupting ? "4 3" : undefined;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke="#374151" strokeWidth={2}
        strokeDasharray={dash} />
      <circle cx={cx} cy={cy} r={r - 3} fill={fill} stroke="#374151" strokeWidth={1.5}
        strokeDasharray={dash} />
      {el.eventType && el.eventType !== "none" &&
        <EventMarker type={el.eventType} cx={cx} cy={cy} r={r - 4} filled={el.flowType === "throwing" || (el.flowType == null && el.taskType === "send")} />}
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

  const lineH   = Math.round(h * 0.168); // 20% longer than the previous 0.14
  const lineGap = 3;
  const cx  = x + w / 2;
  const ly2 = y + h - 3;
  const ly1 = ly2 - lineH;

  const colors = useContext(SymbolColorCtx);
  const fill = resolveColor("data-object", colors);
  // Derive fold colour as a slightly darker tint of the main fill
  const foldFill = fill === "#bfdbfe" ? "#93c5fd" : fill;
  return (
    <g>
      <polygon
        points={`${x},${y} ${x+w-fold},${y} ${x+w},${y+fold} ${x+w},${y+h} ${x},${y+h}`}
        fill={fill} stroke="#374151" strokeWidth={1.5}
      />
      <polygon
        points={`${x+w-fold},${y} ${x+w},${y+fold} ${x+w-fold},${y+fold}`}
        fill={foldFill} stroke="#374151" strokeWidth={1.5}
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
  const colors = useContext(SymbolColorCtx);
  const fill = resolveColor("data-store", colors);
  const { x, y, width: w, height: h } = el;
  const rx = w / 2;
  const ry = Math.max(4, Math.round(h * 0.15));
  const ellipseSep = 5;
  const cy1 = y + ry;
  const cy2 = cy1 + ellipseSep;
  const cy3 = cy2 + ellipseSep;
  const cyBot = y + h - ry;
  const bottomHalf = (cy: number) => `M ${x} ${cy} A ${rx} ${ry} 0 0 0 ${x + w} ${cy}`;
  const bodyPath = `M ${x} ${cy1} L ${x} ${cyBot} A ${rx} ${ry} 0 0 0 ${x + w} ${cyBot} L ${x + w} ${cy1}`;
  const multiplicity = (el.properties.multiplicity as string | undefined) ?? "single";
  const mLineH   = Math.round(h * 0.14);
  const mLineGap = 3;
  const mcx      = x + w / 2;
  const mly2     = y + h - 3;
  const mly1     = mly2 - mLineH;
  return (
    <g>
      <path d={bodyPath} fill={fill} stroke="#374151" strokeWidth={1.5} />
      <ellipse cx={x + rx} cy={cy1} rx={rx} ry={ry} fill={fill} stroke="#374151" strokeWidth={1.5} />
      <path d={bottomHalf(cy2)} fill="none" stroke="#374151" strokeWidth={1.5} />
      <path d={bottomHalf(cy3)} fill="none" stroke="#374151" strokeWidth={1.5} />
      {multiplicity === "collection" && (
        <g stroke="#374151" strokeWidth={1.5}>
          <line x1={mcx - mLineGap} y1={mly1} x2={mcx - mLineGap} y2={mly2} />
          <line x1={mcx}            y1={mly1} x2={mcx}            y2={mly2} />
          <line x1={mcx + mLineGap} y1={mly1} x2={mcx + mLineGap} y2={mly2} />
        </g>
      )}
    </g>
  );
}

function UseCaseShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  return (
    <ellipse
      cx={el.x + el.width / 2} cy={el.y + el.height / 2}
      rx={el.width / 2} ry={el.height / 2}
      fill={resolveColor("use-case", colors)} stroke="#374151" strokeWidth={1.5}
    />
  );
}

function HourglassShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const { x, y, width: w, height: h } = el;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const points = `${x},${y} ${x + w},${y} ${cx},${cy} ${x + w},${y + h} ${x},${y + h} ${cx},${cy}`;
  return <polygon points={points} fill={resolveColor("hourglass", colors)} stroke="#374151" strokeWidth={1.5} />;
}

function SystemBoundaryShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const headerColor = resolveColor("system-boundary", colors);
  const bodyColor = resolveColor("system-boundary-body", colors);
  return (
    <g>
      {/* Outer rect with body fill */}
      <rect x={el.x} y={el.y} width={el.width} height={el.height}
        fill={bodyColor} fillOpacity={0.3} stroke="#374151" strokeWidth={1.5} rx={2} />
      {/* Header fill */}
      <rect x={el.x} y={el.y} width={el.width} height={HEADER_H}
        fill={headerColor} stroke="none" rx={2} />
      {/* Clip bottom corners of header fill */}
      <rect x={el.x} y={el.y + HEADER_H - 2} width={el.width} height={2} fill={headerColor} />
      {/* Header bottom border */}
      <line x1={el.x} y1={el.y + HEADER_H} x2={el.x + el.width} y2={el.y + HEADER_H}
        stroke="#374151" strokeWidth={1} />
    </g>
  );
}

function CompositeStateShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const headerColor = resolveColor("composite-state", colors);
  const bodyColor = resolveColor("composite-state-body", colors);
  return (
    <g>
      {/* Outer rounded rect with body fill */}
      <rect x={el.x} y={el.y} width={el.width} height={el.height}
        fill={bodyColor} fillOpacity={0.4} stroke="#374151" strokeWidth={1.5} rx={12} />
      {/* Header fill */}
      <rect x={el.x} y={el.y} width={el.width} height={HEADER_H}
        fill={headerColor} stroke="none" rx={12} />
      {/* Clip bottom corners of header fill */}
      <rect x={el.x} y={el.y + HEADER_H - 2} width={el.width} height={2} fill={headerColor} />
      {/* Header bottom border */}
      <line x1={el.x} y1={el.y + HEADER_H} x2={el.x + el.width} y2={el.y + HEADER_H}
        stroke="#374151" strokeWidth={1} />
    </g>
  );
}

function GroupShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const mode = useContext(DisplayModeCtx);
  const lineColor = resolveColor("group", colors);  // configurable boundary line colour
  const bodyFill = mode === "hand-drawn" ? "rgba(255,255,255,0.15)" : "rgba(249,250,251,0.15)";
  return (
    <g>
      {/* Wide transparent stroke — border-only hit target (±8px of border) */}
      <rect x={el.x} y={el.y} width={el.width} height={el.height}
        rx={8} fill="none" stroke="rgba(0,0,0,0)" strokeWidth={16}
        style={{ pointerEvents: "stroke" }} />
      {/* Visual dashed-dotted border — interior always transparent */}
      <rect x={el.x} y={el.y} width={el.width} height={el.height}
        rx={8} fill={bodyFill} stroke={lineColor} strokeWidth={1.5}
        strokeDasharray="10 3.5 2 3.5"
        style={{ pointerEvents: "none" }} />
    </g>
  );
}

const ANNOTATION_COLORS: Record<string, string> = {
  black: "#000000", green: "#16a34a", orange: "#ea580c", red: "#dc2626", purple: "#9333ea",
};

function TextAnnotationShape({ el }: { el: DiagramElement }) {
  const annotationColor = (el.properties.annotationColor as string | undefined) ?? "black";
  const bracketColor = ANNOTATION_COLORS[annotationColor] ?? "#000000";
  const capLen = 24; // doubled horizontal cap length
  // Compute visible text height so bracket matches the rendered text
  const PAD = 10;
  const lineH = 14;
  const lines = wrapText(el.label, el.width - PAD - 4);
  const totalH = lines.length * lineH;
  // 8 px padding above/below the text (3 original + 5 requested extra)
  const topY = el.y + el.height / 2 - totalH / 2 - 8;
  const botY = el.y + el.height / 2 + totalH / 2 + 8;
  return (
    <g>
      {/* Invisible hit target for the entire bounding box */}
      <rect x={el.x} y={el.y} width={el.width} height={el.height}
        fill="rgba(0,0,0,0)" stroke="none"
        style={{ pointerEvents: "fill" }} />
      {/* Left bracket: sized to visible text height + 3px padding top & bottom */}
      <line x1={el.x + capLen} y1={topY} x2={el.x} y2={topY}
        stroke={bracketColor} strokeWidth={1.5} />
      <line x1={el.x} y1={topY} x2={el.x} y2={botY}
        stroke={bracketColor} strokeWidth={1.5} />
      <line x1={el.x} y1={botY} x2={el.x + capLen} y2={botY}
        stroke={bracketColor} strokeWidth={1.5} />
    </g>
  );
}

/** Phase 3 — reviewer's comment note. A light-pink sticky with a folded
 *  top-right corner. The comment text is rendered by the shared label
 *  path (wrapped inside the box), modelled on text-annotation. */
function ReviewCommentShape({ el }: { el: DiagramElement }) {
  const FILL = "#fce7f3";   // rose-100
  const STROKE = "#ec4899"; // pink-500
  const fold = 12;
  const x = el.x, y = el.y, w = el.width, h = el.height;
  // Body path with a clipped (folded) top-right corner.
  const body = `M ${x} ${y} L ${x + w - fold} ${y} L ${x + w} ${y + fold} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
  return (
    <g>
      <path d={body} fill={FILL} stroke={STROKE} strokeWidth={1.5} strokeLinejoin="round" />
      {/* Folded corner triangle */}
      <path d={`M ${x + w - fold} ${y} L ${x + w - fold} ${y + fold} L ${x + w} ${y + fold}`}
        fill="#f9a8d4" stroke={STROKE} strokeWidth={1} strokeLinejoin="round" />
      {/* Left accent bar to signal "comment" */}
      <rect x={x} y={y} width={3} height={h} fill={STROKE} />
    </g>
  );
}

// Reusable stick figure
function StickFigure({
  cx, top, headR = 8, bodyLen = 16, armHalfSpan = 18, legSpread = 16, legLen = 12, stroke = "#374151",
}: {
  cx: number; top: number; headR?: number; bodyLen?: number;
  armHalfSpan?: number; legSpread?: number; legLen?: number; stroke?: string;
}) {
  const headCy = top + headR;
  const bodyTop = headCy + headR;
  const bodyBot = bodyTop + bodyLen;
  const armY = bodyTop + bodyLen * 0.5;
  return (
    <g>
      <circle cx={cx} cy={headCy} r={headR} fill="white" stroke={stroke} strokeWidth={1.5} />
      <line x1={cx} y1={bodyTop} x2={cx} y2={bodyBot} stroke={stroke} strokeWidth={1.5} />
      <line x1={cx - armHalfSpan} y1={armY} x2={cx + armHalfSpan} y2={armY} stroke={stroke} strokeWidth={1.5} />
      <line x1={cx} y1={bodyBot} x2={cx - legSpread} y2={bodyBot + legLen} stroke={stroke} strokeWidth={1.5} />
      <line x1={cx} y1={bodyBot} x2={cx + legSpread} y2={bodyBot + legLen} stroke={stroke} strokeWidth={1.5} />
    </g>
  );
}

function ActorShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const stroke = resolveColor("actor", colors);
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
      stroke={stroke}
    />
  );
}

function TeamShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const stroke = resolveColor("team", colors);
  const cx = el.x + el.width / 2;
  const top = el.y + 4;
  return (
    <g>
      <StickFigure cx={cx - 30} top={top} headR={6} bodyLen={10} armHalfSpan={14} legSpread={12} legLen={8} stroke={stroke} />
      <StickFigure cx={cx + 30} top={top} headR={6} bodyLen={10} armHalfSpan={14} legSpread={12} legLen={8} stroke={stroke} />
      <StickFigure cx={cx}      top={top} headR={9} bodyLen={14} armHalfSpan={14} legSpread={12} legLen={12} stroke={stroke} />
    </g>
  );
}

function SystemShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const fill = resolveColor("system", colors);
  const lineAreaEnd = el.y + el.height / 3;
  const lineSpacing = (lineAreaEnd - el.y - 8) / 2;
  const midY = el.y + 8 + lineSpacing;
  const gap = lineSpacing / 2;
  return (
    <g>
      <rect x={el.x} y={el.y} width={el.width} height={el.height} rx={3} fill={fill} stroke="#374151" strokeWidth={1.5} />
      <line x1={el.x + 4} y1={midY - gap} x2={el.x + el.width - 4} y2={midY - gap} stroke="#374151" strokeWidth={1.5} />
      <line x1={el.x + 4} y1={midY}       x2={el.x + el.width - 4} y2={midY}       stroke="#374151" strokeWidth={1.5} />
      <line x1={el.x + 4} y1={midY + gap} x2={el.x + el.width - 4} y2={midY + gap} stroke="#374151" strokeWidth={1.5} />
    </g>
  );
}

function StateShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  return (
    <rect x={el.x} y={el.y} width={el.width} height={el.height}
      rx={12} ry={12} fill={resolveColor("state", colors)} stroke="#374151" strokeWidth={1.5} />
  );
}

function InitialStateShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  return (
    <circle cx={el.x + el.width / 2} cy={el.y + el.height / 2} r={el.width / 2}
      fill={resolveColor("initial-state", colors)} />
  );
}

function FinalStateShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const disc = resolveColor("final-state", colors);
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const r = el.width / 2;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="white" stroke="#374151" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={r - 5} fill={disc} />
    </g>
  );
}

function SubmachineShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const hasLink = !!(el.properties.linkedDiagramId as string | undefined);
  const markerStroke = hasLink ? "#2563eb" : "#c0c0c0";
  // Marker: two small rounded-rect state shapes connected by a horizontal line
  const sw = 10, sh = 7, sr = 2.5; // small state width, height, border-radius
  const lineGap = 5; // line length between the two shapes
  const mw = sw * 2 + lineGap;
  const mx = el.x + el.width - mw - 6;
  const my = el.y + el.height - sh - 5;
  return (
    <g>
      <rect x={el.x} y={el.y} width={el.width} height={el.height}
        rx={12} ry={12} fill={resolveColor("submachine", colors)} stroke="#374151" strokeWidth={1.5} />
      {/* SubMachine marker: two small rounded-rect states connected by a line */}
      <rect x={mx} y={my} width={sw} height={sh} rx={sr} ry={sr}
        fill="white" stroke={markerStroke} strokeWidth={1.2} />
      <line x1={mx + sw} y1={my + sh / 2} x2={mx + sw + lineGap} y2={my + sh / 2}
        stroke={markerStroke} strokeWidth={1.2} />
      <rect x={mx + sw + lineGap} y={my} width={sw} height={sh} rx={sr} ry={sr}
        fill="white" stroke={markerStroke} strokeWidth={1.2} />
    </g>
  );
}

function ChevronShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const fill = (el.properties.fillColor as string | undefined) ?? resolveColor("chevron", colors);
  const { x, y, width: w, height: h } = el;
  const notch = Math.min(20, w * 0.15); // chevron point depth
  const points = `${x},${y} ${x + w - notch},${y} ${x + w},${y + h / 2} ${x + w - notch},${y + h} ${x},${y + h} ${x + notch},${y + h / 2}`;
  return <polygon points={points} fill={fill} stroke="#374151" strokeWidth={1.5} />;
}

function ChevronCollapsedShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const fill = (el.properties.fillColor as string | undefined) ?? resolveColor("chevron-collapsed", colors);
  const { x, y, width: w, height: h } = el;
  const notch = Math.min(20, w * 0.15);
  const points = `${x},${y} ${x + w - notch},${y} ${x + w},${y + h / 2} ${x + w - notch},${y + h} ${x},${y + h} ${x + notch},${y + h / 2}`;
  const hasLink = !!(el.properties.linkedDiagramId as string | undefined);
  const markerStroke = hasLink ? "#16a34a" : "#c0c0c0";
  // "+" marker (same as subprocess), centred at bottom
  const mw = 14, mh = 14;
  const mx = x + w / 2 - mw / 2;
  const my = y + h - mh - 3;
  return (
    <g>
      <polygon points={points} fill={fill} stroke="#374151" strokeWidth={1.5} />
      <rect x={mx} y={my} width={mw} height={mh} rx={2} fill="white" stroke={markerStroke} strokeWidth={1} />
      <line x1={mx + mw / 2} y1={my + 3} x2={mx + mw / 2} y2={my + mh - 3} stroke={markerStroke} strokeWidth={1} />
      <line x1={mx + 3} y1={my + mh / 2} x2={mx + mw - 3} y2={my + mh / 2} stroke={markerStroke} strokeWidth={1} />
    </g>
  );
}

function ProcessGroupShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const depthMap = useContext(ProcessGroupDepthCtx);
  const depth = depthMap.get(el.id) ?? 0;
  // Lighten the fill by blending toward white based on nesting depth
  const baseFill = (el.properties.fillColor as string | undefined) ?? resolveColor("process-group", colors);
  const lightenStep = 0.25; // 25% lighter per nesting level
  const t = Math.min(depth * lightenStep, 0.9); // cap at 90% toward white
  function lerpHex(hex: string, toward: string, frac: number): string {
    const parse = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const [r1, g1, b1] = parse(hex);
    const [r2, g2, b2] = parse(toward);
    const c = (a: number, b: number) => Math.round(a + (b - a) * frac).toString(16).padStart(2, "0");
    return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
  }
  const fill = depth > 0 ? lerpHex(baseFill, "#ffffff", t) : baseFill;
  return (
    <rect x={el.x} y={el.y} width={el.width} height={el.height}
      rx={4} ry={4} fill={fill} stroke="#374151" strokeWidth={1.5} />
  );
}

function ForkJoinShape({ el }: { el: DiagramElement }) {
  return (
    <rect x={el.x} y={el.y} width={el.width} height={el.height}
      fill="#1f2937" rx={2} ry={2} />
  );
}

function SubprocessShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const hasRepeat = el.repeatType && el.repeatType !== "none";
  const markerW = 14, markerH = 14;
  // "+" always stays centred; repeat marker sits to the left with 4px gap
  const plusCX = el.x + el.width / 2;
  const repeatCX = plusCX - markerW / 2 - 4 - 5; // left edge of "+" - 4px gap - marker radius
  const mx = plusCX - markerW / 2;
  const my = el.y + el.height - markerH - 3;
  const spType = (el.properties.subprocessType as string | undefined) ?? "normal";
  const fill = resolveColor("subprocess", colors);
  return (
    <g>
      <rect x={el.x} y={el.y} width={el.width} height={el.height}
        rx={4} ry={4} fill={fill} stroke="#374151"
        strokeWidth={spType === "call" ? 4 : 1.5}
        strokeDasharray={spType === "event" ? "2 3" : undefined} />
      {spType === "transaction" && (
        <rect x={el.x + 4} y={el.y + 4} width={el.width - 8} height={el.height - 8}
          rx={3} ry={3} fill="none" stroke="#374151" strokeWidth={1.5} />
      )}
      {(() => {
        const hasLink = !!(el.properties.linkedDiagramId as string | undefined);
        const markerStroke = hasLink ? "#16a34a" : "#c0c0c0";
        return (
          <>
            <rect x={mx} y={my} width={markerW} height={markerH}
              rx={2} fill="white" stroke={markerStroke} strokeWidth={1} />
            <line x1={mx + markerW / 2} y1={my + 3} x2={mx + markerW / 2} y2={my + markerH - 3}
              stroke={markerStroke} strokeWidth={1} />
            <line x1={mx + 3} y1={my + markerH / 2} x2={mx + markerW - 3} y2={my + markerH / 2}
              stroke={markerStroke} strokeWidth={1} />
          </>
        );
      })()}
      {hasRepeat && <RepeatMarker el={el} cx={repeatCX} cy={my + markerH * 0.55} />}
      {!!el.properties.adHoc && (
        <AdHocMarker cx={plusCX + markerW / 2 + 4 + 5} cy={my + markerH * 0.55} />
      )}
      {/* Link icon and ValueBadge rendered in main SymbolRenderer */}
    </g>
  );
}

/** Visual variant of `subprocess` used as a clickable "Return to parent
 *  diagram" marker placed on a child diagram by the project-wide
 *  "Scan Diagrams for Links" feature. Distinguished from a normal
 *  subprocess by `el.properties.isReturnLink === true`. Drill-through
 *  reuses the same `linkedDiagramId` mechanism as regular subprocesses,
 *  so the existing double-click handler navigates the user back to the
 *  parent diagram with no special case needed. */
function ReturnLinkShape({ el }: { el: DiagramElement }) {
  const hasLink = !!(el.properties.linkedDiagramId as string | undefined);
  // Pale blue card with a left-pointing arrow icon on the left side and
  // the parent diagram name (the element's label) on the right.
  const fill = hasLink ? "#eff6ff" : "#f3f4f6";          // blue-50 / gray-100
  const stroke = hasLink ? "#3b82f6" : "#9ca3af";        // blue-500 / gray-400
  const arrowColor = hasLink ? "#1d4ed8" : "#6b7280";    // blue-700 / gray-500
  // Arrow geometry: a chevron `←` inside a circle on the left edge.
  const arrowCx = el.x + 16;
  const arrowCy = el.y + el.height / 2;
  const r = 9;
  return (
    <g>
      <rect
        x={el.x} y={el.y}
        width={el.width} height={el.height}
        rx={el.height / 2} ry={el.height / 2}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
        strokeDasharray={hasLink ? undefined : "4 3"}
      />
      <circle cx={arrowCx} cy={arrowCy} r={r} fill="white" stroke={stroke} strokeWidth={1.2} />
      {/* Left-pointing arrowhead */}
      <path
        d={`M ${arrowCx + 3} ${arrowCy - 4} L ${arrowCx - 3} ${arrowCy} L ${arrowCx + 3} ${arrowCy + 4}`}
        fill="none"
        stroke={arrowColor}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

function ExpandedSubprocessShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const depthMap = useContext(ProcessGroupDepthCtx);
  const depth = depthMap.get(el.id) ?? 0;
  const spType = (el.properties.subprocessType as string | undefined) ?? "normal";
  const baseFill = resolveColor("subprocess-expanded", colors);
  // Lighten nested expanded subprocesses toward white
  const lightenStep = 0.25;
  const t = Math.min(depth * lightenStep, 0.9);
  function lerpHex(hex: string, toward: string, frac: number): string {
    const parse = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const [r1, g1, b1] = parse(hex);
    const [r2, g2, b2] = parse(toward);
    const c = (a: number, b: number) => Math.round(a + (b - a) * frac).toString(16).padStart(2, "0");
    return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
  }
  const fill = depth > 0 ? lerpHex(baseFill, "#ffffff", t) : baseFill;
  // Centre one or two bottom markers (Repeat and/or Ad-hoc) about the
  // shape's horizontal centre. With two markers, they sit symmetrically
  // 7px either side of centre; with one, it sits exactly on centre.
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height - 10;
  const hasRepeat = el.repeatType && el.repeatType !== "none";
  const hasAdHoc = !!el.properties.adHoc;
  const offset = 7;
  let repeatCX = cx;
  let adHocCX = cx;
  if (hasRepeat && hasAdHoc) {
    repeatCX = cx - offset;
    adHocCX = cx + offset;
  }
  return (
    <g>
      <rect x={el.x} y={el.y} width={el.width} height={el.height}
        rx={4} ry={4} fill={fill} stroke="#374151"
        strokeWidth={spType === "call" ? 4 : 1.5}
        strokeDasharray={spType === "event" ? "2 3" : undefined} />
      {spType === "transaction" && (
        <rect x={el.x + 4} y={el.y + 4} width={el.width - 8} height={el.height - 8}
          rx={3} ry={3} fill="none" stroke="#374151" strokeWidth={1.5} />
      )}
      {hasRepeat && <RepeatMarker el={el} cx={repeatCX} cy={cy} />}
      {hasAdHoc && <AdHocMarker cx={adHocCX} cy={cy} />}
      {/* ValueBadge rendered in main SymbolRenderer */}
    </g>
  );
}

function BpmnTaskMarker({ taskType, x, y }: { taskType: BpmnTaskType; x: number; y: number }) {
  const cx = x + 7;
  const cy = y + 7;
  switch (taskType) {
    case "user":
      return (
        <g fill="none" stroke="#374151" strokeWidth={1.2}>
          {/* Head */}
          <circle cx={cx} cy={y + 3.2} r={2.6} fill="white" />
          {/* Body — curved shoulders narrowing to waist */}
          <path d={`M${cx} ${y + 5.8} C${cx - 4} ${y + 7} ${cx - 5} ${y + 9.5} ${cx - 4.5} ${y + 13.5} L${cx + 4.5} ${y + 13.5} C${cx + 5} ${y + 9.5} ${cx + 4} ${y + 7} ${cx} ${y + 5.8} Z`} fill="white" />
        </g>
      );
    case "service": {
      // Two interlocking gears per BPMN 2.0 spec
      function gearPoints(gx: number, gy: number, outerR: number, innerR: number, teeth: number) {
        const pts: string[] = [];
        for (let i = 0; i < teeth; i++) {
          const base = (i / teeth) * Math.PI * 2;
          const span = (Math.PI / teeth) * 0.55;
          pts.push(`${gx + outerR * Math.cos(base - span)},${gy + outerR * Math.sin(base - span)}`);
          pts.push(`${gx + outerR * Math.cos(base + span)},${gy + outerR * Math.sin(base + span)}`);
          const gap = base + Math.PI / teeth;
          pts.push(`${gx + innerR * Math.cos(gap)},${gy + innerR * Math.sin(gap)}`);
        }
        return pts.join(" ");
      }
      const g1x = cx - 1.5, g1y = cy - 1.5;
      const g2x = cx + 2.5, g2y = cy + 2.5;
      return (
        <g>
          {/* Secondary gear (behind) */}
          <polygon points={gearPoints(g2x, g2y, 3.8, 2.8, 6)} fill="white" stroke="#374151" strokeWidth={1.2} />
          <circle cx={g2x} cy={g2y} r={1.3} fill="white" stroke="#374151" strokeWidth={1.2} />
          {/* Primary gear (front) */}
          <polygon points={gearPoints(g1x, g1y, 4.8, 3.6, 6)} fill="white" stroke="#374151" strokeWidth={1.2} />
          <circle cx={g1x} cy={g1y} r={1.6} fill="white" stroke="#374151" strokeWidth={1.2} />
        </g>
      );
    }
    case "script":
      return (
        <g>
          <path
            d={`M${x + 4} ${y + 1} L${x + 12} ${y + 1} C${x + 10} ${y + 4.5} ${x + 14} ${y + 8.5} ${x + 12} ${y + 13} L${x + 4} ${y + 13} C${x + 6} ${y + 8.5} ${x + 2} ${y + 4.5} ${x + 4} ${y + 1} Z`}
            fill="white" stroke="#374151" strokeWidth={1.2}
          />
          <line x1={x + 5} y1={y + 4}  x2={x + 11} y2={y + 4}  stroke="#374151" strokeWidth={0.8} />
          <line x1={x + 4.5} y1={y + 7}  x2={x + 11.5} y2={y + 7}  stroke="#374151" strokeWidth={0.8} />
          <line x1={x + 5} y1={y + 10} x2={x + 11} y2={y + 10} stroke="#374151" strokeWidth={0.8} />
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
      // Stylised hand: palm + 4 fingers (taller in the middle) + thumb on
      // the right, then rotated 90° clockwise so the hand points right —
      // common BPMN Manual Task convention.
      return (
        <g
          fill="white"
          stroke="#374151"
          strokeLinejoin="round"
          transform={`rotate(90 ${x + 7} ${y + 7})`}
        >
          {/* palm */}
          <rect x={x + 1.5} y={y + 7.5} width={9}   height={5}   rx={1.2} strokeWidth={1.2} />
          {/* thumb (right side, becomes bottom after rotation) */}
          <rect x={x + 10}  y={y + 5.5} width={1.6} height={4}   rx={0.8} strokeWidth={1} />
          {/* 4 fingers (left → right: pinky, ring, middle, index) */}
          <rect x={x + 1.8} y={y + 3}   width={1.6} height={5}   rx={0.8} strokeWidth={1} />
          <rect x={x + 3.8} y={y + 1.5} width={1.6} height={6.5} rx={0.8} strokeWidth={1} />
          <rect x={x + 5.8} y={y + 1.5} width={1.6} height={6.5} rx={0.8} strokeWidth={1} />
          <rect x={x + 7.8} y={y + 3}   width={1.6} height={5}   rx={0.8} strokeWidth={1} />
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

/** Ad-hoc marker — bold tilde, drawn as an SVG path so it scales cleanly
 *  and matches the visual weight of the loop and multi-instance markers. */
function AdHocMarker({ cx, cy }: { cx: number; cy: number }) {
  // Tilde drawn as two cubic-bezier humps, total width ~12px, height ~6px
  const w = 6;   // half-width
  const h = 3;   // peak height
  return (
    <path
      d={`M ${cx - w} ${cy} C ${cx - w / 2} ${cy - h}, ${cx - w / 4} ${cy - h}, ${cx} ${cy} S ${cx + w / 2} ${cy + h}, ${cx + w} ${cy}`}
      fill="none"
      stroke="#374151"
      strokeWidth={2}
      strokeLinecap="round"
    />
  );
}

/** Picks the appropriate marker for an element's repeatType. Renders nothing
 *  for repeatType "none" / undefined. */
function RepeatMarker({ el, cx, cy }: { el: DiagramElement; cx: number; cy: number }) {
  if (el.repeatType === "loop") return <LoopMarker cx={cx} cy={cy} />;
  if (el.repeatType === "mi-parallel") return <MultiInstanceMarker cx={cx} cy={cy} orientation="parallel" />;
  if (el.repeatType === "mi-sequential") return <MultiInstanceMarker cx={cx} cy={cy} orientation="sequential" />;
  return null;
}

/** Multi-Instance marker — three short lines, vertical for parallel, horizontal for sequential.
 *  Matches the visual style of the data-object multiplicity collection marker. */
function MultiInstanceMarker({
  cx, cy, orientation,
}: { cx: number; cy: number; orientation: "parallel" | "sequential" }) {
  const lineLen = 9;
  const lineGap = 3;
  const half = lineLen / 2;
  if (orientation === "parallel") {
    // Three vertical lines
    return (
      <g stroke="#374151" strokeWidth={1.5} strokeLinecap="round">
        <line x1={cx - lineGap} y1={cy - half} x2={cx - lineGap} y2={cy + half} />
        <line x1={cx}           y1={cy - half} x2={cx}           y2={cy + half} />
        <line x1={cx + lineGap} y1={cy - half} x2={cx + lineGap} y2={cy + half} />
      </g>
    );
  }
  // Three horizontal lines (sequential)
  return (
    <g stroke="#374151" strokeWidth={1.5} strokeLinecap="round">
      <line x1={cx - half} y1={cy - lineGap} x2={cx + half} y2={cy - lineGap} />
      <line x1={cx - half} y1={cy}           x2={cx + half} y2={cy} />
      <line x1={cx - half} y1={cy + lineGap} x2={cx + half} y2={cy + lineGap} />
    </g>
  );
}

function BpmnTaskShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  return (
    <g>
      <rect x={el.x} y={el.y} width={el.width} height={el.height}
        rx={4} ry={4} fill={resolveColor("task", colors)} stroke="#374151" strokeWidth={1.5} />
      {el.taskType && el.taskType !== "none" && (
        <BpmnTaskMarker taskType={el.taskType} x={el.x + 4} y={el.y + 4} />
      )}
      <RepeatMarker el={el} cx={el.x + el.width / 2} cy={el.y + el.height - 10} />
      {/* ValueBadge rendered in main SymbolRenderer */}
    </g>
  );
}

function formatUmlAttribute(attr: import("@/app/lib/diagram/types").UmlAttribute): string {
  let s = "";
  if (attr.visibility) s += attr.visibility + " ";
  if (attr.isDerived) s += "/";
  s += attr.name;
  if (attr.type) s += " : " + attr.type;
  // NOT NULL overrides multiplicity to show [1]
  if (attr.notNull) s += " [1]";
  else if (attr.multiplicity) s += " [" + attr.multiplicity + "]";
  if (attr.defaultValue) s += " = " + attr.defaultValue;
  // Build constraints string: {PK}, {FK}, custom propertyString
  const constraints: string[] = [];
  if (attr.primaryKey) constraints.push("{PK}");
  if (attr.foreignKey) {
    let fk = "{FK}";
    if (attr.fkTable) fk = attr.fkColumn ? `{FK → ${attr.fkTable}.${attr.fkColumn}}` : `{FK → ${attr.fkTable}}`;
    constraints.push(fk);
  }
  if (attr.propertyString) constraints.push(attr.propertyString);
  if (constraints.length > 0) s += " " + constraints.join(" ");
  return s;
}

function formatUmlOperation(op: import("@/app/lib/diagram/types").UmlOperation): string {
  let s = "";
  if (op.visibility) s += op.visibility + " ";
  s += op.name + "()";
  return s;
}

function UmlClassShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const fsc = useContext(FontScaleCtx);
  const fill = resolveColor("uml-class", colors);
  const db = useContext(DatabaseCtx);
  const isDbDiagram = db && db !== "none";
  const showStereotype = (el.properties.showStereotype as boolean | undefined) ?? !!isDbDiagram;
  const stereotype = isDbDiagram ? "table" : ((el.properties.stereotype as string | undefined) ?? "entity");
  const labelLines = el.label.split("\n");
  const lineH = Math.round(14 * fsc);
  const labelFontSize = Math.round(12 * fsc * 10) / 10;
  const attrFontSize = Math.round(10 * fsc * 10) / 10;
  const stereotypeFontSize = Math.round(9 * fsc * 10) / 10;
  const extraLabelLines = Math.max(0, labelLines.length - 1);
  const stereotypeH = showStereotype ? stereotypeFontSize + 2 : 0; // tight: just text height + 2px
  const headerH = HEADER_H + extraLabelLines * lineH + stereotypeH;
  // Stereotype + class name block centred vertically in header with tight spacing
  const blockH = stereotypeH + labelLines.length * lineH;
  const blockTopY = el.y + (headerH - blockH) / 2;
  const labelStartY = blockTopY + stereotypeH;

  const attributes: import("@/app/lib/diagram/types").UmlAttribute[] =
    (el.properties.attributes as import("@/app/lib/diagram/types").UmlAttribute[] | undefined) ?? [];
  const operations: import("@/app/lib/diagram/types").UmlOperation[] =
    (el.properties.operations as import("@/app/lib/diagram/types").UmlOperation[] | undefined) ?? [];
  const showAttrs = (el.properties.showAttributes as boolean | undefined) ?? false;
  const showOps = (el.properties.showOperations as boolean | undefined) ?? false;

  const PAD = 4;
  const SECTION_PAD = 8; // buffer between last attribute text and divider line / boundary
  const attrsY = el.y + headerH;
  const attrsH = showAttrs ? attributes.length * lineH + (attributes.length > 0 ? SECTION_PAD : 0) : 0;
  const opsY = attrsY + attrsH;
  const opsH = showOps ? operations.length * lineH + (operations.length > 0 ? SECTION_PAD : 0) : 0;

  return (
    <g>
      <rect x={el.x} y={el.y} width={el.width} height={el.height}
        fill={fill} stroke="#374151" strokeWidth={1.5} />
      {/* Header divider — only shown when attributes or operations compartment is visible */}
      {(showAttrs || showOps) && (
        <line x1={el.x} y1={el.y + headerH}
          x2={el.x + el.width} y2={el.y + headerH}
          stroke="#374151" strokeWidth={1} />
      )}
      {/* Stereotype — tight above class name */}
      {showStereotype && (
        <text x={el.x + el.width / 2} y={blockTopY + stereotypeFontSize} textAnchor="middle" fontSize={stereotypeFontSize}
          fill="#6b7280" fontStyle="italic" style={{ pointerEvents: "none", userSelect: "none" }}>
          {`\u00AB${stereotype}\u00BB`}
        </text>
      )}
      {/* Class name */}
      <text textAnchor="middle" fontSize={labelFontSize} fill="#111827" fontWeight="bold"
        style={{ userSelect: "none", pointerEvents: "none" }}>
        {labelLines.map((line, i) => (
          <tspan key={i} x={el.x + el.width / 2} y={labelStartY + i * lineH + lineH * 0.75}>{line}</tspan>
        ))}
      </text>
      {/* Attributes compartment */}
      {showAttrs && attributes.map((attr, i) => (
        <text key={`a${i}`} x={el.x + PAD} y={attrsY + 2 + (i + 1) * lineH - 2}
          fontSize={attrFontSize} fill="#374151"
          style={{ pointerEvents: "none", userSelect: "none" }}>
          {formatUmlAttribute(attr)}
        </text>
      ))}
      {/* Divider between attributes and operations */}
      {showOps && operations.length > 0 && (
        <line x1={el.x} y1={opsY}
          x2={el.x + el.width} y2={opsY}
          stroke="#374151" strokeWidth={1} />
      )}
      {/* Operations compartment */}
      {showOps && operations.map((op, i) => (
        <text key={`o${i}`} x={el.x + PAD} y={opsY + 2 + (i + 1) * lineH - 2}
          fontSize={attrFontSize} fill="#374151"
          style={{ pointerEvents: "none", userSelect: "none" }}>
          {formatUmlOperation(op)}
        </text>
      ))}
    </g>
  );
}

function UmlEnumerationShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const fsc = useContext(FontScaleCtx);
  const fill = resolveColor("uml-enumeration", colors);
  const stereotype = (el.properties.stereotype as string | undefined) ?? "enumeration";
  const values: string[] = (el.properties.values as string[] | undefined) ?? [];
  const valFontSize = Math.round(10 * fsc * 10) / 10;
  const labelFontSize = Math.round(12 * fsc * 10) / 10;
  const lineH = Math.round(14 * fsc);
  const PAD = 4;
  const labelLines = el.label.split("\n");
  const extraLabelLines = Math.max(0, labelLines.length - 1);
  const headerH = HEADER_H + extraLabelLines * lineH;
  // Stereotype at top, then label lines centred in remaining header space
  const stereotypeY = el.y + 10;
  const labelStartY = el.y + 14 + lineH * 0.75;
  return (
    <g>
      <rect x={el.x} y={el.y} width={el.width} height={el.height}
        fill={fill} stroke="#374151" strokeWidth={1.5} />
      <line x1={el.x} y1={el.y + headerH} x2={el.x + el.width} y2={el.y + headerH}
        stroke="#374151" strokeWidth={1} />
      <text x={el.x + el.width / 2} y={stereotypeY} textAnchor="middle" fontSize={Math.round(9 * fsc * 10) / 10}
        fill="#6b7280" fontStyle="italic" style={{ pointerEvents: "none", userSelect: "none" }}>
        {`\u00AB${stereotype}\u00BB`}
      </text>
      {/* Multi-line label in header */}
      <text textAnchor="middle" fontSize={labelFontSize} fill="#111827" fontWeight="bold"
        style={{ userSelect: "none", pointerEvents: "none" }}>
        {labelLines.map((line, i) => (
          <tspan key={i} x={el.x + el.width / 2} y={labelStartY + i * lineH}>{line}</tspan>
        ))}
      </text>
      {/* Values list in second panel */}
      {values.map((v, i) => (
        <text key={i} x={el.x + PAD} y={el.y + headerH + 2 + (i + 1) * lineH - 2}
          fontSize={valFontSize} fill="#374151"
          style={{ pointerEvents: "none", userSelect: "none" }}>
          {v}
        </text>
      ))}
    </g>
  );
}

function ExternalEntityShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  return (
    <g>
      <rect x={el.x} y={el.y} width={el.width} height={el.height}
        fill={resolveColor("external-entity", colors)} stroke="#374151" strokeWidth={1.5} />
    </g>
  );
}

function ProcessSystemShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const r = Math.min(el.width, el.height) / 2;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r}
        fill={resolveColor("process-system", colors)} stroke="#374151" strokeWidth={1.5} />
    </g>
  );
}

function PoolShape({ el }: { el: DiagramElement }) {
  const colors = useContext(SymbolColorCtx);
  const poolFs = useContext(PoolFontSizeCtx);
  const { x, y, width: w, height: h } = el;
  // Header strip width: dynamic per pool (widens when label has 4+ lines
  // or large font). Stored on the element by the reducer after a label
  // or font change; falls back to the legacy default of 36.
  const storedLW = (el.properties?.poolHeaderWidth as number | undefined);
  const LW = typeof storedLW === "number" && storedLW > 0 ? storedLW : 36;
  const cx = x + LW / 2 + 3;
  const cy = y + h / 2;
  const lines = el.label.split('\n');
  const fontSize = Math.round(poolFs * 10) / 10;
  const lineH = Math.round(poolFs * 1.18);
  const isWhiteBox = ((el.properties.poolType as string | undefined) ?? "black-box") === "white-box";
  const multiplicity = (el.properties.multiplicity as string | undefined) ?? "single";
  const mLineH   = 18;
  const mLineGap = 6;
  const mcx      = x + LW + (w - LW) / 2;
  const mly2     = y + h - 3;
  const mly1     = mly2 - mLineH;
  const poolHeaderColour = resolveColor("pool", colors);
  const poolBodyTint = lerpHex(poolHeaderColour, "#ffffff", 0.93);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={poolBodyTint} stroke="#374151" strokeWidth={1.5} />
      <rect x={x} y={y} width={LW} height={h} fill={poolHeaderColour} stroke="#374151" strokeWidth={1.5}
        style={isWhiteBox ? { cursor: "pointer" } : undefined} />
      <text textAnchor="middle" fontSize={fontSize} fill="#3b1a08" fontWeight="bold"
            transform={`rotate(-90,${cx},${cy})`}
            textRendering="geometricPrecision"
            style={{
              userSelect: "none",
              pointerEvents: "none",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
              // Force the browser onto its high-quality SVG text path —
              // without this, rotated text frequently grabs the cheap
              // "optimizeSpeed" rasteriser and looks visibly fuzzy.
              WebkitFontSmoothing: "antialiased",
              MozOsxFontSmoothing: "grayscale",
            }}>
        {lines.map((line, i) => (
          <tspan key={i} x={cx} y={cy + (i - (lines.length - 1) / 2) * lineH}>{line}</tspan>
        ))}
      </text>
      {multiplicity === "collection" && (
        <g stroke="#374151" strokeWidth={1.5}>
          <line x1={mcx - mLineGap} y1={mly1} x2={mcx - mLineGap} y2={mly2} />
          <line x1={mcx}            y1={mly1} x2={mcx}            y2={mly2} />
          <line x1={mcx + mLineGap} y1={mly1} x2={mcx + mLineGap} y2={mly2} />
        </g>
      )}
    </g>
  );
}

function LaneShape({ el, isSublane }: { el: DiagramElement; isSublane?: boolean }) {
  const colors = useContext(SymbolColorCtx);
  const laneFs = useContext(LaneFontSizeCtx);
  const laneDepth = useContext(LaneDepthCtx).get(el.id) ?? 0;
  const { x, y, width: w, height: h } = el;
  // Dynamic lane header width — set by the reducer when a sibling label
  // grows tall enough to need >36px. Falls back to the legacy default.
  const storedLW = el.properties?.laneHeaderWidth as number | undefined;
  const LW = typeof storedLW === "number" && storedLW > 0 ? storedLW : 36;
  const cx = x + LW / 2 + 3;
  const cy = y + h / 2;
  const lines = el.label.split('\n');
  const fontSize = Math.round(laneFs * 10) / 10;
  const lineH = Math.round(laneFs * 1.2);
  // Lighten fill based on nesting depth beyond direct sublane (depth 1)
  const baseFill = resolveColor(isSublane ? "sublane" : "lane", colors);
  // depth 0 = top-level lane, 1 = sublane (baseFill already), 2+ = sub-sublane (lighten)
  const lightenFrac = Math.min((laneDepth - 1) * 0.25, 0.8);
  const headerFill = laneDepth > 1 ? lerpHex(baseFill, "#ffffff", lightenFrac) : baseFill;
  const bodyTint = lerpHex(headerFill, "#ffffff", 0.93);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={bodyTint} stroke="#374151" strokeWidth={1} />
      <rect x={x} y={y} width={LW} height={h} fill={headerFill} stroke="#374151" strokeWidth={1} />
      <text textAnchor="middle" fontSize={fontSize} fill="#3b1a08" fontWeight="bold"
            transform={`rotate(-90,${cx},${cy})`}
            textRendering="geometricPrecision"
            style={{
              userSelect: "none",
              pointerEvents: "none",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
              WebkitFontSmoothing: "antialiased",
              MozOsxFontSmoothing: "grayscale",
            }}>
        {lines.map((line, i) => (
          <tspan key={i} x={cx} y={cy + (i - (lines.length - 1) / 2) * lineH}>{line}</tspan>
        ))}
      </text>
    </g>
  );
}

function SymbolShape({ el }: { el: DiagramElement }) {
  const mode = useContext(DisplayModeCtx);
  const sublaneIds = useContext(SublaneIdsCtx);
  const shape = (() => {
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
      case "submachine":      return <SubmachineShape el={el} />;
      case "chevron":             return <ChevronShape el={el} />;
      case "chevron-collapsed":   return <ChevronCollapsedShape el={el} />;
      case "process-group":       return <ProcessGroupShape el={el} />;
      case "fork-join":     return <ForkJoinShape el={el} />;
      case "system-boundary":   return <SystemBoundaryShape el={el} />;
      case "composite-state":   return <CompositeStateShape el={el} />;
      case "group":             return <GroupShape el={el} />;
      case "text-annotation":   return <TextAnnotationShape el={el} />;
      case "review-comment":    return <ReviewCommentShape el={el} />;
      case "system":            return <SystemShape el={el} />;
      case "pool":              return <PoolShape el={el} />;
      case "lane":              return <LaneShape el={el} isSublane={sublaneIds.has(el.id)} />;
      case "task":
        return el.taskType !== undefined ? <BpmnTaskShape el={el} /> : <TaskShape el={el} />;
      case "subprocess":
        // Return-link variants are no longer rendered on the canvas — the
        // back-link is surfaced via the Properties panel's parents list.
        // Stale return-link elements in existing diagram data are cleaned
        // up by the scan-links sweep; until then, render nothing.
        return (el.properties.isReturnLink as boolean | undefined)
          ? null
          : <SubprocessShape el={el} />;
      case "subprocess-expanded": return <ExpandedSubprocessShape el={el} />;
      case "uml-class":             return <UmlClassShape el={el} />;
      case "uml-enumeration":       return <UmlEnumerationShape el={el} />;
      case "external-entity":     return <ExternalEntityShape el={el} />;
      case "process-system":      return <ProcessSystemShape el={el} />;
      case "archimate-shape":     return <ArchimateShape el={el} />;
      default:                  return <TaskShape el={el} />;
    }
  })();
  return <g filter={sketchyFilter(mode)}>{shape}</g>;
}

function getLabelPos(el: DiagramElement, archimateDepth: number = 0): { x: number; y: number; baseline: "hanging" | "middle" | "auto" } {
  if (el.type === "actor" || el.type === "team" || el.type === "hourglass" || el.type === "system") {
    return { x: el.x + el.width / 2, y: el.y + el.height + 12, baseline: "hanging" };
  }
  // ArchiMate shapes:
  //   - Icon-only Actor → label BELOW the stick figure
  //   - Has descendants (any depth > 0) → label at TOP
  //   - Default → label centred inside
  if (el.type === "archimate-shape") {
    const iconOnly = !!el.properties?.archimateIconOnly;
    const isActorIcon = iconOnly && typeof el.properties?.shapeKey === "string" &&
      (el.properties.shapeKey as string).includes("actor");
    if (isActorIcon) {
      // Tight gap so the label hugs the figure's feet — the box already
      // hugs the figure (size = el.height), leaving only ~3px of slack
      // between the feet and the box bottom.
      return { x: el.x + el.width / 2, y: el.y + el.height + 2, baseline: "hanging" };
    }
    if (archimateDepth > 0) {
      return { x: el.x + el.width / 2, y: el.y + HEADER_H / 2, baseline: "middle" };
    }
    // fall through to default centred
  }
  if (el.type === "system-boundary" || el.type === "composite-state" || el.type === "group" || el.type === "process-group") {
    return { x: el.x + el.width / 2, y: el.y + HEADER_H / 2, baseline: "middle" };
  }
  if (el.type === "uml-class") {
    return { x: el.x + el.width / 2, y: el.y + HEADER_H / 2, baseline: "middle" };
  }
  if (el.type === "uml-enumeration") {
    return { x: el.x + el.width / 2, y: el.y + HEADER_H / 2 + 6, baseline: "middle" };
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
  isAssocBpmnTarget,
  isErrorTarget,
  isElementDragTarget,
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
  onLabelFocusEditStart,
  onLabelFocusEditEnd,
  colorConfig,
  multiSelected,
  onGroupMove,
  onGroupMoveEnd,
  onDrillBack,
  showValueDisplay,
  onEnterConnectionMode,
  onCancelConnectionMode,
  inConnectionMode,
  debugMode,
  canSwapLaneUp,
  canSwapLaneDown,
  onSwapLane,
}: Props) {
  const fontScale = useContext(FontScaleCtx);
  const processFontSize = useContext(ProcessFontSizeCtx);
  const fs = (base: number) => Math.round(base * fontScale * 10) / 10;
  const [isEditingGatewayLabel, setIsEditingGatewayLabel] = useState(false);
  const [editGatewayLabelValue, setEditGatewayLabelValue] = useState("");
  const [labelHighlighted, setLabelHighlighted] = useState(false);
  // Return-link variants are no longer rendered on the canvas. Skip the
  // entire element (shape, label, selection box, drill marker, hit zones).
  // The scan-links sweep will eventually drop these elements from data;
  // until then this guard keeps them invisible.
  const isHiddenReturnLink =
    element.type === "subprocess" &&
    (element.properties.isReturnLink as boolean | undefined) === true;
  // Pool edge resize: visible grip only appears while the user is actively
  // dragging an edge. Hit-zones stay invisible & click-catching; grip fades
  // out on mouseup. State tracks WHICH side is active so only that side's
  // grip renders during a drag.
  const [poolResizeActive, setPoolResizeActive] = useState<null | "e" | "w" | "n" | "s">(null);
  // Shift-drag visual: flashing purple outline while the user is
  // holding Shift through a drag (the "escape EP" gesture). State
  // tracks whether the current drag is in unconstrained mode. The
  // outline renders only when this is true.
  const [shiftEscaping, setShiftEscaping] = useState(false);
  // Clear label highlight when element is deselected
  if (!selected && labelHighlighted) setLabelHighlighted(false);
  let dragStart: { mouseX: number; mouseY: number; elX: number; elY: number } | null = null;

  function handleMouseDown(e: React.MouseEvent) {
    // Header-only selection model (matches PoolShape / LaneShape LW = 36):
    //   - White-box pool: only the 36px left header sidebar selects the pool.
    //     Body clicks bubble so lanes / child elements / bg-deselect can win.
    //   - Lane: only the 36px left header selects the lane. Body clicks bubble
    //     so tasks inside can be clicked, or empty lane body deselects.
    //   - Black-box pools are solid click-to-select anywhere (no change).
    const isWhiteBoxPool = element.type === "pool" &&
      ((element.properties.poolType as string | undefined) ?? "black-box") === "white-box";
    const isLane = element.type === "lane";
    if (isWhiteBoxPool || isLane) {
      // EXCEPTION: when the pool/lane is part of a multi-selection (e.g. a
      // template was just stamped and the whole group is selected), ANY
      // click on it — header or body — initiates the group drag. Without
      // this, clicking a Pool/Lane in the selection either deselects
      // (header) or bubbles through to a child (body), and the user has
      // to hunt for a non-Pool element to drag the group.
      if (multiSelected && onGroupMove) {
        e.stopPropagation();
        beginElementDrag(e);
        return;
      }
      // Both pools and lanes can have dynamic header widths now.
      const stored = element.type === "pool"
        ? (element.properties?.poolHeaderWidth as number | undefined)
        : (element.properties?.laneHeaderWidth as number | undefined);
      const HEADER_LW = typeof stored === "number" && stored > 0 ? stored : 36;
      const worldPos = svgToWorld ? svgToWorld(e.clientX, e.clientY) : null;
      if (worldPos) {
        const headerHit = worldPos.x <= element.x + HEADER_LW;
        // White-box pools also accept clicks on or near any of the four
        // boundary edges (per user spec). 8 px tolerance — matches the
        // resize-handle visual extent. Lanes keep header-only selection.
        let boundaryHit = false;
        if (isWhiteBoxPool) {
          const TOL = 8;
          const px = worldPos.x, py = worldPos.y;
          const inX = px >= element.x - TOL && px <= element.x + element.width + TOL;
          const inY = py >= element.y - TOL && py <= element.y + element.height + TOL;
          const onLeft   = Math.abs(px - element.x) <= TOL;
          const onRight  = Math.abs(px - (element.x + element.width)) <= TOL;
          const onTop    = Math.abs(py - element.y) <= TOL;
          const onBottom = Math.abs(py - (element.y + element.height)) <= TOL;
          boundaryHit = inX && inY && (onLeft || onRight || onTop || onBottom);
        }
        if (!headerHit && !boundaryHit) return; // body click far from boundary — bubble
        // Boundary-only click: select the pool but don't kick off a
        // pool-move drag. The pool's resize handles sit in the same
        // zone (±10 px around each edge) and a drag started here would
        // race with the resize tracker. Pool moves are still possible
        // via the left header strip (`headerHit`).
        if (boundaryHit && !headerHit) {
          e.stopPropagation();
          if (selected) onSelect();                                  // boundary re-click — deselect
          else onSelect(e);                                           // first-click selection
          return;
        }
      }
      e.stopPropagation();
      if (selected) { onSelect(); return; }                        // header re-click — deselect, no drag
    } else if (element.type === "pool") {
      // Black-box pool: clicks on (or within ±10 px of) any edge
      // belong to the edge resize hit-zone. Without this branch the
      // mousedown ALSO starts a MOVE drag because the edge zone
      // deliberately doesn't stopPropagation (so a plain click still
      // selects). Net effect: dragging the bottom edge moves the
      // pool body instead of resizing it. Skip the MOVE drag for
      // edge-zone clicks; only select. Multi-selected groups still
      // body-drag from anywhere.
      if (!(multiSelected && onGroupMove) && svgToWorld) {
        const wp = svgToWorld(e.clientX, e.clientY);
        if (wp) {
          const TOL = 10;
          const px = wp.x, py = wp.y;
          const inX = px >= element.x - TOL && px <= element.x + element.width + TOL;
          const inY = py >= element.y - TOL && py <= element.y + element.height + TOL;
          const onRight  = Math.abs(px - (element.x + element.width)) <= TOL;
          const onTop    = Math.abs(py - element.y) <= TOL;
          const onBottom = Math.abs(py - (element.y + element.height)) <= TOL;
          // Pools never resize their left edge — no onLeft case.
          if (inX && inY && (onRight || onTop || onBottom)) {
            e.stopPropagation();
            if (selected) onSelect();
            else onSelect(e);
            return;
          }
        }
      }
      e.stopPropagation();
    } else {
      e.stopPropagation();
    }

    setLabelHighlighted(false);
    const wasSelected = selected;
    onSelect(e);

    // Task/Subprocess click model:
    //   1. Click (not selected) → select
    //   2. Click again on already-selected → enter connection-creation mode
    //   3. Drag → move element
    //   4. Double-click → edit label
    const isTaskLike =
      element.type === "task" ||
      element.type === "subprocess" ||
      element.type === "subprocess-expanded" ||
      element.type === "state" ||
      element.type === "submachine" ||
      element.type === "composite-state" ||
      element.type === "gateway" ||
      element.type === "fork-join" ||
      element.type === "chevron" ||
      element.type === "chevron-collapsed";
    if (isTaskLike && !multiSelected && onEnterConnectionMode) {
      // If the click landed inside an EP edge resize zone (±10 px from
      // any edge), the resize hit rect owns the drag. We deliberately
      // skip the MOVE drag here so the two don't dispatch concurrent
      // RESIZE_ELEMENT + MOVE_ELEMENT actions per frame — that produced
      // EP children drifting downward, top edge appearing to chase the
      // bottom, and sequence-connected externals jumping aside.
      if (element.type === "subprocess-expanded" && svgToWorld) {
        const wp = svgToWorld(e.clientX, e.clientY);
        if (wp) {
          const TOL = 10;
          const onLeft   = Math.abs(wp.x - element.x) <= TOL;
          const onRight  = Math.abs(wp.x - (element.x + element.width)) <= TOL;
          const onTop    = Math.abs(wp.y - element.y) <= TOL;
          const onBottom = Math.abs(wp.y - (element.y + element.height)) <= TOL;
          if (onLeft || onRight || onTop || onBottom) return;
        }
      }
      const MOVE_THRESHOLD = 4;
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      let dragStartedFlag = false;

      const onPreMove = (ev: MouseEvent) => {
        if (dragStartedFlag) return;
        if (Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY) > MOVE_THRESHOLD) {
          dragStartedFlag = true;
          window.removeEventListener("mousemove", onPreMove);
          window.removeEventListener("mouseup", onPreUp);
          beginElementDrag(e);
        }
      };
      const onPreUp = () => {
        if (dragStartedFlag) return;
        window.removeEventListener("mousemove", onPreMove);
        window.removeEventListener("mouseup", onPreUp);
        if (wasSelected && onEnterConnectionMode) onEnterConnectionMode();
      };
      window.addEventListener("mousemove", onPreMove);
      window.addEventListener("mouseup", onPreUp);
      return;
    }

    beginElementDrag(e);
  }

  function beginElementDrag(e: React.MouseEvent) {

    // Group drag mode: when multi-selected and clicking a selected element
    if (multiSelected && onGroupMove) {
      let lastClientX = e.clientX;
      let lastClientY = e.clientY;
      let autoScrollTimer: ReturnType<typeof setInterval> | null = null;
      let lastEv: MouseEvent | null = null;

      const EDGE = 40; // px from edge to trigger auto-scroll
      const SCROLL_SPEED = 8; // px per tick

      function startAutoScroll() {
        if (autoScrollTimer) return;
        autoScrollTimer = setInterval(() => {
          if (!lastEv) return;
          const svg = document.querySelector("[data-canvas]") as SVGSVGElement | null;
          if (!svg) return;
          const rect = svg.getBoundingClientRect();
          let sdx = 0, sdy = 0;
          if (lastEv.clientX < rect.left + EDGE) sdx = SCROLL_SPEED;
          else if (lastEv.clientX > rect.right - EDGE) sdx = -SCROLL_SPEED;
          if (lastEv.clientY < rect.top + EDGE) sdy = SCROLL_SPEED;
          else if (lastEv.clientY > rect.bottom - EDGE) sdy = -SCROLL_SPEED;
          if (sdx !== 0 || sdy !== 0) onGroupMove!(sdx, sdy);
        }, 30);
      }

      function stopAutoScroll() {
        if (autoScrollTimer) { clearInterval(autoScrollTimer); autoScrollTimer = null; }
      }

      function onMouseMove(ev: MouseEvent) {
        const dx = ev.clientX - lastClientX;
        const dy = ev.clientY - lastClientY;
        lastClientX = ev.clientX;
        lastClientY = ev.clientY;
        lastEv = ev;
        onGroupMove!(dx, dy);

        // Check if near canvas edge
        const svg = document.querySelector("[data-canvas]") as SVGSVGElement | null;
        if (svg) {
          const rect = svg.getBoundingClientRect();
          const nearEdge = ev.clientX < rect.left + EDGE || ev.clientX > rect.right - EDGE ||
                           ev.clientY < rect.top + EDGE || ev.clientY > rect.bottom - EDGE;
          if (nearEdge) startAutoScroll();
          else stopAutoScroll();
        }
      }

      function onMouseUp() {
        stopAutoScroll();
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        onGroupMoveEnd?.();
      }

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      return;
    }

    // Single element drag — use svgToWorld to convert client→world so zoom is respected
    const startWorld = svgToWorld ? svgToWorld(e.clientX, e.clientY) : { x: e.clientX, y: e.clientY };
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
      const curWorld = svgToWorld ? svgToWorld(ev.clientX, ev.clientY) : { x: ev.clientX, y: ev.clientY };
      lastX = dragStart.elX + (curWorld.x - startWorld.x);
      lastY = dragStart.elY + (curWorld.y - startWorld.y);
      onMove(lastX, lastY, ev.shiftKey);
      // Visual feedback for Shift-drag (the EP-escape gesture). Reacts
      // mid-drag if the user presses or releases Shift between moves.
      setShiftEscaping(ev.shiftKey);
    }

    function onMouseUp() {
      const origX = dragStart!.elX;
      const origY = dragStart!.elY;
      dragStart = null;
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
      setShiftEscaping(false);
      if (shouldSnapBack?.(lastX, lastY)) {
        onMove(origX, origY);
      } else {
        onMoveEnd?.();
      }
    }

    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key !== "Escape" || !dragStart) return;
      const { elX, elY } = dragStart;
      dragStart = null;
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
      setShiftEscaping(false);
      onMove(elX, elY);
      onMoveEnd?.();
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);
  }

  const archimateDepthMap = useContext(ArchimateDepthCtx);
  const labelInfo = getLabelPos(element, archimateDepthMap.get(element.id) ?? 0);
  const isActorOrTeam = element.type === "actor" || element.type === "team" || element.type === "system";
  const isBoundary = element.type === "system-boundary";  // excluded from connection overlay
  const isPoolLane = element.type === "pool" || element.type === "lane";
  const isWhiteBoxPool = element.type === "pool" &&
    ((element.properties.poolType as string | undefined) ?? "black-box") === "white-box";
  const isContainer = isBoundary || element.type === "composite-state" || isPoolLane; // gets resize handles
  const canResize = element.type !== "lane"; // all types except lane can be resized
  const isBoundaryStartOrEnd = !!element.boundaryHostId &&
    (element.type === "start-event" || element.type === "end-event");
  const showLabel = element.type !== "initial-state" && element.type !== "final-state" && element.type !== "fork-join" && !isBoundaryStartOrEnd;

  // Return-link elements are no longer rendered.
  if (isHiddenReturnLink) return null;

  return (
    <SymbolColorCtx.Provider value={colorConfig}>
    <ShowValueDisplayCtx.Provider value={!!showValueDisplay}>
    <g
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        // For pools, only trigger label edit when double-clicking the header strip (left 36px)
        if (element.type === "pool" && svgToWorld) {
          const world = svgToWorld(e.clientX, e.clientY);
          if (world.x > element.x + 36) return;
        }
        onDoubleClick();
      }}
      // Cursor scheme (G05): grabbable elements get .dgx-grab so the
      // CSS :active pseudo swaps grab→grabbing while the mouse is down.
      // White-box pool bodies and boundary events keep the default
      // arrow — their interaction is selection, not translation.
      className={(isBoundary || isWhiteBoxPool) ? undefined : "dgx-grab"}
      style={(isBoundary || isWhiteBoxPool) ? { cursor: "default" } : undefined}
    >
      <SymbolShape el={element} />

      {/* Lane-swap UI: 4-edge highlight + ↑/↓ arrow buttons on the
          header strip. Visible only on a selected top-level lane that
          received `canSwapLaneUp` / `canSwapLaneDown` props from Canvas
          (Canvas decides eligibility — sub-lanes don't get these). */}
      {element.type === "lane" && selected && (canSwapLaneUp !== undefined || canSwapLaneDown !== undefined) && (() => {
        const stored = element.properties?.laneHeaderWidth as number | undefined;
        const HEADER_W = typeof stored === "number" && stored > 0 ? stored : 36;
        const BTN_M = 4;                          // margin from header edges
        const BTN_W = HEADER_W - 2 * BTN_M;
        const BTN_H = Math.min(28, Math.max(20, element.height * 0.18));
        // Arrow geometry — triangle pointing up/down inside the button rect.
        const upX = element.x + BTN_M, upY = element.y + BTN_M;
        const dnX = element.x + BTN_M, dnY = element.y + element.height - BTN_M - BTN_H;
        const tri = (cx: number, cy: number, dir: "up" | "down") => {
          const h = Math.min(10, BTN_H * 0.5);
          const w = Math.min(BTN_W * 0.5, 12);
          return dir === "up"
            ? `${cx},${cy - h / 2} ${cx - w / 2},${cy + h / 2} ${cx + w / 2},${cy + h / 2}`
            : `${cx},${cy + h / 2} ${cx - w / 2},${cy - h / 2} ${cx + w / 2},${cy - h / 2}`;
        };
        const upEnabled = !!canSwapLaneUp;
        const dnEnabled = !!canSwapLaneDown;
        const fill = (en: boolean) => en ? "#3b82f6" : "#d1d5db";
        const bg   = (en: boolean) => en ? "#eff6ff" : "#f3f4f6";
        return (
          <g pointerEvents="all">
            {/* 4-edge highlight — single rect with no fill, heavier stroke. */}
            <rect
              x={element.x + 1}
              y={element.y + 1}
              width={element.width - 2}
              height={element.height - 2}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={2.5}
              pointerEvents="none"
            />
            {/* Up arrow button. */}
            {canSwapLaneUp !== undefined && (
              <g
                onMouseDown={(e) => { e.stopPropagation(); }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (upEnabled && onSwapLane) onSwapLane("up");
                }}
                style={{ cursor: upEnabled ? "pointer" : "not-allowed" }}
              >
                <rect x={upX} y={upY} width={BTN_W} height={BTN_H}
                      fill={bg(upEnabled)} stroke={fill(upEnabled)} strokeWidth={1} rx={3} ry={3} />
                <polygon
                  points={tri(upX + BTN_W / 2, upY + BTN_H / 2, "up")}
                  fill={fill(upEnabled)}
                  pointerEvents="none"
                />
              </g>
            )}
            {/* Down arrow button. */}
            {canSwapLaneDown !== undefined && (
              <g
                onMouseDown={(e) => { e.stopPropagation(); }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (dnEnabled && onSwapLane) onSwapLane("down");
                }}
                style={{ cursor: dnEnabled ? "pointer" : "not-allowed" }}
              >
                <rect x={dnX} y={dnY} width={BTN_W} height={BTN_H}
                      fill={bg(dnEnabled)} stroke={fill(dnEnabled)} strokeWidth={1} rx={3} ry={3} />
                <polygon
                  points={tri(dnX + BTN_W / 2, dnY + BTN_H / 2, "down")}
                  fill={fill(dnEnabled)}
                  pointerEvents="none"
                />
              </g>
            )}
          </g>
        );
      })()}

      {/* Shift-drag escape — pulsing purple halo while the user holds
          Shift through a drag, signalling that the element is free to
          cross EP / lane / pool boundaries without the EP chasing it.
          SMIL `animate` keeps the pulse self-contained (no CSS setup
          needed). Renders just outside the symbol with a 4 px gap so
          it doesn't clash with the symbol's own stroke. */}
      {shiftEscaping && (
        <rect
          x={element.x - 4}
          y={element.y - 4}
          width={element.width + 8}
          height={element.height + 8}
          fill="none"
          stroke="#a855f7"
          strokeWidth={3}
          rx={6}
          ry={6}
          pointerEvents="none"
        >
          <animate attributeName="opacity" values="1;0.25;1" dur="0.6s" repeatCount="indefinite" />
        </rect>
      )}

      {/* Chevron description box — shown below the chevron when showDescription is true */}
      {(element.type === "chevron" || element.type === "chevron-collapsed") &&
        !!element.properties.showDescription && (() => {
        const desc = (element.properties.description as string | undefined) ?? "";
        if (!desc && !selected) return null;
        const descY = element.y + element.height + 4;
        const notch = Math.min(20, element.width * 0.15);
        const descW = element.width - notch; // left corner to right end of bottom side
        const descX = element.x;
        const PAD = 4;
        const FONT_SIZE = 10;
        const LINE_H = 13;
        const CHAR_W = FONT_SIZE * 0.48; // approximate average char width for sans-serif at 10px
        const maxChars = Math.floor((descW - PAD * 2) / CHAR_W);

        // Word-wrap: split on explicit newlines, then wrap each paragraph
        function wrapText(text: string): string[] {
          const result: string[] = [];
          for (const paragraph of text.split("\n")) {
            if (!paragraph) { result.push(""); continue; }
            const words = paragraph.split(/\s+/);
            let line = "";
            for (const word of words) {
              const test = line ? line + " " + word : word;
              if (test.length > maxChars && line) {
                result.push(line);
                line = word;
              } else {
                line = test;
              }
            }
            if (line) result.push(line);
          }
          return result.length ? result : [""];
        }

        const wrappedLines = wrapText(desc);
        const descH = wrappedLines.length * LINE_H + PAD * 2;

        return (
          <g>
            <rect x={descX} y={descY} width={descW} height={descH}
              rx={3} fill="white" stroke="#d1d5db" strokeWidth={0.5}
              style={{ pointerEvents: "all", cursor: "text" }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onUpdateProperties?.(element.id, { _editingDescription: true });
              }}
            />
            {!(element.properties._editingDescription) ? (
              <text fontSize={FONT_SIZE} fill="#4b5563"
                style={{ userSelect: "none", pointerEvents: "none" }}>
                {wrappedLines.map((line, i) => (
                  <tspan key={i} x={descX + PAD} y={descY + PAD + LINE_H * 0.85 + i * LINE_H}>
                    {line || "\u00A0"}
                  </tspan>
                ))}
              </text>
            ) : (
              <foreignObject x={descX} y={descY} width={descW} height={Math.max(descH, LINE_H * 3 + PAD * 2)}>
                <textarea
                  autoFocus
                  defaultValue={desc}
                  onFocus={(e) => { const t = e.target; setTimeout(() => t.select(), 0); }}
                  onBlur={(e) => {
                    onUpdateProperties?.(element.id, {
                      description: e.target.value || undefined,
                      _editingDescription: undefined,
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      onUpdateProperties?.(element.id, { _editingDescription: undefined });
                    }
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      (e.target as HTMLTextAreaElement).blur();
                    }
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    width: "100%", height: "100%",
                    fontSize: FONT_SIZE, fontFamily: "inherit", lineHeight: LINE_H + "px",
                    resize: "none", border: "none", outline: "1px solid #93c5fd",
                    background: "white", padding: PAD + "px",
                    boxSizing: "border-box", overflow: "hidden",
                    wordWrap: "break-word", whiteSpace: "pre-wrap",
                  }}
                />
              </foreignObject>
            )}
          </g>
        );
      })()}

      {/* Value analysis badge (task/subprocess only, when Value Display is on) */}
      {showValueDisplay && (element.type === "task" || element.type === "subprocess" || element.type === "subprocess-expanded") && (
        <ValueBadge el={element} show={true} />
      )}

      {/* Subprocess drill-through — hit area on the + marker (only when linked).
          For return-link variants (isReturnLink: true) the WHOLE element is the
          hit zone, not just the +/- marker, since the return-link visual has
          no +/- and is intended to be clickable as one piece. */}
      {element.type === "subprocess" && (element.properties.linkedDiagramId as string | undefined) && (() => {
        const isReturn = !!(element.properties.isReturnLink as boolean | undefined);
        if (isReturn) {
          return (
            <rect
              x={element.x} y={element.y} width={element.width} height={element.height}
              fill="transparent" stroke="none"
              style={{ cursor: "pointer", pointerEvents: "all" }}
              onMouseDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
            />
          );
        }
        const mw = 14, mh = 14;
        const pmx = element.x + element.width / 2 - mw / 2;
        const pmy = element.y + element.height - mh - 3;
        return (
          <rect
            x={pmx - 2} y={pmy - 2} width={mw + 4} height={mh + 4}
            fill="transparent" stroke="none"
            style={{ cursor: "pointer", pointerEvents: "all" }}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
          />
        );
      })()}

      {/* Collapsed chevron drill-through — hit area on the + marker (only when linked) */}
      {element.type === "chevron-collapsed" && (element.properties.linkedDiagramId as string | undefined) && (() => {
        const mw = 14, mh = 14;
        const pmx = element.x + element.width / 2 - mw / 2;
        const pmy = element.y + element.height - mh - 3;
        return (
          <rect
            x={pmx - 2} y={pmy - 2} width={mw + 4} height={mh + 4}
            fill="transparent" stroke="none"
            style={{ cursor: "pointer", pointerEvents: "all" }}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
          />
        );
      })()}

      {/* SubMachine drill-through — hit area on the marker (only when linked) */}
      {element.type === "submachine" && (element.properties.linkedDiagramId as string | undefined) && (() => {
        const mSize = 16;
        const hmx = element.x + element.width - mSize - 4;
        const hmy = element.y + element.height - mSize / 2 - 5;
        return (
          <rect
            x={hmx - 4} y={hmy - 6} width={mSize + 8} height={mSize}
            fill="transparent" stroke="none"
            style={{ cursor: "pointer", pointerEvents: "all" }}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
          />
        );
      })()}

      {/* Process Context central process (use-case) drill-through — a blue
          drill badge at the bottom of the ellipse plus a hit area, so the
          link is visible and clickable even in the read-only viewer. */}
      {element.type === "use-case" && (element.properties.linkedDiagramId as string | undefined) && (() => {
        const mw = 14, mh = 14;
        const pmx = element.x + element.width / 2 - mw / 2;
        const pmy = element.y + element.height - mh - 6;
        return (
          <g>
            <rect x={pmx} y={pmy} width={mw} height={mh} rx={2}
              fill="#eff6ff" stroke="#2563eb" strokeWidth={1} style={{ pointerEvents: "none" }} />
            <path
              d={`M ${pmx + 7} ${pmy + 3.5} L ${pmx + 7} ${pmy + 9} M ${pmx + 4.5} ${pmy + 6.5} L ${pmx + 7} ${pmy + 9} L ${pmx + 9.5} ${pmy + 6.5}`}
              stroke="#2563eb" strokeWidth={1.3} fill="none" strokeLinecap="round" strokeLinejoin="round"
              style={{ pointerEvents: "none" }}
            />
            <rect
              x={pmx - 2} y={pmy - 2} width={mw + 4} height={mh + 4}
              fill="transparent" stroke="none"
              style={{ cursor: "pointer", pointerEvents: "all" }}
              onMouseDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
            />
          </g>
        );
      })()}

      {/* Drill-back icon on start events when this diagram was navigated to from a subprocess/substate */}
      {(element.type === "start-event" || element.type === "initial-state") && onDrillBack && !element.boundaryHostId && (
        <g
          transform={`translate(${element.x - 2},${element.y - 2})`}
          style={{ cursor: "pointer", pointerEvents: "all" }}
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => { e.stopPropagation(); onDrillBack(); }}
        >
          <rect x={-12} y={-4} width={16} height={14} fill="transparent" />
          <path d="M0 4L-4 0L0 -4" fill="none" stroke="#2563eb" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M-4 4L-8 0L-4 -4" fill="none" stroke="#2563eb" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {showLabel && (
        element.type === 'start-event'        ||
        element.type === 'end-event'          ||
        element.type === 'intermediate-event' ||
        element.type === 'gateway'            ||
        element.type === 'data-object'        ||
        element.type === 'data-store'
      ) && !(element.type === 'gateway' && (element.properties.gatewayRole as string | undefined) === 'merge') ? (() => {
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
          onSelect(e);
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
            {(selected && !multiSelected || isEditingGatewayLabel) && (
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
              stroke={selected && !multiSelected ? "#2563eb" : "none"}
              strokeWidth={1}
              strokeDasharray={selected && !multiSelected ? "3 2" : undefined}
              style={{
                cursor: onUpdateProperties ? "grab" : "default",
                // While the inline label editor is open, the rect (which
                // sits BEHIND the foreignObject) must not steal clicks
                // from the textarea — SVG hit testing can route a click
                // back to this rect when the click lands on a region of
                // the foreignObject the browser treats as transparent.
                // Disabling pointer events keeps focus inside the
                // textarea so clicking to position the cursor doesn't
                // accidentally re-trigger handleLabelMouseDown (which
                // calls onSelect → re-renders parents → unmounts the
                // edit) and doesn't commit on first click.
                pointerEvents: isEditingGatewayLabel ? "none" : "auto",
              }}
              onMouseDown={handleLabelMouseDown}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditGatewayLabelValue(element.label);
                setIsEditingGatewayLabel(true);
                // Focus-edit zoom — snap the canvas to centre this label.
                // Exits fire from the onBlur / Escape paths below.
                onLabelFocusEditStart?.(
                  labelCenterX,
                  labelTopY + Math.max(totalLabelH, 16) / 2,
                  labelWidth,
                );
              }}
            />
            {!isEditingGatewayLabel && (
              <text
                textAnchor="middle"
                fontSize={fs(11)}
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
                fontSize={fs(10)}
                fill="#374151"
                style={{ userSelect: "none", pointerEvents: "none" }}
              >
                {`[${element.properties.state as string}]`}
              </text>
            )}
            {isEditingGatewayLabel && (
              <foreignObject x={hitRectX - 4} y={hitRectY - 4} width={labelWidth + 8} height={Math.max(totalLabelH, 28) + 8}>
                <textarea
                  autoFocus
                  onFocus={(e) => { const t = e.target; setTimeout(() => t.select(), 0); }}
                  value={editGatewayLabelValue}
                  // Stop pointer events from reaching the SVG canvas
                  // beneath. Without this, clicking inside the textarea
                  // bubbled up to the canvas's mousedown handler, which
                  // treated it as a click outside the textarea and
                  // committed the edit immediately. stopImmediatePropagation
                  // on the native event covers any native event listeners
                  // the canvas attaches via addEventListener (React's
                  // synthetic stopPropagation only stops bubbling through
                  // the React tree).
                  onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                  onClick={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                  onDoubleClick={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                  onChange={(e) => setEditGatewayLabelValue(e.target.value)}
                  onBlur={(e) => {
                    setIsEditingGatewayLabel(false);
                    onUpdateLabel?.(element.id, e.target.value);
                    onLabelFocusEditEnd?.();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setIsEditingGatewayLabel(false);
                      onLabelFocusEditEnd?.();
                    }
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      (e.target as HTMLTextAreaElement).blur();
                    }
                  }}
                  style={{
                    // Inset the textarea 4px inside the padded foreignObject so
                    // the full border is visible (not clipped) — item 3.
                    width: "calc(100% - 8px)", height: "calc(100% - 8px)", margin: 4,
                    fontSize: 11, fontFamily: "inherit",
                    resize: "none", border: "1.5px solid #2563eb", borderRadius: 3,
                    outline: "none",
                    background: "white", padding: "1px 2px",
                    textAlign: "center", lineHeight: "14px", boxSizing: "border-box",
                  }}
                />
              </foreignObject>
            )}
            {selected && !multiSelected && onUpdateProperties && (
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
      })() : showLabel && element.type === 'text-annotation' ? (() => {
        const PAD = 10;
        const lines = wrapText(element.label, element.width - PAD - 4);
        const lineH = 14;
        const totalH = lines.length * lineH;
        const topY = element.y + element.height / 2 - totalH / 2;
        const aColor = (element.properties.annotationColor as string | undefined) ?? "black";
        const textColor = ANNOTATION_COLORS[aColor] ?? "#000000";
        const fontStyle = (element.properties.annotationFontStyle as string | undefined) ?? "normal";
        return (
          <text textAnchor="start" fontSize={fs(12)} fill={textColor}
            style={{ userSelect: "none", pointerEvents: "none", fontStyle }}>
            {lines.map((line, i) => (
              <tspan key={i} x={element.x + PAD} y={topY + i * lineH + lineH * 0.85}>
                {line}
              </tspan>
            ))}
          </text>
        );
      })() : showLabel && element.type === 'review-comment' ? (() => {
        const PAD = 8;
        const lines = wrapText(element.label, element.width - PAD - 6);
        const lineH = 13;
        return (
          <text textAnchor="start" fontSize={fs(11)} fill="#831843"
            style={{ userSelect: "none", pointerEvents: "none" }}>
            {lines.map((line, i) => (
              <tspan key={i} x={element.x + PAD} y={element.y + PAD + i * lineH + lineH * 0.8}>
                {line}
              </tspan>
            ))}
          </text>
        );
      })() : showLabel && !(
        element.type === 'task' ||
        element.type === 'subprocess' ||
        element.type === 'subprocess-expanded' ||
        element.type === 'use-case' ||
        element.type === 'external-entity' ||
        element.type === 'process-system' ||
        element.type === 'pool' ||
        element.type === 'lane' ||
        element.type === 'uml-class' ||
        element.type === 'uml-enumeration'
      ) && !(element.type === 'gateway' && (element.properties.gatewayRole as string | undefined) === 'merge') && (() => {
        const isChevron = element.type === 'chevron' || element.type === 'chevron-collapsed';
        const isArchi = element.type === 'archimate-shape';
        const labelLines = element.label.split('\n');
        const fSize = fs(isActorOrTeam ? 11 : 12);
        const lineH = fSize * 1.3;
        if ((isChevron || isArchi) && labelLines.length > 1) {
          // For ArchiMate the labelInfo anchor is either the centre of
          // the box (leaf) or the header strip (container) or the figure
          // baseline (icon-only Actor). Stack tspans relative to that
          // anchor, respecting the baseline.
          let topY: number;
          if (isArchi && labelInfo.baseline === "hanging") {
            // Anchor is the TOP of the first line (e.g. icon-only Actor)
            topY = labelInfo.y;
          } else {
            // Centre the block on the anchor (default + chevron behaviour)
            topY = labelInfo.y - ((labelLines.length - 1) * lineH) / 2;
          }
          return (
            <text textAnchor="middle" fontSize={fSize} fill="#111827"
              dominantBaseline={isArchi ? labelInfo.baseline : undefined}
              style={{ userSelect: "none", pointerEvents: "none" }}>
              {labelLines.map((line, i) => (
                <tspan key={i} x={labelInfo.x} y={topY + i * lineH}>{line}</tspan>
              ))}
            </text>
          );
        }
        return (
          <text
            x={labelInfo.x}
            y={labelInfo.y}
            textAnchor="middle"
            dominantBaseline={labelInfo.baseline}
            fontSize={fSize}
            fill="#111827"
            style={{ userSelect: "none", pointerEvents: "none" }}
          >
            {element.label}
          </text>
        );
      })()}

      {/* Selection outline — ellipse for circular shapes, rect otherwise. */}
      {selected && !isContainer && (
        (element.type === "process-system" || element.type === "use-case") ? (
          <ellipse data-interactive
            cx={element.x + element.width / 2} cy={element.y + element.height / 2}
            rx={element.width / 2 + 3} ry={element.height / 2 + 3}
            fill="none" stroke="#2563eb" strokeWidth={1.5}
            strokeDasharray="4 2"
            style={{ pointerEvents: "none" }}
          />
        ) : (
          <rect data-interactive
            x={element.x - 3} y={element.y - 3}
            width={element.width + 6} height={element.height + 6}
            fill="none" stroke="#2563eb" strokeWidth={1.5}
            strokeDasharray="4 2" rx={4}
            style={{ pointerEvents: "none" }}
          />
        )
      )}
      {/* Lane/pool selection outline */}
      {selected && isPoolLane && (
        <rect data-interactive
          x={element.x - 2} y={element.y - 2}
          width={element.width + 4} height={element.height + 4}
          fill="none" stroke="#2563eb" strokeWidth={2}
          strokeDasharray="6 3" rx={2}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Drop target highlight — light green for sequence connectors */}
      {isDropTarget && !isDisallowedTarget && (
        <rect data-interactive
          x={element.x - 4} y={element.y - 4}
          width={element.width + 8} height={element.height + 8}
          fill="none" stroke="#4ade80" strokeWidth={2} rx={6}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Connection-creation-mode source highlight (orange ring) */}
      {inConnectionMode && (
        <rect data-interactive
          x={element.x - 5} y={element.y - 5}
          width={element.width + 10} height={element.height + 10}
          fill="none" stroke="#f97316" strokeWidth={2.5}
          strokeDasharray="5 3" rx={6}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* messageBPMN target highlight — light blue */}
      {isMessageBpmnTarget && (
        <rect data-interactive
          x={element.x - 4} y={element.y - 4}
          width={element.width + 8} height={element.height + 8}
          fill="none" stroke="#60a5fa" strokeWidth={2} rx={6}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* associationBPMN target highlight — light purple */}
      {isAssocBpmnTarget && (
        <rect data-interactive
          x={element.x - 4} y={element.y - 4}
          width={element.width + 8} height={element.height + 8}
          fill="none" stroke="#c084fc" strokeWidth={2} rx={6}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Misaligned messageBPMN target highlight (red) */}
      {isErrorTarget && (
        <rect data-interactive
          x={element.x - 4} y={element.y - 4}
          width={element.width + 8} height={element.height + 8}
          fill="none" stroke="#dc2626" strokeWidth={2} rx={6}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Disallow highlight */}
      {isDisallowedTarget && (
        <rect data-interactive
          x={element.x - 4} y={element.y - 4}
          width={element.width + 8} height={element.height + 8}
          fill="none" stroke="#dc2626" strokeWidth={2} strokeDasharray="4 2" rx={6}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Element drag target — orange when element being dragged will become a child */}
      {isElementDragTarget && (
        <rect data-interactive
          x={element.x - 4} y={element.y - 4}
          width={element.width + 8} height={element.height + 8}
          fill="none" stroke="#fb923c" strokeWidth={2} rx={6}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Resize handles (containers + task/subprocess) */}
      {selected && !multiSelected && canResize && onResizeDragStart &&
        RESIZE_HANDLES
        .filter(({ handle }) => {
          // Pools never move their LEFT boundary — drop every west-side
          // handle (w + the nw/sw corners that would drag the left edge).
          if (element.type === "pool" && (handle === "w" || handle === "nw" || handle === "sw")) return false;
          // Fork-join: only show handles on the long axis ends
          if (element.type !== "fork-join") return true;
          const isVertical = element.height >= element.width;
          return isVertical ? (handle === "n" || handle === "s") : (handle === "e" || handle === "w");
        })
        .map(({ handle, cursor }) => {
          const { hx, hy } = getHandlePos(handle, element);
          return (
            <rect data-interactive
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

      {/* Pool / Subprocess-Expanded edge resize handles. Hit zones
          (invisible, ~10px wide) straddle each of the four edges and are
          ALWAYS active — a click near any edge initiates a drag on that
          side. The visible grip + ↔/↕ glyph only render while the drag
          is active. EPs reuse the same pool mechanic per user spec
          ("Pools have to move their boundaries to Expanded Subprocesses"),
          giving consistent edge-hover-resize UX across both. */}
      {(element.type === "pool" || element.type === "subprocess-expanded") && onResizeDragStart && (() => {
        const HANDLE_W = 10;
        const horizontalGripLen = Math.min(40, element.height * 0.5); // E/W grips
        const verticalGripLen   = Math.min(40, element.width  * 0.5); // N/S grips

        type EdgeSpec = {
          side: "e" | "w" | "n" | "s";
          cursor: "ew-resize" | "ns-resize";
          hit: { x: number; y: number; width: number; height: number };
          grip: { x: number; y: number; width: number; height: number };
          arrowPath: string; // double-headed arrow in the hit centre
        };
        const edges: EdgeSpec[] = [
          // East (right)
          {
            side: "e", cursor: "ew-resize",
            hit: { x: element.x + element.width - HANDLE_W, y: element.y, width: HANDLE_W * 2, height: element.height },
            grip: { x: element.x + element.width - HANDLE_W / 2, y: element.y + element.height / 2 - horizontalGripLen / 2, width: HANDLE_W, height: horizontalGripLen },
            arrowPath: (() => { const cx = element.x + element.width, cy = element.y + element.height / 2;
              return `M ${cx - 4} ${cy} L ${cx - 1} ${cy - 3} L ${cx - 1} ${cy + 3} Z M ${cx + 4} ${cy} L ${cx + 1} ${cy - 3} L ${cx + 1} ${cy + 3} Z`; })(),
          },
          // West (left)
          {
            side: "w", cursor: "ew-resize",
            hit: { x: element.x - HANDLE_W, y: element.y, width: HANDLE_W * 2, height: element.height },
            grip: { x: element.x - HANDLE_W / 2, y: element.y + element.height / 2 - horizontalGripLen / 2, width: HANDLE_W, height: horizontalGripLen },
            arrowPath: (() => { const cx = element.x, cy = element.y + element.height / 2;
              return `M ${cx - 4} ${cy} L ${cx - 1} ${cy - 3} L ${cx - 1} ${cy + 3} Z M ${cx + 4} ${cy} L ${cx + 1} ${cy - 3} L ${cx + 1} ${cy + 3} Z`; })(),
          },
          // North (top)
          {
            side: "n", cursor: "ns-resize",
            hit: { x: element.x, y: element.y - HANDLE_W, width: element.width, height: HANDLE_W * 2 },
            grip: { x: element.x + element.width / 2 - verticalGripLen / 2, y: element.y - HANDLE_W / 2, width: verticalGripLen, height: HANDLE_W },
            arrowPath: (() => { const cx = element.x + element.width / 2, cy = element.y;
              return `M ${cx} ${cy - 4} L ${cx - 3} ${cy - 1} L ${cx + 3} ${cy - 1} Z M ${cx} ${cy + 4} L ${cx - 3} ${cy + 1} L ${cx + 3} ${cy + 1} Z`; })(),
          },
          // South (bottom)
          {
            side: "s", cursor: "ns-resize",
            hit: { x: element.x, y: element.y + element.height - HANDLE_W, width: element.width, height: HANDLE_W * 2 },
            grip: { x: element.x + element.width / 2 - verticalGripLen / 2, y: element.y + element.height - HANDLE_W / 2, width: verticalGripLen, height: HANDLE_W },
            arrowPath: (() => { const cx = element.x + element.width / 2, cy = element.y + element.height;
              return `M ${cx} ${cy - 4} L ${cx - 3} ${cy - 1} L ${cx + 3} ${cy - 1} Z M ${cx} ${cy + 4} L ${cx - 3} ${cy + 1} L ${cx + 3} ${cy + 1} Z`; })(),
          },
        ];

        return (
          <g data-interactive>
            {edges
              // Pools never move their LEFT boundary — suppress the west
              // edge hit-zone (EPs keep all four).
              .filter((edge) => !(element.type === "pool" && edge.side === "w"))
              .map((edge) => (
              <g key={edge.side}>
                <rect
                  x={edge.hit.x} y={edge.hit.y}
                  width={edge.hit.width} height={edge.hit.height}
                  fill="transparent"
                  style={{ cursor: edge.cursor }}
                  onMouseDown={(e) => {
                    // Click-vs-drag disambiguation. The resize hit zone
                    // spans ±10 px around the boundary, which sits inside
                    // the pool's selectable-boundary tolerance (±8 px). A
                    // pure click on the edge MUST fall through to the
                    // outer pool handler so selection works; only a real
                    // drag (mouse moved > 4 px before mouseup) takes the
                    // resize path.
                    const startX = e.clientX, startY = e.clientY;
                    const THRESH = 4;
                    let started = false;
                    const reactEvt = e;
                    const onMove = (ev: MouseEvent) => {
                      if (started) return;
                      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) <= THRESH) return;
                      started = true;
                      setPoolResizeActive(edge.side);
                      onResizeDragStart(edge.side, reactEvt);
                    };
                    const onUp = () => {
                      window.removeEventListener("mousemove", onMove);
                      window.removeEventListener("mouseup", onUp);
                      if (started) {
                        setPoolResizeActive(null);
                      }
                      // If !started, the click is a pure tap — bubble up
                      // to the pool's selection handler. We don't dispatch
                      // anything here because the original mousedown
                      // already bubbled (no stopPropagation early-out),
                      // so handleMouseDown on the parent <g> already fired
                      // and ran its selection / drag logic.
                    };
                    window.addEventListener("mousemove", onMove);
                    window.addEventListener("mouseup", onUp);
                    // Note: NOT calling e.stopPropagation() — the click
                    // needs to bubble to the pool's handleMouseDown so
                    // boundary-click selection still works.
                  }}
                />
                {poolResizeActive === edge.side && (
                  <>
                    <rect
                      x={edge.grip.x} y={edge.grip.y}
                      width={edge.grip.width} height={edge.grip.height}
                      fill="#2563eb" fillOpacity={0.75} stroke="white" strokeWidth={1} rx={2}
                      style={{ cursor: edge.cursor, pointerEvents: "none" }}
                    />
                    <path
                      d={edge.arrowPath}
                      fill="white"
                      style={{ pointerEvents: "none" }}
                    />
                  </>
                )}
              </g>
            ))}
          </g>
        );
      })()}

      {/* Full-body connection overlay for all non-boundary elements */}
      {showConnectionPoints && !isBoundary && element.type !== "lane" && (element.type === "use-case" || element.type === "process-system") && (() => {
        const cx = element.x + element.width / 2;
        const cy = element.y + element.height / 2;
        const handler = (e: React.MouseEvent) => {
          e.stopPropagation();
          const worldPt = svgToWorld ? svgToWorld(e.clientX, e.clientY) : { x: cx, y: cy };
          const side = getClosestSideFromPoint(worldPt, element);

          let fired = false;
          function activate() {
            if (fired) return;
            fired = true;
            clearTimeout(holdTimer);
            window.removeEventListener("mouseup", onUp);
            window.removeEventListener("mousemove", onMove);
            onConnectionPointDragStart(side, worldPt);
          }
          const holdTimer = setTimeout(activate, 300);
          function onMove(ev: MouseEvent) {
            if (Math.abs(ev.clientX - e.clientX) > 5 || Math.abs(ev.clientY - e.clientY) > 5) activate();
          }
          function onUp() {
            clearTimeout(holdTimer);
            window.removeEventListener("mouseup", onUp);
            window.removeEventListener("mousemove", onMove);
          }
          window.addEventListener("mouseup", onUp);
          window.addEventListener("mousemove", onMove);
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
      {/* Diamond connection overlay for gateways */}
      {showConnectionPoints && element.type === "gateway" && (() => {
        const cx = element.x + element.width / 2;
        const cy = element.y + element.height / 2;
        const pts = `${cx},${element.y} ${element.x + element.width},${cy} ${cx},${element.y + element.height} ${element.x},${cy}`;
        const handler = (e: React.MouseEvent) => {
          e.stopPropagation();
          const worldPt = svgToWorld ? svgToWorld(e.clientX, e.clientY) : { x: cx, y: cy };
          const side = getClosestSideFromPoint(worldPt, element);
          let fired = false;
          function activate() {
            if (fired) return;
            fired = true;
            clearTimeout(holdTimer);
            window.removeEventListener("mouseup", onUp);
            window.removeEventListener("mousemove", onMove);
            onConnectionPointDragStart(side, worldPt);
          }
          const holdTimer = setTimeout(activate, 300);
          function onMove(ev: MouseEvent) {
            if (Math.abs(ev.clientX - e.clientX) > 5 || Math.abs(ev.clientY - e.clientY) > 5) activate();
          }
          function onUp() {
            clearTimeout(holdTimer);
            window.removeEventListener("mouseup", onUp);
            window.removeEventListener("mousemove", onMove);
          }
          window.addEventListener("mouseup", onUp);
          window.addEventListener("mousemove", onMove);
        };
        return (
          <polygon points={pts} fill="transparent" stroke="none"
            style={{ cursor: "crosshair" }}
            onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
            onMouseDown={handler}
          />
        );
      })()}
      {showConnectionPoints && !isBoundary && element.type !== "lane" && element.type !== "use-case" && element.type !== "process-system" && element.type !== "gateway" && (
        <rect data-interactive
          x={element.x} y={element.y}
          width={element.width} height={element.height}
          fill="transparent" stroke="none"
          style={{ cursor: "crosshair" }}
          onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
          onMouseDown={(e) => {
            e.stopPropagation();
            const worldPt = svgToWorld
              ? svgToWorld(e.clientX, e.clientY)
              : { x: element.x + element.width / 2, y: element.y + element.height / 2 };
            const side = getClosestSideFromPoint(worldPt, element);

            let fired = false;
            function activate() {
              if (fired) return;
              fired = true;
              clearTimeout(holdTimer);
              window.removeEventListener("mouseup", onUp);
              window.removeEventListener("mousemove", onMove);
              onConnectionPointDragStart(side, worldPt);
            }
            const holdTimer = setTimeout(activate, 300);
            function onMove(ev: MouseEvent) {
              if (Math.abs(ev.clientX - e.clientX) > 5 || Math.abs(ev.clientY - e.clientY) > 5) activate();
            }
            function onUp() {
              clearTimeout(holdTimer);
              window.removeEventListener("mouseup", onUp);
              window.removeEventListener("mousemove", onMove);
            }
            window.addEventListener("mouseup", onUp);
            window.addEventListener("mousemove", onMove);
          }}
        />
      )}

      {/* Interior label for task/subprocess/subprocess-expanded/use-case — rendered AFTER connection overlay so it is on top */}
      {showLabel && (
        element.type === 'task' ||
        element.type === 'subprocess' ||
        element.type === 'subprocess-expanded' ||
        element.type === 'use-case' ||
        element.type === 'external-entity' ||
        element.type === 'process-system'
      ) && (() => {
        // Geometry constants for task/sub-process text-box layout. PAD is the
        // gap between the element boundary and the text-box boundary on every
        // side. Mirrors textMetrics.ts so renderer + autosize agree exactly.
        const PAD = 5;
        const TASK_MARKER_X = 4;            // BpmnTaskMarker render offset
        const TASK_MARKER_Y = 4;
        const MARKER_SIZE = 14;
        // Small visual gap between marker right edge and line-1 text. Keeps
        // the marker clearly distinguishable without wasting horizontal room.
        // Must mirror TASK_MARKER_LINE1_GAP in textMetrics.ts so the
        // renderer and the autosizer agree exactly.
        const TASK_MARKER_LINE1_GAP = 3;
        // Reserved horizontal space on line 1 = marker offset + marker width
        // + small gap − PAD. Text on line 1 starts at x + 21.
        const TASK_MARKER_LINE1_RESERVE = TASK_MARKER_X + MARKER_SIZE + TASK_MARKER_LINE1_GAP - PAD;
        // Subprocess collapsed marker bottom geometry — text must never
        // intrude into this reserve.
        const SUBPROCESS_BOTTOM_RESERVE = 19;
        const el = element;
        const elCenterX = el.x + el.width / 2;
        const elCenterY = el.y + el.height / 2;
        const defaultW = el.type === 'use-case' ? el.width * 0.7 : el.width - 2 * PAD;
        const labelOffsetX = (el.properties.labelOffsetX as number) ?? 0;
        const labelOffsetY = (el.properties.labelOffsetY as number) ?? 0;
        const labelWidth   = (el.properties.labelWidth   as number) ?? defaultW;
        const labelCenterX = elCenterX + labelOffsetX;
        const lineH = 14;
        const hasTaskMarker = el.type === 'task' && !!el.taskType && el.taskType !== 'none';
        const isSubprocessCollapsed = el.type === 'subprocess';
        const hasRepeatMarker = el.repeatType && el.repeatType !== 'none';
        // Usable vertical band for the text block (excludes any permanent
        // bottom marker space on a subprocess). The text block is centred
        // within this band, then user labelOffsetY shifts it.
        const usableTopY = el.y + PAD;
        const usableBotY = el.y + el.height - PAD
          - (isSubprocessCollapsed || hasRepeatMarker ? SUBPROCESS_BOTTOM_RESERVE - PAD : 0);
        const usableCenterY = (usableTopY + usableBotY) / 2 + labelOffsetY;
        // First pass: wrap at full label width.
        let firstLineWidth: number | undefined = undefined;
        let lines = wrapText(el.label, labelWidth, 12, firstLineWidth);
        let totalLabelH = lines.length * lineH;
        // Vertical position of the text block.
        let labelTopY: number;
        if (el.type === 'subprocess-expanded') {
          labelTopY = el.y + PAD; // EP keeps label pinned to top
        } else {
          labelTopY = usableCenterY - totalLabelH / 2;
        }
        // Task marker buffer removed — text is allowed to overlap the
        // top-left task-type marker. Previously a narrowed first-line
        // wrap kept the text band clear of the marker; pending a
        // re-think of the marker-vs-text layout.
        // Clamp top so text never escapes the usable top edge.
        if (labelTopY < usableTopY) labelTopY = usableTopY;
        const labelLeftX = labelCenterX - labelWidth / 2;
        // X-centre for the first line of a task with a narrowed line 1 —
        // anchored to the marker-free region, ignoring labelOffsetX (the
        // narrowing is absolute to the marker position, not the user's
        // drag offset). Other lines centre on labelCenterX as usual.
        const firstLineCenterX = firstLineWidth != null
          ? el.x + (TASK_MARKER_X + MARKER_SIZE + TASK_MARKER_LINE1_GAP + (el.width - PAD)) / 2
          : labelCenterX;
        const minY    = el.y + PAD;
        const maxBotY = el.y + el.height - PAD - (isSubprocessCollapsed || hasRepeatMarker ? SUBPROCESS_BOTTOM_RESERVE - PAD : 0);
        function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
        function handleInteriorLabelMouseDown(ev: React.MouseEvent) {
          ev.stopPropagation();
          // Single click on name area selects the element but does NOT highlight the name.
          // User must double-click the name to select it for editing.
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
              stroke={labelHighlighted && selected && !multiSelected ? "#2563eb" : "none"}
              strokeWidth={1}
              strokeDasharray={labelHighlighted && selected && !multiSelected ? "3 2" : undefined}
              style={{
                cursor: labelHighlighted ? "move" : "crosshair",
                pointerEvents: labelHighlighted ? "auto" : "none",
              }}
              onMouseDown={handleInteriorLabelMouseDown}
              onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
            />
            <text
              textAnchor="middle"
              // Context-Diagram processes render at their own absolute
              // size (ProcessFontSizeCtx, default 16 px) so the user can
              // tune Process Names independently of Entity Names. Other
              // interior labels stay on the element scale.
              fontSize={element.type === "process-system" ? processFontSize : fs(12)}
              fill="#111827"
              style={{ userSelect: "none", pointerEvents: "none" }}
            >
              {lines.map((line, i) => (
                <tspan
                  key={i}
                  x={i === 0 ? firstLineCenterX : labelCenterX}
                  y={labelTopY + i * lineH + lineH * 0.85}
                >
                  {line}
                </tspan>
              ))}
            </text>
            {labelHighlighted && selected && !multiSelected && onUpdateProperties && (
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

      {/* Debug overlay: live height readout so the user can see poolH / elemH
          update as they drag resize handles or reorder lanes. Placed at the
          top-right corner of the element so it doesn't cover the main shape. */}
      {debugMode && (() => {
        const tag = element.type === "pool"
          ? `poolH=${element.height.toFixed(0)}`
          : `elemH=${element.height.toFixed(0)}`;
        return (
          <text
            x={element.x + element.width - 4}
            y={element.y + 10}
            textAnchor="end"
            fontSize={9}
            fill="#b91c1c"
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {tag}
          </text>
        );
      })()}
    </g>
    </ShowValueDisplayCtx.Provider>
    </SymbolColorCtx.Provider>
  );
}
