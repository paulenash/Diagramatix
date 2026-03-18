"use client";

import { useRef, useState, useCallback, useEffect } from "react";
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
import { SymbolRenderer, type ResizeHandle } from "./SymbolRenderer";
import { DisplayModeCtx, SketchyFilter } from "@/app/lib/diagram/displayMode";
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
    targetSide: Side
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
  onUpdateCurveHandles?: (id: string, waypoints: Point[], cp1Rel: Point, cp2Rel: Point) => void;
  colorConfig?: import("@/app/lib/diagram/colors").SymbolColorConfig;
  displayMode?: import("@/app/lib/diagram/displayMode").DisplayMode;
  getViewportCenterRef?: React.MutableRefObject<(() => Point) | null>;
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
  onUpdateCurveHandles,
  colorConfig,
  displayMode: displayModeProp,
  getViewportCenterRef,
}: Props) {
  const displayMode = displayModeProp ?? "normal";
  const svgRef = useRef<SVGSVGElement>(null);

  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [editingLabel, setEditingLabel] = useState<EditingLabel | null>(null);
  const [draggingConnector, setDraggingConnector] = useState<DraggingConnector | null>(null);
  const [draggingEndpoint, setDraggingEndpoint] = useState<DraggingEndpoint | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [pickerOffset, setPickerOffset] = useState<Point>({ x: 0, y: 0 });
  const pickerDragRef = useRef<{ startX: number; startY: number; origOffX: number; origOffY: number } | null>(null);

  // Reset picker offset when a new pending drop appears
  useEffect(() => { setPickerOffset({ x: 0, y: 0 }); }, [pendingDrop]);

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
  const spaceHeldRef = useRef(false);

  // Track Space key for pan-while-lasso
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.code === "Space" && !e.repeat) spaceHeldRef.current = true; }
    function onKeyUp(e: KeyboardEvent) { if (e.code === "Space") spaceHeldRef.current = false; }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, []);

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
    // Prefer non-container elements (child states) over composite-state containers so that
    // dropping onto a state inside a composite returns the child state, not the composite.
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
        const actorLike = ["actor", "team"];
        const isDataConn =
          (sourceEl && DATA_ELEMENT_TYPES.has(sourceEl.type)) ||
          DATA_ELEMENT_TYPES.has(targetEl.type);

        const sourcePoolId = sourceEl ? getElementPoolId(sourceEl, data.elements) : null;
        const targetPoolId = getElementPoolId(targetEl, data.elements);
        const isCrossPool =
          sourcePoolId !== null && targetPoolId !== null && sourcePoolId !== targetPoolId;
        const involvesPool = sourceEl?.type === "pool" || targetEl.type === "pool";

        // End-event source restrictions
        if (sourceEl?.type === "end-event") {
          if (!sourceEl.boundaryHostId && !isCrossPool && !involvesPool) return; // free-standing: messageBPMN only
          if (sourceEl.boundaryHostId) {
            if (targetEl.parentId === sourceEl.boundaryHostId) return; // no connection to children of parent subprocess
            if (isCrossPool || involvesPool) return; // sequence only — no cross-pool messageBPMN
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
            // Rule 3 (send): cannot connect to children of parent subprocess
            if (targetEl.parentId === sourceEl.boundaryHostId) return;
          } else if (sourceEl.taskType === "receive" || sourceEl.flowType === "catching") {
            // Rule 3 (receive): can ONLY connect to children of parent subprocess
            if (targetEl.parentId !== sourceEl.boundaryHostId) return;
          }
          // Generic intermediate boundary event: only Rule 5 above applies
        }

        // Rule 4: Child of subprocess cannot connect to its own parent subprocess
        if (sourceEl?.parentId && targetEl.id === sourceEl.parentId && targetEl.type === "subprocess-expanded") return;
        // Rule 4b: Child state cannot connect to its own parent composite-state
        if (sourceEl?.parentId && targetEl.id === sourceEl.parentId && targetEl.type === "composite-state") return;

        if (isCrossPool || involvesPool) {
          // Start events cannot send messageBPMN
          if (sourceEl?.type === "start-event") return;
          const srcCy = sourceEl ? sourceEl.y + sourceEl.height / 2 : 0;
          const tgtCy = targetEl.y + targetEl.height / 2;
          const msgSrcSide: Side = srcCy <= tgtCy ? "bottom" : "top";
          const msgTgtSide: Side = srcCy <= tgtCy ? "top"    : "bottom";
          onAddConnector(
            elementId, targetEl.id,
            "messageBPMN", "directed", "direct",
            msgSrcSide, msgTgtSide
          );
        } else {
          if (targetEl.type === "lane") return;  // pool already handled above
          const targetOuterSide = getBoundaryEventOuterSide(targetEl, data.elements);
          // Sequence connectors connect to the INNER (subprocess-facing) side of boundary events
          const seqSourceSide = outerSide ? oppositeSide(outerSide) : effectiveSide;
          const seqTargetSide = targetOuterSide ? oppositeSide(targetOuterSide) : getClosestSide(pos, targetEl);
          let connType: ConnectorType;
          let connRouting: RoutingType;
          let connDirection: DirectionType;

          if (isDataConn) {
            const isAnnotationConn =
              sourceEl?.type === "text-annotation" || targetEl.type === "text-annotation";
            connType = "associationBPMN"; connRouting = "direct";
            connDirection = isAnnotationConn ? "non-directed" : "open-directed";
          } else if (defaultRoutingType === "curvilinear") {
            connType = "transition"; connRouting = defaultRoutingType; connDirection = defaultDirectionType;
          } else if ((sourceEl && actorLike.includes(sourceEl.type)) || actorLike.includes(targetEl.type)) {
            connType = "association"; connRouting = defaultRoutingType; connDirection = defaultDirectionType;
          } else {
            connType = "sequence"; connRouting = defaultRoutingType; connDirection = defaultDirectionType;
          }
          onAddConnector(elementId, targetEl.id, connType, connDirection, connRouting, seqSourceSide, seqTargetSide);
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
      const currentEl = data.elements.find((e) => e.id === fromId);
      if (!isMsgBPMN && currentEl &&
        pos.x >= currentEl.x && pos.x <= currentEl.x + currentEl.width &&
        pos.y >= currentEl.y && pos.y <= currentEl.y + currentEl.height) {
        const { side, offsetAlong } = pointToBoundaryOffset(pos, currentEl);
        onUpdateConnectorEndpoint(connectorId, endpoint, currentEl.id, side, offsetAlong);
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
          } else if (targetEl.type === "pool") {
            // silently abort — only messageBPMN connectors may attach to a pool
          } else {
            const targetOuterSide = getBoundaryEventOuterSide(targetEl, data.elements);
            const newSide = targetOuterSide ?? getClosestSide(pos, targetEl);
            onUpdateConnectorEndpoint(connectorId, endpoint, targetEl.id, newSide, 0.5);
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
    const minX = Math.max(sourceEl.x, targetEl.x);
    const maxX = Math.min(sourceEl.x + sourceEl.width, targetEl.x + targetEl.width);

    function clampX(raw: number) { return maxX > minX ? Math.max(minX, Math.min(maxX, raw)) : raw; }

    function buildWaypoints(x: number): Point[] {
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
      onUpdateConnectorWaypoints?.(connectorId, buildWaypoints(clampX(startX + dx)));
    }

    function onMouseUp(ev: MouseEvent) {
      const dx = (ev.clientX - startClientX) / zoom;
      const newX = clampX(startX + dx);
      const newOffsetAlong = sourceEl!.width > 0 ? (newX - sourceEl!.x) / sourceEl!.width : 0.5;
      onUpdateConnectorEndpoint(connectorId, "source", conn!.sourceId, conn!.sourceSide, newOffsetAlong);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function handleResizeDragStart(elementId: string, handle: ResizeHandle, e: React.MouseEvent) {
    e.stopPropagation();
    const el = data.elements.find((el) => el.id === elementId);
    if (!el) return;

    const isTaskLike = el.type === "task" || el.type === "subprocess" || el.type === "subprocess-expanded";
    const isUseCase = el.type === "use-case";
    const ar = isUseCase ? el.width / el.height : 0;
    const minW = isUseCase ? 60 : (isTaskLike ? 60 : MIN_BOUNDARY_W);
    const minH = isUseCase ? 30 : (isTaskLike ? 36 : MIN_BOUNDARY_H);

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

      if (isUseCase && ar > 0) {
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

    // Default drag → pan; hold Space → lasso
    if (!spaceHeldRef.current) {
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
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(4, Math.max(0.2, zoom * delta));

    setPan((prev) => ({
      x: mouseX - (mouseX - prev.x) * (newZoom / zoom),
      y: mouseY - (mouseY - prev.y) * (newZoom / zoom),
    }));
    setZoom(newZoom);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!pendingDragSymbol) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const worldPos = svgToWorld(e.clientX - rect.left, e.clientY - rect.top);

    // Check if dropped on a sequence connector (split connector feature)
    if (diagramType === "bpmn" && onSplitConnector &&
        (pendingDragSymbol === "gateway" || pendingDragSymbol === "intermediate-event")) {
      const hit = findConnectorNearPoint(data.connectors, worldPos);
      if (hit) {
        if (pendingDragSymbol === "gateway") {
          // Gateways have no type picker — split immediately with default type
          onSplitConnector("gateway", worldPos, hit.id);
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
      setEditingLabel({
        elementId: el.id,
        x: el.x * zoom + pan.x,
        y: el.y * zoom + pan.y,
        width: el.width * zoom,
        height: isOldContainer ? HEADER_H * zoom : el.height * zoom,
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
  }

  const transform = `translate(${pan.x}, ${pan.y}) scale(${zoom})`;
  const isDraggingConnector = draggingConnector !== null;
  const isDraggingEndpoint = draggingEndpoint !== null;

  // Render pools first (deepest), then other containers, then lanes, then regular elements
  const pools = data.elements.filter((el) => el.type === "pool");
  const lanes = data.elements.filter((el) => el.type === "lane");
  const otherContainers = data.elements.filter(
    (el) => el.type === "system-boundary" || el.type === "composite-state"
         || el.type === "subprocess-expanded"
  );
  const groupElements = data.elements.filter((el) => el.type === "group");
  const nonContainers = data.elements.filter(
    (el) => el.type !== "system-boundary" && el.type !== "composite-state"
              && el.type !== "pool" && el.type !== "lane"
              && el.type !== "subprocess-expanded"
              && el.type !== "group"
              && !el.boundaryHostId
  );
  const boundaryEvents = data.elements.filter((el) => !!el.boundaryHostId);

  // Precompute messageBPMN highlight context
  const BPMN_TRIGGER_TYPES = new Set<string>(["task", "subprocess", "subprocess-expanded", "intermediate-event", "end-event"]);
  const draggingSourceEl = draggingConnector
    ? (data.elements.find((e) => e.id === draggingConnector.fromId) ?? null)
    : null;
  const isBpmnSource = draggingSourceEl ? BPMN_TRIGGER_TYPES.has(draggingSourceEl.type) : false;
  const draggingSourcePoolId = draggingSourceEl
    ? getElementPoolId(draggingSourceEl, data.elements)
    : null;
  const draggingSourceIsData = draggingSourceEl ? DATA_ELEMENT_TYPES.has(draggingSourceEl.type) : false;
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

  return (
    <div
      className="relative flex-1 overflow-hidden bg-gray-50"
      style={{
        backgroundImage: "radial-gradient(#d1d5db 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      <DisplayModeCtx.Provider value={displayMode}>
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
        <g transform={transform}>
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
                onDoubleClick={() => startEditingLabel(el)}
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
                  (el.type === "gateway" || el.type === "intermediate-event")
                    ? () => onElementMoveEnd?.(el.id)
                    : undefined
                }
                multiSelected={selectedElementIds.size > 1 && selectedElementIds.has(el.id)}
                onGroupMove={onMoveElements ? (dx, dy) => onMoveElements([...selectedElementIds], dx / zoom, dy / zoom) : undefined}
                onGroupMoveEnd={onElementsMoveEnd}
                colorConfig={colorConfig}
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

          {/* Regular connectors — rendered behind elements */}
          {data.connectors.filter(c => c.type !== "associationBPMN" && c.type !== "messageBPMN").map((conn) => (
            <ConnectorRenderer
              key={conn.id}
              connector={conn}
              selected={conn.id === selectedConnectorId}
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
            />
          ))}

          {/* Non-container elements */}
          {nonContainers.map((el) => {
            let elIsDropTarget = false;
            let elIsMsgTarget = false;
            let elIsAssocTarget = false;
            if (isDraggingConnector && el.id !== draggingConnector!.fromId) {
              const elIsData = DATA_ELEMENT_TYPES.has(el.type);
              if (draggingSourceIsData && !elIsData) {
                elIsAssocTarget = true;
              } else if (!draggingSourceIsData && elIsData) {
                elIsAssocTarget = true;
              } else if (draggingFromFreeEndEvent) {
                // Free-standing end-event: messageBPMN targets only in white-box pools
                const elPoolId = getElementPoolId(el, data.elements);
                if (elPoolId) {
                  const elPool = data.elements.find((p) => p.id === elPoolId);
                  if (((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") {
                    elIsMsgTarget = true;
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
                  } else if (elPoolId && elPoolId !== draggingSourcePoolId) {
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
                } else if (elPoolId && elPoolId !== draggingSourcePoolId) {
                  const elPool = data.elements.find((p) => p.id === elPoolId);
                  const elPoolIsWhiteBox =
                    ((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box";
                  if (elPoolIsWhiteBox) elIsMsgTarget = true;
                }
              }
            } else if (isMessageBpmnEndpointDrag) {
              // Highlight elements in white-box pools that differ from the fixed end's pool
              const elPoolId = getElementPoolId(el, data.elements);
              if (elPoolId && elPoolId !== epDragFixedPoolId) {
                const elPool = data.elements.find(p => p.id === elPoolId);
                if (((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box") {
                  elIsMsgTarget = true;
                }
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
              isErrorTarget={errorTargetIds.has(el.id)}
              onSelect={(ev) => {
                if (ev?.shiftKey) {
                  onSetSelectedElements((prev) => { const next = new Set(prev); if (next.has(el.id)) next.delete(el.id); else next.add(el.id); return next; });
                } else if (!selectedElementIds.has(el.id)) {
                  onSetSelectedElements(new Set([el.id]));
                }
                onSelectConnector(null);
              }}
              onMove={(x, y) => { setDraggingElementId(el.id); onMoveElement(el.id, x, y); }}
              onDoubleClick={() => startEditingLabel(el)}
              onConnectionPointDragStart={(side, worldPos) =>
                handleConnectionPointDragStart(el.id, side, worldPos)
              }
              showConnectionPoints={selectedElementIds.size <= 1 && (selectedElementIds.has(el.id) || isDraggingConnector || isDraggingEndpoint)}
              onResizeDragStart={
                (el.type === "task" || el.type === "subprocess" || el.type === "subprocess-expanded")
                  ? (handle, e) => handleResizeDragStart(el.id, handle, e)
                  : undefined
              }
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
            />
            );
          })}

          {/* Boundary events — rendered on top of their hosts */}
          {boundaryEvents.map((el) => {
            let elIsDropTarget = false;
            let elIsMsgTarget = false;
            let elIsAssocTarget = false;
            if (isDraggingConnector && el.id !== draggingConnector!.fromId) {
              if (draggingSourceIsData) {
                elIsAssocTarget = true;
              } else if (draggingFromFreeEndEvent) {
                // Free-standing end-event: boundary intermediate-events in other white-box pools are messageBPMN targets
                const elPoolId = getElementPoolId(el, data.elements);
                if (elPoolId && el.type === "intermediate-event") {
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
                    else if (elPoolId && elPoolId !== draggingSourcePoolId && el.type === "intermediate-event") {
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
                } else if (elPoolId && elPoolId !== draggingSourcePoolId && el.type === "intermediate-event") {
                  const elPool = data.elements.find((p) => p.id === elPoolId);
                  const elPoolIsWhiteBox =
                    ((elPool?.properties.poolType as string | undefined) ?? "black-box") === "white-box";
                  if (elPoolIsWhiteBox) elIsMsgTarget = true;
                }
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
              misaligned={misalignedConnectorIds.has(conn.id)}
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
            />
          ))}

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
                  fill="#2563eb" fillOpacity={0.25} stroke="#2563eb" strokeWidth={1.5}
                  style={{ cursor: "ew-resize" }}
                  onMouseDown={(e) => handleMessageBpmnDrag(selectedConnectorId!, x, e)}
                />
              </g>
            );
          })()}

          {/* Connector endpoint handles when a non-messageBPMN connector is selected */}
          {endpointHandles && (
            <g data-interactive>
              <rect
                x={endpointHandles.source.x - 5} y={endpointHandles.source.y - 5}
                width={10} height={10}
                fill="#2563eb" stroke="white" strokeWidth={1.5}
                style={{ cursor: "crosshair" }}
                onMouseDown={(e) =>
                  handleEndpointDragStart(selectedConnectorId!, "source", endpointHandles.source, e)
                }
              />
              <rect
                x={endpointHandles.target.x - 5} y={endpointHandles.target.y - 5}
                width={10} height={10}
                fill="#2563eb" stroke="white" strokeWidth={1.5}
                style={{ cursor: "crosshair" }}
                onMouseDown={(e) =>
                  handleEndpointDragStart(selectedConnectorId!, "target", endpointHandles.target, e)
                }
              />
            </g>
          )}

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

        </g>
      </svg>
      </DisplayModeCtx.Provider>

      {/* Inline label editor overlay */}
      {editingLabel && (() => {
        const editingEl = data.elements.find(e => e.id === editingLabel.elementId);
        const isUseCase = editingEl?.type === 'use-case';
        const isPoolLane = editingEl?.type === 'pool' || editingEl?.type === 'lane';
        const hasTaskMarker = editingEl?.type === 'task' && !!editingEl?.taskType && editingEl?.taskType !== 'none';
        const commonChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          setEditingLabel(prev => prev ? { ...prev, value: e.target.value } : null);
        if (isUseCase) {
          return (
            <textarea
              autoFocus
              value={editingLabel.value}
              onFocus={(e) => { const t = e.target; setTimeout(() => { t.setSelectionRange(t.value.length, t.value.length); }, 0); }}
              onChange={commonChange as React.ChangeEventHandler<HTMLTextAreaElement>}
              onBlur={commitLabel}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (e.ctrlKey) return;
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
                fontSize: 12 * zoom,
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
                fontSize: 11 * zoom,
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
        return (
          <input
            autoFocus
            type="text"
            value={editingLabel.value}
            onFocus={(e) => { const t = e.target; setTimeout(() => { t.setSelectionRange(t.value.length, t.value.length); }, 0); }}
            onChange={commonChange as React.ChangeEventHandler<HTMLInputElement>}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitLabel();
              if (e.key === "Escape") setEditingLabel(null);
            }}
            style={{
              position: "absolute",
              left: editingLabel.x,
              top: editingLabel.y + (hasTaskMarker ? 20 * zoom : editingLabel.height / 2 - 12),
              width: editingLabel.width,
              height: 24,
              fontSize: 12 * zoom,
              textAlign: "center",
              background: "white",
              border: "2px solid #2563eb",
              borderRadius: 4,
              outline: "none",
              padding: "0 4px",
            }}
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
          : "Drag to pan · Scroll to zoom · Double-click label · Delete to remove · Drag element body to connect"}
        {" · "}
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}
