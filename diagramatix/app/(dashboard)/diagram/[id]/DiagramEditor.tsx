"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type {
  ConnectorType,
  DiagramData,
  DiagramType,
  DirectionType,
  Point,
  RoutingType,
  Side,
  SymbolType,
  TemplateData,
} from "@/app/lib/diagram/types";
import { BW_SYMBOL_COLORS, DEFAULT_SYMBOL_COLORS, type SymbolColorConfig } from "@/app/lib/diagram/colors";
import type { DisplayMode } from "@/app/lib/diagram/displayMode";
import { DiagramColorModal } from "./DiagramColorModal";
import { TemplateNameModal } from "./TemplateNameModal";
import { useDiagram } from "@/app/hooks/useDiagram";
import { Canvas } from "@/app/components/canvas/Canvas";
import { Palette } from "@/app/components/canvas/Palette";
import { PropertiesPanel } from "@/app/components/canvas/PropertiesPanel";
import { captureTemplate, instantiateTemplate } from "@/app/lib/diagram/templates";

interface Props {
  diagramId: string;
  diagramName: string;
  diagramType: DiagramType;
  initialData: DiagramData;
  projectId: string | null;
  initialDiagramColorConfig?: SymbolColorConfig;
  initialDisplayMode?: DisplayMode;
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
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getDiagramBounds(data: DiagramData, padding = 20) {
  if (data.elements.length === 0) {
    return { x: 0, y: 0, width: 200, height: 200 };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const el of data.elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }

  for (const conn of data.connectors) {
    for (const wp of conn.waypoints) {
      minX = Math.min(minX, wp.x);
      minY = Math.min(minY, wp.y);
      maxX = Math.max(maxX, wp.x);
      maxY = Math.max(maxY, wp.y);
    }
  }

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

async function exportPdf(svgEl: SVGSVGElement, name: string, data: DiagramData, scale = 1) {
  const { jsPDF } = await import("jspdf");
  await import("svg2pdf.js");

  const bounds = getDiagramBounds(data);

  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute("tabindex");
  clone.removeAttribute("class");
  clone.removeAttribute("data-canvas");
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  // Set viewBox to content bounds, stripping pan/zoom
  clone.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
  clone.setAttribute("width", String(bounds.width));
  clone.setAttribute("height", String(bounds.height));

  // Strip unsupported SVG filters — svg2pdf.js silently skips groups with
  // feTurbulence/feDisplacementMap, so remove all filter refs and the sketchy defs
  clone.querySelectorAll("[filter]").forEach((el) => el.removeAttribute("filter"));
  const sketchyDefs = clone.querySelector("#sketchy");
  if (sketchyDefs) sketchyDefs.closest("defs")?.remove();

  // Hoist nested <defs> (connector markers) to SVG root so refs resolve after transform removal
  const topGroup = clone.querySelector(":scope > g[transform]");
  if (topGroup) {
    topGroup.querySelectorAll("defs").forEach((d) => {
      clone.insertBefore(d, topGroup);
    });
    topGroup.removeAttribute("transform");
  }

  // Remove interactive-only elements (selection handles, drag lines, etc.)
  clone.querySelectorAll("[data-interactive]").forEach((el) => el.remove());

  // Insert clone off-screen so svg2pdf.js can compute styles via getComputedStyle/getBBox
  clone.style.position = "absolute";
  clone.style.left = "-9999px";
  clone.style.top = "-9999px";
  document.body.appendChild(clone);

  const scaledW = bounds.width * scale;
  const scaledH = bounds.height * scale;
  const landscape = scaledW > scaledH;
  const doc = new jsPDF({
    orientation: landscape ? "landscape" : "portrait",
    unit: "pt",
    format: [scaledW, scaledH],
  });

  try {
    await doc.svg(clone, { x: 0, y: 0, width: scaledW, height: scaledH });
    doc.save(`${name}.pdf`);
  } finally {
    document.body.removeChild(clone);
  }
}

export function DiagramEditor({
  diagramId,
  diagramName,
  diagramType,
  initialData,
  projectId,
  initialDiagramColorConfig,
  initialDisplayMode,
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
    applyTemplate,
    correctAllConnectors,
    addLane,
    moveLaneBoundary,
    laneBoundaryMoveEnd,
    moveElements,
    elementsMoveEnd,
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

  const [pdfScale, setPdfScale] = useState(100);
  const [selectedElementIds, setSelectedElementIds] = useState<Set<string>>(new Set());
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [pendingDragSymbol, setPendingDragSymbol] = useState<SymbolType | null>(null);
  const [projectColorConfig, setProjectColorConfig] = useState<SymbolColorConfig | undefined>(undefined);
  const [diagramColorConfig, setDiagramColorConfig] = useState<SymbolColorConfig>(initialDiagramColorConfig ?? {});
  const [displayMode, setDisplayMode] = useState<DisplayMode>(initialDisplayMode ?? "normal");
  const [showDiagramMaintenance, setShowDiagramMaintenance] = useState(false);

  // Template state (BPMN only)
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [templateMode, setTemplateMode] = useState<"idle" | "capturing">("idle");
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
  const [showTemplateNameModal, setShowTemplateNameModal] = useState(false);
  const [pendingTemplateData, setPendingTemplateData] = useState<TemplateData | null>(null);
  const getViewportCenterRef = useRef<(() => Point) | null>(null);
  const templateDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((p) => { if (p?.colorConfig) setProjectColorConfig(p.colorConfig as SymbolColorConfig); })
      .catch(() => {/* fall back to defaults */});
  }, [projectId]);

  useEffect(() => {
    fetch(`/api/diagrams/${diagramId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.colorConfig && typeof d.colorConfig === "object" && !Array.isArray(d.colorConfig)) {
          setDiagramColorConfig(d.colorConfig as SymbolColorConfig);
        }
        if (d?.displayMode) {
          setDisplayMode(d.displayMode as DisplayMode);
        }
      })
      .catch(() => {/* keep initial value */});
  }, [diagramId]);

  // Fetch templates on mount (BPMN only)
  useEffect(() => {
    if (diagramType !== "bpmn") return;
    fetch("/api/templates")
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/templates failed: ${r.status}`);
        return r.json();
      })
      .then((list: { id: string; name: string; diagramType: string }[]) =>
        setTemplates(list.filter((t) => t.diagramType === "bpmn"))
      )
      .catch((err) => console.error("Failed to fetch templates:", err));
  }, [diagramType]);

  // Close template dropdown on outside click
  useEffect(() => {
    if (!templateDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (templateDropdownRef.current && !templateDropdownRef.current.contains(e.target as Node)) {
        setTemplateDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [templateDropdownOpen]);

  const effectiveColorConfig: SymbolColorConfig = displayMode === "hand-drawn"
    ? BW_SYMBOL_COLORS
    : { ...projectColorConfig, ...diagramColorConfig };

  const selectedElement = selectedElementIds.size === 1
    ? data.elements.find((el) => selectedElementIds.has(el.id)) ?? null
    : null;
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

  function handleToggleDisplayMode(mode?: DisplayMode) {
    const newMode: DisplayMode = mode ?? (displayMode === "hand-drawn" ? "normal" : "hand-drawn");
    setDisplayMode(newMode);
    fetch(`/api/diagrams/${diagramId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayMode: newMode }),
    }).catch(() => {/* best-effort persist */});
  }

  function handleExport() {
    const svgEl = document.querySelector<SVGSVGElement>("svg[data-canvas]");
    if (svgEl) exportSvg(svgEl, diagramName);
  }

  async function handleExportPdf() {
    const svgEl = document.querySelector<SVGSVGElement>("svg[data-canvas]");
    if (svgEl) await exportPdf(svgEl, diagramName, data, pdfScale / 100);
  }

  function handleSaveAsTemplate() {
    const captured = captureTemplate(data.elements, data.connectors, selectedElementIds);
    if (captured.elements.length === 0) return;
    setPendingTemplateData(captured);
    setShowTemplateNameModal(true);
  }

  async function handleConfirmTemplateName(name: string) {
    if (!pendingTemplateData) return;
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, diagramType: "bpmn", data: pendingTemplateData }),
      });
      if (!res.ok) {
        console.error("Failed to save template:", res.status, await res.text());
      } else {
        const created = await res.json();
        setTemplates((prev) => [{ id: created.id, name: created.name }, ...prev]);
      }
    } catch (err) {
      console.error("Failed to save template:", err);
    }
    setPendingTemplateData(null);
    setShowTemplateNameModal(false);
    setTemplateMode("idle");
  }

  async function handleApplyTemplate(templateId: string) {
    setTemplateDropdownOpen(false);
    try {
      const res = await fetch(`/api/templates/${templateId}`);
      const tmpl = await res.json();
      const templateData = tmpl.data as TemplateData;
      const center = getViewportCenterRef.current?.() ?? { x: 200, y: 200 };
      const { elements, connectors, newIds } = instantiateTemplate(templateData, center.x, center.y);
      applyTemplate(elements, connectors);
      setSelectedElementIds(newIds);
      setSelectedConnectorId(null);
    } catch {
      /* best-effort */
    }
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

        {diagramType === "bpmn" && templateMode === "idle" && (
          <div className="relative" ref={templateDropdownRef}>
            <button
              onClick={() => setTemplateDropdownOpen((prev) => !prev)}
              className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Templates ▾
            </button>
            {templateDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded shadow-lg z-50">
                <button
                  onClick={() => { setTemplateMode("capturing"); setTemplateDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 font-medium"
                >
                  + Create New Template
                </button>
                {templates.length > 0 && <div className="border-t border-gray-100" />}
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleApplyTemplate(t.id)}
                    className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {diagramType === "bpmn" && templateMode === "capturing" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-blue-600">Select elements for template</span>
            <button
              onClick={handleSaveAsTemplate}
              disabled={selectedElementIds.size === 0}
              className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save as Template
            </button>
            <button
              onClick={() => setTemplateMode("idle")}
              className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        )}

        <button
          onClick={() => setShowDiagramMaintenance(true)}
          className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
        >
          Diagram Maintenance
        </button>

        <button
          onClick={handleExport}
          className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
        >
          Export SVG
        </button>
        <select
          value={pdfScale}
          onChange={(e) => setPdfScale(Number(e.target.value))}
          className="px-2 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
        >
          <option value={100}>100%</option>
          <option value={75}>75%</option>
          <option value={50}>50%</option>
          <option value={30}>30%</option>
        </select>
        <button
          onClick={handleExportPdf}
          className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
        >
          Export PDF
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
            setSelectedElementIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
          }}
          onAddConnector={handleAddConnector}
          onDeleteConnector={(id) => {
            deleteConnector(id);
            setSelectedConnectorId(null);
          }}
          onUpdateConnectorEndpoint={updateConnectorEndpoint}
          selectedElementIds={selectedElementIds}
          selectedConnectorId={selectedConnectorId}
          onSetSelectedElements={setSelectedElementIds}
          onSelectConnector={setSelectedConnectorId}
          onMoveElements={moveElements}
          onElementsMoveEnd={elementsMoveEnd}
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
          displayMode={displayMode}
          getViewportCenterRef={getViewportCenterRef}
        />

        <PropertiesPanel
          element={selectedElement}
          connector={selectedConnector}
          diagramType={diagramType}
          multiSelectionCount={selectedElementIds.size}
          onUpdateLabel={updateLabel}
          onUpdateProperties={updateProperties}
          onUpdateConnectorDirection={updateConnectorDirection}
          onUpdateConnectorLabel={(id, label) => updateConnectorLabel(id, label)}
          onDeleteElement={(id) => {
            deleteElement(id);
            setSelectedElementIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
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

      {showTemplateNameModal && (
        <TemplateNameModal
          onSave={handleConfirmTemplateName}
          onClose={() => { setShowTemplateNameModal(false); setPendingTemplateData(null); }}
        />
      )}

      {showDiagramMaintenance && (
        <DiagramColorModal
          diagramId={diagramId}
          diagramType={diagramType}
          projectColors={{ ...DEFAULT_SYMBOL_COLORS, ...projectColorConfig }}
          initialColorConfig={diagramColorConfig}
          displayMode={displayMode}
          onDisplayModeChange={handleToggleDisplayMode}
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
