"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { DiagramType, DiagramData } from "@/app/lib/diagram/types";
import { SCHEMA_VERSION } from "@/app/lib/diagram/types";
import { resolveColor, DEFAULT_SYMBOL_COLORS, type SymbolColorConfig } from "@/app/lib/diagram/colors";
import { DiagramMaintenanceModal } from "./DiagramMaintenanceModal";
import { ImpersonationBanner } from "@/app/components/ImpersonationBanner";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

// --- Folder tree types ---
interface FolderNode {
  id: string;
  name: string;
  parentId: string | null; // null = root (project level)
  collapsed?: boolean;
}

interface FolderTree {
  folders: FolderNode[];
  diagramFolderMap: Record<string, string>; // diagramId → folderId ("root" = project root)
  diagramOrder?: Record<string, string[]>;  // folderId → ordered diagramId list
  folderOrder?: Record<string, string[]>;   // parentFolderId → ordered child folderId list
}

const ROOT_ID = "root";

type ExportFormat = "json" | "xml";

// --- XML export helpers ---
const NS = "http://diagramatix.com/export/1.0";
function esc(s: string): string { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function attr(name: string, val: string | number | boolean | undefined | null): string {
  if (val === undefined || val === null) return "";
  return ` ${name}="${esc(String(val))}"`;
}
function pointXml(tag: string, p: { x: number; y: number } | undefined | null, indent: string): string {
  if (!p) return "";
  return `${indent}<${tag}${attr("x",p.x)}${attr("y",p.y)}/>\n`;
}

interface ExportDiagramRecord { originalId: string; name: string; type: string; data: DiagramData; colorConfig?: unknown; displayMode?: string }
interface ExportPayload { schemaVersion: string; appVersion: string; exportedAt: string; project: { name: string; description: string; ownerName: string; colorConfig: unknown }; diagrams: ExportDiagramRecord[]; folderTree: FolderTree }

function convertExportToXml(exp: ExportPayload): string {
  let x = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  x += `<dgx:diagramatix-export xmlns:dgx="${NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${NS} /api/schema"${attr("schemaVersion",exp.schemaVersion)}${attr("appVersion",exp.appVersion)}${attr("exportedAt",exp.exportedAt)}>\n`;

  // Project
  x += `  <dgx:project>\n`;
  x += `    <dgx:name>${esc(exp.project.name)}</dgx:name>\n`;
  if (exp.project.description) x += `    <dgx:description>${esc(exp.project.description)}</dgx:description>\n`;
  if (exp.project.ownerName) x += `    <dgx:ownerName>${esc(exp.project.ownerName)}</dgx:ownerName>\n`;
  if (exp.project.colorConfig && Object.keys(exp.project.colorConfig as Record<string,unknown>).length > 0) {
    x += `    <dgx:colorConfig>${esc(JSON.stringify(exp.project.colorConfig))}</dgx:colorConfig>\n`;
  }
  x += `  </dgx:project>\n`;

  // Diagrams
  x += `  <dgx:diagrams>\n`;
  for (const d of exp.diagrams) {
    x += `    <dgx:diagram${attr("originalId",d.originalId)}${attr("type",d.type)}${attr("displayMode",d.displayMode)}>\n`;
    x += `      <dgx:name>${esc(d.name)}</dgx:name>\n`;
    x += diagramDataXml(d.data as DiagramData, "      ");
    if (d.colorConfig && Object.keys(d.colorConfig as Record<string,unknown>).length > 0) {
      x += `      <dgx:colorConfig>${esc(JSON.stringify(d.colorConfig))}</dgx:colorConfig>\n`;
    }
    x += `    </dgx:diagram>\n`;
  }
  x += `  </dgx:diagrams>\n`;

  // Folder tree
  x += folderTreeXml(exp.folderTree, "  ");

  x += `</dgx:diagramatix-export>\n`;
  return x;
}

function diagramDataXml(dd: DiagramData, ind: string): string {
  let x = `${ind}<dgx:data${attr("fontSize",dd.fontSize)}${attr("connectorFontSize",dd.connectorFontSize)}${attr("titleFontSize",dd.titleFontSize)}>\n`;

  // Elements
  x += `${ind}  <dgx:elements>\n`;
  for (const el of dd.elements) {
    x += `${ind}    <dgx:element${attr("id",el.id)}${attr("type",el.type)}${attr("x",el.x)}${attr("y",el.y)}${attr("width",el.width)}${attr("height",el.height)}`;
    x += `${attr("parentId",el.parentId)}${attr("boundaryHostId",el.boundaryHostId)}${attr("taskType",el.taskType)}${attr("gatewayType",el.gatewayType)}`;
    x += `${attr("eventType",el.eventType)}${attr("repeatType",el.repeatType)}${attr("flowType",el.flowType)}>\n`;
    x += `${ind}      <dgx:label>${esc(el.label)}</dgx:label>\n`;
    if (el.properties && Object.keys(el.properties).length > 0) {
      x += propertiesXml(el.properties, `${ind}      `);
    }
    x += `${ind}    </dgx:element>\n`;
  }
  x += `${ind}  </dgx:elements>\n`;

  // Connectors
  x += `${ind}  <dgx:connectors>\n`;
  for (const c of dd.connectors) {
    x += connectorXml(c, `${ind}    `);
  }
  x += `${ind}  </dgx:connectors>\n`;

  // Viewport
  x += `${ind}  <dgx:viewport${attr("x",dd.viewport.x)}${attr("y",dd.viewport.y)}${attr("zoom",dd.viewport.zoom)}/>\n`;

  // Title
  if (dd.title) {
    x += `${ind}  <dgx:title${attr("version",dd.title.version)}${attr("authors",dd.title.authors)}${attr("status",dd.title.status)}${attr("showTitle",dd.title.showTitle)}/>\n`;
  }

  x += `${ind}</dgx:data>\n`;
  return x;
}

function propertiesXml(props: Record<string, unknown>, ind: string): string {
  let x = `${ind}<dgx:properties>\n`;
  for (const [key, val] of Object.entries(props)) {
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      x += `${ind}  <dgx:property${attr("name",key)}${attr("type","array")}>\n`;
      for (const item of val) {
        if (typeof item === "object" && item !== null) {
          x += `${ind}    <dgx:item>\n`;
          for (const [fk, fv] of Object.entries(item as Record<string,unknown>)) {
            if (fv !== undefined && fv !== null) x += `${ind}      <dgx:field${attr("name",fk)}>${esc(String(fv))}</dgx:field>\n`;
          }
          x += `${ind}    </dgx:item>\n`;
        } else {
          x += `${ind}    <dgx:item><dgx:field${attr("name","value")}>${esc(String(item))}</dgx:field></dgx:item>\n`;
        }
      }
      x += `${ind}  </dgx:property>\n`;
    } else if (typeof val === "object") {
      x += `${ind}  <dgx:property${attr("name",key)}>${esc(JSON.stringify(val))}</dgx:property>\n`;
    } else {
      x += `${ind}  <dgx:property${attr("name",key)}>${esc(String(val))}</dgx:property>\n`;
    }
  }
  x += `${ind}</dgx:properties>\n`;
  return x;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function connectorXml(c: any, ind: string): string {
  let x = `${ind}<dgx:connector${attr("id",c.id)}${attr("sourceId",c.sourceId)}${attr("targetId",c.targetId)}`;
  x += `${attr("type",c.type)}${attr("sourceSide",c.sourceSide)}${attr("targetSide",c.targetSide)}`;
  x += `${attr("directionType",c.directionType)}${attr("routingType",c.routingType)}`;
  x += `${attr("sourceInvisibleLeader",c.sourceInvisibleLeader||undefined)}${attr("targetInvisibleLeader",c.targetInvisibleLeader||undefined)}`;
  x += `${attr("labelOffsetX",c.labelOffsetX)}${attr("labelOffsetY",c.labelOffsetY)}${attr("labelWidth",c.labelWidth)}`;
  x += `${attr("sourceOffsetAlong",c.sourceOffsetAlong)}${attr("targetOffsetAlong",c.targetOffsetAlong)}`;
  x += `${attr("labelAnchor",c.labelAnchor)}${attr("arrowAtSource",c.arrowAtSource||undefined)}>\n`;

  // Waypoints
  if (c.waypoints && c.waypoints.length > 0) {
    x += `${ind}  <dgx:waypoints>\n`;
    for (const wp of c.waypoints) x += `${ind}    <dgx:point${attr("x",wp.x)}${attr("y",wp.y)}/>\n`;
    x += `${ind}  </dgx:waypoints>\n`;
  }

  // Label
  if (c.label) x += `${ind}  <dgx:label>${esc(c.label)}</dgx:label>\n`;

  // Curvilinear control points
  x += pointXml("dgx:cp1RelOffset", c.cp1RelOffset as { x:number;y:number }|undefined, `${ind}  `);
  x += pointXml("dgx:cp2RelOffset", c.cp2RelOffset as { x:number;y:number }|undefined, `${ind}  `);

  // Transition (state-machine)
  if (c.labelMode || c.transitionEvent || c.transitionGuard || c.transitionActions) {
    x += `${ind}  <dgx:transition${attr("labelMode",c.labelMode as string)}${attr("event",c.transitionEvent as string)}${attr("guard",c.transitionGuard as string)}${attr("actions",c.transitionActions as string)}/>\n`;
  }

  // UML association ends
  const ends = [["sourceEnd","source"],["targetEnd","target"]] as const;
  for (const [tag, prefix] of ends) {
    const role = c[`${prefix}Role`] as string|undefined;
    const mult = c[`${prefix}Multiplicity`] as string|undefined;
    const vis = c[`${prefix}Visibility`] as string|undefined;
    const ordered = c[`${prefix}Ordered`] as boolean|undefined;
    const unique = c[`${prefix}Unique`] as boolean|undefined;
    const qualifier = c[`${prefix}Qualifier`] as string|undefined;
    const propStr = c[`${prefix}PropertyString`] as string|undefined;
    if (role || mult || vis || ordered || unique || qualifier || propStr) {
      x += `${ind}  <dgx:${tag}${attr("role",role)}${attr("multiplicity",mult)}${attr("visibility",vis)}${attr("ordered",ordered)}${attr("unique",unique)}${attr("qualifier",qualifier)}${attr("propertyString",propStr)}>\n`;
      x += pointXml(`dgx:roleOffset`, c[`${prefix}RoleOffset`] as { x:number;y:number }|undefined, `${ind}    `);
      x += pointXml(`dgx:multOffset`, c[`${prefix}MultOffset`] as { x:number;y:number }|undefined, `${ind}    `);
      x += pointXml(`dgx:constraintOffset`, c[`${prefix}ConstraintOffset`] as { x:number;y:number }|undefined, `${ind}    `);
      x += pointXml(`dgx:uniqueOffset`, c[`${prefix}UniqueOffset`] as { x:number;y:number }|undefined, `${ind}    `);
      x += `${ind}  </dgx:${tag}>\n`;
    }
  }

  // Association name
  if (c.associationName) {
    x += `${ind}  <dgx:associationName${attr("name",c.associationName)}${attr("readingDirection",c.readingDirection as string)}>\n`;
    x += pointXml("dgx:offset", c.associationNameOffset as { x:number;y:number }|undefined, `${ind}    `);
    x += `${ind}  </dgx:associationName>\n`;
  }

  x += `${ind}</dgx:connector>\n`;
  return x;
}

function folderTreeXml(ft: FolderTree, ind: string): string {
  let x = `${ind}<dgx:folderTree>\n`;

  // Folders
  if (ft.folders && ft.folders.length > 0) {
    x += `${ind}  <dgx:folders>\n`;
    for (const f of ft.folders) {
      x += `${ind}    <dgx:folder${attr("id",f.id)}${attr("name",f.name)}${attr("parentId",f.parentId)}/>\n`;
    }
    x += `${ind}  </dgx:folders>\n`;
  }

  // DiagramFolderMap
  if (ft.diagramFolderMap && Object.keys(ft.diagramFolderMap).length > 0) {
    x += `${ind}  <dgx:diagramFolderMap>\n`;
    for (const [k, v] of Object.entries(ft.diagramFolderMap)) {
      x += `${ind}    <dgx:entry${attr("key",k)}${attr("value",v)}/>\n`;
    }
    x += `${ind}  </dgx:diagramFolderMap>\n`;
  }

  // Diagram order
  if (ft.diagramOrder && Object.keys(ft.diagramOrder).length > 0) {
    x += `${ind}  <dgx:diagramOrder>\n`;
    for (const [k, ids] of Object.entries(ft.diagramOrder)) {
      x += `${ind}    <dgx:group${attr("key",k)}>\n`;
      for (const id of ids) x += `${ind}      <dgx:ref${attr("id",id)}/>\n`;
      x += `${ind}    </dgx:group>\n`;
    }
    x += `${ind}  </dgx:diagramOrder>\n`;
  }

  // Folder order
  if (ft.folderOrder && Object.keys(ft.folderOrder).length > 0) {
    x += `${ind}  <dgx:folderOrder>\n`;
    for (const [k, ids] of Object.entries(ft.folderOrder)) {
      x += `${ind}    <dgx:group${attr("key",k)}>\n`;
      for (const id of ids) x += `${ind}      <dgx:ref${attr("id",id)}/>\n`;
      x += `${ind}    </dgx:group>\n`;
    }
    x += `${ind}  </dgx:folderOrder>\n`;
  }

  x += `${ind}</dgx:folderTree>\n`;
  return x;
}


const EMPTY_FOLDER_TREE: FolderTree = { folders: [], diagramFolderMap: {} };

function parseFolderTree(raw: unknown): FolderTree {
  if (!raw || typeof raw !== "object") return EMPTY_FOLDER_TREE;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.folders)) return EMPTY_FOLDER_TREE;
  return raw as FolderTree;
}

