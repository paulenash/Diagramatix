"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { DiagramType, DiagramData } from "@/app/lib/diagram/types";
import { SCHEMA_VERSION } from "@/app/lib/diagram/types";
import { resolveColor, DEFAULT_SYMBOL_COLORS, type SymbolColorConfig } from "@/app/lib/diagram/colors";
import { DiagramMaintenanceModal, type FontConfig } from "./DiagramMaintenanceModal";
import { LinkScanDialog } from "./LinkScanDialog";
import { ImpersonationBanner } from "@/app/components/ImpersonationBanner";
import { SharePointPicker } from "@/app/components/SharePointPicker";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { TranslateToBpmnDialog } from "@/app/components/TranslateToBpmnDialog";
import { ProjectStructureSection } from "@/app/components/entityLists/ProjectStructureSection";
import { DiagramTypeBadge } from "@/app/components/DiagramTypeBadge";
import { useDiagramTypeStyles } from "@/app/hooks/useDiagramTypeStyles";
import { lightenHex } from "@/app/lib/diagram/diagramTypeStyles";

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
  fontConfig?: unknown;
  folderTree?: unknown;
  diagrams: DiagramSummary[];
}

interface OtherProject {
  id: string;
  name: string;
}

interface VisioImportResult {
  diagram: { id: string };
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
  project: ProjectDetail;
  otherProjects: OtherProject[];
  version?: number;
  readOnly?: boolean;
  viewingAsName?: string;
  viewingAsEmail?: string;
  impersonationMode?: "view" | "edit";
  isAdmin?: boolean;
  hasMicrosoft?: boolean;
}

const DIAGRAM_TYPES: { value: DiagramType; label: string; description: string }[] = [
  { value: "context", label: "Context", description: "External entities, processes, and data flows" },
  { value: "process-context", label: "Process Context", description: "Use cases with actors showing process participants" },
  { value: "state-machine", label: "State Machine", description: "States and transitions for entity lifecycle" },
  { value: "bpmn", label: "BPMN", description: "Full Business Process Model and Notation" },
  { value: "domain", label: "Domain", description: "UML class diagrams with classes, enumerations, and relationships" },
  { value: "value-chain", label: "Value Chain", description: "Process-based value chain diagrams with value chain containers" },
  { value: "archimate", label: "ArchiMate", description: "Enterprise architecture using the ArchiMate 3.1 standard (Business, Motivation, Strategy, Application layers)" },
  { value: "flowchart", label: "Standard Flowchart", description: "Classic black-and-white flowchart with terminators, processes, decisions, and flowlines" },
];

