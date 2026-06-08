"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { useDiagram, nanoid } from "@/app/hooks/useDiagram";
import { Canvas } from "@/app/components/canvas/Canvas";
import { Palette } from "@/app/components/canvas/Palette";
import { PropertiesPanel } from "@/app/components/canvas/PropertiesPanel";
import { captureTemplate, instantiateTemplate } from "@/app/lib/diagram/templates";
import { ImpersonationBanner } from "@/app/components/ImpersonationBanner";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { InfoDialog } from "@/app/components/InfoDialog";
import { AiPanel } from "./AiPanel";
import { PlanPanel } from "./PlanPanel";
import { SendForReviewDialog } from "./SendForReviewDialog";
import { AlertDialog } from "@/app/components/AlertDialog";
import { DiagramatixThrobber } from "@/app/components/DiagramatixThrobber";
import { checkDiagram, rulesMetadata, type Violation } from "@/app/lib/diagram/checks/diagramChecks";
import { HistoryPanel } from "./HistoryPanel";

interface VisioImportResult {
  // `data` is the parsed DiagramData payload — present only on overwrite
  // responses so the in-editor flow can push the new content into the
  // reducer without a page reload. On a fresh-create import we don't
  // need it (the user navigates to the new diagram via "Open Diagram"
  // and the standard page-load path fetches the data).
  diagram: { id: string; data?: DiagramData };
  warnings: string[];
  stats: {
    totalShapesOnPage: number;
    elementsCreated: number;
    connectorsCreated: number;
    shapesSkipped: number;
    connectorsSkipped: number;
    implicitPools: number;
    masters: { masterId: string; nameU: string; count: number; classifiedAs: string }[];
  };
}

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
  impersonationMode?: "view" | "edit";
  version?: number;
  /** Subscription per-diagram element cap for THIS diagram's type.
   *  null when the tier is unlimited or the user is a superuser. The
   *  client-side ADD gate compares (current node count + 1) against
   *  this value and shows a toast when blocked. */
  elementCountLimit?: number | null;
  /** Current Diagram Owner (hard FK to a registered user). The project
   *  owner by default; reassignable per-diagram by the project owner.
   *  Null for legacy diagrams whose backfill didn't catch them and for
   *  legacy orphan diagrams with no project. */
  initialDiagramOwner?: { id: string; name: string | null; email: string } | null;
  /** Pool of users the Diagram Owner picker offers. Project owner plus
   *  every user the project is shared with. Empty for legacy orphans. */
  diagramOwnerCandidates?: { id: string; name: string | null; email: string }[];
  /** Whether the picker is editable. True only when the caller is the
   *  project owner. Server still re-checks every PUT regardless. */
  canEditDiagramOwner?: boolean;
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
  impersonationMode,
  version,
  elementCountLimit,
  initialDiagramOwner,
  diagramOwnerCandidates = [],
  canEditDiagramOwner = false,
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

  // Current Diagram Owner. Held client-side so a successful PATCH
  // updates the PropertiesPanel display immediately, no reload. Server
  // is the source of truth — re-pulled if a fetch goes stale (e.g. the
  // user is removed from the project and the field gets cleared).
  const [diagramOwner, setDiagramOwnerState] = useState<
    { id: string; name: string | null; email: string } | null
  >(initialDiagramOwner ?? null);
  // Optimistic save: replace state, PATCH, roll back if the server
  // rejects. The PUT route on /api/diagrams/[id] enforces the project-
  // owner-only rule itself (Slice 3) — we never trust canEditDiagramOwner
  // alone, but it does decide whether the picker is rendered at all.
  const [diagramOwnerError, setDiagramOwnerError] = useState<string | null>(null);
  const setDiagramOwner = useCallback(async (userId: string | null) => {
    if (!canEditDiagramOwner) return;
    const target = userId
      ? diagramOwnerCandidates.find(c => c.id === userId) ?? null
      : null;
    const previous = diagramOwner;
    setDiagramOwnerState(target);
    setDiagramOwnerError(null);
    try {
      const res = await fetch(`/api/diagrams/${diagramId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagramOwnerId: userId }),
      });
      if (!res.ok) throw new Error((await res.text()) || res.statusText);
    } catch (err) {
      setDiagramOwnerState(previous);
      setDiagramOwnerError(err instanceof Error ? err.message : String(err));
    }
  }, [diagramId, canEditDiagramOwner, diagramOwnerCandidates, diagramOwner]);

  // The parent diagram (top of stack) — if we got here via drill-down
  const [parentDiagram, setParentDiagram] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    const stack = getDrillStack();
    const top = stack.length > 0 ? stack[stack.length - 1] : null;
    setParentDiagram(top);
  }, []);

  // Sibling diagrams in the same project (for subprocess linking AND for
  // the prev/next folder-mate navigation buttons in the top bar).
  const [siblingDiagrams, setSiblingDiagrams] = useState<{ id: string; name: string; type: string }[]>([]);
  // Project folder structure — used to scope the prev/next buttons to the
  // CURRENT folder, not the whole project. Shape mirrors the FolderTree
  // type used in ProjectDetailClient.
  const [folderTree, setFolderTree] = useState<{
    folders?: { id: string; name: string; parentId: string | null }[];
    diagramFolderMap?: Record<string, string>;
    diagramOrder?: Record<string, string[]>;
  } | null>(null);
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
        if (data?.folderTree) setFolderTree(data.folderTree);
      })
      .catch(() => {});
  }, [projectId, diagramId]);

  // Compute prev / next diagram in the SAME folder. Folder identification:
  //   - diagramFolderMap[currentId] → folderId. Missing → project root.
  //   - diagramOrder[folderId] gives the canonical UI order. Fallback when
  //     the array is missing or doesn't include the current diagram: use
  //     the FILTERED sibling list ordered by name, with the current
  //     diagram itself inserted in place.
  const folderMates = (() => {
    if (!projectId) return null;
    const allInProject = (() => {
      const list: { id: string; name: string }[] = siblingDiagrams.map(d => ({ id: d.id, name: d.name }));
      return list;
    })();
    const folderId = folderTree?.diagramFolderMap?.[diagramId] ?? null;
    // Diagrams in the same folder as the current one (or all at root if
    // the current is at root).
    const sameFolderIds = new Set<string>();
    if (folderTree?.diagramFolderMap) {
      for (const [id, fId] of Object.entries(folderTree.diagramFolderMap)) {
        if ((folderId === null && !fId) || fId === folderId) sameFolderIds.add(id);
      }
    }
    // Anything in the project not present in diagramFolderMap is at root.
    if (folderId === null) {
      for (const s of allInProject) {
        if (!folderTree?.diagramFolderMap || folderTree.diagramFolderMap[s.id] === undefined) {
          sameFolderIds.add(s.id);
        }
      }
      if (!folderTree?.diagramFolderMap || folderTree.diagramFolderMap[diagramId] === undefined) {
        sameFolderIds.add(diagramId);
      }
    }

    // Canonical order from diagramOrder if it covers this folder; else
    // alphabetical by name including the current diagram.
    const canonicalOrder = (folderId !== null
      ? folderTree?.diagramOrder?.[folderId]
      : folderTree?.diagramOrder?.root) ?? [];
    let ordered: string[];
    if (canonicalOrder.length > 0 && canonicalOrder.includes(diagramId)) {
      ordered = canonicalOrder.filter((id) => sameFolderIds.has(id));
      // Append any folder-mates missing from the canonical order (defensive).
      for (const id of sameFolderIds) if (!ordered.includes(id)) ordered.push(id);
    } else {
      // Include the current diagram with its REAL name so the alphabetical
      // sort places it correctly relative to its folder-mates. (Earlier
      // versions used a placeholder name like "(current)" which sorted to
      // index 0 and disabled the previous button on every navigation.)
      const withSelf = [
        ...siblingDiagrams.filter(d => sameFolderIds.has(d.id)).map(d => ({ id: d.id, name: d.name })),
        { id: diagramId, name: (diagramName ?? "").trim() },
      ];
      withSelf.sort((a, b) => a.name.localeCompare(b.name));
      ordered = withSelf.map(d => d.id);
    }

    const idx = ordered.indexOf(diagramId);
    if (idx === -1) return null;
    const prevId = idx > 0 ? ordered[idx - 1] : null;
    const nextId = idx < ordered.length - 1 ? ordered[idx + 1] : null;
    const nameOf = (id: string) =>
      siblingDiagrams.find(d => d.id === id)?.name ?? "(diagram)";
    return {
      prevId,
      nextId,
      prevName: prevId ? nameOf(prevId) : null,
      nextName: nextId ? nameOf(nextId) : null,
      position: idx + 1,
      total: ordered.length,
    };
  })();

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
    // Always navigate directly to the project (or dashboard if no project).
    // Previously this fell through to router.back() which walked browser
    // history one diagram at a time — when the user had clicked through
    // several diagrams via the prev/next folder traversal, "Back to
    // Project" would step through each visited diagram instead of
    // jumping straight to the project screen.
    router.push(projectId ? `/dashboard/projects/${projectId}` : "/dashboard");
  }, [router, projectId]);

  const {
    data,
    addElement,
    moveElement,
    resizeElement,
    resizeElementEnd,
    updateLabel,
    beginLabelEdit,
    updateLabelLive,
    cancelLabelEdit,
    updateProperties,
    updatePropertiesBatch,
    setEventBoundary,
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
    setProcessFontSize,
    setDatabase,
    setProcessOwner,
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
    removeSpace,
    addLane,
    addSublane,
    reorderLane,
    moveLaneBoundary,
    laneBoundaryMoveEnd,
    moveElements,
    elementsMoveEnd,
    swapLane,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useDiagram(initialData);

  // Subscription element-count gate. addElementGated wraps the reducer's
  // addElement: when the user's tier sets a finite cap and the current
  // node count is at or above it, we show a brief toast banner and
  // refuse the add. Artifacts (data-object / data-store / text-
  // annotation) don't count toward the cap, so we let them through.
  const ARTIFACT_TYPES_GATED = new Set(["data-object", "data-store", "text-annotation"]);
  const [elementLimitToast, setElementLimitToast] = useState<string | null>(null);
  useEffect(() => {
    if (!elementLimitToast) return;
    const t = setTimeout(() => setElementLimitToast(null), 4000);
    return () => clearTimeout(t);
  }, [elementLimitToast]);
  const addElementGated: typeof addElement = (symbolType, position, taskType, eventType, id, initial) => {
    if (typeof elementCountLimit === "number" && !ARTIFACT_TYPES_GATED.has(symbolType)) {
      const nodes = data.elements.filter(e => !ARTIFACT_TYPES_GATED.has(e.type)).length;
      if (nodes >= elementCountLimit) {
        setElementLimitToast(
          `Element limit reached (${nodes}/${elementCountLimit}). Upgrade your subscription to add more.`,
        );
        return;
      }
    }
    addElement(symbolType, position, taskType, eventType, id, initial);
  };

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
  const [aiPanelGenerating, setAiPanelGenerating] = useState(false);
  const [aiPanelNarrativeGenerating, setAiPanelNarrativeGenerating] = useState(false);
  const [showPlanPanel, setShowPlanPanel] = useState(false);
  const [showSendReview, setShowSendReview] = useState(false);
  const [reviewSentMsg, setReviewSentMsg] = useState<string | null>(null);

  // Review Mode — active when the diagram was opened from a Received-for-
  // Review tile (?review=<reviewId>). Surfaces the review-comment symbol,
  // a context banner, and Submit/Decline.
  const searchParams = useSearchParams();
  const reviewIdParam = searchParams.get("review");
  const [reviewCtx, setReviewCtx] = useState<{
    reviewId: string; diagramId: string; objective: string; dueDate: string; status: string;
    requesterName: string; requesterEmail: string; isRequester: boolean;
    myStatus: string | null; myUserId: string; myName: string | null; myEmail: string | null;
  } | null>(null);
  const [reviewActionMsg, setReviewActionMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!reviewIdParam) { setReviewCtx(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/reviews/${reviewIdParam}`);
        if (!res.ok) return;
        const ctx = await res.json();
        if (!cancelled) setReviewCtx(ctx);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [reviewIdParam]);

  const reviewMode = !!reviewCtx && !reviewCtx.isRequester;

  async function reviewStatusAction(action: "submit" | "decline" | "approve") {
    if (!reviewCtx) return;
    try {
      const res = await fetch(`/api/reviews/${reviewCtx.reviewId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) return;
      const d = await res.json();
      setReviewCtx((prev) => (prev ? { ...prev, myStatus: d.status } : prev));
      setReviewActionMsg(
        action === "decline" ? "You declined this review."
        : action === "approve" ? "Approved — thank you!"
        : "Comments submitted — thank you!",
      );
    } catch { /* ignore */ }
  }

  // Owner-side reviewer filter — show all / none / a single reviewer's
  // review-comments on the canvas. Distinct commenters are derived from
  // the review-comment elements already on the diagram.
  const [reviewFilter, setReviewFilter] = useState<string>("all");
  const reviewCommenters = useMemo(() => {
    const seen = new Map<string, string>();
    for (const el of data.elements) {
      if (el.type !== "review-comment") continue;
      const id = (el.properties?.reviewerId as string | undefined) ?? "";
      if (!id || seen.has(id)) continue;
      seen.set(id, (el.properties?.reviewerName as string | undefined) ?? "Reviewer");
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [data.elements]);

  // What the canvas actually renders. When a filter is active we drop the
  // hidden review-comment elements AND their review-comment-link
  // connectors — never any real diagram content, and never the saved
  // `data` (autosave/export keep the full set).
  const displayData = useMemo(() => {
    if (reviewFilter === "all") return data;
    const hiddenIds = new Set(
      data.elements
        .filter((el) => el.type === "review-comment" &&
          (reviewFilter === "none" || (el.properties?.reviewerId as string | undefined) !== reviewFilter))
        .map((el) => el.id),
    );
    if (hiddenIds.size === 0) return data;
    return {
      ...data,
      elements: data.elements.filter((el) => !hiddenIds.has(el.id)),
      connectors: data.connectors.filter((c) =>
        c.type !== "review-comment-link" || (!hiddenIds.has(c.sourceId) && !hiddenIds.has(c.targetId))),
    };
  }, [data, reviewFilter]);
  // Mirror of PlanPanel's `busy` state so we can overlay a centred
  // wait indicator on the canvas while Sonnet plans. Sidebar banner
  // alone is easy to miss when the user's eyes are on the diagram.
  const [aiBusy, setAiBusy] = useState<"plan" | "apply" | "save" | "load" | "narrative" | null>(null);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  // Value Display and Bottleneck Display are ON by default. The user can
  // turn them off, in which case the explicit "false" value is read back
  // from localStorage on subsequent loads. Absence of the key keeps the
  // default ON.
  const [showValueDisplay, setShowValueDisplay] = useState(true);
  const [showBottleneck, setShowBottleneck] = useState(true);
  useEffect(() => {
    if (localStorage.getItem(`debug-${projectId}`) === "true") setDebugMode(true);
    if (localStorage.getItem(`valueDisplay-${diagramId}`) === "false") setShowValueDisplay(false);
    if (localStorage.getItem(`bottleneck-${diagramId}`) === "false") setShowBottleneck(false);
  }, [projectId, diagramId]);

  // Template state (BPMN only)
  const isAdmin = userEmail?.toLowerCase() === "paul@nashcc.com.au";
  type TemplateRow = { id: string; name: string; group: string | null };
  const [userTemplates, setUserTemplates] = useState<TemplateRow[]>([]);
  const [builtInTemplates, setBuiltInTemplates] = useState<TemplateRow[]>([]);
  // Per-user collapse state, keyed `<scope>:<group-name>` (scope = "user"
  // or "builtin"). true = collapsed. Loaded from /api/templates/group-prefs
  // on mount and updated optimistically on every toggle.
  const [templateGroupCollapsed, setTemplateGroupCollapsed] = useState<Record<string, boolean>>({});
  // Which template (if any) is showing a "Move to group..." submenu, and
  // whether it's in the typed-new-group mode.
  const [templateMoveMenu, setTemplateMoveMenu] = useState<{
    templateId: string;
    scope: "user" | "builtin";
    currentGroup: string | null;
    typing: boolean;
    typedName: string;
  } | null>(null);
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
  const importVisioInputRef = useRef<HTMLInputElement>(null);
  const importBpmnInputRef = useRef<HTMLInputElement>(null);
  // Admin-only: prompt the admin to pick the destination list when
  // exporting or importing templates. Non-admins skip the prompt.
  const [templateExportPrompt, setTemplateExportPrompt] = useState(false);
  const [templateImportFile, setTemplateImportFile] = useState<File | null>(null);
  const [visioImportStatus, setVisioImportStatus] = useState<VisioImportResult | null>(null);
  // Pending Visio import awaiting the user's overwrite-vs-create decision.
  // Set when the chosen .vsdx file's basename matches the current
  // diagram's name; cleared by the ConfirmDialog's Cancel / OK handlers
  // (which kick off the right runner for the file kind). The same state
  // covers both Visio (.vsdx) and BPMN (.bpmn) imports — the dialog
  // branches on `kind`.
  const [pendingVisioImport, setPendingVisioImport] = useState<
    { file: File; baseName: string; kind?: "visio" | "bpmn" } | null
  >(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState<null | "all" | "unselected">(null);
  // Pending import confirmation: holds the parsed-first-diagram payload
  // and the message to show. The dialog's Confirm handler applies it.
  // Replaces a pair of native window.confirm() prompts that the user
  // found jarring next to the rest of the Diagramatix-styled dialogs.
  const [pendingImport, setPendingImport] = useState<null | {
    message: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apply: () => void;
  }>(null);
  const [clearMenuOpen, setClearMenuOpen] = useState(false);
  const clearMenuRef = useRef<HTMLDivElement>(null);
  // Per-diagram "Scan for Issues" (BPMN only) — runs the shared rule registry
  // on the live diagram client-side; null = modal closed.
  const [diagramScan, setDiagramScan] = useState<Violation[] | null>(null);
  // Position + drag state for the Diagram Issues popup. The popup is
  // draggable so the user can move it aside to inspect canvas elements
  // sitting behind it while reading the violation list — a hard
  // requirement from 2026-06-07 testing. Position is in viewport
  // coordinates (window.innerWidth / window.innerHeight space).
  const [diagramScanPos, setDiagramScanPos] = useState<{ x: number; y: number } | null>(null);
  const [diagramScanDrag, setDiagramScanDrag] = useState<{ ox: number; oy: number } | null>(null);
  // Collapsible state for the Errors / Warnings sections inside the dialog.
  const [scanErrorsOpen, setScanErrorsOpen] = useState(true);
  const [scanWarningsOpen, setScanWarningsOpen] = useState(true);
  // Review Mode — after the user closes the scan dialog they step through
  // the flagged elements one by one. `accepted` is the set of indices into
  // `violations` the user has dismissed in this session; running a new scan
  // resets it. Outlines persist until the user clicks Exit (no timer).
  const [reviewIssues, setReviewIssues] = useState<{
    violations: Violation[];
    accepted: Set<number>;
    cursor: number;
  } | null>(null);

  const activeIssues = useMemo(() => {
    if (!reviewIssues) return null;
    return reviewIssues.violations
      .map((v, i) => ({ v, i }))
      .filter(({ i }) => !reviewIssues.accepted.has(i));
  }, [reviewIssues]);

  const currentIssue = activeIssues && activeIssues.length > 0
    ? activeIssues[Math.min(reviewIssues!.cursor, activeIssues.length - 1)]
    : null;

  // Tint every (non-accepted) flagged element while review is active. Worst-
  // severity wins when one element is hit by both an error and a warning.
  const scanHighlight = useMemo<Map<string, "error" | "warning"> | null>(() => {
    if (!activeIssues || activeIssues.length === 0) return null;
    const elIds = new Set(data.elements.map((e) => e.id));
    const m = new Map<string, "error" | "warning">();
    for (const { v } of activeIssues) {
      for (const id of v.ids) {
        if (!elIds.has(id)) continue; // skip connector ids / dangling refs
        if (v.severity === "error" || !m.has(id)) m.set(id, v.severity);
      }
    }
    return m.size > 0 ? m : null;
  }, [activeIssues, data.elements]);

  // Parallel highlight map for connectors — same severity-wins rule but keyed
  // by connector id. Drives the orange overlay path drawn in Canvas.
  const scanConnectorHighlight = useMemo<Map<string, "error" | "warning"> | null>(() => {
    if (!activeIssues || activeIssues.length === 0) return null;
    const connIds = new Set(data.connectors.map((c) => c.id));
    const m = new Map<string, "error" | "warning">();
    for (const { v } of activeIssues) {
      for (const id of v.ids) {
        if (!connIds.has(id)) continue;
        if (v.severity === "error" || !m.has(id)) m.set(id, v.severity);
      }
    }
    return m.size > 0 ? m : null;
  }, [activeIssues, data.connectors]);

  /** Ids that belong to the issue the cursor is currently sitting on.
   *  Canvas uses this to render full-strength tint on these and fade
   *  every other flagged element/connector so the user can see at a
   *  glance which issue they're on while keeping the wider scan
   *  context visible. */
  const currentIssueIds = useMemo<Set<string>>(() => {
    if (!currentIssue) return new Set();
    return new Set(currentIssue.v.ids);
  }, [currentIssue]);

  const closeDiagramScan = useCallback(() => {
    if (diagramScan && diagramScan.length > 0) {
      setReviewIssues({ violations: diagramScan, accepted: new Set(), cursor: 0 });
    }
    setDiagramScan(null);
    setDiagramScanPos(null); // re-centre next time the popup opens
  }, [diagramScan]);

  // Position the Diagram Issues popup near the top-left of the canvas
  // when it first opens. Top-aligned (not centred) so it doesn't cover
  // the elements the user is investigating — and from there it's
  // freely draggable via the header. Cleared by closeDiagramScan.
  useEffect(() => {
    if (diagramScan !== null && diagramScanPos === null) {
      const POPUP_WIDTH = 576; // matches max-w-xl
      const x = Math.max(16, window.innerWidth / 2 - POPUP_WIDTH / 2);
      const y = 80; // below the editor's top toolbar
      setDiagramScanPos({ x, y });
    }
  }, [diagramScan, diagramScanPos]);

  // Global mousemove / mouseup listeners while a drag is active. The
  // drag-start handler lives on the popup header in the JSX below;
  // these effects own the movement + release.
  useEffect(() => {
    if (!diagramScanDrag || !diagramScanPos) return;
    const POPUP_WIDTH = 576;
    const HEADER_VISIBLE_MIN = 80; // always leave at least this much header visible on-screen
    const onMove = (e: MouseEvent) => {
      const rawX = e.clientX - diagramScanDrag.ox;
      const rawY = e.clientY - diagramScanDrag.oy;
      const x = Math.max(
        -(POPUP_WIDTH - HEADER_VISIBLE_MIN),
        Math.min(window.innerWidth - HEADER_VISIBLE_MIN, rawX),
      );
      const y = Math.max(0, Math.min(window.innerHeight - HEADER_VISIBLE_MIN, rawY));
      setDiagramScanPos({ x, y });
    };
    const onUp = () => setDiagramScanDrag(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [diagramScanDrag, diagramScanPos]);

  const reviewNext = useCallback(() => {
    setReviewIssues((r) => {
      if (!r) return r;
      const active = r.violations.map((v, i) => ({ v, i })).filter(({ i }) => !r.accepted.has(i));
      if (active.length === 0) return null;
      return { ...r, cursor: Math.min(r.cursor + 1, active.length - 1) };
    });
  }, []);
  const reviewPrev = useCallback(() => {
    setReviewIssues((r) => (r ? { ...r, cursor: Math.max(0, r.cursor - 1) } : r));
  }, []);
  const reviewAcceptCurrent = useCallback(() => {
    setReviewIssues((r) => {
      if (!r) return r;
      const active = r.violations.map((v, i) => ({ v, i })).filter(({ i }) => !r.accepted.has(i));
      const idx = active.length > 0 ? active[Math.min(r.cursor, active.length - 1)].i : -1;
      if (idx < 0) return null;
      const accepted = new Set(r.accepted);
      accepted.add(idx);
      const newActive = r.violations.map((v, i) => ({ v, i })).filter(({ i }) => !accepted.has(i));
      if (newActive.length === 0) return null;
      return { ...r, accepted, cursor: Math.min(r.cursor, newActive.length - 1) };
    });
  }, []);
  const reviewExit = useCallback(() => setReviewIssues(null), []);

  // When the cursor lands on an issue, select the flagged target on the
  // canvas. Prefer the LAST id in violation.ids (heuristic: child for
  // containment) and route element ids to setSelectedElementIds, connector
  // ids to setSelectedConnectorId.
  useEffect(() => {
    if (!currentIssue) return;
    const elIds = new Set(data.elements.map((e) => e.id));
    const connIds = new Set(data.connectors.map((c) => c.id));
    for (const id of [...currentIssue.v.ids].reverse()) {
      if (elIds.has(id)) {
        setSelectedElementIds(new Set([id]));
        setSelectedConnectorId(null);
        return;
      }
      if (connIds.has(id)) {
        setSelectedConnectorId(id);
        setSelectedElementIds(new Set());
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIssue?.i]);

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
          const list = await r1.json() as { id: string; name: string; diagramType: string; group: string | null }[];
          setUserTemplates(
            list
              .filter((t) => t.diagramType === "bpmn")
              .map((t) => ({ id: t.id, name: t.name, group: t.group ?? null })),
          );
        }
      } catch {}
      try {
        const r2 = await fetch("/api/templates?type=builtin");
        if (r2.ok) {
          const list = await r2.json() as { id: string; name: string; diagramType: string; group: string | null }[];
          setBuiltInTemplates(
            list
              .filter((t) => t.diagramType === "bpmn")
              .map((t) => ({ id: t.id, name: t.name, group: t.group ?? null })),
          );
        }
      } catch {}
      // Restore group-collapse state for this user. Failure is non-fatal —
      // all groups default to expanded.
      try {
        const rp = await fetch("/api/templates/group-prefs");
        if (rp.ok) {
          const { prefs } = await rp.json() as { prefs: Record<string, boolean> };
          if (prefs && typeof prefs === "object") setTemplateGroupCollapsed(prefs);
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
        setTemplateMoveMenu(null);
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

  // Review Mode: place a pink note (pre-filled with the reviewer's name +
  // email) and, when dropped over an element, a review-comment-link to it.
  const handleAddReviewComment = useCallback(
    (worldPos: { x: number; y: number }, targetElementId: string | null) => {
      if (!reviewCtx) return;
      const commentId = nanoid();
      const header = `${reviewCtx.myName ?? "Reviewer"}\n${reviewCtx.myEmail ?? ""}\n---\n`;
      addElementGated("review-comment", worldPos, undefined, undefined, commentId, {
        label: header,
        width: 170,
        height: 96,
        properties: {
          reviewId: reviewCtx.reviewId,
          reviewerId: reviewCtx.myUserId,
          reviewerName: reviewCtx.myName,
          reviewerEmail: reviewCtx.myEmail,
        },
      });
      if (targetElementId) {
        addConnector(commentId, targetElementId, "review-comment-link", "directed", "direct", "left", "right", undefined, undefined, true);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reviewCtx, addConnector]
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
      const message = diagCount > 1
        ? `This file contains ${diagCount} diagrams. Only the first one ("${first.name ?? "(unnamed)"}") will be imported into the current diagram, replacing its contents. Continue?`
        : `Replace the current diagram contents with the imported diagram "${first.name ?? "(unnamed)"}"? This cannot be undone.`;
      setPendingImport({
        message,
        apply: () => {
          setData(first.data);
          if (first.colorConfig && typeof first.colorConfig === "object") {
            setDiagramColorConfig(first.colorConfig as SymbolColorConfig);
          }
          if (typeof first.displayMode === "string") {
            setDisplayMode(first.displayMode as DisplayMode);
          }
        },
      });
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

  // Import a Visio (.vsdx) file from the in-editor menu.
  //
  // Two phases:
  //   1. handleImportVisioFile — entry point from the file input. If the
  //      .vsdx basename matches the current diagram's name, opens the
  //      overwrite-confirm dialog (Diagramatix's native ConfirmDialog,
  //      NOT window.confirm) and stashes the file for the dialog's
  //      onConfirm / onCancel handlers. Otherwise proceeds directly to
  //      the create path.
  //   2. runVisioImport — does the actual API call once the user has
  //      made a decision (or there was no name conflict). Called with
  //      `overwrite=true` from the dialog's OK handler, `false` from
  //      its Cancel handler or directly when no prompt is needed.
  async function handleImportVisioFile(file: File) {
    const baseName = file.name.replace(/\.vsdx$/i, "").trim() || "Imported Visio Diagram";
    if (baseName === diagramName) {
      setPendingVisioImport({ file, baseName, kind: "visio" });
      return;
    }
    await runVisioImport(file, baseName, false);
  }

  async function runVisioImport(file: File, baseName: string, overwrite: boolean) {
    try {
      const form = new FormData();
      form.append("file", file);
      if (projectId) form.append("projectId", projectId);
      form.append("name", baseName);
      if (overwrite) form.append("overwriteDiagramId", diagramId);
      const resp = await fetch("/api/import/visio-v3", { method: "POST", body: form });
      if (!resp.ok) {
        const txt = await resp.text();
        alert(`Visio import failed: ${txt || resp.statusText}`);
        return;
      }
      const result = await resp.json() as VisioImportResult & { overwrote?: boolean };
      if (result.overwrote && result.diagram?.data) {
        // Replace the in-memory reducer state with the imported parse
        // result. The auto-save's lastSaved ref still holds the OLD JSON
        // string, so it'll consider the diagram "unsaved" briefly until
        // the next user action — harmless visual nuance; the server has
        // the imported data committed.
        setData(result.diagram.data);
      }
      setVisioImportStatus(result);
    } catch (err) {
      alert(`Visio import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── BPMN file import (.bpmn — OMG BPMN 2.0 XML) ─────────────────────
  // Mirrors the Visio flow: name-conflict prompt → create-or-overwrite,
  // then surfaces the existing status modal. The single-file BPMN
  // endpoint accepts the same overwriteDiagramId field as the Visio
  // route. Stats reshaped into VisioImportResult so the modal renders.
  async function handleImportBpmnFile(file: File) {
    const baseName = file.name.replace(/\.bpmn$/i, "").replace(/\.xml$/i, "").trim() || "Imported BPMN Diagram";
    if (baseName === diagramName) {
      setPendingVisioImport({ file, baseName, kind: "bpmn" });
      return;
    }
    await runBpmnImport(file, baseName, false);
  }

  async function runBpmnImport(file: File, baseName: string, overwrite: boolean) {
    try {
      const form = new FormData();
      form.append("file", file);
      if (projectId) form.append("projectId", projectId);
      form.append("name", baseName);
      if (overwrite) form.append("overwriteDiagramId", diagramId);
      const resp = await fetch("/api/import/bpmn", { method: "POST", body: form });
      if (!resp.ok) {
        const txt = await resp.text();
        alert(`BPMN import failed: ${txt || resp.statusText}`);
        return;
      }
      const result = await resp.json() as {
        diagram: { id: string; data?: DiagramData };
        warnings: string[];
        stats: {
          processCount: number;
          participantCount: number;
          elementsCreated: number;
          connectorsCreated: number;
          shapesDropped: number;
          flowsDropped: number;
        };
        overwrote?: boolean;
      };
      if (result.overwrote && result.diagram?.data) {
        setData(result.diagram.data);
      }
      // Reshape into the existing single-import status modal shape.
      const reshaped: VisioImportResult & { overwrote?: boolean } = {
        diagram: result.diagram,
        warnings: [
          `Imported BPMN file (processes: ${result.stats.processCount}, participants: ${result.stats.participantCount}).`,
          ...result.warnings,
        ],
        stats: {
          totalShapesOnPage: result.stats.elementsCreated + result.stats.shapesDropped,
          elementsCreated: result.stats.elementsCreated,
          connectorsCreated: result.stats.connectorsCreated,
          shapesSkipped: result.stats.shapesDropped,
          connectorsSkipped: result.stats.flowsDropped,
          implicitPools: 0,
          masters: [],
        },
        overwrote: result.overwrote,
      };
      setVisioImportStatus(reshaped);
    } catch (err) {
      alert(`BPMN import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

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
          const list = await refresh.json() as { id: string; name: string; diagramType: string; group: string | null }[];
          const bpmnOnly: TemplateRow[] = list
            .filter((t) => t.diagramType === "bpmn")
            .map((t) => ({ id: t.id, name: t.name, group: t.group ?? null }));
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

  async function handleConfirmTemplateName(name: string, group: string | null) {
    if (!pendingTemplateData) return;
    const isBuiltIn = templateMode === "capturing-builtin";
    try {
      const body: Record<string, unknown> = { name, diagramType: "bpmn", data: pendingTemplateData, group };
      if (isBuiltIn) {
        body.templateType = "builtin";
        // No adminPassword payload — server gates by session (isSuperuser)
        // or by ADMIN_PASSWORD env var on the elevation path. Hardcoded
        // password string removed (was a leak in the client bundle).
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
        const createdRow: TemplateRow = {
          id: created.id,
          name: created.name,
          group: created.group ?? null,
        };
        if (isBuiltIn) {
          setBuiltInTemplates((prev) => [createdRow, ...prev]);
        } else {
          setUserTemplates((prev) => [createdRow, ...prev]);
        }
      }
    } catch (err) {
      console.error("Failed to save template:", err);
    }
    setPendingTemplateData(null);
    setShowTemplateNameModal(false);
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

  async function handleUpdateTemplate(newName: string, newGroup: string | null) {
    if (!templateEditState) return;

    const captured = captureTemplate(data.elements, data.connectors, selectedElementIds);
    if (captured.elements.length === 0) return;

    try {
      const res = await fetch(`/api/templates/${templateEditState.templateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, data: captured, group: newGroup }),
      });
      if (!res.ok) {
        console.error("Failed to update template:", res.status, await res.text());
      } else {
        const updater = (prev: TemplateRow[]) =>
          prev.map((t) => t.id === templateEditState.templateId
            ? { ...t, name: newName, group: newGroup }
            : t);
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

  /** Optimistic toggle of a template-group header's collapsed state.
   *  Persists to the user's row via /api/templates/group-prefs in the
   *  background — failure is silent (next reload re-reads server state). */
  function toggleTemplateGroupCollapse(scope: "user" | "builtin", group: string) {
    const key = `${scope}:${group}`;
    const next = !templateGroupCollapsed[key];
    setTemplateGroupCollapsed((p) => ({ ...p, [key]: next }));
    void fetch("/api/templates/group-prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, collapsed: next }),
    });
  }

  /** Move a template into a group (or out — newGroup = null). Updates the
   *  in-memory list and PATCHes the server. Closes the move-submenu. */
  async function moveTemplateToGroup(
    templateId: string,
    scope: "user" | "builtin",
    newGroup: string | null,
  ) {
    const trimmed = newGroup ? newGroup.trim() : null;
    const finalGroup = trimmed && trimmed.length > 0 ? trimmed : null;
    const setter = scope === "user" ? setUserTemplates : setBuiltInTemplates;
    setter((prev) => prev.map((t) => t.id === templateId ? { ...t, group: finalGroup } : t));
    setTemplateMoveMenu(null);
    try {
      await fetch(`/api/templates/${templateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group: finalGroup }),
      });
    } catch (err) {
      console.error("Failed to move template:", err);
    }
  }

  // The banner must render whenever an admin is impersonating, regardless
  // of view vs edit mode. Earlier this was gated on `readOnly`, which is
  // false in Edit Mode — so the admin saw no banner and no way to return
  // to their own account from inside a diagram.
  const isImpersonating = !!impersonationMode;

  return (
    <div className={`flex flex-col h-screen ${isImpersonating ? "bg-orange-50" : "bg-white"}`}>
      {isImpersonating && viewingAsName !== undefined && viewingAsEmail !== undefined && (
        <ImpersonationBanner viewingAsName={viewingAsName ?? ""} viewingAsEmail={viewingAsEmail ?? ""} mode={impersonationMode} currentDiagramId={diagramId} />
      )}
      {elementLimitToast && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-800 flex items-center justify-between">
          <span>{elementLimitToast}</span>
          <button
            onClick={() => setElementLimitToast(null)}
            className="text-red-700 hover:text-red-900 font-medium"
          >
            ✕
          </button>
        </div>
      )}
      {/* Top bar */}
      <header className={`h-9 border-b border-gray-200 flex items-center px-2 gap-2 flex-shrink-0 ${isImpersonating ? "bg-orange-50" : ""}`}>
        <button
          onClick={handleBackToProject}
          className="text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1"
        >
          <span style={{ fontSize: "1.75em", lineHeight: 1 }}>{"\u2190"}</span>
          <span className="underline">{projectId ? "Project" : "Dashboard"}</span>
        </button>
        {/* Brand icon: sits just right of the back link as a permanent
            "you're inside Diagramatix" cue. h-5 keeps it inside the h-9 bar. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/diagramatix-icon.svg" alt="Diagramatix" className="w-5 h-5" />

        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-gray-900 text-xs">{diagramName}</span>
          <span className="text-[10px] text-gray-400 px-1 py-0 bg-gray-100 rounded">
            {diagramType}
          </span>
          {version ? <span className="text-[10px] text-gray-400">v{SCHEMA_VERSION}.{version}</span> : null}
        </div>

        <div className="flex-1" />

        {/* SuperAdmin shortcut — leftmost item in the header menu cluster,
            SuperAdmin-only. `?from=` lets the SuperAdmin page return the
            user to this diagram on Back. Mirrors the Dashboard / Project
            placement. */}
        {isAdmin && (
          <a
            href={`/dashboard/admin?from=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search : `/dashboard/diagram/${diagramId}`)}`}
            className="text-[11px] text-red-700 hover:text-red-800 font-medium border border-red-300 rounded px-2 py-0.5 hover:bg-red-50"
            title="Open the SuperAdmin dashboard"
          >
            SuperAdmin
          </a>
        )}

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

            {/* Prev / next folder-mate navigation. Roughly 2x the size of
                the other top-bar controls so they're easy to hit. Hidden
                when the folder has only this one diagram. */}
            {folderMates && (folderMates.total > 1) && (
              <div className="flex items-center gap-1 ml-1">
                <button
                  onClick={async () => {
                    if (!folderMates.prevId) return;
                    await saveNowRef.current();
                    router.push(`/diagram/${folderMates.prevId}`);
                  }}
                  disabled={!folderMates.prevId}
                  title={folderMates.prevName ? `Previous in folder: ${folderMates.prevName}` : "First diagram in this folder"}
                  className="w-8 h-8 flex items-center justify-center text-xl text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                >
                  {"«"}
                </button>
                <span className="text-[10px] text-gray-500 tabular-nums" title="Position in folder">
                  {folderMates.position}/{folderMates.total}
                </span>
                <button
                  onClick={async () => {
                    if (!folderMates.nextId) return;
                    await saveNowRef.current();
                    router.push(`/diagram/${folderMates.nextId}`);
                  }}
                  disabled={!folderMates.nextId}
                  title={folderMates.nextName ? `Next in folder: ${folderMates.nextName}` : "Last diagram in this folder"}
                  className="w-8 h-8 flex items-center justify-center text-xl text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                >
                  {"»"}
                </button>
              </div>
            )}

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

                {/* Built-In + User template lists. Each list shows ungrouped
                    templates first (no header), then each named group as a
                    collapsible row. Per-template "move to group" submenu lets
                    the user re-organise via existing groups or a typed-in new
                    group. Collapse state is per-user (server-persisted). */}
                {(["builtin", "user"] as const).map((scope) => {
                  const list = scope === "builtin" ? builtInTemplates : userTemplates;
                  if (list.length === 0) return null;
                  const scopeLabel = scope === "builtin" ? "Built-In" : "User";
                  const canEdit = scope === "user" || isAdmin;
                  const ungrouped: TemplateRow[] = [];
                  const grouped = new Map<string, TemplateRow[]>();
                  for (const t of list) {
                    if (!t.group) ungrouped.push(t);
                    else {
                      const arr = grouped.get(t.group);
                      if (arr) arr.push(t); else grouped.set(t.group, [t]);
                    }
                  }
                  const groupNames = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
                  const renderItem = (t: TemplateRow, indent: boolean) => {
                    const isDeleting = deletingTemplateIds.has(t.id);
                    const showingMove = templateMoveMenu?.templateId === t.id;
                    return (
                      <div key={t.id}>
                        <div className={`flex items-center ${isDeleting ? "opacity-50" : "hover:bg-gray-50"}`}>
                          <button
                            onClick={() => !isDeleting && handleApplyTemplate(t.id)}
                            disabled={isDeleting}
                            className={`flex-1 text-left ${indent ? "pl-6 pr-3" : "px-3"} py-1.5 text-xs text-gray-700 ${isDeleting ? "line-through text-gray-400" : ""}`}
                          >
                            {t.name}{isDeleting ? " (deleting\u2026)" : ""}
                          </button>
                          {canEdit && !isDeleting && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTemplateMoveMenu(showingMove ? null : {
                                    templateId: t.id,
                                    scope,
                                    currentGroup: t.group,
                                    typing: false,
                                    typedName: "",
                                  });
                                }}
                                className="px-1.5 py-1.5 text-gray-400 hover:text-blue-500"
                                title="Move to group"
                              >
                                <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h8M2 6h8M2 8h5" /></svg>
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handleEditTemplate(t.id, t.name); }}
                                className="px-1.5 py-1.5 text-gray-400 hover:text-blue-500" title="Edit">
                                <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M7 2l3 3-7 7H0V9z" /></svg>
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setTemplateDeleteConfirm({ id: t.id, name: t.name, isBuiltIn: scope === "builtin" }); }}
                                className="px-1.5 py-1.5 text-gray-400 hover:text-red-500" title="Delete">
                                <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M2 3h8M4.5 3V2h3v1M3 3v7a1 1 0 001 1h4a1 1 0 001-1V3" /></svg>
                              </button>
                            </>
                          )}
                        </div>
                        {showingMove && templateMoveMenu && (
                          <div className="bg-blue-50 border-y border-blue-100 px-3 py-1.5 text-[10px] space-y-1">
                            {templateMoveMenu.typing ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  autoFocus
                                  placeholder="Group name"
                                  value={templateMoveMenu.typedName}
                                  onChange={(e) => setTemplateMoveMenu({ ...templateMoveMenu, typedName: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      const name = templateMoveMenu.typedName.trim();
                                      if (name) void moveTemplateToGroup(t.id, scope, name);
                                    } else if (e.key === "Escape") setTemplateMoveMenu(null);
                                  }}
                                  className="flex-1 px-1.5 py-0.5 text-[10px] border border-blue-200 rounded outline-none focus:border-blue-400"
                                />
                                <button
                                  onClick={() => {
                                    const name = templateMoveMenu.typedName.trim();
                                    if (name) void moveTemplateToGroup(t.id, scope, name);
                                  }}
                                  className="px-1.5 py-0.5 text-[10px] text-white bg-blue-600 rounded hover:bg-blue-700"
                                >Save</button>
                                <button onClick={() => setTemplateMoveMenu(null)}
                                  className="px-1.5 py-0.5 text-[10px] text-gray-600">{"\u2715"}</button>
                              </div>
                            ) : (
                              <>
                                <p className="text-gray-500 uppercase tracking-wide text-[9px]">Move to group</p>
                                <button
                                  onClick={() => void moveTemplateToGroup(t.id, scope, null)}
                                  className={`block w-full text-left px-1.5 py-0.5 rounded ${t.group === null ? "bg-blue-100 text-blue-700" : "hover:bg-blue-100"}`}
                                >(Ungrouped)</button>
                                {groupNames.map((g) => (
                                  <button
                                    key={g}
                                    onClick={() => void moveTemplateToGroup(t.id, scope, g)}
                                    className={`block w-full text-left px-1.5 py-0.5 rounded ${t.group === g ? "bg-blue-100 text-blue-700" : "hover:bg-blue-100"}`}
                                  >{g}</button>
                                ))}
                                <button
                                  onClick={() => setTemplateMoveMenu({ ...templateMoveMenu, typing: true })}
                                  className="block w-full text-left px-1.5 py-0.5 rounded text-blue-600 hover:bg-blue-100"
                                >+ New group{"\u2026"}</button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  };
                  return (
                    <div key={scope}>
                      <div className="border-t border-gray-100" />
                      <p className="px-3 py-1.5 text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{scopeLabel}</p>
                      {ungrouped.map((t) => renderItem(t, false))}
                      {groupNames.map((g) => {
                        const collapsed = !!templateGroupCollapsed[`${scope}:${g}`];
                        const groupItems = grouped.get(g)!;
                        return (
                          <div key={g}>
                            <button
                              onClick={() => toggleTemplateGroupCollapse(scope, g)}
                              className="flex items-center w-full text-left px-3 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
                            >
                              <span className="inline-block w-3 mr-1 text-gray-400">{collapsed ? "\u25b6" : "\u25bc"}</span>
                              <span className="flex-1 truncate font-medium">{g}</span>
                              <span className="text-gray-400 text-[10px]">{groupItems.length}</span>
                            </button>
                            {!collapsed && groupItems.map((t) => renderItem(t, true))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
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
        {/* The Diagram Config, History, and Clear options live inside the
            unified "Diagram ▾" dropdown further along the toolbar — those
            standalone buttons were removed in favour of a single menu. */}

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
        {/* Send for Review (Phase 2) — owner sends the diagram to one or
            more Collaboration Groups for feedback. */}
        {!readOnly && (
          <button
            onClick={() => setShowSendReview(true)}
            className="px-2 py-0.5 text-[11px] rounded border text-gray-700 border-gray-300 hover:bg-gray-50"
            title="Send this diagram to a Collaboration Group for review"
          >
            Send for Review
          </button>
        )}
        {/* Review-comment filter — appears once a diagram carries review
            comments, letting the owner focus on one reviewer at a time. */}
        {reviewCommenters.length > 0 && (
          <label className="flex items-center gap-1 text-[11px] text-pink-700">
            Comments:
            <select
              value={reviewFilter}
              onChange={(e) => setReviewFilter(e.target.value)}
              className="text-[11px] border border-pink-300 rounded px-1 py-0.5 bg-white text-gray-700"
              title="Show review comments from all reviewers, none, or one reviewer"
            >
              <option value="all">All reviewers</option>
              <option value="none">None</option>
              {reviewCommenters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
        {/* History was previously a standalone button — now in the
            unified Diagram ▾ menu further along the toolbar. */}

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
        <input
          ref={importVisioInputRef}
          type="file"
          accept=".vsdx"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) handleImportVisioFile(f);
          }}
        />
        <input
          ref={importBpmnInputRef}
          type="file"
          accept=".bpmn,.xml"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) handleImportBpmnFile(f);
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
                    {/* Visio export — two flavours (BPMN only). The user can
                        target either the Diagramatix v1.6 stencil (best for
                        recipients who install the Diagramatix stencil and
                        want to re-import back into Diagramatix) or the
                        Microsoft BPMN_M format (best for recipients who only
                        have Visio's built-in BPMN stencil). v1.6 supersedes
                        v1.5 with fresh master GUIDs that don't collide with
                        v1.4 in Visio's stencil resolver. v1.5 stays callable
                        via direct URL for legacy / debug use. */}
                    {diagramType === "bpmn" && (
                      <>
                        <button
                          onClick={() => {
                            setFileMenuOpen(false);
                            setFileSubmenu(null);
                            const a = document.createElement("a");
                            a.href = `/api/export/visio-v3?diagramId=${diagramId}&profile=v1.6`;
                            a.rel = "noopener";
                            a.click();
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                          title="Export using the Diagramatix v1.6 stencil — recipient needs the v1.6 stencil installed in Visio to re-author cleanly. v1.6 fixes a GUID collision with v1.4 that caused shape resolution issues in v1.5."
                        >
                          Visio (for stencil v1.6)
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => {
                              setFileMenuOpen(false);
                              setFileSubmenu(null);
                              const a = document.createElement("a");
                              a.href = `/api/export/visio-v3?diagramId=${diagramId}&profile=bpmn-m`;
                              a.rel = "noopener";
                              a.click();
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-red-700 hover:bg-red-50"
                            title="Admin only — BPMN_M export needs further work before general release."
                          >
                            Visio (for stencil BPMN_M)
                          </button>
                        )}
                      </>
                    )}
                    {/* Visio Stencil download (BPMN only) — install in Visio
                        to author BPMN diagrams natively that import cleanly.
                        Points at the v1.6 stencil to match the default
                        Visio export profile above. */}
                    {diagramType === "bpmn" && (
                      <a
                        href="/BPMN%20Diagramatix%20Shapes%20v1.6.vssx"
                        download
                        onClick={() => { setFileMenuOpen(false); setFileSubmenu(null); }}
                        className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                        title="Download the BPMN Diagramatix v1.6 stencil (.vssx) to use in Visio"
                      >
                        Visio Stencil
                      </a>
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
                    <button
                      onClick={() => { setFileMenuOpen(false); setFileSubmenu(null); importVisioInputRef.current?.click(); }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      title="Import a Visio BPMN .vsdx file as a new diagram"
                    >
                      Visio
                    </button>
                    <button
                      onClick={() => { setFileMenuOpen(false); setFileSubmenu(null); importBpmnInputRef.current?.click(); }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      title="Import an OMG BPMN 2.0 .bpmn file (Signavio / Camunda / bpmn.io export) as a new diagram"
                    >
                      BPMN
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
              onClick={() => setClearMenuOpen(prev => !prev)}
              className={`px-2 py-0.5 text-[11px] rounded border ${
                showHistoryPanel
                  ? "text-blue-700 border-blue-400 bg-blue-50"
                  : "text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
              title="Diagram-level actions"
            >
              Diagram ▾
            </button>
            {clearMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded shadow-lg z-50">
                <button
                  onClick={() => { setClearMenuOpen(false); setClearConfirmOpen("all"); }}
                  disabled={data.elements.length === 0 && data.connectors.length === 0}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Remove every element and connector from this diagram"
                >
                  Clear Diagram
                </button>
                <button
                  onClick={() => { setClearMenuOpen(false); setClearConfirmOpen("unselected"); }}
                  disabled={selectedElementIds.size === 0}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={selectedElementIds.size === 0 ? "Select one or more elements first" : "Keep the selection (and connectors between selected elements); clear everything else"}
                >
                  Clear All but Selected
                  {selectedElementIds.size > 0 && (
                    <span className="text-gray-400 ml-1">({selectedElementIds.size})</span>
                  )}
                </button>
                <div className="border-t border-gray-100" />
                <button
                  onClick={() => {
                    setClearMenuOpen(false);
                    setShowHistoryPanel(prev => !prev);
                    if (!showHistoryPanel) { setShowAiPanel(false); setShowPlanPanel(false); }
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                  title="View and restore previous versions"
                >
                  History
                  {showHistoryPanel && <span className="text-blue-600 ml-1">·</span>}
                </button>
                <button
                  onClick={() => { setClearMenuOpen(false); setShowDiagramMaintenance(true); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                  title="Open the diagram configuration modal"
                >
                  Configuration
                </button>
                {diagramType === "bpmn" && (
                  <>
                    <div className="border-t border-gray-100" />
                    <button
                      onClick={() => { setClearMenuOpen(false); setReviewIssues(null); setDiagramScan(checkDiagram(data)); }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      title="Check this diagram against the BPMN structural rules (the same rules the project-level scan uses)."
                    >
                      Scan Diagram for Issues
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <a
          href="/help"
          target="_blank"
          rel="noopener"
          className="text-[11px] text-gray-600 border border-gray-300 rounded px-2 py-0.5 hover:bg-gray-50 hover:text-blue-600"
          title="Open the User Guide in a new tab"
        >
          User Guide
        </a>
      </header>

      {/* Main editor area */}
      {reviewMode && reviewCtx && (
        <div className="bg-pink-50 border-b border-pink-200 px-4 py-1.5 flex items-center gap-3 text-xs">
          <span className="text-pink-700 font-semibold uppercase tracking-wide text-[10px]">Review Mode</span>
          <span className="text-gray-700 truncate flex-1">
            <strong>{reviewCtx.requesterName}</strong> · {reviewCtx.objective}
            <span className="text-gray-400"> · due {new Date(reviewCtx.dueDate).toLocaleDateString()}</span>
          </span>
          <span className="text-[10px] text-pink-700">Drag a Review Comment onto an element to comment.</span>
          {(reviewCtx.myStatus === "pending" || reviewCtx.myStatus === "in-progress") ? (
            <>
              <button
                onClick={() => reviewStatusAction("approve")}
                className="text-[11px] text-white bg-yellow-600 hover:bg-yellow-700 rounded px-2 py-0.5"
                title="Sign off — the diagram is good to go"
              >
                Approve
              </button>
              <button
                onClick={() => reviewStatusAction("submit")}
                className="text-[11px] text-white bg-green-600 hover:bg-green-700 rounded px-2 py-0.5"
                title="Submit your comments for the owner to address"
              >
                Submit comments
              </button>
              <button
                onClick={() => reviewStatusAction("decline")}
                className="text-[11px] text-gray-700 border border-gray-300 rounded px-2 py-0.5 hover:bg-gray-50"
              >
                Decline
              </button>
            </>
          ) : (
            <span className="text-[10px] uppercase tracking-wide bg-white border border-pink-200 text-pink-700 rounded px-1.5 py-0.5">
              {(reviewCtx.myStatus ?? "").replace(/-/g, " ")}
            </span>
          )}
        </div>
      )}

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
            extraSymbols={reviewMode ? ["review-comment"] : []}
          />
        )}

        <Canvas
          data={displayData}
          diagramType={diagramType}
          onAddElement={addElementGated}
          onMoveElement={moveElement}
          onResizeElement={resizeElement}
          onUpdateLabel={updateLabel}
          onBeginLabelEdit={beginLabelEdit}
          onUpdateLabelLive={updateLabelLive}
          onCancelLabelEdit={cancelLabelEdit}
          onDeleteElement={(id) => {
            deleteElement(id);
            setSelectedElementIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
          }}
          onAddConnector={handleAddConnector}
          onAddReviewComment={reviewMode ? handleAddReviewComment : undefined}
          onDeleteConnector={(id) => {
            deleteConnector(id);
            setSelectedConnectorId(null);
          }}
          onUpdateConnectorEndpoint={updateConnectorEndpoint}
          selectedElementIds={selectedElementIds}
          selectedConnectorId={selectedConnectorId}
          scanHighlightById={scanHighlight ?? undefined}
          scanHighlightConnectorById={scanConnectorHighlight ?? undefined}
          currentIssueIds={currentIssueIds.size > 0 ? currentIssueIds : undefined}
          onSetSelectedElements={setSelectedElementIds}
          onSelectConnector={setSelectedConnectorId}
          onMoveElements={moveElements}
          onElementsMoveEnd={elementsMoveEnd}
          onSwapLane={swapLane}
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
          onRemoveSpace={(diagramType === "bpmn" || diagramType === "state-machine") ? removeSpace : undefined}
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
            onSetEventBoundary={(id, hostId) => {
              setEventBoundary(id, hostId);
              // After detaching, clear the selection so the next click
              // on the (now-nudged) event isn't read as a connection-
              // creation gesture on a still-selected element.
              if (hostId === null) setSelectedElementIds(new Set());
            }}
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
            processOwner={data.processOwner}
            onSetProcessOwner={setProcessOwner}
            diagramOwner={diagramOwner}
            diagramOwnerCandidates={diagramOwnerCandidates}
            canEditDiagramOwner={canEditDiagramOwner}
            diagramOwnerError={diagramOwnerError}
            onSetDiagramOwner={setDiagramOwner}
            isAdmin={isAdmin}
            createdAt={createdAt}
            updatedAt={effectiveUpdatedAt}
            siblingDiagrams={siblingDiagrams}
            currentDiagramId={diagramId}
            parentDiagramIds={data.parentDiagramIds}
            sessionParentId={parentDiagram?.id}
            onNavigateToDiagram={handleDrillIntoSubprocess}
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
              requestAnimationFrame(() => {
                window.dispatchEvent(new CustomEvent("dgx:fitToContent"));
              });
            }}
            onAddToDiagram={(elements, connectors) => {
              applyTemplate(elements, connectors);
            }}
            onClose={() => setShowAiPanel(false)}
            onGeneratingChange={setAiPanelGenerating}
            isAdmin={isAdmin}
            currentElements={data.elements}
            currentConnectors={data.connectors}
            onNarrativeGeneratingChange={setAiPanelNarrativeGenerating}
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
              // Wide AI-generated diagrams (especially BPMN with many
              // columns) extend well past the current viewport — ask the
              // canvas to re-fit so the user sees the whole thing instead
              // of thinking "Apply Layout did nothing".
              requestAnimationFrame(() => {
                window.dispatchEvent(new CustomEvent("dgx:fitToContent"));
              });
            }}
            onClose={() => setShowPlanPanel(false)}
            onBusyChange={setAiBusy}
          />
        )}

        {showSendReview && (
          <SendForReviewDialog
            diagramId={diagramId}
            diagramName={diagramName}
            currentUserEmail={userEmail}
            onClose={() => setShowSendReview(false)}
            onSent={({ reviews, reviewers }) => {
              setShowSendReview(false);
              setReviewSentMsg(
                `Sent for review to ${reviewers} reviewer${reviewers === 1 ? "" : "s"} ` +
                `across ${reviews} group${reviews === 1 ? "" : "s"}.`,
              );
            }}
          />
        )}

        {reviewSentMsg && (
          <AlertDialog
            title="Sent for review"
            message={reviewSentMsg}
            tone="info"
            onClose={() => setReviewSentMsg(null)}
          />
        )}

        {reviewActionMsg && (
          <AlertDialog
            title="Review"
            message={reviewActionMsg}
            tone="info"
            onClose={() => setReviewActionMsg(null)}
          />
        )}

        {/* Canvas overlay — large branded throbber while Sonnet plans
            or the layout engine runs. Centred on the viewport so the
            user staring at the canvas sees something happening, not
            just a tiny sidebar banner they might miss. Pointer events
            pass through (style.pointerEvents = "none") so the user can
            still pan / zoom underneath if they want. */}
        {(aiBusy === "plan" || aiBusy === "apply" || aiBusy === "narrative" || aiPanelGenerating || aiPanelNarrativeGenerating) && (
          <div
            className="fixed inset-0 z-40 flex flex-col items-center justify-center"
            style={{ pointerEvents: "none" }}
          >
            <DiagramatixThrobber size={120} auraRadius={110} />
            <p className="mt-3 text-sm font-medium text-blue-800 bg-white/85 backdrop-blur-sm px-4 py-2 rounded-lg shadow-md">
              {aiBusy === "apply"
                ? "Running the layout engine…"
                : (aiBusy === "narrative" || aiPanelNarrativeGenerating)
                  ? "Asking Sonnet for a staff narrative — this usually takes 15–30 seconds…"
                  : "Asking Sonnet for a plan — this usually takes 15–30 seconds…"}
            </p>
          </div>
        )}

        {/* Review Mode — footer banner that steps through the flagged elements
            one at a time. Outlines + selection persist until Exit. Accepting
            an issue dismisses it for THIS session only; running the scan again
            re-surfaces every issue (including previously accepted ones). */}
        {reviewIssues && currentIssue && activeIssues && (() => {
          const titles = new Map(rulesMetadata().map((r) => [r.id, r.title]));
          const v = currentIssue.v;
          return (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40">
              <div className="bg-white border border-gray-300 rounded-lg shadow-xl px-3 py-2 flex items-center gap-3 max-w-3xl">
                <span className="text-[11px] text-gray-500 shrink-0">
                  Issue <strong className="text-gray-900">{reviewIssues.cursor + 1}</strong> of {activeIssues.length}
                  {reviewIssues.accepted.size > 0 && (
                    <span className="text-gray-400"> · {reviewIssues.accepted.size} accepted</span>
                  )}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${v.severity === "warning" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}>
                  {v.severity}
                </span>
                <span className="text-xs font-medium text-gray-900 shrink-0">{titles.get(v.rule) ?? v.rule}</span>
                <span className="text-[11px] text-gray-600 truncate min-w-0" title={v.message}>{v.message}</span>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    onClick={reviewPrev}
                    disabled={reviewIssues.cursor === 0}
                    className="px-2 py-1 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Previous issue"
                  >‹ Prev</button>
                  <button
                    onClick={reviewAcceptCurrent}
                    className="px-2 py-1 text-xs text-gray-700 border border-gray-300 rounded hover:bg-green-50 hover:border-green-300"
                    title="Accept this issue for this session (it will reappear on the next scan)"
                  >Accept</button>
                  <button
                    onClick={reviewNext}
                    disabled={reviewIssues.cursor >= activeIssues.length - 1}
                    className="px-2 py-1 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Next issue"
                  >Next ›</button>
                  <button
                    onClick={reviewExit}
                    className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 ml-1"
                    title="Exit review (clears the outlines)"
                  >✕</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Per-diagram "Scan for Issues" results (BPMN only). Runs the shared
            rule registry on the live diagram — same rules as the project scan
            and the test harness. */}
        {diagramScan !== null && (() => {
          const titles = new Map(rulesMetadata().map((r) => [r.id, r.title]));
          const errors = diagramScan.filter((v) => v.severity === "error");
          const warnings = diagramScan.filter((v) => v.severity === "warning");
          const renderList = (list: Violation[]) => (
            <ul className="space-y-1.5">
              {list.map((v, i) => (
                <li key={`${v.rule}:${i}`} className="border border-gray-100 rounded px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${v.severity === "warning" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}>
                      {v.severity}
                    </span>
                    <span className="text-xs font-medium text-gray-900">{titles.get(v.rule) ?? v.rule}</span>
                  </div>
                  <p className="text-[11px] text-gray-600 mt-1">{v.message}</p>
                </li>
              ))}
            </ul>
          );
          return (
            <div
              className="fixed bg-white rounded-lg shadow-xl flex flex-col z-50 border border-gray-200"
              style={{
                left: diagramScanPos?.x ?? 0,
                top: diagramScanPos?.y ?? 0,
                width: 576,
                maxHeight: "80vh",
                // Hide the popup until the position effect runs so it
                // doesn't flash at (0,0) on the very first open.
                visibility: diagramScanPos ? "visible" : "hidden",
              }}
            >
                {/* Pinned header — Close is always visible while the list
                    scrolls. Also acts as the DRAG HANDLE: mousedown
                    anywhere on the header (except on a button) starts a
                    drag that lets the user slide the popup aside to
                    inspect canvas elements behind it. */}
                <div
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).closest("button")) return;
                    if (!diagramScanPos) return;
                    e.preventDefault();
                    setDiagramScanDrag({
                      ox: e.clientX - diagramScanPos.x,
                      oy: e.clientY - diagramScanPos.y,
                    });
                  }}
                  className="px-6 py-4 border-b border-gray-200 flex items-start justify-between shrink-0 cursor-move select-none"
                  title="Drag to move — click Close to dismiss"
                >
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Diagram Issues</h2>
                    {diagramScan.length > 0 ? (
                      <div className="flex items-center gap-3 mt-1 text-xs">
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block w-2 h-2 rounded-full bg-red-600" />
                          <span className="text-gray-700"><strong>{errors.length}</strong> error{errors.length === 1 ? "" : "s"}</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                          <span className="text-gray-700"><strong>{warnings.length}</strong> warning{warnings.length === 1 ? "" : "s"}</span>
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 mt-1">No issues found.</p>
                    )}
                  </div>
                  <button
                    onClick={closeDiagramScan}
                    className="px-3 py-1 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 shrink-0"
                    title="Close — when there are issues you'll step through them in Review Mode"
                  >
                    Close
                  </button>
                </div>
                {/* Scrolling body */}
                <div className="overflow-y-auto px-6 py-4 flex-1 space-y-3">
                  {diagramScan.length === 0 ? (
                    <p className="text-sm text-gray-600">Nothing to report — this diagram passes every rule.</p>
                  ) : (
                    <>
                      {errors.length > 0 && (
                        <div className="border border-gray-200 rounded">
                          <button
                            onClick={() => setScanErrorsOpen((v) => !v)}
                            className="w-full flex items-center gap-2 px-3 py-2 bg-red-50 hover:bg-red-100 text-left rounded-t"
                          >
                            <span className="text-xs text-gray-500">{scanErrorsOpen ? "▼" : "▶"}</span>
                            <span className="text-[11px] uppercase tracking-wide font-semibold text-red-700">Errors</span>
                            <span className="text-[10px] text-gray-600">({errors.length})</span>
                          </button>
                          {scanErrorsOpen && <div className="px-3 py-2">{renderList(errors)}</div>}
                        </div>
                      )}
                      {warnings.length > 0 && (
                        <div className="border border-gray-200 rounded">
                          <button
                            onClick={() => setScanWarningsOpen((v) => !v)}
                            className="w-full flex items-center gap-2 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-left rounded-t"
                          >
                            <span className="text-xs text-gray-500">{scanWarningsOpen ? "▼" : "▶"}</span>
                            <span className="text-[11px] uppercase tracking-wide font-semibold text-amber-700">Warnings</span>
                            <span className="text-[10px] text-gray-600">({warnings.length})</span>
                          </button>
                          {scanWarningsOpen && <div className="px-3 py-2">{renderList(warnings)}</div>}
                        </div>
                      )}
                    </>
                  )}
                </div>
            </div>
          );
        })()}

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

      {showTemplateNameModal && (() => {
        // Suggest groups from whichever list we're saving into. For an edit,
        // figure out scope from which list contains the template.
        let scopeList: TemplateRow[] = userTemplates;
        let initialGroup: string | null = null;
        if (templateEditState) {
          const inBuiltin = builtInTemplates.find((t) => t.id === templateEditState.templateId);
          if (inBuiltin) { scopeList = builtInTemplates; initialGroup = inBuiltin.group; }
          else {
            const inUser = userTemplates.find((t) => t.id === templateEditState.templateId);
            if (inUser) initialGroup = inUser.group;
          }
        } else if (templateMode === "capturing-builtin") {
          scopeList = builtInTemplates;
        }
        const knownGroups = scopeList
          .map((t) => t.group)
          .filter((g): g is string => !!g);
        return (
          <TemplateNameModal
            onSave={templateEditState
              ? handleUpdateTemplate
              : (name: string, group: string | null) => handleConfirmTemplateName(name, group)}
            onClose={() => { setShowTemplateNameModal(false); setPendingTemplateData(null); setTemplateMode("idle"); }}
            initialName={templateEditState?.templateName}
            initialGroup={initialGroup}
            knownGroups={knownGroups}
            title={templateEditState ? "Update Template" : templateMode === "capturing-builtin" ? "Save Built-In Template" : "Save User Template"}
          />
        );
      })()}

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

      {pendingImport && (
        <ConfirmDialog
          title="Import diagram?"
          message={pendingImport.message}
          confirmLabel="Import"
          cancelLabel="Cancel"
          destructive
          onCancel={() => setPendingImport(null)}
          onConfirm={() => {
            const apply = pendingImport.apply;
            setPendingImport(null);
            apply();
          }}
        />
      )}

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

      {/* Visio import status — shows the per-master breakdown, stats, and
          full warnings list from the most recent Import → Visio. Always
          shown after an import (clean or noisy) so the user can verify
          what came through and what didn't. Stays open until the user
          explicitly clicks Close or Open Diagram (z-[60] beats the
          unsaved-changes dialog and other z-50 overlays; backdrop click
          is swallowed). */}
      {/* Overwrite-or-create confirm — shown when the chosen .vsdx
          file's basename matches the current diagram's name.
          OK ⇒ overwrite this diagram. Cancel ⇒ create a new diagram
          (the API will append a dd-mm-yy hh:mm timestamp to the name
          if a same-named diagram already exists in the project). */}
      {pendingVisioImport && (
        <ConfirmDialog
          title={`Overwrite "${pendingVisioImport.baseName}"?`}
          message={
            (pendingVisioImport.kind === "bpmn"
              ? `The BPMN file's name matches this diagram. `
              : `The Visio file's name matches this diagram. `) +
            `Overwrite the current diagram with the imported content?\n\n` +
            `Cancel will instead create a new diagram with the same name; if a ` +
            `same-named diagram already exists in this project, a dd-mm-yy hh:mm ` +
            `timestamp will be appended automatically to keep both visible.`
          }
          confirmLabel="Overwrite"
          cancelLabel="Create new"
          destructive={false}
          onConfirm={async () => {
            const p = pendingVisioImport;
            setPendingVisioImport(null);
            if (p.kind === "bpmn") await runBpmnImport(p.file, p.baseName, true);
            else await runVisioImport(p.file, p.baseName, true);
          }}
          onCancel={async () => {
            const p = pendingVisioImport;
            setPendingVisioImport(null);
            if (p.kind === "bpmn") await runBpmnImport(p.file, p.baseName, false);
            else await runVisioImport(p.file, p.baseName, false);
          }}
        />
      )}

      {visioImportStatus && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-4 pb-2 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Visio Import — Results</h2>
              <p className="mt-1 text-xs text-gray-600">
                Page totals, per-master breakdown, and any warnings from this import.
                Open the new diagram to see the result on canvas, or close to retry with a different file.
              </p>
            </div>
            <div className="px-5 py-3 border-b border-gray-200">
              <div className="grid grid-cols-3 gap-3 text-xs text-gray-700">
                <div><span className="font-semibold">Total shapes on page:</span> {visioImportStatus.stats.totalShapesOnPage}</div>
                <div><span className="font-semibold">Elements created:</span> {visioImportStatus.stats.elementsCreated}</div>
                <div><span className="font-semibold">Connectors created:</span> {visioImportStatus.stats.connectorsCreated}</div>
                <div><span className="font-semibold">Shapes skipped:</span> {visioImportStatus.stats.shapesSkipped}</div>
                <div><span className="font-semibold">Connectors skipped:</span> {visioImportStatus.stats.connectorsSkipped}</div>
                <div><span className="font-semibold">Implicit pools:</span> {visioImportStatus.stats.implicitPools}</div>
              </div>
            </div>
            <div className="overflow-y-auto px-5 py-3 flex-1 min-h-0">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Master breakdown</h3>
                <div className="border border-gray-300 rounded text-[13px] text-gray-900">
                  <table className="w-full">
                    <thead className="bg-gray-100 text-gray-900 border-b border-gray-300">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold">Master ID</th>
                        <th className="text-left px-3 py-2 font-semibold">NameU</th>
                        <th className="text-right px-3 py-2 font-semibold">Count</th>
                        <th className="text-left px-3 py-2 font-semibold">Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visioImportStatus.stats.masters.length === 0 && (
                        <tr><td colSpan={4} className="px-3 py-2 text-gray-700">(no masters used)</td></tr>
                      )}
                      {visioImportStatus.stats.masters.map((m, i) => (
                        <tr key={i} className={
                          "border-t border-gray-200 " + (
                            m.classifiedAs === "skipped" ? "bg-red-100" :
                            m.classifiedAs.includes("implicit") || m.classifiedAs.includes("heuristic") || m.classifiedAs.includes("black-box") ? "bg-yellow-100" :
                            i % 2 === 0 ? "bg-white" : "bg-gray-50"
                          )
                        }>
                          <td className="px-3 py-1.5 font-mono">{m.masterId}</td>
                          <td className="px-3 py-1.5">{m.nameU || <span className="text-gray-500 italic">(empty)</span>}</td>
                          <td className="px-3 py-1.5 text-right">{m.count}</td>
                          <td className="px-3 py-1.5">{m.classifiedAs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {visioImportStatus.warnings.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-800 mb-1">
                    Warnings ({visioImportStatus.warnings.length})
                  </h3>
                  <pre className="text-[11px] font-mono whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-2 text-gray-700">
{visioImportStatus.warnings.join("\n")}
                  </pre>
                </div>
              )}
            </div>
            <div className="px-5 py-3 flex gap-2 justify-end border-t border-gray-200">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(
                    [
                      `Total: ${visioImportStatus.stats.totalShapesOnPage} shapes, ${visioImportStatus.stats.elementsCreated} elements, ${visioImportStatus.stats.connectorsCreated} connectors`,
                      `Skipped: ${visioImportStatus.stats.shapesSkipped} shapes, ${visioImportStatus.stats.connectorsSkipped} connectors. Implicit pools: ${visioImportStatus.stats.implicitPools}`,
                      "",
                      "Master breakdown:",
                      ...visioImportStatus.stats.masters.map(
                        (m) => `  ${m.masterId.padStart(4)}  ${m.count.toString().padStart(3)}×  ${m.classifiedAs.padEnd(28)}  ${m.nameU || "(empty)"}`,
                      ),
                      "",
                      `Warnings (${visioImportStatus.warnings.length}):`,
                      ...visioImportStatus.warnings,
                    ].join("\n"),
                  );
                }}
                className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                Copy to clipboard
              </button>
              <button
                onClick={() => setVisioImportStatus(null)}
                className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const id = visioImportStatus.diagram.id;
                  setVisioImportStatus(null);
                  router.push(`/diagram/${id}`);
                }}
                className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-700"
              >
                Open Diagram
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

      {/* Admin Access Required modal removed — was dead code (never opened)
          and the hardcoded password literal "!Aardwolf2026" inside its
          client-side compare ended up in the bundled JS served to every
          browser. Built-in template creation is gated by the isAdmin
          check on the "+ Create Built-In Template" menu item; the server
          re-checks via SUPERUSER_EMAILS on save. */}

      {showDiagramMaintenance && (
        <DiagramColorModal
          diagramId={diagramId}
          diagramType={diagramType}
          projectColors={{ ...DEFAULT_SYMBOL_COLORS, ...projectColorConfig }}
          initialColorConfig={diagramColorConfig}
          displayMode={displayMode}
          onDisplayModeChange={handleToggleDisplayMode}
          debugMode={debugMode}
          isAdmin={isAdmin}
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
          processFontSize={data.processFontSize}
          onProcessFontSizeChange={setProcessFontSize}
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
