"use client";

import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";
import type {
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
import { SymbolRenderer, SublaneIdsCtx, type ResizeHandle } from "./SymbolRenderer";
import { DisplayModeCtx, FontScaleCtx, ConnectorFontScaleCtx, TitleFontSizeCtx, SketchyFilter } from "@/app/lib/diagram/displayMode";
import { ConnectorRenderer } from "./ConnectorRenderer";

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
    if (c.type !== "sequence") continue;
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
  onAddElement: (type: SymbolType, position: Point, taskType?: BpmnTaskType, eventType?: EventType) => void;
  onMoveElement: (id: string, x: number, y: number) => void;
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
    targetOffsetAlong?: number
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
  defaultDirectionType: DirectionType;
  defaultRoutingType: RoutingType;
  onUpdateProperties?: (id: string, props: Record<string, unknown>) => void;
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
  defaultDirectionType,
  defaultRoutingType,
  onUpdateProperties,
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
}: Props) {
  const displayMode = displayModeProp ?? "normal";
  const svgRef = useRef<SVGSVGElement>(null);

  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
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
  const [focusedEndpoint, setFocusedEndpoint] = useState<"source" | "target" | null>(null);
  const [msgMarkerFocused, setMsgMarkerFocused] = useState(false);
  const [debugLabelOffsets, setDebugLabelOffsets] = useState<Map<string, Point>>(new Map());
  const setDebugLabelOffset = useCallback((id: string, offset: Point) => {
    setDebugLabelOffsets(prev => { const next = new Map(prev); next.set(id, offset); return next; });
  }, []);
  const [pickerOffset, setPickerOffset] = useState<Point>({ x: 0, y: 0 });
  const pickerDragRef = useRef<{ startX: number; startY: number; origOffX: number; origOffY: number } | null>(null);

  // Fit-to-content on initial mount
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
    const fitZoom = Math.min(rect.width / contentW, rect.height / contentH, 1);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setPan({ x: rect.width / 2 - cx * fitZoom, y: rect.height / 2 - cy * fitZoom });
    setZoom(fitZoom);
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
    // No child directly under cursor — return the container (e.g. expanded subprocess boundary)
    const nonContainer = matches.find(el => el.type !== "composite-state" && el.type !== "pool" && el.type !== "subprocess-expanded");
    return nonContainer ?? matches[0];
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
          let seqTargetSide: Side = targetOuterSide ? oppositeSide(targetOuterSide) : getClosestSide(pos, targetEl);

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
          // (expanded subprocess attachment is handled by the click-based logic above)
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
        // Dropped on a child or boundary event inside an expanded subprocess
        const targetOuterSide = getBoundaryEventOuterSide(innerTarget, data.elements);
        if (!targetOuterSide && (conn?.type === "flow" || conn?.type === "transition")) {
          const bound = pointToBoundaryOffset(pos, innerTarget);
          onUpdateConnectorEndpoint(connectorId, endpoint, innerTarget.id, bound.side, bound.offsetAlong);
        } else {
          const newSide = targetOuterSide ?? getClosestSide(pos, innerTarget);
          onUpdateConnectorEndpoint(connectorId, endpoint, innerTarget.id, newSide, 0.5);
        }
        onSelectConnector(null);
      } else if (isMsgBPMN) {
        // messageBPMN endpoint reconnection — must remain cross-pool
        const fixedId  = endpoint === "source" ? conn!.targetId  : conn!.sourceId;
        const fixedEl  = data.elements.find(e => e.id === fixedId);
        const fixedPoolId = fixedEl ? getElementPoolId(fixedEl, data.elements) : null;
        const targetEl = findDropTarget(pos, fromId);
        if (targetEl) {
          const targetPoolId = getElementPoolId(targetEl, data.elements);
          // Valid if cross-pool: target's pool ≠ fixed end's pool, or one of them is a pool itself
          const isCross =
            targetEl.type === "pool" ||
            fixedEl?.type === "pool" ||
            (targetPoolId !== null && targetPoolId !== fixedPoolId);
          if (isCross) {
            // Top/bottom sides computed from vertical positions of new source & target
            const newSourceEl = endpoint === "source" ? targetEl : fixedEl!;
            const newTargetEl = endpoint === "target" ? targetEl : fixedEl!;
            const srcCy = newSourceEl.y + newSourceEl.height / 2;
            const tgtCy = newTargetEl.y + newTargetEl.height / 2;
            const newSide = endpoint === "source"
              ? ((srcCy <= tgtCy ? "bottom" : "top") as Side)
              : ((srcCy <= tgtCy ? "top"    : "bottom") as Side);
            onUpdateConnectorEndpoint(connectorId, endpoint, targetEl.id, newSide, 0.5);
          }
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
                const newSide = targetOuterSide ?? getClosestSide(pos, targetEl);
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
              const newSide = targetOuterSide ?? getClosestSide(pos, targetEl);
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
        || elType === "composite-state";
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
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      onResizeElementEnd?.(elementId);
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

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (readOnly) return;
    if (!pendingDragSymbol) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const worldPos = svgToWorld(e.clientX - rect.left, e.clientY - rect.top);

    // Check if dropped on a sequence connector (split connector feature)
    const SPLITTABLE_DROPS = new Set(["gateway", "intermediate-event", "task", "subprocess"]);
    if (diagramType === "bpmn" && onSplitConnector && SPLITTABLE_DROPS.has(pendingDragSymbol)) {
      const hit = findConnectorNearPoint(data.connectors, worldPos);
      if (hit) {
        if (pendingDragSymbol === "gateway" || pendingDragSymbol === "task" || pendingDragSymbol === "subprocess") {
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
      onAddElement(pendingDragSymbol, worldPos);
    }
  }

  function startEditingLabel(el: DiagramElement) {
    const isOldContainer = el.type === "system-boundary" || el.type === "composite-state" || el.type === "subprocess-expanded" || el.type === "group";
    if (el.type === "pool" || el.type === "lane") {
      const lw = el.type === "pool" ? 30 : 24;
      setEditingLabel({
        elementId: el.id,
        x: (el.x + lw) * zoom + pan.x,
        y: el.y * zoom + pan.y,
        width: Math.min(180, (el.width - lw) * zoom),
        height: Math.min(80, el.height * zoom),
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
    // Nudge selected connector or focused endpoint with arrow keys
    if (selectedConnectorId && selectedElementIds.size === 0 && !editingLabel) {
      const NUDGE = e.shiftKey ? 1 : 5;
      if (focusedEndpoint && onNudgeConnectorEndpoint) {
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

  const otherContainersUnsorted = data.elements.filter(
    (el) => el.type === "system-boundary" || el.type === "composite-state"
         || el.type === "subprocess-expanded"
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
  // Sort non-containers by parent nesting depth so children of deeper subprocesses render on top
  const nonContainers = (() => {
    const items = data.elements.filter(
      (el) => el.type !== "system-boundary" && el.type !== "composite-state"
                && el.type !== "pool" && el.type !== "lane"
                && el.type !== "subprocess-expanded"
                && el.type !== "group"
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
    return items.sort((a, b) => getParentDepth(a) - getParentDepth(b));
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

  // Compute misaligned messageBPMN connectors (no x-overlap between source and target)
  const misalignedConnectorIds = new Set<string>();
  const errorTargetIds = new Set<string>();
  data.connectors
    .filter((c) => c.type === "messageBPMN")
    .forEach((c) => {
      const src = data.elements.find((e) => e.id === c.sourceId);
      const tgt = data.elements.find((e) => e.id === c.targetId);
      if (src && tgt) {
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
  if (diagramType === "domain") for (const conn of data.connectors) {
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

  const endpointHandles = selectedConnector && selectedConnector.waypoints.length >= 2
    ? {
        source: selectedConnector.waypoints[1],                                      // srcEdge
        target: selectedConnector.waypoints[selectedConnector.waypoints.length - 2], // tgtEdge
      }
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

  return (
    <div
      className="relative flex-1 overflow-hidden bg-gray-50"
      style={{
        backgroundImage: "radial-gradient(#d1d5db 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      <DisplayModeCtx.Provider value={displayMode}>
      <FontScaleCtx.Provider value={((data.fontSize ?? 12) / 12) * (displayMode === "hand-drawn" ? 1.3 : 1)}>
      <ConnectorFontScaleCtx.Provider value={((data.connectorFontSize ?? 10) / 10) * (displayMode === "hand-drawn" ? 1.3 : 1)}>
      <TitleFontSizeCtx.Provider value={data.titleFontSize ?? 14}>
      <SublaneIdsCtx.Provider value={sublaneIds}>
      <svg
        ref={svgRef}
        data-canvas
        className="w-full h-full outline-none"
        tabIndex={0}
        onMouseDown={handleBackgroundMouseDown}
        onWheel={handleWheel}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onKeyDown={handleKeyDown}
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
            if (createdAt) line3Segs.push({ label: "Created: ", value: formatAustralianDate(createdAt) });
            const line4Segs: Seg[] = updatedAt ? [{ label: "Modified: ", value: formatAustralianTime(updatedAt) }] : [];
            const subLines: Seg[][] = [line2Segs, line3Segs, line4Segs].filter(l => l.length > 0);
            const tfs = data.titleFontSize ?? 14;
            const subFs = Math.round(tfs * 0.79);
            const lineH = Math.round(tfs * 1.15);
            const titleH = (1 + subLines.length) * lineH + 8;
            const topY = minY - titleH - 20;
            return (
              <g style={{ pointerEvents: "none", fontStyle: "normal" }}>
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
              (isMessageBpmnEndpointDrag &&
                el.type === "pool" &&
                el.id !== epDragFixedEl?.id &&       // not the fixed end itself (if it's a pool)
                el.id !== epDragFixedPoolId &&        // not the pool the fixed end belongs to
                ((el.properties.poolType as string | undefined) ?? "black-box") === "black-box");
            const isWhiteBoxPool = el.type === "pool" &&
              ((el.properties.poolType as string | undefined) ?? "black-box") === "white-box";
            const isSubExpDropTarget = isDraggingConnector && !draggingSourceIsData &&
              el.type === "subprocess-expanded" &&
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
                  if (isWhiteBoxPool && selectedElementIds.has(el.id) && selectedElementIds.size === 1) {
                    onSetSelectedElements(new Set()); // toggle deselect for white-box pools
                  } else if (e?.shiftKey) {
                    onSetSelectedElements((prev) => { const next = new Set(prev); if (next.has(el.id)) next.delete(el.id); else next.add(el.id); return next; });
                  } else if (!selectedElementIds.has(el.id)) {
                    onSetSelectedElements(new Set([el.id]));
                  }
                  onSelectConnector(null);
                }}
                onMove={(x, y) => onMoveElement(el.id, x, y)}
                onDoubleClick={() => {
                  const linkedId = el.type === "subprocess" ? el.properties.linkedDiagramId as string | undefined : undefined;
                  if (linkedId && onDrillIntoSubprocess) {
                    onDrillIntoSubprocess(linkedId);
                  } else {
                    startEditingLabel(el);
                  }
                }}
                onConnectionPointDragStart={(side, worldPos) => {
                  if (isWhiteBoxPool) return; // no connectors from white-box pools
                  handleConnectionPointDragStart(el.id, side, worldPos);
                }}
                showConnectionPoints={selectedElementIds.size <= 1 && !isWhiteBoxPool && (selectedElementIds.has(el.id) || isDraggingConnector || isDraggingEndpoint)}
                onResizeDragStart={(handle, e) => handleResizeDragStart(el.id, handle, e)}
                svgToWorld={clientToWorld}
                onUpdateProperties={onUpdateProperties}
                onUpdateLabel={onUpdateLabel}
                onMoveEnd={
                  (el.type === "gateway" || el.type === "intermediate-event" || el.type === "task" || el.type === "subprocess")
                    ? () => onElementMoveEnd?.(el.id)
                    : undefined
                }
                multiSelected={selectedElementIds.size > 1 && selectedElementIds.has(el.id)}
                onGroupMove={onMoveElements ? (dx, dy) => onMoveElements([...selectedElementIds], dx / zoom, dy / zoom) : undefined}
                onGroupMoveEnd={onElementsMoveEnd}
                colorConfig={colorConfig}
                onDrillBack={el.type === "start-event" ? onDrillBack : undefined}
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
            const LANE_LW = 24;
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
            if (isDraggingConnector && el.id !== draggingConnector!.fromId) {
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
            } else if (isMessageBpmnEndpointDrag) {
              // Highlight elements in white-box pools that differ from the fixed end's pool
              // Exclude data elements and send elements (send tasks, throwing events, end events)
              const epElIsSendLocked = el.type === "end-event"
                || ((el.taskType === "send" || el.flowType === "throwing")
                    && data.connectors.some(c => c.type === "messageBPMN" && c.sourceId === el.id));
              if (!DATA_ELEMENT_TYPES.has(el.type) && !epElIsSendLocked) {
                const elPoolId = getElementPoolId(el, data.elements);
                if (elPoolId && elPoolId !== epDragFixedPoolId) {
                  const elPool = data.elements.find(p => p.id === elPoolId);
                  if (((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") {
                    elIsMsgTarget = true;
                  }
                }
              }
            } else if (isAssocBpmnEndpointDrag && el.id !== epDragMovingId) {
              const elIsData = DATA_ELEMENT_TYPES.has(el.type);
              // The fixed end determines what's valid: if fixed is data, targets must be non-data and vice versa
              if (epDragFixedIsData && !elIsData) elIsAssocTarget = true;
              else if (!epDragFixedIsData && elIsData) elIsAssocTarget = true;
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
                if (ev?.shiftKey) {
                  onSetSelectedElements((prev) => { const next = new Set(prev); if (next.has(el.id)) next.delete(el.id); else next.add(el.id); return next; });
                } else if (!selectedElementIds.has(el.id)) {
                  onSetSelectedElements(new Set([el.id]));
                }
                onSelectConnector(null);
              }}
              onMove={(x, y) => { setDraggingElementId(el.id); onMoveElement(el.id, x, y); }}
              onDoubleClick={() => {
                const linkedId = el.type === "subprocess" ? el.properties.linkedDiagramId as string | undefined : undefined;
                if (linkedId && onDrillIntoSubprocess) {
                  onDrillIntoSubprocess(linkedId);
                } else {
                  startEditingLabel(el);
                }
              }}
              onConnectionPointDragStart={(side, worldPos) =>
                handleConnectionPointDragStart(el.id, side, worldPos)
              }
              showConnectionPoints={selectedElementIds.size <= 1 && (selectedElementIds.has(el.id) || isDraggingConnector || isDraggingEndpoint)}
              onResizeDragStart={(handle, e) => handleResizeDragStart(el.id, handle, e)}
              svgToWorld={clientToWorld}
              onUpdateProperties={onUpdateProperties}
              onUpdateLabel={onUpdateLabel}
              onMoveEnd={() => { setDraggingElementId(null); onElementMoveEnd?.(el.id); }}
              multiSelected={selectedElementIds.size > 1 && selectedElementIds.has(el.id)}
              onGroupMove={onMoveElements ? (dx, dy) => onMoveElements([...selectedElementIds], dx / zoom, dy / zoom) : undefined}
              onGroupMoveEnd={onElementsMoveEnd}
              colorConfig={colorConfig}
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
              onDrillBack={el.type === "start-event" ? onDrillBack : undefined}
              showValueDisplay={showValueDisplay}
            />
            );
          })}

          {/* Boundary events — rendered on top of their hosts */}
          {boundaryEvents.map((el) => {
            let elIsDropTarget = false;
            let elIsMsgTarget = false;
            let elIsAssocTarget = false;
            if (isDraggingConnector && el.id !== draggingConnector!.fromId) {
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
                  if (ev?.shiftKey) {
                    onSetSelectedElements((prev) => { const next = new Set(prev); if (next.has(el.id)) next.delete(el.id); else next.add(el.id); return next; });
                  } else if (!selectedElementIds.has(el.id)) {
                    onSetSelectedElements(new Set([el.id]));
                  }
                  onSelectConnector(null);
                }}
                onMove={(x, y) => onMoveElement(el.id, x, y)}
                onDoubleClick={() => {}}
                onConnectionPointDragStart={(side, worldPos) =>
                  handleConnectionPointDragStart(el.id, side, worldPos)}
                showConnectionPoints={selectedElementIds.size <= 1 && (selectedElementIds.has(el.id) || isDraggingConnector || isDraggingEndpoint)}
                svgToWorld={clientToWorld}
                onUpdateProperties={onUpdateProperties}
                onUpdateLabel={onUpdateLabel}
                multiSelected={selectedElementIds.size > 1 && selectedElementIds.has(el.id)}
                onGroupMove={onMoveElements ? (dx, dy) => onMoveElements([...selectedElementIds], dx / zoom, dy / zoom) : undefined}
                onGroupMoveEnd={onElementsMoveEnd}
                colorConfig={colorConfig}
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
              onMove={(x, y) => onMoveElement(el.id, x, y)}
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
            />
          ))}

          {/* Association connectors — rendered above all elements */}
          {data.connectors.filter(c => c.type === "associationBPMN" || c.type === "messageBPMN").map((conn) => (
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
            />
          ))}

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

          {/* Connector endpoint handles when a non-messageBPMN connector is selected */}
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
                <rect
                  x={endpointHandles.source.x - 5} y={endpointHandles.source.y - 5}
                  width={10} height={10}
                  fill={focusedEndpoint === "source" ? "#f59e0b" : "#2563eb"}
                  stroke="white" strokeWidth={1.5}
                  style={{ cursor: "pointer" }}
                  onMouseDown={makeEndpointHandler("source", endpointHandles.source)}
                />
                <rect
                  x={endpointHandles.target.x - 5} y={endpointHandles.target.y - 5}
                  width={10} height={10}
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
                // Shift+drag: insert space
                let lastWorld = clientToWorld(e.clientX, e.clientY);
                function onMove(ev: MouseEvent) {
                  const curWorld = clientToWorld(ev.clientX, ev.clientY);
                  const ddx = curWorld.x - lastWorld.x;
                  const ddy = curWorld.y - lastWorld.y;
                  if (Math.abs(ddx) > Math.abs(ddy)) {
                    if (ddx > 0) onInsertSpace!(mx, my, ddx, 0);
                  } else {
                    if (ddy > 0) onInsertSpace!(mx, my, 0, ddy);
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
      </SublaneIdsCtx.Provider>
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
              onFocus={(e) => { const t = e.target; setTimeout(() => { t.setSelectionRange(t.value.length, t.value.length); }, 0); }}
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
              onFocus={(e) => { const t = e.target; setTimeout(() => { t.setSelectionRange(t.value.length, t.value.length); }, 0); }}
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
            onFocus={(e) => { const t = e.target; setTimeout(() => { t.setSelectionRange(t.value.length, t.value.length); }, 0); }}
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
                  onAddElement("task", pendingDrop.worldPos, opt.value);
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
                    onAddElement("intermediate-event", pendingDrop.worldPos, undefined, opt.value);
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
    </div>
  );
}