export function ProjectDetailClient({ project, otherProjects, version, readOnly, viewingAsName, viewingAsEmail, impersonationMode, isAdmin, hasMicrosoft }: Props) {
  const router = useRouter();
  const [diagrams, setDiagrams] = useState(project.diagrams);
  const [projectName, setProjectName] = useState(project.name);

  // Tile grid column count — computed from the grid container's actual width
  // (not the viewport). This gives "primacy" to the nav-tree width: when the
  // user drags the tree wider, the main pane shrinks and the tile count
  // re-flows automatically, rather than tiles staying fixed and getting cut off.
  const tileGridRef = useRef<HTMLDivElement | null>(null);
  const [tileColumns, setTileColumns] = useState(3);
  useEffect(() => {
    const el = tileGridRef.current;
    if (!el) return;
    const TILE_MIN = 240; // matches the target column width used by DiagramCard
    function recompute(width: number) {
      setTileColumns(Math.max(1, Math.floor(width / TILE_MIN)));
    }
    recompute(el.clientWidth);
    const ro = new ResizeObserver(entries => {
      for (const ent of entries) recompute(ent.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
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
  // File menu navigation: chosen section (Export/Import) and destination
  // (Local/SharePoint). Reset whenever the menu closes.
  const [menuSection, setMenuSection] = useState<null | "export" | "import">(null);
  const [menuDest, setMenuDest] = useState<null | "local" | "sharepoint">(null);
  useEffect(() => { if (!showFileMenu) { setMenuSection(null); setMenuDest(null); } }, [showFileMenu]);
  // Esc steps back one level (format → Local/SharePoint → Export/Import → close).
  useEffect(() => {
    if (!showFileMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); e.stopPropagation();
      if (menuDest) setMenuDest(null);
      else if (menuSection) setMenuSection(null);
      else setShowFileMenu(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [showFileMenu, menuSection, menuDest]);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  // "Project ▾" dropdown: groups Project Configuration + Scan together.
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [showLinkScan, setShowLinkScan] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);

  // Scan Diagrams for Errors — three checks per diagram:
  //   1. sequence / association connectors on a Pool or Lane
  //   2. pools or lanes with duplicate (case-insensitive) labels
  //   3. pools with exactly one child lane
  interface ScanConnectorIssue {
    connectorId: string;
    type: string;
    sourceName: string;
    sourceType: string;
    targetName: string;
    targetType: string;
    sourceIsContainer: boolean;
    targetIsContainer: boolean;
  }
  interface ScanDuplicateName {
    name: string;
    elements: { id: string; type: string }[];
  }
  interface ScanSingleLanePool {
    poolId: string;
    poolName: string;
    laneId: string;
    laneName: string;
  }
  interface ScanHangingMessage {
    connectorId: string;
    sourceName: string;
    sourceType: string;
    targetName: string;
    targetType: string;
    reason: string;
    severity: "error" | "warning";
  }
  // BPMN-correctness issues from the shared rule registry (containment,
  // merge placement, boundary-on-pool, event-sub connectors, dangling refs…).
  interface ScanStructuralIssue {
    rule: string;
    message: string;
    severity: "error" | "warning";
    ids: string[];
  }
  interface ScanDiagram {
    diagramId: string;
    diagramName: string;
    diagramType: string;
    badConnectors: ScanConnectorIssue[];
    duplicateNames: ScanDuplicateName[];
    singleLanePools: ScanSingleLanePool[];
    hangingMessages: ScanHangingMessage[];
    structuralIssues: ScanStructuralIssue[];
  }
  interface ScanResult {
    diagrams: ScanDiagram[];
    totalBadConnectors: number;
    totalDuplicateGroups: number;
    totalSingleLanePools: number;
    totalHangingMessages: number;
    totalHangingErrors: number;
    totalHangingWarnings: number;
    totalStructuralIssues: number;
  }
  const [scanBusy, setScanBusy] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState("");
  const [scanExpanded, setScanExpanded] = useState<Set<string>>(new Set());
  const [scanErrorsOpen, setScanErrorsOpen] = useState(true);
  const [scanWarningsOpen, setScanWarningsOpen] = useState(true);
  // Issue-type filter — ticked types are HIDDEN from the result list.
  // Lets the user park known/accepted issues so the next rescan focuses
  // on what's still actionable. Persists across rescans during the
  // session via the same sessionStorage entry as the rest of the scan
  // state.
  type ErrorType =
    | "pool-lane-connector"
    | "duplicate-name"
    | "single-lane-pool"
    | "hanging-error"
    | "structural-error";
  type WarningType = "hanging-warning";
  const [ignoredErrorTypes, setIgnoredErrorTypes] = useState<Set<ErrorType>>(new Set());
  const [ignoredWarningTypes, setIgnoredWarningTypes] = useState<Set<WarningType>>(new Set());
  const [scanIgnoresOpen, setScanIgnoresOpen] = useState(false);
  const ERROR_TYPE_LABELS: Record<ErrorType, string> = {
    "pool-lane-connector": "Sequence/Association on Pool or Lane",
    "duplicate-name":      "Duplicate Pool/Lane names",
    "single-lane-pool":    "Pools with a single Lane",
    "hanging-error":       "Hanging or misconnected messages",
    "structural-error":    "BPMN structure (containment, merge, event-sub…)",
  };
  const WARNING_TYPE_LABELS: Record<WarningType, string> = {
    "hanging-warning": "Messages touching a white-box pool",
  };
  /** Per-project sessionStorage key. Saving the scan result + expand
   *  state survives in-app navigation to a diagram and back so the user
   *  doesn't have to re-run the scan after fixing one diagram. */
  const scanStorageKey = `scan-result-${project.id}`;

  // Restore a saved scan result on mount (e.g. after navigating to a
  // flagged diagram and returning here). sessionStorage scopes to the
  // browser tab and clears when the tab closes — appropriate lifetime
  // for "what I was reviewing this session".
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(scanStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        result?: ScanResult;
        expanded?: string[];
        errorsOpen?: boolean;
        warningsOpen?: boolean;
        ignoredErrors?: string[];
        ignoredWarnings?: string[];
        ignoresOpen?: boolean;
      };
      if (parsed.result) {
        setScanResult(parsed.result);
        setScanExpanded(new Set(parsed.expanded ?? []));
        if (typeof parsed.errorsOpen === "boolean") setScanErrorsOpen(parsed.errorsOpen);
        if (typeof parsed.warningsOpen === "boolean") setScanWarningsOpen(parsed.warningsOpen);
        if (Array.isArray(parsed.ignoredErrors))
          setIgnoredErrorTypes(new Set(parsed.ignoredErrors as ErrorType[]));
        if (Array.isArray(parsed.ignoredWarnings))
          setIgnoredWarningTypes(new Set(parsed.ignoredWarnings as WarningType[]));
        if (typeof parsed.ignoresOpen === "boolean") setScanIgnoresOpen(parsed.ignoresOpen);
      }
    } catch { /* ignore — corrupt entry; next scan overwrites */ }
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save the current scan state whenever any of its inputs change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!scanResult) {
      window.sessionStorage.removeItem(scanStorageKey);
      return;
    }
    try {
      window.sessionStorage.setItem(
        scanStorageKey,
        JSON.stringify({
          result: scanResult,
          expanded: Array.from(scanExpanded),
          errorsOpen: scanErrorsOpen,
          warningsOpen: scanWarningsOpen,
          ignoredErrors: Array.from(ignoredErrorTypes),
          ignoredWarnings: Array.from(ignoredWarningTypes),
          ignoresOpen: scanIgnoresOpen,
        }),
      );
    } catch { /* quota — ignore */ }
  }, [scanResult, scanExpanded, scanErrorsOpen, scanWarningsOpen, ignoredErrorTypes, ignoredWarningTypes, scanIgnoresOpen, scanStorageKey]);

  async function handleScanPoolConnectors() {
    setScanBusy(true);
    setScanError("");
    setScanResult(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/scan-pool-connectors`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        setScanError(err.error ?? "Scan failed");
      } else {
        const data = await res.json();
        setScanResult(data);
        // Auto-expand every diagram row in both groups so the user
        // immediately sees the per-diagram issues. Keys are
        // `${"error"|"warning"}:${diagramId}` so each severity bucket
        // toggles independently.
        const keys = new Set<string>();
        for (const x of (data.diagrams as { diagramId: string }[])) {
          keys.add(`error:${x.diagramId}`);
          keys.add(`warning:${x.diagramId}`);
        }
        setScanExpanded(keys);
        setScanErrorsOpen(true);
        setScanWarningsOpen(true);
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Network error");
    } finally {
      setScanBusy(false);
    }
  }
  const importJsonInputRef = useRef<HTMLInputElement>(null);
  const importXmlInputRef = useRef<HTMLInputElement>(null);
  const importVisioInputRef = useRef<HTMLInputElement>(null);
  const importBpmnInputRef = useRef<HTMLInputElement>(null);
  // SharePoint: which project format is being exported (drives the folder
  // picker), whether the import file-picker is open, and a brief busy flag.
  const [spExportFormat, setSpExportFormat] = useState<null | "json" | "xml" | "visio">(null);
  const [spImportFmt, setSpImportFmt] = useState<null | "json" | "xml" | "visio" | "bpmn">(null);
  const [spBusy, setSpBusy] = useState(false);
  // Import-progress modal state (mirrors the dashboard's import flow).
  const [importing, setImporting] = useState(false);
  const [importLog, setImportLog] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<"success" | "failed" | null>(null);
  const [importedProjectId, setImportedProjectId] = useState<string | null>(null);
  // Visio import status (per-master breakdown + warnings) — same shape
  // as the editor's modal so we can show the same diagnostic info here.
  const [visioImportStatus, setVisioImportStatus] = useState<VisioImportResult | null>(null);
  const [visioImportInProgress, setVisioImportInProgress] = useState(false);
  // Visio Bulk Import: the user picks a .vsdx file, then the dialog
  // opens showing every page in the file. They tick which pages to
  // import, choose a target project (current or new), and a folder
  // for the imported diagrams. The selected pages are imported as
  // separate diagrams via POST /api/import/visio-v3/bulk.
  const [showImportVisioDialog, setShowImportVisioDialog] = useState(false);
  const [importVisioFile, setImportVisioFile] = useState<File | null>(null);
  const [importVisioPages, setImportVisioPages] = useState<{ index: number; name: string }[]>([]);
  const [importVisioSelected, setImportVisioSelected] = useState<Set<number>>(new Set());
  const [importVisioTarget, setImportVisioTarget] = useState<"current" | "new">("current");
  const [importVisioNewProjectName, setImportVisioNewProjectName] = useState("");
  const [importVisioFolderName, setImportVisioFolderName] = useState("Imported BPMN Diagrams");
  const [importVisioError, setImportVisioError] = useState("");
  const [importVisioBusy, setImportVisioBusy] = useState(false);

  // ── Multi-select for bulk diagram move / delete ────────────────────
  // Standard desktop selection model:
  //   • Plain click on a diagram card opens it (and clears any active
  //     selection — a "preview-mode" exit).
  //   • Ctrl/Cmd-click toggles that diagram in/out of the selection set
  //     (multi-select). The clicked card becomes the new range anchor.
  //   • Shift-click extends a contiguous range from the anchor to the
  //     clicked card, within the same folder (range is meaningful only
  //     for the ordered diagram list of one folder).
  // The selection is cleared on Escape or when the user opens any
  // diagram via plain click.
  const [selectedDiagramIds, setSelectedDiagramIds] = useState<Set<string>>(new Set());
  const [lastSelectedDiagramId, setLastSelectedDiagramId] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showBulkMoveDialog, setShowBulkMoveDialog] = useState(false);
  const [projectColorConfig, setProjectColorConfig] = useState<SymbolColorConfig>((project.colorConfig as SymbolColorConfig | null) ?? {});
  const [projectFontConfig, setProjectFontConfig] = useState<FontConfig>((project.fontConfig as FontConfig | null) ?? {});

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

  // Diagram sort order within each folder in the nav tree. Persists per
  // project in localStorage. "manual" preserves the user's drag-and-drop
  // order stored in folderTree.diagramOrder; other modes override it.
  type DiagramSort =
    | "manual"
    | "name-asc"
    | "name-desc"
    | "modified-desc"
    | "modified-asc"
    | "type";
  const diagramTypeStyle = useDiagramTypeStyles();
  const [diagramSort, setDiagramSort] = useState<DiagramSort>("manual");
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(`diagram-sort-${project.id}`);
      if (raw === "manual" || raw === "name-asc" || raw === "name-desc"
          || raw === "modified-asc" || raw === "modified-desc" || raw === "type") {
        setDiagramSort(raw);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(`diagram-sort-${project.id}`, diagramSort);
    } catch { /* ignore */ }
  }, [diagramSort, project.id]);

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

  // Close Project menu on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) setShowProjectMenu(false);
    }
    if (showProjectMenu) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showProjectMenu]);

  // Get ordered diagrams in a specific folder. Sort modes:
  //   manual         — folderTree.diagramOrder[folderId] (drag-and-drop)
  //   name-asc       — A→Z by diagram name
  //   name-desc      — Z→A by diagram name
  //   modified-desc  — newest first by updatedAt
  //   modified-asc   — oldest first by updatedAt
  function getOrderedDiagramsInFolder(folderId: string): DiagramSummary[] {
    const direct = diagrams.filter(d => (folderTree.diagramFolderMap[d.id] ?? ROOT_ID) === folderId);
    if (diagramSort === "manual") {
      const order = folderTree.diagramOrder?.[folderId];
      if (!order) return direct;
      return direct.slice().sort((a, b) => {
        const ai = order.indexOf(a.id);
        const bi = order.indexOf(b.id);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
    }
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    return direct.slice().sort((a, b) => {
      switch (diagramSort) {
        case "name-asc":
          return collator.compare(a.name, b.name);
        case "name-desc":
          return collator.compare(b.name, a.name);
        case "modified-desc":
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case "modified-asc":
          return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        case "type": {
          // Order by the admin-configured Diagram Type Sort Order, then name.
          const d = diagramTypeStyle(a.type).sortOrder - diagramTypeStyle(b.type).sortOrder;
          return d !== 0 ? d : collator.compare(a.name, b.name);
        }
        default:
          return 0;
      }
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
  // G03: BPMN is the most-used type — default the New Diagram radio to it.
  const [newType, setNewType] = useState<DiagramType>("bpmn");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  function saveProjectField(fields: Record<string, string>) {
    fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    }).catch(() => {});
  }

  // Open a project export file from SharePoint and import it as a new project.
  // Open a file from SharePoint and import it by the chosen format:
  // json/xml → new project; visio → bulk Visio dialog; bpmn → BPMN import.
  async function handleImportFromSharePoint(fmt: "json" | "xml" | "visio" | "bpmn", sel: { driveId: string; itemId: string | null; name: string }) {
    if (!sel.itemId) return;
    setSpBusy(true);
    try {
      const r = await fetch(`/api/sharepoint/download?driveId=${encodeURIComponent(sel.driveId)}&itemId=${encodeURIComponent(sel.itemId)}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Download failed");
      const blob = await r.blob();
      const file = new File([blob], sel.name);
      setSpBusy(false);
      if (fmt === "json" || fmt === "xml") await handleImportFile(file, fmt);
      else if (fmt === "visio") await handleImportVisioFile(file);
      else await handleImportBpmnFile(file);
    } catch (err) {
      setSpBusy(false);
      setImporting(true);
      setImportLog([`✘ SharePoint open failed: ${err instanceof Error ? err.message : String(err)}`]);
      setImportResult("failed");
    }
  }

  // Export the project's bulk Visio (.vsdx) straight into a SharePoint folder.
  async function handleExportVisioToSharePoint(sel: { driveId: string; itemId: string | null; name: string }) {
    setExporting(true); setExportLog([]); setExportResult(null);
    const log = (m: string) => setExportLog(p => [...p, m]);
    try {
      log("Generating Visio (.vsdx)…");
      const vr = await fetch(`/api/export/visio-v3/bulk?projectId=${encodeURIComponent(project.id)}&profile=v1.6`);
      if (!vr.ok) throw new Error("Visio export failed");
      const blob = await vr.blob();
      const fileName = `${projectName}.diagramatix.vsdx`.replace(/[\\/:*?"<>|]/g, "_");
      log(`Uploading to SharePoint folder "${sel.name}"…`);
      await spUpload(sel, fileName, "application/vnd.ms-visio.drawing", blob);
      log(`✔ Uploaded ${fileName} (${Math.round(blob.size / 1024)} KB)`);
      setExportResult("success");
    } catch (err) {
      log(`✘ ${err instanceof Error ? err.message : String(err)}`);
      setExportResult("failed");
    }
  }

  // Upload a file into a SharePoint / OneDrive folder (binary-safe).
  async function spUpload(
    sel: { driveId: string; itemId: string | null },
    filename: string, contentType: string, body: Blob | string,
  ) {
    const fd = new FormData();
    fd.append("driveId", sel.driveId);
    if (sel.itemId) fd.append("folderItemId", sel.itemId);
    fd.append("filename", filename);
    fd.append("contentType", contentType);
    const blob = body instanceof Blob ? body : new Blob([body], { type: contentType });
    fd.append("file", blob, filename);
    const r = await fetch("/api/sharepoint/upload", { method: "POST", body: fd });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Upload of ${filename} failed`);
  }

  async function handleExportProject(
    format: ExportFormat = "json",
    destination: "local" | "sharepoint" = "local",
    sel?: { driveId: string; itemId: string | null; name: string },
  ) {
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
      const fileName = `${projectName}.diagramatix.${fileExt}`.replace(/[\\/:*?"<>|]/g, "_");
      const sizeKb = Math.round(blob.size / 1024);

      if (destination === "sharepoint" && sel) {
        log(`Uploading to SharePoint folder "${sel.name}"\u2026`);
        await spUpload(sel, fileName, mimeType, blob);
        log(`\u2714 Uploaded ${fileName} (${sizeKb} KB)`);
        // For XML, upload the matching XSD alongside so the .xml validates.
        if (isXml) {
          const xsdResp = await fetch("/api/schema");
          if (xsdResp.ok) {
            const xsdText = await xsdResp.text();
            const m = xsdText.match(/Generated by Diagramatix ([\d.]+)/);
            const ver = m ? m[1] : SCHEMA_VERSION;
            await spUpload(sel, `diagramatix-export-v${ver}.xsd`, "application/xml", xsdText);
            log(`\u2714 XSD schema uploaded (diagramatix-export-v${ver}.xsd)`);
          }
        }
        log(`   ${diagramsWithData.length} diagram(s), ${folderCount} folder(s)`);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        log(`\u2714 Export complete! File: ${fileName} (${sizeKb} KB)`);
        log(`   ${diagramsWithData.length} diagram(s), ${folderCount} folder(s)`);
        // For XML exports, also download the matching XSD schema.
        if (isXml) {
          const { downloadMatchingXsd } = await import("@/app/lib/diagram/xmlExport");
          const xsdAppVersion = await downloadMatchingXsd(SCHEMA_VERSION);
          log(`\u2714 XSD schema downloaded (diagramatix-export-v${xsdAppVersion}.xsd)`);
        }
      }

      setExportResult("success");
    } catch (err) {
      console.error("Export failed:", err);
      log(`\u2718 Export failed: ${err instanceof Error ? err.message : String(err)}`);
      setExportResult("failed");
    }
  }

  // ── Import (Visio .vsdx) ──────────────────────────────────────────────
  // Bulk flow: user picks the .vsdx file, the browser parses pages.xml
  // (dynamic JSZip import) and opens the dialog showing every page. The
  // user ticks the pages they want, picks a target project (current or
  // new) and a folder. The selection is sent to /api/import/visio-v3/bulk
  // which creates one diagram per selected page.
  async function handleImportVisioFile(file: File) {
    setImportVisioError("");
    try {
      // Dynamic JSZip — keeps it out of the main bundle.
      const { listVisioPages } = await import("@/app/lib/diagram/v3/visioPages");
      const buf = await file.arrayBuffer();
      const pages = await listVisioPages(buf);
      if (pages.length === 0) {
        alert("No usable pages found in this .vsdx file.");
        return;
      }
      setImportVisioFile(file);
      setImportVisioPages(pages.map((p) => ({ index: p.index, name: p.name })));
      setImportVisioSelected(new Set(pages.map((p) => p.index)));
      setImportVisioTarget("current");
      const stem = file.name.replace(/\.vsdx$/i, "");
      setImportVisioNewProjectName(stem || "Imported Visio Diagrams");
      setImportVisioFolderName("Imported BPMN Diagrams");
      setShowImportVisioDialog(true);
    } catch (err) {
      alert(`Failed to read .vsdx: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Import (BPMN 2.0 .bpmn) ──────────────────────────────────────────
  // Single-file flow. POST the .bpmn to /api/import/bpmn, mirror the
  // result into local state, then surface the existing single-import
  // status modal (BPMN stats reshaped into the VisioImportResult shape).
  async function handleImportBpmnFile(file: File) {
    setVisioImportInProgress(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("projectId", project.id);
      form.append("folderName", "Imported BPMN Diagrams");
      const resp = await fetch("/api/import/bpmn", { method: "POST", body: form });
      if (!resp.ok) {
        const txt = await resp.text();
        alert(`BPMN import failed: ${txt || resp.statusText}`);
        return;
      }
      const result = await resp.json() as {
        diagram: { id: string; name: string };
        warnings: string[];
        stats: {
          processCount: number;
          participantCount: number;
          elementsCreated: number;
          connectorsCreated: number;
          shapesDropped: number;
          flowsDropped: number;
        };
      };
      // Splice into the local diagram list.
      setDiagrams((prev) => [
        { id: result.diagram.id, name: result.diagram.name, type: "bpmn", createdAt: new Date(), updatedAt: new Date() },
        ...prev,
      ]);
      // Mirror the server-side folder placement into the local folderTree
      // state (so the new diagram appears in the right folder without a
      // full project refetch).
      const folderName = "Imported BPMN Diagrams";
      updateTree((t) => {
        const existing = t.folders.find((f) => f.parentId === null && f.name === folderName);
        if (existing) {
          return {
            ...t,
            diagramFolderMap: { ...t.diagramFolderMap, [result.diagram.id]: existing.id },
          };
        }
        const newFolderId = `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        return {
          ...t,
          folders: [...t.folders, { id: newFolderId, name: folderName, parentId: null }],
          diagramFolderMap: { ...t.diagramFolderMap, [result.diagram.id]: newFolderId },
        };
      });
      // Reshape BPMN stats → VisioImportResult so the existing status
      // modal can render the warnings + counts without modification.
      const reshaped: VisioImportResult = {
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
      };
      setVisioImportStatus(reshaped);
    } catch (err) {
      alert(`BPMN import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setVisioImportInProgress(false);
    }
  }

  // Submit step from the bulk-import dialog: POST the file + selections
  // to /api/import/visio-v3/bulk. On success, either navigate to the
  // newly-created project or refresh the current project's diagrams.
  async function handleImportVisioConfirm() {
    if (!importVisioFile) { setImportVisioError("No file selected"); return; }
    if (importVisioSelected.size === 0) { setImportVisioError("Select at least one page"); return; }
    if (importVisioTarget === "new" && !importVisioNewProjectName.trim()) {
      setImportVisioError("New project name is required");
      return;
    }
    setImportVisioBusy(true);
    setImportVisioError("");
    setVisioImportInProgress(true);
    try {
      const indices = Array.from(importVisioSelected).sort((a, b) => a - b).join(",");
      const form = new FormData();
      form.append("file", importVisioFile);
      form.append("pageIndices", indices);
      form.append("folderName", importVisioFolderName.trim());
      if (importVisioTarget === "new") {
        form.append("newProjectName", importVisioNewProjectName.trim());
      } else {
        form.append("projectId", project.id);
      }
      const resp = await fetch("/api/import/visio-v3/bulk", { method: "POST", body: form });
      if (!resp.ok) {
        const txt = await resp.text();
        setImportVisioError(`Import failed: ${txt || resp.statusText}`);
        return;
      }
      type BulkResult = {
        project?: { id: string; name: string };
        folderId?: string | null;
        diagrams: Array<{ diagram: { id: string; name: string }; pageIndex: number; pageName: string; warnings: string[]; stats: VisioImportResult["stats"] }>;
        errors: Array<{ pageIndex: number; pageName: string; message: string }>;
      };
      const result = (await resp.json()) as BulkResult;
      setShowImportVisioDialog(false);
      if (result.project) {
        // New project was created — navigate to it.
        router.push(`/dashboard/projects/${result.project.id}`);
        return;
      }
      // Imported into the current project — splice the new diagrams into
      // the local list and update the folder tree.
      const now = new Date();
      setDiagrams((prev) => [
        ...result.diagrams.map((d) => ({ id: d.diagram.id, name: d.diagram.name, type: "bpmn", createdAt: now, updatedAt: now })),
        ...prev,
      ]);
      const folderName = importVisioFolderName.trim();
      if (folderName) {
        updateTree((t) => {
          let folders = t.folders;
          let folderId = folders.find((f) => f.parentId === null && f.name === folderName)?.id ?? null;
          if (!folderId) {
            folderId = `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            folders = [...folders, { id: folderId, name: folderName, parentId: null }];
          }
          const newMap = { ...t.diagramFolderMap };
          for (const d of result.diagrams) newMap[d.diagram.id] = folderId;
          return { ...t, folders, diagramFolderMap: newMap };
        });
      }
      // Surface a single aggregated status modal so the user sees per-page
      // results (warnings + any failures). Reuse the existing single-page
      // status modal by feeding the FIRST imported diagram's stats; show
      // a summary list of all imported pages in the warnings array.
      if (result.diagrams.length > 0) {
        const summary: VisioImportResult = {
          diagram: result.diagrams[0].diagram,
          warnings: [
            ...result.diagrams.flatMap((d) => d.warnings.map((w) => `[${d.pageName}] ${w}`)),
            ...result.errors.map((e) => `[${e.pageName}] FAILED: ${e.message}`),
            `Imported ${result.diagrams.length} diagram${result.diagrams.length === 1 ? "" : "s"} from ${importVisioFile.name}.`,
          ],
          stats: result.diagrams[0].stats,
        };
        setVisioImportStatus(summary);
      } else if (result.errors.length > 0) {
        alert(`All ${result.errors.length} pages failed to import:\n` + result.errors.map((e) => `[${e.pageName}] ${e.message}`).join("\n"));
      }
    } catch (err) {
      setImportVisioError(`Visio import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImportVisioBusy(false);
      setVisioImportInProgress(false);
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

  // ── Multi-select click handler ───────────────────────────────────────
  // Reads the modifier keys from the click event and routes to the
  // appropriate behaviour: plain → open, ctrl/cmd → toggle, shift →
  // extend range. Range is computed within the folder that owns the
  // clicked diagram so it's consistent regardless of which folder pane
  // the user is currently viewing.
  function handleDiagramCardClick(
    diagramId: string,
    mods: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) {
    const ctrl = mods.ctrlKey || mods.metaKey;
    if (mods.shiftKey && lastSelectedDiagramId) {
      const folder = folderTree.diagramFolderMap[diagramId] ?? ROOT_ID;
      const list = getOrderedDiagramsInFolder(folder).map(d => d.id);
      const anchorIdx = list.indexOf(lastSelectedDiagramId);
      const targetIdx = list.indexOf(diagramId);
      if (anchorIdx >= 0 && targetIdx >= 0) {
        const [lo, hi] = anchorIdx < targetIdx
          ? [anchorIdx, targetIdx]
          : [targetIdx, anchorIdx];
        const next = new Set(selectedDiagramIds);
        for (let i = lo; i <= hi; i++) next.add(list[i]);
        setSelectedDiagramIds(next);
        return;
      }
      // Anchor in a different folder — fall through to toggle behaviour.
    }
    if (ctrl) {
      const next = new Set(selectedDiagramIds);
      if (next.has(diagramId)) next.delete(diagramId);
      else next.add(diagramId);
      setSelectedDiagramIds(next);
      setLastSelectedDiagramId(diagramId);
      return;
    }
    // Plain click: clear any existing selection and open the diagram.
    if (selectedDiagramIds.size > 0) {
      setSelectedDiagramIds(new Set());
      setLastSelectedDiagramId(null);
    }
    handleOpenDiagram(diagramId);
  }

  function clearDiagramSelection() {
    setSelectedDiagramIds(new Set());
    setLastSelectedDiagramId(null);
  }

  // Escape clears the selection. Bound to the document so it works no
  // matter which pane has focus.
  useEffect(() => {
    if (selectedDiagramIds.size === 0) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") clearDiagramSelection();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedDiagramIds.size]);

  // Bulk delete — archive every selected diagram in sequence. Same
  // /archive endpoint as single delete, so the user can recover from
  // the system archive if needed. Folder map entries are cleaned up
  // alongside.
  async function handleBulkDelete() {
    const ids = Array.from(selectedDiagramIds);
    setShowBulkDeleteConfirm(false);
    try {
      await Promise.all(ids.map(id =>
        fetch(`/api/diagrams/${id}/archive`, { method: "POST" }),
      ));
    } catch (err) {
      alert(`Bulk delete failed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    setDiagrams(prev => prev.filter(d => !selectedDiagramIds.has(d.id)));
    updateTree(t => {
      const map = { ...t.diagramFolderMap };
      for (const id of ids) delete map[id];
      return { ...t, diagramFolderMap: map };
    });
    clearDiagramSelection();
  }

  // Bulk move — reassigns folder for every selected diagram. Works
  // purely on the project's folderTree (no API call per diagram needed;
  // updateTree debounce-saves the whole tree). For the project root,
  // mirror the single-move convention by DELETING the map entry rather
  // than assigning `"root"` — absent ⇒ root in `getOrderedDiagramsInFolder`.
  function handleBulkMoveToFolder(targetFolderId: string) {
    const ids = Array.from(selectedDiagramIds);
    setShowBulkMoveDialog(false);
    updateTree(t => {
      const map = { ...t.diagramFolderMap };
      for (const id of ids) {
        if (targetFolderId === ROOT_ID) delete map[id];
        else map[id] = targetFolderId;
      }
      return { ...t, diagramFolderMap: map };
    });
    clearDiagramSelection();
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

  // Flowchart → BPMN translation: fetch the source flowchart's data, then open
  // the preview/create dialog. One-way — the flowchart is never mutated.
  const [translateSrc, setTranslateSrc] = useState<{ name: string; data: DiagramData } | null>(null);
  async function handleTranslateDiagram(diagramId: string) {
    try {
      const res = await fetch(`/api/diagrams/${diagramId}`);
      if (!res.ok) return;
      const src = await res.json();
      setTranslateSrc({ name: src.name, data: src.data as DiagramData });
    } catch (err) {
      console.error("Failed to load flowchart for translation:", err);
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

  /** Expand or collapse all descendant folders under a given parent */
  function setAllDescendantsCollapsed(parentId: string, collapsed: boolean) {
    // Collect all descendant folder IDs
    const descendantIds = new Set<string>();
    function collect(pid: string) {
      for (const f of folderTree.folders) {
        if ((f.parentId ?? ROOT_ID) === pid && !descendantIds.has(f.id)) {
          descendantIds.add(f.id);
          collect(f.id);
        }
      }
    }
    collect(parentId);
    if (descendantIds.size === 0) return;
    updateTree(t => ({
      ...t,
      folders: t.folders.map(f => descendantIds.has(f.id) ? { ...f, collapsed } : f),
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
            if (dragDiagramId) {
              // Group-aware drop: if the dragged diagram is part of the
              // current multi-selection (size > 1), move EVERY selected
              // diagram to the target folder in one batch. Otherwise the
              // drag is a regular single-diagram move.
              if (selectedDiagramIds.size > 1 && selectedDiagramIds.has(dragDiagramId)) {
                const ids = Array.from(selectedDiagramIds);
                updateTree(t => {
                  const map = { ...t.diagramFolderMap };
                  for (const id of ids) {
                    if (folderId === ROOT_ID) delete map[id];
                    else map[id] = folderId;
                  }
                  return { ...t, diagramFolderMap: map };
                });
                clearDiagramSelection();
              } else {
                moveDiagramToFolder(dragDiagramId, folderId);
              }
              setDragDiagramId(null);
            }
          }}
        >
          {hasChildren ? (
            <span className="w-3 text-center text-gray-400 cursor-pointer text-[9px]"
              onClick={(e) => { e.stopPropagation(); if (isRoot) { /* root always open */ } else toggleFolderCollapse(folderId); }}>
              {isRoot ? "\u25BC" : isCollapsed ? "\u25B6" : "\u25BC"}
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
            // Per-row named hover group. Wraps the folder/project name AND
            // all of its action buttons so that the icons reveal ONLY when
            // the pointer is over the name (or already over the icons),
            // not when the user is hovering anywhere else in the sidebar.
            // Buttons swap from `group-hover:opacity-100` (sidebar-wide) to
            // `group-hover/foldername:opacity-100` (this row only).
            <div className="flex items-center gap-1 flex-1 min-w-0 group/foldername">
              <span className="truncate flex-1 font-medium" title={name}>{name}</span>
              {/* Refresh icon on root folder */}
              {isRoot && (
                <button onClick={(e) => { e.stopPropagation(); refreshProjectData(); }}
                  className="opacity-0 group-hover/foldername:opacity-100 hover:!opacity-100 text-gray-400 hover:text-blue-500 px-0.5"
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
              {!isRoot && (
                <button onClick={(e) => { e.stopPropagation(); startRename(folderId, name); }}
                  className="opacity-0 group-hover/foldername:opacity-100 hover:!opacity-100 text-gray-400 hover:text-blue-500 px-0.5"
                  title="Rename folder"
                  style={{ opacity: selectedTreeItem === folderId ? 1 : undefined }}
                >{PencilIcon}</button>
              )}
              <button onClick={(e) => { e.stopPropagation(); handleAddFolder(folderId); }}
                className="opacity-0 group-hover/foldername:opacity-100 hover:!opacity-100 text-gray-400 hover:text-blue-500 text-[10px] px-0.5 font-bold"
                title="Add subfolder"
                style={{ opacity: selectedTreeItem === folderId || isSelected ? 1 : undefined }}
              >+</button>
              {childFolders.length > 0 && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); setAllDescendantsCollapsed(folderId, false); }}
                    className="opacity-0 group-hover/foldername:opacity-100 hover:!opacity-100 text-gray-400 hover:text-blue-500 text-[9px] px-0.5"
                    title="Expand all subfolders"
                    style={{ opacity: selectedTreeItem === folderId || isSelected ? 1 : undefined }}
                  >
                    <svg width={10} height={10} viewBox="0 0 16 16" fill="currentColor"><path d="M1 4l7 8 7-8H1z" /></svg>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setAllDescendantsCollapsed(folderId, true); }}
                    className="opacity-0 group-hover/foldername:opacity-100 hover:!opacity-100 text-gray-400 hover:text-blue-500 text-[9px] px-0.5"
                    title="Collapse all subfolders"
                    style={{ opacity: selectedTreeItem === folderId || isSelected ? 1 : undefined }}
                  >
                    <svg width={10} height={10} viewBox="0 0 16 16" fill="currentColor"><path d="M4 1l8 7-8 7V1z" /></svg>
                  </button>
                </>
              )}
              {!isRoot && (() => {
                const hasContent = folderHasContent(folderId);
                return (
                  <button onClick={(e) => { e.stopPropagation(); if (!hasContent) handleDeleteFolder(folderId); }}
                    disabled={hasContent}
                    className={`opacity-0 group-hover/foldername:opacity-100 hover:!opacity-100 px-0.5 ${
                      hasContent ? "text-gray-300 cursor-not-allowed" : "text-gray-400 hover:text-red-500"
                    }`}
                    title={hasContent ? "Cannot delete: folder is not empty" : "Delete folder"}
                    style={{ opacity: selectedTreeItem === folderId ? 1 : undefined }}
                  >{TrashIcon}</button>
                );
              })()}
            </div>
          )}
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
                  selectedDiagramIds.has(d.id)
                    ? "bg-blue-200 text-blue-900 ring-1 ring-blue-400"
                    : selectedTreeItem === d.id ? "bg-blue-100 text-blue-800" : "text-gray-600 hover:bg-gray-50"
                } ${dragDiagramId === d.id ? "opacity-40" : ""}`}
                style={{ paddingLeft: (depth + 1) * 12 + 4 }}
                onClick={(e) => {
                  e.stopPropagation();
                  const ctrl = e.ctrlKey || e.metaKey;
                  if (e.shiftKey && lastSelectedDiagramId) {
                    // Range select within the diagram's folder.
                    const folder = folderTree.diagramFolderMap[d.id] ?? ROOT_ID;
                    const list = getOrderedDiagramsInFolder(folder).map(x => x.id);
                    const a = list.indexOf(lastSelectedDiagramId);
                    const b = list.indexOf(d.id);
                    if (a >= 0 && b >= 0) {
                      const [lo, hi] = a < b ? [a, b] : [b, a];
                      const next = new Set(selectedDiagramIds);
                      for (let i = lo; i <= hi; i++) next.add(list[i]);
                      setSelectedDiagramIds(next);
                      return;
                    }
                  }
                  if (ctrl) {
                    const next = new Set(selectedDiagramIds);
                    if (next.has(d.id)) next.delete(d.id);
                    else next.add(d.id);
                    setSelectedDiagramIds(next);
                    setLastSelectedDiagramId(d.id);
                    return;
                  }
                  // Plain click in the tree: highlight only, clear multi-select.
                  if (selectedDiagramIds.size > 0) clearDiagramSelection();
                  setSelectedTreeItem(d.id);
                  setLastSelectedDiagramId(d.id);
                }}
                onDoubleClick={() => handleOpenDiagram(d.id)}
              >
                <span className="w-3" />
                <DiagramTypeBadge type={d.type} className="shrink-0" />
                {editingId === d.id ? (
                  <input autoFocus type="text" value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditingId(null); }}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 text-[10px] border border-blue-400 rounded px-1 py-0 outline-none min-w-0" />
                ) : (
                  // Wrap the diagram name and its icons in a per-row named hover
                  // group so that the edit / delete icons reveal ONLY when the
                  // pointer is over the name (or already over the icons), not
                  // when the user is anywhere else in the sidebar. The whole
                  // sidebar has a `group` class higher up — without this scope
                  // every diagram row's icons would appear at once on sidebar
                  // hover.
                  <div className="flex items-center gap-1 flex-1 min-w-0 group/dgname">
                    <span className="truncate flex-1" title={d.name}>{d.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); startRename(d.id, d.name); }}
                      className="opacity-0 group-hover/dgname:opacity-100 hover:!opacity-100 text-gray-400 hover:text-blue-500 px-0.5"
                      title="Rename diagram"
                      style={{ opacity: selectedTreeItem === d.id ? 1 : undefined }}
                    >{PencilIcon}</button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteDiagram(d.id); }}
                      className="opacity-0 group-hover/dgname:opacity-100 hover:!opacity-100 text-gray-400 hover:text-red-500 px-0.5"
                      title="Delete diagram"
                      style={{ opacity: selectedTreeItem === d.id ? 1 : undefined }}
                    >{TrashIcon}</button>
                  </div>
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

  // Banner shows in both view and edit modes so the admin always has a
  // "Return to my account" exit visible while impersonating.
  const isImpersonating = !!impersonationMode;

  return (
    <div className={`min-h-screen ${isImpersonating ? "bg-orange-50" : "dgx-dashboard-bg"} flex flex-col`}>
      {isImpersonating && viewingAsName !== undefined && viewingAsEmail !== undefined && (
        <ImpersonationBanner viewingAsName={viewingAsName ?? ""} viewingAsEmail={viewingAsEmail ?? ""} mode={impersonationMode} />
      )}
      {/* Header */}
      <header className={`${isImpersonating ? "bg-orange-50" : "bg-white"} border-b border-gray-200 px-4 py-2 flex-shrink-0`}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
          >
            <span style={{ fontSize: "1.75em", lineHeight: 1 }}>{"\u2190"}</span>
            <span className="underline">Dashboard</span>
          </button>
          {/* Brand icon: sits just right of the back link as a permanent
              "you're inside Diagramatix" cue. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/diagramatix-icon.svg" alt="Diagramatix" className="w-6 h-6" />
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
          {/* Export Owner display hidden 2026-06-06 — kept off the
              project header to match the sidebar. Value still lives on
              project.ownerName and round-trips through exports. */}
          <span className="text-[10px] text-gray-400 shrink-0" title="Diagramatix version">v{SCHEMA_VERSION}{version ? `.${version}` : ""}</span>
          {/* SuperAdmin shortcut — leftmost item in the header menu
              cluster, SuperAdmin-only. `?from=` carries this project's
              URL so the admin's Back link returns here. Mirrors the
              Dashboard placement. */}
          {isAdmin && (
            <a
              href={`/dashboard/admin?from=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search : `/dashboard/projects/${project.id}`)}`}
              className="text-xs text-red-700 hover:text-red-800 font-medium border border-red-300 rounded px-2 py-1 hover:bg-red-50"
              title="Open the SuperAdmin dashboard"
            >
              SuperAdmin
            </a>
          )}
          {!readOnly && (
            <div className="relative" ref={projectMenuRef}>
              <button
                onClick={() => setShowProjectMenu((v) => !v)}
                className="px-3 py-1 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Project ▾
              </button>
              {showProjectMenu && (
                <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded shadow-lg z-50 py-1">
                  <button
                    className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                    onClick={() => { setShowProjectMenu(false); setShowMaintenance(true); }}
                  >
                    Configuration
                  </button>
                  <button
                    className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                    disabled={scanBusy}
                    onClick={() => {
                      setShowProjectMenu(false);
                      handleScanPoolConnectors();
                    }}
                    title="Scan every diagram in this project for sequence/association connectors on a Pool/Lane, duplicate Pool/Lane names, Pools with a single Lane, and hanging messages (red on canvas)."
                  >
                    {scanBusy ? "Scanning…" : "Scan Diagrams for Issues"}
                  </button>
                  <button
                    className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                    onClick={() => { setShowProjectMenu(false); setShowLinkScan(true); }}
                    title="Find subprocesses whose name matches another diagram in this project and link them. A return marker is placed on the child diagram pointing back to the parent."
                  >
                    Scan Diagrams for Links
                  </button>
                </div>
              )}
            </div>
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
                {showFileMenu && (() => {
                  const itemCls = "block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100";
                  const rowCls = "flex w-full items-center justify-between px-3 py-1.5 text-xs";
                  const chosenCls = "bg-blue-50 text-blue-700 font-medium";
                  const normalCls = "text-gray-700 hover:bg-gray-100";
                  // Each next level sits just under the chosen row, shifted 100px
                  // left (the menu hugs the right margin).
                  const flyCls = "absolute bg-white border border-gray-200 rounded-md shadow-lg py-1 z-[10001]";
                  const flyStyle = { top: "100%", left: -100, minWidth: 130 };
                  const hasBpmn = diagrams.some(d => d.type === "bpmn");
                  const close = () => setShowFileMenu(false);
                  // When SharePoint is unavailable, Local is the only choice — so
                  // opening a section auto-selects Local and shows its formats.
                  const pick = (s: "export" | "import") => {
                    const next = menuSection === s ? null : s;
                    setMenuSection(next);
                    setMenuDest(next && !hasMicrosoft ? "local" : null);
                  };
                  const pickDest = (d: "local" | "sharepoint") => setMenuDest(menuDest === d ? null : d);
                  return (
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
                        minWidth: 110,
                      }}
                    >
                      {(["export", "import"] as const).map((sect) => (
                        <div key={sect} className="relative">
                          <button
                            onClick={() => pick(sect)}
                            className={`${rowCls} ${menuSection === sect ? chosenCls : normalCls}`}
                          >
                            <span>{sect === "export" ? "Export" : "Import"}</span>
                            <span className="text-gray-400">▸</span>
                          </button>
                          {menuSection === sect && (
                            <div className={flyCls} style={flyStyle}>
                              {/* Local */}
                              <div className="relative">
                                <button onClick={() => pickDest("local")} className={`${rowCls} ${menuDest === "local" ? chosenCls : normalCls}`}>
                                  <span>Local</span><span className="text-gray-400">▸</span>
                                </button>
                                {menuDest === "local" && (
                                  <div className={flyCls} style={flyStyle}>
                                    {sect === "export" ? (
                                      <>
                                        <button className={itemCls} onClick={() => { close(); handleExportProject("json"); }}>JSON</button>
                                        <button className={itemCls} onClick={() => { close(); handleExportProject("xml"); }}>XML &amp; XSD</button>
                                        <button
                                          className={`${itemCls} disabled:opacity-50 disabled:cursor-not-allowed`}
                                          disabled={!hasBpmn}
                                          onClick={() => { close(); window.location.href = `/api/export/visio-v3/bulk?projectId=${encodeURIComponent(project.id)}&profile=v1.6`; }}
                                          title={hasBpmn ? "Export all BPMN diagrams as one multi-page Visio (.vsdx)" : "No BPMN diagrams in this project"}
                                        >
                                          Visio (.vsdx) — all BPMN
                                        </button>
                                        <a className={itemCls} href="/BPMN%20Diagramatix%20Shapes%20v1.6.vssx" download onClick={close} title="Download the BPMN Diagramatix Shapes v1.6 stencil (.vssx)">Visio Stencil</a>
                                      </>
                                    ) : (
                                      <>
                                        <button className={itemCls} onClick={() => { close(); importJsonInputRef.current?.click(); }}>JSON</button>
                                        <button className={itemCls} onClick={() => { close(); importXmlInputRef.current?.click(); }}>XML</button>
                                        <button className={`${itemCls} disabled:opacity-50`} disabled={visioImportInProgress} onClick={() => { close(); setImportVisioError(""); importVisioInputRef.current?.click(); }} title="Import one or more pages from a Visio .vsdx file as separate diagrams">{visioImportInProgress ? "Visio (importing…)" : "Visio"}</button>
                                        <button className={`${itemCls} disabled:opacity-50`} disabled={visioImportInProgress} onClick={() => { close(); importBpmnInputRef.current?.click(); }} title="Import an OMG BPMN 2.0 .bpmn file as a new diagram">{visioImportInProgress ? "BPMN (importing…)" : "BPMN"}</button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                              {/* SharePoint (greyed out when Microsoft isn't connected this session) */}
                              <div className="relative">
                                <button
                                  disabled={!hasMicrosoft}
                                  onClick={() => { if (hasMicrosoft) pickDest("sharepoint"); }}
                                  className={`${rowCls} ${!hasMicrosoft ? "text-gray-300 cursor-not-allowed" : menuDest === "sharepoint" ? chosenCls : normalCls}`}
                                  title={hasMicrosoft ? "" : "Sign in with Microsoft to enable SharePoint"}
                                >
                                  <span>SharePoint</span><span className={hasMicrosoft ? "text-gray-400" : "text-gray-300"}>▸</span>
                                </button>
                                {menuDest === "sharepoint" && hasMicrosoft && (
                                  <div className={flyCls} style={flyStyle}>
                                    {sect === "export" ? (
                                      <>
                                        <button className={itemCls} onClick={() => { close(); setSpExportFormat("json"); }}>JSON</button>
                                        <button className={itemCls} onClick={() => { close(); setSpExportFormat("xml"); }}>XML &amp; XSD</button>
                                        <button
                                          className={`${itemCls} disabled:opacity-50 disabled:cursor-not-allowed`}
                                          disabled={!hasBpmn}
                                          onClick={() => { close(); setSpExportFormat("visio"); }}
                                          title={hasBpmn ? "Save the project Visio .vsdx into SharePoint" : "No BPMN diagrams in this project"}
                                        >
                                          Visio (.vsdx) — all BPMN
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button className={itemCls} onClick={() => { close(); setSpImportFmt("json"); }}>JSON</button>
                                        <button className={itemCls} onClick={() => { close(); setSpImportFmt("xml"); }}>XML</button>
                                        <button className={itemCls} onClick={() => { close(); setSpImportFmt("visio"); }}>Visio (.vsdx)</button>
                                        <button className={itemCls} onClick={() => { close(); setSpImportFmt("bpmn"); }}>BPMN</button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <button
                onClick={() => setShowNewDiagram(true)}
                className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs font-medium"
              >
                + New Diagram
              </button>
            </>
          )}
          <a href="/help" className="text-xs text-blue-600 hover:underline ml-1" title="User Guide">User Guide</a>
        </div>
        {projectDescription && (
          <p className="text-[10px] text-gray-500 mt-1 ml-20 truncate" title={projectDescription}>{projectDescription}</p>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Resizable folder tree. Bulk action panel is pinned to
            the BOTTOM of the sidebar when 1+ diagrams are multi-selected
            in the tree — so the Move/Delete actions are always visible
            without leaving the sidebar where the user is selecting. */}
        <div className="border-r border-gray-200 bg-white flex-shrink-0 group relative flex flex-col"
          style={{ width: navWidth }}>
          {/* Sort selector for the diagram list within each folder.
              "Manual" honours the user's drag-and-drop ordering; the
              other modes override it. Persists per-project in
              localStorage so it sticks across reloads. */}
          <div className="border-b border-gray-100 px-2 py-1.5 flex items-center gap-1.5 text-[10px] text-gray-600">
            <label htmlFor="diagram-sort" className="text-gray-500 shrink-0">Sort:</label>
            <select
              id="diagram-sort"
              value={diagramSort}
              onChange={(e) => setDiagramSort(e.target.value as DiagramSort)}
              className="flex-1 min-w-0 text-[10px] border border-gray-300 rounded px-1 py-0.5 bg-white text-gray-700"
              title={
                diagramSort === "manual"
                  ? "Manual order: drag diagrams in the tree to reorder"
                  : "Sort overrides the drag-and-drop order. Choose Manual to restore it."
              }
            >
              <option value="manual">Manual (drag &amp; drop)</option>
              <option value="name-asc">Name ↑ (A–Z)</option>
              <option value="name-desc">Name ↓ (Z–A)</option>
              <option value="modified-desc">Modified ↓ (newest first)</option>
              <option value="modified-asc">Modified ↑ (oldest first)</option>
              <option value="type">Diagram Type</option>
            </select>
          </div>
          <ProjectStructureSection projectId={project.id} canEdit={!readOnly} />
          <div className="overflow-y-auto p-2 flex-1">
            {renderFolder(ROOT_ID, 0)}
          </div>
          {selectedDiagramIds.size > 0 && (
            <div className="border-t border-blue-200 bg-blue-50 px-2 py-2 text-[11px] flex flex-col gap-1.5">
              <div className="font-medium text-blue-900">
                {selectedDiagramIds.size} diagram{selectedDiagramIds.size === 1 ? "" : "s"} selected
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setShowBulkMoveDialog(true)}
                  className="flex-1 px-2 py-1 text-[11px] text-white bg-blue-600 rounded hover:bg-blue-700 whitespace-nowrap"
                >
                  Move to folder…
                </button>
                <button
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="flex-1 px-2 py-1 text-[11px] text-white bg-red-600 rounded hover:bg-red-700 whitespace-nowrap"
                >
                  Delete {selectedDiagramIds.size}…
                </button>
              </div>
              <button
                onClick={clearDiagramSelection}
                className="text-[10px] text-blue-700 hover:text-blue-900 underline self-start"
                title="Press Escape to clear"
              >
                Clear selection
              </button>
            </div>
          )}
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
          {selectedDiagramIds.size > 0 && (
            <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md sticky top-0 z-10">
              <span className="text-xs text-blue-900 font-medium">
                {selectedDiagramIds.size} diagram{selectedDiagramIds.size === 1 ? "" : "s"} selected
              </span>
              <button
                onClick={() => setShowBulkMoveDialog(true)}
                className="px-2 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700"
              >
                Move to folder…
              </button>
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="px-2 py-1 text-xs text-white bg-red-600 rounded hover:bg-red-700"
              >
                Delete {selectedDiagramIds.size}…
              </button>
              <button
                onClick={clearDiagramSelection}
                className="ml-auto px-2 py-1 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
                title="Press Escape to clear"
              >
                Clear
              </button>
            </div>
          )}
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
            <div
              ref={tileGridRef}
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${tileColumns}, minmax(0, 1fr))` }}
            >
              {visibleDiagrams.map((d) => (
                <DiagramCard
                  key={d.id}
                  diagram={d}
                  otherProjects={otherProjects}
                  onDelete={handleDeleteDiagram}
                  onClone={handleCloneDiagram}
                  onTranslate={handleTranslateDiagram}
                  onMove={handleMoveDiagram}
                  onCardClick={handleDiagramCardClick}
                  selected={selectedDiagramIds.has(d.id)}
                  colorConfig={projectColorConfig}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* SharePoint folder picker (project export) / file picker (project import) */}
      {(spExportFormat || spImportFmt) && (() => {
        const importExt: Record<"json" | "xml" | "visio" | "bpmn", string> = { json: ".json", xml: ".xml", visio: ".vsdx", bpmn: ".bpmn" };
        return (
          <SharePointPicker
            mode={spExportFormat ? "folder" : "file"}
            title={
              spExportFormat
                ? `Save project ${spExportFormat === "visio" ? "Visio" : spExportFormat.toUpperCase()} to SharePoint`
                : `Open a ${spImportFmt === "visio" ? "Visio (.vsdx)" : spImportFmt === "bpmn" ? "BPMN (.bpmn)" : spImportFmt?.toUpperCase()} file from SharePoint`
            }
            confirmLabel={spExportFormat ? "Save here" : "Open"}
            fileExtensions={spImportFmt ? [importExt[spImportFmt]] : undefined}
            onCancel={() => { setSpExportFormat(null); setSpImportFmt(null); }}
            onPick={(sel) => {
              const fmt = spExportFormat;
              const imp = spImportFmt;
              setSpExportFormat(null);
              setSpImportFmt(null);
              if (fmt === "visio") void handleExportVisioToSharePoint(sel);
              else if (fmt) void handleExportProject(fmt, "sharepoint", sel);
              else if (imp) void handleImportFromSharePoint(imp, sel);
            }}
          />
        );
      })()}
      {spBusy && (
        <div className="fixed inset-0 bg-black/10 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl px-5 py-4 text-xs text-gray-700">Working with SharePoint…</div>
        </div>
      )}

      {/* Export progress modal */}
      {exporting && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
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

      {/* Visio import status — same modal as the editor's. Shows the
          per-master breakdown, stats, and full warnings list from the
          most recent Import → Visio. Stays open until the user explicitly
          closes or opens the new diagram (z-[60] beats other overlays;
          backdrop click is swallowed). */}
      {visioImportStatus && (
        <div
          className="fixed inset-0 bg-black/20 flex items-center justify-center z-[60]"
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
                Open the new diagram to see the result on canvas, or close to keep working in this project.
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

      {/* Import progress modal */}
      {(importing || importLog.length > 0) && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
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

      {/* Project Config modal */}
      {showMaintenance && (
        <DiagramMaintenanceModal
          projectId={project.id}
          initialColorConfig={projectColorConfig}
          initialFontConfig={projectFontConfig}
          onClose={() => setShowMaintenance(false)}
          onSaved={({ colorConfig, fontConfig }) => {
            setProjectColorConfig(colorConfig);
            setProjectFontConfig(fontConfig);
            // No router.refresh() — React re-renders only affected diagram thumbnails
          }}
        />
      )}

      {/* Scan Diagrams for Links — finds subprocess→diagram name matches and
          (on Confirm) sets linkedDiagramId on the parent's subprocess plus a
          return-link marker on the child near its start event. */}
      {showLinkScan && (
        <LinkScanDialog
          projectId={project.id}
          onClose={() => setShowLinkScan(false)}
          onApplied={() => {
            // Refresh project diagrams so any newly-created return-link
            // elements on children appear immediately if the user is
            // looking at that diagram next.
            refreshProjectData();
          }}
        />
      )}

      {/* New Diagram dialog */}
      {showNewDiagram && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
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

      {/* New Visio Import dialog — collects name + target folder before
          opening the file picker. After name validation, the file input
          referenced by `importVisioInputRef` is clicked; the rest of the
          import flow runs inside `handleImportVisioFile`. */}

      {/* Scan Diagrams for Errors — three checks per diagram:
            1. sequence / association connectors on a Pool or Lane
            2. duplicate Pool/Lane names
            3. Pools with exactly one Lane
          Clickable diagram rows open the editor in a new tab. */}
      {(scanResult || scanError) && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">
                Scan Diagrams for Issues
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleScanPoolConnectors()}
                  disabled={scanBusy}
                  className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                  title="Re-run the scan to refresh the issue list (e.g. after fixing one diagram and coming back)."
                >
                  {scanBusy ? "Scanning…" : "Rescan"}
                </button>
                <button
                  onClick={() => { setScanResult(null); setScanError(""); }}
                  className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                  title="Close"
                >✕</button>
              </div>
            </div>
            {scanError && (
              <p className="mb-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{scanError}</p>
            )}
            {/* Ignore-types control. Selecting a type hides every instance
                of it from the result list AND from the next rescan's
                display. The selections persist across rescans within the
                Scan-Fix-Rescan cycle (sessionStorage), so the user can
                progressively park accepted issues. */}
            {scanResult && (
              <div className="mb-3 border border-gray-200 rounded">
                <button
                  onClick={() => setScanIgnoresOpen((v) => !v)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-left rounded-t"
                >
                  <span className="text-gray-500 text-xs">{scanIgnoresOpen ? "▼" : "▶"}</span>
                  <span className="text-xs font-medium text-gray-700">Ignore issue types</span>
                  {(ignoredErrorTypes.size + ignoredWarningTypes.size) > 0 && (
                    <span className="text-[10px] text-gray-500">
                      {ignoredErrorTypes.size + ignoredWarningTypes.size} type{(ignoredErrorTypes.size + ignoredWarningTypes.size) === 1 ? "" : "s"} hidden
                    </span>
                  )}
                </button>
                {scanIgnoresOpen && (
                  <div className="px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-red-700 mb-1">Error types</p>
                      {(Object.keys(ERROR_TYPE_LABELS) as ErrorType[]).map((t) => (
                        <label key={t} className="flex items-center gap-1.5 text-[11px] text-gray-700 py-0.5">
                          <input
                            type="checkbox"
                            checked={ignoredErrorTypes.has(t)}
                            onChange={(e) => {
                              setIgnoredErrorTypes((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(t);
                                else next.delete(t);
                                return next;
                              });
                            }}
                            className="h-3 w-3"
                          />
                          <span>{ERROR_TYPE_LABELS[t]}</span>
                        </label>
                      ))}
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-amber-700 mb-1">Warning types</p>
                      {(Object.keys(WARNING_TYPE_LABELS) as WarningType[]).map((t) => (
                        <label key={t} className="flex items-center gap-1.5 text-[11px] text-gray-700 py-0.5">
                          <input
                            type="checkbox"
                            checked={ignoredWarningTypes.has(t)}
                            onChange={(e) => {
                              setIgnoredWarningTypes((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(t);
                                else next.delete(t);
                                return next;
                              });
                            }}
                            className="h-3 w-3"
                          />
                          <span>{WARNING_TYPE_LABELS[t]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {scanResult && (() => {
              // Apply the ignored-types filter before splitting into
              // error / warning buckets so counts and diagram rows
              // reflect only what's still surfaced.
              type Bucketed = ScanDiagram & {
                hangingErrors: ScanHangingMessage[];
                hangingWarnings: ScanHangingMessage[];
              };
              const bucketed: Bucketed[] = scanResult.diagrams.map((d) => ({
                ...d,
                badConnectors:    ignoredErrorTypes.has("pool-lane-connector") ? [] : d.badConnectors,
                duplicateNames:   ignoredErrorTypes.has("duplicate-name")      ? [] : d.duplicateNames,
                singleLanePools:  ignoredErrorTypes.has("single-lane-pool")    ? [] : d.singleLanePools,
                structuralIssues: ignoredErrorTypes.has("structural-error")    ? [] : (d.structuralIssues ?? []),
                hangingErrors:    ignoredErrorTypes.has("hanging-error")
                                    ? []
                                    : d.hangingMessages.filter((m) => m.severity !== "warning"),
                hangingWarnings:  ignoredWarningTypes.has("hanging-warning")
                                    ? []
                                    : d.hangingMessages.filter((m) => m.severity === "warning"),
              }));
              const errorDiagrams = bucketed.filter((d) =>
                d.badConnectors.length > 0 ||
                d.duplicateNames.length > 0 ||
                d.singleLanePools.length > 0 ||
                d.structuralIssues.length > 0 ||
                d.hangingErrors.length > 0,
              );
              const warningDiagrams = bucketed.filter((d) => d.hangingWarnings.length > 0);
              // Totals computed AFTER the ignore filter, so the summary
              // reflects what's currently shown rather than the raw
              // scan output.
              let errorTotal = 0;
              let warningTotal = 0;
              for (const d of bucketed) {
                errorTotal +=
                  d.badConnectors.length +
                  d.duplicateNames.length +
                  d.singleLanePools.length +
                  d.structuralIssues.length +
                  d.hangingErrors.length;
                warningTotal += d.hangingWarnings.length;
              }
              if (errorTotal === 0 && warningTotal === 0) {
                const anyIgnored = ignoredErrorTypes.size + ignoredWarningTypes.size > 0;
                return (
                  <p className="text-sm text-gray-600">
                    No errors or warnings to show
                    {anyIgnored ? " (some issue types are hidden — uncheck them above to see them)." : "."}
                  </p>
                );
              }

              const renderDiagramRow = (d: Bucketed, kind: "error" | "warning") => {
                const open = scanExpanded.has(`${kind}:${d.diagramId}`);
                const issueCount = kind === "error"
                  ? d.badConnectors.length + d.duplicateNames.length + d.singleLanePools.length + d.structuralIssues.length + d.hangingErrors.length
                  : d.hangingWarnings.length;
                return (
                  <div key={`${kind}:${d.diagramId}`} className="border-b border-gray-100 last:border-b-0">
                    <div className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
                      <button
                        onClick={() => {
                          setScanExpanded((prev) => {
                            const key = `${kind}:${d.diagramId}`;
                            const next = new Set(prev);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          });
                        }}
                        className="text-gray-500 hover:text-gray-700 text-xs w-4"
                      >{open ? "▼" : "▶"}</button>
                      <a
                        href={`/diagram/${d.diagramId}`}
                        className="text-sm text-blue-600 hover:underline flex-1 truncate"
                        title={`${d.diagramName} — click to open. Use back to return here with the scan still loaded.`}
                      >{d.diagramName}</a>
                      <span className="text-[10px] text-gray-500">
                        {issueCount} issue{issueCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    {open && kind === "error" && (
                      <div className="pl-9 pr-3 pb-2 space-y-2">
                        {d.badConnectors.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Connectors on Pool/Lane</p>
                            <ul className="text-[11px] text-gray-700 space-y-0.5">
                              {d.badConnectors.map((c) => (
                                <li key={c.connectorId} className="flex items-center gap-2">
                                  <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] text-gray-600">{c.type}</span>
                                  <span className={c.sourceIsContainer ? "text-red-600 font-medium" : ""}>
                                    {c.sourceName} <span className="text-gray-400">[{c.sourceType}]</span>
                                  </span>
                                  <span className="text-gray-400">→</span>
                                  <span className={c.targetIsContainer ? "text-red-600 font-medium" : ""}>
                                    {c.targetName} <span className="text-gray-400">[{c.targetType}]</span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {d.duplicateNames.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Duplicate Pool/Lane names</p>
                            <ul className="text-[11px] text-gray-700 space-y-0.5">
                              {d.duplicateNames.map((dn, i) => (
                                <li key={i} className="flex items-center gap-2">
                                  <span className="text-red-600 font-medium">&ldquo;{dn.name}&rdquo;</span>
                                  <span className="text-gray-500">×{dn.elements.length}</span>
                                  <span className="text-gray-400 text-[10px]">
                                    ({dn.elements.map((x) => x.type).join(", ")})
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {d.singleLanePools.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Pools with a single Lane</p>
                            <ul className="text-[11px] text-gray-700 space-y-0.5">
                              {d.singleLanePools.map((sl) => (
                                <li key={sl.poolId} className="flex items-center gap-2">
                                  <span className="text-red-600 font-medium">{sl.poolName || "(unnamed pool)"}</span>
                                  <span className="text-gray-400">contains lane</span>
                                  <span className="text-gray-700">{sl.laneName || "(unnamed lane)"}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {d.hangingErrors.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Hanging messages</p>
                            <ul className="text-[11px] text-gray-700 space-y-0.5">
                              {d.hangingErrors.map((hm) => (
                                <li key={hm.connectorId} className="flex items-center gap-2 flex-wrap">
                                  <span className="text-red-600 font-medium">{hm.sourceName} <span className="text-gray-400">[{hm.sourceType}]</span></span>
                                  <span className="text-gray-400">→</span>
                                  <span className="text-red-600 font-medium">{hm.targetName} <span className="text-gray-400">[{hm.targetType}]</span></span>
                                  <span className="text-gray-500 text-[10px] italic">({hm.reason})</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {d.structuralIssues.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">BPMN structure</p>
                            <ul className="text-[11px] text-gray-700 space-y-0.5">
                              {d.structuralIssues.map((si, i) => (
                                <li key={`${si.rule}:${i}`} className="flex items-start gap-2">
                                  <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] text-gray-600 shrink-0">{si.rule}</span>
                                  <span className="text-red-600">{si.message}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                    {open && kind === "warning" && (
                      <div className="pl-9 pr-3 pb-2 space-y-2">
                        {d.hangingWarnings.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Messages touching white-box pool</p>
                            <ul className="text-[11px] text-gray-700 space-y-0.5">
                              {d.hangingWarnings.map((hm) => (
                                <li key={hm.connectorId} className="flex items-center gap-2 flex-wrap">
                                  <span className="text-amber-700 font-medium">{hm.sourceName} <span className="text-gray-400">[{hm.sourceType}]</span></span>
                                  <span className="text-gray-400">→</span>
                                  <span className="text-amber-700 font-medium">{hm.targetName} <span className="text-gray-400">[{hm.targetType}]</span></span>
                                  <span className="text-gray-500 text-[10px] italic">({hm.reason})</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              };

              return (
                <div className="max-h-[60vh] overflow-y-auto space-y-3">
                  {/* Errors group */}
                  <div className="border border-red-200 rounded">
                    <button
                      onClick={() => setScanErrorsOpen((v) => !v)}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-red-50 hover:bg-red-100 text-left rounded-t"
                    >
                      <span className="text-red-700 text-xs">{scanErrorsOpen ? "▼" : "▶"}</span>
                      <span className="text-sm font-semibold text-red-800">Errors</span>
                      <span className="text-[11px] text-red-700">
                        {errorTotal} issue{errorTotal === 1 ? "" : "s"} across {errorDiagrams.length} diagram{errorDiagrams.length === 1 ? "" : "s"}
                      </span>
                    </button>
                    {scanErrorsOpen && (
                      errorDiagrams.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-500 italic">No errors.</p>
                      ) : (
                        <div>{errorDiagrams.map((d) => renderDiagramRow(d, "error"))}</div>
                      )
                    )}
                  </div>

                  {/* Warnings group */}
                  <div className="border border-amber-200 rounded">
                    <button
                      onClick={() => setScanWarningsOpen((v) => !v)}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-left rounded-t"
                    >
                      <span className="text-amber-700 text-xs">{scanWarningsOpen ? "▼" : "▶"}</span>
                      <span className="text-sm font-semibold text-amber-800">Warnings</span>
                      <span className="text-[11px] text-amber-700">
                        {warningTotal} issue{warningTotal === 1 ? "" : "s"} across {warningDiagrams.length} diagram{warningDiagrams.length === 1 ? "" : "s"}
                      </span>
                    </button>
                    {scanWarningsOpen && (
                      warningDiagrams.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-500 italic">No warnings.</p>
                      ) : (
                        <div>{warningDiagrams.map((d) => renderDiagramRow(d, "warning"))}</div>
                      )
                    )}
                  </div>
                </div>
              );
            })()}
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => { setScanResult(null); setScanError(""); }}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >Close</button>
            </div>
          </div>
        </div>
      )}

      {showImportVisioDialog && importVisioFile && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Import Visio Diagrams</h2>
            <p className="text-xs text-gray-600 mb-4 truncate">
              <span className="font-mono">{importVisioFile.name}</span> · {importVisioPages.length} page{importVisioPages.length === 1 ? "" : "s"}
            </p>

            {importVisioError && (
              <p className="mb-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{importVisioError}</p>
            )}

            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">Select pages to import</label>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setImportVisioSelected(new Set(importVisioPages.map((p) => p.index)))}
                    className="text-blue-600 hover:underline"
                  >Select all</button>
                  <button
                    type="button"
                    onClick={() => setImportVisioSelected(new Set())}
                    className="text-blue-600 hover:underline"
                  >Clear</button>
                </div>
              </div>
              <div className="max-h-[40vh] overflow-y-auto border border-gray-300 rounded">
                {importVisioPages.map((p) => {
                  const checked = importVisioSelected.has(p.index);
                  return (
                    <label
                      key={p.index}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setImportVisioSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(p.index);
                            else next.delete(p.index);
                            return next;
                          });
                        }}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-gray-400 text-xs tabular-nums w-6">{p.index + 1}.</span>
                      <span className="truncate">{p.name}</span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-gray-500">{importVisioSelected.size} of {importVisioPages.length} selected.</p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Target</label>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 text-sm text-gray-800">
                  <input
                    type="radio"
                    name="visio-import-target"
                    checked={importVisioTarget === "current"}
                    onChange={() => setImportVisioTarget("current")}
                    className="h-3.5 w-3.5"
                  />
                  <span>Add to current project: <span className="font-medium">{project.name}</span></span>
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-800">
                  <input
                    type="radio"
                    name="visio-import-target"
                    checked={importVisioTarget === "new"}
                    onChange={() => setImportVisioTarget("new")}
                    className="h-3.5 w-3.5"
                  />
                  <span>Create new project:</span>
                  <input
                    type="text"
                    value={importVisioNewProjectName}
                    onChange={(e) => setImportVisioNewProjectName(e.target.value)}
                    onFocus={() => setImportVisioTarget("new")}
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="New project name"
                  />
                </label>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Folder</label>
              <input
                type="text"
                value={importVisioFolderName}
                onChange={(e) => setImportVisioFolderName(e.target.value)}
                list="import-visio-folder-options"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Imported BPMN Diagrams"
              />
              <datalist id="import-visio-folder-options">
                {folderTree.folders
                  .filter(f => f.parentId === null)
                  .map(f => <option key={f.id} value={f.name} />)}
              </datalist>
              <p className="mt-1.5 text-xs text-gray-500">Created if it doesn&apos;t exist. Leave blank to place diagrams at the project root.</p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowImportVisioDialog(false);
                  setImportVisioFile(null);
                  setImportVisioError("");
                }}
                disabled={importVisioBusy}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleImportVisioConfirm}
                disabled={importVisioBusy || importVisioSelected.size === 0}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {importVisioBusy ? "Importing…" : `Import ${importVisioSelected.size} page${importVisioSelected.size === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation — lists count + first few names so
          the user can confirm they're deleting what they think they are. */}
      {showBulkDeleteConfirm && (() => {
        const ids = Array.from(selectedDiagramIds);
        const names = ids
          .map(id => diagrams.find(d => d.id === id)?.name ?? "(unknown)")
          .slice(0, 5);
        const more = ids.length - names.length;
        return (
          <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                Delete {ids.length} diagram{ids.length === 1 ? "" : "s"}?
              </h2>
              <p className="text-sm text-gray-700 mb-3">
                The following will be moved to the system archive (recoverable):
              </p>
              <ul className="mb-4 text-sm text-gray-800 list-disc pl-5 space-y-0.5">
                {names.map((n, i) => <li key={i} className="truncate">{n}</li>)}
                {more > 0 && (
                  <li className="text-gray-500 italic">…and {more} more</li>
                )}
              </ul>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowBulkDeleteConfirm(false)}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700"
                >
                  Delete {ids.length}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bulk move — folder picker for in-project folders. Project
          root + every folder in the tree are listed; clicking one
          reassigns the diagramFolderMap for every selected diagram. */}
      {showBulkMoveDialog && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Move {selectedDiagramIds.size} diagram{selectedDiagramIds.size === 1 ? "" : "s"} to folder
            </h2>
            <p className="text-sm text-gray-600 mb-3">Choose a destination:</p>
            <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
              <button
                onClick={() => handleBulkMoveToFolder(ROOT_ID)}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-gray-700"
              >
                <span className="font-medium">/ Project root</span>
              </button>
              {folderTree.folders.map(f => {
                // Compute a simple path string by walking parents.
                const parts: string[] = [];
                let cur: typeof f | undefined = f;
                const guard = new Set<string>();
                while (cur && !guard.has(cur.id)) {
                  guard.add(cur.id);
                  parts.unshift(cur.name);
                  cur = cur.parentId
                    ? folderTree.folders.find(x => x.id === cur!.parentId)
                    : undefined;
                }
                return (
                  <button
                    key={f.id}
                    onClick={() => handleBulkMoveToFolder(f.id)}
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-gray-700"
                  >
                    / {parts.join(" / ")}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowBulkMoveDialog(false)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
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

      {translateSrc && (
        <TranslateToBpmnDialog
          source={translateSrc.data}
          sourceName={translateSrc.name}
          projectId={project.id}
          onClose={() => setTranslateSrc(null)}
          onCreated={(created) => {
            setTranslateSrc(null);
            router.push(`/diagram/${created.id}`);
          }}
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
        if (type === "chevron" || type === "chevron-collapsed") {
          const notch = Math.min(w * 0.15, 8);
          return <polygon key={el.id}
            points={`${x},${y} ${x+w-notch},${y} ${x+w},${y+h/2} ${x+w-notch},${y+h} ${x},${y+h} ${x+notch},${y+h/2}`}
            fill={fill} stroke="#374151" strokeWidth={1} />;
        }
        if (type === "fork-join") {
          return <rect key={el.id} x={x} y={y} width={w} height={h}
            rx={1} fill="#1f2937" />;
        }
        if (type === "group" || type === "text-annotation") {
          return <rect key={el.id} x={x} y={y} width={w} height={h}
            fill="none" stroke={fill} strokeWidth={1} strokeDasharray="4 2" />;
        }
        const rx = type === "state" || type === "composite-state" || type === "submachine" ? 8 : 3;
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
  onTranslate,
  onMove,
  onCardClick,
  selected,
  colorConfig,
}: {
  diagram: DiagramSummary;
  otherProjects: OtherProject[];
  onDelete: (id: string) => void;
  onClone: (id: string) => void;
  onTranslate: (id: string) => void;
  onMove: (diagramId: string, projectId: string | null) => void;
  onCardClick: (
    diagramId: string,
    mods: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => void;
  selected: boolean;
  colorConfig?: SymbolColorConfig;
}) {
  const [showMove, setShowMove] = useState(false);
  // Colour-code the tile with a soft tint of the diagram-type colour.
  const typeStyle = useDiagramTypeStyles()(diagram.type);
  const tileTint = lightenHex(typeStyle.bgColor, 0.5);

  return (
    <div
      onClick={(e) => onCardClick(diagram.id, {
        shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey,
      })}
      title={diagram.name}
      style={{ backgroundColor: tileTint }}
      className={`rounded-md px-2 py-1.5 hover:shadow-sm cursor-pointer group transition-all relative ${
        selected
          ? "border-2 border-blue-500 ring-2 ring-blue-200"
          : "border border-gray-200 hover:border-blue-300"
      }`}
    >
      {/* Row 1: Name + action icons */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900 text-[11px] leading-tight truncate flex-1" title={diagram.name}>{diagram.name}</h3>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 ml-1 shrink-0">
          {diagram.type === "flowchart" && (
            <button
              onClick={(e) => { e.stopPropagation(); onTranslate(diagram.id); }}
              className="text-gray-400 hover:text-blue-500 px-0.5 font-semibold text-[10px] leading-none"
              title="Translate to BPMN"
            >
              →BP
            </button>
          )}
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
                  className="block w-full text-left px-3 py-1 text-xs text-gray-500 hover:bg-gray-50 italic">Sandpit</button>
              </div>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(diagram.id); }}
            className="text-gray-400 hover:text-red-500 text-[10px] px-0.5"
          >{"\u2715"}</button>
        </div>
      </div>
      {/* Row 2: Type/date on left, thumbnail on right */}
      <div className="flex items-start mt-0.5">
        <div className="flex items-center gap-1.5 text-[9px] text-gray-400 pt-0.5">
          <DiagramTypeBadge type={diagram.type} showLabel showCode={false} />
          <span>{"\u00B7"}</span>
          <span>{new Date(diagram.updatedAt).toLocaleDateString()}</span>
        </div>
        <div className="ml-auto w-14 h-8 opacity-90 group-hover:opacity-100 transition-opacity pointer-events-none shrink-0">
          <DiagramThumbnail data={(diagram.data ?? { elements: [], connectors: [] }) as DiagramData} colorConfig={colorConfig} />
        </div>
      </div>
    </div>
  );
}
