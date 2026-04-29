"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  SCHEMA_VERSION,
  type ConnectorType,
  type DiagramData,
  type DiagramType,
  type DirectionType,
  type Point,
  type RoutingType,
  type Side,
  type SymbolType,
  type TemplateData,
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
import { ImpersonationBanner } from "@/app/components/ImpersonationBanner";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { InfoDialog } from "@/app/components/InfoDialog";
import { AiPanel } from "./AiPanel";
import { PlanPanel } from "./PlanPanel";
import { HistoryPanel } from "./HistoryPanel";

interface Props {
  diagramId: string;
  diagramName: string;
  diagramType: DiagramType;
  initialData: DiagramData;
  projectId: string | null;
  initialDiagramColorConfig?: SymbolColorConfig;
  initialDisplayMode?: DisplayMode;
  userEmail?: string;
  createdAt?: string;
  updatedAt?: string;
  readOnly?: boolean;
  viewingAsName?: string;
  viewingAsEmail?: string;
  version?: number;
}

function useAutoSave(
  diagramId: string,
  data: DiagramData,
  _delay = 1500,
  disabled = false
) {
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const lastSaved = useRef<string>(JSON.stringify(data));

  // Track unsaved changes (no auto-save timer)
  useEffect(() => {
    if (disabled) return;
    const current = JSON.stringify(data);
    if (current !== lastSaved.current) {
      setSaveStatus("unsaved");
    }
  }, [data, disabled]);

  const saveNow = useCallback(async () => {
    const current = JSON.stringify(data);
    if (current === lastSaved.current) return;
    setSaveStatus("saving");
    try {
      await fetch(`/api/diagrams/${diagramId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });
      lastSaved.current = current;
      setLastSavedAt(new Date().toISOString());
      setSaveStatus("saved");
    } catch {
      setSaveStatus("unsaved");
    }
  }, [data, diagramId]);

  return { saveStatus, lastSavedAt, saveNow };
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

  // Reserve space for the title header above the diagram
  const tfs = data.titleFontSize ?? 14;
  const lineH = Math.round(tfs * 1.15);
  const title = data.title;
  const hasVersion = !!title?.version;
  const hasAuthors = !!title?.authors;
  const subLineCount = (hasVersion || hasAuthors ? 1 : 0) + 1; // status line always, version/authors optional
  const titleH = (1 + subLineCount) * lineH + 16;
  const titlePad = 30; // extra padding above the title text
  // Expand bounds upward to include the title + padding
  bounds.y -= (titleH + titlePad);
  bounds.height += (titleH + titlePad);

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

  // Inject PDF title at the top of the diagram (always shown in PDF)
  {
    const origBounds = getDiagramBounds(data);
    const els = data.elements;
    let minX2 = Infinity, maxX2 = -Infinity;
    for (const el of els) { if (el.x < minX2) minX2 = el.x; if (el.x + el.width > maxX2) maxX2 = el.x + el.width; }
    const cx = els.length > 0 ? (minX2 + maxX2) / 2 : bounds.x + bounds.width / 2;
    const titleTopY = origBounds.y - titleH - 20 + 8;
    const subFs = Math.round(tfs * 0.79);
    const statusLabel = (title?.status ?? "draft").charAt(0).toUpperCase() + (title?.status ?? "draft").slice(1);

    const ns = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(ns, "g");
    g.setAttribute("data-pdf-title", "true");

    // Line 1: Diagram name (bold)
    const t1 = document.createElementNS(ns, "text");
    t1.setAttribute("text-anchor", "middle");
    t1.setAttribute("x", String(cx));
    t1.setAttribute("y", String(titleTopY + lineH * 0.85));
    t1.setAttribute("font-size", String(tfs));
    t1.setAttribute("font-weight", "bold");
    t1.setAttribute("fill", "#1f2937");
    t1.textContent = name || "Untitled";
    g.appendChild(t1);

    // Line 2: Version + Authors (if any)
    let lineIdx = 1;
    const line2Parts: string[] = [];
    if (title?.version) line2Parts.push(`Version ${title.version}`);
    if (title?.authors) line2Parts.push(`Author/s: ${title.authors}`);
    if (line2Parts.length > 0) {
      const t2 = document.createElementNS(ns, "text");
      t2.setAttribute("text-anchor", "middle");
      t2.setAttribute("x", String(cx));
      t2.setAttribute("y", String(titleTopY + lineIdx * lineH + lineH * 0.85));
      t2.setAttribute("font-size", String(subFs));
      t2.setAttribute("fill", "#6b7280");
      t2.textContent = line2Parts.join("    ");
      g.appendChild(t2);
      lineIdx++;
    }

    // Line 3: Status
    const t3 = document.createElementNS(ns, "text");
    t3.setAttribute("text-anchor", "middle");
    t3.setAttribute("x", String(cx));
    t3.setAttribute("y", String(titleTopY + lineIdx * lineH + lineH * 0.85));
    t3.setAttribute("font-size", String(subFs));
    t3.setAttribute("fill", "#6b7280");
    t3.textContent = `Status: ${statusLabel}`;
    g.appendChild(t3);

    // Remove any existing canvas title from clone to avoid duplication
    clone.querySelectorAll("[data-title-block]").forEach((el) => el.remove());
    clone.appendChild(g);
  }

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
  userEmail,
  createdAt,
  updatedAt,
  readOnly,
  viewingAsName,
  viewingAsEmail,
  version,
}: Props) {
  const router = useRouter();

  // --- Subprocess drill-down navigation stack (sessionStorage) ---
  const STACK_KEY = "dgx_drill_stack";

  function getDrillStack(): { id: string; name: string }[] {
    try {
      const raw = sessionStorage.getItem(STACK_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  // The parent diagram (top of stack) — if we got here via drill-down
  const [parentDiagram, setParentDiagram] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    const stack = getDrillStack();
    const top = stack.length > 0 ? stack[stack.length - 1] : null;
    setParentDiagram(top);
  }, []);

  // Sibling diagrams in the same project (for subprocess linking)
  const [siblingDiagrams, setSiblingDiagrams] = useState<{ id: string; name: string; type: string }[]>([]);
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.diagrams) {
          setSiblingDiagrams(
            (data.diagrams as { id: string; name: string; type: string }[])
              .filter(d => d.id !== diagramId)
          );
        }
      })
      .catch(() => {});
  }, [projectId, diagramId]);

  // Ref to saveNow so navigation callbacks can call it without stale closures
  const saveNowRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Ref for save status — populated after useAutoSave runs (below)
  const saveStatusRef = useRef<"saved" | "saving" | "unsaved">("saved");

  // Diagramatix-styled unsaved-changes dialog. Three outcomes: save+leave,
  // discard+leave, cancel (stay). Opened via showUnsavedDialog, resolved
  // when the user clicks a button. Replaces the window.confirm pattern that
  // never actually saved reliably.
  const [unsavedDialog, setUnsavedDialog] = useState<null | { resolve: (choice: "save" | "discard" | "cancel") => void }>(null);

  // Save As dialog — clone the current diagram (data + colour/display config)
  // into the same project under a new name, then navigate to it.
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  const [saveAsBusy, setSaveAsBusy] = useState(false);
  const [saveAsError, setSaveAsError] = useState<string | null>(null);
  async function handleSaveAs() {
    if (!saveAsName.trim() || saveAsBusy) return;
    setSaveAsBusy(true);
    setSaveAsError(null);
    try {
      const res = await fetch("/api/diagrams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveAsName.trim(),
          type: diagramType,
          projectId: projectId ?? undefined,
          data,
          colorConfig: diagramColorConfig,
          displayMode,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        setSaveAsError(err.error ?? "Save As failed");
        return;
      }
      const created = await res.json();
      setShowSaveAs(false);
      router.push(`/diagram/${created.id}`);
    } catch (err) {
      setSaveAsError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaveAsBusy(false);
    }
  }
  async function confirmSaveBeforeLeave(): Promise<"proceed" | "cancel"> {
    if (saveStatusRef.current !== "unsaved") return "proceed";
    const choice = await new Promise<"save" | "discard" | "cancel">(resolve => {
      setUnsavedDialog({ resolve });
    });
    setUnsavedDialog(null);
    if (choice === "cancel") return "cancel";
    if (choice === "save") await saveNowRef.current();
    return "proceed";
  }

  const handleDrillIntoSubprocess = useCallback(async (linkedDiagramId: string) => {
    if ((await confirmSaveBeforeLeave()) === "cancel") return;
    const stack = getDrillStack();
    stack.push({ id: diagramId, name: diagramName });
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack));
    router.push(`/diagram/${linkedDiagramId}`);
  }, [router, diagramId, diagramName]);

  const handleDrillBack = useCallback(async () => {
    if ((await confirmSaveBeforeLeave()) === "cancel") return;
    const stack = getDrillStack();
    stack.pop();
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack));
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(projectId ? `/dashboard/projects/${projectId}` : "/dashboard");
    }
  }, [router, projectId]);

  const handleBackToProject = useCallback(async () => {
    if ((await confirmSaveBeforeLeave()) === "cancel") return;
    sessionStorage.removeItem(STACK_KEY);
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(projectId ? `/dashboard/projects/${projectId}` : "/dashboard");
    }
  }, [router, projectId]);

  const {
    data,
    addElement,
    moveElement,
    resizeElement,
    resizeElementEnd,
    updateLabel,
    updateProperties,
    updatePropertiesBatch,
    deleteElement,
    addConnector,
    deleteConnector,
    updateConnectorDirection,
    updateConnectorType,
    reverseConnector,
    updateConnectorEndpoint,
    updateConnectorWaypoints,
    updateCurveHandles,
    connectorWaypointDragEnd,
    nudgeConnector,
    nudgeConnectorEndpoint,
    updateConnectorLabel,
    updateConnectorFields,
    updateDiagramTitle,
    setFontSize,
    setConnectorFontSize,
    setTitleFontSize,
    setPoolFontSize,
    setLaneFontSize,
    setDatabase,
    elementMoveEnd,
    flipForkJoin,
    convertTaskSubprocess,
    convertProcessCollapsed,
    convertEventType,
    addSelfTransition,
    splitConnector,
    applyTemplate,
    alignElements,
    setData,
    clearDiagram,
    clearDiagramExcept,
    correctAllConnectors,
    insertSpace,
    addLane,
    addSublane,
    reorderLane,
    moveLaneBoundary,
    laneBoundaryMoveEnd,
    moveElements,
    elementsMoveEnd,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useDiagram(initialData);

  // Template edit state
  const [templateEditState, setTemplateEditState] = useState<{
    templateId: string;
    templateName: string;
    originalData: DiagramData;
  } | null>(null);

  const { saveStatus, lastSavedAt, saveNow } = useAutoSave(diagramId, data, 1500, templateEditState !== null || !!readOnly);
  saveNowRef.current = saveNow;
  saveStatusRef.current = saveStatus;
  const effectiveUpdatedAt = lastSavedAt ?? updatedAt;

  // Warn user about unsaved changes when leaving the page
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (saveStatus === "unsaved") {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveStatus]);

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
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveNow();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  const [pdfScale, setPdfScale] = useState(100);
  const [selectedElementIds, setSelectedElementIds] = useState<Set<string>>(new Set());
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [pendingDragSymbol, setPendingDragSymbol] = useState<SymbolType | null>(null);
  const [pendingArchimateShapeKey, setPendingArchimateShapeKey] = useState<string | null>(null);
  const [pendingArchimateIconOnly, setPendingArchimateIconOnly] = useState<boolean>(false);
  const [projectColorConfig, setProjectColorConfig] = useState<SymbolColorConfig | undefined>(undefined);
  const [diagramColorConfig, setDiagramColorConfig] = useState<SymbolColorConfig>(initialDiagramColorConfig ?? {});
  const [displayMode, setDisplayMode] = useState<DisplayMode>(initialDisplayMode ?? "normal");
  const [showDiagramMaintenance, setShowDiagramMaintenance] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showPlanPanel, setShowPlanPanel] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [showValueDisplay, setShowValueDisplay] = useState(false);
  const [showBottleneck, setShowBottleneck] = useState(false);
  useEffect(() => {
    if (localStorage.getItem(`debug-${projectId}`) === "true") setDebugMode(true);
    if (localStorage.getItem(`valueDisplay-${diagramId}`) === "true") setShowValueDisplay(true);
    if (localStorage.getItem(`bottleneck-${diagramId}`) === "true") setShowBottleneck(true);
  }, [projectId, diagramId]);

  // Template state (BPMN only)
  const isAdmin = userEmail === "paul@nashcc.com.au";
  const [userTemplates, setUserTemplates] = useState<{ id: string; name: string }[]>([]);
  const [builtInTemplates, setBuiltInTemplates] = useState<{ id: string; name: string }[]>([]);
  const [templateMode, setTemplateMode] = useState<"idle" | "capturing" | "capturing-builtin" | "editing">("idle");
  const [deletingTemplateIds, setDeletingTemplateIds] = useState<Set<string>>(new Set());
  const [templateImportInfo, setTemplateImportInfo] = useState<
    { title: string; lines: string[] } | null
  >(null);
  const [templateDeleteConfirm, setTemplateDeleteConfirm] = useState<
    { id: string; name: string; isBuiltIn: boolean } | null
  >(null);
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
  // builtInDropdownOpen removed — merged into single Templates dropdown
  const [showTemplateNameModal, setShowTemplateNameModal] = useState(false);
  const [showAdminPasswordModal, setShowAdminPasswordModal] = useState(false);
  const [pendingTemplateData, setPendingTemplateData] = useState<TemplateData | null>(null);
  const getViewportCenterRef = useRef<(() => Point) | null>(null);
  const templateDropdownRef = useRef<HTMLDivElement>(null);

  // Alignment dropdown state
  const [alignDropdownOpen, setAlignDropdownOpen] = useState(false);
  const alignDropdownRef = useRef<HTMLDivElement>(null);
  // Resize dropdown state
  const [resizeDropdownOpen, setResizeDropdownOpen] = useState(false);
  const resizeDropdownRef = useRef<HTMLDivElement>(null);

  // File menu state (Export, Import, PDF scale popover)
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  // Which submenu (Export ▶ / Import ▶) is currently expanded.
  const [fileSubmenu, setFileSubmenu] = useState<"export" | "import" | null>(null);
  const [showPdfScalePopover, setShowPdfScalePopover] = useState(false);
  const [pendingPdfScale, setPendingPdfScale] = useState(100);
  const importJsonInputRef = useRef<HTMLInputElement>(null);
  const importXmlInputRef = useRef<HTMLInputElement>(null);
  const importTemplatesInputRef = useRef<HTMLInputElement>(null);
  // Admin-only: prompt the admin to pick the destination list when
  // exporting or importing templates. Non-admins skip the prompt.
  const [templateExportPrompt, setTemplateExportPrompt] = useState(false);
  const [templateImportFile, setTemplateImportFile] = useState<File | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState<null | "all" | "unselected">(null);
  const [clearMenuOpen, setClearMenuOpen] = useState(false);
  const clearMenuRef = useRef<HTMLDivElement>(null);

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

  // Fetch templates on mount (BPMN only) — sequential to avoid overwhelming PGlite
  useEffect(() => {
    if (diagramType !== "bpmn") return;
    (async () => {
      try {
        const r1 = await fetch("/api/templates?type=user");
        if (r1.ok) {
          const list = await r1.json() as { id: string; name: string; diagramType: string }[];
          setUserTemplates(list.filter((t) => t.diagramType === "bpmn"));
        }
      } catch {}
      try {
        const r2 = await fetch("/api/templates?type=builtin");
        if (r2.ok) {
          const list = await r2.json() as { id: string; name: string; diagramType: string }[];
          setBuiltInTemplates(list.filter((t) => t.diagramType === "bpmn"));
        }
      } catch {}
    })();
  }, [diagramType]);

  // Close template dropdowns on outside click
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

  // Close alignment dropdown on outside click
  useEffect(() => {
    if (!alignDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (alignDropdownRef.current && !alignDropdownRef.current.contains(e.target as Node)) {
        setAlignDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [alignDropdownOpen]);

  // Close resize dropdown on outside click
  useEffect(() => {
    if (!resizeDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (resizeDropdownRef.current && !resizeDropdownRef.current.contains(e.target as Node)) {
        setResizeDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [resizeDropdownOpen]);

  // Close File menu on outside click (also dismisses any open PDF-scale popover)
  useEffect(() => {
    if (!fileMenuOpen && !showPdfScalePopover) return;
    function handleClick(e: MouseEvent) {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setFileMenuOpen(false);
        setFileSubmenu(null);
        setShowPdfScalePopover(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [fileMenuOpen, showPdfScalePopover]);

  // Close Clear menu on outside click
  useEffect(() => {
    if (!clearMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (clearMenuRef.current && !clearMenuRef.current.contains(e.target as Node)) {
        setClearMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [clearMenuOpen]);

  const effectiveColorConfig: SymbolColorConfig = displayMode === "hand-drawn"
    ? BW_SYMBOL_COLORS
    : { ...projectColorConfig, ...diagramColorConfig };

  const selectedElement = selectedElementIds.size === 1
    ? data.elements.find((el) => selectedElementIds.has(el.id)) ?? null
    : null;
  const selectedConnector = data.connectors.find((c) => c.id === selectedConnectorId) ?? null;

  const isContext = diagramType === "context" || diagramType === "basic";
  const defaultDirectionType: DirectionType =
    isContext                            ? "open-directed" :
    diagramType === "process-context" ? "non-directed" :
    diagramType === "state-machine"   ? "open-directed" :
    diagramType === "value-chain"     ? "directed" :
    "directed";

  const defaultRoutingType: RoutingType =
    isContext                            ? "curvilinear" :
    diagramType === "process-context" ? "direct" :
    diagramType === "state-machine"   ? "curvilinear" :
    diagramType === "value-chain"     ? "rectilinear" :
    "rectilinear";

  const poolHasContent = selectedElement?.type === "pool"
    ? data.elements.some((e) => e.parentId === selectedElement.id)
    : false;

  const laneHasContent = selectedElement?.type === "lane"
    ? data.elements.some((e) => e.parentId === selectedElement.id)
    : false;

  const parentName = selectedElement?.parentId
    ? data.elements.find((e) => e.id === selectedElement.parentId)?.label || undefined
    : undefined;

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
      targetSide: Side,
      sourceOffsetAlong?: number,
      targetOffsetAlong?: number,
      force?: boolean
    ) => {
      addConnector(sourceId, targetId, type, directionType, routingType, sourceSide, targetSide, sourceOffsetAlong, targetOffsetAlong, force);
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

  // Export the current diagram's data as a JSON file (single-diagram envelope
  // matching the project export format so it round-trips through Import JSON).
  async function handleExportJson() {
    const { SCHEMA_VERSION } = await import("@/app/lib/diagram/types");
    let appVersion = SCHEMA_VERSION;
    try {
      const resp = await fetch("/api/schema");
      if (resp.ok) {
        const xsdText = await resp.text();
        const m = xsdText.match(/Generated by Diagramatix ([\d.]+)/);
        if (m) appVersion = m[1];
      }
    } catch { /* best-effort */ }
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      appVersion,
      exportedAt: new Date().toISOString(),
      project: { name: "(single diagram)", description: "", ownerName: "", colorConfig: {} },
      diagrams: [{
        originalId: diagramId,
        name: diagramName,
        type: diagramType,
        data,
        colorConfig: diagramColorConfig,
        displayMode,
      }],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${diagramName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Import a JSON or XML file, take its FIRST diagram, and replace the
  // current diagram's contents. Auto-save will persist the new content.
  async function handleImportFile(file: File, format: "json" | "xml") {
    try {
      const text = await file.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let parsed: any;
      if (format === "xml") {
        const { parseDiagramatixXml } = await import("@/app/lib/diagram/xmlExport");
        parsed = parseDiagramatixXml(text);
      } else {
        parsed = JSON.parse(text);
      }
      if (!parsed || !Array.isArray(parsed.diagrams) || parsed.diagrams.length === 0) {
        alert("Invalid file: contains no diagrams");
        return;
      }
      const first = parsed.diagrams[0];
      if (!first || typeof first.data !== "object") {
        alert("Invalid file: first diagram has no data");
        return;
      }
      // Schema version check
      const { SCHEMA_VERSION } = await import("@/app/lib/diagram/types");
      const schemaVer: string = parsed.schemaVersion ?? parsed.version ?? "";
      if (schemaVer) {
        const fileMajor = parseInt(schemaVer.split(".")[0] ?? "0", 10);
        const appMajor = parseInt(SCHEMA_VERSION.split(".")[0] ?? "0", 10);
        if (fileMajor > appMajor) {
          alert(`File schema ${schemaVer} is newer than this app (${SCHEMA_VERSION}). Aborting.`);
          return;
        }
        if (fileMajor < appMajor) {
          alert(`Note: file uses older schema ${schemaVer}, will be upgraded to ${SCHEMA_VERSION}.`);
        }
      }
      const diagCount = parsed.diagrams.length;
      if (diagCount > 1) {
        if (!window.confirm(
          `This file contains ${diagCount} diagrams. Only the first one ("${first.name ?? "(unnamed)"}") ` +
            `will be imported into the current diagram, replacing its contents. Continue?`,
        )) return;
      } else {
        if (!window.confirm(
          `Replace the current diagram contents with the imported diagram "${first.name ?? "(unnamed)"}"? This cannot be undone.`,
        )) return;
      }
      setData(first.data);
      if (first.colorConfig && typeof first.colorConfig === "object") {
        setDiagramColorConfig(first.colorConfig as SymbolColorConfig);
      }
      if (typeof first.displayMode === "string") {
        setDisplayMode(first.displayMode as DisplayMode);
      }
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Export the current diagram as XML alongside the latest XSD schema.
  // Two files are downloaded: <diagramName>.xml and diagramatix-export-v*.xsd.
  async function handleExportXml() {
    const { buildSingleDiagramXml, downloadMatchingXsd } = await import("@/app/lib/diagram/xmlExport");
    const { SCHEMA_VERSION } = await import("@/app/lib/diagram/types");

    // Build the XML using the local schema version. The XSD download will
    // resolve the runtime appVersion (with git commit count) and we use that
    // value when constructing the file too.
    let appVersion = SCHEMA_VERSION;
    try {
      const resp = await fetch("/api/schema");
      if (resp.ok) {
        const xsdText = await resp.text();
        const m = xsdText.match(/Generated by Diagramatix ([\d.]+)/);
        if (m) appVersion = m[1];
      }
    } catch { /* keep local schema version */ }

    const xml = buildSingleDiagramXml({
      schemaVersion: SCHEMA_VERSION,
      appVersion,
      diagramName,
      diagramType,
      diagramData: data,
      diagramId,
      displayMode,
      diagramColorConfig: diagramColorConfig,
    });

    // Trigger XML download
    const xmlBlob = new Blob([xml], { type: "application/xml" });
    const xmlUrl = URL.createObjectURL(xmlBlob);
    const a1 = document.createElement("a");
    a1.href = xmlUrl;
    a1.download = `${diagramName}.xml`;
    document.body.appendChild(a1);
    a1.click();
    document.body.removeChild(a1);
    setTimeout(() => URL.revokeObjectURL(xmlUrl), 1000);

    // Always download the matching XSD alongside (best-effort, no-op on failure)
    await downloadMatchingXsd(SCHEMA_VERSION);
  }

  // Export every template of the given scope as a `.diag_tems` JSON file.
  async function handleExportTemplates(scope: "user" | "builtin") {
    try {
      const resp = await fetch(`/api/templates/export?type=${scope}`);
      if (!resp.ok) {
        const txt = await resp.text();
        alert(`Template export failed: ${txt || resp.statusText}`);
        return;
      }
      // Use the server-supplied filename if present.
      const cd = resp.headers.get("Content-Disposition") ?? "";
      const m = cd.match(/filename="([^"]+)"/);
      const fallback = `diagramatix-templates-${scope}-${new Date().toISOString().slice(0, 10)}.diag_tems`;
      const filename = m?.[1] ?? fallback;
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      alert(`Template export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Import templates from a `.diag_tems` file into the chosen list.
  async function handleImportTemplatesFile(file: File, dest: "user" | "builtin") {
    try {
      const text = await file.text();
      let payload: unknown;
      try { payload = JSON.parse(text); }
      catch {
        setTemplateImportInfo({ title: "Template Import Failed", lines: ["The selected file is not valid JSON."] });
        return;
      }
      // Forward the parsed payload — the server validates shape and skips
      // duplicates by (name + diagramType).
      const resp = await fetch(`/api/templates/import?type=${dest}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        setTemplateImportInfo({
          title: "Template Import Failed",
          lines: [txt || resp.statusText],
        });
        return;
      }
      const summary = await resp.json() as { created: number; skipped: number; skippedNames: string[]; createdNames?: string[] };
      // Refresh the in-memory list so newly imported templates show up
      // without a page reload.
      try {
        const which = dest === "builtin" ? "builtin" : "user";
        const refresh = await fetch(`/api/templates?type=${which}`);
        if (refresh.ok) {
          const list = await refresh.json() as { id: string; name: string; diagramType: string }[];
          const bpmnOnly = list.filter((t) => t.diagramType === "bpmn").map(t => ({ id: t.id, name: t.name }));
          if (dest === "builtin") setBuiltInTemplates(bpmnOnly);
          else setUserTemplates(bpmnOnly);
        }
      } catch { /* non-fatal — modal still shows results */ }
      const destLabel = dest === "builtin" ? "Built-In" : "User";
      const lines: string[] = [];
      lines.push(
        `Imported ${summary.created} template${summary.created === 1 ? "" : "s"} into the ${destLabel} list.`,
      );
      if (summary.skipped > 0) {
        const head = summary.skippedNames.slice(0, 8).join(", ");
        const tail = summary.skippedNames.length > 8 ? ", …" : "";
        lines.push(
          `Skipped ${summary.skipped} duplicate${summary.skipped === 1 ? "" : "s"}: ${head}${tail}`,
        );
      }
      setTemplateImportInfo({ title: "Template Import Complete", lines });
    } catch (err) {
      setTemplateImportInfo({
        title: "Template Import Failed",
        lines: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  function handleSaveAsTemplate() {
    const captured = captureTemplate(data.elements, data.connectors, selectedElementIds);
    if (captured.elements.length === 0) return;
    setPendingTemplateData(captured);
    setShowTemplateNameModal(true);
  }

  async function handleConfirmTemplateName(name: string, adminPassword?: string) {
    if (!pendingTemplateData) return;
    const isBuiltIn = templateMode === "capturing-builtin";
    try {
      const body: Record<string, unknown> = { name, diagramType: "bpmn", data: pendingTemplateData };
      if (isBuiltIn) {
        body.templateType = "builtin";
        if (adminPassword) body.adminPassword = adminPassword;
      }
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("Failed to save template:", res.status, text);
        if (res.status === 403) { alert("Invalid admin password"); return; }
      } else {
        const created = await res.json();
        if (isBuiltIn) {
          setBuiltInTemplates((prev) => [{ id: created.id, name: created.name }, ...prev]);
        } else {
          setUserTemplates((prev) => [{ id: created.id, name: created.name }, ...prev]);
        }
      }
    } catch (err) {
      console.error("Failed to save template:", err);
    }
    setPendingTemplateData(null);
    setShowTemplateNameModal(false);
    setShowAdminPasswordModal(false);
    setTemplateMode("idle");
    setSelectedElementIds(new Set());
    setSelectedConnectorId(null);
  }

  async function handleApplyTemplate(templateId: string) {
    setTemplateDropdownOpen(false);
    try {
      const res = await fetch(`/api/templates/${templateId}`);
      if (!res.ok) { console.error("Failed to fetch template:", res.status); return; }
      const tmpl = await res.json();
      const templateData = tmpl.data as TemplateData;
      const center = getViewportCenterRef.current?.() ?? { x: 200, y: 200 };
      const { elements, connectors, newIds } = instantiateTemplate(templateData, center.x, center.y);
      applyTemplate(elements, connectors);
      setSelectedElementIds(newIds);
      setSelectedConnectorId(null);
    } catch (err) {
      console.error("Failed to apply template:", err);
    }
  }

  async function handleDeleteTemplate(templateId: string, isBuiltIn = false) {
    // Immediately show as pending delete
    setDeletingTemplateIds(prev => { const next = new Set(prev); next.add(templateId); return next; });
    try {
      const res = await fetch(`/api/templates/${templateId}`, { method: "DELETE" });
      if (res.ok) {
        if (isBuiltIn) {
          setBuiltInTemplates((prev) => prev.filter((t) => t.id !== templateId));
        } else {
          setUserTemplates((prev) => prev.filter((t) => t.id !== templateId));
        }
      } else {
        console.error("Failed to delete template:", res.status);
      }
    } catch (err) {
      console.error("Failed to delete template:", err);
    }
    setDeletingTemplateIds(prev => { const next = new Set(prev); next.delete(templateId); return next; });
  }

  async function handleEditTemplate(templateId: string, templateName: string) {
    setTemplateDropdownOpen(false);
    try {
      const res = await fetch(`/api/templates/${templateId}`);
      if (!res.ok) { console.error("Failed to fetch template:", res.status); return; }
      const tmpl = await res.json();
      const templateData = tmpl.data as TemplateData;

      // Stash the current diagram so we can restore it later
      const originalData: DiagramData = {
        elements: [...data.elements],
        connectors: [...data.connectors],
        viewport: { ...data.viewport },
      };

      setTemplateEditState({ templateId, templateName, originalData });
      setSelectedElementIds(new Set());
      setSelectedConnectorId(null);

      // Replace diagram with just the template elements
      const center = getViewportCenterRef.current?.() ?? { x: 400, y: 300 };
      const { elements, connectors } = instantiateTemplate(templateData, center.x, center.y);
      setData({ elements, connectors, viewport: data.viewport });
      setTemplateMode("editing");
    } catch (err) {
      console.error("Failed to start template edit:", err);
    }
  }

  async function handleUpdateTemplate(newName: string) {
    if (!templateEditState) return;

    const captured = captureTemplate(data.elements, data.connectors, selectedElementIds);
    if (captured.elements.length === 0) return;

    try {
      const res = await fetch(`/api/templates/${templateEditState.templateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, data: captured }),
      });
      if (!res.ok) {
        console.error("Failed to update template:", res.status, await res.text());
      } else {
        // Update in whichever list contains this template
        const updater = (prev: { id: string; name: string }[]) =>
          prev.map((t) => t.id === templateEditState.templateId ? { ...t, name: newName } : t);
        setUserTemplates(updater);
        setBuiltInTemplates(updater);
      }
    } catch (err) {
      console.error("Failed to update template:", err);
    }

    handleCancelTemplateEdit();
  }

  function handleCancelTemplateEdit() {
    if (!templateEditState) return;
    setData(templateEditState.originalData);
    setTemplateEditState(null);
    setTemplateMode("idle");
    setSelectedElementIds(new Set());
    setSelectedConnectorId(null);
    setShowTemplateNameModal(false);
  }

  return (
    <div className={`flex flex-col h-screen ${readOnly ? "bg-orange-50" : "bg-white"}`}>
      {readOnly && viewingAsName !== undefined && viewingAsEmail !== undefined && (
        <ImpersonationBanner viewingAsName={viewingAsName ?? ""} viewingAsEmail={viewingAsEmail ?? ""} />
      )}
      {/* Top bar */}
      <header className={`h-9 border-b border-gray-200 flex items-center px-2 gap-2 flex-shrink-0 ${readOnly ? "bg-orange-50" : ""}`}>
        <button
          onClick={parentDiagram ? handleDrillBack : handleBackToProject}
          className="text-gray-500 hover:text-gray-700 text-xs"
        >
          {parentDiagram
            ? `\u2190 ${parentDiagram.name}`
            : `\u2190 ${projectId ? "Project" : "Dashboard"}`}
        </button>

        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 bg-blue-600 rounded flex items-center justify-center">
            <svg width={8} height={8} viewBox="0 0 10 10" fill="none">
              <rect x={0.5} y={0.5} width={3.5} height={3.5} rx={0.5} fill="white" />
              <rect x={6} y={0.5} width={3.5} height={3.5} rx={0.5} fill="white" />
              <rect x={0.5} y={6} width={3.5} height={3.5} rx={0.5} fill="white" />
              <rect x={6} y={6} width={3.5} height={3.5} rx={0.5} fill="white" />
            </svg>
          </div>
          <span className="font-semibold text-gray-900 text-xs">{diagramName}</span>
          <span className="text-[10px] text-gray-400 px-1 py-0 bg-gray-100 rounded">
            {diagramType}
          </span>
          {version ? <span className="text-[10px] text-gray-400">v{SCHEMA_VERSION}.{version}</span> : null}
        </div>

        <div className="flex-1" />

        {!readOnly && (
          <>
            <button
              onClick={saveNow}
              disabled={saveStatus !== "unsaved"}
              title="Save (Ctrl+S)"
              className={`px-2 py-0.5 text-[11px] font-medium rounded border ${
                saveStatus === "unsaved"
                  ? "bg-orange-500 text-white border-orange-500 hover:bg-orange-600"
                  : saveStatus === "saving"
                    ? "bg-yellow-50 text-yellow-700 border-yellow-300"
                    : "bg-green-50 text-green-600 border-green-200"
              }`}
            >
              {saveStatus === "saving" ? "Saving\u2026" : saveStatus === "saved" ? "\u2713 Saved" : "\u25CF Unsaved — Click to Save"}
            </button>

            <div className="flex items-center gap-0.5">
              <button
                onClick={undo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
                className="p-1 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg width={12} height={12} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 5h6a4 4 0 0 1 0 8H5" />
                  <path d="M2 5L5 2M2 5l3 3" />
                </svg>
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                title="Redo (Ctrl+Shift+Z)"
                className="p-1 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg width={12} height={12} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5H6a4 4 0 0 0 0 8h3" />
                  <path d="M12 5L9 2m3 3-3 3" />
                </svg>
              </button>
            </div>
          </>
        )}

        {selectedElementIds.size > 1 && templateMode !== "editing" && (
          <div className="relative" ref={alignDropdownRef}>
            <button
              onClick={() => setAlignDropdownOpen((prev) => !prev)}
              className="px-2 py-0.5 text-[11px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Alignment ▾
            </button>
            {alignDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded shadow-lg z-50">
                <button
                  onClick={() => { alignElements([...selectedElementIds], "center"); setAlignDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Align Centres Horizontally
                </button>
                <button
                  onClick={() => { alignElements([...selectedElementIds], "vcenter"); setAlignDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Align Centres Vertically
                </button>
                <div className="border-t border-gray-100" />
                <button
                  onClick={() => { alignElements([...selectedElementIds], "smart"); setAlignDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 font-medium"
                >
                  Align Smart!
                </button>
              </div>
            )}
          </div>
        )}

        {selectedElementIds.size > 1 && templateMode !== "editing" && (
          <div className="relative" ref={resizeDropdownRef}>
            <button
              onClick={() => setResizeDropdownOpen((prev) => !prev)}
              className="px-2 py-0.5 text-[11px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Resize ▾
            </button>
            {resizeDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded shadow-lg z-50">
                {([
                  { mode: "tallest", label: "Resize to Tallest" },
                  { mode: "shortest", label: "Resize to Shortest" },
                  { mode: "widest", label: "Resize to Widest" },
                  { mode: "thinnest", label: "Resize to Thinnest" },
                ] as const).map(({ mode, label }) => (
                  <button key={mode}
                    onClick={() => {
                      const ids = [...selectedElementIds];
                      const selected = data.elements.filter(e => ids.includes(e.id));
                      if (selected.length < 2) return;
                      let targetVal: number;
                      switch (mode) {
                        case "tallest":  targetVal = Math.max(...selected.map(e => e.height)); break;
                        case "shortest": targetVal = Math.min(...selected.map(e => e.height)); break;
                        case "widest":   targetVal = Math.max(...selected.map(e => e.width)); break;
                        case "thinnest": targetVal = Math.min(...selected.map(e => e.width)); break;
                      }
                      for (const el of selected) {
                        const newW = (mode === "widest" || mode === "thinnest") ? targetVal : el.width;
                        const newH = (mode === "tallest" || mode === "shortest") ? targetVal : el.height;
                        resizeElement(el.id, el.x, el.y, newW, newH);
                      }
                      setResizeDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {diagramType === "bpmn" && templateMode === "idle" && (
          <div className="relative" ref={templateDropdownRef}>
            <button
              onClick={() => setTemplateDropdownOpen((prev) => !prev)}
              className="px-2 py-0.5 text-[11px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Templates {"\u25BE"}
            </button>
            {templateDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded shadow-lg z-50 max-h-80 overflow-y-auto">
                {/* Create actions */}
                <button
                  onClick={() => { setTemplateMode("capturing"); setTemplateDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 font-medium"
                >
                  + Create User Template
                </button>
                {isAdmin && (
                  <button
                    onClick={() => {
                      setTemplateDropdownOpen(false);
                      setTemplateMode("capturing-builtin");
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-orange-600 hover:bg-orange-50 font-medium"
                  >
                    + Create Built-In Template
                  </button>
                )}

                {/* Built-In Templates */}
                {builtInTemplates.length > 0 && (
                  <>
                    <div className="border-t border-gray-100" />
                    <p className="px-3 py-1.5 text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Built-In</p>
                    {builtInTemplates.map((t) => {
                      const isDeleting = deletingTemplateIds.has(t.id);
                      return (
                        <div key={t.id} className={`flex items-center ${isDeleting ? "opacity-50" : "hover:bg-gray-50"}`}>
                          <button
                            onClick={() => !isDeleting && handleApplyTemplate(t.id)}
                            disabled={isDeleting}
                            className={`flex-1 text-left px-3 py-1.5 text-xs text-gray-700 ${isDeleting ? "line-through text-gray-400" : ""}`}
                          >
                            {t.name}{isDeleting ? " (deleting\u2026)" : ""}
                          </button>
                          {isAdmin && !isDeleting && (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); handleEditTemplate(t.id, t.name); }}
                                className="px-1.5 py-1.5 text-gray-400 hover:text-blue-500" title="Edit">
                                <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M7 2l3 3-7 7H0V9z" /></svg>
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setTemplateDeleteConfirm({ id: t.id, name: t.name, isBuiltIn: true }); }}
                                className="px-1.5 py-1.5 text-gray-400 hover:text-red-500" title="Delete">
                                <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M2 3h8M4.5 3V2h3v1M3 3v7a1 1 0 001 1h4a1 1 0 001-1V3" /></svg>
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {/* User Templates */}
                {userTemplates.length > 0 && (
                  <>
                    <div className="border-t border-gray-100" />
                    <p className="px-3 py-1.5 text-[10px] text-gray-400 font-semibold uppercase tracking-wide">User</p>
                    {userTemplates.map((t) => {
                      const isDeleting = deletingTemplateIds.has(t.id);
                      return (
                        <div key={t.id} className={`flex items-center ${isDeleting ? "opacity-50" : "hover:bg-gray-50"}`}>
                          <button
                            onClick={() => !isDeleting && handleApplyTemplate(t.id)}
                            disabled={isDeleting}
                            className={`flex-1 text-left px-3 py-1.5 text-xs text-gray-700 ${isDeleting ? "line-through text-gray-400" : ""}`}
                          >
                            {t.name}{isDeleting ? " (deleting\u2026)" : ""}
                          </button>
                          {!isDeleting && (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); handleEditTemplate(t.id, t.name); }}
                                className="px-1.5 py-1.5 text-gray-400 hover:text-blue-500" title="Edit">
                                <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M7 2l3 3-7 7H0V9z" /></svg>
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setTemplateDeleteConfirm({ id: t.id, name: t.name, isBuiltIn: false }); }}
                                className="px-1.5 py-1.5 text-gray-400 hover:text-red-500" title="Delete">
                                <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M2 3h8M4.5 3V2h3v1M3 3v7a1 1 0 001 1h4a1 1 0 001-1V3" /></svg>
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {diagramType === "bpmn" && (templateMode === "capturing" || templateMode === "capturing-builtin") && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-blue-600">
              Select elements for {templateMode === "capturing-builtin" ? "built-in" : "user"} template
            </span>
            <button
              onClick={handleSaveAsTemplate}
              disabled={selectedElementIds.size === 0}
              className="px-2 py-0.5 text-[11px] text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save as Template
            </button>
            <button
              onClick={() => setTemplateMode("idle")}
              className="px-2 py-0.5 text-[11px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        )}
        {diagramType === "bpmn" && templateMode === "editing" && templateEditState && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-600 font-medium">
              Editing template: {templateEditState.templateName}
            </span>
            <button
              onClick={() => {
                const captured = captureTemplate(data.elements, data.connectors, selectedElementIds);
                if (captured.elements.length === 0) return;
                setPendingTemplateData(captured);
                setShowTemplateNameModal(true);
              }}
              disabled={selectedElementIds.size === 0}
              className="px-2 py-0.5 text-[11px] text-white bg-amber-600 rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Update Template
            </button>
            <button
              onClick={handleCancelTemplateEdit}
              className="px-2 py-0.5 text-[11px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        )}

        {templateMode !== "editing" && (
          <>
        {!readOnly && (
          <button
            onClick={() => setShowDiagramMaintenance(true)}
            className="px-2 py-0.5 text-[11px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
          >
            Diagram Config
          </button>
        )}

        {/* AI Generate button. For BPMN this opens the 2-phase Plan panel;
            for other diagram types it opens the legacy one-shot AI panel. */}
        {!readOnly && diagramType !== "basic" && (
          <button
            onClick={() => {
              if (diagramType === "bpmn") {
                setShowPlanPanel(prev => !prev);
                if (!showPlanPanel) { setShowAiPanel(false); setShowHistoryPanel(false); }
              } else {
                setShowAiPanel(prev => !prev);
                if (!showAiPanel) { setShowHistoryPanel(false); setShowPlanPanel(false); }
              }
            }}
            className={`px-2 py-0.5 text-[11px] rounded border ${
              (diagramType === "bpmn" ? showPlanPanel : showAiPanel)
                ? "text-blue-700 border-blue-400 bg-blue-50"
                : "text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
            title={diagramType === "bpmn" ? "Two-phase AI generation: plan first, then apply layout" : "Generate a diagram from a natural-language description"}
          >
            AI Generate
          </button>
        )}
        {!readOnly && (
          <button
            onClick={() => {
              setShowHistoryPanel(prev => !prev);
              if (!showHistoryPanel) { setShowAiPanel(false); setShowPlanPanel(false); }
            }}
            className={`px-2 py-0.5 text-[11px] rounded border ${
              showHistoryPanel
                ? "text-blue-700 border-blue-400 bg-blue-50"
                : "text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
            title="View and restore previous versions"
          >
            History
          </button>
        )}

        {/* Hidden file inputs reused by the File menu */}
        <input
          ref={importJsonInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleImportFile(f, "json");
            e.target.value = "";
          }}
        />
        <input
          ref={importXmlInputRef}
          type="file"
          accept=".xml"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleImportFile(f, "xml");
            e.target.value = "";
          }}
        />
        <input
          ref={importTemplatesInputRef}
          type="file"
          accept=".diag_tems,application/json"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            // Admin: prompt for destination list (User vs Built-In).
            // Non-admin: import directly into User templates.
            if (isAdmin) {
              setTemplateImportFile(f);
            } else {
              handleImportTemplatesFile(f, "user");
            }
          }}
        />

        <div className="relative" ref={fileMenuRef}>
          <button
            onClick={() => {
              setFileMenuOpen((prev) => !prev);
              setFileSubmenu(null);
              setShowPdfScalePopover(false);
            }}
            className="px-2 py-0.5 text-[11px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
          >
            File ▾
          </button>
          {fileMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded shadow-lg z-50">
              {/* Save As — clone current diagram into the same project under a new name */}
              <button
                onClick={() => {
                  setFileMenuOpen(false);
                  setFileSubmenu(null);
                  setSaveAsName(`${diagramName} (copy)`);
                  setShowSaveAs(true);
                }}
                onMouseEnter={() => setFileSubmenu(null)}
                className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                title="Save a copy of this diagram in the same project under a new name"
              >
                Save As&hellip;
              </button>
              <div className="border-t border-gray-100" />

              {/* Export ▶ — opens a submenu with all export formats */}
              <div
                className="relative"
                onMouseEnter={() => setFileSubmenu("export")}
              >
                <button
                  onClick={() => setFileSubmenu(fileSubmenu === "export" ? null : "export")}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                >
                  <span>Export</span>
                  <span className="text-gray-400">▶</span>
                </button>
                {fileSubmenu === "export" && (
                  <div className="absolute right-full top-0 mr-1 w-44 bg-white border border-gray-200 rounded shadow-lg z-50">
                    {/* PDF — opens scale popover */}
                    <div className="relative">
                      <button
                        onClick={() => {
                          setPendingPdfScale(pdfScale);
                          setShowPdfScalePopover(true);
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        PDF
                      </button>
                      {showPdfScalePopover && (
                        <div
                          className="absolute right-full top-0 mr-1 w-36 bg-white border border-gray-300 rounded shadow-lg p-2 z-50"
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">PDF Scale</div>
                          {[100, 75, 50, 25].map((val) => (
                            <label key={val} className="flex items-center gap-2 py-0.5 text-xs text-gray-700 cursor-pointer">
                              <input
                                type="radio"
                                name="pdfScalePending"
                                checked={pendingPdfScale === val}
                                onChange={() => setPendingPdfScale(val)}
                                className="accent-blue-600"
                              />
                              {val}%
                            </label>
                          ))}
                          <div className="flex justify-end gap-1 mt-2">
                            <button
                              onClick={() => setShowPdfScalePopover(false)}
                              className="px-2 py-0.5 text-[10px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => {
                                setPdfScale(pendingPdfScale);
                                setShowPdfScalePopover(false);
                                setFileMenuOpen(false);
                                setFileSubmenu(null);
                                handleExportPdf();
                              }}
                              className="px-2 py-0.5 text-[10px] text-white bg-blue-600 rounded hover:bg-blue-700"
                            >
                              Confirm
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Visio (BPMN only) */}
                    {diagramType === "bpmn" && (
                      <button
                        onClick={() => {
                          setFileMenuOpen(false);
                          setFileSubmenu(null);
                          const a = document.createElement("a");
                          a.href = `/api/export/visio-v2?diagramId=${diagramId}`;
                          a.rel = "noopener";
                          a.click();
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Visio
                      </button>
                    )}
                    {/* SVG */}
                    <button
                      onClick={() => { handleExport(); setFileMenuOpen(false); setFileSubmenu(null); }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      SVG
                    </button>
                    {/* JSON */}
                    <button
                      onClick={() => { handleExportJson(); setFileMenuOpen(false); setFileSubmenu(null); }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      title="Download diagram as a single-diagram JSON file"
                    >
                      JSON
                    </button>
                    {/* XML */}
                    <button
                      onClick={() => { handleExportXml(); setFileMenuOpen(false); setFileSubmenu(null); }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      title="Download diagram XML and the matching XSD schema"
                    >
                      XML
                    </button>
                    {/* Visio (V3) — admin only */}
                    {diagramType === "bpmn" && isAdmin && (
                      <button
                        onClick={() => {
                          setFileMenuOpen(false);
                          setFileSubmenu(null);
                          const a = document.createElement("a");
                          a.href = `/api/export/visio-v3?diagramId=${diagramId}`;
                          a.rel = "noopener";
                          a.click();
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-orange-600 hover:bg-orange-50"
                      >
                        Visio (V3) — Admin
                      </button>
                    )}
                    {/* Templates — non-admin exports User templates directly;
                        admin opens a User-vs-Built-In picker. */}
                    <button
                      onClick={() => {
                        if (isAdmin) {
                          setTemplateExportPrompt(true);
                        } else {
                          handleExportTemplates("user");
                          setFileMenuOpen(false);
                          setFileSubmenu(null);
                        }
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      title="Export your templates as a .diag_tems file"
                    >
                      Templates
                    </button>
                  </div>
                )}
              </div>

              {/* Import ▶ — submenu with import sources */}
              <div
                className="relative"
                onMouseEnter={() => setFileSubmenu("import")}
              >
                <button
                  onClick={() => setFileSubmenu(fileSubmenu === "import" ? null : "import")}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                >
                  <span>Import</span>
                  <span className="text-gray-400">▶</span>
                </button>
                {fileSubmenu === "import" && (
                  <div className="absolute right-full top-0 mr-1 w-44 bg-white border border-gray-200 rounded shadow-lg z-50">
                    <button
                      onClick={() => { setFileMenuOpen(false); setFileSubmenu(null); importJsonInputRef.current?.click(); }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      title="Replace the current diagram contents with the first diagram in a JSON file"
                    >
                      JSON
                    </button>
                    <button
                      onClick={() => { setFileMenuOpen(false); setFileSubmenu(null); importXmlInputRef.current?.click(); }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      title="Replace the current diagram contents with the first diagram in an XML file"
                    >
                      XML
                    </button>
                    <button
                      onClick={() => { setFileMenuOpen(false); setFileSubmenu(null); importTemplatesInputRef.current?.click(); }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      title="Import templates from a .diag_tems file"
                    >
                      Templates
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
          </>
        )}

        {!readOnly && (
          <div className="relative" ref={clearMenuRef}>
            <button
              onClick={() => {
                if (data.elements.length === 0 && data.connectors.length === 0) return;
                setClearMenuOpen(prev => !prev);
              }}
              className="px-2 py-0.5 text-[11px] text-gray-700 border border-gray-300 rounded hover:bg-red-50 hover:border-red-300 hover:text-red-700"
              title="Clear diagram options"
            >
              Clear Diagram ▾
            </button>
            {clearMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded shadow-lg z-50">
                <button
                  onClick={() => { setClearMenuOpen(false); setClearConfirmOpen("all"); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Clear Diagram
                </button>
                <button
                  onClick={() => { setClearMenuOpen(false); setClearConfirmOpen("unselected"); }}
                  disabled={selectedElementIds.size === 0}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={selectedElementIds.size === 0 ? "Select one or more elements first" : "Keep the selection (and connectors between selected elements); clear everything else"}
                >
                  Clear All but Selected
                  {selectedElementIds.size > 0 && (
                    <span className="text-gray-400 ml-1">({selectedElementIds.size})</span>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        <a
          href="/help"
          target="_blank"
          rel="noopener"
          className="text-[11px] text-gray-400 hover:text-blue-600"
          title="User Guide"
        >
          ?
        </a>
      </header>

      {/* Main editor area */}
      <div className="flex flex-1 overflow-hidden">
        {!readOnly && (
          <Palette
            diagramType={diagramType}
            onDragStart={(type, extras) => {
              setPendingDragSymbol(type);
              setPendingArchimateShapeKey(extras?.shapeKey ?? null);
              setPendingArchimateIconOnly(!!extras?.iconOnly);
            }}
            disabledSymbols={disabledSymbols}
            colorConfig={effectiveColorConfig}
          />
        )}

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
          pendingArchimateShapeKey={pendingArchimateShapeKey}
          pendingArchimateIconOnly={pendingArchimateIconOnly}
          defaultDirectionType={defaultDirectionType}
          defaultRoutingType={defaultRoutingType}
          onUpdateProperties={updateProperties}
          onUpdatePropertiesBatch={updatePropertiesBatch}
          onUpdateConnectorWaypoints={updateConnectorWaypoints}
          onUpdateConnectorLabel={updateConnectorLabel}
          onSplitConnector={splitConnector}
          onElementMoveEnd={elementMoveEnd}
          onMoveLaneBoundary={moveLaneBoundary}
          onResizeElementEnd={resizeElementEnd}
          onLaneBoundaryMoveEnd={laneBoundaryMoveEnd}
          onConnectorWaypointDragEnd={connectorWaypointDragEnd}
          onNudgeConnector={nudgeConnector}
          onNudgeConnectorEndpoint={nudgeConnectorEndpoint}
          onUpdateCurveHandles={updateCurveHandles}
          onUpdateConnectorFields={updateConnectorFields}
          colorConfig={effectiveColorConfig}
          displayMode={displayMode}
          debugMode={debugMode}
          getViewportCenterRef={getViewportCenterRef}
          diagramName={diagramName}
          createdAt={createdAt}
          updatedAt={effectiveUpdatedAt}
          readOnly={readOnly}
          onDrillIntoSubprocess={handleDrillIntoSubprocess}
          onDrillBack={parentDiagram ? handleDrillBack : undefined}
          parentDiagramName={parentDiagram?.name}
          showValueDisplay={showValueDisplay}
          showBottleneck={showBottleneck}
          onInsertSpace={(diagramType === "bpmn" || diagramType === "state-machine") ? insertSpace : undefined}
          onAddSelfTransition={diagramType === "state-machine" ? addSelfTransition : undefined}
        />

        {!readOnly && (
          <PropertiesPanel
            element={selectedElement}
            connector={selectedConnector}
            diagramType={diagramType}
            multiSelectionCount={selectedElementIds.size}
            onUpdateLabel={updateLabel}
            onUpdateProperties={updateProperties}
            onUpdateConnectorDirection={updateConnectorDirection}
            onUpdateConnectorType={updateConnectorType}
            onReverseConnector={reverseConnector}
            onUpdateConnectorLabel={(id, label) => updateConnectorLabel(id, label)}
            onUpdateConnectorFields={updateConnectorFields}
            onDeleteElement={(id) => {
              deleteElement(id);
              setSelectedElementIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
            }}
            onDeleteConnector={(id) => {
              deleteConnector(id);
              setSelectedConnectorId(null);
            }}
            onAddLane={addLane}
            onAddSublane={addSublane}
            onReorderLane={reorderLane}
            parentName={parentName}
            poolHasContent={poolHasContent}
            laneHasContent={laneHasContent}
            hasMessageBpmnConnection={hasMessageBpmnConnection}
            allConnectors={data.connectors}
            allElements={data.elements}
            debugMode={debugMode}
            diagramName={diagramName}
            diagramTitle={data.title}
            database={data.database}
            onSetDatabase={diagramType === "domain" ? setDatabase : undefined}
            onUpdateDiagramTitle={updateDiagramTitle}
            createdAt={createdAt}
            updatedAt={effectiveUpdatedAt}
            siblingDiagrams={siblingDiagrams}
            currentDiagramId={diagramId}
            onFlipForkJoin={flipForkJoin}
            onConvertTaskSubprocess={convertTaskSubprocess}
            onConvertProcessCollapsed={convertProcessCollapsed}
            onConvertEventType={convertEventType}
            forceCollapseTitle={showAiPanel || showPlanPanel || showHistoryPanel}
          />
        )}

        {showAiPanel && (
          <AiPanel
            diagramType={diagramType}
            onApplyDiagram={(aiData: DiagramData) => {
              // Replace: set entire diagram data
              setData({
                ...data,
                elements: aiData.elements,
                connectors: aiData.connectors,
                viewport: aiData.viewport ?? data.viewport,
              });
            }}
            onAddToDiagram={(elements, connectors) => {
              applyTemplate(elements, connectors);
            }}
            onClose={() => setShowAiPanel(false)}
          />
        )}

        {showPlanPanel && (
          <PlanPanel
            diagramType={diagramType}
            isAdmin={isAdmin}
            currentElements={data.elements}
            currentConnectors={data.connectors}
            onApplyDiagram={(aiData: DiagramData) => {
              setData({
                ...data,
                elements: aiData.elements,
                connectors: aiData.connectors,
                viewport: aiData.viewport ?? data.viewport,
              });
            }}
            onClose={() => setShowPlanPanel(false)}
          />
        )}

        {showHistoryPanel && (
          <HistoryPanel
            diagramId={diagramId}
            hasUnsavedChanges={saveStatus === "unsaved"}
            onPreview={(previewData) => {
              // Load the snapshot into the canvas but do NOT save — user can save/discard
              setData({
                ...data,
                elements: previewData.elements,
                connectors: previewData.connectors,
                viewport: previewData.viewport ?? data.viewport,
                fontSize: previewData.fontSize ?? data.fontSize,
                connectorFontSize: previewData.connectorFontSize ?? data.connectorFontSize,
                titleFontSize: previewData.titleFontSize ?? data.titleFontSize,
                title: previewData.title ?? data.title,
                database: previewData.database ?? data.database,
              });
            }}
            onRestored={async () => {
              // Reload diagram from server (restore replaced it in DB)
              try {
                const res = await fetch(`/api/diagrams/${diagramId}`);
                if (res.ok) {
                  const fresh = await res.json();
                  setData(fresh.data);
                }
              } catch { /* ignore */ }
              setShowHistoryPanel(false);
            }}
            onClose={() => setShowHistoryPanel(false)}
          />
        )}
      </div>

      {showTemplateNameModal && (
        <TemplateNameModal
          onSave={templateEditState ? handleUpdateTemplate : (name: string) => handleConfirmTemplateName(name)}
          onClose={() => { setShowTemplateNameModal(false); setPendingTemplateData(null); setTemplateMode("idle"); }}
          initialName={templateEditState?.templateName}
          title={templateEditState ? "Update Template" : templateMode === "capturing-builtin" ? "Save Built-In Template" : "Save User Template"}
        />
      )}

      {templateImportInfo && (
        <InfoDialog
          title={templateImportInfo.title}
          lines={templateImportInfo.lines}
          onClose={() => setTemplateImportInfo(null)}
        />
      )}

      {templateDeleteConfirm && (
        <ConfirmDialog
          title="Delete Template"
          message={`Are you sure you want to delete the template "${templateDeleteConfirm.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            const { id, isBuiltIn } = templateDeleteConfirm;
            setTemplateDeleteConfirm(null);
            void handleDeleteTemplate(id, isBuiltIn);
          }}
          onCancel={() => setTemplateDeleteConfirm(null)}
        />
      )}

      {clearConfirmOpen === "all" && (() => {
        const elCount = data.elements.length;
        const conCount = data.connectors.length;
        return (
          <ConfirmDialog
            title="Clear Diagram"
            message={`This will remove ${elCount} element${elCount === 1 ? "" : "s"} and ${conCount} connector${conCount === 1 ? "" : "s"}. You can Ctrl+Z to undo.`}
            confirmLabel="Clear"
            onConfirm={() => { clearDiagram(); setClearConfirmOpen(null); }}
            onCancel={() => setClearConfirmOpen(null)}
          />
        );
      })()}

      {clearConfirmOpen === "unselected" && (() => {
        // Expand the selection the same way the reducer does so the
        // confirmation counts match what will actually be kept.
        const byId = new Map(data.elements.map(e => [e.id, e]));
        const keep = new Set<string>(selectedElementIds);
        for (const id of selectedElementIds) {
          let cur = byId.get(id);
          while (cur?.parentId) {
            if (keep.has(cur.parentId)) break;
            keep.add(cur.parentId);
            cur = byId.get(cur.parentId);
          }
        }
        for (const id of selectedElementIds) {
          const el = byId.get(id);
          if (el?.boundaryHostId) keep.add(el.boundaryHostId);
        }
        for (const el of data.elements) {
          if (el.boundaryHostId && keep.has(el.boundaryHostId)) keep.add(el.id);
        }
        const removeEl = data.elements.length - keep.size;
        const removeConn = data.connectors.filter(c =>
          !(keep.has(c.sourceId) && keep.has(c.targetId))
        ).length;
        return (
          <ConfirmDialog
            title="Clear All but Selected"
            message={`This will keep ${keep.size} element${keep.size === 1 ? "" : "s"} (selection plus their pools/lanes/hosts) and the connectors between them, and remove ${removeEl} other element${removeEl === 1 ? "" : "s"} plus ${removeConn} connector${removeConn === 1 ? "" : "s"}. You can Ctrl+Z to undo.`}
            confirmLabel="Clear others"
            onConfirm={() => { clearDiagramExcept(selectedElementIds); setClearConfirmOpen(null); }}
            onCancel={() => setClearConfirmOpen(null)}
          />
        );
      })()}

      {showSaveAs && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="px-5 pt-4 pb-2">
              <h2 className="text-base font-semibold text-gray-900">Save As</h2>
              <p className="mt-1 text-sm text-gray-600">
                Clones this diagram into the same project under a new name.
                The current diagram is not modified.
              </p>
            </div>
            <div className="px-5 py-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">New diagram name</label>
              <input
                autoFocus
                type="text"
                value={saveAsName}
                onChange={(e) => setSaveAsName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveAs();
                  if (e.key === "Escape") { setShowSaveAs(false); setSaveAsError(null); }
                }}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {saveAsError && <p className="mt-2 text-xs text-red-600">{saveAsError}</p>}
            </div>
            <div className="px-5 pb-4 pt-2 flex gap-2 justify-end">
              <button
                onClick={() => { setShowSaveAs(false); setSaveAsError(null); }}
                className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAs}
                disabled={!saveAsName.trim() || saveAsBusy}
                className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saveAsBusy ? "Saving\u2026" : "Save As"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin: pick the source list to EXPORT (User vs Built-In). */}
      {templateExportPrompt && isAdmin && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="px-5 pt-4 pb-2">
              <h2 className="text-base font-semibold text-gray-900">Export Templates</h2>
              <p className="mt-1 text-sm text-gray-600">
                Pick which template list to export as a <code>.diag_tems</code> file.
              </p>
            </div>
            <div className="px-5 pb-4 pt-2 flex gap-2 justify-end">
              <button
                onClick={() => setTemplateExportPrompt(false)}
                className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setTemplateExportPrompt(false);
                  setFileMenuOpen(false);
                  setFileSubmenu(null);
                  handleExportTemplates("user");
                }}
                className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                User templates
              </button>
              <button
                onClick={() => {
                  setTemplateExportPrompt(false);
                  setFileMenuOpen(false);
                  setFileSubmenu(null);
                  handleExportTemplates("builtin");
                }}
                className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
              >
                Built-In templates
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin: pick the destination list to IMPORT into. */}
      {templateImportFile && isAdmin && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="px-5 pt-4 pb-2">
              <h2 className="text-base font-semibold text-gray-900">Import Templates</h2>
              <p className="mt-1 text-sm text-gray-600">
                Importing <span className="font-mono">{templateImportFile.name}</span>.
                Pick the destination list. Duplicates (by name) are skipped.
              </p>
            </div>
            <div className="px-5 pb-4 pt-2 flex gap-2 justify-end">
              <button
                onClick={() => setTemplateImportFile(null)}
                className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const f = templateImportFile;
                  setTemplateImportFile(null);
                  if (f) await handleImportTemplatesFile(f, "user");
                }}
                className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                User templates
              </button>
              <button
                onClick={async () => {
                  const f = templateImportFile;
                  setTemplateImportFile(null);
                  if (f) await handleImportTemplatesFile(f, "builtin");
                }}
                className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
              >
                Built-In templates
              </button>
            </div>
          </div>
        </div>
      )}

      {unsavedDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="px-5 pt-4 pb-2">
              <h2 className="text-base font-semibold text-gray-900">Unsaved changes</h2>
              <p className="mt-1 text-sm text-gray-600">
                This diagram has unsaved edits. Save them before leaving?
              </p>
            </div>
            <div className="px-5 pb-4 pt-2 flex gap-2 justify-end">
              <button
                onClick={() => unsavedDialog.resolve("cancel")}
                className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => unsavedDialog.resolve("discard")}
                className="px-3 py-1.5 text-sm text-red-700 border border-red-300 rounded hover:bg-red-50"
                title="Leave without saving — your changes will be lost"
              >
                Discard &amp; Leave
              </button>
              <button
                onClick={() => unsavedDialog.resolve("save")}
                className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
                autoFocus
              >
                Save &amp; Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdminPasswordModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setShowAdminPasswordModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-sm flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="text-sm font-semibold text-gray-800">Admin Access Required</h2>
              <button onClick={() => setShowAdminPasswordModal(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const pwd = (e.currentTarget.elements.namedItem("adminPwd") as HTMLInputElement).value;
                if (pwd === "!Aardwolf2026") {
                  setShowAdminPasswordModal(false);
                  setTemplateMode("capturing-builtin");
                } else {
                  alert("Invalid admin password");
                }
              }}
              className="px-4 py-4"
            >
              <label className="block text-xs text-gray-600 mb-1">Enter admin password to create built-in templates</label>
              <input
                name="adminPwd"
                type="password"
                autoFocus
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Admin password..."
              />
            </form>
            <div className="flex justify-end gap-2 px-4 py-3 border-t">
              <button
                type="button"
                onClick={() => setShowAdminPasswordModal(false)}
                className="px-2 py-0.5 text-[11px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const input = document.querySelector<HTMLInputElement>("input[name=adminPwd]");
                  if (input?.value === "!Aardwolf2026") {
                    setShowAdminPasswordModal(false);
                    setTemplateMode("capturing-builtin");
                  } else {
                    alert("Invalid admin password");
                  }
                }}
                className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-700"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {showDiagramMaintenance && (
        <DiagramColorModal
          diagramId={diagramId}
          diagramType={diagramType}
          projectColors={{ ...DEFAULT_SYMBOL_COLORS, ...projectColorConfig }}
          initialColorConfig={diagramColorConfig}
          displayMode={displayMode}
          onDisplayModeChange={handleToggleDisplayMode}
          debugMode={debugMode}
          onDebugModeChange={(on) => {
            setDebugMode(on);
            if (typeof window !== "undefined") {
              localStorage.setItem(`debug-${projectId}`, on ? "true" : "false");
            }
          }}
          showValueDisplay={showValueDisplay}
          onShowValueDisplayChange={(on) => {
            setShowValueDisplay(on);
            localStorage.setItem(`valueDisplay-${diagramId}`, on ? "true" : "false");
          }}
          showBottleneck={showBottleneck}
          onShowBottleneckChange={(on) => {
            setShowBottleneck(on);
            localStorage.setItem(`bottleneck-${diagramId}`, on ? "true" : "false");
          }}
          fontSize={data.fontSize}
          onFontSizeChange={setFontSize}
          connectorFontSize={data.connectorFontSize}
          onConnectorFontSizeChange={setConnectorFontSize}
          titleFontSize={data.titleFontSize}
          onTitleFontSizeChange={setTitleFontSize}
          poolFontSize={data.poolFontSize}
          onPoolFontSizeChange={setPoolFontSize}
          laneFontSize={data.laneFontSize}
          onLaneFontSizeChange={setLaneFontSize}
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