// Debounced save — ensures rapid changes don't flood the API
let _folderTreeSaveTimer: ReturnType<typeof setTimeout> | null = null;
function saveFolderTreeToDb(projectId: string, tree: FolderTree) {
  if (_folderTreeSaveTimer) clearTimeout(_folderTreeSaveTimer);
  _folderTreeSaveTimer = setTimeout(() => {
    _folderTreeSaveTimer = null;
    fetch(`/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderTree: tree }),
    }).then(r => {
      if (!r.ok) console.error("[saveFolderTree] failed:", r.status);
    }).catch(err => {
      console.error("[saveFolderTree] error:", err);
    });
  }, 500);
}

interface DiagramSummary {
  id: string;
  name: string;
  type: string;
  createdAt: Date;
  updatedAt: Date;
  data?: unknown;
}

interface ProjectDetail {
  id: string;
  name: string;
  description?: string;
  ownerName?: string;
  colorConfig?: unknown;
  folderTree?: unknown;
  diagrams: DiagramSummary[];
}

interface OtherProject {
  id: string;
  name: string;
}

interface Props {
  project: ProjectDetail;
  otherProjects: OtherProject[];
  version?: number;
  readOnly?: boolean;
  viewingAsName?: string;
  viewingAsEmail?: string;
}

const DIAGRAM_TYPE_LABELS: Record<string, string> = {
  context: "Context",
  basic: "Context",  // legacy alias
  "process-context": "Process Context",
  "state-machine": "State Machine",
  bpmn: "BPMN",
  domain: "Domain",
};

const DIAGRAM_TYPES: { value: DiagramType; label: string; description: string }[] = [
  { value: "context", label: "Context", description: "External entities, processes, and data flows" },
  { value: "process-context", label: "Process Context", description: "Use cases with actors showing process participants" },
  { value: "state-machine", label: "State Machine", description: "States and transitions for entity lifecycle" },
  { value: "bpmn", label: "BPMN", description: "Full Business Process Model and Notation" },
  { value: "domain", label: "Domain", description: "UML class diagrams with classes, enumerations, and relationships" },
];

export function ProjectDetailClient({ project, otherProjects, version, readOnly, viewingAsName, viewingAsEmail }: Props) {
  const router = useRouter();
  const [diagrams, setDiagrams] = useState(project.diagrams);
  const [projectName, setProjectName] = useState(project.name);
  const [projectDescription, setProjectDescription] = useState(project.description ?? "");
  const [projectOwner, setProjectOwner] = useState(project.ownerName ?? "");
  const [editingProjectName, setEditingProjectName] = useState(false);

  const [showNewDiagram, setShowNewDiagram] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string; message: string; onConfirm: () => void;
  } | null>(null);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportLog, setExportLog] = useState<string[]>([]);
  const [exportResult, setExportResult] = useState<"success" | "failed" | null>(null);
  // Renamed: this menu now also handles imports, so it's a generic File menu.
  const [showFileMenu, setShowFileMenu] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const importJsonInputRef = useRef<HTMLInputElement>(null);
  const importXmlInputRef = useRef<HTMLInputElement>(null);
  // Import-progress modal state (mirrors the dashboard's import flow).
  const [importing, setImporting] = useState(false);
  const [importLog, setImportLog] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<"success" | "failed" | null>(null);
  const [importedProjectId, setImportedProjectId] = useState<string | null>(null);
  const [projectColorConfig, setProjectColorConfig] = useState<SymbolColorConfig>((project.colorConfig as SymbolColorConfig | null) ?? {});

  // Re-fetch project data (diagrams + folderTree) from the API.
  // Only updates state when the data actually changed, so server-rendered
  // props are used on first paint with no unnecessary re-render.
  const refreshProjectData = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}`);
      if (!res.ok) return;
      const fresh = await res.json();
      if (fresh.diagrams) {
        setDiagrams(prev => {
          const freshIds = fresh.diagrams.map((d: DiagramSummary) => d.id + d.updatedAt).join(",");
          const prevIds = prev.map(d => d.id + d.updatedAt).join(",");
          return freshIds === prevIds ? prev : fresh.diagrams;
        });
      }
      if (fresh.folderTree) {
        setFolderTree(prev => {
          const freshTree = parseFolderTree(fresh.folderTree);
          const freshKey = JSON.stringify(freshTree);
          const prevKey = JSON.stringify(prev);
          return freshKey === prevKey ? prev : freshTree;
        });
      }
    } catch { /* best-effort */ }
  }, [project.id]);

  // Refresh project data on mount (catches same-tab navigation back from diagram editor)
  // and when window/tab regains visibility
  useEffect(() => {
    refreshProjectData();
    function handleVisibility() {
      if (document.visibilityState === "visible") refreshProjectData();
    }
    function handleFocus() { refreshProjectData(); }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshProjectData]);

  // Folder tree state — initialize with defaults, load from localStorage in useEffect
  const [folderTree, setFolderTree] = useState<FolderTree>({ folders: [], diagramFolderMap: {} });
  const [selectedFolderId, setSelectedFolderId] = useState<string>(ROOT_ID);
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [dragDiagramId, setDragDiagramId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [selectedTreeItem, setSelectedTreeItem] = useState<string | null>(null); // folder or diagram id

  // Resizable nav panel — initialize with default, load from localStorage in useEffect
  const [navWidth, setNavWidth] = useState(208);
  const resizingRef = useRef(false);

  // Initialize folder tree from DB prop, with one-time migration from localStorage
  useEffect(() => {
    const dbTree = parseFolderTree(project.folderTree);
    if (dbTree.folders.length > 0 || Object.keys(dbTree.diagramFolderMap).length > 0) {
      // DB has folder tree data — use it
      setFolderTree(dbTree);
    } else {
      // DB is empty — check localStorage for legacy data and migrate
      try {
        const raw = localStorage.getItem(`folder-tree-${project.id}`);
        if (raw) {
          const legacy = JSON.parse(raw) as FolderTree;
          if (legacy.folders?.length > 0 || Object.keys(legacy.diagramFolderMap ?? {}).length > 0) {
            setFolderTree(legacy);
            saveFolderTreeToDb(project.id, legacy); // migrate to DB
            localStorage.removeItem(`folder-tree-${project.id}`); // clean up
          }
        }
      } catch {}
    }
    const savedWidth = localStorage.getItem(`nav-width-${project.id}`);
    if (savedWidth) setNavWidth(parseInt(savedWidth, 10) || 208);
    const savedTreeItem = localStorage.getItem(`selected-tree-${project.id}`);
    const savedFolder = localStorage.getItem(`selected-folder-${project.id}`);
    if (savedTreeItem) setSelectedTreeItem(savedTreeItem);
    if (savedFolder) setSelectedFolderId(savedFolder);
  }, [project.id, project.folderTree]);

  // Close File menu on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) setShowFileMenu(false);
    }
    if (showFileMenu) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showFileMenu]);

  // Get ordered diagrams in a specific folder
  function getOrderedDiagramsInFolder(folderId: string): DiagramSummary[] {
    const direct = diagrams.filter(d => (folderTree.diagramFolderMap[d.id] ?? ROOT_ID) === folderId);
    const order = folderTree.diagramOrder?.[folderId];
    if (!order) return direct;
    return direct.sort((a, b) => {
      const ai = order.indexOf(a.id);
      const bi = order.indexOf(b.id);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }

  // Get ordered child folders
  function getOrderedChildFolders(parentId: string): FolderNode[] {
    const children = folderTree.folders.filter(f =>
      (f.parentId === null && parentId === ROOT_ID) || f.parentId === parentId
    );
    const order = folderTree.folderOrder?.[parentId];
    if (!order) return children;
    return children.sort((a, b) => {
      const ai = order.indexOf(a.id);
      const bi = order.indexOf(b.id);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }

  function moveItemInArray(arr: string[], id: string, direction: -1 | 1): string[] {
    const idx = arr.indexOf(id);
    if (idx === -1) return arr;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= arr.length) return arr;
    const next = [...arr];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    return next;
  }

  function moveTreeItem(itemId: string, direction: -1 | 1) {
    // Check if it's a diagram
    const isDiagram = diagrams.some(d => d.id === itemId);
    if (isDiagram) {
      const folderId = folderTree.diagramFolderMap[itemId] ?? ROOT_ID;
      const currentOrder = folderTree.diagramOrder?.[folderId]
        ?? getOrderedDiagramsInFolder(folderId).map(d => d.id);
      const newOrder = moveItemInArray(currentOrder, itemId, direction);
      if (newOrder === currentOrder) return;
      updateTree(t => ({
        ...t,
        diagramOrder: { ...t.diagramOrder, [folderId]: newOrder },
      }));
    } else {
      // It's a folder
      const folder = folderTree.folders.find(f => f.id === itemId);
      if (!folder) return;
      const parentId = folder.parentId === null ? ROOT_ID : folder.parentId;
      const currentOrder = folderTree.folderOrder?.[parentId]
        ?? getOrderedChildFolders(parentId).map(f => f.id);
      const newOrder = moveItemInArray(currentOrder, itemId, direction);
      if (newOrder === currentOrder) return;
      updateTree(t => ({
        ...t,
        folderOrder: { ...t.folderOrder, [parentId]: newOrder },
      }));
    }
  }

  // Open a diagram: select it in tree, persist, navigate
  function handleOpenDiagram(diagramId: string) {
    setSelectedTreeItem(diagramId);
    // Also select the folder containing this diagram
    const folderId = folderTree.diagramFolderMap[diagramId] ?? ROOT_ID;
    setSelectedFolderId(folderId);
    // Persist selection so it's restored on return
    localStorage.setItem(`selected-tree-${project.id}`, diagramId);
    localStorage.setItem(`selected-folder-${project.id}`, folderId);
    router.push(`/diagram/${diagramId}`);
  }

  // Keyboard handler for Shift+Arrow reordering
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!selectedTreeItem || editingId) return;
      if (!e.shiftKey) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveTreeItem(selectedTreeItem, -1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveTreeItem(selectedTreeItem, 1);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }); // intentionally no deps — uses latest state via closure

  const updateTree = useCallback((updater: (t: FolderTree) => FolderTree) => {
    setFolderTree(prev => {
      const next = updater(prev);
      saveFolderTreeToDb(project.id, next);
      return next;
    });
  }, [project.id]);

  // Fetch fresh colorConfig from API on mount
  useEffect(() => {
    fetch(`/api/projects/${project.id}`)
      .then((r) => r.json())
      .then((p) => {
        if (p?.colorConfig && typeof p.colorConfig === "object" && !Array.isArray(p.colorConfig)) {
          setProjectColorConfig(p.colorConfig as SymbolColorConfig);
        }
      })
      .catch(() => {});
  }, [project.id]);

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<DiagramType>("context");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  function saveProjectField(fields: Record<string, string>) {
    fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    }).catch(() => {});
  }

  async function handleExportProject(format: ExportFormat = "json") {
    setExporting(true);
    setExportLog([]);
    setExportResult(null);
    const log = (msg: string) => setExportLog(prev => [...prev, msg]);

    try {
      log("Exporting project metadata...");
      const res = await fetch(`/api/projects/${project.id}`);
      if (!res.ok) { log("\u2718 Failed to fetch project data"); setExportResult("failed"); return; }
      const projectData = await res.json();
      log(`\u2714 Project "${projectName}" loaded`);

      const diagramList = projectData.diagrams ?? [];
      log(`Exporting ${diagramList.length} diagram(s)...`);

      const diagramsWithData: Record<string, unknown>[] = [];
      for (let i = 0; i < diagramList.length; i++) {
        const d = diagramList[i] as { id: string; name: string; type: string };
        log(`  Exporting diagram ${i + 1}/${diagramList.length}: "${d.name}" (${d.type})`);
        const dRes = await fetch(`/api/diagrams/${d.id}`);
        if (!dRes.ok) {
          log(`  \u2718 Failed to fetch diagram "${d.name}"`);
          continue;
        }
        diagramsWithData.push(await dRes.json());
        log(`  \u2714 Diagram "${d.name}" exported`);
      }

      log("Exporting folder structure...");
      // Fetch folder tree from the project API (persisted in DB)
      const ftRes = await fetch(`/api/projects/${project.id}`);
      const ftData = ftRes.ok ? await ftRes.json() : null;
      const folderTree = parseFolderTree(ftData?.folderTree);
      const folderCount = (folderTree.folders ?? []).length;
      log(`\u2714 ${folderCount} folder(s) exported`);

      log("Assembling export file...");
      const exportData = {
        schemaVersion: SCHEMA_VERSION,
        appVersion: `${SCHEMA_VERSION}.${version ?? 0}`,
        exportedAt: new Date().toISOString(),
        project: {
          name: projectName,
          description: projectDescription,
          ownerName: projectOwner,
          colorConfig: projectColorConfig,
        },
        diagrams: diagramsWithData.map((d) => ({
          originalId: d.id,
          name: d.name,
          type: d.type,
          data: d.data,
          colorConfig: d.colorConfig,
          displayMode: d.displayMode,
        })),
        folderTree,
      };

      const isXml = format === "xml";
      const fileExt = isXml ? "xml" : "json";
      const mimeType = isXml ? "application/xml" : "application/json";
      const content = isXml
        ? convertExportToXml(exportData as ExportPayload)
        : JSON.stringify(exportData, null, 2);

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName}.diagramatix.${fileExt}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      const sizeKb = Math.round(blob.size / 1024);
      log(`\u2714 Export complete! File: ${projectName}.diagramatix.${fileExt} (${sizeKb} KB)`);
      log(`   ${diagramsWithData.length} diagram(s), ${folderCount} folder(s)`);

      // For XML exports, also download the matching XSD schema so the .xml
      // can be validated by external tools.
      if (isXml) {
        const { downloadMatchingXsd } = await import("@/app/lib/diagram/xmlExport");
        const xsdAppVersion = await downloadMatchingXsd(SCHEMA_VERSION);
        log(`\u2714 XSD schema downloaded (diagramatix-export-v${xsdAppVersion}.xsd)`);
      }

      setExportResult("success");
    } catch (err) {
      console.error("Export failed:", err);
      log(`\u2718 Export failed: ${err instanceof Error ? err.message : String(err)}`);
      setExportResult("failed");
    }
  }

  // ── Import (JSON / XML) ───────────────────────────────────────────────
  // Mirrors the dashboard's import flow: parse the file, validate the
  // schema version, then create a NEW project (alongside this one) with
  // a "(imported)" suffix. After success, show the import-progress modal
  // with a button to navigate into the new project.
  async function handleImportFile(file: File, format: "json" | "xml") {
    setImporting(true);
    setImportLog([]);
    setImportResult(null);
    setImportedProjectId(null);
    const log = (msg: string) => setImportLog(prev => [...prev, msg]);

    let exportData: Record<string, unknown> | null = null;
    try {
      log(`Reading ${file.name}\u2026`);
      const text = await file.text();
      if (format === "xml") {
        const { parseDiagramatixXml } = await import("@/app/lib/diagram/xmlExport");
        exportData = parseDiagramatixXml(text);
      } else {
        exportData = JSON.parse(text);
      }
    } catch (err) {
      log(`\u2718 Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
      setImportResult("failed");
      return;
    }

    if (!exportData || !exportData.project || !exportData.diagrams) {
      log("\u2718 Invalid export file \u2014 missing required fields");
      setImportResult("failed");
      return;
    }

    // Schema version check (additive: warn if older, block if newer major)
    const schemaVer: string = (exportData.schemaVersion as string) ?? (exportData.version as string) ?? "";
    if (schemaVer) {
      const parts = schemaVer.split(".");
      const fileMajor = parseInt(parts[0] ?? "0", 10);
      const appMajor = parseInt(SCHEMA_VERSION.split(".")[0] ?? "0", 10);
      if (fileMajor > appMajor) {
        log(`\u2718 File schema version ${schemaVer} is newer than this app (${SCHEMA_VERSION}).`);
        setImportResult("failed");
        return;
      }
      if (fileMajor < appMajor) {
        log(`Note: file uses older schema ${schemaVer}, will be upgraded to ${SCHEMA_VERSION}.`);
      }
    }

    // Create new project
    const sourceProject = exportData.project as Record<string, unknown>;
    const importName = `${(sourceProject.name as string) ?? "Imported"} (imported)`;
    log(`Creating new project "${importName}"\u2026`);
    let newProject: { id: string };
    try {
      const pRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: importName }),
      });
      if (!pRes.ok) {
        log(`\u2718 Failed to create project: ${pRes.statusText}`);
        setImportResult("failed");
        return;
      }
      newProject = await pRes.json();
    } catch (err) {
      log(`\u2718 Failed to create project: ${err instanceof Error ? err.message : String(err)}`);
      setImportResult("failed");
      return;
    }

    // Update project metadata via PUT (description, ownerName, colorConfig)
    try {
      const meta: Record<string, unknown> = {};
      if (sourceProject.description) meta.description = sourceProject.description;
      if (sourceProject.ownerName) meta.ownerName = sourceProject.ownerName;
      if (sourceProject.colorConfig && Object.keys(sourceProject.colorConfig as Record<string, unknown>).length > 0) {
        meta.colorConfig = sourceProject.colorConfig;
      }
      if (Object.keys(meta).length > 0) {
        await fetch(`/api/projects/${newProject.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(meta),
        });
      }
    } catch { /* best-effort */ }

    // Diagrams
    const diags = (exportData.diagrams as Array<Record<string, unknown>>) ?? [];
    log(`Importing ${diags.length} diagram(s)\u2026`);
    const idMap = new Map<string, string>();
    let successCount = 0;
    for (let i = 0; i < diags.length; i++) {
      const diag = diags[i];
      log(`  Diagram ${i + 1}/${diags.length}: "${diag.name as string}"`);
      try {
        const dRes = await fetch("/api/diagrams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: diag.name,
            type: diag.type ?? "context",
            projectId: newProject.id,
            data: diag.data,
            colorConfig: diag.colorConfig,
            displayMode: diag.displayMode,
          }),
        });
        if (dRes.ok) {
          const created = await dRes.json();
          idMap.set(diag.originalId as string, created.id);
          successCount++;
        } else {
          log(`  \u2718 Failed: ${dRes.statusText}`);
        }
      } catch (err) {
        log(`  \u2718 Failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Folder tree (remap diagram IDs)
    if (exportData.folderTree) {
      const ft = exportData.folderTree as Record<string, unknown>;
      const remappedMap: Record<string, string> = {};
      for (const [oldId, folderId] of Object.entries((ft.diagramFolderMap as Record<string, string>) ?? {})) {
        const newId = idMap.get(oldId);
        if (newId) remappedMap[newId] = folderId;
      }
      const remappedOrder: Record<string, string[]> = {};
      for (const [folderId, ids] of Object.entries((ft.diagramOrder as Record<string, string[]>) ?? {})) {
        remappedOrder[folderId] = (ids as string[]).map(id => idMap.get(id) ?? id);
      }
      const remappedTree = {
        folders: (ft.folders as unknown[]) ?? [],
        diagramFolderMap: remappedMap,
        diagramOrder: remappedOrder,
        folderOrder: (ft.folderOrder as Record<string, string[]>) ?? {},
      };
      await fetch(`/api/projects/${newProject.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderTree: remappedTree }),
      });
    }

    log("");
    log(`\u2714 Import complete: ${successCount}/${diags.length} diagram(s) imported`);
    setImportResult("success");
    setImportedProjectId(newProject.id);
  }

  async function handleCreateDiagram() {
    if (!newName.trim()) { setError("Please enter a name"); return; }
    setCreating(true);
    setError("");
    const res = await fetch("/api/diagrams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), type: newType, projectId: project.id }),
    });
    setCreating(false);
    if (!res.ok) { setError("Failed to create diagram"); return; }
    const diagram = await res.json();
    // Place new diagram in selected folder
    if (selectedFolderId !== ROOT_ID) {
      updateTree(t => ({ ...t, diagramFolderMap: { ...t.diagramFolderMap, [diagram.id]: selectedFolderId } }));
    }
    router.push(`/diagram/${diagram.id}`);
  }

  function handleDeleteDiagram(id: string) {
    const diag = diagrams.find(d => d.id === id);
    setConfirmDialog({
      title: "Delete Diagram",
      message: `Are you sure you want to delete "${diag?.name ?? "this diagram"}"? It will be moved to the system archive.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        await fetch(`/api/diagrams/${id}/archive`, { method: "POST" });
        setDiagrams((prev) => prev.filter((d) => d.id !== id));
        updateTree(t => {
          const map = { ...t.diagramFolderMap };
          delete map[id];
          return { ...t, diagramFolderMap: map };
        });
      },
    });
  }

  async function handleCloneDiagram(diagramId: string) {
    try {
      // Fetch full diagram data
      const srcRes = await fetch(`/api/diagrams/${diagramId}`);
      if (!srcRes.ok) return;
      const src = await srcRes.json();

      // Create a copy in the same project
      const res = await fetch("/api/diagrams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${src.name} (copy)`,
          type: src.type,
          projectId: project.id,
          data: src.data,
          colorConfig: src.colorConfig ?? undefined,
          displayMode: src.displayMode ?? undefined,
        }),
      });
      if (!res.ok) return;
      const created = await res.json();

      // Add the clone to the diagram list in the same folder as the original
      setDiagrams(prev => [{ id: created.id, name: created.name, type: created.type, createdAt: created.createdAt, updatedAt: created.updatedAt }, ...prev]);
      const srcFolder = folderTree.diagramFolderMap[diagramId];
      if (srcFolder) {
        updateTree(t => ({
          ...t,
          diagramFolderMap: { ...t.diagramFolderMap, [created.id]: srcFolder },
        }));
      }
    } catch (err) {
      console.error("Failed to clone diagram:", err);
    }
  }

  async function handleMoveDiagram(diagramId: string, targetProjectId: string | null) {
    const res = await fetch(`/api/diagrams/${diagramId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: targetProjectId }),
    });
    if (!res.ok) return;
    setDiagrams((prev) => prev.filter((d) => d.id !== diagramId));
  }

  function handleAddFolder(parentId: string) {
    setNewFolderParent(parentId);
    setNewFolderName("");
  }

  function confirmAddFolder() {
    if (!newFolderName.trim() || newFolderParent === null) return;
    const id = `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    updateTree(t => ({
      ...t,
      folders: [...t.folders, { id, name: newFolderName.trim(), parentId: newFolderParent === ROOT_ID ? null : newFolderParent }],
    }));
    setNewFolderParent(null);
    setNewFolderName("");
  }

  function handleDeleteFolder(folderId: string) {
    // Move diagrams in this folder (and descendants) to root
    function getDescendantFolderIds(fid: string, folders: FolderNode[]): Set<string> {
      const ids = new Set<string>([fid]);
      for (const f of folders) {
        if (f.parentId === fid || (f.parentId === null && fid === ROOT_ID)) {
          if (!ids.has(f.id)) {
            for (const did of getDescendantFolderIds(f.id, folders)) ids.add(did);
          }
        }
      }
      return ids;
    }
    const toRemove = getDescendantFolderIds(folderId, folderTree.folders);
    updateTree(t => {
      const map = { ...t.diagramFolderMap };
      for (const [did, fid] of Object.entries(map)) {
        if (toRemove.has(fid)) delete map[did];
      }
      return {
        folders: t.folders.filter(f => !toRemove.has(f.id)),
        diagramFolderMap: map,
      };
    });
    if (toRemove.has(selectedFolderId)) setSelectedFolderId(ROOT_ID);
  }

  function startRename(id: string, currentName: string) {
    setEditingId(id);
    setEditingName(currentName);
  }

  function commitRename() {
    if (!editingId || !editingName.trim()) { setEditingId(null); return; }
    const trimmed = editingName.trim();
    // Check if it's a folder
    const isFolder = folderTree.folders.some(f => f.id === editingId);
    if (isFolder) {
      updateTree(t => ({
        ...t,
        folders: t.folders.map(f => f.id === editingId ? { ...f, name: trimmed } : f),
      }));
    } else {
      // It's a diagram — update via API and local state
      const diagId = editingId;
      fetch(`/api/diagrams/${diagId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      }).then(res => {
        if (!res.ok) console.error("Failed to rename diagram:", res.status);
      }).catch(err => console.error("Failed to rename diagram:", err));
      setDiagrams(prev => prev.map(d => d.id === diagId ? { ...d, name: trimmed } : d));
    }
    setEditingId(null);
  }

  function toggleFolderCollapse(folderId: string) {
    updateTree(t => ({
      ...t,
      folders: t.folders.map(f => f.id === folderId ? { ...f, collapsed: !f.collapsed } : f),
    }));
  }

  function moveDiagramToFolder(diagramId: string, folderId: string) {
    updateTree(t => {
      const map = { ...t.diagramFolderMap };
      if (folderId === ROOT_ID) delete map[diagramId];
      else map[diagramId] = folderId;
      return { ...t, diagramFolderMap: map };
    });
  }

  // Get all diagram IDs visible under a folder (recursively)
  function getDiagramsInFolder(folderId: string): DiagramSummary[] {
    if (folderId === ROOT_ID) return diagrams; // project root shows ALL
    const childFolderIds = new Set<string>([folderId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of folderTree.folders) {
        const pid = f.parentId === null ? ROOT_ID : f.parentId;
        if (childFolderIds.has(pid) && !childFolderIds.has(f.id)) {
          childFolderIds.add(f.id);
          changed = true;
        }
      }
    }
    return diagrams.filter(d => {
      const dFolder = folderTree.diagramFolderMap[d.id] ?? ROOT_ID;
      return childFolderIds.has(dFolder);
    });
  }

  // Diagram type icon markers
  function DiagramTypeMarker({ type }: { type: string }) {
    switch (type) {
      case "bpmn": return <text x={9} y={11} fontSize={5} fill="#92400e" textAnchor="middle" fontWeight="bold">B</text>;
      case "context": case "basic": return <text x={9} y={11} fontSize={5} fill="#92400e" textAnchor="middle" fontWeight="bold">C</text>;
      case "process-context": return <text x={9} y={11} fontSize={5} fill="#92400e" textAnchor="middle" fontWeight="bold">PC</text>;
      case "state-machine": return <text x={9} y={11} fontSize={5} fill="#92400e" textAnchor="middle" fontWeight="bold">SM</text>;
      case "domain": return <text x={9} y={11} fontSize={5} fill="#92400e" textAnchor="middle" fontWeight="bold">D</text>;
      default: return null;
    }
  }

  // Render folder tree recursively
  // Check if a folder contains any diagrams or subfolders (recursively)
  function folderHasContent(folderId: string): boolean {
    const hasDiagrams = diagrams.some(d => (folderTree.diagramFolderMap[d.id] ?? ROOT_ID) === folderId);
    if (hasDiagrams) return true;
    const childFolders = folderTree.folders.filter(f =>
      (f.parentId === null && folderId === ROOT_ID) || f.parentId === folderId
    );
    return childFolders.length > 0;
  }

  // SVG icons as inline components
  const PencilIcon = (
    <svg width={10} height={10} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 2l3 3-7 7H0V9z" />
    </svg>
  );
  const TrashIcon = (
    <svg width={10} height={10} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round">
      <path d="M2 3h8M4.5 3V2h3v1M3 3v7a1 1 0 001 1h4a1 1 0 001-1V3" />
    </svg>
  );

  function renderFolder(folderId: string, depth: number): React.ReactNode {
    const isRoot = folderId === ROOT_ID;
    const folder = isRoot ? null : folderTree.folders.find(f => f.id === folderId);
    const name = isRoot ? projectName : (folder?.name ?? "?");
    const isSelected = selectedFolderId === folderId;
    const isCollapsed = folder?.collapsed ?? false;
    const childFolders = getOrderedChildFolders(folderId);
    const directDiagrams = getOrderedDiagramsInFolder(folderId);
    const hasChildren = childFolders.length > 0 || directDiagrams.length > 0;

    return (
      <div key={folderId}>
        <div
          className={`flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer text-[11px] ${
            selectedTreeItem === folderId ? "bg-blue-200 text-blue-900 ring-1 ring-blue-400"
            : isSelected ? "bg-blue-100 text-blue-800"
            : "text-gray-700 hover:bg-gray-100"
          }`}
          style={{ paddingLeft: depth * 12 + 4 }}
          onClick={() => { setSelectedFolderId(folderId); setSelectedTreeItem(isRoot ? null : folderId); }}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("bg-blue-50"); }}
          onDragLeave={(e) => { e.currentTarget.classList.remove("bg-blue-50"); }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove("bg-blue-50");
            if (dragDiagramId) { moveDiagramToFolder(dragDiagramId, folderId); setDragDiagramId(null); }
          }}
        >
          {hasChildren && !isRoot ? (
            <span className="w-3 text-center text-gray-400 cursor-pointer text-[9px]"
              onClick={(e) => { e.stopPropagation(); toggleFolderCollapse(folderId); }}>
              {isCollapsed ? "\u25B6" : "\u25BC"}
            </span>
          ) : <span className="w-3" />}
          {/* Folder icon */}
          <svg width={14} height={12} viewBox="0 0 16 14" fill="none">
            <path d="M1 3V12a1 1 0 001 1h12a1 1 0 001-1V5a1 1 0 00-1-1H8L6.5 2H2a1 1 0 00-1 1z"
              fill={isRoot ? "#3b82f6" : "#fbbf24"} stroke="#78716c" strokeWidth={0.5} />
          </svg>
          {editingId === folderId ? (
            <input autoFocus type="text" value={editingName}
              onChange={e => setEditingName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditingId(null); }}
              onClick={e => e.stopPropagation()}
              className="flex-1 text-[11px] font-medium border border-blue-400 rounded px-1 py-0 outline-none min-w-0" />
          ) : (
            <span className="truncate flex-1 font-medium">{name}</span>
          )}
          {/* Refresh icon on root folder */}
          {isRoot && (
            <button onClick={(e) => { e.stopPropagation(); refreshProjectData(); }}
              className="opacity-0 group-hover:opacity-100 hover:!opacity-100 text-gray-400 hover:text-blue-500 px-0.5"
              title="Refresh project tree"
              style={{ opacity: isSelected ? 1 : undefined }}
            >
              <svg width={11} height={11} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 2v5h5" /><path d="M15 14v-5h-5" />
                <path d="M2.5 10.5A6 6 0 0113.3 4.3L15 6M13.5 5.5A6 6 0 012.7 11.7L1 10" />
              </svg>
            </button>
          )}
          {/* Folder action buttons */}
          {!isRoot && !editingId && (
            <button onClick={(e) => { e.stopPropagation(); startRename(folderId, name); }}
              className="opacity-0 group-hover:opacity-100 hover:!opacity-100 text-gray-400 hover:text-blue-500 px-0.5"
              title="Rename folder"
              style={{ opacity: selectedTreeItem === folderId ? 1 : undefined }}
            >{PencilIcon}</button>
          )}
          <button onClick={(e) => { e.stopPropagation(); handleAddFolder(folderId); }}
            className="opacity-0 group-hover:opacity-100 hover:!opacity-100 text-gray-400 hover:text-blue-500 text-[10px] px-0.5 font-bold"
            title="Add subfolder"
            style={{ opacity: selectedTreeItem === folderId || isSelected ? 1 : undefined }}
          >+</button>
          {!isRoot && (() => {
            const hasContent = folderHasContent(folderId);
            return (
              <button onClick={(e) => { e.stopPropagation(); if (!hasContent) handleDeleteFolder(folderId); }}
                disabled={hasContent}
                className={`opacity-0 group-hover:opacity-100 hover:!opacity-100 px-0.5 ${
                  hasContent ? "text-gray-300 cursor-not-allowed" : "text-gray-400 hover:text-red-500"
                }`}
                title={hasContent ? "Cannot delete: folder is not empty" : "Delete folder"}
                style={{ opacity: selectedTreeItem === folderId ? 1 : undefined }}
              >{TrashIcon}</button>
            );
          })()}
        </div>
        {/* New folder input */}
        {newFolderParent === folderId && (
          <div className="flex items-center gap-1 py-0.5" style={{ paddingLeft: (depth + 1) * 12 + 18 }}>
            <input autoFocus type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") confirmAddFolder(); if (e.key === "Escape") setNewFolderParent(null); }}
              className="flex-1 text-[10px] border border-gray-300 rounded px-1 py-0.5" placeholder="Folder name" />
            <button onClick={confirmAddFolder} className="text-[10px] text-blue-600">{"\u2713"}</button>
            <button onClick={() => setNewFolderParent(null)} className="text-[10px] text-gray-400">{"\u2715"}</button>
          </div>
        )}
        {/* Children (if not collapsed) */}
        {!isCollapsed && (
          <>
            {childFolders.map(cf => renderFolder(cf.id, depth + 1))}
            {directDiagrams.map(d => (
              <div key={d.id}
                draggable
                onDragStart={() => setDragDiagramId(d.id)}
                onDragEnd={() => setDragDiagramId(null)}
                className={`flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer text-[10px] ${
                  selectedTreeItem === d.id ? "bg-blue-100 text-blue-800" : "text-gray-600 hover:bg-gray-50"
                } ${dragDiagramId === d.id ? "opacity-40" : ""}`}
                style={{ paddingLeft: (depth + 1) * 12 + 4 }}
                onClick={(e) => { e.stopPropagation(); setSelectedTreeItem(d.id); }}
                onDoubleClick={() => handleOpenDiagram(d.id)}
              >
                <span className="w-3" />
                <svg width={14} height={14} viewBox="0 0 18 16" fill="none">
                  <rect x={1} y={1} width={16} height={14} rx={2} fill="#fef9c3" stroke="#d97706" strokeWidth={0.7} />
                  <DiagramTypeMarker type={d.type} />
                </svg>
                {editingId === d.id ? (
                  <input autoFocus type="text" value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditingId(null); }}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 text-[10px] border border-blue-400 rounded px-1 py-0 outline-none min-w-0" />
                ) : (
                  <>
                    <span className="truncate flex-1">{d.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); startRename(d.id, d.name); }}
                      className="opacity-0 group-hover:opacity-100 hover:!opacity-100 text-gray-400 hover:text-blue-500 px-0.5"
                      title="Rename diagram"
                      style={{ opacity: selectedTreeItem === d.id ? 1 : undefined }}
                    >{PencilIcon}</button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteDiagram(d.id); }}
                      className="opacity-0 group-hover:opacity-100 hover:!opacity-100 text-gray-400 hover:text-red-500 px-0.5"
                      title="Delete diagram"
                      style={{ opacity: selectedTreeItem === d.id ? 1 : undefined }}
                    >{TrashIcon}</button>
                  </>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    );
  }

  // If a specific diagram is selected in the tree, show only that diagram;
  // otherwise show all diagrams in the selected folder
  const selectedDiagram = selectedTreeItem ? diagrams.find(d => d.id === selectedTreeItem) : null;
  const visibleDiagrams = selectedDiagram ? [selectedDiagram] : getDiagramsInFolder(selectedFolderId);

  return (
    <div className={`min-h-screen ${readOnly ? "bg-orange-50" : "bg-gray-50"} flex flex-col`}>
      {readOnly && viewingAsName !== undefined && viewingAsEmail !== undefined && (
        <ImpersonationBanner viewingAsName={viewingAsName ?? ""} viewingAsEmail={viewingAsEmail ?? ""} />
      )}
      {/* Header */}
      <header className={`${readOnly ? "bg-orange-50" : "bg-white"} border-b border-gray-200 px-4 py-2 flex-shrink-0`}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            {"\u2190"} Dashboard
          </button>
          {/* Project name — editable only when not readOnly */}
          {!readOnly && editingProjectName ? (
            <input autoFocus type="text" value={projectName}
              onChange={e => setProjectName(e.target.value)}
              onBlur={() => { setEditingProjectName(false); saveProjectField({ name: projectName }); }}
              onKeyDown={e => { if (e.key === "Enter") { setEditingProjectName(false); saveProjectField({ name: projectName }); } if (e.key === "Escape") { setProjectName(project.name); setEditingProjectName(false); } }}
              className="text-sm font-semibold text-gray-900 border border-blue-400 rounded px-2 py-0.5 outline-none flex-1" />
          ) : (
            <h1 className={`text-sm font-semibold text-gray-900 flex-1 ${readOnly ? "" : "cursor-pointer hover:text-blue-600"}`}
              onClick={() => { if (!readOnly) setEditingProjectName(true); }} title={readOnly ? undefined : "Click to edit project name"}>
              {projectName}
            </h1>
          )}
          {projectOwner && (
            <span className="text-[10px] text-gray-400">Owner: <strong className="text-gray-600">{projectOwner}</strong></span>
          )}
          {version ? <span className="text-[10px] text-gray-400">v{SCHEMA_VERSION}.{version}</span> : null}
          {!readOnly && (
            <button
              onClick={() => setShowMaintenance(true)}
              className="px-3 py-1 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Project Settings
            </button>
          )}
          {!readOnly && (
            <>
              {/* Hidden file inputs for Import JSON / Import XML */}
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
              {/* Unified File menu — Export JSON / Import JSON / Export XML / Import XML */}
              <div className="relative" ref={fileMenuRef}>
                <button
                  onClick={() => { if (!exporting && !importing) setShowFileMenu(v => !v); }}
                  disabled={exporting || importing}
                  className={`px-3 py-1 text-xs font-medium rounded-md border ${
                    exporting
                      ? "bg-green-600 text-white border-green-600 cursor-not-allowed"
                      : importing
                        ? "bg-blue-600 text-white border-blue-600 cursor-not-allowed"
                        : "text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {exporting
                    ? "Exporting\u2026"
                    : importing
                      ? "Importing\u2026"
                      : "File \u25BE"}
                </button>
                {showFileMenu && (
                  <div
                    className="fixed bg-white border border-gray-200 rounded-md shadow-lg py-1"
                    style={{
                      zIndex: 9999,
                      top: fileMenuRef.current
                        ? fileMenuRef.current.getBoundingClientRect().bottom + 4
                        : 0,
                      left: fileMenuRef.current
                        ? fileMenuRef.current.getBoundingClientRect().left
                        : 0,
                      minWidth: 160,
                    }}
                  >
                    <button
                      className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                      onClick={() => { setShowFileMenu(false); handleExportProject("json"); }}
                    >
                      Export JSON
                    </button>
                    <button
                      className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                      onClick={() => { setShowFileMenu(false); importJsonInputRef.current?.click(); }}
                    >
                      Import JSON
                    </button>
                    <div className="border-t border-gray-100" />
                    <button
                      className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                      onClick={() => { setShowFileMenu(false); handleExportProject("xml"); }}
                    >
                      Export XML
                    </button>
                    <button
                      className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                      onClick={() => { setShowFileMenu(false); importXmlInputRef.current?.click(); }}
                    >
                      Import XML
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowNewDiagram(true)}
                className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs font-medium"
              >
                + New Diagram
              </button>
            </>
          )}
        </div>
        {projectDescription && (
          <p className="text-[10px] text-gray-500 mt-1 ml-20 truncate" title={projectDescription}>{projectDescription}</p>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Resizable folder tree */}
        <div className="border-r border-gray-200 bg-white overflow-y-auto p-2 flex-shrink-0 group relative"
          style={{ width: navWidth }}>
          {renderFolder(ROOT_ID, 0)}
        </div>
        {/* Resize handle */}
        <div
          className="w-1 cursor-col-resize hover:bg-blue-300 active:bg-blue-400 flex-shrink-0"
          onMouseDown={(e) => {
            e.preventDefault();
            resizingRef.current = true;
            const startX = e.clientX;
            const startW = navWidth;
            let lastW = startW;
            function onMove(ev: MouseEvent) {
              if (!resizingRef.current) return;
              lastW = Math.max(120, Math.min(500, startW + ev.clientX - startX));
              setNavWidth(lastW);
            }
            function onUp() {
              resizingRef.current = false;
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
              localStorage.setItem(`nav-width-${project.id}`, String(lastW));
            }
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
        />

        {/* Right: Diagram tiles */}
        <main className="flex-1 overflow-y-auto p-4">
          {visibleDiagrams.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <p className="text-gray-500 text-sm mb-3">No diagrams in this folder</p>
              <button
                onClick={() => setShowNewDiagram(true)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs"
              >
                Create a diagram
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {visibleDiagrams.map((d) => (
                <DiagramCard
                  key={d.id}
                  diagram={d}
                  otherProjects={otherProjects}
                  onDelete={handleDeleteDiagram}
                  onClone={handleCloneDiagram}
                  onMove={handleMoveDiagram}
                  onOpen={handleOpenDiagram}
                  colorConfig={projectColorConfig}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Export progress modal */}
      {exporting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[70vh]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">
                {exportResult === "success" ? "\u2714 Export Complete" : exportResult === "failed" ? "\u2718 Export Failed" : "Exporting Project\u2026"}
              </h2>
              {exportResult && (
                <button onClick={() => { setExporting(false); setExportLog([]); setExportResult(null); }}
                  className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 font-mono text-[10px] text-gray-600 space-y-0.5">
              {exportLog.map((line, i) => (
                <p key={i} className={
                  line.startsWith("\u2714") ? "text-green-600" :
                  line.startsWith("\u2718") ? "text-red-600" :
                  line.startsWith("  ") ? "text-gray-500 pl-2" : "text-gray-700"
                }>{line}</p>
              ))}
              {!exportResult && (
                <p className="text-blue-500 animate-pulse">{"\u25CF"} Working...</p>
              )}
            </div>
            {exportResult && (
              <div className="px-5 py-3 border-t border-gray-200 flex justify-end">
                <button onClick={() => { setExporting(false); setExportLog([]); setExportResult(null); }}
                  className={`px-4 py-1.5 text-xs rounded-md text-white ${exportResult === "success" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import progress modal */}
      {(importing || importLog.length > 0) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[70vh]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">
                {importResult === "success"
                  ? "\u2714 Import Complete"
                  : importResult === "failed"
                    ? "\u2718 Import Failed"
                    : "Importing\u2026"}
              </h2>
              {importResult && (
                <button
                  onClick={() => {
                    setImporting(false);
                    setImportLog([]);
                    setImportResult(null);
                    setImportedProjectId(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                >
                  &times;
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 font-mono text-[10px] text-gray-600 space-y-0.5">
              {importLog.map((line, i) => (
                <p
                  key={i}
                  className={
                    line.startsWith("\u2714") ? "text-green-600" :
                    line.startsWith("\u2718") ? "text-red-600" :
                    line.startsWith("  ") ? "text-gray-500 pl-2" : "text-gray-700"
                  }
                >
                  {line}
                </p>
              ))}
              {!importResult && (
                <p className="text-blue-500 animate-pulse">{"\u25CF"} Working...</p>
              )}
            </div>
            {importResult && (
              <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
                {importResult === "success" && importedProjectId && (
                  <button
                    onClick={() => {
                      setImporting(false);
                      setImportLog([]);
                      setImportResult(null);
                      router.push(`/dashboard/projects/${importedProjectId}`);
                    }}
                    className="px-4 py-1.5 text-xs rounded-md text-white bg-blue-600 hover:bg-blue-700"
                  >
                    Open Imported Project
                  </button>
                )}
                <button
                  onClick={() => {
                    setImporting(false);
                    setImportLog([]);
                    setImportResult(null);
                    setImportedProjectId(null);
                  }}
                  className={`px-4 py-1.5 text-xs rounded-md text-white ${importResult === "success" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Diagram Settings modal */}
      {showMaintenance && (
        <DiagramMaintenanceModal
          projectId={project.id}
          initialColorConfig={projectColorConfig}
          onClose={() => setShowMaintenance(false)}
          onSaved={(config) => {
            setProjectColorConfig(config);
            // No router.refresh() — React re-renders only affected diagram thumbnails
          }}
        />
      )}

      {/* New Diagram dialog */}
      {showNewDiagram && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New Diagram</h2>

            {error && (
              <p className="mb-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateDiagram()}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="My diagram"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
              <div className="grid grid-cols-2 gap-1.5">
                {DIAGRAM_TYPES.map((dt) => (
                  <button
                    key={dt.value}
                    type="button"
                    onClick={() => setNewType(dt.value)}
                    className={`px-3 py-1.5 text-sm rounded-md border text-left ${
                      newType === dt.value
                        ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                        : "border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {dt.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                {DIAGRAM_TYPES.find((dt) => dt.value === newType)?.description}
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowNewDiagram(false); setNewName(""); setError(""); }}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDiagram}
                disabled={creating}
                className={`px-4 py-2 text-sm text-white rounded-md ${
                  creating ? "bg-green-600" : "bg-blue-600 hover:bg-blue-700"
                } disabled:cursor-not-allowed`}
              >
                {creating ? "Creating\u2026" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}

function DiagramThumbnail({ data, colorConfig }: { data: unknown; colorConfig?: SymbolColorConfig }) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as DiagramData;
  if (!d.elements?.length) return null;

  const colors = { ...DEFAULT_SYMBOL_COLORS, ...colorConfig };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of d.elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }

  const PAD = 10;
  const vw = maxX - minX + PAD * 2;
  const vh = maxY - minY + PAD * 2;
  const viewBox = `${minX - PAD} ${minY - PAD} ${vw} ${vh}`;

  return (
    <svg viewBox={viewBox} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {d.connectors?.map((c) => {
        if (!c.waypoints?.length) return null;
        const pts = c.waypoints.map((p) => `${p.x},${p.y}`).join(" ");
        return <polyline key={c.id} points={pts} fill="none" stroke="#9ca3af" strokeWidth={1} />;
      })}
      {d.elements.map((el) => {
        const { x, y, width: w, height: h, type } = el;
        const fill = resolveColor(type, colors);
        if (type === "gateway") {
          const cx = x + w / 2, cy = y + h / 2;
          return <polygon key={el.id}
            points={`${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`}
            fill={fill} stroke="#374151" strokeWidth={1} />;
        }
        if (type === "start-event" || type === "end-event" || type === "intermediate-event"
            || type === "initial-state" || type === "final-state") {
          return <circle key={el.id} cx={x + w / 2} cy={y + h / 2} r={w / 2}
            fill={fill} stroke="#374151" strokeWidth={1} />;
        }
        if (type === "use-case") {
          return <ellipse key={el.id} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2}
            fill={fill} stroke="#374151" strokeWidth={1} />;
        }
        if (type === "actor" || type === "team" || type === "hourglass" || type === "system") {
          return <rect key={el.id} x={x} y={y} width={w} height={h}
            fill="none" stroke={fill} strokeWidth={1} />;
        }
        if (type === "group" || type === "text-annotation") {
          return <rect key={el.id} x={x} y={y} width={w} height={h}
            fill="none" stroke={fill} strokeWidth={1} strokeDasharray="4 2" />;
        }
        const rx = type === "state" || type === "composite-state" ? 8 : 3;
        return <rect key={el.id} x={x} y={y} width={w} height={h}
          rx={rx} fill={fill} stroke="#374151" strokeWidth={1} />;
      })}
    </svg>
  );
}

function DiagramCard({
  diagram,
  otherProjects,
  onDelete,
  onClone,
  onMove,
  onOpen,
  colorConfig,
}: {
  diagram: DiagramSummary;
  otherProjects: OtherProject[];
  onDelete: (id: string) => void;
  onClone: (id: string) => void;
  onMove: (diagramId: string, projectId: string | null) => void;
  onOpen: (diagramId: string) => void;
  colorConfig?: SymbolColorConfig;
}) {
  const [showMove, setShowMove] = useState(false);

  return (
    <div
      onClick={() => onOpen(diagram.id)}
      className="bg-white border border-gray-200 rounded-md p-2.5 hover:border-blue-300 hover:shadow-sm cursor-pointer group transition-all relative"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-medium text-gray-900 text-xs truncate flex-1">{diagram.name}</h3>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 ml-1">
          <button
            onClick={(e) => { e.stopPropagation(); onClone(diagram.id); }}
            className="text-gray-400 hover:text-blue-500 px-0.5"
            title="Clone diagram"
          >
            <svg width={11} height={11} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <rect x={5} y={5} width={10} height={10} rx={1.5} />
              <path d="M11 5V2.5A1.5 1.5 0 009.5 1H2.5A1.5 1.5 0 001 2.5v7A1.5 1.5 0 002.5 11H5" />
            </svg>
          </button>
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowMove((v) => !v); }}
              className="text-gray-400 hover:text-blue-500 text-[10px] px-0.5"
              title="Move to project..."
            >{"\u2197"}</button>
            {showMove && (
              <div onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-5 z-20 bg-white border border-gray-200 rounded shadow-lg min-w-36 py-1">
                <p className="px-3 py-1 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Move to project</p>
                {otherProjects.map((p) => (
                  <button key={p.id}
                    onClick={() => { onMove(diagram.id, p.id); setShowMove(false); }}
                    className="block w-full text-left px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">{p.name}</button>
                ))}
                <hr className="my-1 border-gray-100" />
                <button
                  onClick={() => { onMove(diagram.id, null); setShowMove(false); }}
                  className="block w-full text-left px-3 py-1 text-xs text-gray-500 hover:bg-gray-50 italic">Unorganised</button>
              </div>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(diagram.id); }}
            className="text-gray-400 hover:text-red-500 text-[10px] px-0.5"
          >{"\u2715"}</button>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-gray-400">
        <span>{DIAGRAM_TYPE_LABELS[diagram.type] ?? diagram.type}</span>
        <span>{"\u00B7"}</span>
        <span>{new Date(diagram.updatedAt).toLocaleDateString()}</span>
      </div>
      <div className="mt-1.5 ml-auto w-[90%] h-9 opacity-40 group-hover:opacity-70 transition-opacity pointer-events-none">
        <DiagramThumbnail data={(diagram.data ?? { elements: [], connectors: [] }) as DiagramData} colorConfig={colorConfig} />
      </div>
    </div>
  );
}
