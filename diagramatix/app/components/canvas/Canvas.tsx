"use client";

import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { nanoid } from "nanoid";
import type {
  ArchimateConnectorType,
  BpmnTaskType,
  Connector,
  ConnectorType,
  DiagramData,
  DiagramElement,
  DiagramType,
  DirectionType,
  EventType,
  Point,
  RoutingType,
  Side,
  SymbolType,
} from "@/app/lib/diagram/types";
import { ArchimateConnectorPicker } from "./ArchimateConnectorPicker";
import { SymbolRenderer, SublaneIdsCtx, ProcessGroupDepthCtx, LaneDepthCtx, DatabaseCtx, ArchimateDepthCtx, type ResizeHandle } from "./SymbolRenderer";
import { getSymbolDefinition } from "@/app/lib/diagram/symbols/definitions";
import { PaletteSymbolPreview } from "./Palette";
import { CHEVRON_THEMES } from "@/app/lib/diagram/chevronThemes";
import { DisplayModeCtx, FontScaleCtx, ConnectorFontScaleCtx, TitleFontSizeCtx, PoolFontSizeCtx, LaneFontSizeCtx, SketchyFilter } from "@/app/lib/diagram/displayMode";
import { ConnectorRenderer } from "./ConnectorRenderer";
import { findShapeByKey as findArchimateShapeByKey } from "@/app/lib/archimate/catalogue";

const HEADER_H = 28;
const MIN_BOUNDARY_W = 100;
const MIN_BOUNDARY_H = HEADER_H + 40;

const DATA_ELEMENT_TYPES = new Set<SymbolType>(["data-object", "data-store", "text-annotation"]);

function getElementPoolId(el: DiagramElement, elements: DiagramElement[]): string | null {
  if (el.type === "pool") return el.id;
  // Try parentId chain first (fast path)
  if (el.parentId) {
    const parent = elements.find((e) => e.id === el.parentId);
    if (parent?.type === "pool") return parent.id;
    if (parent?.type === "lane") {
      const gp = elements.find((e) => e.id === parent.parentId);
      if (gp?.type === "pool") return gp.id;
    }
  }
  // Fallback: position check — is this element's centre inside any pool?
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const pool = elements.find(
    (p) => p.type === "pool" &&
      cx >= p.x && cx <= p.x + p.width &&
      cy >= p.y && cy <= p.y + p.height
  );
  return pool?.id ?? null;
}

function getContainingPool(el: DiagramElement, elements: DiagramElement[]): DiagramElement | null {
  if (el.type === "pool") return null;
  const poolId = getElementPoolId(el, elements);
  if (!poolId) return null;
  return elements.find((p) => p.id === poolId && p.type === "pool") ?? null;
}

const USE_CASE_DEFAULT_W = 120;
const USE_CASE_DEFAULT_H = 60;
const USE_CASE_ASPECT = USE_CASE_DEFAULT_W / USE_CASE_DEFAULT_H;
const USE_CASE_LINE_H = 16;

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

function computeUseCaseSize(label: string, currentW: number): { w: number; h: number } {
  const innerW = currentW * 0.7;
  const lines = wrapText(label, innerW);
  const neededH = lines.length * USE_CASE_LINE_H + 16;
  const h = Math.max(USE_CASE_DEFAULT_H, Math.round(neededH));
  const w = Math.max(USE_CASE_DEFAULT_W, Math.round(h * USE_CASE_ASPECT));
  return { w, h };
}

const INTERMEDIATE_EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: "none",        label: "None" },
  { value: "message",     label: "Message" },
  { value: "timer",       label: "Timer" },
  { value: "error",       label: "Error" },
  { value: "signal",      label: "Signal" },
  { value: "conditional", label: "Conditional" },
];

const TASK_TYPE_OPTIONS: { value: BpmnTaskType; label: string }[] = [
  { value: "none",          label: "None" },
  { value: "user",          label: "User Task" },
  { value: "service",       label: "Service Task" },
  { value: "script",        label: "Script Task" },
  { value: "send",          label: "Send Task" },
  { value: "receive",       label: "Receive Task" },
  { value: "manual",        label: "Manual Task" },
  { value: "business-rule", label: "Business Rule Task" },
];

interface PendingDrop {
  worldPos: Point;
  containerX: number;
  symbolType: SymbolType;
  containerY: number;
  splitConnectorId?: string;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function findConnectorNearPoint(connectors: Connector[], pos: Point, margin = 15): Connector | null {
  for (const c of connectors) {
    if (c.type !== "sequence" && c.type !== "transition") continue;
    const pts = c.waypoints;
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment(pos, pts[i], pts[i + 1]) <= margin) return c;
    }
  }
  return null;
}

interface Props {
  data: DiagramData;
  diagramType: DiagramType;
  onAddElement: (
    type: SymbolType,
    position: Point,
    taskType?: BpmnTaskType,
    eventType?: EventType,
    id?: string,
    initial?: { properties?: Record<string, unknown>; width?: number; height?: number; label?: string },
  ) => void;
  onMoveElement: (id: string, x: number, y: number, unconstrained?: boolean) => void;
  onResizeElement: (id: string, x: number, y: number, width: number, height: number) => void;
  onUpdateLabel: (id: string, label: string) => void;
  onDeleteElement: (id: string) => void;
  onAddConnector: (
    sourceId: string,
    targetId: string,
    type: ConnectorType,
    directionType: DirectionType,
    routingType: RoutingType,
    sourceSide: Side,
    targetSide: Side,
    sourceOffsetAlong?: number,
    targetOffsetAlong?: number,
    force?: boolean,
    initialLabel?: string,
  ) => void;
  onDeleteConnector: (id: string) => void;
  onUpdateConnectorEndpoint: (
    connectorId: string,
    endpoint: "source" | "target",
    newElementId: string,
    newSide: Side,
    newOffsetAlong?: number,
  ) => void;
  selectedElementIds: Set<string>;
  selectedConnectorId: string | null;
  onSetSelectedElements: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  onSelectConnector: (id: string | null) => void;
  onMoveElements?: (ids: string[], dx: number, dy: number) => void;
  onElementsMoveEnd?: () => void;
  pendingDragSymbol: SymbolType | null;
  pendingArchimateShapeKey?: string | null;
  pendingArchimateIconOnly?: boolean;
  defaultDirectionType: DirectionType;
  defaultRoutingType: RoutingType;
  onUpdateProperties?: (id: string, props: Record<string, unknown>) => void;
  onUpdatePropertiesBatch?: (updates: Array<{ id: string; properties: Record<string, unknown> }>) => void;
  onUpdateConnectorWaypoints?: (id: string, waypoints: Point[]) => void;
  onUpdateConnectorLabel?: (id: string, label?: string, offsetX?: number, offsetY?: number, width?: number) => void;
  onSplitConnector?: (symbolType: SymbolType, position: Point, connectorId: string, taskType?: BpmnTaskType, eventType?: EventType) => void;
  onElementMoveEnd?: (id: string) => void;
  onMoveLaneBoundary?: (aboveLaneId: string, belowLaneId: string, dy: number) => void;
  onResizeElementEnd?: (id: string) => void;
  onLaneBoundaryMoveEnd?: () => void;
  onConnectorWaypointDragEnd?: (id: string) => void;
  onNudgeConnector?: (connectorId: string, dx: number, dy: number) => void;
  onNudgeConnectorEndpoint?: (connectorId: string, endpoint: "source" | "target", dx: number, dy: number) => void;
  onUpdateCurveHandles?: (id: string, waypoints: Point[], cp1Rel: Point, cp2Rel: Point) => void;
  colorConfig?: import("@/app/lib/diagram/colors").SymbolColorConfig;
  displayMode?: import("@/app/lib/diagram/displayMode").DisplayMode;
  debugMode?: boolean;
  onUpdateConnectorFields?: (id: string, fields: Partial<import("@/app/lib/diagram/types").Connector>) => void;
  getViewportCenterRef?: React.MutableRefObject<(() => Point) | null>;
  diagramName?: string;
  createdAt?: string;
  updatedAt?: string;
  readOnly?: boolean;
  onDrillIntoSubprocess?: (diagramId: string) => void;
  onDrillBack?: () => void;
  parentDiagramName?: string;
  showValueDisplay?: boolean;
  showBottleneck?: boolean;
  onInsertSpace?: (markerX: number, markerY: number, dx: number, dy: number) => void;
  onAddSelfTransition?: (elementId: string, side: Side, srcOffset: number, tgtOffset: number, bulge: number) => void;
}

interface EditingLabel {
  elementId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  value: string;
}

interface DraggingConnector {
  fromId: string;
  fromSide: Side;
  fromPos: Point;
  currentPos: Point;
}

interface DraggingEndpoint {
  connectorId: string;
  endpoint: "source" | "target";
  startPos: Point;
  currentPos: Point;
}

function getClosestSide(pos: Point, el: DiagramElement): Side {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const dx = pos.x - cx;
  const dy = pos.y - cy;
  const normX = Math.abs(dx) / (el.width / 2 || 1);
  const normY = Math.abs(dy) / (el.height / 2 || 1);
  if (normX > normY) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
}

function pointToBoundaryOffset(p: Point, el: DiagramElement): { side: Side; offsetAlong: number } {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  // Gateways: snap to nearest diamond vertex if within 3px.
  // Each vertex is at offset 0.5 of its corresponding side.
  if (el.type === "gateway") {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const verts: Array<{ side: Side; x: number; y: number }> = [
      { side: "top",    x: cx,                y: el.y },
      { side: "right",  x: el.x + el.width,   y: cy },
      { side: "bottom", x: cx,                y: el.y + el.height },
      { side: "left",   x: el.x,              y: cy },
    ];
    let best = verts[0]; let bestDist = Infinity;
    for (const v of verts) {
      const d = Math.hypot(p.x - v.x, p.y - v.y);
      if (d < bestDist) { bestDist = d; best = v; }
    }
    if (bestDist <= 3) return { side: best.side, offsetAlong: 0.5 };
  }
  const distTop    = Math.abs(p.y - el.y);
  const distBottom = Math.abs(p.y - (el.y + el.height));
  const distLeft   = Math.abs(p.x - el.x);
  const distRight  = Math.abs(p.x - (el.x + el.width));
  const min = Math.min(distTop, distBottom, distLeft, distRight);
  if (min === distTop)    return { side: "top",    offsetAlong: clamp((p.x - el.x) / el.width) };
  if (min === distBottom) return { side: "bottom", offsetAlong: clamp((p.x - el.x) / el.width) };
  if (min === distLeft)   return { side: "left",   offsetAlong: clamp((p.y - el.y) / el.height) };
  return                         { side: "right",  offsetAlong: clamp((p.y - el.y) / el.height) };
}

/** Returns the side of the host subprocess that this boundary event is mounted on (= its outer side), or null. */
function getBoundaryEventOuterSide(el: DiagramElement, allElements: DiagramElement[]): Side | null {
  if (!el.boundaryHostId) return null;
  const host = allElements.find(h => h.id === el.boundaryHostId);
  if (!host) return null;
  const ecx = el.x + el.width / 2;
  const ecy = el.y + el.height / 2;
  const distTop    = Math.abs(ecy - host.y);
  const distBottom = Math.abs(ecy - (host.y + host.height));
  const distLeft   = Math.abs(ecx - host.x);
  const distRight  = Math.abs(ecx - (host.x + host.width));
  const min = Math.min(distTop, distBottom, distLeft, distRight);
  if (min === distTop)    return "top";
  if (min === distBottom) return "bottom";
  if (min === distLeft)   return "left";
  return "right";
}

/** Returns the opposite of a Side (used to get the inward-facing side of a boundary event). */
function oppositeSide(s: Side): Side {
  if (s === "top")    return "bottom";
  if (s === "bottom") return "top";
  if (s === "left")   return "right";
  return "left";
}

/** Returns the midpoint of the specified outer face of an element. */
function sideMidpoint(el: DiagramElement, side: Side): Point {
  switch (side) {
    case "top":    return { x: el.x + el.width / 2, y: el.y };
    case "bottom": return { x: el.x + el.width / 2, y: el.y + el.height };
    case "left":   return { x: el.x,                y: el.y + el.height / 2 };
    case "right":  return { x: el.x + el.width,     y: el.y + el.height / 2 };
  }
}

interface DebugItem {
  id: string; label: string;
  anchorX: number; anchorY: number;
  color: string; defaultOX: number; defaultOY: number;
}

