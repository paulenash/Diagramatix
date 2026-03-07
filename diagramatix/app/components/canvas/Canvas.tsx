"use client";

import { useRef, useState, useCallback } from "react";
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
import { ConnectorRenderer } from "./ConnectorRenderer";

const HEADER_H = 28;
const MIN_BOUNDARY_W = 100;
const MIN_BOUNDARY_H = HEADER_H + 40;

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
  onResizeElement: (id: string, width: number, height: number) => void;
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
  selectedElementId: string | null;
  selectedConnectorId: string | null;
  onSelectElement: (id: string | null) => void;
  onSelectConnector: (id: string | null) => void;
  pendingDragSymbol: SymbolType | null;
  defaultDirectionType: DirectionType;
  defaultRoutingType: RoutingType;
  onUpdateProperties?: (id: string, props: Record<string, unknown>) => void;
  onUpdateConnectorWaypoints?: (id: string, waypoints: Point[]) => void;
  onUpdateConnectorLabel?: (id: string, label?: string, offsetX?: number, offsetY?: number, width?: number) => void;
  onSplitConnector?: (symbolType: SymbolType, position: Point, connectorId: string, taskType?: BpmnTaskType, eventType?: EventType) => void;
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
  selectedElementId,
  selectedConnectorId,
  onSelectElement,
  onSelectConnector,
  pendingDragSymbol,
  defaultDirectionType,
  defaultRoutingType,
  onUpdateProperties,
  onUpdateConnectorWaypoints,
  onUpdateConnectorLabel,
  onSplitConnector,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [editingLabel, setEditingLabel] = useState<EditingLabel | null>(null);
  const [draggingConnector, setDraggingConnector] = useState<DraggingConnector | null>(null);
  const [draggingEndpoint, setDraggingEndpoint] = useState<DraggingEndpoint | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);

  const svgToWorld = useCallback(
    (svgX: number, svgY: number): Point => ({
      x: (svgX - pan.x) / zoom,
      y: (svgY - pan.y) / zoom,
    }),
    [pan, zoom]
  );

  const clientToWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = svgRef.current!.getBoundingClientRect();
      return svgToWorld(clientX - rect.left, clientY - rect.top);
    },
    [svgToWorld]
  );

  function findDropTarget(pos: Point, fromId: string, filter?: (el: DiagramElement) => boolean): DiagramElement | null {
    const MARGIN = 30;
    const matches: DiagramElement[] = [];
    for (const el of data.elements) {
      if (el.id === fromId) continue;
      if (el.type === "system-boundary") continue; // Process Group is not a connector target
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
    const nonContainer = matches.find(el => el.type !== "composite-state");
    return nonContainer ?? matches[0];
  }

  function handleConnectionPointDragStart(elementId: string, side: Side, worldPos: Point) {
    const drag: DraggingConnector = {
      fromId: elementId,
      fromSide: side,
      fromPos: worldPos,
      currentPos: worldPos,
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
        const targetSide = getClosestSide(pos, targetEl);
        const sourceEl = data.elements.find((e) => e.id === elementId);
        const actorLike = ["actor", "team"];
        const connType: ConnectorType =
          defaultRoutingType === "curvilinear"
            ? "interaction"
            : (sourceEl && actorLike.includes(sourceEl.type)) || actorLike.includes(targetEl.type)
              ? "association"
              : "sequence";
        onAddConnector(elementId, targetEl.id, connType, defaultDirectionType, defaultRoutingType, side, targetSide);
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

      // Check if dropped on the same element — reposition along its boundary
      const currentEl = data.elements.find((e) => e.id === fromId);
      if (currentEl &&
        pos.x >= currentEl.x && pos.x <= currentEl.x + currentEl.width &&
        pos.y >= currentEl.y && pos.y <= currentEl.y + currentEl.height) {
        const { side, offsetAlong } = pointToBoundaryOffset(pos, currentEl);
        onUpdateConnectorEndpoint(connectorId, endpoint, currentEl.id, side, offsetAlong);
        onSelectConnector(null);
      } else {
        // Dropped elsewhere — reconnect to a different element
        const epFilter = conn?.routingType === "direct"
          ? (el: DiagramElement) => el.type === "use-case"
          : undefined;
        const targetEl = findDropTarget(pos, fromId, epFilter);
        if (targetEl) {
          const newSide = getClosestSide(pos, targetEl);
          onUpdateConnectorEndpoint(connectorId, endpoint, targetEl.id, newSide, 0.5);
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

  function handleResizeDragStart(elementId: string, handle: ResizeHandle, e: React.MouseEvent) {
    e.stopPropagation();
    const el = data.elements.find((el) => el.id === elementId);
    if (!el) return;

    const isTaskLike = el.type === "task" || el.type === "subprocess";
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

      onResizeElement(elementId, width, height);
      const needsMoveX = handle.includes("w") || (isUseCase && (handle === "n" || handle === "s"));
      const needsMoveY = handle.includes("n");
      if (needsMoveX || needsMoveY) {
        onMoveElement(elementId, x, y);
      }
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
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
    onSelectElement(null);
    onSelectConnector(null);
    panStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };

    function onMouseMove(ev: MouseEvent) {
      if (!panStart.current) return;
      setPan({
        x: panStart.current.panX + ev.clientX - panStart.current.mouseX,
        y: panStart.current.panY + ev.clientY - panStart.current.mouseY,
      });
    }

    function onMouseUp() {
      panStart.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
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
    const isContainer = el.type === "system-boundary" || el.type === "composite-state";
    setEditingLabel({
      elementId: el.id,
      x: el.x * zoom + pan.x,
      y: el.y * zoom + pan.y,
      width: el.width * zoom,
      height: isContainer ? HEADER_H * zoom : el.height * zoom,
      value: el.label,
    });
  }

  function commitLabel() {
    if (!editingLabel) return;
    const el = data.elements.find((e) => e.id === editingLabel.elementId);
    if (el && el.type === 'use-case') {
      const { w, h } = computeUseCaseSize(editingLabel.value, el.width);
      if (w !== el.width || h !== el.height) {
        onResizeElement(el.id, w, h);
      }
    }
    onUpdateLabel(editingLabel.elementId, editingLabel.value);
    setEditingLabel(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const NUDGE = 5;
    if (selectedElementId && !editingLabel) {
      const el = data.elements.find((el) => el.id === selectedElementId);
      if (el) {
        if (e.key === "ArrowLeft")  { e.preventDefault(); onMoveElement(selectedElementId, el.x - NUDGE, el.y); return; }
        if (e.key === "ArrowRight") { e.preventDefault(); onMoveElement(selectedElementId, el.x + NUDGE, el.y); return; }
        if (e.key === "ArrowUp")    { e.preventDefault(); onMoveElement(selectedElementId, el.x, el.y - NUDGE); return; }
        if (e.key === "ArrowDown")  { e.preventDefault(); onMoveElement(selectedElementId, el.x, el.y + NUDGE); return; }
      }
    }
    if (e.key === "Escape") {
      setDraggingConnector(null);
      setDraggingEndpoint(null);
      setEditingLabel(null);
      setPendingDrop(null);
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (editingLabel) return;
      if (selectedElementId) onDeleteElement(selectedElementId);
      if (selectedConnectorId) onDeleteConnector(selectedConnectorId);
    }
  }

  const transform = `translate(${pan.x}, ${pan.y}) scale(${zoom})`;
  const isDraggingConnector = draggingConnector !== null;
  const isDraggingEndpoint = draggingEndpoint !== null;

  // Render containers first (behind everything), then connectors, then other elements
  const containers = data.elements.filter(
    (el) => el.type === "system-boundary" || el.type === "composite-state"
  );
  const nonContainers = data.elements.filter(
    (el) => el.type !== "system-boundary" && el.type !== "composite-state"
  );

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

  return (
    <div
      className="relative flex-1 overflow-hidden bg-gray-50"
      style={{
        backgroundImage: "radial-gradient(#d1d5db 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      <svg
        ref={svgRef}
        className="w-full h-full outline-none"
        tabIndex={0}
        onMouseDown={handleBackgroundMouseDown}
        onWheel={handleWheel}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onKeyDown={handleKeyDown}
        style={{ cursor: isDraggingConnector || isDraggingEndpoint ? "crosshair" : "default" }}
      >
        <g transform={transform}>
          {/* Containers render first (behind everything) */}
          {containers.map((el) => (
            <SymbolRenderer
              key={el.id}
              element={el}
              selected={el.id === selectedElementId}
              isDropTarget={false}
              isDisallowedTarget={false}
              onSelect={() => {
                onSelectElement(el.id);
                onSelectConnector(null);
              }}
              onMove={(x, y) => onMoveElement(el.id, x, y)}
              onDoubleClick={() => startEditingLabel(el)}
              onConnectionPointDragStart={(side, worldPos) =>
                handleConnectionPointDragStart(el.id, side, worldPos)
              }
              showConnectionPoints={el.id === selectedElementId || isDraggingConnector}
              onResizeDragStart={(handle, e) => handleResizeDragStart(el.id, handle, e)}
              svgToWorld={clientToWorld}
              onUpdateProperties={onUpdateProperties}
              onUpdateLabel={onUpdateLabel}
            />
          ))}

          {/* Connectors */}
          {data.connectors.map((conn) => (
            <ConnectorRenderer
              key={conn.id}
              connector={conn}
              selected={conn.id === selectedConnectorId}
              onSelect={() => {
                onSelectConnector(conn.id);
                onSelectElement(null);
              }}
              svgToWorld={clientToWorld}
              onUpdateWaypoints={onUpdateConnectorWaypoints}
              onUpdateLabel={onUpdateConnectorLabel
                ? (label, ox, oy, w) => onUpdateConnectorLabel(conn.id, label, ox, oy, w)
                : undefined}
            />
          ))}

          {/* Non-container elements */}
          {nonContainers.map((el) => (
            <SymbolRenderer
              key={el.id}
              element={el}
              selected={el.id === selectedElementId}
              isDropTarget={isDraggingConnector && el.id !== draggingConnector!.fromId}
              onSelect={() => {
                onSelectElement(el.id);
                onSelectConnector(null);
              }}
              onMove={(x, y) => onMoveElement(el.id, x, y)}
              onDoubleClick={() => startEditingLabel(el)}
              onConnectionPointDragStart={(side, worldPos) =>
                handleConnectionPointDragStart(el.id, side, worldPos)
              }
              showConnectionPoints={
                el.id === selectedElementId || isDraggingConnector
              }
              onResizeDragStart={
                (el.type === "task" || el.type === "subprocess")
                  ? (handle, e) => handleResizeDragStart(el.id, handle, e)
                  : undefined
              }
              svgToWorld={clientToWorld}
              onUpdateProperties={onUpdateProperties}
              onUpdateLabel={onUpdateLabel}
              shouldSnapBack={(x, y) => {
                const cx = x + el.width / 2;
                const cy = y + el.height / 2;
                return data.elements.some(
                  (b) =>
                    b.type === "system-boundary" &&
                    b.id !== el.id &&
                    el.type !== "use-case" &&
                    el.type !== "hourglass" &&
                    cx >= b.x && cx <= b.x + b.width &&
                    cy >= b.y && cy <= b.y + b.height
                );
              }}
            />
          ))}

          {/* Connector endpoint handles when a connector is selected */}
          {endpointHandles && (
            <>
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
            </>
          )}

          {/* Rubber-band line during connector drag */}
          {draggingConnector && (
            <line
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
            <line
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

        </g>
      </svg>

      {/* Inline label editor overlay */}
      {editingLabel && (() => {
        const editingEl = data.elements.find(e => e.id === editingLabel.elementId);
        const isUseCase = editingEl?.type === 'use-case';
        const commonChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          setEditingLabel(prev => prev ? { ...prev, value: e.target.value } : null);
        if (isUseCase) {
          return (
            <textarea
              autoFocus
              value={editingLabel.value}
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
        return (
          <input
            autoFocus
            type="text"
            value={editingLabel.value}
            onChange={commonChange as React.ChangeEventHandler<HTMLInputElement>}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitLabel();
              if (e.key === "Escape") setEditingLabel(null);
            }}
            style={{
              position: "absolute",
              left: editingLabel.x,
              top: editingLabel.y + editingLabel.height / 2 - 12,
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
      {pendingDrop && pendingDrop.symbolType === "task" && (
        <div
          style={{ position: "absolute", left: pendingDrop.containerX, top: pendingDrop.containerY, zIndex: 50 }}
          className="bg-white border border-gray-200 rounded shadow-lg py-1 min-w-[160px]"
        >
          <p className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
            Task Type
          </p>
          {TASK_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
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
      )}
      {/* Intermediate Event type picker */}
      {pendingDrop && pendingDrop.symbolType === "intermediate-event" && (
        <div
          style={{ position: "absolute", left: pendingDrop.containerX, top: pendingDrop.containerY, zIndex: 50 }}
          className="bg-white border border-gray-200 rounded shadow-lg py-1 min-w-[160px]"
        >
          <p className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
            Event Type
          </p>
          {INTERMEDIATE_EVENT_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
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
      )}

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
