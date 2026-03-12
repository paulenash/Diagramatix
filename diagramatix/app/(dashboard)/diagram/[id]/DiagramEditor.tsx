"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type {
  ConnectorType,
  DiagramData,
  DiagramType,
  DirectionType,
  RoutingType,
  Side,
  SymbolType,
} from "@/app/lib/diagram/types";
import { DEFAULT_SYMBOL_COLORS, type SymbolColorConfig } from "@/app/lib/diagram/colors";
import { DiagramColorModal } from "./DiagramColorModal";
import { useDiagram } from "@/app/hooks/useDiagram";
import { Canvas } from "@/app/components/canvas/Canvas";
import { Palette } from "@/app/components/canvas/Palette";
import { PropertiesPanel } from "@/app/components/canvas/PropertiesPanel";

interface Props {
  diagramId: string;
  diagramName: string;
  diagramType: DiagramType;
  initialData: DiagramData;
  projectId: string | null;
  initialDiagramColorConfig?: SymbolColorConfig;
}

function useAutoSave(
  diagramId: string,
  data: DiagramData,
  delay = 1500
) {
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const lastSaved = useRef<string>(JSON.stringify(data));

  useEffect(() => {
    const current = JSON.stringify(data);
    if (current === lastSaved.current) return;

    setSaveStatus("unsaved");

    if (saveTimeout.current) clearTimeout(saveTimeout.current);

    saveTimeout.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await fetch(`/api/diagrams/${diagramId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data }),
        });
        lastSaved.current = current;
        setSaveStatus("saved");
      } catch {
        setSaveStatus("unsaved");
      }
    }, delay);

    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [data, diagramId, delay]);

  return saveStatus;
}

function exportSvg(svgEl: SVGSVGElement, name: string) {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute("tabindex");
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(clone);
  const blob = new Blob([svgStr], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

export function DiagramEditor({
  diagramId,
  diagramName,
  diagramType,
  initialData,
  projectId,
  initialDiagramColorConfig,
}: Props) {
  const router = useRouter();

  const {
    data,
    addElement,
    moveElement,
    resizeElement,
    resizeElementEnd,
    updateLabel,
    updateProperties,
    deleteElement,
    addConnector,
    deleteConnector,
    updateConnectorDirection,
    updateConnectorEndpoint,
    updateConnectorWaypoints,
    updateCurveHandles,
    connectorWaypointDragEnd,
    updateConnectorLabel,
    elementMoveEnd,
    splitConnector,
    correctAllConnectors,
    addLane,
    moveLaneBoundary,
    laneBoundaryMoveEnd,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useDiagram(initialData);

  const saveStatus = useAutoSave(diagramId, data);

  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [pendingDragSymbol, setPendingDragSymbol] = useState<SymbolType | null>(null);
  const [projectColorConfig, setProjectColorConfig] = useState<SymbolColorConfig | undefined>(undefined);
  const [diagramColorConfig, setDiagramColorConfig] = useState<SymbolColorConfig>(initialDiagramColorConfig ?? {});
  const [showDiagramMaintenance, setShowDiagramMaintenance] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((p) => { if (p?.colorConfig) setProjectColorConfig(p.colorConfig as SymbolColorConfig); })
      .catch(() => {/* fall back to defaults */});
  }, [projectId]);

  const effectiveColorConfig: SymbolColorConfig = {
    ...projectColorConfig,
    ...diagramColorConfig,
  };

  const selectedElement = data.elements.find((el) => el.id === selectedElementId) ?? null;
  const selectedConnector = data.connectors.find((c) => c.id === selectedConnectorId) ?? null;

  const defaultDirectionType: DirectionType =
    diagramType === "process-context" ? "non-directed" :
    diagramType === "state-machine"   ? "open-directed" :
    "directed";

  const defaultRoutingType: RoutingType =
    diagramType === "process-context" ? "direct" :
    diagramType === "state-machine"   ? "curvilinear" :
    "rectilinear";

  const poolHasContent = selectedElement?.type === "pool"
    ? data.elements.some((e) => e.parentId === selectedElement.id)
    : false;

  const laneHasContent = selectedElement?.type === "lane"
    ? data.elements.some((e) => e.parentId === selectedElement.id)
    : false;

  const EVENT_TYPES_SET = new Set(["start-event", "intermediate-event", "end-event"]);
  const hasMessageBpmnConnection =
    selectedElement !== null &&
    EVENT_TYPES_SET.has(selectedElement.type) &&
    data.connectors.some(
      (c) => c.type === "messageBPMN" &&
        (c.sourceId === selectedElement.id || c.targetId === selectedElement.id)
    );

  const hasSystemBoundary = data.elements.some((e) => e.type === "system-boundary");
  const disabledSymbols: SymbolType[] = hasSystemBoundary ? ["system-boundary"] : [];

  const handleAddConnector = useCallback(
    (
      sourceId: string,
      targetId: string,
      type: ConnectorType,
      directionType: DirectionType,
      routingType: RoutingType,
      sourceSide: Side,
      targetSide: Side
    ) => {
      addConnector(sourceId, targetId, type, directionType, routingType, sourceSide, targetSide);
    },
    [addConnector]
  );

  function handleExport() {
    const svgEl = document.querySelector("svg");
    if (svgEl) exportSvg(svgEl as SVGSVGElement, diagramName);
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Top bar */}
      <header className="h-12 border-b border-gray-200 flex items-center px-4 gap-4 flex-shrink-0">
        <button
          onClick={() =>
            router.push(projectId ? `/dashboard/projects/${projectId}` : "/dashboard")
          }
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          ← {projectId ? "Project" : "Dashboard"}
        </button>

        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-blue-600 rounded flex items-center justify-center">
            <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
              <rect x={0.5} y={0.5} width={3.5} height={3.5} rx={0.5} fill="white" />
              <rect x={6} y={0.5} width={3.5} height={3.5} rx={0.5} fill="white" />
              <rect x={0.5} y={6} width={3.5} height={3.5} rx={0.5} fill="white" />
              <rect x={6} y={6} width={3.5} height={3.5} rx={0.5} fill="white" />
            </svg>
          </div>
          <span className="font-semibold text-gray-900 text-sm">{diagramName}</span>
          <span className="text-xs text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded">
            {diagramType}
          </span>
        </div>

        <div className="flex-1" />

        <span className="text-xs text-gray-400">
          {saveStatus === "saving" && "Saving…"}
          {saveStatus === "saved" && "Saved"}
          {saveStatus === "unsaved" && "Unsaved changes"}
        </span>

        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 5h6a4 4 0 0 1 0 8H5" />
              <path d="M2 5L5 2M2 5l3 3" />
            </svg>
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5H6a4 4 0 0 0 0 8h3" />
              <path d="M12 5L9 2m3 3-3 3" />
            </svg>
          </button>
        </div>

        <button
          onClick={() => setShowDiagramMaintenance(true)}
          className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
        >
          Maintenance
        </button>

        <button
          onClick={handleExport}
          className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
        >
          Export SVG
        </button>
      </header>

      {/* Main editor area */}
      <div className="flex flex-1 overflow-hidden">
        <Palette
          diagramType={diagramType}
          onDragStart={(type) => setPendingDragSymbol(type)}
          disabledSymbols={disabledSymbols}
          colorConfig={effectiveColorConfig}
        />

        <Canvas
          data={data}
          diagramType={diagramType}
          onAddElement={addElement}
          onMoveElement={moveElement}
          onResizeElement={resizeElement}
          onUpdateLabel={updateLabel}
          onDeleteElement={(id) => {
            deleteElement(id);
            setSelectedElementId(null);
          }}
          onAddConnector={handleAddConnector}
          onDeleteConnector={(id) => {
            deleteConnector(id);
            setSelectedConnectorId(null);
          }}
          onUpdateConnectorEndpoint={updateConnectorEndpoint}
          selectedElementId={selectedElementId}
          selectedConnectorId={selectedConnectorId}
          onSelectElement={setSelectedElementId}
          onSelectConnector={setSelectedConnectorId}
          pendingDragSymbol={pendingDragSymbol}
          defaultDirectionType={defaultDirectionType}
          defaultRoutingType={defaultRoutingType}
          onUpdateProperties={updateProperties}
          onUpdateConnectorWaypoints={updateConnectorWaypoints}
          onUpdateConnectorLabel={updateConnectorLabel}
          onSplitConnector={splitConnector}
          onElementMoveEnd={elementMoveEnd}
          onMoveLaneBoundary={moveLaneBoundary}
          onResizeElementEnd={resizeElementEnd}
          onLaneBoundaryMoveEnd={laneBoundaryMoveEnd}
          onConnectorWaypointDragEnd={connectorWaypointDragEnd}
          onUpdateCurveHandles={updateCurveHandles}
          colorConfig={effectiveColorConfig}
        />

        <PropertiesPanel
          element={selectedElement}
          connector={selectedConnector}
          diagramType={diagramType}
          onUpdateLabel={updateLabel}
          onUpdateProperties={updateProperties}
          onUpdateConnectorDirection={updateConnectorDirection}
          onUpdateConnectorLabel={(id, label) => updateConnectorLabel(id, label)}
          onDeleteElement={(id) => {
            deleteElement(id);
            setSelectedElementId(null);
          }}
          onDeleteConnector={(id) => {
            deleteConnector(id);
            setSelectedConnectorId(null);
          }}
          onAddLane={addLane}
          poolHasContent={poolHasContent}
          laneHasContent={laneHasContent}
          hasMessageBpmnConnection={hasMessageBpmnConnection}
        />
      </div>

      {showDiagramMaintenance && (
        <DiagramColorModal
          diagramId={diagramId}
          projectColors={{ ...DEFAULT_SYMBOL_COLORS, ...projectColorConfig }}
          initialColorConfig={diagramColorConfig}
          onClose={() => setShowDiagramMaintenance(false)}
          onSaved={(config) => {
            setDiagramColorConfig(config);
            setShowDiagramMaintenance(false);
          }}
        />
      )}
    </div>
  );
}