function DebugLabel({ item, svgToWorld, offsets, setOffset }: {
  item: DebugItem;
  svgToWorld: (cx: number, cy: number) => Point;
  offsets: Map<string, Point>;
  setOffset: (id: string, offset: Point) => void;
}) {
  const offset = offsets.get(item.id) ?? { x: item.defaultOX, y: item.defaultOY };
  const lx = item.anchorX + offset.x;
  const ly = item.anchorY + offset.y;

  function handleMouseDown(e: React.MouseEvent) {
    e.stopPropagation();
    const startWorld = svgToWorld(e.clientX, e.clientY);
    const startOff = { ...offset };
    function onMove(ev: MouseEvent) {
      const cur = svgToWorld(ev.clientX, ev.clientY);
      setOffset(item.id, { x: startOff.x + cur.x - startWorld.x, y: startOff.y + cur.y - startWorld.y });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <g>
      <line x1={item.anchorX} y1={item.anchorY} x2={lx} y2={ly}
        stroke={item.color} strokeWidth={0.5} strokeDasharray="2 2"
        style={{ pointerEvents: "none" }} />
      <text x={lx} y={ly} fontSize={7} fill={item.color} textAnchor="middle"
        fontFamily="monospace" style={{ cursor: "grab", userSelect: "none" }}
        onMouseDown={handleMouseDown}>
        {item.label}
      </text>
    </g>
  );
}

export function Canvas({
  data,
  diagramType,
  onAddElement,
  onMoveElement,
  onResizeElement,
  onUpdateLabel,
  onDeleteElement,
  onAddConnector,
  onDeleteConnector,
  onUpdateConnectorEndpoint,
  selectedElementIds,
  selectedConnectorId,
  onSetSelectedElements,
  onSelectConnector,
  onMoveElements,
  onElementsMoveEnd,
  pendingDragSymbol,
  pendingArchimateShapeKey,
  pendingArchimateIconOnly,
  defaultDirectionType,
  defaultRoutingType,
  onUpdateProperties,
  onUpdatePropertiesBatch,
  onUpdateConnectorWaypoints,
  onUpdateConnectorLabel,
  onSplitConnector,
  onElementMoveEnd,
  onMoveLaneBoundary,
  onResizeElementEnd,
  onLaneBoundaryMoveEnd,
  onConnectorWaypointDragEnd,
  onNudgeConnector,
  onNudgeConnectorEndpoint,
  onUpdateCurveHandles,
  colorConfig,
  displayMode: displayModeProp,
  debugMode,
  onUpdateConnectorFields,
  getViewportCenterRef,
  diagramName,
  createdAt,
  updatedAt,
  readOnly,
  onDrillIntoSubprocess,
  onDrillBack,
  parentDiagramName,
  showValueDisplay,
  showBottleneck,
  onInsertSpace,
  onAddSelfTransition,
}: Props) {
  const displayMode = displayModeProp ?? "normal";
  const svgRef = useRef<SVGSVGElement>(null);

  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const baseZoomRef = useRef<number | null>(null); // the "100%" reference zoom
  const [editingLabel, setEditingLabel] = useState<EditingLabel | null>(null);
  const [draggingConnector, setDraggingConnector] = useState<DraggingConnector | null>(null);
  const [draggingEndpoint, setDraggingEndpoint] = useState<DraggingEndpoint | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [connectorChoice, setConnectorChoice] = useState<{
    sourceId: string; targetId: string;
    sourceSide: Side; targetSide: Side;
    sourceOffset?: number; targetOffset?: number;
    pos: Point;
  } | null>(null);
  // ArchiMate connector picker: stores the dropped-connector parameters
  // and defers onAddConnector until the user selects a relationship type.
  const [pendingArchiConn, setPendingArchiConn] = useState<{
    sourceId: string; targetId: string;
    sourceSide: Side; targetSide: Side;
    sourceOffset?: number; targetOffset?: number;
    screenX: number; screenY: number;
  } | null>(null);
  const [focusedEndpoint, setFocusedEndpoint] = useState<"source" | "target" | null>(null);
  const [msgMarkerFocused, setMsgMarkerFocused] = useState(false);
  // Pool vertical-boundary alignment guide. Active during a left/right
  // resize of a pool. Shows a dotted vertical line at the moving
  // boundary's current X plus a marker at every other pool's same-side
  // boundary (vertical centre), highlighted green on alignment.
  const [poolBoundaryGuide, setPoolBoundaryGuide] = useState<{
    side: "left" | "right";
    currentX: number;
    others: { id: string; x: number; midY: number }[];
  } | null>(null);
  const [debugLabelOffsets, setDebugLabelOffsets] = useState<Map<string, Point>>(new Map());
  const setDebugLabelOffset = useCallback((id: string, offset: Point) => {
    setDebugLabelOffsets(prev => { const next = new Map(prev); next.set(id, offset); return next; });
  }, []);
  const [pickerOffset, setPickerOffset] = useState<Point>({ x: 0, y: 0 });
  const pickerDragRef = useRef<{ startX: number; startY: number; origOffX: number; origOffY: number } | null>(null);

  // Auto-connect after BPMN element drop: flashes a sequence connector preview
  // that the user can abort by pressing Esc.
  const [autoConnectFlash, setAutoConnectFlash] = useState<{
    sourceId: string;
    targetId: string;
    from: Point;
    to: Point;
    visible: boolean;
  } | null>(null);
  const autoConnectAbortRef = useRef(false);

  // Connection-creation mode: when set, the next click on a different element
  // creates a sequence connector from this source. Triggered by clicking an
  // already-selected task/subprocess. Cleared by Esc, background click, or
  // successful connector creation.
  const [pendingConnSourceId, setPendingConnSourceId] = useState<string | null>(null);

  // Force-connect override (Shift+Ctrl+Click drag): bypasses all validation
  const [forceConnect, setForceConnect] = useState<{
    sourceId: string;
    dragging: boolean;
    targetId?: string;
    screenX?: number;
    screenY?: number;
  } | null>(null);

  // Group-Connect-to-Gateway support: a click on a gateway clears any
  // pre-existing multi-selection before the double-click event fires. We
  // capture the pre-click selection here so the double-click handler can
  // still see the original group. Cleared after a short window so it can't
  // affect unrelated future events.
  const groupConnectPrevSelectionRef = useRef<{ ids: Set<string>; expiresAt: number } | null>(null);
  const GROUP_CONNECT_CAPTURE_MS = 600;

  // Group-Connect flash overlay: shows red lines for connectors about to be
  // deleted and green lines for the new ones, both flashing 3 times before
  // committing. Multiple connectors at once.
  const [groupFlash, setGroupFlash] = useState<{
    deleted: Array<{ from: Point; to: Point }>;
    created: Array<{ from: Point; to: Point }>;
    visible: boolean;
  } | null>(null);

  // Right-click quick-add popup: small palette of common BPMN shapes shown
  // at the cursor position. Choosing one places that element at the original
  // right-click world position and runs auto-connect.
  const [quickAdd, setQuickAdd] = useState<{
    worldPos: Point;
    screenX: number;
    screenY: number;
  } | null>(null);
  const [themePicker, setThemePicker] = useState<{ screenX: number; screenY: number } | null>(null);

  // Fit-to-content on initial mount.
  //
  // Default initial zoom is 70% (readable text at most element sizes).
  // Users can override via System Menu → Initial Zoom…, stored in
  // localStorage key "initialZoom" as a decimal (e.g. 0.7 = 70%).
  // Small diagrams that fit the viewport at the chosen zoom are centred;
  // larger diagrams anchor to the top-left with a margin. The chosen zoom
  // becomes the "100%" reference on the zoom slider.
  const hasFitted = useRef(false);
  useEffect(() => {
    if (hasFitted.current || !svgRef.current || data.elements.length === 0) return;
    hasFitted.current = true;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of data.elements) {
      if (el.x < minX) minX = el.x;
      if (el.y < minY) minY = el.y;
      if (el.x + el.width > maxX) maxX = el.x + el.width;
      if (el.y + el.height > maxY) maxY = el.y + el.height;
    }
    // Include title block if shown
    if (data.title?.showTitle) {
      const titleLines = 4; // name + up to 3 sub-lines
      const titleH = titleLines * 16 + 28;
      minY -= titleH;
    }
    const pad = 40;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    if (contentW < 1 || contentH < 1) return;

    const DEFAULT_INITIAL_ZOOM = 0.7;
    const storedZoomRaw = typeof window !== "undefined"
      ? parseFloat(window.localStorage.getItem("initialZoom") ?? "") : NaN;
    const initialZoom = Number.isFinite(storedZoomRaw) && storedZoomRaw > 0
      ? storedZoomRaw : DEFAULT_INITIAL_ZOOM;

    const EDGE_MARGIN = 40;
    const fitsHorizontally = contentW * initialZoom <= rect.width;
    const fitsVertically   = contentH * initialZoom <= rect.height;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const panX = fitsHorizontally ? rect.width / 2 - cx * initialZoom : EDGE_MARGIN - minX * initialZoom;
    const panY = fitsVertically   ? rect.height / 2 - cy * initialZoom : EDGE_MARGIN - minY * initialZoom;
    setPan({ x: panX, y: panY });
    setZoom(initialZoom);
    baseZoomRef.current = initialZoom;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset picker offset when a new pending drop appears
  useEffect(() => { setPickerOffset({ x: 0, y: 0 }); }, [pendingDrop]);
  useEffect(() => { setFocusedEndpoint(null); setMsgMarkerFocused(false); }, [selectedConnectorId]);

  // Dismiss connector choice popup on click outside
  useEffect(() => {
    if (!connectorChoice) return;
    function handleClick() { setConnectorChoice(null); }
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [connectorChoice]);

  // Picker drag: attach window listeners while dragging
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = pickerDragRef.current;
      if (!d) return;
      setPickerOffset({ x: d.origOffX + e.clientX - d.startX, y: d.origOffY + e.clientY - d.startY });
    }
    function onUp() { pickerDragRef.current = null; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const [draggingElementId, setDraggingElementId] = useState<string | null>(null);

  // Lasso selection state
  const [lassoRect, setLassoRect] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);

  // Space insertion marker state (BPMN only)
  const [spaceMarker, setSpaceMarker] = useState<Point | null>(null);
  const [spaceMarkerPlacing, setSpaceMarkerPlacing] = useState(false);
  // (Shift key is checked directly via event.shiftKey for lasso selection)

  // Expose viewport center to parent via ref
  if (getViewportCenterRef) {
    getViewportCenterRef.current = () => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (-pan.x + rect.width / 2) / zoom,
        y: (-pan.y + rect.height / 2) / zoom,
      };
    };
  }

  const svgToWorld = useCallback(
    (svgX: number, svgY: number): Point => ({
      x: (svgX - pan.x) / zoom,
      y: (svgY - pan.y) / zoom,
    }),
    [pan, zoom]
  );

  const clientToWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      if (!svgRef.current) return { x: 0, y: 0 };
      const rect = svgRef.current.getBoundingClientRect();
      return svgToWorld(clientX - rect.left, clientY - rect.top);
    },
    [svgToWorld]
  );

  function findDropTarget(pos: Point, fromId: string, filter?: (el: DiagramElement) => boolean): DiagramElement | null {
    const MARGIN = 30;
    const matches: DiagramElement[] = [];
    for (const el of data.elements) {
      if (el.id === fromId) continue;
      if (el.type === "system-boundary" || el.type === "lane" || el.type === "group") continue; // containers are not connector targets (pools allowed for messageBPMN)
      if (filter && !filter(el)) continue;
      if (
        pos.x >= el.x - MARGIN &&
        pos.x <= el.x + el.width + MARGIN &&
        pos.y >= el.y - MARGIN &&
        pos.y <= el.y + el.height + MARGIN
      ) {
        matches.push(el);
      }
    }
    if (matches.length === 0) return null;
    // Highest priority: boundary events (small elements on host edges) — check within margin
    const boundaryHit = matches.find(el => !!el.boundaryHostId);
    if (boundaryHit) return boundaryHit;
    // Prefer non-container elements (child states) over composite-state containers so that
    // dropping onto a state inside a composite returns the child state, not the composite.
    // But only prefer children that actually contain the drop point (not just within margin).
    const directHit = matches.find(el =>
      el.type !== "composite-state" && el.type !== "pool" && el.type !== "subprocess-expanded" &&
      pos.x >= el.x && pos.x <= el.x + el.width &&
      pos.y >= el.y && pos.y <= el.y + el.height
    );
    if (directHit) return directHit;
    // No child directly under cursor — prefer non-container within margin, then container
    const nonContainer = matches.find(el => el.type !== "composite-state" && el.type !== "pool" && el.type !== "subprocess-expanded" && el.type !== "process-group");
    if (nonContainer) return nonContainer;
    // Return the smallest container (innermost) so expanded subprocesses are valid targets
    return matches.sort((a, b) => (a.width * a.height) - (b.width * b.height))[0];
  }

  function handleConnectionPointDragStart(elementId: string, side: Side, worldPos: Point) {
    const sourceEl = data.elements.find(e => e.id === elementId);
    const outerSide = sourceEl ? getBoundaryEventOuterSide(sourceEl, data.elements) : null;
    const effectiveSide = outerSide ?? side;
    const effectiveWorldPos = (outerSide && sourceEl) ? sideMidpoint(sourceEl, outerSide) : worldPos;
    const drag: DraggingConnector = {
      fromId: elementId,
      fromSide: effectiveSide,
      fromPos: effectiveWorldPos,
      currentPos: effectiveWorldPos,
    };
    setDraggingConnector(drag);

    function onMouseMove(ev: MouseEvent) {
      const pos = clientToWorld(ev.clientX, ev.clientY);
      setDraggingConnector((prev) => prev ? { ...prev, currentPos: pos } : null);
    }

    function onMouseUp(ev: MouseEvent) {
      const pos = clientToWorld(ev.clientX, ev.clientY);
      // Check if released over the source element's bounding box.
      const srcEl = data.elements.find((e) => e.id === elementId);
      if (
        srcEl &&
        pos.x >= srcEl.x && pos.x <= srcEl.x + srcEl.width &&
        pos.y >= srcEl.y && pos.y <= srcEl.y + srcEl.height
      ) {
        // Self-transition for state elements: if drag started and ended on same state
        const SELF_TRANS_TYPES = new Set(["state", "composite-state", "submachine"]);
        if (SELF_TRANS_TYPES.has(srcEl.type) && onAddSelfTransition) {
          // Determine which long side is nearest to the release point
          const distTop    = Math.abs(pos.y - srcEl.y);
          const distBottom = Math.abs(pos.y - (srcEl.y + srcEl.height));
          const distLeft   = Math.abs(pos.x - srcEl.x);
          const distRight  = Math.abs(pos.x - (srcEl.x + srcEl.width));
          const minDist = Math.min(distTop, distBottom, distLeft, distRight);
          let side: Side;
          if (minDist === distTop)         side = "top";
          else if (minDist === distBottom) side = "bottom";
          else if (minDist === distLeft)   side = "left";
          else                             side = "right";

          // Place source and target 40px apart centred on the midpoint
          // For top/bottom: offset is along width; for left/right: along height
          const dim = (side === "top" || side === "bottom") ? srcEl.width : srcEl.height;
          const midFrac = (side === "top" || side === "bottom")
            ? (pos.x - srcEl.x) / dim
            : (pos.y - srcEl.y) / dim;
          const halfGap = 20 / dim; // 40px apart → 20px each side
          const srcOff = Math.max(0.05, Math.min(0.95, midFrac - halfGap));
          const tgtOff = Math.max(0.05, Math.min(0.95, midFrac + halfGap));

          onAddSelfTransition(elementId, side, srcOff, tgtOff, 60);
        }
        setDraggingConnector(null);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        return;
      }
      const targetEl = findDropTarget(pos, elementId);
      if (targetEl) {
        const sourceEl = data.elements.find((e) => e.id === elementId);
        const actorLike = ["actor", "team", "system", "hourglass"];
        const isDataConn =
          (sourceEl && DATA_ELEMENT_TYPES.has(sourceEl.type)) ||
          DATA_ELEMENT_TYPES.has(targetEl.type);

        const sourcePoolId = sourceEl ? getElementPoolId(sourceEl, data.elements) : null;
        const targetPoolId = getElementPoolId(targetEl, data.elements);
        const isCrossPool =
          sourcePoolId !== null && targetPoolId !== null && sourcePoolId !== targetPoolId;
        const involvesPool = sourceEl?.type === "pool" || targetEl.type === "pool";

        // Resolve ancestor chain (treating boundaryHostId as parent)
        const CHILD_EVENT_TYPES = new Set(["start-event", "intermediate-event", "end-event"]);
        function getAncestorIds(el: DiagramElement): Set<string> {
          const ids = new Set<string>();
          let cur: DiagramElement | undefined = el;
          const visited = new Set<string>();
          while (cur && !visited.has(cur.id)) {
            visited.add(cur.id);
            const nextId: string | undefined = cur.boundaryHostId ?? cur.parentId;
            if (nextId) { ids.add(nextId); cur = data.elements.find(e => e.id === nextId); }
            else break;
          }
          return ids;
        }
        // Child/boundary event ↔ boundary event on an ancestor — bypass validation rules
        const sourceAncestors = sourceEl ? getAncestorIds(sourceEl) : new Set<string>();
        const targetAncestors = getAncestorIds(targetEl);
        // True when source and target share an ancestor chain (one is nested inside the other's host hierarchy)
        const isChildEventToBoundary =
          (sourceEl && CHILD_EVENT_TYPES.has(sourceEl.type) && targetEl.boundaryHostId && sourceAncestors.has(targetEl.boundaryHostId)) ||
          (CHILD_EVENT_TYPES.has(targetEl.type) && sourceEl?.boundaryHostId && targetAncestors.has(sourceEl.boundaryHostId)) ||
          // Also: both are boundary events and one's host is an ancestor of the other
          (sourceEl && CHILD_EVENT_TYPES.has(sourceEl.type) && sourceEl.boundaryHostId &&
           CHILD_EVENT_TYPES.has(targetEl.type) && targetEl.boundaryHostId &&
           (sourceAncestors.has(targetEl.boundaryHostId) || targetAncestors.has(sourceEl.boundaryHostId)));

        if (!isChildEventToBoundary) {
          // End-event source restrictions
          if (sourceEl?.type === "end-event") {
            if (!sourceEl.boundaryHostId && !isCrossPool && !involvesPool) return;
            if (sourceEl.boundaryHostId) {
              if (targetEl.parentId === sourceEl.boundaryHostId) return;
              if (isCrossPool || involvesPool) return;
            }
          }

          // Rule 2: Edge-mounted start event — can only connect to children of its parent subprocess
          if (sourceEl?.type === "start-event" && sourceEl.boundaryHostId) {
            if (targetEl.parentId !== sourceEl.boundaryHostId) return;
          }

          // Rules 3 & 5: Edge-mounted intermediate event
          if (sourceEl?.type === "intermediate-event" && sourceEl.boundaryHostId) {
            // Rule 5: cannot connect to boundary events of the same parent subprocess
            if (targetEl.boundaryHostId === sourceEl.boundaryHostId) return;

            if (sourceEl.taskType === "send" || sourceEl.flowType === "throwing") {
              if (targetEl.parentId === sourceEl.boundaryHostId) return;
            } else if (sourceEl.taskType === "receive" || sourceEl.flowType === "catching") {
              if (targetEl.parentId !== sourceEl.boundaryHostId) return;
            }
          }
        }

        // Rule 4: Child of subprocess cannot connect to its own parent subprocess
        if (sourceEl?.parentId && targetEl.id === sourceEl.parentId && targetEl.type === "subprocess-expanded") return;
        // Rule 4b: Child state cannot connect to its own parent composite-state
        if (sourceEl?.parentId && targetEl.id === sourceEl.parentId && targetEl.type === "composite-state") return;

        if (isCrossPool || involvesPool) {
          // Never create messageBPMN between an element and its own containing pool
          if (targetEl.type === "pool" && targetPoolId === sourcePoolId) return;
          if (sourceEl?.type === "pool" && sourcePoolId === targetPoolId) return;
          // Start events cannot send messageBPMN
          if (sourceEl?.type === "start-event") return;
          const srcCy = sourceEl ? sourceEl.y + sourceEl.height / 2 : 0;
          const tgtCy = targetEl.y + targetEl.height / 2;
          const msgSrcSide: Side = srcCy <= tgtCy ? "bottom" : "top";
          const msgTgtSide: Side = srcCy <= tgtCy ? "top"    : "bottom";
          // Determine x for perpendicular messageBPMN connector
          const clamp01 = (v: number) => Math.max(0.05, Math.min(0.95, v));
          const srcLeft = sourceEl ? sourceEl.x : 0;
          const srcRight = sourceEl ? sourceEl.x + sourceEl.width : 0;
          const tgtLeft = targetEl.x;
          const tgtRight = targetEl.x + targetEl.width;
          const overlapLeft = Math.max(srcLeft, tgtLeft);
          const overlapRight = Math.min(srcRight, tgtRight);
          const hasOverlap = overlapRight > overlapLeft;

          let chosenX: number;
          if (hasOverlap) {
            // Always draw perpendicular: prefer click x, then release x, then overlap midpoint
            const clickX = effectiveWorldPos.x;
            if (clickX >= overlapLeft && clickX <= overlapRight) {
              chosenX = clickX;
            } else if (pos.x >= overlapLeft && pos.x <= overlapRight) {
              chosenX = pos.x;
            } else {
              // Clamp click x into overlap range
              chosenX = Math.max(overlapLeft, Math.min(overlapRight, clickX));
            }
          } else {
            // No overlap — no perpendicular connector possible; use click x
            chosenX = effectiveWorldPos.x;
          }

          // Store the source offset (unclamped so waypoints can reach edges)
          const msgSrcOffset = sourceEl && sourceEl.width > 0
            ? Math.max(0, Math.min(1, (chosenX - sourceEl.x) / sourceEl.width))
            : 0.5;
          onAddConnector(
            elementId, targetEl.id,
            "messageBPMN", "directed", "direct",
            msgSrcSide, msgTgtSide,
            msgSrcOffset
          );
        } else {
          if (targetEl.type === "lane") return;  // pool already handled above
          const targetOuterSide = getBoundaryEventOuterSide(targetEl, data.elements);
          // For edge-mounted events: use inner side if target is inside the host, outer side if outside
          let seqSourceSide: Side;
          if (outerSide && sourceEl?.boundaryHostId) {
            const targetIsInsideHost = targetEl.parentId === sourceEl.boundaryHostId;
            seqSourceSide = targetIsInsideHost ? oppositeSide(outerSide) : outerSide;
          } else {
            seqSourceSide = outerSide ? oppositeSide(outerSide) : effectiveSide;
          }
          // Boundary START event as target → connection comes from OUTSIDE
          // the host EP, so attach at the OUTER side.
          // Boundary END event as target → connection comes from INSIDE the
          // host EP, so attach at the INNER side.
          let seqTargetSide: Side;
          if (targetOuterSide) {
            seqTargetSide = targetEl.type === "start-event" ? targetOuterSide : oppositeSide(targetOuterSide);
          } else {
            seqTargetSide = getClosestSide(pos, targetEl);
          }

          // Source: nearest boundary point to initial click; Target: nearest to release point
          let seqSourceOffsetAlong: number | undefined;
          let seqTargetOffsetAlong: number | undefined;
          if (sourceEl && !outerSide && !targetOuterSide) {
            const srcBound = pointToBoundaryOffset(effectiveWorldPos, sourceEl);
            seqSourceSide = srcBound.side;
            seqSourceOffsetAlong = srcBound.offsetAlong;
            const tgtBound = pointToBoundaryOffset(pos, targetEl);
            seqTargetSide = tgtBound.side;
            seqTargetOffsetAlong = tgtBound.offsetAlong;
          }
          // Expanded subprocess targets always attach at the boundary point
          // nearest to the release position — even when the conditional
          // branch above didn't run (e.g. boundary-event source).
          if (targetEl.type === "subprocess-expanded") {
            const tgtBound = pointToBoundaryOffset(pos, targetEl);
            seqTargetSide = tgtBound.side;
            seqTargetOffsetAlong = tgtBound.offsetAlong;
          }
          let connType: ConnectorType;
          let connRouting: RoutingType;
          let connDirection: DirectionType;

          // Child/boundary event ↔ boundary event on ancestor → always associationBPMN
          const isChildToBoundary = isChildEventToBoundary;

          if (isChildToBoundary) {
            connType = "associationBPMN"; connRouting = "direct"; connDirection = "open-directed";
          } else if (isDataConn) {
            const isAnnotationConn =
              sourceEl?.type === "text-annotation" || targetEl.type === "text-annotation";
            connType = "associationBPMN"; connRouting = "direct";
            connDirection = isAnnotationConn ? "non-directed" : "open-directed";
          } else if (diagramType === "domain") {
            connType = "uml-association"; connRouting = defaultRoutingType; connDirection = "non-directed";
          } else if ((diagramType === "context" || diagramType === "basic") && defaultRoutingType === "curvilinear") {
            connType = "flow"; connRouting = defaultRoutingType; connDirection = defaultDirectionType;
            // Precise boundary attachment for flow connectors
            if (sourceEl) {
              const srcBound = pointToBoundaryOffset(effectiveWorldPos, sourceEl);
              seqSourceSide = srcBound.side;
              seqSourceOffsetAlong = srcBound.offsetAlong;
            }
            const tgtBound = pointToBoundaryOffset(pos, targetEl);
            seqTargetSide = tgtBound.side;
            seqTargetOffsetAlong = tgtBound.offsetAlong;
          } else if (defaultRoutingType === "curvilinear") {
            connType = "transition"; connRouting = defaultRoutingType; connDirection = defaultDirectionType;
          } else if ((sourceEl && actorLike.includes(sourceEl.type)) || actorLike.includes(targetEl.type)) {
            connType = "association"; connRouting = defaultRoutingType; connDirection = defaultDirectionType;
            // Auto Scheduler (hourglass) ↔ Process: hourglass is always source, direction is Directed (toward Process)
            const hourglassInvolved = (sourceEl?.type === "hourglass" && targetEl.type !== "hourglass") ||
              (targetEl.type === "hourglass" && sourceEl && sourceEl.type !== "hourglass");
            if (hourglassInvolved) {
              connDirection = "open-directed";
              if (targetEl.type === "hourglass") {
                // Swap source and target so hourglass is source
                const tmpSide = seqSourceSide; const tmpOff = seqSourceOffsetAlong;
                seqSourceSide = seqTargetSide; seqSourceOffsetAlong = seqTargetOffsetAlong;
                seqTargetSide = tmpSide; seqTargetOffsetAlong = tmpOff;
                onAddConnector(targetEl.id, elementId, connType, connDirection, connRouting, seqSourceSide, seqTargetSide, seqSourceOffsetAlong, seqTargetOffsetAlong);
                setDraggingConnector(null);
                window.removeEventListener("mousemove", onMouseMove);
                window.removeEventListener("mouseup", onMouseUp);
                return;
              }
            }
          } else if (diagramType === "archimate") {
            // Defer to the picker — the user chooses the relationship type
            // from a popup. Do NOT create the connector yet.
            setPendingArchiConn({
              sourceId: elementId,
              targetId: targetEl.id,
              sourceSide: seqSourceSide,
              targetSide: seqTargetSide,
              sourceOffset: seqSourceOffsetAlong,
              targetOffset: seqTargetOffsetAlong,
              screenX: ev.clientX,
              screenY: ev.clientY,
            });
            setDraggingConnector(null);
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            return;
          } else {
            connType = "sequence"; connRouting = defaultRoutingType; connDirection = defaultDirectionType;
          }
          onAddConnector(elementId, targetEl.id, connType, connDirection, connRouting, seqSourceSide, seqTargetSide, seqSourceOffsetAlong, seqTargetOffsetAlong);
        }
      }
      setDraggingConnector(null);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function handleEndpointDragStart(
    connectorId: string,
    endpoint: "source" | "target",
    startPos: Point,
    e: React.MouseEvent
  ) {
    e.stopPropagation();
    // Find the connector's current source/target id to use as "from" exclusion
    const conn = data.connectors.find((c) => c.id === connectorId);
    const fromId = conn
      ? endpoint === "source" ? conn.sourceId : conn.targetId
      : connectorId;

    setDraggingEndpoint({ connectorId, endpoint, startPos, currentPos: startPos });

    function onMouseMove(ev: MouseEvent) {
      const pos = clientToWorld(ev.clientX, ev.clientY);
      setDraggingEndpoint((prev) => prev ? { ...prev, currentPos: pos } : null);
    }

    function onMouseUp(ev: MouseEvent) {
      const pos = clientToWorld(ev.clientX, ev.clientY);
      const isMsgBPMN = conn?.type === "messageBPMN";

      // Check if dropped on the same element — reposition along its boundary
      // (skip for messageBPMN: it uses top/bottom sides only, not arbitrary boundary positions)
      // For expanded subprocesses: check if a child element is under the cursor first
      const currentEl = data.elements.find((e) => e.id === fromId);
      const isCurrentExpanded = currentEl?.type === "subprocess-expanded";
      const childUnderCursor = isCurrentExpanded
        ? data.elements.find((el) =>
            el.id !== fromId && el.parentId === fromId &&
            pos.x >= el.x && pos.x <= el.x + el.width &&
            pos.y >= el.y && pos.y <= el.y + el.height
          )
        : null;
      // Also check for boundary events on the expanded subprocess
      const boundaryUnderCursor = isCurrentExpanded
        ? data.elements.find((el) =>
            el.boundaryHostId === fromId &&
            pos.x >= el.x - 15 && pos.x <= el.x + el.width + 15 &&
            pos.y >= el.y - 15 && pos.y <= el.y + el.height + 15
          )
        : null;
      const innerTarget = childUnderCursor ?? boundaryUnderCursor;
      if (!isMsgBPMN && currentEl && !innerTarget &&
        pos.x >= currentEl.x && pos.x <= currentEl.x + currentEl.width &&
        pos.y >= currentEl.y && pos.y <= currentEl.y + currentEl.height) {
        const { side, offsetAlong } = pointToBoundaryOffset(pos, currentEl);
        onUpdateConnectorEndpoint(connectorId, endpoint, currentEl.id, side, offsetAlong);
        onSelectConnector(null);
      } else if (!isMsgBPMN && innerTarget) {
        // Dropped on a child or boundary event inside an expanded subprocess.
        // Side selection for boundary events:
        //   - Boundary START event as TARGET → OUTER (incoming flow comes
        //     from outside the host EP).
        //   - Boundary START event as SOURCE → INNER (emits into the EP).
        //   - Boundary END event → INNER both ways (received from inside,
        //     and end events don't emit).
        const targetOuterSide = getBoundaryEventOuterSide(innerTarget, data.elements);
        if (!targetOuterSide && (conn?.type === "flow" || conn?.type === "transition")) {
          const bound = pointToBoundaryOffset(pos, innerTarget);
          onUpdateConnectorEndpoint(connectorId, endpoint, innerTarget.id, bound.side, bound.offsetAlong);
        } else {
          let newSide: Side;
          if (targetOuterSide) {
            const isStartTarget = innerTarget.type === "start-event" && endpoint === "target";
            newSide = isStartTarget ? targetOuterSide : oppositeSide(targetOuterSide);
          } else {
            newSide = getClosestSide(pos, innerTarget);
          }
          onUpdateConnectorEndpoint(connectorId, endpoint, innerTarget.id, newSide, 0.5);
        }
        onSelectConnector(null);
      } else if (isMsgBPMN) {
        // messageBPMN endpoint reconnection — rules mirror the highlight logic:
        //   - If the moving end is currently on a Pool, the drop target must
        //     be another (black-box) pool.
        //   - If the moving end is currently on a Task/Subprocess, the drop
        //     target must be another Task/Subprocess inside any white-box pool.
        //   - Additionally, the arrowhead (target) end may land on a Start or
        //     Intermediate event, and the source end may land on an Intermediate
        //     or End event — both must sit in a white-box pool and not be
        //     boundary-mounted.
        // In all cases, the target must not be the fixed end itself.
        const RECEIVE_EVENTS: Set<SymbolType> = new Set(["start-event", "intermediate-event"]);
        const SEND_EVENTS:    Set<SymbolType> = new Set(["intermediate-event", "end-event"]);
        const fixedId   = endpoint === "source" ? conn!.targetId : conn!.sourceId;
        const fixedEl   = data.elements.find(e => e.id === fixedId);
        const movingEl  = data.elements.find(e => e.id === fromId);
        const movingIsPool    = movingEl?.type === "pool";
        const movingIsTaskSub = !!movingEl && MSG_TASKSUB_TYPES.has(movingEl.type);
        const validEvents = endpoint === "target" ? RECEIVE_EVENTS : SEND_EVENTS;
        const targetEl  = findDropTarget(pos, fromId);
        let valid = false;
        if (targetEl && targetEl.id !== fixedId && targetEl.id !== fromId) {
          if (movingIsPool && targetEl.type === "pool") {
            const ptype = (targetEl.properties.poolType as string | undefined) ?? "black-box";
            if (ptype === "black-box") valid = true;
          } else if (movingIsTaskSub && MSG_TASKSUB_TYPES.has(targetEl.type)) {
            const tPoolId = getElementPoolId(targetEl, data.elements);
            const tPool   = tPoolId ? data.elements.find(p => p.id === tPoolId) : null;
            if (((tPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") {
              valid = true;
            }
          }
          if (!valid && validEvents.has(targetEl.type) && !targetEl.boundaryHostId) {
            const tPoolId = getElementPoolId(targetEl, data.elements);
            const tPool   = tPoolId ? data.elements.find(p => p.id === tPoolId) : null;
            if (((tPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") {
              valid = true;
            }
          }
        }
        if (valid && targetEl && fixedEl) {
          // Top/bottom sides computed from vertical positions of new source & target
          const newSourceEl = endpoint === "source" ? targetEl : fixedEl;
          const newTargetEl = endpoint === "target" ? targetEl : fixedEl;
          const srcCy = newSourceEl.y + newSourceEl.height / 2;
          const tgtCy = newTargetEl.y + newTargetEl.height / 2;
          const newSide = endpoint === "source"
            ? ((srcCy <= tgtCy ? "bottom" : "top") as Side)
            : ((srcCy <= tgtCy ? "top"    : "bottom") as Side);
          onUpdateConnectorEndpoint(connectorId, endpoint, targetEl.id, newSide, 0.5);
        }
        onSelectConnector(null);
      } else {
        // Dropped elsewhere — reconnect to a different element (non-messageBPMN)
        const isAssocBPMN = conn?.type === "associationBPMN";
        const epFilter = isAssocBPMN
          ? undefined  // associationBPMN can connect to any element
          : conn?.routingType === "direct"
            ? (el: DiagramElement) => el.type === "use-case"
            : undefined;
        const targetEl = findDropTarget(pos, fromId, epFilter);
        if (targetEl) {
          // Block: non-associationBPMN connectors cannot connect to data elements
          if (!isAssocBPMN && DATA_ELEMENT_TYPES.has(targetEl.type)) {
            // silently abort
          } else if (isAssocBPMN && DATA_ELEMENT_TYPES.has(targetEl.type)) {
            // Block data-to-data: check if the fixed end is also a data element
            const otherEndId = endpoint === "source" ? conn!.targetId : conn!.sourceId;
            const otherEl = data.elements.find(e => e.id === otherEndId);
            if (otherEl && DATA_ELEMENT_TYPES.has(otherEl.type)) {
              // silently abort — data-to-data not allowed
            } else {
              const targetOuterSide = getBoundaryEventOuterSide(targetEl, data.elements);
              if (!targetOuterSide && (conn?.type === "flow" || conn?.type === "transition")) {
                const bound = pointToBoundaryOffset(pos, targetEl);
                onUpdateConnectorEndpoint(connectorId, endpoint, targetEl.id, bound.side, bound.offsetAlong);
              } else {
                // Boundary events: snap to the INNER side (opposite of
                // the host edge they sit on) — that's the connection
                // point inside the EP.
                const newSide = targetOuterSide ? oppositeSide(targetOuterSide) : getClosestSide(pos, targetEl);
                onUpdateConnectorEndpoint(connectorId, endpoint, targetEl.id, newSide, 0.5);
              }
            }
          } else if (targetEl.type === "pool") {
            // silently abort — only messageBPMN connectors may attach to a pool
          } else {
            const targetOuterSide = getBoundaryEventOuterSide(targetEl, data.elements);
            if (!targetOuterSide && (conn?.type === "flow" || conn?.type === "transition")) {
              const bound = pointToBoundaryOffset(pos, targetEl);
              onUpdateConnectorEndpoint(connectorId, endpoint, targetEl.id, bound.side, bound.offsetAlong);
            } else {
              // Boundary events: target-of-start = OUTER (from outside the
              // EP); everything else (including target-of-end) = INNER.
              let newSide: Side;
              if (targetOuterSide) {
                const isStartTarget = targetEl.type === "start-event" && endpoint === "target";
                newSide = isStartTarget ? targetOuterSide : oppositeSide(targetOuterSide);
              } else {
                newSide = getClosestSide(pos, targetEl);
              }
              onUpdateConnectorEndpoint(connectorId, endpoint, targetEl.id, newSide, 0.5);
            }
          }
        }
        onSelectConnector(null);
      }

      setDraggingEndpoint(null);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function handleLaneBoundaryDrag(e: React.MouseEvent, aboveLaneId: string, belowLaneId: string) {
    e.stopPropagation();
    let lastClientY = e.clientY;

    function onMouseMove(ev: MouseEvent) {
      const rawDy = ev.clientY - lastClientY;
      lastClientY = ev.clientY;
      const dy = rawDy / zoom;
      onMoveLaneBoundary?.(aboveLaneId, belowLaneId, dy);
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      onLaneBoundaryMoveEnd?.();
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function handleMessageBpmnDrag(connectorId: string, startX: number, e: React.MouseEvent) {
    e.stopPropagation();
    const conn = data.connectors.find((c) => c.id === connectorId);
    if (!conn) return;
    const sourceEl = data.elements.find((el) => el.id === conn.sourceId);
    const targetEl = data.elements.find((el) => el.id === conn.targetId);
    if (!sourceEl || !targetEl) return;

    const startClientX = e.clientX;

    function buildWaypoints(rawX: number): Point[] {
      // Clamp to both element boundaries — connector must remain vertical (single shared x)
      let x = Math.max(sourceEl!.x, Math.min(sourceEl!.x + sourceEl!.width, rawX));
      x = Math.max(targetEl!.x, Math.min(targetEl!.x + targetEl!.width, x));
      const srcEdge: Point = conn!.sourceSide === "bottom"
        ? { x, y: sourceEl!.y + sourceEl!.height } : { x, y: sourceEl!.y };
      const tgtEdge: Point = conn!.targetSide === "top"
        ? { x, y: targetEl!.y } : { x, y: targetEl!.y + targetEl!.height };
      return [
        { x: sourceEl!.x + sourceEl!.width / 2, y: sourceEl!.y + sourceEl!.height / 2 },
        srcEdge, tgtEdge,
        { x: targetEl!.x + targetEl!.width / 2, y: targetEl!.y + targetEl!.height / 2 },
      ];
    }

    function onMouseMove(ev: MouseEvent) {
      const dx = (ev.clientX - startClientX) / zoom;
      onUpdateConnectorWaypoints?.(connectorId, buildWaypoints(startX + dx));
    }

    function onMouseUp(ev: MouseEvent) {
      const dx = (ev.clientX - startClientX) / zoom;
      const rawX = startX + dx;
      // Clamp to overlap of both elements to keep vertical
      let x = Math.max(sourceEl!.x, Math.min(sourceEl!.x + sourceEl!.width, rawX));
      x = Math.max(targetEl!.x, Math.min(targetEl!.x + targetEl!.width, x));
      const srcOffset = sourceEl!.width > 0 ? (x - sourceEl!.x) / sourceEl!.width : 0.5;
      onUpdateConnectorEndpoint(connectorId, "source", conn!.sourceId, conn!.sourceSide, srcOffset);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  const handleUpdateEndOffset = useCallback((connectorId: string, field: string, offset: Point) => {
    onUpdateConnectorFields?.(connectorId, { [field]: offset } as Partial<import("@/app/lib/diagram/types").Connector>);
  }, [onUpdateConnectorFields]);

  function handleResizeDragStart(elementId: string, handle: ResizeHandle, e: React.MouseEvent) {
    e.stopPropagation();
    const el = data.elements.find((el) => el.id === elementId);
    if (!el) return;

    const isContainer = el.type === "system-boundary" || el.type === "composite-state"
      || el.type === "pool" || el.type === "subprocess-expanded" || el.type === "group"
      || el.type === "uml-class" || el.type === "uml-enumeration";
    const ar = el.width / el.height;
    const minW = isContainer ? MIN_BOUNDARY_W : 20;
    const minH = isContainer ? MIN_BOUNDARY_H : 20;

    const startMouse = { x: e.clientX, y: e.clientY };
    const startBounds = { x: el.x, y: el.y, width: el.width, height: el.height };

    // Pool vertical-boundary guide: detect left/right resize of a pool
    // and snapshot every OTHER pool's same-side boundary so we can show
    // alignment markers during the drag.
    const isPoolBoundaryDrag = el.type === "pool" && (handle.includes("w") || handle.includes("e"));
    const movingSide: "left" | "right" | null = isPoolBoundaryDrag
      ? (handle.includes("w") ? "left" : "right")
      : null;
    if (movingSide) {
      const others = data.elements
        .filter(p => p.type === "pool" && p.id !== el.id)
        .map(p => ({
          id: p.id,
          x: movingSide === "left" ? p.x : p.x + p.width,
          midY: p.y + p.height / 2,
        }));
      setPoolBoundaryGuide({
        side: movingSide,
        currentX: movingSide === "left" ? el.x : el.x + el.width,
        others,
      });
    }

    function onMouseMove(ev: MouseEvent) {
      const dx = (ev.clientX - startMouse.x) / zoom;
      const dy = (ev.clientY - startMouse.y) / zoom;
      let { x, y, width, height } = startBounds;

      if (handle.includes("e")) width  = Math.max(minW, width  + dx);
      if (handle.includes("s")) height = Math.max(minH, height + dy);
      if (handle.includes("w")) {
        const newW = Math.max(minW, width - dx);
        x = startBounds.x + startBounds.width - newW;
        width = newW;
      }
      if (handle.includes("n")) {
        const newH = Math.max(minH, height - dy);
        y = startBounds.y + startBounds.height - newH;
        height = newH;
      }

      // Types that allow independent width/height resizing
      const elType = el!.type;
      const freeResize = elType === "task" || elType === "subprocess"
        || elType === "subprocess-expanded" || elType === "state"
        || elType === "submachine" || elType === "composite-state"
        || elType === "chevron" || elType === "chevron-collapsed" || elType === "process-group"
        || (elType === "archimate-shape" && !(el!.properties?.archimateIconOnly));
      if (!isContainer && !freeResize && ar > 0) {
        if (handle.includes("e") || handle.includes("w")) {
          // Width is primary — derive height to preserve aspect ratio
          height = width / ar;
          if (handle.includes("n")) y = startBounds.y + startBounds.height - height;
        } else {
          // n or s only — height is primary, derive width and re-center x
          width = height * ar;
          x = startBounds.x + (startBounds.width - width) / 2;
        }
      }
      if (freeResize) {
        // Side handles: width only; top/bottom: height only; corners: both
        const isHoriz = handle === "e" || handle === "w";
        const isVert = handle === "n" || handle === "s";
        if (isHoriz) { y = startBounds.y; height = startBounds.height; }
        if (isVert) { x = startBounds.x; width = startBounds.width; }
      }

      // Fork/Join: only resize along the long axis, keep the thin dimension fixed
      if (elType === "fork-join") {
        const isVertical = startBounds.height >= startBounds.width;
        if (isVertical) {
          // Long axis is vertical — only allow n/s resize
          width = startBounds.width;
          x = startBounds.x;
          height = Math.max(20, height);
        } else {
          // Long axis is horizontal — only allow e/w resize
          height = startBounds.height;
          y = startBounds.y;
          width = Math.max(20, width);
        }
      }

      // Enforce content-based minimums for UML elements
      if (el!.type === "uml-enumeration" || el!.type === "uml-class") {
        const HEADER_H = 28;
        const CHAR_W = 6.5;
        const LINE_H = 14;
        const PAD = 4;
        const labelLines = (el!.type === "uml-enumeration" || el!.type === "uml-class")
          ? (editingLabel?.elementId === el!.id ? editingLabel.value : el!.label).split("\n") : [el!.label];
        const extraLines = Math.max(0, labelLines.length - 1);
        const headerH = HEADER_H + extraLines * LINE_H;
        const labelMaxW = Math.max(...labelLines.map((l: string) => l.length * CHAR_W));
        let contentMinW = labelMaxW + PAD * 2;
        let contentMinH = headerH + LINE_H;
        if (el!.type === "uml-enumeration") {
          const values: string[] = (el!.properties.values as string[] | undefined) ?? [];
          const stereotypeW = 15 * CHAR_W * 0.8;
          const valuesMaxW = values.length > 0 ? Math.max(...values.map((v: string) => v.length * CHAR_W)) : 0;
          contentMinW = Math.max(stereotypeW, labelMaxW, valuesMaxW) + PAD * 2;
          contentMinH = headerH + values.length * LINE_H;
        } else if (el!.type === "uml-class") {
          const attrs = (el!.properties.attributes as { name: string }[] | undefined) ?? [];
          const ops = (el!.properties.operations as { name: string }[] | undefined) ?? [];
          const showA = (el!.properties.showAttributes as boolean | undefined) ?? false;
          const showO = (el!.properties.showOperations as boolean | undefined) ?? false;
          const attrsH = showA ? attrs.length * LINE_H : 0;
          const opsH = showO ? ops.length * LINE_H : 0;
          contentMinH = headerH + Math.max(LINE_H, attrsH + opsH + 3);
        }
        width = Math.max(width, Math.max(80, contentMinW));
        height = Math.max(height, Math.max(40, contentMinH));
        if (handle.includes("w")) x = startBounds.x + startBounds.width - width;
        if (handle.includes("n")) y = startBounds.y + startBounds.height - height;
      }

      onResizeElement(elementId, x, y, width, height);

      // Live-update the boundary guide's X as the user drags.
      if (movingSide) {
        const newX = movingSide === "left" ? x : x + width;
        setPoolBoundaryGuide(prev => prev ? { ...prev, currentX: newX } : null);
      }
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      onResizeElementEnd?.(elementId);
      if (movingSide) setPoolBoundaryGuide(null);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  const panStart = useRef<{ mouseX: number; mouseY: number; panX: number; panY: number } | null>(null);

  function handleBackgroundMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if (pendingDrop) {
      setPendingDrop(null);
      return;
    }
    if (quickAdd) {
      setQuickAdd(null);
      return;
    }
    if (themePicker) {
      setThemePicker(null);
      return;
    }

    // Ctrl+click on background: place/move space insertion marker (BPMN only)
    if (e.ctrlKey && onInsertSpace) {
      const worldPt = clientToWorld(e.clientX, e.clientY);
      setSpaceMarker(worldPt);
      setSpaceMarkerPlacing(true);
      // Allow immediate drag to reposition
      const startCX = e.clientX;
      const startCY = e.clientY;
      function onMove(ev: MouseEvent) {
        const wp = clientToWorld(ev.clientX, ev.clientY);
        setSpaceMarker(wp);
      }
      function onUp() {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        setSpaceMarkerPlacing(false);
      }
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      return;
    }

    // Default drag → pan; hold Shift → lasso
    if (!e.shiftKey) {
      // --- Pan mode ---
      const startCX = e.clientX;
      const startCY = e.clientY;
      let didPanDrag = false;
      panStart.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };

      function onMouseMove(ev: MouseEvent) {
        if (!panStart.current) return;
        if (!didPanDrag && Math.abs(ev.clientX - startCX) < 3 && Math.abs(ev.clientY - startCY) < 3) return;
        didPanDrag = true;
        setPan({
          x: panStart.current.panX + ev.clientX - panStart.current.mouseX,
          y: panStart.current.panY + ev.clientY - panStart.current.mouseY,
        });
      }

      function onMouseUp() {
        panStart.current = null;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        // Simple click (no drag) — clear selection
        if (!didPanDrag) {
          onSetSelectedElements(new Set());
          onSelectConnector(null);
          if (pendingConnSourceId) setPendingConnSourceId(null);
          if (forceConnect) setForceConnect(null);
        }
      }

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    } else {
      // --- Lasso mode ---
      const startWorld = clientToWorld(e.clientX, e.clientY);
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      let didDrag = false;

      function onMouseMove(ev: MouseEvent) {
        const dx = ev.clientX - startClientX;
        const dy = ev.clientY - startClientY;
        if (!didDrag && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        didDrag = true;
        const endWorld = clientToWorld(ev.clientX, ev.clientY);
        setLassoRect({
          startX: startWorld.x, startY: startWorld.y,
          endX: endWorld.x, endY: endWorld.y,
        });
      }

      function onMouseUp(ev: MouseEvent) {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        setLassoRect(null);

        if (!didDrag) {
          // Simple click on background — clear selection
          if (!ev.shiftKey) {
            onSetSelectedElements(new Set());
            onSelectConnector(null);
          }
          return;
        }

        // Find all elements fully enclosed in lasso rectangle
        const endWorld = clientToWorld(ev.clientX, ev.clientY);
        const lx = Math.min(startWorld.x, endWorld.x);
        const ly = Math.min(startWorld.y, endWorld.y);
        const lx2 = Math.max(startWorld.x, endWorld.x);
        const ly2 = Math.max(startWorld.y, endWorld.y);

        const enclosed = new Set<string>();
        for (const el of data.elements) {
          if (el.x >= lx && el.y >= ly &&
              el.x + el.width <= lx2 && el.y + el.height <= ly2) {
            enclosed.add(el.id);
          }
        }

        if (ev.shiftKey) {
          // Shift+lasso: add to existing selection
          onSetSelectedElements((prev) => {
            const next = new Set(prev);
            for (const id of enclosed) next.add(id);
            return next;
          });
        } else {
          onSetSelectedElements(enclosed);
        }
        onSelectConnector(null);
      }

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(4, Math.max(0.2, zoom * delta));

    setPan((prev) => ({
      x: cx - (cx - prev.x) * (newZoom / zoom),
      y: cy - (cy - prev.y) * (newZoom / zoom),
    }));
    setZoom(newZoom);
  }

  // BPMN auto-connect: find the best existing element to connect to a newly placed
  // element, plus which sides to use. Returns null if no suitable source found.
  // Priority order (checked A → B → C):
  //   A) Nearest element strictly to the LEFT (no vertical overlap, diagonal) → top/bottom→left
  //   B) Nearest element strictly ABOVE/BELOW with horizontal overlap → bottom→top or top→bottom
  //   C) Nearest element strictly to the LEFT with vertical overlap → right→left
  function findAutoConnectSource(
    newX: number, newY: number, newW: number, newH: number,
    newSymbolType?: SymbolType
  ): { source: DiagramElement; srcSide: Side; tgtSide: Side } | null {
    const BPMN_AUTO_CONNECT = new Set<SymbolType>([
      "task", "subprocess", "subprocess-expanded", "gateway",
      "start-event", "intermediate-event", "end-event",
    ]);
    const SM_AUTO_CONNECT = new Set<SymbolType>([
      "state", "initial-state", "final-state", "composite-state", "gateway",
    ]);
    const AUTO_CONNECT_TYPES = diagramType === "state-machine" ? SM_AUTO_CONNECT : BPMN_AUTO_CONNECT;

    // Walk an element's parent chain and return the id of the nearest
    // subprocess-expanded ANCESTOR (excluding the element itself) — or null
    // if there isn't one. Used to confine auto-connect to elements that share
    // the same expanded-subprocess scope. An expanded-subprocess element is
    // therefore "outside its own scope", so it can be a valid target from
    // siblings outside the subprocess.
    function expandedParentOf(el: DiagramElement): string | null {
      let cur: DiagramElement | undefined = el.parentId
        ? data.elements.find((e) => e.id === el.parentId)
        : undefined;
      while (cur) {
        if (cur.type === "subprocess-expanded" || cur.type === "composite-state") return cur.id;
        if (!cur.parentId) return null;
        cur = data.elements.find((e) => e.id === cur!.parentId);
      }
      return null;
    }
    // The new element doesn't have a parentId yet, so infer the container
    // that would contain it based on spatial containment (matches the
    // reducer's ADD_ELEMENT logic).
    const CONTAINER_TYPES = new Set(["subprocess-expanded", "composite-state"]);
    const newRight2 = newX + newW;
    const newBottom2 = newY + newH;
    let newExpandedScope: string | null = null;
    for (const cand of data.elements) {
      if (!CONTAINER_TYPES.has(cand.type)) continue;
      if (newX >= cand.x && newRight2 <= cand.x + cand.width &&
          newY >= cand.y && newBottom2 <= cand.y + cand.height) {
        newExpandedScope = cand.id;
        break;
      }
    }

    // Infer the pool the new element would land in (spatial containment):
    // prefer the deepest lane hit, otherwise a pool directly.
    let newPool: DiagramElement | null = null;
    for (const cand of data.elements) {
      if (cand.type !== "lane") continue;
      if (newX >= cand.x && newRight2 <= cand.x + cand.width &&
          newY >= cand.y && newBottom2 <= cand.y + cand.height) {
        newPool = cand.parentId ? data.elements.find(e => e.id === cand.parentId) ?? null : null;
        break;
      }
    }
    if (!newPool) {
      for (const cand of data.elements) {
        if (cand.type !== "pool") continue;
        if (newX >= cand.x && newRight2 <= cand.x + cand.width &&
            newY >= cand.y && newBottom2 <= cand.y + cand.height) {
          newPool = cand;
          break;
        }
      }
    }
    const isWhiteBoxPool = (p: DiagramElement | null): boolean =>
      !!p && p.type === "pool" &&
      (((p.properties.poolType as string | undefined) ?? "black-box") === "white-box");
    function containingPool(el: DiagramElement): DiagramElement | null {
      let cur: DiagramElement | undefined = el;
      for (let i = 0; i < 10 && cur; i++) {
        if (cur.type === "pool") return cur;
        if (!cur.parentId) return null;
        cur = data.elements.find(e => e.id === cur!.parentId);
      }
      return null;
    }

    // Never auto-connect to/from edge-mounted (boundary) events, and never
    // cross a container boundary (expanded-subprocess or composite-state).
    // BPMN rules: never auto-connect TO a start event, never FROM an end event.
    // State-machine rules: never auto-connect TO an initial-state, never
    // connect initial → initial, never connect final → final.
    const isBpmn = diagramType === "bpmn";
    const isStateMachine = diagramType === "state-machine";
    const newIsInitial = newSymbolType === "initial-state";
    const newIsFinal = newSymbolType === "final-state";
    const newIsStartEvent = newSymbolType === "start-event";
    // BPMN: never auto-connect to/from event/transaction expanded subprocesses
    const isEventOrTxnSub = (el: DiagramElement) =>
      el.type === "subprocess-expanded" &&
      ((el.properties.subprocessType as string | undefined) === "event" ||
       (el.properties.subprocessType as string | undefined) === "transaction");

    // Valid targets for edge-mounted start events: only task, subprocess, subprocess-expanded (not events)
    const EDGE_START_TARGETS = new Set<SymbolType>(["task", "subprocess", "subprocess-expanded"]);

    const candidates = data.elements.filter((e) => {
      if (!AUTO_CONNECT_TYPES.has(e.type)) return false;
      // Allow edge-mounted start events on the new element's parent expanded subprocess
      // but only if the new element is a valid target (task, subprocess, expanded subprocess)
      if (e.boundaryHostId) {
        // Boundary-mounted start event → child element of its host. Allow
        // any of the EDGE_START_TARGETS, including subprocess-expanded
        // (assumed regular — user can delete the auto-connect if they
        // later change the subtype to event/transaction).
        if (e.type === "start-event" && e.boundaryHostId === newExpandedScope
            && newSymbolType && EDGE_START_TARGETS.has(newSymbolType)) return true;
        return false;
      }
      // BPMN: never auto-connect FROM an end event (end events have no outgoing)
      if (isBpmn && e.type === "end-event") return false;
      // BPMN: never auto-connect TO a start event
      if (isBpmn && newIsStartEvent) return false;
      // BPMN: never auto-connect to/from event or transaction expanded subprocesses
      if (isBpmn && isEventOrTxnSub(e)) return false;
      // New element is a subprocess-expanded: subtype isn't known at drop
      // time. Assume the default "regular" subtype and allow auto-connect
      // from valid sources (start/intermediate events, tasks,
      // subprocesses, gateways). The user can delete the connector if
      // they later change the subtype to event/transaction.
      // (The candidate's own validity is already covered by other rules.)
      // BPMN: never auto-connect from elements inside an Event Expanded Subprocess to outside (or vice versa)
      if (isBpmn) {
        const candParent = e.parentId ? data.elements.find(p => p.id === e.parentId) : null;
        const candInEventSub = candParent?.type === "subprocess-expanded" &&
          (candParent.properties.subprocessType as string | undefined) === "event";
        if (candInEventSub && candParent.id !== newExpandedScope) return false;
      }
      // BPMN: sequence flows cannot cross white-box pool boundaries.
      // If the candidate and the new element both sit inside pools that are
      // different and both are white-box, skip — message flows (dragged
      // manually) are the only BPMN-legal cross-pool link.
      if (isBpmn) {
        const candPool = containingPool(e);
        if (candPool && newPool && candPool.id !== newPool.id &&
            isWhiteBoxPool(candPool) && isWhiteBoxPool(newPool)) {
          return false;
        }
      }
      // State-machine: never auto-connect initial → initial or final → final
      if (isStateMachine && newIsInitial && e.type === "initial-state") return false;
      if (isStateMachine && newIsFinal && e.type === "final-state") return false;
      // Never auto-connect from an EP (or composite-state) to an element
      // that ends up inside it. Bounds-containment is the authoritative
      // test — covers direct parent and any transitive ancestor, even if
      // newExpandedScope only points to the outermost match.
      if ((e.type === "subprocess-expanded" || e.type === "composite-state") &&
          newX >= e.x && newRight2 <= e.x + e.width &&
          newY >= e.y && newBottom2 <= e.y + e.height) {
        return false;
      }
      // Both must share the same container scope (or both have none).
      if (e.id === newExpandedScope) return false;
      const candScope = expandedParentOf(e);
      return candScope === newExpandedScope;
    });
    const newRight = newX + newW;
    const newBottom = newY + newH;
    const newCx = newX + newW / 2;
    const newCy = newY + newH / 2;

    // Pre-pass 1: PROXIMITY OVERRIDE — if the nearest left candidate is
    // closer than 1/4 of the second-nearest, it wins absolutely (regardless
    // of any gateway preference).
    //
    // Pre-pass 2: DECISION-GATEWAY PRECEDENCE — if a decision gateway is
    // 1st or 2nd closest of all left candidates, it always takes precedence.
    {
      // Compute proposed connector endpoints + length for each left candidate.
      const buildResult = (src: DiagramElement) => {
        const srcCy = src.y + src.height / 2;
        const vOverlap = Math.min(src.y + src.height, newBottom) - Math.max(src.y, newY);
        let srcSide: Side; let tgtSide: Side;
        if (vOverlap > 0) {
          srcSide = "right"; tgtSide = "left";
        } else {
          srcSide = newCy < srcCy ? "top" : "bottom";
          tgtSide = "left";
        }
        // Edge-mounted start events: emit from the inner side (opposite
        // to the host edge they sit on), regardless of the new element's
        // relative geometry.
        if (src.type === "start-event" && src.boundaryHostId) {
          const outer = getBoundaryEventOuterSide(src, data.elements);
          if (outer) srcSide = oppositeSide(outer);
        }
        return { source: src, srcSide, tgtSide };
      };

      const proposedLength = (el: DiagramElement) => {
        const r = buildResult(el);
        const from = sideMidpoint(r.source, r.srcSide);
        // Synthetic target rect for the new element
        const targetRect = { ...el, x: newX, y: newY, width: newW, height: newH } as DiagramElement;
        const to = sideMidpoint(targetRect, r.tgtSide);
        return Math.hypot(to.x - from.x, to.y - from.y);
      };

      const leftCandidates = candidates
        .filter(el => el.x + el.width <= newX)
        .map(el => ({ el, dist: proposedLength(el) }))
        .sort((a, b) => a.dist - b.dist);

      // Pre-pass 1: proximity override.
      // "Very near" means the proposed connector is short relative to the
      // new element's size. If the nearest left candidate's connector is
      // shorter than the smaller of the new element's dimensions, use it
      // directly. This guarantees that placing an element right next to an
      // existing one always wires straight to it, regardless of any decision
      // gateway preference.
      // Additionally, when there are multiple candidates, the nearest also
      // wins if it is < 1/4 the length of the second-nearest.
      if (leftCandidates.length >= 1) {
        const first = leftCandidates[0];
        const proximityThreshold = Math.min(newW, newH);
        if (first.dist < proximityThreshold) {
          return buildResult(first.el);
        }
        if (leftCandidates.length >= 2) {
          const second = leftCandidates[1];
          if (first.dist < second.dist / 4) {
            return buildResult(first.el);
          }
        }
      }

      // Pre-pass 2: decision-gateway precedence (BPMN + state-machine)
      const top2 = leftCandidates.slice(0, 2);
      const decisionGw = top2.find(c =>
        c.el.type === "gateway" &&
        ((c.el.properties?.gatewayRole as string | undefined) ?? "decision") === "decision"
      );
      if (decisionGw) {
        return buildResult(decisionGw.el);
      }

      // Pre-pass 3 (state-machine only): initial-state precedence.
      // If an initial-state with no outgoing connectors exists among all
      // candidates (not just left), it always takes priority as the source.
      if (isStateMachine && newSymbolType !== "initial-state") {
        const unconnectedInitial = candidates.find(c =>
          c.type === "initial-state" &&
          !data.connectors.some(conn => conn.sourceId === c.id)
        );
        if (unconnectedInitial) {
          return buildResult(unconnectedInitial);
        }
      }
    }

    // Main: pick the NEAREST eligible candidate across all positional
    // categories (left+vertical-overlap, left+diagonal, above/below with
    // horizontal overlap). For each candidate compute the proposed connector
    // (using the side pair appropriate to its relative position) and rank by
    // the resulting connector length. Return the shortest.
    {
      type Match = { el: DiagramElement; srcSide: Side; tgtSide: Side; dist: number };
      const matches: Match[] = [];
      for (const el of candidates) {
        const elLeft = el.x;
        const elRight = el.x + el.width;
        const elTop = el.y;
        const elBottom = el.y + el.height;
        const vOverlap = Math.min(elBottom, newBottom) - Math.max(elTop, newY);
        const hOverlap = Math.min(elRight, newRight) - Math.max(elLeft, newX);

        let srcSide: Side | null = null;
        let tgtSide: Side | null = null;

        if (elRight <= newX && vOverlap > 0) {
          // Left + vertical overlap → right→left
          srcSide = "right"; tgtSide = "left";
        } else if (elRight <= newX) {
          // Left + diagonal (no vertical overlap)
          const elCy = elTop + el.height / 2;
          const newCy = newY + newH / 2;
          srcSide = newCy < elCy ? "top" : "bottom";
          tgtSide = "left";
        } else if (hOverlap > 0 && elBottom <= newY) {
          // Above with horizontal overlap → bottom→top
          srcSide = "bottom"; tgtSide = "top";
        } else if (hOverlap > 0 && newBottom <= elTop) {
          // Below with horizontal overlap → top→bottom
          srcSide = "top"; tgtSide = "bottom";
        } else if (
          (el.type === "subprocess-expanded" || el.type === "composite-state") &&
          (vOverlap > 0 || hOverlap > 0)
        ) {
          // Container source partially overlaps the new element — none of
          // the strict edge-relations fired, but a connector still makes
          // sense. Pick direction by center comparison so dropping a
          // task NEAR (not strictly outside) an EP still wires up.
          const elCx = el.x + el.width / 2;
          const elCy = elTop + el.height / 2;
          if (vOverlap > 0 && newCx > elCx) {
            srcSide = "right"; tgtSide = "left";
          } else if (hOverlap > 0 && newCy > elCy) {
            srcSide = "bottom"; tgtSide = "top";
          }
        }
        if (!srcSide || !tgtSide) continue;

        // Edge-mounted start events emit their flow into the host: the
        // visible connection point is the side OPPOSITE to the host edge
        // they're mounted on. Override the geometry-derived srcSide so
        // the connector always leaves through that "inner" side (e.g.
        // right-hand point for a left-edge mount).
        if (el.type === "start-event" && el.boundaryHostId) {
          const outer = getBoundaryEventOuterSide(el, data.elements);
          if (outer) srcSide = oppositeSide(outer);
        }

        // Distance metric: sideMidpoint (source) → sideMidpoint (synthetic
        // target rect at the new element's position).
        const from = sideMidpoint(el, srcSide);
        const targetRect = { ...el, x: newX, y: newY, width: newW, height: newH } as DiagramElement;
        const to = sideMidpoint(targetRect, tgtSide);
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        matches.push({ el, srcSide, tgtSide, dist });
      }
      if (matches.length === 0) return null;
      matches.sort((a, b) => a.dist - b.dist);
      const winner = matches[0];
      return { source: winner.el, srcSide: winner.srcSide, tgtSide: winner.tgtSide };
    }
  }

  /**
   * Mirror of findAutoConnectSource for the OPPOSITE flow direction:
   * find an existing element to be the TARGET of a sequence connector
   * from the new (just-dropped) element. Used to support:
   *   - Pass-through wiring when a new element is dropped between two
   *     existing unconnected elements (left → new → right).
   *   - Auto-connect FROM a new element TO an existing EP that sits to
   *     its right (was missing from the source-only path).
   *
   * The candidate must be positioned RIGHT/BELOW (or diagonally
   * RIGHT-of) the new element so the new element naturally flows into
   * it. Boundary events and non-boundary start events are excluded as
   * targets — sequence flows can't terminate there.
   */
  function findAutoConnectTarget(
    newX: number, newY: number, newW: number, newH: number,
    newSymbolType?: SymbolType
  ): { target: DiagramElement; srcSide: Side; tgtSide: Side } | null {
    const BPMN_AUTO_CONNECT = new Set<SymbolType>([
      "task", "subprocess", "subprocess-expanded", "gateway",
      "intermediate-event", "end-event",
    ]);
    const SM_AUTO_CONNECT = new Set<SymbolType>([
      "state", "submachine", "final-state", "composite-state", "gateway", "fork-join",
    ]);
    const AUTO_CONNECT_TYPES = diagramType === "state-machine" ? SM_AUTO_CONNECT : BPMN_AUTO_CONNECT;

    function expandedParentOf(el: DiagramElement): string | null {
      let cur: DiagramElement | undefined = el.parentId
        ? data.elements.find((e) => e.id === el.parentId)
        : undefined;
      while (cur) {
        if (cur.type === "subprocess-expanded" || cur.type === "composite-state") return cur.id;
        if (!cur.parentId) return null;
        cur = data.elements.find((e) => e.id === cur!.parentId);
      }
      return null;
    }

    const CONTAINER_TYPES = new Set(["subprocess-expanded", "composite-state"]);
    const newRight2 = newX + newW;
    const newBottom2 = newY + newH;
    let newExpandedScope: string | null = null;
    for (const cand of data.elements) {
      if (!CONTAINER_TYPES.has(cand.type)) continue;
      if (newX >= cand.x && newRight2 <= cand.x + cand.width &&
          newY >= cand.y && newBottom2 <= cand.y + cand.height) {
        newExpandedScope = cand.id;
        break;
      }
    }

    let newPool: DiagramElement | null = null;
    for (const cand of data.elements) {
      if (cand.type !== "lane") continue;
      if (newX >= cand.x && newRight2 <= cand.x + cand.width &&
          newY >= cand.y && newBottom2 <= cand.y + cand.height) {
        newPool = cand.parentId ? data.elements.find(e => e.id === cand.parentId) ?? null : null;
        break;
      }
    }
    if (!newPool) {
      for (const cand of data.elements) {
        if (cand.type !== "pool") continue;
        if (newX >= cand.x && newRight2 <= cand.x + cand.width &&
            newY >= cand.y && newBottom2 <= cand.y + cand.height) {
          newPool = cand;
          break;
        }
      }
    }
    const isWhiteBoxPool = (p: DiagramElement | null): boolean =>
      !!p && p.type === "pool" &&
      (((p.properties.poolType as string | undefined) ?? "black-box") === "white-box");
    function containingPool(el: DiagramElement): DiagramElement | null {
      let cur: DiagramElement | undefined = el;
      for (let i = 0; i < 10 && cur; i++) {
        if (cur.type === "pool") return cur;
        if (!cur.parentId) return null;
        cur = data.elements.find(e => e.id === cur!.parentId);
      }
      return null;
    }

    const isBpmn = diagramType === "bpmn";
    const isStateMachine = diagramType === "state-machine";
    const newIsEnd = newSymbolType === "end-event";
    const newIsFinal = newSymbolType === "final-state";
    const isEventOrTxnSub = (el: DiagramElement) =>
      el.type === "subprocess-expanded" &&
      ((el.properties.subprocessType as string | undefined) === "event" ||
       (el.properties.subprocessType as string | undefined) === "transaction");

    // BPMN: end events have no outgoing sequence — short-circuit.
    if (isBpmn && newIsEnd) return null;
    // State-machine: final states have no outgoing transitions — short-circuit.
    if (isStateMachine && newIsFinal) return null;

    const candidates = data.elements.filter((e) => {
      if (!AUTO_CONNECT_TYPES.has(e.type)) return false;
      // Boundary events as auto-connect targets aren't intuitive — exclude.
      if (e.boundaryHostId) return false;
      // BPMN: never connect to event/txn sub
      if (isBpmn && isEventOrTxnSub(e)) return false;
      // BPMN: candidate inside an event sub that isn't the new element's scope
      if (isBpmn) {
        const candParent = e.parentId ? data.elements.find(p => p.id === e.parentId) : null;
        const candInEventSub = candParent?.type === "subprocess-expanded" &&
          (candParent.properties.subprocessType as string | undefined) === "event";
        if (candInEventSub && candParent.id !== newExpandedScope) return false;
      }
      // BPMN: cross white-box pool prohibited
      if (isBpmn) {
        const candPool = containingPool(e);
        if (candPool && newPool && candPool.id !== newPool.id &&
            isWhiteBoxPool(candPool) && isWhiteBoxPool(newPool)) {
          return false;
        }
      }
      // State-machine: never connect to initial state
      if (isStateMachine && e.type === "initial-state") return false;
      // Cannot target an EP/composite-state whose bounds contain the new element
      // (would be the new element's own parent).
      if ((e.type === "subprocess-expanded" || e.type === "composite-state") &&
          newX >= e.x && newRight2 <= e.x + e.width &&
          newY >= e.y && newBottom2 <= e.y + e.height) {
        return false;
      }
      // Cannot target the new element's parent EP scope
      if (e.id === newExpandedScope) return false;
      // Both must share the same container scope (or both have none)
      const candScope = expandedParentOf(e);
      return candScope === newExpandedScope;
    });

    const newRight = newX + newW;
    const newBottom = newY + newH;
    const newCx = newX + newW / 2;
    const newCy = newY + newH / 2;

    type Match = { el: DiagramElement; srcSide: Side; tgtSide: Side; dist: number };
    const matches: Match[] = [];
    for (const el of candidates) {
      const elLeft = el.x;
      const elRight = el.x + el.width;
      const elTop = el.y;
      const elBottom = el.y + el.height;
      const vOverlap = Math.min(elBottom, newBottom) - Math.max(elTop, newY);
      const hOverlap = Math.min(elRight, newRight) - Math.max(elLeft, newX);

      let srcSide: Side | null = null;
      let tgtSide: Side | null = null;

      if (newRight <= elLeft && vOverlap > 0) {
        // Existing RIGHT of new with vOverlap → new.right → existing.left
        srcSide = "right"; tgtSide = "left";
      } else if (newRight <= elLeft) {
        // Existing RIGHT of new diagonally
        const elCy = elTop + el.height / 2;
        tgtSide = newCy < elCy ? "top" : "bottom";
        srcSide = "right";
      } else if (hOverlap > 0 && newBottom <= elTop) {
        // Existing BELOW new with hOverlap → new.bottom → existing.top
        srcSide = "bottom"; tgtSide = "top";
      } else if (hOverlap > 0 && elBottom <= newY) {
        // Existing ABOVE new with hOverlap (uncommon) → new.top → existing.bottom
        srcSide = "top"; tgtSide = "bottom";
      } else if (
        (el.type === "subprocess-expanded" || el.type === "composite-state") &&
        (vOverlap > 0 || hOverlap > 0)
      ) {
        // Container target partially overlaps new — center direction fallback
        const elCx = el.x + el.width / 2;
        const elCy = elTop + el.height / 2;
        if (vOverlap > 0 && newCx < elCx) {
          srcSide = "right"; tgtSide = "left";
        } else if (hOverlap > 0 && newCy < elCy) {
          srcSide = "bottom"; tgtSide = "top";
        }
      }
      if (!srcSide || !tgtSide) continue;

      const newRectSyn = { ...el, x: newX, y: newY, width: newW, height: newH } as DiagramElement;
      const from = sideMidpoint(newRectSyn, srcSide);
      const to = sideMidpoint(el, tgtSide);
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      matches.push({ el, srcSide, tgtSide, dist });
    }
    if (matches.length === 0) return null;
    matches.sort((a, b) => a.dist - b.dist);
    const winner = matches[0];
    return { target: winner.el, srcSide: winner.srcSide, tgtSide: winner.tgtSide };
  }

  // Compute the (x,y) point on an element's side at offset 0.5 (middle).
  function sideMidpoint(el: DiagramElement, side: Side): Point {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    switch (side) {
      case "left":   return { x: el.x,              y: cy };
      case "right":  return { x: el.x + el.width,   y: cy };
      case "top":    return { x: cx,                y: el.y };
      case "bottom": return { x: cx,                y: el.y + el.height };
    }
  }

  /**
   * Run a flashing-line auto-connect animation, then dispatch ONE
   * connector. Generalised to accept arbitrary source + target rects so
   * the new (just-dropped) element can be either source OR target.
   */
  function startAutoConnect(
    sourceId: string, sourceX: number, sourceY: number, sourceW: number, sourceH: number,
    targetId: string, targetX: number, targetY: number, targetW: number, targetH: number,
    srcSide: Side, tgtSide: Side
  ) {
    autoConnectAbortRef.current = false;
    const sourceRect = { x: sourceX, y: sourceY, width: sourceW, height: sourceH } as DiagramElement;
    const targetRect = { x: targetX, y: targetY, width: targetW, height: targetH } as DiagramElement;
    const from = sideMidpoint(sourceRect, srcSide);
    const to = sideMidpoint(targetRect, tgtSide);
    let cycle = 0;
    const TOTAL_CYCLES = 6; // 3 flashes = 3 on + 3 off
    setAutoConnectFlash({ sourceId, targetId, from, to, visible: true });
    const tick = () => {
      if (autoConnectAbortRef.current) { setAutoConnectFlash(null); return; }
      cycle++;
      if (cycle >= TOTAL_CYCLES) {
        setAutoConnectFlash(null);
        if (!autoConnectAbortRef.current) {
          const autoConnType: ConnectorType = diagramType === "state-machine" ? "transition" : "sequence";
          onAddConnector(
            sourceId, targetId,
            autoConnType, defaultDirectionType, defaultRoutingType,
            srcSide, tgtSide, 0.5, 0.5
          );
        }
        return;
      }
      setAutoConnectFlash(prev => prev ? { ...prev, visible: !prev.visible } : null);
      setTimeout(tick, 150);
    };
    setTimeout(tick, 150);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (readOnly) return;
    if (!pendingDragSymbol) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const worldPos = svgToWorld(e.clientX - rect.left, e.clientY - rect.top);

    // ArchiMate shape drop: short-circuit the BPMN/state-machine split +
    // auto-connect paths. Look up the catalogue entry and call
    // onAddElement with the shape's natural dimensions, label, and
    // shapeKey in properties.
    //
    // Label generation: strip the layer prefix from the catalogue name
    // ("Business Actor" → "Actor") and append a counter that increments
    // across drops of the same base name ("Actor 1", "Actor 2", …).
    if (pendingDragSymbol === "archimate-shape" && pendingArchimateShapeKey) {
      const entry = findArchimateShapeByKey(pendingArchimateShapeKey);
      const iconOnly = !!pendingArchimateIconOnly;
      let initial: { properties: Record<string, unknown>; width?: number; height?: number; label?: string };
      if (entry) {
        const baseName = entry.name.replace(/^(Business|Application|Motivation|Strategy|Technology|Physical|Implementation|Composite)\s+/i, "");
        const baseRe = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s+\\d+)?$`, "i");
        const used = data.elements.filter(el =>
          el.type === "archimate-shape" &&
          typeof el.label === "string" && baseRe.test(el.label)
        ).length;
        // Default aspect matches the palette preview (64 × 38 ≈ 1.68:1).
        // Icon-only variants use their own fixed aspect so the glyph
        // renders at a sensible scale.
        let w: number, h: number;
        if (iconOnly) {
          if (entry.iconType === "actor") { w = 48; h = 86; }       // portrait stick figure
          else if (entry.iconType === "service") { w = 120; h = 60; } // rounded-rect
          else { w = 120; h = 60; }                                   // event + fallbacks
        } else {
          w = 128; h = 76; // matches palette preview aspect
        }
        initial = {
          properties: { shapeKey: entry.key, archimateIconOnly: iconOnly },
          width: w,
          height: h,
          label: `${baseName} ${used + 1}`,
        };
      } else {
        initial = { properties: { shapeKey: pendingArchimateShapeKey, archimateIconOnly: iconOnly } };
      }
      onAddElement("archimate-shape", worldPos, undefined, undefined, undefined, initial);
      return;
    }

    // Check if dropped on a connector (split connector feature)
    const BPMN_SPLITTABLE = new Set(["gateway", "intermediate-event", "task", "subprocess"]);
    const SM_SPLITTABLE = new Set(["gateway", "state", "submachine", "composite-state", "fork-join"]);
    const SPLITTABLE_DROPS = diagramType === "state-machine" ? SM_SPLITTABLE : BPMN_SPLITTABLE;
    if ((diagramType === "bpmn" || diagramType === "state-machine") && onSplitConnector && SPLITTABLE_DROPS.has(pendingDragSymbol)) {
      const hit = findConnectorNearPoint(data.connectors, worldPos);
      if (hit) {
        if (pendingDragSymbol === "gateway" || pendingDragSymbol === "task" || pendingDragSymbol === "subprocess"
            || pendingDragSymbol === "state" || pendingDragSymbol === "submachine" || pendingDragSymbol === "composite-state" || pendingDragSymbol === "fork-join") {
          // These have no type picker — split immediately
          onSplitConnector(pendingDragSymbol, worldPos, hit.id);
          return;
        } else {
          // Intermediate event: show type picker, then split
          const containerRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setPendingDrop({
            worldPos,
            containerX: e.clientX - containerRect.left,
            containerY: e.clientY - containerRect.top,
            symbolType: "intermediate-event",
            splitConnectorId: hit.id,
          });
          return;
        }
      }
    }

    if ((pendingDragSymbol === "task" || pendingDragSymbol === "intermediate-event") && diagramType === "bpmn") {
      const containerRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setPendingDrop({
        worldPos,
        containerX: e.clientX - containerRect.left,
        containerY: e.clientY - containerRect.top,
        symbolType: pendingDragSymbol,
      });
    } else {
      addElementWithAutoConnect(pendingDragSymbol, worldPos);
    }
  }

  // Wraps onAddElement, adding BPMN auto-connect logic for elements placed
  // to the right of an existing element with vertical overlap.
  function addElementWithAutoConnect(
    symbolType: SymbolType, worldPos: Point,
    taskType?: BpmnTaskType, eventType?: EventType
  ) {
    const BPMN_AUTO_CONNECT_TYPES = new Set<SymbolType>([
      "task", "subprocess", "subprocess-expanded", "gateway",
      "start-event", "intermediate-event", "end-event",
    ]);
    const SM_AUTO_CONNECT_TYPES = new Set<SymbolType>([
      "state", "submachine", "initial-state", "final-state", "composite-state", "gateway", "fork-join",
    ]);
    const AUTO_CONNECT_TYPES = diagramType === "state-machine" ? SM_AUTO_CONNECT_TYPES : BPMN_AUTO_CONNECT_TYPES;

    // Mirror useDiagram's boundary-snap thresholds so we can predict if the
    // new element will become an edge-mounted (boundary) event in the reducer.
    const BOUNDARY_EVENT_TYPES_LOCAL = new Set<SymbolType>([
      "start-event", "intermediate-event", "end-event",
    ]);
    const BOUNDARY_HOST_TYPES_LOCAL = new Set<SymbolType>([
      "task", "subprocess", "subprocess-expanded",
    ]);
    const BOUNDARY_SNAP_THRESHOLD_LOCAL = 25;
    function willBeBoundaryEvent(): boolean {
      if (diagramType !== "bpmn") return false; // no boundary events in state machine
      if (!BOUNDARY_EVENT_TYPES_LOCAL.has(symbolType)) return false;
      const centre = worldPos;
      for (const host of data.elements) {
        if (!BOUNDARY_HOST_TYPES_LOCAL.has(host.type)) continue;
        const cx = Math.max(host.x, Math.min(host.x + host.width, centre.x));
        const cy = Math.max(host.y, Math.min(host.y + host.height, centre.y));
        const onLeft   = Math.abs(centre.x - host.x);
        const onRight  = Math.abs(centre.x - (host.x + host.width));
        const onTop    = Math.abs(centre.y - host.y);
        const onBottom = Math.abs(centre.y - (host.y + host.height));
        const inside =
          centre.x > host.x && centre.x < host.x + host.width &&
          centre.y > host.y && centre.y < host.y + host.height;
        let dist: number;
        if (inside) {
          dist = Math.min(onLeft, onRight, onTop, onBottom);
        } else {
          dist = Math.hypot(centre.x - cx, centre.y - cy);
        }
        if (dist < BOUNDARY_SNAP_THRESHOLD_LOCAL) return true;
      }
      return false;
    }

    const supportsAutoConnect = diagramType === "bpmn" || diagramType === "state-machine";
    // State-machine rules: never auto-connect TO an initial-state or final-state
    const skipAutoConnect = diagramType === "state-machine" && (symbolType === "initial-state" || symbolType === "final-state");
    if (supportsAutoConnect && AUTO_CONNECT_TYPES.has(symbolType) && !willBeBoundaryEvent() && !skipAutoConnect) {
      const def = getSymbolDefinition(symbolType);
      let newX = worldPos.x - def.defaultWidth / 2;
      let newY = worldPos.y - def.defaultHeight / 2;
      const srcFound = findAutoConnectSource(newX, newY, def.defaultWidth, def.defaultHeight, symbolType);
      const tgtFound = findAutoConnectTarget(newX, newY, def.defaultWidth, def.defaultHeight, symbolType);

      // Pass-through auto-connect: new element placed BETWEEN two
      // existing unconnected elements → wire src→new AND new→tgt.
      // Skip if there is already a sequence/transition connector
      // between src and tgt (per user rule: don't override an existing
      // direct relationship).
      let dualEligible = !!srcFound && !!tgtFound;
      if (dualEligible && srcFound && tgtFound) {
        const existingDirect = data.connectors.some(c =>
          c.sourceId === srcFound.source.id &&
          c.targetId === tgtFound.target.id &&
          (c.type === "sequence" || c.type === "transition")
        );
        if (existingDirect) dualEligible = false;
        // Also: if src and tgt are the same element (shouldn't happen
        // but defensive), skip.
        if (srcFound.source.id === tgtFound.target.id) dualEligible = false;
      }

      if (dualEligible && srcFound && tgtFound) {
        // Two-connector dual: align new.y to source's centre when the
        // src→new leg is right→left so the layout reads cleanly.
        let alignedPos = worldPos;
        let srcSide = srcFound.srcSide;
        let srcTgtSide = srcFound.tgtSide;
        let newSrcSide = tgtFound.srcSide;
        let tgtSide = tgtFound.tgtSide;
        if (srcSide === "right" && srcTgtSide === "left") {
          const srcCy = srcFound.source.y + srcFound.source.height / 2;
          newY = srcCy - def.defaultHeight / 2;
          alignedPos = { x: worldPos.x, y: srcCy };
        }
        // Gateway-as-new: pick diamond vertices for both sides.
        if (symbolType === "gateway") {
          const src = srcFound.source;
          const tgt = tgtFound.target;
          const gwTop = newY;
          const gwBottom = newY + def.defaultHeight;
          // src→new
          if (src.y + src.height <= gwTop) { srcSide = "bottom"; srcTgtSide = "top"; }
          else if (src.y >= gwBottom)      { srcSide = "top";    srcTgtSide = "bottom"; }
          else                              { srcSide = "right";  srcTgtSide = "left"; }
          // new→tgt
          if (tgt.y + tgt.height <= gwTop) { newSrcSide = "top";    tgtSide = "bottom"; }
          else if (tgt.y >= gwBottom)      { newSrcSide = "bottom"; tgtSide = "top"; }
          else                              { newSrcSide = "right"; tgtSide = "left"; }
        }
        const newId = nanoid();
        onAddElement(symbolType, alignedPos, taskType, eventType, newId);
        // Two connectors at once — skip the flash to avoid juggling two
        // independent timers, and dispatch immediately.
        const autoConnType: ConnectorType = diagramType === "state-machine" ? "transition" : "sequence";
        onAddConnector(
          srcFound.source.id, newId,
          autoConnType, defaultDirectionType, defaultRoutingType,
          srcSide, srcTgtSide, 0.5, 0.5
        );
        onAddConnector(
          newId, tgtFound.target.id,
          autoConnType, defaultDirectionType, defaultRoutingType,
          newSrcSide, tgtSide, 0.5, 0.5
        );
        return;
      }

      if (srcFound) {
        // Existing → new (the legacy path, with flash).
        let alignedPos = worldPos;
        let srcSide = srcFound.srcSide;
        let tgtSide = srcFound.tgtSide;
        if (srcSide === "right" && tgtSide === "left") {
          const srcCy = srcFound.source.y + srcFound.source.height / 2;
          newY = srcCy - def.defaultHeight / 2;
          alignedPos = { x: worldPos.x, y: srcCy };
        }
        // Override target side when the new element is a gateway.
        if (symbolType === "gateway") {
          const src = srcFound.source;
          const srcTop = src.y;
          const srcBottom = src.y + src.height;
          const gwTop = newY;
          const gwBottom = newY + def.defaultHeight;
          if (srcBottom <= gwTop) { srcSide = "bottom"; tgtSide = "top"; }
          else if (srcTop >= gwBottom) { srcSide = "top"; tgtSide = "bottom"; }
          else { srcSide = "right"; tgtSide = "left"; }
        }
        const newId = nanoid();
        onAddElement(symbolType, alignedPos, taskType, eventType, newId);
        const src = srcFound.source;
        startAutoConnect(
          src.id, src.x, src.y, src.width, src.height,
          newId, newX, newY, def.defaultWidth, def.defaultHeight,
          srcSide, tgtSide,
        );
        return;
      }

      if (tgtFound) {
        // New → existing (covers e.g. new task placed to the LEFT of an
        // existing EP). Align new.y to target's centre when the
        // new→tgt leg is right→left.
        let alignedPos = worldPos;
        const srcSide = tgtFound.srcSide;
        const tgtSide = tgtFound.tgtSide;
        if (srcSide === "right" && tgtSide === "left") {
          const tgtCy = tgtFound.target.y + tgtFound.target.height / 2;
          newY = tgtCy - def.defaultHeight / 2;
          alignedPos = { x: worldPos.x, y: tgtCy };
        }
        const newId = nanoid();
        onAddElement(symbolType, alignedPos, taskType, eventType, newId);
        const tgt = tgtFound.target;
        startAutoConnect(
          newId, newX, newY, def.defaultWidth, def.defaultHeight,
          tgt.id, tgt.x, tgt.y, tgt.width, tgt.height,
          srcSide, tgtSide,
        );
        return;
      }
    }
    onAddElement(symbolType, worldPos, taskType, eventType);
  }

  // Group-connect feature: when there's a multi-selection and the user
  // double-clicks a gateway that sits to the right of every selected element,
  // create a sequence connector from each selected element to the gateway and
  // mark the gateway as a Merge gateway.
  //
  // The first click of the double-click typically replaces the selection with
  // just the gateway, so we also consult `groupConnectPrevSelectionRef` which
  // captures the pre-click selection at element-mousedown time.
  //
  // Returns true if the group-connect was performed (so the caller skips its
  // default double-click behaviour).
  function tryGroupConnectToGateway(targetEl: DiagramElement): boolean {
    if (diagramType !== "bpmn") return false;
    if (targetEl.type !== "gateway") return false;

    // Resolve the effective selection: prefer the captured pre-click set if
    // it's still fresh, otherwise fall back to the current selection.
    let effectiveSelection: Set<string> = selectedElementIds;
    const captured = groupConnectPrevSelectionRef.current;
    if (
      captured &&
      Date.now() < captured.expiresAt &&
      captured.ids.size >= 2 &&
      !captured.ids.has(targetEl.id)
    ) {
      effectiveSelection = captured.ids;
    }
    // Consume the capture so it can't bleed into a later double-click
    groupConnectPrevSelectionRef.current = null;

    if (effectiveSelection.size < 2) return false;
    if (effectiveSelection.has(targetEl.id)) return false;

    const sources = data.elements.filter((e) => effectiveSelection.has(e.id));
    if (sources.length < 2) return false;

    // Gateway must be strictly to the right of every selected element
    const gwLeft = targetEl.x;
    const allLeft = sources.every((s) => s.x + s.width <= gwLeft);
    if (!allLeft) return false;

    // ALWAYS connect FROM the source's right edge.
    // Pick the gateway's diamond vertex based on source vertical position:
    //   source clearly above → top vertex
    //   source vertically overlaps → left vertex
    //   source clearly below → bottom vertex
    const gwTop = targetEl.y;
    const gwBottom = targetEl.y + targetEl.height;
    const sourceIds = new Set(sources.map((s) => s.id));

    // Find any existing connectors from a source in the group to this gateway
    // — they'll be deleted before the new connectors are committed.
    const existingToDelete = data.connectors.filter(
      (c) => sourceIds.has(c.sourceId) && c.targetId === targetEl.id,
    );

    // Prepare per-source connection plans (for both flash + commit)
    const plans: Array<{ src: DiagramElement; tgtSide: Side }> = sources.map((src) => {
      const srcBottom = src.y + src.height;
      const srcTop = src.y;
      let tgtSide: Side;
      if (srcBottom <= gwTop) tgtSide = "top";
      else if (srcTop >= gwBottom) tgtSide = "bottom";
      else tgtSide = "left";
      return { src, tgtSide };
    });

    // Build flash overlay endpoints (in world coords)
    const deletedFlash = existingToDelete.map((c) => {
      const wp = c.waypoints;
      // Use the first and last waypoints — they're the actual visible endpoints
      const from = wp[0] ?? { x: 0, y: 0 };
      const to = wp[wp.length - 1] ?? { x: 0, y: 0 };
      return { from, to };
    });
    const createdFlash = plans.map(({ src, tgtSide }) => ({
      from: sideMidpoint(src, "right"),
      to: sideMidpoint(targetEl, tgtSide),
    }));

    // Run a 3-flash animation, then commit the deletes + adds + role change
    setGroupFlash({ deleted: deletedFlash, created: createdFlash, visible: true });
    let cycle = 0;
    const TOTAL_CYCLES = 6; // 3 on + 3 off
    const tick = () => {
      cycle++;
      if (cycle >= TOTAL_CYCLES) {
        setGroupFlash(null);
        // Delete existing connectors
        for (const c of existingToDelete) onDeleteConnector(c.id);
        // Create new connectors (always source.right → gateway.{top|left|bottom})
        for (const { src, tgtSide } of plans) {
          onAddConnector(
            src.id, targetEl.id,
            "sequence", defaultDirectionType, defaultRoutingType,
            "right", tgtSide, 0.5, 0.5,
          );
        }
        // Mark the gateway as a Merge
        onUpdateProperties?.(targetEl.id, { gatewayRole: "merge" });
        return;
      }
      setGroupFlash((prev) => (prev ? { ...prev, visible: !prev.visible } : null));
      setTimeout(tick, 150);
    };
    setTimeout(tick, 150);
    return true;
  }

  function startEditingLabel(el: DiagramElement) {
    // Events, data objects, data stores: skip inline editor — focus Properties Panel label instead
    const SKIP_INLINE_EDIT = new Set(["start-event", "intermediate-event", "end-event", "data-store", "data-object"]);
    if (SKIP_INLINE_EDIT.has(el.type)) {
      // Element is already selected from the first click — focus the Properties Panel label field
      setTimeout(() => {
        const labelField = document.querySelector<HTMLTextAreaElement | HTMLInputElement>(
          "[data-properties-label]"
        );
        if (labelField) { labelField.focus(); labelField.select(); }
      }, 50);
      return;
    }

    const isOldContainer = el.type === "system-boundary" || el.type === "composite-state" || el.type === "subprocess-expanded" || el.type === "group";
    if (el.type === "pool" || el.type === "lane") {
      // Both pool and lane support dynamic header widths.
      const storedW = el.type === "pool"
        ? (el.properties?.poolHeaderWidth as number | undefined)
        : (el.properties?.laneHeaderWidth as number | undefined);
      const lw = typeof storedW === "number" && storedW > 0 ? storedW : 36;
      setEditingLabel({
        elementId: el.id,
        x: (el.x + lw) * zoom + pan.x,
        y: el.y * zoom + pan.y,
        width: Math.min(180, (el.width - lw) * zoom),
        height: Math.min(80, el.height * zoom),
        value: el.label,
      });
    } else if (el.type === 'text-annotation') {
      // Size edit box to match visible text area
      const PAD = 10;
      const lineH = 14;
      const avgCharWidth = 12 * 0.55;
      const charsPerLine = Math.max(1, Math.floor((el.width - PAD - 4) / avgCharWidth));
      let lineCount = 0;
      for (const segment of (el.label || ' ').split('\n')) {
        const words = segment.split(' ');
        let current = '';
        for (const word of words) {
          if (!current) { current = word; }
          else if (current.length + 1 + word.length <= charsPerLine) { current += ' ' + word; }
          else { lineCount++; current = word; }
        }
        lineCount++;
      }
      const textH = Math.max(lineH, lineCount * lineH);
      const textTopY = el.y + el.height / 2 - textH / 2;
      setEditingLabel({
        elementId: el.id,
        x: (el.x + PAD) * zoom + pan.x,
        y: textTopY * zoom + pan.y,
        width: (el.width - PAD - 4) * zoom,
        height: (textH + 4) * zoom,
        value: el.label,
      });
    } else {
      const isUmlElement = el.type === "uml-class" || el.type === "uml-enumeration";
      setEditingLabel({
        elementId: el.id,
        x: el.x * zoom + pan.x,
        y: el.y * zoom + pan.y,
        width: el.width * zoom,
        height: (isOldContainer || isUmlElement) ? HEADER_H * zoom : el.height * zoom,
        value: el.label,
      });
    }
  }

  function commitLabel() {
    if (!editingLabel) return;
    const el = data.elements.find((e) => e.id === editingLabel.elementId);
    if (el && el.type === 'use-case') {
      const { w, h } = computeUseCaseSize(editingLabel.value, el.width);
      if (w !== el.width || h !== el.height) {
        onResizeElement(el.id, el.x, el.y, w, h);
      }
    }
    // Auto-resize text-annotation height to fit wrapped text
    if (el && el.type === 'text-annotation') {
      const PAD = 10;
      const lineH = 14;
      const avgCharWidth = 12 * 0.55;
      const charsPerLine = Math.max(1, Math.floor((el.width - PAD - 4) / avgCharWidth));
      let lineCount = 0;
      for (const segment of (editingLabel.value || ' ').split('\n')) {
        const words = segment.split(' ');
        let current = '';
        for (const word of words) {
          if (!current) { current = word; }
          else if (current.length + 1 + word.length <= charsPerLine) { current += ' ' + word; }
          else { lineCount++; current = word; }
        }
        lineCount++;
      }
      const newH = Math.max(30, lineCount * lineH + 8);
      if (newH !== el.height) {
        onResizeElement(el.id, el.x, el.y, el.width, newH);
      }
    }
    onUpdateLabel(editingLabel.elementId, editingLabel.value);
    setEditingLabel(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (readOnly) return;
    const NUDGE = e.shiftKey ? 1 : 5;
    if (selectedElementIds.size === 1 && !editingLabel) {
      const selId = [...selectedElementIds][0];
      const el = data.elements.find((el) => el.id === selId);
      if (el) {
        if (e.key === "ArrowLeft")  { e.preventDefault(); onMoveElement(selId, el.x - NUDGE, el.y); return; }
        if (e.key === "ArrowRight") { e.preventDefault(); onMoveElement(selId, el.x + NUDGE, el.y); return; }
        if (e.key === "ArrowUp")    { e.preventDefault(); onMoveElement(selId, el.x, el.y - NUDGE); return; }
        if (e.key === "ArrowDown")  { e.preventDefault(); onMoveElement(selId, el.x, el.y + NUDGE); return; }
      }
    } else if (selectedElementIds.size > 1 && !editingLabel && onMoveElements) {
      const ids = [...selectedElementIds];
      if (e.key === "ArrowLeft")  { e.preventDefault(); onMoveElements(ids, -NUDGE, 0); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); onMoveElements(ids, NUDGE, 0); return; }
      if (e.key === "ArrowUp")    { e.preventDefault(); onMoveElements(ids, 0, -NUDGE); return; }
      if (e.key === "ArrowDown")  { e.preventDefault(); onMoveElements(ids, 0, NUDGE); return; }
    }
    // Nudge selected connector or focused endpoint with arrow keys.
    // Skip endpoint nudging when the connector attaches centre-to-centre
    // (direct-routing connectors, and associationBPMN involving a data
    // element) — there's no stable boundary offset to nudge against.
    if (selectedConnectorId && selectedElementIds.size === 0 && !editingLabel) {
      const NUDGE = e.shiftKey ? 1 : 5;
      const endpointNudgeBlocked = selectedConnector?.routingType === "direct"
        || (selectedConnector?.type === "associationBPMN" && (() => {
            const DATA = new Set<string>(["data-object", "data-store"]);
            const s = data.elements.find(el => el.id === selectedConnector.sourceId);
            const t = data.elements.find(el => el.id === selectedConnector.targetId);
            return (s && DATA.has(s.type)) || (t && DATA.has(t.type));
          })());
      if (focusedEndpoint && onNudgeConnectorEndpoint && !endpointNudgeBlocked) {
        if (e.key === "ArrowLeft")  { e.preventDefault(); onNudgeConnectorEndpoint(selectedConnectorId, focusedEndpoint, -NUDGE, 0); return; }
        if (e.key === "ArrowRight") { e.preventDefault(); onNudgeConnectorEndpoint(selectedConnectorId, focusedEndpoint, NUDGE, 0); return; }
        if (e.key === "ArrowUp")    { e.preventDefault(); onNudgeConnectorEndpoint(selectedConnectorId, focusedEndpoint, 0, -NUDGE); return; }
        if (e.key === "ArrowDown")  { e.preventDefault(); onNudgeConnectorEndpoint(selectedConnectorId, focusedEndpoint, 0, NUDGE); return; }
      } else if (onNudgeConnector) {
        if (e.key === "ArrowLeft")  { e.preventDefault(); onNudgeConnector(selectedConnectorId, -NUDGE, 0); return; }
        if (e.key === "ArrowRight") { e.preventDefault(); onNudgeConnector(selectedConnectorId, NUDGE, 0); return; }
        if (e.key === "ArrowUp")    { e.preventDefault(); onNudgeConnector(selectedConnectorId, 0, -NUDGE); return; }
        if (e.key === "ArrowDown")  { e.preventDefault(); onNudgeConnector(selectedConnectorId, 0, NUDGE); return; }
      }
    }
    if (e.key === "Escape") {
      setDraggingConnector(null);
      setDraggingEndpoint(null);
      setEditingLabel(null);
      setPendingDrop(null);
      onSetSelectedElements(new Set());
      onSelectConnector(null);
      // Abort any in-progress auto-connect
      if (autoConnectFlash) {
        autoConnectAbortRef.current = true;
        setAutoConnectFlash(null);
      }
      // Cancel connection-creation mode
      if (pendingConnSourceId) setPendingConnSourceId(null);
      if (forceConnect) setForceConnect(null);
      // Dismiss right-click popups
      if (quickAdd) setQuickAdd(null);
      if (themePicker) setThemePicker(null);
    }
    if (e.key === "Delete") {
      if (editingLabel) return;
      if (selectedElementIds.size > 0) {
        for (const id of selectedElementIds) onDeleteElement(id);
        onSetSelectedElements(new Set());
      }
      if (selectedConnectorId) onDeleteConnector(selectedConnectorId);
    }
    // Escape cancels space marker
    if (e.key === "Escape" && spaceMarker) {
      setSpaceMarker(null);
      setSpaceMarkerPlacing(false);
    }
  }

  const transform = `translate(${pan.x}, ${pan.y}) scale(${zoom})`;
  const isDraggingConnector = draggingConnector !== null;
  const isDraggingEndpoint = draggingEndpoint !== null;

  // Render pools first (deepest), then other containers, then lanes, then regular elements
  const pools = data.elements.filter((el) => el.type === "pool");
  const lanes = data.elements.filter((el) => el.type === "lane")
    .sort((a, b) => {
      // Parent lanes render before (behind) child lanes
      const depthA = a.parentId && data.elements.find(e => e.id === a.parentId)?.type === "lane" ? 1 : 0;
      const depthB = b.parentId && data.elements.find(e => e.id === b.parentId)?.type === "lane" ? 1 : 0;
      return depthA - depthB;
    });
  // Compute sublane IDs: lanes whose parent is also a lane
  const sublaneIds = useMemo(() => {
    const laneIds = new Set(data.elements.filter(e => e.type === "lane").map(e => e.id));
    const result = new Set<string>();
    for (const el of data.elements) {
      if (el.type === "lane" && el.parentId && laneIds.has(el.parentId)) {
        result.add(el.id);
      }
    }
    return result;
  }, [data.elements]);

  // Lane nesting depth (0 = top-level lane, 1 = sublane, 2 = sub-sublane, etc.)
  const laneDepthMap = useMemo(() => {
    const map = new Map<string, number>();
    const byId = new Map(data.elements.map(e => [e.id, e]));
    for (const el of data.elements) {
      if (el.type !== "lane") continue;
      let depth = 0;
      let cur: typeof el | undefined = el;
      const visited = new Set<string>();
      while (cur?.parentId && !visited.has(cur.id)) {
        visited.add(cur.id);
        const parent = byId.get(cur.parentId);
        if (!parent) break;
        if (parent.type === "lane") depth++;
        cur = parent;
      }
      map.set(el.id, depth);
    }
    return map;
  }, [data.elements]);

  const otherContainersUnsorted = data.elements.filter(
    (el) => el.type === "system-boundary" || el.type === "composite-state"
         || el.type === "subprocess-expanded" || el.type === "process-group"
  );
  // Sort containers by nesting depth so parents render before (behind) children
  const otherContainers = (() => {
    const depthMap = new Map<string, number>();
    const containerSet = new Set(otherContainersUnsorted.map(e => e.id));
    function getDepth(el: DiagramElement, visited: Set<string>): number {
      if (depthMap.has(el.id)) return depthMap.get(el.id)!;
      if (!el.parentId || visited.has(el.id)) { depthMap.set(el.id, 0); return 0; }
      visited.add(el.id);
      const parent = containerSet.has(el.parentId) ? otherContainersUnsorted.find(p => p.id === el.parentId) : undefined;
      const d = parent ? getDepth(parent, visited) + 1 : 0;
      depthMap.set(el.id, d);
      return d;
    }
    for (const el of otherContainersUnsorted) getDepth(el, new Set());
    return [...otherContainersUnsorted].sort((a, b) => (depthMap.get(a.id) ?? 0) - (depthMap.get(b.id) ?? 0));
  })();
  const groupElements = data.elements.filter((el) => el.type === "group");

  // ArchiMate descendant depth: for every archimate-shape, the max
  // depth of its descendant chain (0 = leaf, 1 = parent of leaves,
  // 2 = grandparent, …). Drives per-level fill lightening.
  const archimateDepthMap = useMemo(() => {
    const m = new Map<string, number>();
    const children = new Map<string, string[]>();
    for (const e of data.elements) {
      if (e.parentId) {
        if (!children.has(e.parentId)) children.set(e.parentId, []);
        children.get(e.parentId)!.push(e.id);
      }
    }
    function depth(id: string, visited: Set<string>): number {
      if (m.has(id)) return m.get(id)!;
      if (visited.has(id)) return 0;
      visited.add(id);
      const kids = children.get(id) ?? [];
      if (kids.length === 0) { m.set(id, 0); return 0; }
      let maxChildDepth = 0;
      for (const kid of kids) maxChildDepth = Math.max(maxChildDepth, depth(kid, visited));
      const d = maxChildDepth + 1;
      m.set(id, d);
      return d;
    }
    for (const e of data.elements) if (e.type === "archimate-shape") depth(e.id, new Set());
    return m;
  }, [data.elements]);

  // Compute process-group nesting depth: how many process-group ancestors each has
  const processGroupDepthMap = useMemo(() => {
    const DEPTH_TYPES = new Set(["process-group", "subprocess-expanded"]);
    const map = new Map<string, number>();
    for (const el of data.elements) {
      if (!DEPTH_TYPES.has(el.type)) continue;
      let depth = 0;
      let cur = el;
      const visited = new Set<string>();
      while (cur.parentId && !visited.has(cur.id)) {
        visited.add(cur.id);
        const parent = data.elements.find(p => p.id === cur.parentId);
        if (!parent) break;
        if (parent.type === el.type) depth++; // count ancestors of the same type
        cur = parent;
      }
      map.set(el.id, depth);
    }
    return map;
  }, [data.elements]);
  // Sort non-containers by parent nesting depth so children of deeper subprocesses render on top
  const nonContainers = (() => {
    const items = data.elements.filter(
      (el) => el.type !== "system-boundary" && el.type !== "composite-state"
                && el.type !== "pool" && el.type !== "lane"
                && el.type !== "subprocess-expanded"
                && el.type !== "group"
                && el.type !== "process-group"
                && !el.boundaryHostId
    );
    function getParentDepth(el: DiagramElement): number {
      let depth = 0;
      let current = el;
      const visited = new Set<string>();
      while (current.parentId && !visited.has(current.id)) {
        visited.add(current.id);
        const parent = data.elements.find(p => p.id === current.parentId);
        if (!parent) break;
        depth++;
        current = parent;
      }
      return depth;
    }
    return items.sort((a, b) => {
      // Dragging text-annotation renders LAST so it sits above all other
      // non-container elements while the user moves it (requested UX).
      const aDragAnno = a.id === draggingElementId && a.type === "text-annotation";
      const bDragAnno = b.id === draggingElementId && b.type === "text-annotation";
      if (aDragAnno && !bDragAnno) return 1;
      if (bDragAnno && !aDragAnno) return -1;
      return getParentDepth(a) - getParentDepth(b);
    });
  })();
  const boundaryEvents = data.elements.filter((el) => !!el.boundaryHostId);

  // Precompute messageBPMN highlight context
  const BPMN_TRIGGER_TYPES = new Set<string>(["task", "subprocess", "subprocess-expanded", "intermediate-event", "end-event", "pool"]);
  const draggingSourceEl = draggingConnector
    ? (data.elements.find((e) => e.id === draggingConnector.fromId) ?? null)
    : null;
  const isBpmnSource = draggingSourceEl ? BPMN_TRIGGER_TYPES.has(draggingSourceEl.type) : false;
  const draggingSourcePoolId = draggingSourceEl
    ? getElementPoolId(draggingSourceEl, data.elements)
    : null;
  const draggingSourceIsData = draggingSourceEl ? DATA_ELEMENT_TYPES.has(draggingSourceEl.type) : false;
  const draggingFromPool = draggingSourceEl?.type === "pool";
  const draggingFromFreeEndEvent =
    draggingSourceEl?.type === "end-event" && !draggingSourceEl.boundaryHostId;
  const draggingFromEdgeMountedEndEvent =
    draggingSourceEl?.type === "end-event" && !!draggingSourceEl.boundaryHostId;
  const draggingFromEdgeMountedStartEvent =
    draggingSourceEl?.type === "start-event" && !!draggingSourceEl.boundaryHostId;
  const draggingFromEdgeMountedIntermediateSendEvent =
    draggingSourceEl?.type === "intermediate-event" &&
    !!draggingSourceEl.boundaryHostId &&
    (draggingSourceEl.flowType === "throwing" || (draggingSourceEl.flowType == null && draggingSourceEl.taskType === "send"));
  const draggingFromEdgeMountedIntermediateReceiveEvent =
    draggingSourceEl?.type === "intermediate-event" &&
    !!draggingSourceEl.boundaryHostId &&
    draggingSourceEl.flowType === "catching";
  const draggingFromEdgeMountedIntermediateEvent =
    draggingFromEdgeMountedIntermediateSendEvent || draggingFromEdgeMountedIntermediateReceiveEvent;
  const draggingSourceBoundaryHostId = draggingSourceEl?.boundaryHostId ?? null;
  // State-machine: no connections FROM final-state or TO initial-state
  const draggingFromFinalState = draggingSourceEl?.type === "final-state";
  // BPMN: no sequence from Event Expanded Subprocess
  const draggingFromEventSubprocess = draggingSourceEl?.type === "subprocess-expanded" &&
    (draggingSourceEl.properties.subprocessType as string | undefined) === "event";
  // BPMN: no sequence from inside an Event Expanded Subprocess to outside
  const draggingFromInsideEventSubprocess = (() => {
    if (!draggingSourceEl?.parentId) return false;
    const p = data.elements.find(e => e.id === draggingSourceEl!.parentId);
    return p?.type === "subprocess-expanded" && (p.properties.subprocessType as string | undefined) === "event";
  })();
  const CHILD_EVENT_TYPES_HIGHLIGHT = new Set(["start-event", "intermediate-event", "end-event"]);
  // Compute ancestor IDs for dragging source (treating boundaryHostId as parent)
  const draggingSourceAncestorIds = (() => {
    if (!draggingSourceEl) return new Set<string>();
    const ids = new Set<string>();
    let cur: DiagramElement | undefined = draggingSourceEl;
    const visited = new Set<string>();
    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id);
      const nextId: string | undefined = cur.boundaryHostId ?? cur.parentId;
      if (nextId) { ids.add(nextId); cur = data.elements.find(e => e.id === nextId); }
      else break;
    }
    return ids;
  })();
  const draggingFromChildEvent =
    draggingSourceEl != null &&
    CHILD_EVENT_TYPES_HIGHLIGHT.has(draggingSourceEl.type) &&
    !draggingSourceEl.boundaryHostId &&
    !!draggingSourceEl.parentId;
  const draggingSourceParentId = draggingSourceEl?.parentId ?? null;
  // Edge-mounted event on a child element inside an expanded subprocess
  const draggingFromBoundaryOnChild =
    draggingSourceEl != null &&
    CHILD_EVENT_TYPES_HIGHLIGHT.has(draggingSourceEl.type) &&
    !!draggingSourceEl.boundaryHostId &&
    data.elements.some(e => e.id === draggingSourceEl.boundaryHostId && !!e.parentId);
  const draggingSourceHostParentId = draggingFromBoundaryOnChild
    ? data.elements.find(e => e.id === draggingSourceEl!.boundaryHostId)?.parentId ?? null
    : null;

  // Compute misaligned messageBPMN connectors: (a) no x-overlap between source
  // and target, or (b) attached to a white-box pool (messages can only touch
  // black-box pools or flow elements, not white-box pools). Both cases flag
  // the connector for red rendering so the user can see the orphan.
  const misalignedConnectorIds = new Set<string>();
  const errorTargetIds = new Set<string>();
  const isWhiteBoxPool = (el: DiagramElement | undefined): boolean =>
    !!el && el.type === "pool"
      && ((el.properties.poolType as string | undefined) ?? "black-box") === "white-box";
  data.connectors
    .filter((c) => c.type === "messageBPMN")
    .forEach((c) => {
      const src = data.elements.find((e) => e.id === c.sourceId);
      const tgt = data.elements.find((e) => e.id === c.targetId);
      if (src && tgt) {
        if (isWhiteBoxPool(src) || isWhiteBoxPool(tgt)) {
          misalignedConnectorIds.add(c.id);
          errorTargetIds.add(c.targetId);
          return;
        }
        const overlapMax = Math.min(src.x + src.width, tgt.x + tgt.width);
        const overlapMin = Math.max(src.x, tgt.x);
        if (overlapMax <= overlapMin) {
          misalignedConnectorIds.add(c.id);
          errorTargetIds.add(c.targetId);
        }
      }
    });

  // Detect connectors whose path passes through elements (obstacle violations) — domain diagrams only
  const obstacleViolationConnIds = new Set<string>();
  const obstacleViolationElementIds = new Set<string>();
  function segCrossesRect(p1: Point, p2: Point, r: { x: number; y: number; w: number; h: number }): boolean {
    const left = r.x, right = r.x + r.w, top = r.y, bottom = r.y + r.h;
    if (Math.abs(p1.y - p2.y) < 1) {
      if (p1.y < top || p1.y > bottom) return false;
      return Math.max(p1.x, p2.x) > left && Math.min(p1.x, p2.x) < right;
    }
    if (Math.abs(p1.x - p2.x) < 1) {
      if (p1.x < left || p1.x > right) return false;
      return Math.max(p1.y, p2.y) > top && Math.min(p1.y, p2.y) < bottom;
    }
    // Diagonal
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    for (const ey of [top, bottom]) {
      if (Math.abs(dy) > 0.01) { const t = (ey - p1.y) / dy; if (t >= 0 && t <= 1) { const ix = p1.x + dx * t; if (ix >= left && ix <= right) return true; } }
    }
    for (const ex of [left, right]) {
      if (Math.abs(dx) > 0.01) { const t = (ex - p1.x) / dx; if (t >= 0 && t <= 1) { const iy = p1.y + dy * t; if (iy >= top && iy <= bottom) return true; } }
    }
    return false;
  }
  const isDbDomain = diagramType === "domain" && data.database && data.database !== "none";
  if (diagramType === "domain" && !isDbDomain) for (const conn of data.connectors) {
    const wp = conn.waypoints;
    if (wp.length < 3) continue;
    const vs = conn.sourceInvisibleLeader ? 1 : 0;
    const ve = conn.targetInvisibleLeader ? wp.length - 2 : wp.length - 1;
    const visible = wp.slice(vs, ve + 1);
    const interior = wp.slice(vs + 1, ve);
    for (const el of data.elements) {
      if (el.type === "pool" || el.type === "lane") continue;
      const b = { x: el.x, y: el.y, w: el.width, h: el.height };
      const isOwn = el.id === conn.sourceId || el.id === conn.targetId;
      let violation = false;
      if (isOwn) {
        // Check if interior waypoints or segments pass through own source/target
        for (const pt of interior) {
          if (pt.x > b.x + 1 && pt.x < b.x + b.w - 1 && pt.y > b.y + 1 && pt.y < b.y + b.h - 1) { violation = true; break; }
        }
        if (!violation) {
          for (let i = 0; i < interior.length - 1; i++) {
            if (segCrossesRect(interior[i], interior[i + 1], b)) { violation = true; break; }
          }
        }
      } else {
        if (el.boundaryHostId === conn.sourceId || el.boundaryHostId === conn.targetId) continue;
        // Check waypoints inside OR segments crossing
        for (const pt of visible) {
          if (pt.x > b.x && pt.x < b.x + b.w && pt.y > b.y && pt.y < b.y + b.h) { violation = true; break; }
        }
        if (!violation) {
          for (let i = 0; i < visible.length - 1; i++) {
            if (segCrossesRect(visible[i], visible[i + 1], b)) { violation = true; break; }
          }
        }
      }
      if (violation) {
        obstacleViolationConnIds.add(conn.id);
        obstacleViolationElementIds.add(el.id);
      }
    }
  }

  // Endpoint handle positions for selected connector
  const selectedConnector: Connector | null =
    selectedConnectorId
      ? (data.connectors.find((c) => c.id === selectedConnectorId) ?? null)
      : null;

  // Force-connect handler: Shift+Ctrl+Click starts, next click on target creates forced sequence connector
  function handleForceConnectSelect(elId: string, ev?: React.MouseEvent): boolean {
    if (diagramType !== "bpmn") return false;
    // Start force-connect: Shift+Ctrl+Click on an element
    if (ev?.shiftKey && ev?.ctrlKey) {
      setForceConnect({ sourceId: elId, dragging: true });
      onSetSelectedElements(new Set([elId]));
      return true;
    }
    // Complete force-connect: click on target while in force-connect mode
    if (forceConnect?.dragging && forceConnect.sourceId !== elId) {
      const src = data.elements.find(e => e.id === forceConnect.sourceId);
      const tgt = data.elements.find(e => e.id === elId);
      if (src && tgt) {
        const srcCx = src.x + src.width / 2;
        const tgtCx = tgt.x + tgt.width / 2;
        const srcCy = src.y + src.height / 2;
        const tgtCy = tgt.y + tgt.height / 2;
        let srcSide: Side, tgtSide: Side;
        if (Math.abs(tgtCy - srcCy) > Math.abs(tgtCx - srcCx)) {
          srcSide = tgtCy > srcCy ? "bottom" : "top";
          tgtSide = tgtCy > srcCy ? "top" : "bottom";
        } else {
          srcSide = "right";
          tgtSide = "left";
        }
        onAddConnector(forceConnect.sourceId, elId, "sequence", "directed", "rectilinear", srcSide, tgtSide, 0.5, 0.5, true);
      }
      setForceConnect(null);
      return true;
    }
    return false;
  }

  const endpointHandles = selectedConnector && selectedConnector.waypoints.length >= 2
    ? (() => {
        const wp = selectedConnector.waypoints;
        // messageBPMN has two waypoint formats (2-point AI import and 4-point
        // runtime). The edge points are determined by the invisible-leader
        // flags. All other connector types use [1] and [length-2].
        const isMsg = selectedConnector.type === "messageBPMN";
        const srcIdx = isMsg && !selectedConnector.sourceInvisibleLeader ? 0 : 1;
        const tgtIdx = isMsg && !selectedConnector.targetInvisibleLeader ? wp.length - 1 : wp.length - 2;
        return { source: wp[srcIdx], target: wp[tgtIdx] };
      })()
    : null;

  // Context for highlighting valid drop targets during messageBPMN endpoint drag
  const draggingEndpointConn = draggingEndpoint
    ? data.connectors.find(c => c.id === draggingEndpoint.connectorId) ?? null
    : null;
  const isMessageBpmnEndpointDrag = draggingEndpointConn?.type === "messageBPMN";
  const epDragFixedId = draggingEndpoint && draggingEndpointConn
    ? (draggingEndpoint.endpoint === "source" ? draggingEndpointConn.targetId : draggingEndpointConn.sourceId)
    : null;
  const epDragFixedEl = epDragFixedId
    ? data.elements.find(e => e.id === epDragFixedId) ?? null
    : null;
  const epDragFixedPoolId = epDragFixedEl ? getElementPoolId(epDragFixedEl, data.elements) : null;

  // Context for highlighting valid drop targets during associationBPMN endpoint drag
  const isAssocBpmnEndpointDrag = draggingEndpointConn?.type === "associationBPMN";
  const epDragMovingId = draggingEndpoint && draggingEndpointConn
    ? (draggingEndpoint.endpoint === "source" ? draggingEndpointConn.sourceId : draggingEndpointConn.targetId)
    : null;
  const epDragFixedIsData = epDragFixedEl ? DATA_ELEMENT_TYPES.has(epDragFixedEl.type) : false;

  // For messageBPMN endpoint drag: the element the moving end is currently
  // attached to. User rules:
  //   - Pool endpoint moves to another pool.
  //   - Task/Subprocess endpoint moves to another task/subprocess inside a
  //     white-box pool.
  //   - Arrowhead (target) endpoint may ALSO attach to a Start or Intermediate
  //     event (receive-capable) inside a white-box pool.
  //   - Source (start) endpoint may ALSO attach to an Intermediate or End
  //     event (send-capable) inside a white-box pool.
  const MSG_TASKSUB_TYPES: Set<SymbolType> = new Set(["task", "subprocess", "subprocess-expanded"]);
  const MSG_RECEIVE_EVENT_TYPES: Set<SymbolType> = new Set(["start-event", "intermediate-event"]);
  const MSG_SEND_EVENT_TYPES: Set<SymbolType> = new Set(["intermediate-event", "end-event"]);
  const epDragMovingEl = epDragMovingId
    ? data.elements.find(e => e.id === epDragMovingId) ?? null
    : null;
  const epDragMovingIsPool = isMessageBpmnEndpointDrag && epDragMovingEl?.type === "pool";
  const epDragMovingIsTaskSub = isMessageBpmnEndpointDrag && epDragMovingEl ? MSG_TASKSUB_TYPES.has(epDragMovingEl.type) : false;
  // Which event types are valid for the end being dragged.
  const epDragMsgEventTypes: Set<SymbolType> | null = isMessageBpmnEndpointDrag && draggingEndpoint
    ? (draggingEndpoint.endpoint === "target" ? MSG_RECEIVE_EVENT_TYPES : MSG_SEND_EVENT_TYPES)
    : null;

  return (
    <div
      className="relative flex-1 overflow-hidden bg-gray-50 select-none"
      style={{
        backgroundImage: "radial-gradient(#d1d5db 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      <DisplayModeCtx.Provider value={displayMode}>
      <FontScaleCtx.Provider value={((data.fontSize ?? 12) / 12) * (displayMode === "hand-drawn" ? 1.3 : 1)}>
      <ConnectorFontScaleCtx.Provider value={((data.connectorFontSize ?? 10) / 10) * (displayMode === "hand-drawn" ? 1.3 : 1)}>
      <TitleFontSizeCtx.Provider value={data.titleFontSize ?? 14}>
      <PoolFontSizeCtx.Provider value={(data.poolFontSize ?? 12) * (displayMode === "hand-drawn" ? 1.3 : 1)}>
      <LaneFontSizeCtx.Provider value={(data.laneFontSize ?? 12) * (displayMode === "hand-drawn" ? 1.3 : 1)}>
      <SublaneIdsCtx.Provider value={sublaneIds}>
      <ProcessGroupDepthCtx.Provider value={processGroupDepthMap}>
      <LaneDepthCtx.Provider value={laneDepthMap}>
      <ArchimateDepthCtx.Provider value={archimateDepthMap}>
      <DatabaseCtx.Provider value={data.database}>
      <svg
        ref={svgRef}
        data-canvas
        className="w-full h-full outline-none"
        tabIndex={0}
        onMouseDownCapture={() => svgRef.current?.focus({ preventScroll: true })}
        onMouseDown={handleBackgroundMouseDown}
        onWheel={handleWheel}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onKeyDown={handleKeyDown}
        onContextMenu={(e) => {
          if (readOnly || (diagramType !== "bpmn" && diagramType !== "state-machine" && diagramType !== "value-chain")) return;
          e.preventDefault();
          const rect = svgRef.current?.getBoundingClientRect();
          if (!rect) return;
          // If 2+ process elements selected, show theme picker instead of quick-add
          const CHEVRON_SET = new Set(["chevron", "chevron-collapsed"]);
          const selectedChevrons = data.elements.filter(
            el => selectedElementIds.has(el.id) && CHEVRON_SET.has(el.type)
          );
          if (selectedChevrons.length >= 2 && onUpdatePropertiesBatch) {
            setThemePicker({
              screenX: e.clientX - rect.left,
              screenY: e.clientY - rect.top,
            });
            return;
          }
          const worldPos = svgToWorld(e.clientX - rect.left, e.clientY - rect.top);
          setQuickAdd({
            worldPos,
            screenX: e.clientX - rect.left,
            screenY: e.clientY - rect.top,
          });
        }}
        style={{ cursor: isDraggingConnector || isDraggingEndpoint ? "crosshair" : "default" }}
      >
        <SketchyFilter />
        <g transform={transform} style={{ ...(displayMode === "hand-drawn" ? { fontStyle: "italic", fontFamily: "var(--font-caveat), 'Segoe Print', 'Comic Sans MS', cursive" } : undefined), ...(readOnly ? { pointerEvents: "none" } : undefined) }}>
          {/* Diagram Title Block */}
          {data.title?.showTitle && (() => {
            const els = data.elements;
            if (els.length === 0) return null;
            let minX = Infinity, maxX = -Infinity, minY = Infinity;
            for (const el of els) {
              const l = el.x, r = el.x + el.width, t = el.y;
              if (l < minX) minX = l;
              if (r > maxX) maxX = r;
              if (t < minY) minY = t;
            }
            const cx = (minX + maxX) / 2;
            const title = data.title;
            const statusLabel = (title.status ?? "draft").charAt(0).toUpperCase() + (title.status ?? "draft").slice(1);
            // Format datetime in AEST/AEDT
            function formatAustralianTime(iso: string): string {
              const d = new Date(iso);
              try {
                return d.toLocaleString("en-AU", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true, timeZoneName: "short" });
              } catch { return d.toLocaleString(); }
            }
            function formatAustralianDate(iso: string): string {
              const d = new Date(iso);
              try {
                return d.toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" });
              } catch { return d.toLocaleDateString(); }
            }
            // Line 1: Diagram Name (bold, larger)
            // Line 2: Version + Author/s
            // Line 3: Status + Created
            // Line 4: Modified
            // Each sub-line is an array of { label, value } segments
            type Seg = { label: string; value: string };
            const line2Segs: Seg[] = [];
            if (title.version) line2Segs.push({ label: "Version ", value: title.version });
            if (title.authors) line2Segs.push({ label: "Author/s: ", value: title.authors });
            const line3Segs: Seg[] = [];
            line3Segs.push({ label: "Status: ", value: statusLabel });
            if (data.database && data.database !== "none") {
              const DB_LABELS: Record<string, string> = { postgres: "PostgreSQL", mysql: "MySQL", mssql: "SQL Server" };
              const dbLabel = DB_LABELS[data.database] ?? data.database;
              line3Segs.push({ label: "Database: ", value: dbLabel });
            }
            if (createdAt) line3Segs.push({ label: "Created: ", value: formatAustralianDate(createdAt) });
            const line4Segs: Seg[] = updatedAt ? [{ label: "Modified: ", value: formatAustralianTime(updatedAt) }] : [];
            const subLines: Seg[][] = [line2Segs, line3Segs, line4Segs].filter(l => l.length > 0);
            const tfs = data.titleFontSize ?? 14;
            const subFs = Math.round(tfs * 0.79);
            const lineH = Math.round(tfs * 1.15);
            const titleH = (1 + subLines.length) * lineH + 8;
            const topY = minY - titleH - 20;
            return (
              <g data-title-block="true" style={{ pointerEvents: "none", fontStyle: "normal" }}>
                <text textAnchor="middle" x={cx} y={topY + lineH * 0.85}
                  fontSize={tfs} fill="#1f2937" fontWeight="bold" style={{ userSelect: "none" }}>
                  {diagramName ?? "Untitled"}
                </text>
                {subLines.map((segs, i) => (
                  <text key={i} textAnchor="middle" x={cx} y={topY + (i + 1) * lineH + lineH * 0.85}
                    fontSize={subFs} fill="#6b7280" style={{ userSelect: "none" }}>
                    {segs.map((seg, j) => (
                      <React.Fragment key={j}>
                        {j > 0 && <tspan>,  </tspan>}
                        <tspan>{seg.label}</tspan>
                        <tspan fontWeight="bold" fill="#1f2937">{seg.value}</tspan>
                      </React.Fragment>
                    ))}
                  </text>
                ))}
              </g>
            );
          })()}
          {/* Pools render first (deepest layer) */}
          {[...pools, ...otherContainers].map((el) => {
            const isMsgTarget =
              (isDraggingConnector && isBpmnSource &&
                el.type === "pool" && el.id !== draggingSourcePoolId &&
                ((el.properties.poolType as string | undefined) ?? "black-box") === "black-box" &&
                !draggingFromEdgeMountedEndEvent &&
                !draggingFromEdgeMountedStartEvent &&
                !draggingFromEdgeMountedIntermediateReceiveEvent) // receive can only target subprocess children
              ||
              (isMessageBpmnEndpointDrag && epDragMovingIsPool &&
                el.type === "pool" &&
                el.id !== epDragMovingEl?.id &&       // not the pool currently connected
                el.id !== epDragFixedEl?.id &&        // not the fixed end itself (if it's a pool)
                el.id !== epDragFixedPoolId &&        // not the pool the fixed end belongs to
                ((el.properties.poolType as string | undefined) ?? "black-box") === "black-box");
            const isWhiteBoxPool = el.type === "pool" &&
              ((el.properties.poolType as string | undefined) ?? "black-box") === "white-box";
            const isEventSubprocess = el.type === "subprocess-expanded" &&
              (el.properties.subprocessType as string | undefined) === "event";
            const isSubExpDropTarget = isDraggingConnector && !draggingSourceIsData &&
              el.type === "subprocess-expanded" &&
              !isEventSubprocess && // never highlight Event Expanded Subprocesses as sequence targets
              !draggingFromEventSubprocess && // Event Expanded Subprocesses cannot create sequence connectors
              !draggingFromInsideEventSubprocess && // elements inside Event subprocesses cannot connect out
              el.id !== draggingConnector!.fromId &&
              el.id !== (draggingSourceEl?.parentId ?? "") && // rule 4: child cannot target its own parent subprocess
              !draggingFromEdgeMountedStartEvent &&
              !draggingFromEdgeMountedIntermediateReceiveEvent; // receive can only target subprocess children
            const isSubExpAssocTarget = isDraggingConnector && draggingSourceIsData &&
              el.type === "subprocess-expanded" &&
              el.id !== draggingConnector!.fromId;
            const isCompositeDropTarget =
              isDraggingConnector &&
              !draggingSourceIsData &&
              el.type === "composite-state" &&
              el.id !== draggingConnector!.fromId &&
              draggingSourceEl?.parentId !== el.id; // source must be outside this composite-state
            // Orange border when element is being dragged into this subprocess-expanded
            const draggingEl = draggingElementId ? data.elements.find(e => e.id === draggingElementId) : null;
            const isElementDragTarget = el.type === "subprocess-expanded" &&
              draggingEl != null &&
              (draggingEl.x + draggingEl.width / 2) >= el.x &&
              (draggingEl.x + draggingEl.width / 2) <= el.x + el.width &&
              (draggingEl.y + draggingEl.height / 2) >= el.y &&
              (draggingEl.y + draggingEl.height / 2) <= el.y + el.height;
            return (
              <SymbolRenderer
                key={el.id}
                element={el}
                selected={selectedElementIds.has(el.id)}
                isDropTarget={isSubExpDropTarget || isCompositeDropTarget}
                isDisallowedTarget={false}
                isMessageBpmnTarget={isMsgTarget}
                isAssocBpmnTarget={isSubExpAssocTarget}
                isElementDragTarget={isElementDragTarget}
                onSelect={(e) => {
                  // Force-connect override (Shift+Ctrl+Click)
                  if (handleForceConnectSelect(el.id, e)) return;
                  // Connection-creation mode: clicking a different element commits the connector
                  if (pendingConnSourceId && el.type !== "initial-state"
                      && (pendingConnSourceId !== el.id || el.type === "state" || el.type === "composite-state" || el.type === "submachine")) {
                    onAddConnector(
                      pendingConnSourceId, el.id,
                      "sequence", defaultDirectionType, defaultRoutingType,
                      pendingConnSourceId === el.id ? "right" : "right",
                      pendingConnSourceId === el.id ? "top" : "left",
                      pendingConnSourceId === el.id ? 0.8 : 0.5,
                      pendingConnSourceId === el.id ? 0.8 : 0.5
                    );
                    setPendingConnSourceId(null);
                    return;
                  }
                  // Group-Connect-to-Gateway: capture the pre-click multi-selection
                  // before it gets cleared, so the upcoming double-click can use it.
                  if (
                    el.type === "gateway" &&
                    selectedElementIds.size >= 2 &&
                    !selectedElementIds.has(el.id) &&
                    !e?.shiftKey
                  ) {
                    groupConnectPrevSelectionRef.current = {
                      ids: new Set(selectedElementIds),
                      expiresAt: Date.now() + GROUP_CONNECT_CAPTURE_MS,
                    };
                  }
                  if (isWhiteBoxPool && selectedElementIds.has(el.id) && selectedElementIds.size === 1) {
                    onSetSelectedElements(new Set()); // toggle deselect for white-box pools
                  } else if (e?.shiftKey) {
                    onSetSelectedElements((prev) => { const next = new Set(prev); if (next.has(el.id)) next.delete(el.id); else next.add(el.id); return next; });
                  } else if (!selectedElementIds.has(el.id)) {
                    onSetSelectedElements(new Set([el.id]));
                  }
                  onSelectConnector(null);
                }}
                onMove={(x, y, uc) => { setDraggingElementId(el.id); onMoveElement(el.id, x, y, uc); }}
                onDoubleClick={() => {
                  if (tryGroupConnectToGateway(el)) return;
                  // Gateway shape double-click never opens the label editor —
                  // the label rect has its own dblclick handler for that.
                  if (el.type === "gateway") return;
                  const linkedId = (el.type === "subprocess" || el.type === "submachine" || el.type === "chevron-collapsed") ? el.properties.linkedDiagramId as string | undefined : undefined;
                  if (linkedId && onDrillIntoSubprocess) {
                    onDrillIntoSubprocess(linkedId);
                  } else {
                    startEditingLabel(el);
                  }
                }}
                onConnectionPointDragStart={(side, worldPos) => {
                  if (isWhiteBoxPool) return; // no connectors from white-box pools
                  if (el.type === "final-state") return; // no connectors FROM final-state
                  handleConnectionPointDragStart(el.id, side, worldPos);
                }}
                showConnectionPoints={selectedElementIds.size <= 1 && !isWhiteBoxPool && el.type !== "final-state" && diagramType !== "value-chain" && (selectedElementIds.has(el.id) || isDraggingConnector || isDraggingEndpoint)}
                onResizeDragStart={(handle, e) => handleResizeDragStart(el.id, handle, e)}
                svgToWorld={clientToWorld}
                onUpdateProperties={onUpdateProperties}
                onUpdateLabel={onUpdateLabel}
                onMoveEnd={() => { setDraggingElementId(null); onElementMoveEnd?.(el.id); }}
                multiSelected={selectedElementIds.size > 1 && selectedElementIds.has(el.id)}
                onGroupMove={onMoveElements ? (dx, dy) => onMoveElements([...selectedElementIds], dx / zoom, dy / zoom) : undefined}
                onGroupMoveEnd={onElementsMoveEnd}
                colorConfig={colorConfig}
                debugMode={debugMode}
                onEnterConnectionMode={el.type !== "final-state" && diagramType !== "value-chain" ? () => setPendingConnSourceId(el.id) : undefined}
                onCancelConnectionMode={() => setPendingConnSourceId(null)}
                inConnectionMode={pendingConnSourceId === el.id}
                onDrillBack={(el.type === "start-event" || el.type === "initial-state") ? onDrillBack : undefined}
                showValueDisplay={showValueDisplay}
              />
            );
          })}

          {/* Lanes — selectable (for deletion) but not draggable */}
          {lanes.map((el) => (
            <SymbolRenderer
              key={el.id}
              element={el}
              selected={selectedElementIds.has(el.id)}
              isDropTarget={false}
              onSelect={() => {
                onSetSelectedElements(new Set([el.id]));
                onSelectConnector(null);
              }}
              onMove={() => {}}
              onDoubleClick={() => startEditingLabel(el)}
              onConnectionPointDragStart={() => {}}
              showConnectionPoints={false}
              svgToWorld={clientToWorld}
              onUpdateProperties={onUpdateProperties}
              onUpdateLabel={onUpdateLabel}
              colorConfig={colorConfig}
              debugMode={debugMode}
            />
          ))}

          {/* Lane boundary drag handles — shown between adjacent lanes in multi-lane pools */}
          {pools.flatMap((pool) => {
            const poolLanes = lanes
              .filter((l) => l.parentId === pool.id)
              .sort((a, b) => a.y - b.y);
            if (poolLanes.length < 2) return [];
            const POOL_LW = 30;
            return poolLanes.slice(0, -1).map((lane, i) => {
              const nextLane = poolLanes[i + 1];
              const boundaryY = lane.y + lane.height;
              return (
                <rect
                  key={`boundary-${lane.id}`}
                  x={pool.x + POOL_LW}
                  y={boundaryY - 4}
                  width={pool.width - POOL_LW}
                  height={8}
                  fill="transparent"
                  style={{ cursor: "ns-resize" }}
                  onMouseDown={(e) => handleLaneBoundaryDrag(e, lane.id, nextLane.id)}
                />
              );
            });
          })}

          {/* Sublane boundary drag handles — between adjacent sublanes within a lane */}
          {lanes.flatMap((parentLane) => {
            const sublanes = lanes
              .filter((l) => l.parentId === parentLane.id)
              .sort((a, b) => a.y - b.y);
            if (sublanes.length < 2) return [];
            const LANE_LW = 36;
            return sublanes.slice(0, -1).map((sub, i) => {
              const nextSub = sublanes[i + 1];
              const boundaryY = sub.y + sub.height;
              return (
                <rect
                  key={`subboundary-${sub.id}`}
                  x={parentLane.x + LANE_LW}
                  y={boundaryY - 4}
                  width={parentLane.width - LANE_LW}
                  height={8}
                  fill="transparent"
                  style={{ cursor: "ns-resize" }}
                  onMouseDown={(e) => handleLaneBoundaryDrag(e, sub.id, nextSub.id)}
                />
              );
            });
          })}

          {/* Regular connectors — rendered behind elements (skip selected, rendered on top later) */}
          {(() => {
            const regularConns = data.connectors.filter(c => c.type !== "associationBPMN" && c.type !== "messageBPMN");
            const humpEligible = regularConns.filter(c => c.type === "sequence" || c.type === "association" || c.type === "uml-association");
            return regularConns.filter(c => c.id !== selectedConnectorId).map((conn) => (
              <ConnectorRenderer
                key={conn.id}
                connector={conn}
                selected={false}
                onSelect={() => {
                  onSelectConnector(conn.id);
                  onSetSelectedElements(new Set());
                }}
                svgToWorld={clientToWorld}
                onUpdateWaypoints={onUpdateConnectorWaypoints}
                onWaypointsDragEnd={onConnectorWaypointDragEnd ? () => onConnectorWaypointDragEnd(conn.id) : undefined}
                onUpdateLabel={onUpdateConnectorLabel
                  ? (label, ox, oy, w) => onUpdateConnectorLabel(conn.id, label, ox, oy, w)
                  : undefined}
                onUpdateCurveHandles={onUpdateCurveHandles}
                otherConnectorWaypoints={
                  (conn.type === "sequence" || conn.type === "association" || conn.type === "uml-association")
                    ? humpEligible.slice(0, humpEligible.indexOf(conn)).map(c => {
                        const vs = c.sourceInvisibleLeader ? 1 : 0;
                        const ve = c.targetInvisibleLeader ? c.waypoints.length - 2 : c.waypoints.length - 1;
                        return c.waypoints.slice(vs, ve + 1);
                      })
                    : undefined
                }
                debugMode={debugMode}
                misaligned={obstacleViolationConnIds.has(conn.id)}
                onUpdateEndOffset={handleUpdateEndOffset}
                showBottleneck={showBottleneck}
              />
            ));
          })()}

          {/* Debug labels rendered at end of SVG for z-order */}

          {/* Non-container elements */}
          {nonContainers.map((el) => {
            let elIsDropTarget = false;
            let elIsMsgTarget = false;
            let elIsAssocTarget = false;
            // When dragging from an expanded subprocess, never highlight its
            // own children (parentId === source.id) or its boundary events
            // (boundaryHostId === source.id) — connectors from the container
            // to its own contents/boundary aren't valid.
            const skipBecauseExpandedSelfContent =
              draggingSourceEl?.type === "subprocess-expanded" &&
              (el.parentId === draggingSourceEl.id ||
               el.boundaryHostId === draggingSourceEl.id);
            if (isDraggingConnector && el.id !== draggingConnector!.fromId && !skipBecauseExpandedSelfContent
                && !draggingFromFinalState && el.type !== "initial-state") {
              const elIsData = DATA_ELEMENT_TYPES.has(el.type);
              // End events are always senders — never valid messageBPMN targets.
              // Send tasks / throwing events are excluded only if they already have an
              // outgoing messageBPMN connector; otherwise they can be targets (auto-flipped
              // to receive/catching on connection).
              const elIsSendLocked = el.type === "end-event"
                || ((el.taskType === "send" || el.flowType === "throwing")
                    && data.connectors.some(c => c.type === "messageBPMN" && c.sourceId === el.id));
              if (draggingFromPool) {
                // Pools can only create messageBPMN — target elements in other white-box pools
                if (!elIsData && !elIsSendLocked) {
                  const elPoolId = getElementPoolId(el, data.elements);
                  if (elPoolId && elPoolId !== draggingSourcePoolId) {
                    const elPool = data.elements.find((p) => p.id === elPoolId);
                    if (((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") {
                      elIsMsgTarget = true;
                    }
                  }
                }
              } else if (draggingSourceIsData && !elIsData) {
                elIsAssocTarget = true;
              } else if (draggingSourceIsData && elIsData) {
                // Data → data is not a legal connector. Leave all flags false
                // so the target receives no highlight at all.
              } else if (!draggingSourceIsData && elIsData) {
                elIsAssocTarget = true;
              } else if (draggingFromBoundaryOnChild) {
                // Edge-mounted event on a child element inside expanded subprocess
                // Child events in same subprocess → dual highlight (sequence + association)
                // Other valid targets → sequence only
                if (CHILD_EVENT_TYPES_HIGHLIGHT.has(el.type) && !el.boundaryHostId && el.parentId === draggingSourceHostParentId) {
                  elIsDropTarget = true;
                  elIsAssocTarget = true;
                } else {
                  const elPoolId = getElementPoolId(el, data.elements);
                  if (elPoolId === draggingSourcePoolId || !elPoolId) {
                    elIsDropTarget = true;
                  }
                }
              } else if (draggingFromFreeEndEvent) {
                // Free-standing end-event: messageBPMN targets only in white-box pools
                if (!elIsData && !elIsSendLocked) {
                  const elPoolId = getElementPoolId(el, data.elements);
                  if (elPoolId) {
                    const elPool = data.elements.find((p) => p.id === elPoolId);
                    if (((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") {
                      elIsMsgTarget = true;
                    }
                  }
                }
              } else if (draggingFromEdgeMountedEndEvent) {
                // Edge-mounted end-event: sequence targets outside the parent subprocess (same/no pool, not children)
                const elPoolId = getElementPoolId(el, data.elements);
                if ((elPoolId === draggingSourcePoolId || !elPoolId) && el.parentId !== draggingSourceBoundaryHostId) {
                  elIsDropTarget = true;
                }
              } else if (draggingFromEdgeMountedStartEvent) {
                // Rule 2: edge-mounted start event — only children of its parent subprocess
                if (el.parentId === draggingSourceBoundaryHostId) elIsDropTarget = true;
              } else if (draggingFromEdgeMountedIntermediateSendEvent) {
                // Rule 3 (send): any element except children of its parent subprocess
                if (el.parentId !== draggingSourceBoundaryHostId) {
                  const elPoolId = getElementPoolId(el, data.elements);
                  if (elPoolId === draggingSourcePoolId) {
                    elIsDropTarget = true;
                  } else if (elPoolId && elPoolId !== draggingSourcePoolId && !elIsData && !elIsSendLocked) {
                    const elPool = data.elements.find((p) => p.id === elPoolId);
                    if (((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") elIsMsgTarget = true;
                  } else if (!elPoolId) {
                    elIsDropTarget = true;
                  }
                }
              } else if (draggingFromEdgeMountedIntermediateReceiveEvent) {
                // Rule 3 (receive): only children of its parent subprocess
                if (el.parentId === draggingSourceBoundaryHostId) elIsDropTarget = true;
              } else if (!isBpmnSource || !draggingSourcePoolId) {
                elIsDropTarget = true;
              } else {
                const elPoolId = getElementPoolId(el, data.elements);
                if (elPoolId === draggingSourcePoolId) {
                  elIsDropTarget = true;
                } else if (elPoolId && elPoolId !== draggingSourcePoolId && !elIsData && !elIsSendLocked) {
                  const elPool = data.elements.find((p) => p.id === elPoolId);
                  const elPoolIsWhiteBox =
                    ((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box";
                  if (elPoolIsWhiteBox) elIsMsgTarget = true;
                }
              }
            } else if (isMessageBpmnEndpointDrag && epDragMovingIsTaskSub) {
              // User rule: a task/subprocess endpoint can only move to another
              // task/subprocess inside any white-box pool. No restriction on
              // the fixed end's pool — the message may land inside the same
              // or a different white-box pool.
              if (MSG_TASKSUB_TYPES.has(el.type)
                  && el.id !== epDragMovingEl?.id
                  && el.id !== epDragFixedEl?.id) {
                const elPoolId = getElementPoolId(el, data.elements);
                if (elPoolId) {
                  const elPool = data.elements.find(p => p.id === elPoolId);
                  if (((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") {
                    elIsMsgTarget = true;
                  }
                }
              }
            }
            // Event targets — orthogonal to the pool vs task/sub branches above.
            // The end being dragged decides which event kinds are valid.
            if (isMessageBpmnEndpointDrag && epDragMsgEventTypes
                && epDragMsgEventTypes.has(el.type)
                && !el.boundaryHostId
                && el.id !== epDragMovingEl?.id
                && el.id !== epDragFixedEl?.id) {
              const elPoolId = getElementPoolId(el, data.elements);
              if (elPoolId) {
                const elPool = data.elements.find(p => p.id === elPoolId);
                if (((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") {
                  elIsMsgTarget = true;
                }
              }
            } else if (isAssocBpmnEndpointDrag && el.id !== epDragMovingId) {
              const elIsData = DATA_ELEMENT_TYPES.has(el.type);
              // The fixed end determines what's valid: if fixed is data, targets must be non-data and vice versa
              if (epDragFixedIsData && !elIsData) elIsAssocTarget = true;
              else if (!epDragFixedIsData && elIsData) elIsAssocTarget = true;
            }
            // Sequence target validation — sync with ADD_CONNECTOR rules
            // Non-boundary start events cannot be sequence targets (boundary ones CAN from outside)
            if (el.type === "start-event" && !el.boundaryHostId) elIsDropTarget = false;
            // Event Expanded Subprocess as source: no sequence to anything
            if (elIsDropTarget && draggingFromEventSubprocess) elIsDropTarget = false;
            // Source inside an Event Expanded Subprocess: no sequence to outside
            if (elIsDropTarget && draggingFromInsideEventSubprocess) {
              const srcParent = data.elements.find(p => p.id === draggingSourceEl!.parentId);
              if (srcParent && el.parentId !== srcParent.id) elIsDropTarget = false;
            }
            // Target inside an Event Expanded Subprocess: no sequence from outside
            if (elIsDropTarget && el.parentId) {
              const _elP = data.elements.find(p => p.id === el.parentId);
              if (_elP?.type === "subprocess-expanded" && (_elP.properties.subprocessType as string | undefined) === "event") {
                if (draggingConnector && draggingSourceEl?.parentId !== _elP.id) elIsDropTarget = false;
              }
            }
            return (
            <SymbolRenderer
              key={el.id}
              element={el}
              selected={selectedElementIds.has(el.id)}
              isDropTarget={elIsDropTarget}
              isMessageBpmnTarget={elIsMsgTarget}
              isAssocBpmnTarget={elIsAssocTarget}
              isErrorTarget={errorTargetIds.has(el.id) || obstacleViolationElementIds.has(el.id)}
              onSelect={(ev) => {
                // Force-connect override (Shift+Ctrl+Click)
                if (handleForceConnectSelect(el.id, ev)) return;
                // Group-Connect-to-Gateway: capture pre-click multi-selection
                if (
                  el.type === "gateway" &&
                  selectedElementIds.size >= 2 &&
                  !selectedElementIds.has(el.id) &&
                  !ev?.shiftKey
                ) {
                  groupConnectPrevSelectionRef.current = {
                    ids: new Set(selectedElementIds),
                    expiresAt: Date.now() + GROUP_CONNECT_CAPTURE_MS,
                  };
                }
                if (ev?.shiftKey && !ev?.ctrlKey) {
                  onSetSelectedElements((prev) => { const next = new Set(prev); if (next.has(el.id)) next.delete(el.id); else next.add(el.id); return next; });
                } else if (!selectedElementIds.has(el.id)) {
                  onSetSelectedElements(new Set([el.id]));
                }
                onSelectConnector(null);
              }}
              onMove={(x, y, uc) => { setDraggingElementId(el.id); onMoveElement(el.id, x, y, uc); }}
              onDoubleClick={() => {
                if (tryGroupConnectToGateway(el)) return;
                // Gateway shape double-click never opens the label editor —
                // the label rect has its own dblclick handler for that.
                if (el.type === "gateway") return;
                const linkedId = (el.type === "subprocess" || el.type === "submachine" || el.type === "chevron-collapsed") ? el.properties.linkedDiagramId as string | undefined : undefined;
                if (linkedId && onDrillIntoSubprocess) {
                  onDrillIntoSubprocess(linkedId);
                } else {
                  startEditingLabel(el);
                }
              }}
              onConnectionPointDragStart={(side, worldPos) => {
                if (el.type === "final-state") return;
                handleConnectionPointDragStart(el.id, side, worldPos);
              }}
              showConnectionPoints={selectedElementIds.size <= 1 && el.type !== "final-state" && diagramType !== "value-chain" && (selectedElementIds.has(el.id) || isDraggingConnector || isDraggingEndpoint)}
              onResizeDragStart={(handle, e) => handleResizeDragStart(el.id, handle, e)}
              svgToWorld={clientToWorld}
              onUpdateProperties={onUpdateProperties}
              onUpdateLabel={onUpdateLabel}
              onMoveEnd={() => { setDraggingElementId(null); onElementMoveEnd?.(el.id); }}
              multiSelected={selectedElementIds.size > 1 && selectedElementIds.has(el.id)}
              onGroupMove={onMoveElements ? (dx, dy) => onMoveElements([...selectedElementIds], dx / zoom, dy / zoom) : undefined}
              onGroupMoveEnd={onElementsMoveEnd}
              colorConfig={colorConfig}
              debugMode={debugMode}
              shouldSnapBack={(x, y) => {
                const cx = x + el.width / 2;
                const cy = y + el.height / 2;
                const inBoundary = data.elements.some(
                  (b) =>
                    b.type === "system-boundary" &&
                    b.id !== el.id &&
                    el.type !== "use-case" &&
                    el.type !== "hourglass" &&
                    cx >= b.x && cx <= b.x + b.width &&
                    cy >= b.y && cy <= b.y + b.height
                );
                if (inBoundary) return true;
                const containingPool = getContainingPool(el, data.elements);
                if (containingPool) {
                  const POOL_LW = 30;
                  return (
                    x < containingPool.x + POOL_LW ||
                    y < containingPool.y ||
                    x + el.width > containingPool.x + containingPool.width ||
                    y + el.height > containingPool.y + containingPool.height
                  );
                }
                return false;
              }}
              onDrillBack={(el.type === "start-event" || el.type === "initial-state") ? onDrillBack : undefined}
              showValueDisplay={showValueDisplay}
            />
            );
          })}

          {/* Boundary events — rendered on top of their hosts */}
          {boundaryEvents.map((el) => {
            let elIsDropTarget = false;
            let elIsMsgTarget = false;
            let elIsAssocTarget = false;
            // When dragging from an expanded subprocess, never highlight a
            // boundary event mounted on that same subprocess.
            const skipBecauseOwnBoundary =
              draggingSourceEl?.type === "subprocess-expanded" &&
              el.boundaryHostId === draggingSourceEl.id;
            const SELF_TRANSITION_TYPES = new Set(["state", "composite-state", "submachine"]);
            const isSelfStateTarget = el.id === draggingConnector?.fromId && SELF_TRANSITION_TYPES.has(el.type);
            if (isDraggingConnector && (el.id !== draggingConnector!.fromId || isSelfStateTarget) && !skipBecauseOwnBoundary
                && !draggingFromFinalState && el.type !== "initial-state") {
              // Throwing/send boundary events excluded only if they already have an outgoing messageBPMN
              const bEvtIsSendLocked = (el.flowType === "throwing" || el.taskType === "send")
                && data.connectors.some(c => c.type === "messageBPMN" && c.sourceId === el.id);
              if (draggingFromPool) {
                // Pools can only create messageBPMN — boundary catching intermediate-events in other white-box pools
                const elPoolId = getElementPoolId(el, data.elements);
                if (elPoolId && elPoolId !== draggingSourcePoolId && el.type === "intermediate-event" && !bEvtIsSendLocked) {
                  const elPool = data.elements.find((p) => p.id === elPoolId);
                  if (((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") {
                    elIsMsgTarget = true;
                  }
                }
              } else if ((draggingFromChildEvent || draggingFromBoundaryOnChild) &&
                  el.boundaryHostId && draggingSourceAncestorIds.has(el.boundaryHostId)) {
                elIsAssocTarget = true; // purple — associationBPMN to boundary event on ancestor
              } else if (draggingSourceIsData) {
                elIsAssocTarget = true;
              } else if (draggingFromFreeEndEvent) {
                // Free-standing end-event: boundary catching intermediate-events in other white-box pools are messageBPMN targets
                const elPoolId = getElementPoolId(el, data.elements);
                if (elPoolId && el.type === "intermediate-event" && !bEvtIsSendLocked) {
                  const elPool = data.elements.find((p) => p.id === elPoolId);
                  if (((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") {
                    elIsMsgTarget = true;
                  }
                }
              } else if (draggingFromEdgeMountedEndEvent) {
                // Edge-mounted end-event: boundary events in same pool, but not on elements inside the subprocess
                const elPoolId = getElementPoolId(el, data.elements);
                const hostEl = data.elements.find((e) => e.id === el.boundaryHostId);
                if (elPoolId === draggingSourcePoolId && hostEl?.parentId !== draggingSourceBoundaryHostId) {
                  elIsDropTarget = true;
                }
              } else if (draggingFromEdgeMountedStartEvent) {
                // Rule 2: edge-mounted start event — boundary events are not inside the subprocess, so not targets
                // (no action — elIsDropTarget stays false)
              } else if (draggingFromEdgeMountedIntermediateSendEvent) {
                // Rule 5: exclude boundary events on the same parent subprocess
                // Rule 3 (send): also exclude those whose host is a child of the parent subprocess
                if (el.boundaryHostId !== draggingSourceBoundaryHostId) {
                  const hostEl = data.elements.find((e) => e.id === el.boundaryHostId);
                  if (!hostEl || hostEl.parentId !== draggingSourceBoundaryHostId) {
                    const elPoolId = getElementPoolId(el, data.elements);
                    if (elPoolId === draggingSourcePoolId) elIsDropTarget = true;
                    else if (elPoolId && elPoolId !== draggingSourcePoolId && el.type === "intermediate-event" && !bEvtIsSendLocked) {
                      const elPool = data.elements.find((p) => p.id === elPoolId);
                      if (((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") elIsMsgTarget = true;
                    }
                  }
                }
              } else if (draggingFromEdgeMountedIntermediateReceiveEvent) {
                // Rule 3 (receive): boundary events are not subprocess children, not valid targets
                // Rule 5: also not targets for receive events
                // (no action — elIsDropTarget stays false)
              } else if (!isBpmnSource || !draggingSourcePoolId) {
                elIsDropTarget = true;
              } else {
                const elPoolId = getElementPoolId(el, data.elements);
                if (elPoolId === draggingSourcePoolId) {
                  elIsDropTarget = true;
                } else if (elPoolId && elPoolId !== draggingSourcePoolId && el.type === "intermediate-event" && !bEvtIsSendLocked) {
                  const elPool = data.elements.find((p) => p.id === elPoolId);
                  const elPoolIsWhiteBox =
                    ((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box";
                  if (elPoolIsWhiteBox) elIsMsgTarget = true;
                }
              }
            } else if (isAssocBpmnEndpointDrag && el.id !== epDragMovingId) {
              const elIsData = DATA_ELEMENT_TYPES.has(el.type);
              if (epDragFixedIsData && !elIsData) elIsAssocTarget = true;
              else if (!epDragFixedIsData && elIsData) elIsAssocTarget = true;
            }
            // Sequence target validation — sync with ADD_CONNECTOR rules
            // Non-boundary start events cannot be sequence targets (boundary ones CAN from outside)
            if (el.type === "start-event" && !el.boundaryHostId) elIsDropTarget = false;
            // Event Expanded Subprocess as source: no sequence to anything
            if (elIsDropTarget && draggingFromEventSubprocess) elIsDropTarget = false;
            // Source inside an Event Expanded Subprocess: no sequence to outside
            if (elIsDropTarget && draggingFromInsideEventSubprocess) {
              const srcParent = data.elements.find(p => p.id === draggingSourceEl!.parentId);
              if (srcParent && el.parentId !== srcParent.id) elIsDropTarget = false;
            }
            // Target inside an Event Expanded Subprocess: no sequence from outside
            if (elIsDropTarget && el.parentId) {
              const _elP = data.elements.find(p => p.id === el.parentId);
              if (_elP?.type === "subprocess-expanded" && (_elP.properties.subprocessType as string | undefined) === "event") {
                if (draggingConnector && draggingSourceEl?.parentId !== _elP.id) elIsDropTarget = false;
              }
            }
            return (
              <SymbolRenderer
                key={el.id}
                element={el}
                selected={selectedElementIds.has(el.id)}
                isDropTarget={elIsDropTarget}
                isDisallowedTarget={false}
                isMessageBpmnTarget={elIsMsgTarget}
                isAssocBpmnTarget={elIsAssocTarget}
                onSelect={(ev) => {
                  // Force-connect override (Shift+Ctrl+Click)
                  if (handleForceConnectSelect(el.id, ev)) return;
                  if (pendingConnSourceId && el.type !== "initial-state"
                      && (pendingConnSourceId !== el.id || el.type === "state" || el.type === "composite-state" || el.type === "submachine")) {
                    onAddConnector(
                      pendingConnSourceId, el.id,
                      "sequence", defaultDirectionType, defaultRoutingType,
                      pendingConnSourceId === el.id ? "right" : "right",
                      pendingConnSourceId === el.id ? "top" : "left",
                      pendingConnSourceId === el.id ? 0.8 : 0.5,
                      pendingConnSourceId === el.id ? 0.8 : 0.5
                    );
                    setPendingConnSourceId(null);
                    return;
                  }
                  // Group-Connect-to-Gateway: capture pre-click multi-selection
                  if (
                    el.type === "gateway" &&
                    selectedElementIds.size >= 2 &&
                    !selectedElementIds.has(el.id) &&
                    !ev?.shiftKey
                  ) {
                    groupConnectPrevSelectionRef.current = {
                      ids: new Set(selectedElementIds),
                      expiresAt: Date.now() + GROUP_CONNECT_CAPTURE_MS,
                    };
                  }
                  if (ev?.shiftKey) {
                    onSetSelectedElements((prev) => { const next = new Set(prev); if (next.has(el.id)) next.delete(el.id); else next.add(el.id); return next; });
                  } else if (!selectedElementIds.has(el.id)) {
                    onSetSelectedElements(new Set([el.id]));
                  }
                  onSelectConnector(null);
                }}
                onMove={(x, y, uc) => { setDraggingElementId(el.id); onMoveElement(el.id, x, y, uc); }}
                onDoubleClick={() => { tryGroupConnectToGateway(el); }}
                onConnectionPointDragStart={(side, worldPos) => {
                  if (el.type === "final-state") return;
                  handleConnectionPointDragStart(el.id, side, worldPos);
                }}
                showConnectionPoints={selectedElementIds.size <= 1 && el.type !== "final-state" && diagramType !== "value-chain" && (selectedElementIds.has(el.id) || isDraggingConnector || isDraggingEndpoint)}
                svgToWorld={clientToWorld}
                onUpdateProperties={onUpdateProperties}
                onUpdateLabel={onUpdateLabel}
                multiSelected={selectedElementIds.size > 1 && selectedElementIds.has(el.id)}
                onGroupMove={onMoveElements ? (dx, dy) => onMoveElements([...selectedElementIds], dx / zoom, dy / zoom) : undefined}
                onGroupMoveEnd={onElementsMoveEnd}
                colorConfig={colorConfig}
                debugMode={debugMode}
                onEnterConnectionMode={el.type !== "final-state" && diagramType !== "value-chain" ? () => setPendingConnSourceId(el.id) : undefined}
                onCancelConnectionMode={() => setPendingConnSourceId(null)}
                inConnectionMode={pendingConnSourceId === el.id}
              />
            );
          })}

          {/* Group elements — rendered on top of all other elements */}
          {groupElements.map((el) => (
            <SymbolRenderer
              key={el.id}
              element={el}
              selected={selectedElementIds.has(el.id)}
              isDropTarget={false}
              isDisallowedTarget={false}
              onSelect={(ev) => {
                if (ev?.shiftKey) {
                  onSetSelectedElements((prev) => { const next = new Set(prev); if (next.has(el.id)) next.delete(el.id); else next.add(el.id); return next; });
                } else if (!selectedElementIds.has(el.id)) {
                  onSetSelectedElements(new Set([el.id]));
                }
                onSelectConnector(null);
              }}
              onMove={(x, y, uc) => onMoveElement(el.id, x, y, uc)}
              onDoubleClick={() => startEditingLabel(el)}
              onConnectionPointDragStart={() => {}}
              showConnectionPoints={false}
              onResizeDragStart={(handle, e) => handleResizeDragStart(el.id, handle, e)}
              svgToWorld={clientToWorld}
              onUpdateLabel={onUpdateLabel}
              onMoveEnd={() => { setDraggingElementId(null); onElementMoveEnd?.(el.id); }}
              multiSelected={selectedElementIds.size > 1 && selectedElementIds.has(el.id)}
              onGroupMove={onMoveElements ? (dx, dy) => onMoveElements([...selectedElementIds], dx / zoom, dy / zoom) : undefined}
              onGroupMoveEnd={onElementsMoveEnd}
              colorConfig={colorConfig}
              debugMode={debugMode}
            />
          ))}

          {/* Association connectors — rendered above all elements */}
          {data.connectors.filter(c => c.type === "associationBPMN" || c.type === "messageBPMN").map((conn) => {
            const srcEl = data.elements.find(e => e.id === conn.sourceId);
            const tgtEl = data.elements.find(e => e.id === conn.targetId);
            const srcBounds = srcEl ? { x: srcEl.x, y: srcEl.y, width: srcEl.width, height: srcEl.height } : undefined;
            const tgtBounds = tgtEl ? { x: tgtEl.x, y: tgtEl.y, width: tgtEl.width, height: tgtEl.height } : undefined;
            // Walk parentId chain to the containing pool (or use the element
            // itself if it IS a pool). Debug-only — drives the poolH field in
            // the debug overlay so the reflection maths can be verified.
            function containingPoolHeight(el: DiagramElement | undefined): number | undefined {
              if (!el) return undefined;
              if (el.type === "pool") return el.height;
              let cur: DiagramElement | undefined = el;
              for (let i = 0; i < 10 && cur; i++) {
                if (!cur.parentId) break;
                const parent = data.elements.find(e => e.id === cur!.parentId);
                if (!parent) break;
                if (parent.type === "pool") return parent.height;
                cur = parent;
              }
              return undefined;
            }
            const srcPoolH = containingPoolHeight(srcEl);
            const tgtPoolH = containingPoolHeight(tgtEl);
            const srcIsPool = srcEl?.type === "pool";
            const tgtIsPool = tgtEl?.type === "pool";
            return (
              <ConnectorRenderer
                key={conn.id}
                connector={conn}
                selected={conn.id === selectedConnectorId}
                misaligned={misalignedConnectorIds.has(conn.id) || obstacleViolationConnIds.has(conn.id)}
                onSelect={() => {
                  onSelectConnector(conn.id);
                  onSetSelectedElements(new Set());
                }}
                svgToWorld={clientToWorld}
                onUpdateWaypoints={onUpdateConnectorWaypoints}
                onWaypointsDragEnd={onConnectorWaypointDragEnd ? () => onConnectorWaypointDragEnd(conn.id) : undefined}
                onUpdateLabel={onUpdateConnectorLabel
                  ? (label, ox, oy, w) => onUpdateConnectorLabel(conn.id, label, ox, oy, w)
                  : undefined}
                onUpdateCurveHandles={onUpdateCurveHandles}
                debugMode={debugMode}
                onUpdateEndOffset={handleUpdateEndOffset}
                sourceBounds={srcBounds}
                targetBounds={tgtBounds}
                sourcePoolHeight={srcPoolH}
                targetPoolHeight={tgtPoolH}
                sourceIsPool={srcIsPool}
                targetIsPool={tgtIsPool}
              />
            );
          })}

          {/* Selected regular connector — rendered on top of all elements */}
          {selectedConnectorId && (() => {
            const conn = data.connectors.find(c => c.id === selectedConnectorId && c.type !== "associationBPMN" && c.type !== "messageBPMN");
            if (!conn) return null;
            const allHumpConns = data.connectors.filter(c => c.type === "sequence" || c.type === "association" || c.type === "uml-association");
            const connIdx = allHumpConns.findIndex(c => c.id === conn.id);
            // Only hump over connectors added before this one
            const priorHumpConns = allHumpConns.slice(0, connIdx);
            return (
              <ConnectorRenderer
                key={`sel-${conn.id}`}
                connector={conn}
                selected={true}
                onSelect={() => {
                  onSelectConnector(conn.id);
                  onSetSelectedElements(new Set());
                }}
                svgToWorld={clientToWorld}
                onUpdateWaypoints={onUpdateConnectorWaypoints}
                onWaypointsDragEnd={onConnectorWaypointDragEnd ? () => onConnectorWaypointDragEnd(conn.id) : undefined}
                onUpdateLabel={onUpdateConnectorLabel
                  ? (label: string, ox: number, oy: number, w: number) => onUpdateConnectorLabel(conn.id, label, ox, oy, w)
                  : undefined}
                onUpdateCurveHandles={onUpdateCurveHandles}
                otherConnectorWaypoints={
                  (conn.type === "sequence" || conn.type === "association" || conn.type === "uml-association") && priorHumpConns.length > 0
                    ? priorHumpConns.map(c => {
                        const vs = c.sourceInvisibleLeader ? 1 : 0;
                        const ve = c.targetInvisibleLeader ? c.waypoints.length - 2 : c.waypoints.length - 1;
                        return c.waypoints.slice(vs, ve + 1);
                      })
                    : undefined
                }
                debugMode={debugMode}
                misaligned={obstacleViolationConnIds.has(conn.id)}
                onUpdateEndOffset={handleUpdateEndOffset}
                showBottleneck={showBottleneck}
              />
            );
          })()}

          {/* messageBPMN drag handle — drag left/right along pool boundaries (hidden for event endpoints) */}
          {selectedConnector?.type === "messageBPMN" && selectedConnector.waypoints.length === 4 && (() => {
            const BPMN_EVENT_TYPES = new Set(["start-event", "intermediate-event", "end-event"]);
            const msgSrcEl = data.elements.find((e) => e.id === selectedConnector.sourceId);
            const msgTgtEl = data.elements.find((e) => e.id === selectedConnector.targetId);
            if ((msgSrcEl && BPMN_EVENT_TYPES.has(msgSrcEl.type)) || (msgTgtEl && BPMN_EVENT_TYPES.has(msgTgtEl.type))) return null;
            const wp = selectedConnector.waypoints;
            const x = wp[1].x;
            const midY = (wp[1].y + wp[2].y) / 2;
            return (
              <g data-interactive>
                <line x1={x} y1={wp[1].y} x2={x} y2={wp[2].y}
                  stroke="#2563eb" strokeWidth={8} strokeOpacity={0.15}
                  style={{ cursor: "ew-resize" }}
                  onMouseDown={(e) => handleMessageBpmnDrag(selectedConnectorId!, x, e)}
                />
                <circle cx={x} cy={midY} r={7}
                  fill={msgMarkerFocused ? "#f59e0b" : "#2563eb"} fillOpacity={msgMarkerFocused ? 0.5 : 0.25}
                  stroke={msgMarkerFocused ? "#d97706" : "#2563eb"} strokeWidth={1.5}
                  style={{ cursor: "ew-resize" }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const startCX = e.clientX;
                    let dragged = false;
                    function onMove(ev: MouseEvent) {
                      if (Math.abs(ev.clientX - startCX) > 3) {
                        dragged = true;
                        window.removeEventListener("mousemove", onMove);
                        window.removeEventListener("mouseup", onUp);
                        handleMessageBpmnDrag(selectedConnectorId!, x, e);
                      }
                    }
                    function onUp() {
                      window.removeEventListener("mousemove", onMove);
                      window.removeEventListener("mouseup", onUp);
                      if (!dragged) {
                        // Click without drag: toggle orange focused state for arrow key nudging
                        setMsgMarkerFocused(prev => !prev);
                      }
                    }
                    window.addEventListener("mousemove", onMove);
                    window.addEventListener("mouseup", onUp);
                  }}
                />
              </g>
            );
          })()}

          {/* Connector endpoint handles when a connector is selected.
              For messageBPMN: endpoints can be rewired to other pools
              (if currently on a pool) or other tasks/subprocesses inside
              white-box pools (if currently on a task/subprocess). The
              middle ew-resize handle still moves the whole connector. */}
          {endpointHandles && (() => {
            function makeEndpointHandler(endpoint: "source" | "target", pos: Point) {
              return (e: React.MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();
                const startX = e.clientX, startY = e.clientY;
                let dragged = false;
                function onMove(ev: MouseEvent) {
                  if (!dragged && (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3)) {
                    dragged = true;
                    window.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                    handleEndpointDragStart(selectedConnectorId!, endpoint, pos, e);
                  }
                }
                function onUp() {
                  window.removeEventListener("mousemove", onMove);
                  window.removeEventListener("mouseup", onUp);
                  if (!dragged) {
                    // Click without drag — toggle focus
                    setFocusedEndpoint(prev => prev === endpoint ? null : endpoint);
                  }
                }
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
              };
            }
            return (
              <g data-interactive>
                <circle
                  cx={endpointHandles.source.x} cy={endpointHandles.source.y}
                  r={5.5}
                  fill={focusedEndpoint === "source" ? "#f59e0b" : "#2563eb"}
                  stroke="white" strokeWidth={1.5}
                  style={{ cursor: "pointer" }}
                  onMouseDown={makeEndpointHandler("source", endpointHandles.source)}
                />
                <circle
                  cx={endpointHandles.target.x} cy={endpointHandles.target.y}
                  r={5.5}
                  fill={focusedEndpoint === "target" ? "#f59e0b" : "#2563eb"}
                  stroke="white" strokeWidth={1.5}
                  style={{ cursor: "pointer" }}
                  onMouseDown={makeEndpointHandler("target", endpointHandles.target)}
                />
              </g>
            );
          })()}

          {/* Rubber-band line during connector drag */}
          {draggingConnector && (
            <line data-interactive
              x1={draggingConnector.fromPos.x}
              y1={draggingConnector.fromPos.y}
              x2={draggingConnector.currentPos.x}
              y2={draggingConnector.currentPos.y}
              stroke="#2563eb"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              style={{ pointerEvents: "none" }}
            />
          )}

          {/* Group-connect flash: red for to-be-deleted, green for to-be-created */}
          {groupFlash && groupFlash.visible && (
            <g style={{ pointerEvents: "none" }}>
              {groupFlash.deleted.map((seg, i) => (
                <line
                  key={`del-${i}`}
                  x1={seg.from.x} y1={seg.from.y}
                  x2={seg.to.x} y2={seg.to.y}
                  stroke="#dc2626" strokeWidth={2.5} strokeDasharray="5 3"
                />
              ))}
              {groupFlash.created.map((seg, i) => {
                const dx = seg.to.x - seg.from.x;
                const dy = seg.to.y - seg.from.y;
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len, uy = dy / len;
                const aSize = 8;
                const aBaseX = seg.to.x - ux * aSize;
                const aBaseY = seg.to.y - uy * aSize;
                const aLeftX = aBaseX - uy * (aSize * 0.5);
                const aLeftY = aBaseY + ux * (aSize * 0.5);
                const aRightX = aBaseX + uy * (aSize * 0.5);
                const aRightY = aBaseY - ux * (aSize * 0.5);
                return (
                  <g key={`new-${i}`}>
                    <line
                      x1={seg.from.x} y1={seg.from.y}
                      x2={seg.to.x} y2={seg.to.y}
                      stroke="#10b981" strokeWidth={2}
                    />
                    <polygon
                      points={`${seg.to.x},${seg.to.y} ${aLeftX},${aLeftY} ${aRightX},${aRightY}`}
                      fill="#10b981"
                    />
                  </g>
                );
              })}
            </g>
          )}

          {/* Auto-connect flashing preview — user can press Esc to abort */}
          {autoConnectFlash && autoConnectFlash.visible && (() => {
            const dx = autoConnectFlash.to.x - autoConnectFlash.from.x;
            const dy = autoConnectFlash.to.y - autoConnectFlash.from.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len, uy = dy / len;
            // Arrowhead at target end
            const aSize = 8;
            const aBaseX = autoConnectFlash.to.x - ux * aSize;
            const aBaseY = autoConnectFlash.to.y - uy * aSize;
            const aLeftX = aBaseX - uy * (aSize * 0.5);
            const aLeftY = aBaseY + ux * (aSize * 0.5);
            const aRightX = aBaseX + uy * (aSize * 0.5);
            const aRightY = aBaseY - ux * (aSize * 0.5);
            return (
              <g style={{ pointerEvents: "none" }}>
                <line
                  x1={autoConnectFlash.from.x}
                  y1={autoConnectFlash.from.y}
                  x2={autoConnectFlash.to.x}
                  y2={autoConnectFlash.to.y}
                  stroke="#10b981"
                  strokeWidth={2}
                />
                <polygon
                  points={`${autoConnectFlash.to.x},${autoConnectFlash.to.y} ${aLeftX},${aLeftY} ${aRightX},${aRightY}`}
                  fill="#10b981"
                />
              </g>
            );
          })()}

          {/* Pool vertical-boundary alignment guide: dotted black line at the
              moving boundary's current X, with a marker at every other pool's
              same-side boundary (vertical centre). Markers turn green when the
              moving boundary aligns with that pool's; the whole line flashes
              green when ALL other pool boundaries align simultaneously. */}
          {poolBoundaryGuide && (() => {
            const SNAP_PX = 4;
            const others = poolBoundaryGuide.others;
            const aligned = others.map(o => Math.abs(o.x - poolBoundaryGuide.currentX) < SNAP_PX);
            const allAligned = aligned.length > 0 && aligned.every(v => v);
            if (others.length === 0) return null;
            // Vertical extent: span all pool centres plus a generous margin
            const minMidY = Math.min(...others.map(o => o.midY));
            const maxMidY = Math.max(...others.map(o => o.midY));
            const y1 = minMidY - 80;
            const y2 = maxMidY + 80;
            return (
              <g pointerEvents="none">
                <line
                  x1={poolBoundaryGuide.currentX} x2={poolBoundaryGuide.currentX}
                  y1={y1} y2={y2}
                  stroke={allAligned ? "#10b981" : "#000000"}
                  strokeWidth={allAligned ? 2 : 1}
                  strokeDasharray="4 3"
                  className={allAligned ? "animate-pulse" : undefined}
                  opacity={allAligned ? 1 : 0.7}
                />
                {others.map((o, i) => (
                  <circle
                    key={o.id}
                    cx={o.x}
                    cy={o.midY}
                    r={6}
                    fill={aligned[i] ? "#10b981" : "#9ca3af"}
                    fillOpacity={aligned[i] ? 0.9 : 0.4}
                    stroke={aligned[i] ? "#047857" : "#4b5563"}
                    strokeWidth={1.5}
                  />
                ))}
              </g>
            );
          })()}

          {/* Rubber-band line during endpoint drag */}
          {draggingEndpoint && (
            <line data-interactive
              x1={draggingEndpoint.startPos.x}
              y1={draggingEndpoint.startPos.y}
              x2={draggingEndpoint.currentPos.x}
              y2={draggingEndpoint.currentPos.y}
              stroke="#f59e0b"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              style={{ pointerEvents: "none" }}
            />
          )}

          {/* Lasso selection rectangle */}
          {lassoRect && (() => {
            const lx = Math.min(lassoRect.startX, lassoRect.endX);
            const ly = Math.min(lassoRect.startY, lassoRect.endY);
            const lw = Math.abs(lassoRect.endX - lassoRect.startX);
            const lh = Math.abs(lassoRect.endY - lassoRect.startY);
            return (
              <rect data-interactive
                x={lx} y={ly} width={lw} height={lh}
                fill="rgba(59,130,246,0.1)" stroke="#3b82f6"
                strokeWidth={1 / zoom}
                strokeDasharray={`${4 / zoom} ${4 / zoom}`}
                style={{ pointerEvents: "none" }}
              />
            );
          })()}

          {/* Space insertion marker */}
          {spaceMarker && (() => {
            const mx = spaceMarker.x;
            const my = spaceMarker.y;
            const extent = 100000;
            const hitSize = 20 / zoom; // generous hit area in screen pixels

            function handleMarkerMouseDown(e: React.MouseEvent) {
              e.stopPropagation();
              e.preventDefault();
              if (e.shiftKey && onInsertSpace) {
                // Shift+drag: insert space. Positive drag grows right/bottom
                // (pushes content right/down); negative drag grows left/top
                // (pulls content left/up), so pools can expand in any of the
                // four cardinal directions.
                let lastWorld = clientToWorld(e.clientX, e.clientY);
                function onMove(ev: MouseEvent) {
                  const curWorld = clientToWorld(ev.clientX, ev.clientY);
                  const ddx = curWorld.x - lastWorld.x;
                  const ddy = curWorld.y - lastWorld.y;
                  if (Math.abs(ddx) > Math.abs(ddy)) {
                    if (ddx !== 0) onInsertSpace!(mx, my, ddx, 0);
                  } else {
                    if (ddy !== 0) onInsertSpace!(mx, my, 0, ddy);
                  }
                  lastWorld = curWorld;
                }
                function onUp() {
                  window.removeEventListener("mousemove", onMove);
                  window.removeEventListener("mouseup", onUp);
                }
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
              } else {
                // Normal drag: reposition marker
                function onMove(ev: MouseEvent) {
                  setSpaceMarker(clientToWorld(ev.clientX, ev.clientY));
                }
                function onUp() {
                  window.removeEventListener("mousemove", onMove);
                  window.removeEventListener("mouseup", onUp);
                }
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
              }
            }

            return (
              <g>
                {/* Crosshair lines — non-interactive */}
                <line x1={mx} y1={my - extent} x2={mx} y2={my + extent}
                  stroke="rgba(34,197,94,0.25)" strokeWidth={2 / zoom}
                  style={{ pointerEvents: "none" }} />
                <line x1={mx - extent} y1={my} x2={mx + extent} y2={my}
                  stroke="rgba(34,197,94,0.25)" strokeWidth={2 / zoom}
                  style={{ pointerEvents: "none" }} />
                {/* Large invisible hit area */}
                <rect
                  x={mx - hitSize / 2} y={my - hitSize / 2}
                  width={hitSize} height={hitSize}
                  fill="transparent" stroke="none"
                  style={{ cursor: "move", pointerEvents: "all" }}
                  onMouseDown={handleMarkerMouseDown}
                />
                {/* Visible green circle */}
                <circle cx={mx} cy={my} r={6 / zoom}
                  fill="#22c55e" stroke="#16a34a" strokeWidth={2 / zoom}
                  style={{ pointerEvents: "none" }} />
              </g>
            );
          })()}

          {/* Debug labels — rendered last so they appear on top of everything */}
          {debugMode && (() => {
            const debugItems: { id: string; label: string; anchorX: number; anchorY: number; color: string; defaultOX: number; defaultOY: number }[] = [];
            const addedConnIds = new Set<string>();
            for (const selId of selectedElementIds) {
              const el = data.elements.find(e => e.id === selId);
              if (!el) continue;
              debugItems.push({
                id: `dbg-el-${el.id}`,
                label: `[${el.id.slice(-6)}] ${el.type}`,
                anchorX: el.x + el.width / 2, anchorY: el.y,
                color: "#059669", defaultOX: 0, defaultOY: -18,
              });
              for (const conn of data.connectors) {
                if (conn.sourceId !== el.id && conn.targetId !== el.id) continue;
                if (addedConnIds.has(conn.id)) continue;
                addedConnIds.add(conn.id);
                const wps = conn.waypoints;
                if (wps.length < 2) continue;
                const vs = conn.sourceInvisibleLeader ? 1 : 0;
                const ve = conn.targetInvisibleLeader ? wps.length - 2 : wps.length - 1;
                debugItems.push({ id: `dbg-cs-${conn.id}`, label: `S:${conn.id.slice(-4)} [${conn.sourceSide}]`,
                  anchorX: wps[vs].x, anchorY: wps[vs].y, color: "#dc2626", defaultOX: -20, defaultOY: -14 });
                debugItems.push({ id: `dbg-ct-${conn.id}`, label: `T:${conn.id.slice(-4)} [${conn.targetSide}]`,
                  anchorX: wps[ve].x, anchorY: wps[ve].y, color: "#dc2626", defaultOX: 20, defaultOY: -14 });
                for (let i = 0; i < ve - vs; i++) {
                  const a = wps[vs + i], b = wps[vs + i + 1];
                  debugItems.push({ id: `dbg-seg-${conn.id}-${i}`, label: `${conn.id.slice(-4)}.s${i}`,
                    anchorX: (a.x + b.x) / 2, anchorY: (a.y + b.y) / 2, color: "#9333ea", defaultOX: 0, defaultOY: -10 });
                }
              }
            }
            if (selectedConnectorId && selectedElementIds.size === 0) {
              const conn = data.connectors.find(c => c.id === selectedConnectorId);
              if (conn && conn.waypoints.length >= 2) {
                const wps = conn.waypoints;
                const vs = conn.sourceInvisibleLeader ? 1 : 0;
                const ve = conn.targetInvisibleLeader ? wps.length - 2 : wps.length - 1;
                const srcEl = data.elements.find(e => e.id === conn.sourceId);
                const tgtEl = data.elements.find(e => e.id === conn.targetId);
                debugItems.push({ id: `dbg-conn-${conn.id}`, label: `[${conn.id.slice(-6)}] ${conn.type} ${conn.routingType}`,
                  anchorX: (wps[vs].x + wps[ve].x) / 2, anchorY: (wps[vs].y + wps[ve].y) / 2, color: "#2563eb", defaultOX: 0, defaultOY: -22 });
                debugItems.push({ id: `dbg-cs2-${conn.id}`, label: `S:${srcEl?.label || conn.sourceId.slice(-4)} [${conn.sourceSide}:${(conn.sourceOffsetAlong ?? 0.5).toFixed(2)}]`,
                  anchorX: wps[vs].x, anchorY: wps[vs].y, color: "#dc2626", defaultOX: -30, defaultOY: -14 });
                debugItems.push({ id: `dbg-ct2-${conn.id}`, label: `T:${tgtEl?.label || conn.targetId.slice(-4)} [${conn.targetSide}:${(conn.targetOffsetAlong ?? 0.5).toFixed(2)}]`,
                  anchorX: wps[ve].x, anchorY: wps[ve].y, color: "#dc2626", defaultOX: 30, defaultOY: -14 });
                for (let i = 0; i < ve - vs; i++) {
                  const a = wps[vs + i], b = wps[vs + i + 1];
                  debugItems.push({ id: `dbg-seg2-${conn.id}-${i}`, label: `s${i} (${Math.round(a.x)},${Math.round(a.y)})\u2192(${Math.round(b.x)},${Math.round(b.y)})`,
                    anchorX: (a.x + b.x) / 2, anchorY: (a.y + b.y) / 2, color: "#9333ea", defaultOX: 0, defaultOY: -10 });
                }
              }
            }
            return debugItems.map(item => (
              <DebugLabel key={item.id} item={item} svgToWorld={clientToWorld}
                offsets={debugLabelOffsets} setOffset={setDebugLabelOffset} />
            ));
          })()}

        </g>
      </svg>
      </DatabaseCtx.Provider>
      </ArchimateDepthCtx.Provider>
      </LaneDepthCtx.Provider>
      </ProcessGroupDepthCtx.Provider>
      </SublaneIdsCtx.Provider>
      </LaneFontSizeCtx.Provider>
      </PoolFontSizeCtx.Provider>
      </TitleFontSizeCtx.Provider>
      </ConnectorFontScaleCtx.Provider>
      </FontScaleCtx.Provider>
      </DisplayModeCtx.Provider>

      {/* Inline label editor overlay */}
      {editingLabel && (() => {
        const editingEl = data.elements.find(e => e.id === editingLabel.elementId);
        const isUseCase = editingEl?.type === 'use-case';
        const isPoolLane = editingEl?.type === 'pool' || editingEl?.type === 'lane';
        const hasTaskMarker = editingEl?.type === 'task' && !!editingEl?.taskType && editingEl?.taskType !== 'none';
        const isUmlElement = editingEl?.type === 'uml-class' || editingEl?.type === 'uml-enumeration';
        const commonChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
          let val = e.target.value;
          // UML class/enumeration: limit to 2 lines
          if (isUmlElement) {
            const lines = val.split('\n');
            if (lines.length > 2) val = lines.slice(0, 2).join('\n');
          }
          setEditingLabel(prev => prev ? { ...prev, value: val } : null);
        };
        if (isUseCase) {
          return (
            <textarea
              autoFocus
              value={editingLabel.value}
              onFocus={(e) => { const t = e.target; setTimeout(() => t.select(), 0); }}
              onChange={commonChange as React.ChangeEventHandler<HTMLTextAreaElement>}
              onBlur={commitLabel}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  commitLabel();
                }
                if (e.key === 'Escape') setEditingLabel(null);
              }}
              style={{
                position: 'absolute',
                left: editingLabel.x,
                top: editingLabel.y,
                width: editingLabel.width,
                height: editingLabel.height,
                fontSize: (data.fontSize ?? 12) * zoom,
                textAlign: 'center',
                background: 'white',
                border: '2px solid #2563eb',
                borderRadius: 4,
                outline: 'none',
                padding: '4px',
                resize: 'none',
                overflow: 'hidden',
              }}
            />
          );
        }
        if (isPoolLane) {
          return (
            <textarea
              autoFocus
              value={editingLabel.value}
              onFocus={(e) => { const t = e.target; setTimeout(() => t.select(), 0); }}
              onChange={commonChange as React.ChangeEventHandler<HTMLTextAreaElement>}
              onBlur={commitLabel}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditingLabel(null);
                if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); commitLabel(); }
              }}
              style={{
                position: 'absolute',
                left: editingLabel.x,
                top: editingLabel.y,
                width: editingLabel.width,
                height: editingLabel.height,
                fontSize: (data.fontSize ?? 12) * 11 / 12 * zoom,
                textAlign: 'left',
                background: 'white',
                border: '2px solid #7c3a2a',
                borderRadius: 4,
                outline: 'none',
                padding: '4px',
                resize: 'none',
              }}
              placeholder="Enter name (Ctrl+Enter to confirm)"
            />
          );
        }
        const isUmlEl = editingEl?.type === "uml-class" || editingEl?.type === "uml-enumeration";
        const editLines = editingLabel.value.split("\n").length;
        const editH = isUmlEl ? Math.max(editingLabel.height, editLines * 16 * zoom + 8) : editingLabel.height;
        return (
          <textarea
            autoFocus
            value={editingLabel.value}
            onFocus={(e) => { const t = e.target; setTimeout(() => t.select(), 0); }}
            onChange={commonChange as React.ChangeEventHandler<HTMLTextAreaElement>}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitLabel(); }
              if (e.key === "Escape") setEditingLabel(null);
            }}
            style={{
              position: "absolute",
              left: editingLabel.x,
              top: editingLabel.y + (hasTaskMarker ? 20 * zoom : 0),
              width: editingLabel.width,
              height: editH,
              fontSize: (data.fontSize ?? 12) * zoom,
              textAlign: "center",
              background: "white",
              border: "2px solid #2563eb",
              borderRadius: 4,
              outline: "none",
              padding: "4px",
              resize: "none",
              overflow: "hidden",
            }}
            placeholder={isUmlEl ? "Name (Shift+Enter for new line)" : undefined}
          />
        );
      })()}

      {/* Task type picker — shown after dropping a task onto a BPMN canvas */}
      {pendingDrop && pendingDrop.symbolType === "task" && (() => {
        const itemH = 20, headerH = 22, pad = 8;
        const dropdownH = headerH + TASK_TYPE_OPTIONS.length * itemH + pad;
        const containerH = svgRef.current?.parentElement?.getBoundingClientRect().height ?? window.innerHeight;
        const top = Math.min(pendingDrop.containerY, containerH - dropdownH);
        return (
          <div
            style={{ position: "absolute", left: pendingDrop.containerX + pickerOffset.x, top: top + pickerOffset.y, zIndex: 50 }}
            className="bg-white border border-gray-200 rounded shadow-lg py-1 flex flex-col"
          >
            <p
              className="px-3 py-0.5 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 cursor-grab active:cursor-grabbing select-none"
              onMouseDown={(e) => { e.preventDefault(); pickerDragRef.current = { startX: e.clientX, startY: e.clientY, origOffX: pickerOffset.x, origOffY: pickerOffset.y }; }}
            >
              Task Type
            </p>
            {TASK_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className="text-left px-3 py-0.5 text-sm text-gray-700 hover:bg-gray-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addElementWithAutoConnect("task", pendingDrop.worldPos, opt.value);
                  setPendingDrop(null);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        );
      })()}
      {/* Intermediate Event type picker */}
      {pendingDrop && pendingDrop.symbolType === "intermediate-event" && (() => {
        const itemH = 20, headerH = 22, pad = 8;
        const dropdownH = headerH + INTERMEDIATE_EVENT_TYPE_OPTIONS.length * itemH + pad;
        const containerH = svgRef.current?.parentElement?.getBoundingClientRect().height ?? window.innerHeight;
        const top = Math.min(pendingDrop.containerY, containerH - dropdownH);
        return (
          <div
            style={{ position: "absolute", left: pendingDrop.containerX + pickerOffset.x, top: top + pickerOffset.y, zIndex: 50 }}
            className="bg-white border border-gray-200 rounded shadow-lg py-1 flex flex-col"
          >
            <p
              className="px-3 py-0.5 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 cursor-grab active:cursor-grabbing select-none"
              onMouseDown={(e) => { e.preventDefault(); pickerDragRef.current = { startX: e.clientX, startY: e.clientY, origOffX: pickerOffset.x, origOffY: pickerOffset.y }; }}
            >
              Event Type
            </p>
            {INTERMEDIATE_EVENT_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className="text-left px-3 py-0.5 text-sm text-gray-700 hover:bg-gray-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (pendingDrop.splitConnectorId && onSplitConnector) {
                    onSplitConnector("intermediate-event", pendingDrop.worldPos, pendingDrop.splitConnectorId, undefined, opt.value);
                  } else {
                    addElementWithAutoConnect("intermediate-event", pendingDrop.worldPos, undefined, opt.value);
                  }
                  setPendingDrop(null);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Right-click quick-add popup */}
      {quickAdd && (() => {
        const BPMN_QUICK_ADD: SymbolType[] = [
          "start-event", "intermediate-event", "end-event",
          "task", "subprocess", "subprocess-expanded", "gateway",
          "data-object", "data-store", "text-annotation", "group",
        ];
        const SM_QUICK_ADD: SymbolType[] = [
          "state", "submachine", "initial-state", "final-state", "composite-state", "gateway", "fork-join",
        ];
        const VC_QUICK_ADD: SymbolType[] = [
          "chevron", "chevron-collapsed", "process-group",
        ];
        const QUICK_ADD_TYPES = diagramType === "state-machine" ? SM_QUICK_ADD
          : diagramType === "value-chain" ? VC_QUICK_ADD : BPMN_QUICK_ADD;
        const labels: Record<string, string> = {
          "start-event": "Start",
          "task": "Task",
          "subprocess": "Sub-Process",
          "subprocess-expanded": "Expanded",
          "intermediate-event": "Intermediate",
          "end-event": "End",
          "data-object": "Data Object",
          "data-store": "Data Store",
          "text-annotation": "Annotation",
          "group": "Group",
          "state": "State",
          "initial-state": "Initial",
          "final-state": "Final",
          "composite-state": "Composite",
          "gateway": "Gateway",
          "fork-join": "Fork/Join",
          "submachine": "SubMachine",
          "chevron": "Process",
          "chevron-collapsed": "Collapsed",
          "process-group": "Value Chain",
        };
        const COLS = 4;
        const BUTTON = 40;       // w-10 / h-10
        const GAP = 4;           // gap-1 in tailwind = 0.25rem ≈ 4px
        const PAD = 4;           // p-1
        const popupW = COLS * BUTTON + (COLS - 1) * GAP + 2 * PAD;
        const rows = Math.ceil(QUICK_ADD_TYPES.length / COLS);
        const popupH = rows * BUTTON + (rows - 1) * GAP + 2 * PAD;
        // Clamp popup so it stays inside the canvas
        const containerRect = svgRef.current?.parentElement?.getBoundingClientRect();
        const containerW = containerRect?.width ?? window.innerWidth;
        const containerH = containerRect?.height ?? window.innerHeight;
        const left = Math.min(quickAdd.screenX, containerW - popupW - 4);
        const top = Math.min(quickAdd.screenY, containerH - popupH - 4);
        return (
          <div
            style={{
              position: "absolute",
              left,
              top,
              zIndex: 50,
              width: popupW,
              display: "grid",
              gridTemplateColumns: `repeat(${COLS}, ${BUTTON}px)`,
              gap: `${GAP}px`,
              padding: `${PAD}px`,
            }}
            className="bg-white border border-gray-300 rounded shadow-lg"
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            {QUICK_ADD_TYPES.map((sym) => (
              <button
                key={sym}
                title={labels[sym]}
                className="w-10 h-10 flex items-center justify-center rounded hover:bg-blue-50 border border-transparent hover:border-blue-200"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  addElementWithAutoConnect(sym, quickAdd.worldPos);
                  setQuickAdd(null);
                }}
              >
                <PaletteSymbolPreview type={sym} colorConfig={colorConfig} />
              </button>
            ))}
          </div>
        );
      })()}

      {/* Process colour theme picker popup */}
      {themePicker && onUpdatePropertiesBatch && (() => {
        const CHEVRON_SET = new Set(["chevron", "chevron-collapsed"]);
        const selectedChevrons = data.elements
          .filter(el => selectedElementIds.has(el.id) && CHEVRON_SET.has(el.type))
          .sort((a, b) => a.x - b.x || a.y - b.y);
        if (selectedChevrons.length < 2) { setThemePicker(null); return null; }
        const containerRect = svgRef.current?.parentElement?.getBoundingClientRect();
        const containerW = containerRect?.width ?? window.innerWidth;
        const containerH = containerRect?.height ?? window.innerHeight;
        const POPUP_W = 220;
        const POPUP_H = 5 * 32 + 36 + 12; // 5 themes + clear + padding
        const left = Math.min(themePicker.screenX, containerW - POPUP_W - 4);
        const top = Math.min(themePicker.screenY, containerH - POPUP_H - 4);
        return (
          <div
            style={{ position: "absolute", left, top, zIndex: 50, width: POPUP_W }}
            className="bg-white border border-gray-300 rounded shadow-lg p-1.5"
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide px-1 mb-1">
              Colour Theme ({selectedChevrons.length} processes)
            </p>
            {CHEVRON_THEMES.map((theme) => (
              <button
                key={theme.name}
                className="w-full flex items-center gap-2 px-1.5 py-1 rounded hover:bg-gray-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const updates = selectedChevrons.map((el, i) => ({
                    id: el.id,
                    properties: { fillColor: theme.colours[i % theme.colours.length] },
                  }));
                  onUpdatePropertiesBatch(updates);
                  setThemePicker(null);
                }}
              >
                <span className="text-[10px] text-gray-700 w-12 shrink-0">{theme.name}</span>
                <div className="flex gap-0.5">
                  {theme.colours.map((c, i) => (
                    <div key={i}
                      className={`w-4 h-4 rounded-sm border ${i < selectedChevrons.length ? "border-gray-400" : "border-gray-200 opacity-40"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </button>
            ))}
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button
                className="w-full text-left px-1.5 py-1 text-[10px] text-gray-500 hover:bg-gray-50 rounded"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const updates = selectedChevrons.map((el) => ({
                    id: el.id,
                    properties: { fillColor: undefined },
                  }));
                  onUpdatePropertiesBatch(updates);
                  setThemePicker(null);
                }}
              >
                Clear Colours
              </button>
            </div>
          </div>
        );
      })()}

      {/* Status bar */}
      <div className="absolute bottom-2 left-2 text-xs text-gray-400 bg-white/80 px-2 py-1 rounded">
        {isDraggingConnector || isDraggingEndpoint
          ? "Release over an element to connect · Esc to cancel"
          : "Drag to pan · Shift+Drag to select · Scroll to zoom · Double-click label · Delete to remove"}
        {" · "}
        {Math.round(zoom * 100)}%
      </div>

      {/* Connector type choice popup — shown when both sequence and association are valid */}
      {connectorChoice && (
        <div
          style={{ position: "absolute", left: connectorChoice.pos.x, top: connectorChoice.pos.y, zIndex: 50 }}
          className="bg-white border border-gray-300 rounded shadow-lg p-1"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              onAddConnector(connectorChoice.sourceId, connectorChoice.targetId,
                "sequence", defaultDirectionType, defaultRoutingType,
                connectorChoice.sourceSide, connectorChoice.targetSide,
                connectorChoice.sourceOffset, connectorChoice.targetOffset);
              setConnectorChoice(null);
            }}
            className="block px-3 py-1.5 text-xs hover:bg-gray-100 w-full text-left rounded"
          >
            Sequence
          </button>
          <button
            onClick={() => {
              onAddConnector(connectorChoice.sourceId, connectorChoice.targetId,
                "associationBPMN", "open-directed", "direct",
                connectorChoice.sourceSide, connectorChoice.targetSide,
                connectorChoice.sourceOffset, connectorChoice.targetOffset);
              setConnectorChoice(null);
            }}
            className="block px-3 py-1.5 text-xs hover:bg-gray-100 w-full text-left rounded"
          >
            Association
          </button>
        </div>
      )}

      {/* Force-connect mode indicator */}
      {forceConnect?.dragging && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-[10px] font-medium px-3 py-1 rounded-full shadow-sm z-30 select-none animate-pulse">
          Force Connect: click target element (Esc to cancel)
        </div>
      )}

      {/* Zoom slider bar at bottom-right of canvas */}
      {(() => {
        const base = baseZoomRef.current ?? zoom;
        const displayPct = Math.round((zoom / base) * 100);
        const MIN_PCT = 25, MAX_PCT = 250;

        function applyZoomPct(pct: number) {
          const clamped = Math.max(MIN_PCT, Math.min(MAX_PCT, pct));
          const newZ = base * (clamped / 100);
          const rect = svgRef.current?.getBoundingClientRect();
          if (rect) {
            const cx = rect.width / 2, cy = rect.height / 2;
            setPan(prev => ({ x: cx - (cx - prev.x) * (newZ / zoom), y: cy - (cy - prev.y) * (newZ / zoom) }));
          }
          setZoom(newZ);
        }

        return (
          <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-white/90 border border-gray-200 rounded-full px-2 py-1 shadow-sm backdrop-blur-sm z-30 select-none">
            <button
              onClick={() => applyZoomPct(displayPct - 10)}
              className="text-gray-500 hover:text-gray-800 text-xs font-bold w-5 h-5 flex items-center justify-center"
              title="Zoom out"
            >&minus;</button>
            <input
              type="range"
              min={MIN_PCT}
              max={MAX_PCT}
              value={Math.min(MAX_PCT, Math.max(MIN_PCT, displayPct))}
              onChange={(e) => applyZoomPct(parseInt(e.target.value))}
              className="w-24 h-1 accent-blue-500 cursor-pointer"
              title={`${displayPct}%`}
            />
            <button
              onClick={() => applyZoomPct(displayPct + 10)}
              className="text-gray-500 hover:text-gray-800 text-xs font-bold w-5 h-5 flex items-center justify-center"
              title="Zoom in"
            >+</button>
            <input
              type="text"
              className="w-10 text-[10px] text-gray-600 text-center border border-gray-300 rounded px-0.5 py-0 bg-white tabular-nums"
              style={{ userSelect: "text" }}
              key={`zoom-${displayPct}`}
              defaultValue={`${displayPct}%`}
              onMouseDown={(e) => e.stopPropagation()}
              onFocus={(e) => { e.target.value = String(displayPct); e.target.select(); }}
              onBlur={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) applyZoomPct(v); }}
              onKeyDown={(e) => { if (e.key === "Enter") { const v = parseInt((e.target as HTMLInputElement).value); if (!isNaN(v)) applyZoomPct(v); (e.target as HTMLInputElement).blur(); } if (e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
            />
          </div>
        );
      })()}
      {pendingArchiConn && (
        <ArchimateConnectorPicker
          x={pendingArchiConn.screenX + 6}
          y={pendingArchiConn.screenY + 6}
          sourceName={(() => {
            const el = data.elements.find(e => e.id === pendingArchiConn.sourceId);
            const key = el?.properties?.shapeKey as string | undefined;
            return key ? findArchimateShapeByKey(key)?.name : undefined;
          })()}
          targetName={(() => {
            const el = data.elements.find(e => e.id === pendingArchiConn.targetId);
            const key = el?.properties?.shapeKey as string | undefined;
            return key ? findArchimateShapeByKey(key)?.name : undefined;
          })()}
          onCancel={() => setPendingArchiConn(null)}
          onSelect={(archiType: ArchimateConnectorType, extras?: { influenceSign?: "+" | "-" }) => {
            const p = pendingArchiConn;
            setPendingArchiConn(null);
            const initialLabel = archiType === "archi-influence" && extras?.influenceSign ? extras.influenceSign : undefined;
            onAddConnector(
              p.sourceId,
              p.targetId,
              archiType,
              "directed",
              "rectilinear",
              p.sourceSide,
              p.targetSide,
              p.sourceOffset,
              p.targetOffset,
              false,            // force
              initialLabel,
            );
          }}
        />
      )}
    </div>
  );
}
