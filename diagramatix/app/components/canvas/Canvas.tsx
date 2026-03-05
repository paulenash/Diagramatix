"use client";

import { useRef, useState, useCallback } from "react";
import type {
  ConnectorType,
  DiagramData,
  DiagramElement,
  Point,
  SymbolType,
} from "@/app/lib/diagram/types";
import { SymbolRenderer } from "./SymbolRenderer";
import { ConnectorRenderer } from "./ConnectorRenderer";

interface Props {
  data: DiagramData;
  onAddElement: (type: SymbolType, position: Point) => void;
  onMoveElement: (id: string, x: number, y: number) => void;
  onUpdateLabel: (id: string, label: string) => void;
  onDeleteElement: (id: string) => void;
  onAddConnector: (sourceId: string, targetId: string, type: ConnectorType) => void;
  onDeleteConnector: (id: string) => void;
  selectedElementId: string | null;
  selectedConnectorId: string | null;
  onSelectElement: (id: string | null) => void;
  onSelectConnector: (id: string | null) => void;
  pendingDragSymbol: SymbolType | null;
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
  fromPos: Point;    // world coords — the connection point where drag started
  currentPos: Point; // world coords — tracks the mouse
}

export function Canvas({
  data,
  onAddElement,
  onMoveElement,
  onUpdateLabel,
  onDeleteElement,
  onAddConnector,
  onDeleteConnector,
  selectedElementId,
  selectedConnectorId,
  onSelectElement,
  onSelectConnector,
  pendingDragSymbol,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Pan/zoom state
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  // Inline label editing
  const [editingLabel, setEditingLabel] = useState<EditingLabel | null>(null);

  // Connector drag state
  const [draggingConnector, setDraggingConnector] = useState<DraggingConnector | null>(null);

  const svgToWorld = useCallback(
    (svgX: number, svgY: number): Point => ({
      x: (svgX - pan.x) / zoom,
      y: (svgY - pan.y) / zoom,
    }),
    [pan, zoom]
  );

  function clientToWorld(clientX: number, clientY: number): Point {
    const rect = svgRef.current!.getBoundingClientRect();
    return svgToWorld(clientX - rect.left, clientY - rect.top);
  }

  // ---- Hit test: find which element the mouse is over (excluding source) ----
  function findDropTarget(pos: Point, fromId: string): string | null {
    const MARGIN = 30; // world units of tolerance around the element bounds
    for (const el of data.elements) {
      if (el.id === fromId) continue;
      if (
        pos.x >= el.x - MARGIN &&
        pos.x <= el.x + el.width + MARGIN &&
        pos.y >= el.y - MARGIN &&
        pos.y <= el.y + el.height + MARGIN
      ) {
        return el.id;
      }
    }
    return null;
  }

  // ---- Connection point drag start ----
  function handleConnectionPointDragStart(elementId: string, worldPos: Point) {
    const drag: DraggingConnector = {
      fromId: elementId,
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
      const targetId = findDropTarget(pos, elementId);
      if (targetId) {
        onAddConnector(elementId, targetId, "sequence");
      }
      setDraggingConnector(null);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  // ---- Pan handling ----
  const panStart = useRef<{ mouseX: number; mouseY: number; panX: number; panY: number } | null>(null);

  function handleBackgroundMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
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

  // ---- Zoom ----
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

  // ---- Drop from palette ----
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!pendingDragSymbol) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const worldPos = svgToWorld(e.clientX - rect.left, e.clientY - rect.top);
    onAddElement(pendingDragSymbol, worldPos);
  }

  // ---- Inline label editing ----
  function startEditingLabel(el: DiagramElement) {
    setEditingLabel({
      elementId: el.id,
      x: el.x * zoom + pan.x,
      y: el.y * zoom + pan.y,
      width: el.width * zoom,
      height: el.height * zoom,
      value: el.label,
    });
  }

  function commitLabel() {
    if (!editingLabel) return;
    onUpdateLabel(editingLabel.elementId, editingLabel.value);
    setEditingLabel(null);
  }

  // ---- Keyboard ----
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setDraggingConnector(null);
      setEditingLabel(null);
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (editingLabel) return;
      if (selectedElementId) onDeleteElement(selectedElementId);
      if (selectedConnectorId) onDeleteConnector(selectedConnectorId);
    }
  }

  const transform = `translate(${pan.x}, ${pan.y}) scale(${zoom})`;
  const isDraggingConnector = draggingConnector !== null;

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
        style={{ cursor: isDraggingConnector ? "crosshair" : "default" }}
      >
        <g transform={transform}>
          {data.connectors.map((conn) => (
            <ConnectorRenderer
              key={conn.id}
              connector={conn}
              selected={conn.id === selectedConnectorId}
              onSelect={() => {
                onSelectConnector(conn.id);
                onSelectElement(null);
              }}
            />
          ))}

          {data.elements.map((el) => (
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
              onConnectionPointDragStart={(worldPos) =>
                handleConnectionPointDragStart(el.id, worldPos)
              }
              showConnectionPoints={
                el.id === selectedElementId ||
                isDraggingConnector
              }
            />
          ))}

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
        </g>
      </svg>

      {/* Inline label editor overlay */}
      {editingLabel && (
        <input
          autoFocus
          type="text"
          value={editingLabel.value}
          onChange={(e) =>
            setEditingLabel((prev) =>
              prev ? { ...prev, value: e.target.value } : null
            )
          }
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
      )}

      {/* Status bar */}
      <div className="absolute bottom-2 left-2 text-xs text-gray-400 bg-white/80 px-2 py-1 rounded">
        {isDraggingConnector
          ? "Release over an element to connect · Esc to cancel"
          : "Drag to pan · Scroll to zoom · Double-click label · Delete to remove · Drag connection point to connect"}
        {" · "}
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}
