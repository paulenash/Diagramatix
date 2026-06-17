"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import type { DiagramType } from "@/app/lib/diagram/types";
import { SCHEMA_VERSION } from "@/app/lib/diagram/types";
import { ImpersonationBanner } from "@/app/components/ImpersonationBanner";
import { SharePointPicker } from "@/app/components/SharePointPicker";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { UsagePopover } from "@/app/components/UsagePopover";
import { NotificationsBell } from "@/app/components/NotificationsBell";
import { TierPicker, type TierCard } from "@/app/components/TierPicker";
import { ReviewsSection } from "./ReviewsSection";
import { PublishedSection } from "./PublishedSection";
import { CollapsibleSection } from "./CollapsibleSection";
import { ProjectShareDialog } from "./ProjectShareDialog";
import { NotificationsClient } from "../notifications/NotificationsClient";
import { DiagramTypeBadge } from "@/app/components/DiagramTypeBadge";
import { useDiagramTypeStyles } from "@/app/hooks/useDiagramTypeStyles";
import { lightenHex } from "@/app/lib/diagram/diagramTypeStyles";
import { BackupProgressModal } from "@/app/components/BackupProgressModal";

interface DiagramSummary {
  id: string;
  name: string;
  type: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectSummary {
  id: string;
  name: string;
  description?: string;
  ownerName?: string;
  createdAt: Date;
  updatedAt: Date;
  /** Server-side diagrams + shares count. shares may be 0 (not shared). */
  _count: { diagrams: number; shares?: number };
  /** Project owner identity. Surfaced on shared tiles as "by name · email". */
  user?: { id: string; name: string | null; email: string };
  /**
   * The caller's ProjectShare row for this project, filtered server-side
   * to the active user. Empty array when the caller is the project owner;
   * otherwise contains exactly one row.
   */
  shares?: { role: "VIEW" | "EDIT" }[];
}

/**
 * Effective project role for the current viewer. "owner" means the caller
 * owns the project; "edit" / "view" mean they were granted access via a
 * ProjectShare row. Drives tile styling + per-tile action visibility.
 *
 * The server filters `shares` to the caller's row only, so emptiness is
 * the owner signal — no extra userId comparison needed.
 */
type ProjectRole = "owner" | "edit" | "view";
function deriveProjectRole(p: ProjectSummary): ProjectRole {
  const share = p.shares?.[0]?.role;
  if (share === "EDIT") return "edit";
  if (share === "VIEW") return "view";
  return "owner";
}

interface Props {
  projects: ProjectSummary[];
  unorganized: DiagramSummary[];
  currentUserId: string;
  userName: string;
  userEmail?: string;
  orgName?: string;
  /** The signed-in user's role in the active org. Used to gate destructive
   *  admin actions (e.g. hard-delete). Server still re-checks. */
  orgRole?: string;
  version?: number;
  readOnly?: boolean;
  viewingAsName?: string;
  viewingAsEmail?: string;
  impersonationMode?: "view" | "edit";
  isSuperuser?: boolean;
  hasMicrosoft?: boolean;
  /** Subscription snapshot for the effective user. Null when the user
   *  has no tier (legacy) or hasn't yet been seeded. Drives the
   *  subscription chip + popover. */
  usageSnapshot?: import("@/app/lib/subscription").UsageSnapshot | null;
  /** When true, render the welcome TierPicker modal until the user
   *  picks or skips. Suppressed during impersonation. */
  showTierPicker?: boolean;
  /** Tier rows for the picker. Empty if showTierPicker is false. */
  tierCards?: TierCard[];
}


const DIAGRAM_TYPES: { value: DiagramType; label: string; description: string }[] = [
  { value: "context", label: "Context", description: "External entities, processes, and data flows" },
  { value: "process-context", label: "Process Context", description: "Use cases with actors showing process participants" },
  { value: "state-machine", label: "State Machine", description: "States and transitions for entity lifecycle" },
  { value: "bpmn", label: "BPMN", description: "Full Business Process Model and Notation" },
  { value: "domain", label: "Domain", description: "UML class diagrams with classes, enumerations, and relationships" },
];

function DiagramCard({
  diagram,
  projects,
  onDelete,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  diagram: DiagramSummary;
  projects: ProjectSummary[];
  onDelete: (id: string) => void;
  onMove: (diagramId: string, projectId: string | null) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const router = useRouter();
  const [showMove, setShowMove] = useState(false);
  // Colour-code the tile with a soft tint of the diagram-type colour.
  const typeStyle = useDiagramTypeStyles()(diagram.type);
  const tileTint = lightenHex(typeStyle.bgColor, 0.5);

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", diagram.id); onDragStart?.(); }}
      onDragEnd={() => onDragEnd?.()}
      onClick={() => router.push(`/diagram/${diagram.id}?from=/dashboard`)}
      style={{ backgroundColor: tileTint }}
      className="border border-gray-200 rounded px-3 py-2 hover:border-blue-300 hover:shadow-sm cursor-pointer group transition-all relative"
    >
      <div className="flex items-center justify-between">
        <div className="w-8 h-8 bg-blue-50 rounded flex items-center justify-center shrink-0">
          <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
            <rect x={1} y={4} width={6} height={4} rx={1} stroke="#2563eb" strokeWidth={1.2} />
            <rect x={9} y={4} width={6} height={4} rx={1} stroke="#2563eb" strokeWidth={1.2} />
            <line x1={7} y1={6} x2={9} y2={6} stroke="#2563eb" strokeWidth={1.2} />
          </svg>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100">
          {projects.length > 0 && (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowMove((v) => !v); }}
                className="text-gray-400 hover:text-blue-500 text-xs px-1"
                title="Move to project"
              >
                ↗
              </button>
              {showMove && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-5 z-20 bg-white border border-gray-200 rounded shadow-lg min-w-36 py-1"
                >
                  <p className="px-3 py-1 text-xs text-gray-400 font-medium uppercase tracking-wide">Move to</p>
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { onMove(diagram.id, p.id); setShowMove(false); }}
                      className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(diagram.id); }}
            className="text-gray-400 hover:text-red-500 text-xs px-1"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="mt-1">
        <h3 className="font-medium text-gray-900 text-xs truncate">{diagram.name}</h3>
        <div className="flex items-center gap-2 mt-0.5">
          <DiagramTypeBadge type={diagram.type} showLabel showCode={false} />
          <span className="text-[10px] text-gray-400">{new Date(diagram.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

export function DashboardClient({ projects: initialProjects, unorganized: initialUnorganized, currentUserId, userName, userEmail, orgName, orgRole, version, readOnly, viewingAsName, viewingAsEmail, impersonationMode, isSuperuser: isSu, hasMicrosoft, usageSnapshot, showTierPicker, tierCards }: Props) {
  // Owner / OrgAdmin can use the destructive hard-delete path (the
  // Prisma enum value is still "Admin" — the relabel to "OrgAdmin" is
  // UI-only). Read-only impersonation sessions are always denied; the
  // server enforces the same rule independently.
  // Hard delete (x++) is SuperAdmin-only AND only on projects the
  // SuperAdmin owns (per Paul's spec 2026-06-08). Server independently
  // enforces both checks.
  const canHardDelete = !readOnly && !!isSu;
  const router = useRouter();
  const searchParams = useSearchParams();
  // Notifications modal — opened by the bell or by returning from a
  // diagram with ?notifications=1. Renders over the dashboard so the
  // dashboard shows behind it, shaded. Always the user's OWN feed (the
  // all-Org / all-users views live behind the admin menus).
  const [showNotifications, setShowNotifications] = useState(searchParams.get("notifications") === "1");
  const notifVisited = searchParams.get("visited");
  function closeNotifications() {
    setShowNotifications(false);
    // Strip the ?notifications / ?visited params without a full reload.
    if (searchParams.get("notifications") || searchParams.get("visited")) {
      router.replace("/dashboard");
    }
  }
  const [projects, setProjects] = useState(initialProjects);
  const [unorganized, setUnorganized] = useState(initialUnorganized);
  const [showUsagePopover, setShowUsagePopover] = useState(false);
  // Welcome tier picker — initialised from the SSR-fetched flag. After
  // the user picks or skips, we close locally (router.refresh() is fired
  // by the picker itself so the next render gets hasChosenTier=true).
  const [tierPickerOpen, setTierPickerOpen] = useState(!!showTierPicker);

  // Re-fetch projects + unorganised diagrams from the API and update local
  // state. Used after operations that mutate the user's content from outside
  // the normal optimistic update path (e.g. backup restore, project import).
  // Both endpoints are already org-scoped server-side.
  async function reloadDashboardContent() {
    try {
      const [projResp, diagResp] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/diagrams"),
      ]);
      if (projResp.ok) {
        const projList = await projResp.json();
        setProjects(projList);
      }
      if (diagResp.ok) {
        const diagList = (await diagResp.json()) as Array<{ id: string; projectId?: string | null }>;
        // The dashboard's "unorganized" list is diagrams without a project
        setUnorganized(diagList.filter(d => !d.projectId) as typeof initialUnorganized);
      }
    } catch {
      // best-effort — fall back to a hard reload if needed
    }
  }

  // Selected project for properties panel
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editOwner, setEditOwner] = useState("");

  const selectedProject = selectedProjectId ? projects.find(p => p.id === selectedProjectId) : null;
  const selectedRole: ProjectRole | null = selectedProject ? deriveProjectRole(selectedProject) : null;

  // Lazy share-list state for the sidebar's collapsible "Shared with" row.
  // Keyed by projectId — opening the row for the first time fetches the
  // list once and caches it for the rest of the session. Switching to a
  // different project resets the open state (the user expects each
  // project's row to start collapsed).
  interface ShareRow {
    id: string;
    role: "VIEW" | "EDIT";
    user: { id: string; name: string | null; email: string };
  }
  const [shareListOpen, setShareListOpen] = useState(false);
  const [shareListByProject, setShareListByProject] = useState<Record<string, ShareRow[]>>({});
  const [shareListLoading, setShareListLoading] = useState(false);
  const [shareListError, setShareListError] = useState("");
  // Whether the share-management dialog is open for the current selection.
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  // Per-tile "Shared" dropdown — which project tile, if any, has its
  // recipient-list popover open. Shares the same loadShares() cache as
  // the sidebar so opening one doesn't refetch what the other already
  // pulled.
  const [tileShareDropdownProjectId, setTileShareDropdownProjectId] = useState<string | null>(null);

  // Right-click context menu for a project tile. `projectId` is the
  // tile that owns the open menu; `x/y` are viewport pixel positions
  // for absolute placement.
  const [tileContextMenu, setTileContextMenu] = useState<{ projectId: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!tileContextMenu) return;
    const close = () => setTileContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", onKey); };
  }, [tileContextMenu]);
  const isOrgAdmin = !readOnly && (orgRole === "Owner" || orgRole === "Admin");

  // Refetch share list — used after the dialog closes (we don't know
  // exactly what changed, so just re-pull the source of truth) and on
  // first open.
  async function loadShares(projectId: string) {
    setShareListLoading(true);
    setShareListError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/shares`);
      if (!res.ok) throw new Error((await res.text()) || res.statusText);
      const rows = (await res.json()) as ShareRow[];
      setShareListByProject(prev => ({ ...prev, [projectId]: rows }));
    } catch (err) {
      setShareListError(err instanceof Error ? err.message : String(err));
    } finally {
      setShareListLoading(false);
    }
  }

  // Reset share-list open state when selection changes — otherwise opening
  // project A then switching to B would inherit A's open/closed state.
  useEffect(() => {
    setShareListOpen(false);
    setShareListError("");
  }, [selectedProjectId]);

  function saveProjectProps(projectId: string, fields: Record<string, string>) {
    fetch(`/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    }).catch(() => {});
  }

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string; message: string; onConfirm: () => void;
  } | null>(null);

  // New project state
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  // Drag-drop state for moving unorganised diagrams to projects
  const [dragDiagramId, setDragDiagramId] = useState<string | null>(null);
  const [dropTargetProjectId, setDropTargetProjectId] = useState<string | null>(null);

  // New diagram (unorganized) state
  const [showNewDiagram, setShowNewDiagram] = useState(false);
  const [newName, setNewName] = useState("");
  // G03: BPMN is the most-used type — default the New Diagram radio to it.
  const [newType, setNewType] = useState<DiagramType>("bpmn");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [importing, setImporting] = useState(false);
  const [importLog, setImportLog] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<"success" | "failed" | null>(null);
  const [importedProjectId, setImportedProjectId] = useState<string | null>(null);
  const [pendingImportData, setPendingImportData] = useState<Record<string, unknown> | null>(null);
  const [importProjectName, setImportProjectName] = useState("");
  const [showImportNameDialog, setShowImportNameDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Unified File menu (Import JSON / Import XML / Backup / Restore / Admin)
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [importFormat, setImportFormat] = useState<"json" | "xml">("json");
  const fileMenuRef = useRef<HTMLDivElement>(null);
  // System-menu Import cascade: open + chosen Local/SharePoint dest.
  const [impOpen, setImpOpen] = useState(false);
  const [impDest, setImpDest] = useState<null | "local" | "sharepoint">(null);
  // Import-from-SharePoint: which format the user chose (filters the picker).
  const [spImportFmt, setSpImportFmt] = useState<null | "json" | "xml" | "visio" | "bpmn" | "ddl">(null);
  const [spBusy, setSpBusy] = useState(false);
  const closeSys = () => { setFileMenuOpen(false); setImpOpen(false); setImpDest(null); };
  useEffect(() => { if (!fileMenuOpen) { setImpOpen(false); setImpDest(null); } }, [fileMenuOpen]);
  // Esc steps back one level (format → Local/SharePoint → Import → close menu).
  useEffect(() => {
    if (!fileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); e.stopPropagation();
      if (impDest) setImpDest(null);
      else if (impOpen) setImpOpen(false);
      else setFileMenuOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [fileMenuOpen, impOpen, impDest]);
  // Download a chosen file from SharePoint and run the matching import flow.
  async function handleSpImport(fmt: "json" | "xml" | "visio" | "bpmn" | "ddl", sel: { driveId: string; itemId: string | null; name: string }) {
    if (!sel.itemId) return;
    setSpBusy(true);
    try {
      const r = await fetch(`/api/sharepoint/download?driveId=${encodeURIComponent(sel.driveId)}&itemId=${encodeURIComponent(sel.itemId)}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Download failed");
      const blob = await r.blob();
      const file = new File([blob], sel.name);
      setSpBusy(false);
      if (fmt === "json" || fmt === "xml") { setImportFormat(fmt); handleFileSelected(file); }
      else if (fmt === "visio") { setVisioImportError(""); await handleVisioFileSelected(file); }
      else if (fmt === "bpmn") handleBpmnFolderSelected([file], file.name.replace(/\.bpmn$/i, ""));
      else { setDdlProjectName(""); setDdlDiagramName(""); setDdlDbType("postgres"); setDdlLog([]); setDdlResult(null); setDdlFile(file); setShowDdlImport(true); }
    } catch (err) {
      setSpBusy(false);
      // eslint-disable-next-line no-alert
      setVisioImportError(`SharePoint open failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Visio Bulk Import (always creates a new project at the dashboard level).
  const visioInputRef = useRef<HTMLInputElement>(null);
  const [visioImportFile, setVisioImportFile] = useState<File | null>(null);
  const [visioImportPages, setVisioImportPages] = useState<{ index: number; name: string }[]>([]);
  const [visioImportSelected, setVisioImportSelected] = useState<Set<number>>(new Set());
  const [visioImportProjectName, setVisioImportProjectName] = useState("");
  const [visioImportFolderName, setVisioImportFolderName] = useState("Imported BPMN Diagrams");
  const [visioImportBusy, setVisioImportBusy] = useState(false);
  const [visioImportError, setVisioImportError] = useState("");
  const [showVisioImportDialog, setShowVisioImportDialog] = useState(false);

  async function handleVisioFileSelected(file: File) {
    setVisioImportError("");
    try {
      const { listVisioPages } = await import("@/app/lib/diagram/v3/visioPages");
      const buf = await file.arrayBuffer();
      const pages = await listVisioPages(buf);
      if (pages.length === 0) {
        alert("No usable pages found in this .vsdx file.");
        return;
      }
      setVisioImportFile(file);
      setVisioImportPages(pages.map((p) => ({ index: p.index, name: p.name })));
      setVisioImportSelected(new Set(pages.map((p) => p.index)));
      const stem = file.name.replace(/\.vsdx$/i, "");
      setVisioImportProjectName(stem || "Imported Visio Diagrams");
      setVisioImportFolderName("Imported BPMN Diagrams");
      setShowVisioImportDialog(true);
    } catch (err) {
      alert(`Failed to read .vsdx: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // BPMN Bulk Import (folder picker → new project, one diagram per .bpmn file).
  const bpmnFolderInputRef = useRef<HTMLInputElement>(null);
  const [bpmnImportFiles, setBpmnImportFiles] = useState<File[]>([]);
  const [bpmnImportSelected, setBpmnImportSelected] = useState<Set<number>>(new Set());
  const [bpmnImportProjectName, setBpmnImportProjectName] = useState("");
  const [bpmnImportFolderName, setBpmnImportFolderName] = useState("Imported BPMN Diagrams");
  const [bpmnImportBusy, setBpmnImportBusy] = useState(false);
  const [bpmnImportError, setBpmnImportError] = useState("");
  const [showBpmnImportDialog, setShowBpmnImportDialog] = useState(false);
  const [bpmnImportProgress, setBpmnImportProgress] = useState<{ done: number; total: number; current: string }>({ done: 0, total: 0, current: "" });

  const [bpmnDragHover, setBpmnDragHover] = useState(false);

  function openBpmnImportDialog() {
    setBpmnImportFiles([]);
    setBpmnImportSelected(new Set());
    setBpmnImportProjectName("");
    setBpmnImportFolderName("Imported BPMN Diagrams");
    setBpmnImportProgress({ done: 0, total: 0, current: "" });
    setBpmnImportError("");
    setBpmnDragHover(false);
    setShowBpmnImportDialog(true);
  }

  function handleBpmnFolderSelected(allFiles: File[], explicitFolderName?: string) {
    const files = allFiles.filter((f) => /\.bpmn$/i.test(f.name) || /\.xml$/i.test(f.name));
    // Derive folder name from explicit drag-drop name, then webkitRelativePath.
    let folderName = explicitFolderName?.trim() ?? "";
    if (!folderName) {
      const probe = (files[0] ?? allFiles[0]) as (File & { webkitRelativePath?: string }) | undefined;
      const rel = probe?.webkitRelativePath ?? "";
      if (rel) {
        const parts = rel.split("/");
        if (parts.length > 1) folderName = parts[0];
      }
    }
    if (files.length === 0) {
      setBpmnImportFiles([]);
      setBpmnImportSelected(new Set());
      setBpmnImportError(folderName
        ? `"${folderName}" contains no .bpmn or .xml files (scanned ${allFiles.length} file${allFiles.length === 1 ? "" : "s"}).`
        : `No .bpmn or .xml files found (scanned ${allFiles.length} file${allFiles.length === 1 ? "" : "s"}).`);
      return;
    }
    files.sort((a, b) => a.name.localeCompare(b.name));
    setBpmnImportFiles(files);
    setBpmnImportSelected(new Set(files.map((_, i) => i)));
    setBpmnImportProjectName((cur) => cur.trim() || folderName || "Imported BPMN Diagrams");
    setBpmnImportError("");
  }

  // Recursive walk of a dropped folder. Uses the legacy FileSystem API
  // (webkitGetAsEntry / createReader / file) which is the only way to
  // read a dropped folder without the Chrome "Upload N files?" confirm
  // dialog.
  function readDroppedEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (entry.isFile) {
        (entry as FileSystemFileEntry).file((f) => { out.push(f); resolve(); }, reject);
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const readBatch = () => {
          reader.readEntries(async (entries) => {
            if (entries.length === 0) { resolve(); return; }
            try {
              for (const e of entries) await readDroppedEntry(e, out);
              readBatch();
            } catch (err) { reject(err); }
          }, reject);
        };
        readBatch();
      } else {
        resolve();
      }
    });
  }

  async function handleBpmnDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setBpmnDragHover(false);
    const items = e.dataTransfer.items;
    const all: File[] = [];
    let rootName = "";
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const entry = (items[i] as DataTransferItem).webkitGetAsEntry?.();
        if (!entry) continue;
        if (entry.isDirectory && !rootName) rootName = entry.name;
        try { await readDroppedEntry(entry, all); }
        catch (err) { setBpmnImportError(`Failed to read dropped folder: ${err instanceof Error ? err.message : String(err)}`); return; }
      }
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) all.push(e.dataTransfer.files[i]);
    }
    if (all.length === 0) { setBpmnImportError("No files were dropped."); return; }
    handleBpmnFolderSelected(all, rootName);
  }

  async function handleBpmnImportConfirm() {
    if (bpmnImportFiles.length === 0) { setBpmnImportError("No files selected"); return; }
    if (bpmnImportSelected.size === 0) { setBpmnImportError("Select at least one file"); return; }
    if (!bpmnImportProjectName.trim()) { setBpmnImportError("Project name is required"); return; }
    setBpmnImportBusy(true);
    setBpmnImportError("");
    setBpmnImportProgress({ done: 0, total: bpmnImportSelected.size, current: "" });
    try {
      // Step 1: create the project.
      const projResp = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: bpmnImportProjectName.trim() }),
      });
      if (!projResp.ok) {
        const txt = await projResp.text();
        setBpmnImportError(`Project creation failed: ${txt || projResp.statusText}`);
        return;
      }
      const project = (await projResp.json()) as { id: string; name: string };

      // Step 2: import each selected .bpmn file into the project.
      const selectedIdxs = Array.from(bpmnImportSelected).sort((a, b) => a - b);
      const errors: { file: string; message: string }[] = [];
      let done = 0;
      for (const idx of selectedIdxs) {
        const file = bpmnImportFiles[idx];
        setBpmnImportProgress({ done, total: selectedIdxs.length, current: file.name });
        const stem = file.name.replace(/\.bpmn$/i, "").replace(/\.xml$/i, "");
        const form = new FormData();
        form.append("file", file);
        form.append("projectId", project.id);
        form.append("name", stem);
        form.append("folderName", bpmnImportFolderName.trim());
        try {
          const resp = await fetch("/api/import/bpmn", { method: "POST", body: form });
          if (!resp.ok) {
            const txt = await resp.text();
            errors.push({ file: file.name, message: txt || resp.statusText });
          }
        } catch (err) {
          errors.push({ file: file.name, message: err instanceof Error ? err.message : String(err) });
        }
        done += 1;
        setBpmnImportProgress({ done, total: selectedIdxs.length, current: file.name });
      }

      setShowBpmnImportDialog(false);
      if (errors.length > 0 && errors.length === selectedIdxs.length) {
        alert(`All files failed to import:\n` + errors.map((e) => `[${e.file}] ${e.message}`).join("\n"));
      } else if (errors.length > 0) {
        alert(`${selectedIdxs.length - errors.length} of ${selectedIdxs.length} imported. Failures:\n` + errors.map((e) => `[${e.file}] ${e.message}`).join("\n"));
      }
      router.push(`/dashboard/projects/${project.id}`);
    } catch (err) {
      setBpmnImportError(`BPMN bulk import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBpmnImportBusy(false);
    }
  }

  async function handleVisioImportConfirm() {
    if (!visioImportFile) { setVisioImportError("No file selected"); return; }
    if (visioImportSelected.size === 0) { setVisioImportError("Select at least one page"); return; }
    if (!visioImportProjectName.trim()) { setVisioImportError("Project name is required"); return; }
    setVisioImportBusy(true);
    setVisioImportError("");
    try {
      const indices = Array.from(visioImportSelected).sort((a, b) => a - b).join(",");
      const form = new FormData();
      form.append("file", visioImportFile);
      form.append("pageIndices", indices);
      form.append("folderName", visioImportFolderName.trim());
      form.append("newProjectName", visioImportProjectName.trim());
      const resp = await fetch("/api/import/visio-v3/bulk", { method: "POST", body: form });
      if (!resp.ok) {
        const txt = await resp.text();
        setVisioImportError(`Import failed: ${txt || resp.statusText}`);
        return;
      }
      type BulkResult = {
        project?: { id: string; name: string };
        diagrams: { diagram: { id: string }; pageName: string }[];
        errors: { pageIndex: number; pageName: string; message: string }[];
      };
      const result = (await resp.json()) as BulkResult;
      setShowVisioImportDialog(false);
      if (result.project) {
        router.push(`/dashboard/projects/${result.project.id}`);
      } else if (result.errors.length > 0) {
        alert(`All pages failed:\n` + result.errors.map((e) => `[${e.pageName}] ${e.message}`).join("\n"));
      }
    } catch (err) {
      setVisioImportError(`Visio import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setVisioImportBusy(false);
    }
  }

  // DDL Import
  const [showDdlImport, setShowDdlImport] = useState(false);
  const [ddlDbType, setDdlDbType] = useState("postgres");
  const [ddlProjectName, setDdlProjectName] = useState("");
  const [ddlDiagramName, setDdlDiagramName] = useState("");
  const [ddlFile, setDdlFile] = useState<File | null>(null);
  const [ddlImporting, setDdlImporting] = useState(false);
  const [ddlLog, setDdlLog] = useState<string[]>([]);
  const [ddlResult, setDdlResult] = useState<"success" | "failed" | null>(null);
  const ddlFileInputRef = useRef<HTMLInputElement>(null);

  // Initial Zoom settings (stored in localStorage; read by Canvas.tsx on mount).
  // Default is 70% if the user hasn't overridden it.
  const INITIAL_ZOOM_DEFAULT_PCT = 70;
  const [showInitialZoom, setShowInitialZoom] = useState(false);
  const [initialZoomInput, setInitialZoomInput] = useState<string>(() => {
    if (typeof window === "undefined") return String(INITIAL_ZOOM_DEFAULT_PCT);
    const stored = window.localStorage.getItem("initialZoom");
    if (!stored) return String(INITIAL_ZOOM_DEFAULT_PCT);
    const n = parseFloat(stored);
    return Number.isFinite(n) && n > 0 ? String(Math.round(n * 100)) : String(INITIAL_ZOOM_DEFAULT_PCT);
  });

  function handleInitialZoomSave() {
    const n = parseFloat(initialZoomInput);
    if (!Number.isFinite(n) || n <= 0) {
      // Blank/invalid → revert to default (clear override so 70% takes effect).
      window.localStorage.removeItem("initialZoom");
      setInitialZoomInput(String(INITIAL_ZOOM_DEFAULT_PCT));
    } else {
      window.localStorage.setItem("initialZoom", String(Math.max(0.1, Math.min(5, n / 100))));
    }
    setShowInitialZoom(false);
  }

  // Edit Zoom — the fraction of screen width the element occupies in
  // focus-edit zoom (canvas snap when a label is being edited).
  // Stored as a fraction (0.20 = 20%) so Canvas.tsx can multiply
  // directly. Default 20%. A separate Active flag (localStorage
  // "editZoomActive" — "true"/"false", default true) lets the user
  // disable the snap entirely without losing their chosen percentage.
  const EDIT_ZOOM_DEFAULT_PCT = 20;
  const [showEditZoom, setShowEditZoom] = useState(false);
  const [editZoomInput, setEditZoomInput] = useState<string>(() => {
    if (typeof window === "undefined") return String(EDIT_ZOOM_DEFAULT_PCT);
    const stored = window.localStorage.getItem("editZoomFraction");
    if (!stored) return String(EDIT_ZOOM_DEFAULT_PCT);
    const n = parseFloat(stored);
    return Number.isFinite(n) && n > 0 ? String(Math.round(n * 100)) : String(EDIT_ZOOM_DEFAULT_PCT);
  });
  // Edit Zoom Active defaults to true on every load. Per user spec the
  // checkbox should always start checked when the dialog opens; the
  // previous localStorage-backed persistence meant users who had ever
  // disabled the snap stayed opted-out forever. The Save handler
  // (handleEditZoomSave) still writes the current state to
  // localStorage, but we no longer read it back here — so any cached
  // "false" from before this release is ignored, and every page load
  // starts the user with edit-zoom active again.
  const [editZoomActive, setEditZoomActive] = useState<boolean>(true);

  function handleEditZoomSave() {
    const n = parseFloat(editZoomInput);
    if (!Number.isFinite(n) || n <= 0) {
      window.localStorage.removeItem("editZoomFraction");
      setEditZoomInput(String(EDIT_ZOOM_DEFAULT_PCT));
    } else {
      // Clamp 5%..95% so the snap stays meaningful (too small → no zoom,
      // too large → element overflows the viewport).
      window.localStorage.setItem(
        "editZoomFraction",
        String(Math.max(0.05, Math.min(0.95, n / 100))),
      );
    }
    // Persist the Active flag separately so the user keeps their
    // chosen percentage when they toggle off + back on.
    window.localStorage.setItem("editZoomActive", String(editZoomActive));
    setShowEditZoom(false);
  }

  // Matrix screensaver config — idle seconds before the green katakana rain
  // takes over. The on/off switch is the floating green "M" in the bottom-
  // right corner; this dialog just lets the user set the timeout.
  const MATRIX_IDLE_DEFAULT = 30;
  const [showMatrixConfig, setShowMatrixConfig] = useState(false);
  const [matrixIdleInput, setMatrixIdleInput] = useState<string>(() => {
    if (typeof window === "undefined") return String(MATRIX_IDLE_DEFAULT);
    const stored = window.localStorage.getItem("diagramatix.matrix.idleSeconds");
    const n = parseInt(stored ?? "", 10);
    return Number.isFinite(n) && n > 0 ? String(n) : String(MATRIX_IDLE_DEFAULT);
  });
  function handleMatrixConfigSave() {
    const n = parseInt(matrixIdleInput, 10);
    const seconds = Number.isFinite(n) && n > 0 ? Math.min(3600, n) : MATRIX_IDLE_DEFAULT;
    window.localStorage.setItem("diagramatix.matrix.idleSeconds", String(seconds));
    window.dispatchEvent(new Event("diagramatix.matrix.config-changed"));
    setMatrixIdleInput(String(seconds));
    setShowMatrixConfig(false);
  }

  // Account modal
  const [showAccount, setShowAccount] = useState(false);
  const [acctName, setAcctName] = useState(userName);
  const [acctEmail, setAcctEmail] = useState(userEmail ?? "");
  const [acctOrgName, setAcctOrgName] = useState(orgName ?? "");
  const [acctCurPwd, setAcctCurPwd] = useState("");
  const [acctNewPwd, setAcctNewPwd] = useState("");
  const [acctConfirmPwd, setAcctConfirmPwd] = useState("");
  const [acctShowCurPwd, setAcctShowCurPwd] = useState(false);
  const [acctShowNewPwd, setAcctShowNewPwd] = useState(false);
  const [acctShowConfirmPwd, setAcctShowConfirmPwd] = useState(false);
  const [acctSaving, setAcctSaving] = useState(false);
  const [acctMsg, setAcctMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleAccountSave() {
    setAcctSaving(true);
    setAcctMsg(null);
    try {
      const body: Record<string, string> = {};
      body.name = acctName;
      body.email = acctEmail;
      body.orgName = acctOrgName;
      if (acctNewPwd) {
        if (acctNewPwd !== acctConfirmPwd) {
          setAcctMsg({ text: "New passwords do not match", ok: false });
          setAcctSaving(false);
          return;
        }
        body.currentPassword = acctCurPwd;
        body.newPassword = acctNewPwd;
      }
      const res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        setAcctMsg({ text: err.error ?? "Failed to save", ok: false });
      } else {
        setShowAccount(false);
        setAcctMsg(null);
        // Refresh to pick up new name/email/org in session
        window.location.reload();
      }
    } catch (err) {
      setAcctMsg({ text: err instanceof Error ? err.message : "Failed", ok: false });
    } finally {
      setAcctSaving(false);
    }
  }

  // Backup / Restore
  const [backingUp, setBackingUp] = useState(false);
  const [backupModal, setBackupModal] = useState<{ url: string; title: string; previewUrl?: string } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreLog, setRestoreLog] = useState<string[]>([]);
  const [restoreResult, setRestoreResult] = useState<"success" | "failed" | null>(null);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);

  // Close File menu on outside click
  useEffect(() => {
    if (!fileMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setFileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [fileMenuOpen]);

  function handleBackupDownload() {
    // Live progress + report via the streaming endpoint (the modal reads
    // NDJSON, shows each section, then downloads + reports).
    setBackingUp(true);
    setBackupModal({ url: "/api/backup?stream=1", previewUrl: "/api/backup?preview=1", title: "Back up your data" });
  }

  async function handleDdlImport() {
    if (!ddlFile || !ddlProjectName.trim()) return;
    setDdlImporting(true);
    setDdlLog([]);
    setDdlResult(null);
    const log = (msg: string) => setDdlLog(prev => [...prev, msg]);

    try {
      const text = await ddlFile.text();
      log(`\u2714 Read ${ddlFile.name} (${(text.length / 1024).toFixed(1)} KB)`);

      const { parseDDL, generateDiagramFromDDL } = await import("@/app/lib/diagram/ddlImport");
      const parsed = parseDDL(text);
      const entityCount = parsed.filter(t => !t.isEnum).length;
      const enumCount = parsed.filter(t => t.isEnum).length;
      log(`\u2714 Parsed ${parsed.length} tables (${entityCount} entities, ${enumCount} enumerations)`);

      if (parsed.length === 0) {
        log("\u2718 No CREATE TABLE statements found");
        setDdlResult("failed");
        return;
      }

      // Create project
      const projRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: ddlProjectName.trim() }),
      });
      if (!projRes.ok) {
        log(`\u2718 Failed to create project: ${projRes.status}`);
        setDdlResult("failed");
        return;
      }
      const proj = await projRes.json();
      log(`\u2714 Created project "${ddlProjectName.trim()}"`);

      // Generate diagram data
      const diagramData = generateDiagramFromDDL(parsed, ddlDbType);
      const diagName = ddlDiagramName.trim() || `${ddlProjectName.trim()} Schema`;

      // Create diagram
      const diagRes = await fetch("/api/diagrams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: diagName,
          type: "domain",
          projectId: proj.id,
          data: diagramData,
        }),
      });
      if (!diagRes.ok) {
        log(`\u2718 Failed to create diagram: ${diagRes.status}`);
        setDdlResult("failed");
        return;
      }
      log(`\u2714 Created diagram "${diagName}" with ${diagramData.elements.length} elements, ${diagramData.connectors.length} connectors`);
      setDdlResult("success");
      reloadDashboardContent();
    } catch (err) {
      log(`\u2718 Error: ${err instanceof Error ? err.message : String(err)}`);
      setDdlResult("failed");
    } finally {
      setDdlImporting(false);
    }
  }

  async function handleRestoreFile(file: File) {
    setRestoring(true);
    setRestoreLog([]);
    setRestoreResult(null);
    const log = (msg: string) => setRestoreLog(prev => [...prev, msg]);
    log(`Reading ${file.name}\u2026`);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch("/api/backup", { method: "POST", body: form });
      const json = (await resp.json()) as
        | { ok: true; result: { projectsRestored: number; diagramsRestored: number; unfiledDiagramsRestored: number; templatesRestored: number; log: string[] } }
        | { error: string };
      if (!resp.ok || "error" in json) {
        log(`\u2718 Restore failed: ${"error" in json ? json.error : resp.statusText}`);
        setRestoreResult("failed");
        return;
      }
      for (const line of json.result.log) log(line);
      log("");
      log(`\u2714 ${json.result.projectsRestored} project(s) restored`);
      log(`\u2714 ${json.result.diagramsRestored} diagram(s) in projects`);
      log(`\u2714 ${json.result.unfiledDiagramsRestored} unfiled diagram(s)`);
      log(`\u2714 ${json.result.templatesRestored} user template(s)`);
      setRestoreResult("success");
      // Refresh local state so the restored projects/diagrams appear immediately
      await reloadDashboardContent();
    } catch (err) {
      log(`\u2718 Restore failed: ${err instanceof Error ? err.message : String(err)}`);
      setRestoreResult("failed");
    } finally {
      setRestoring(false);
    }
  }

  function checkSchemaCompatibility(fileSchema: string): { ok: boolean; message?: string } {
    const [appMajor, appMinor] = SCHEMA_VERSION.split(".").map(Number);
    const [fileMajor, fileMinor] = fileSchema.split(".").map(Number);
    if (fileMajor > appMajor) {
      return { ok: false, message: `This file uses schema version ${fileSchema} which is incompatible with this version of Diagramatix (schema ${SCHEMA_VERSION}). Please upgrade Diagramatix to import this file.` };
    }
    if (fileMajor === appMajor && fileMinor > appMinor) {
      return { ok: false, message: `This file uses schema version ${fileSchema} which is newer than this version of Diagramatix supports (schema ${SCHEMA_VERSION}). Please upgrade Diagramatix to import this file.` };
    }
    if (fileMajor < appMajor) {
      return { ok: true, message: `This file uses an older schema version (${fileSchema}). It will be upgraded to the current format (${SCHEMA_VERSION}).` };
    }
    return { ok: true };
  }

  async function handleFileSelected(file: File) {
    const text = await file.text();
    let data: Record<string, unknown> | null = null;

    // Decide format by file extension first, then fall back to content sniff
    const lowerName = file.name.toLowerCase();
    const looksXml = lowerName.endsWith(".xml") || /^\s*<\?xml/.test(text);

    if (looksXml) {
      try {
        const { parseDiagramatixXml } = await import("@/app/lib/diagram/xmlExport");
        data = parseDiagramatixXml(text);
      } catch (err) {
        alert(`Invalid Diagramatix XML file: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    } else {
      try {
        data = JSON.parse(text);
      } catch {
        alert("Invalid JSON file");
        return;
      }
    }

    if (!data) return;
    // Support both old "version" field and new "schemaVersion" field
    const schemaVer: string = (data.schemaVersion as string) ?? (data.version as string) ?? "";
    if (!schemaVer || !data.project || !data.diagrams) {
      alert("Invalid export file — missing required fields");
      return;
    }
    // Parse schema version (strip build number if present in legacy "version" field, e.g. "1.0.147" → "1.0")
    const parts = schemaVer.split(".");
    const normalised = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : schemaVer;
    const compat = checkSchemaCompatibility(normalised);
    if (!compat.ok) {
      alert(compat.message);
      return;
    }
    if (compat.message) {
      // Non-blocking warning for older schemas
      alert(compat.message);
    }
    setPendingImportData(data);
    setImportProjectName(((data.project as Record<string, unknown>).name as string ?? "Imported") + " (imported)");
    setShowImportNameDialog(true);
  }

  async function handleImportProject() {
    if (!pendingImportData || !importProjectName.trim()) return;
    setShowImportNameDialog(false);
    setImporting(true);
    setImportLog([]);
    setImportResult(null);
    setImportedProjectId(null);
    const exportData = pendingImportData as Record<string, unknown>;
    const importName = importProjectName.trim();
    const log = (msg: string) => setImportLog(prev => [...prev, msg]);

    try {
      const proj = exportData.project as Record<string, unknown>;
      const diags = exportData.diagrams as Record<string, unknown>[];
      const fileSchemaVer = (exportData.schemaVersion ?? exportData.version ?? "?") as string;
      const fileAppVer = (exportData.appVersion ?? "") as string;
      log(`\u2714 Valid export file (schema ${fileSchemaVer}${fileAppVer ? `, app ${fileAppVer}` : ""})`);
      log(`   Original project: "${proj.name as string}"`);
      log(`   Diagrams: ${diags.length}`);
      if (exportData.exportedAt) log(`   Exported: ${new Date(exportData.exportedAt as string).toLocaleString()}`);

      log(`Creating project "${importName}"...`);
      const projRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: importName,
          description: (proj.description as string) ?? "",
          ownerName: (proj.ownerName as string) ?? "",
        }),
      });
      if (!projRes.ok) {
        log("\u2718 Failed to create project");
        setImportResult("failed"); return;
      }
      const newProject = await projRes.json();
      log(`\u2714 Project "${importName}" created`);

      const projColorConfig = proj.colorConfig as Record<string, unknown> | undefined;
      if (projColorConfig && Object.keys(projColorConfig).length > 0) {
        log("Importing project colour settings...");
        await fetch(`/api/projects/${newProject.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ colorConfig: projColorConfig }),
        });
        log("\u2714 Colour settings imported");
      }

      log(`Importing ${diags.length} diagram(s)...`);
      const idMap = new Map<string, string>();
      let successCount = 0;
      for (let i = 0; i < diags.length; i++) {
        const diag = diags[i] as Record<string, unknown>;
        log(`  Importing diagram ${i + 1}/${diags.length}: "${diag.name as string}" (${(diag.type as string) ?? "context"})`);
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
          const newDiag = await dRes.json();
          idMap.set(diag.originalId as string, newDiag.id);
          successCount++;
          log(`  \u2714 Diagram "${diag.name as string}" imported`);
        } else {
          log(`  \u2718 Failed to import diagram "${diag.name as string}"`);
        }
      }

      if (exportData.folderTree) {
        log("Importing folder structure...");
        const ft = exportData.folderTree as Record<string, unknown>;
        const remappedMap: Record<string, string> = {};
        for (const [oldId, folderId] of Object.entries((ft.diagramFolderMap as Record<string,string>) ?? {})) {
          const newId = idMap.get(oldId);
          if (newId) remappedMap[newId] = folderId as string;
        }
        const remappedOrder: Record<string, string[]> = {};
        for (const [folderId, ids] of Object.entries((ft.diagramOrder as Record<string,string[]>) ?? {})) {
          remappedOrder[folderId] = (ids as string[]).map(id => idMap.get(id) ?? id);
        }
        const remappedTree = {
          folders: (ft.folders as unknown[]) ?? [],
          diagramFolderMap: remappedMap,
          diagramOrder: remappedOrder,
          folderOrder: (ft.folderOrder as Record<string,string[]>) ?? {},
        };
        await fetch(`/api/projects/${newProject.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderTree: remappedTree }),
        });
        const folderCount = ((ft.folders as unknown[]) ?? []).length;
        log(`\u2714 ${folderCount} folder(s) imported`);
      }

      log("");
      log(`\u2714 Import complete! ${successCount}/${diags.length} diagram(s) imported successfully.`);
      setImportResult("success");
      setImportedProjectId(newProject.id);
      // Add imported project to dashboard list
      setProjects(prev => [{
        ...newProject,
        _count: { diagrams: successCount },
      }, ...prev]);
      setPendingImportData(null);
    } catch (err) {
      console.error("Import failed:", err);
      log(`\u2718 Import failed: ${err instanceof Error ? err.message : String(err)}`);
      setImportResult("failed");
      setPendingImportData(null);
    }
  }

  async function handleCreateProject() {
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newProjectName.trim() }),
    });
    setCreatingProject(false);
    if (!res.ok) return;
    const project = await res.json();
    setProjects((prev) => [{ ...project, _count: { diagrams: 0 } }, ...prev]);
    setNewProjectName("");
    setShowNewProject(false);
    // G02: drop the user straight into the new project rather than
    // making them hunt for it in the list.
    router.push(`/dashboard/projects/${project.id}`);
  }

  async function handleCloneProject(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const res = await fetch(`/api/projects/${id}/clone`, { method: "POST" });
    if (!res.ok) return;
    const project = await res.json();
    setProjects((prev) => [{ ...project, _count: { diagrams: prev.find((p) => p.id === id)?._count.diagrams ?? 0 } }, ...prev]);
  }

  function handleDeleteProject(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const proj = projects.find(p => p.id === id);
    setConfirmDialog({
      title: "Delete Project",
      message: `Are you sure you want to delete "${proj?.name ?? "this project"}"? Its diagrams will be moved to the Sandpit.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        // Fetch the project's diagrams before deleting so we can add them to unorganised
        const projRes = await fetch(`/api/projects/${id}`);
        const projData = projRes.ok ? await projRes.json() : null;
        const orphanedDiagrams = (projData?.diagrams ?? []) as DiagramSummary[];

        const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
        if (!res.ok) return;
        setProjects((prev) => prev.filter((p) => p.id !== id));
        if (selectedProjectId === id) setSelectedProjectId(null);
        // Add orphaned diagrams to unorganised list
        if (orphanedDiagrams.length > 0) {
          setUnorganized((prev) => [...orphanedDiagrams, ...prev]);
        }
      },
    });
  }

  /** Admin-only PERMANENT hard delete. Skips the archive entirely —
   *  diagrams are gone forever, not recoverable from
   *  /dashboard/deleted-diagrams. Two-step confirmation, both steps
   *  show project name + diagram count. Server-side this hits
   *  DELETE /api/projects/[id]?hardDelete=true which independently
   *  re-checks the Owner/Admin role. */
  function handleHardDeleteProject(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!canHardDelete) return;
    const proj = projects.find(p => p.id === id);
    const projectName = proj?.name ?? "this project";
    const count = proj?._count?.diagrams ?? 0;
    const diagWord = count === 1 ? "diagram" : "diagrams";

    // Step 1 of 2 — initial confirmation.
    setConfirmDialog({
      title: "Permanently Delete Project (Admin)",
      message:
        `Project: "${projectName}"\n` +
        `Diagrams to be deleted: ${count} ${diagWord}\n\n` +
        `This will PERMANENTLY delete the project and every diagram inside it. ` +
        `Diagrams are NOT moved to the archive and cannot be recovered.\n\n` +
        `This is step 1 of 2. You will be asked to confirm once more.`,
      onConfirm: () => {
        // Step 2 of 2 — final confirmation, repeats the name + count so
        // the admin can verify before the irreversible action runs.
        setConfirmDialog({
          title: "FINAL CONFIRMATION — Permanent Delete",
          message:
            `Project: "${projectName}"\n` +
            `Diagrams to be deleted: ${count} ${diagWord}\n\n` +
            `There is NO undo. There is NO archive. ` +
            `Pressing the button below permanently deletes "${projectName}" and all ${count} ${diagWord} inside it.`,
          onConfirm: async () => {
            setConfirmDialog(null);
            const res = await fetch(`/api/projects/${id}?hardDelete=true`, { method: "DELETE" });
            if (!res.ok) {
              const txt = await res.text();
              setConfirmDialog({
                title: "Hard delete failed",
                message: `The server refused the request: ${txt || res.statusText}`,
                onConfirm: () => setConfirmDialog(null),
              });
              return;
            }
            setProjects((prev) => prev.filter((p) => p.id !== id));
            if (selectedProjectId === id) setSelectedProjectId(null);
            // No diagrams come back to Unorganised — they're gone.
          },
        });
      },
    });
  }

  /** "Delete project AND every diagram in it." Diagrams move to the
   *  system archive (recoverable from /dashboard/deleted-diagrams) and
   *  the project itself is then deleted. Server cascades both via
   *  `DELETE /api/projects/[id]?cascade=archive`. */
  function handleDeleteProjectCascade(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const proj = projects.find(p => p.id === id);
    const count = proj?._count?.diagrams ?? 0;
    setConfirmDialog({
      title: "Delete Project and All Diagrams",
      message: `Are you sure you want to delete "${proj?.name ?? "this project"}" AND all ${count} diagram${count === 1 ? "" : "s"} inside it? Diagrams will be moved to the archive (recoverable from Deleted Diagrams).`,
      onConfirm: async () => {
        setConfirmDialog(null);
        const res = await fetch(`/api/projects/${id}?cascade=archive`, { method: "DELETE" });
        if (!res.ok) return;
        setProjects((prev) => prev.filter((p) => p.id !== id));
        if (selectedProjectId === id) setSelectedProjectId(null);
        // Diagrams went to the archive — they don't reappear in Unorganised.
      },
    });
  }

  async function handleCreateDiagram() {
    if (!newName.trim()) { setError("Please enter a name"); return; }
    setCreating(true);
    setError("");
    const res = await fetch("/api/diagrams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), type: newType }),
    });
    setCreating(false);
    if (!res.ok) { setError("Failed to create diagram"); return; }
    const diagram = await res.json();
    router.push(`/diagram/${diagram.id}`);
  }

  function handleDeleteDiagram(id: string) {
    const diag = unorganized.find(d => d.id === id);
    setConfirmDialog({
      title: "Delete Diagram",
      message: `Are you sure you want to delete "${diag?.name ?? "this diagram"}"? It will be moved to the system archive.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        await fetch(`/api/diagrams/${id}/archive`, { method: "POST" });
        setUnorganized((prev) => prev.filter((d) => d.id !== id));
      },
    });
  }

  async function handleMoveDiagram(diagramId: string, targetProjectId: string | null) {
    if (targetProjectId === null) return;

    // Check for name clash — fetch existing diagram names in target project
    const diagram = unorganized.find(d => d.id === diagramId);
    if (!diagram) return;
    let newName = diagram.name;
    try {
      const projRes = await fetch(`/api/projects/${targetProjectId}`);
      if (projRes.ok) {
        const projData = await projRes.json();
        const existingNames = new Set(
          ((projData.diagrams ?? []) as { name: string }[]).map(d => d.name)
        );
        if (existingNames.has(newName)) {
          let suffix = 2;
          while (existingNames.has(`${diagram.name} (${suffix})`)) suffix++;
          newName = `${diagram.name} (${suffix})`;
        }
      }
    } catch {}

    const updates: Record<string, unknown> = { projectId: targetProjectId };
    if (newName !== diagram.name) updates.name = newName;

    const res = await fetch(`/api/diagrams/${diagramId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) return;
    // Remove from unorganised
    setUnorganized((prev) => prev.filter((d) => d.id !== diagramId));
    // Update project count
    setProjects((prev) => prev.map((p) => p.id === targetProjectId ? { ...p, _count: { diagrams: p._count.diagrams + 1 } } : p));
  }

  // Banner shows whenever an admin is impersonating — both view and edit
  // modes — so the admin always has a "Return to my account" button on
  // screen, not only when read-only.
  const isImpersonating = !!impersonationMode;

  return (
    <div className={`h-screen flex flex-col overflow-hidden ${isImpersonating ? "bg-orange-50" : "dgx-dashboard-bg"}`}>
      {isImpersonating && viewingAsName !== undefined && viewingAsEmail !== undefined && (
        <ImpersonationBanner viewingAsName={viewingAsName ?? ""} viewingAsEmail={viewingAsEmail ?? ""} mode={impersonationMode} />
      )}
      {/* Header — fixed top panel; everything below scrolls. */}
      <header className={`shrink-0 ${isImpersonating ? "bg-orange-50" : "bg-white"} border-b border-gray-200 px-6 py-4 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          {/* Brand wordmark (public/logos/diagramatix-logo.svg, 500x120 viewBox).
              Replaces the previous icon + "Diagramatix" span pair so the
              dashboard header carries the full logo treatment. h-8 keeps
              it in line with the existing py-4 header height. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logos/diagramatix-logo.svg"
            alt="Diagramatix"
            className="h-8 w-auto"
          />
          {version ? <span className="text-xs text-gray-400 ml-1">v{SCHEMA_VERSION}.{version}</span> : null}
          {usageSnapshot && (
            <button
              onClick={() => setShowUsagePopover(true)}
              className={`inline-flex items-center gap-2 text-sm font-medium border rounded-md px-3 py-1.5 ml-3 transition-colors ${
                usageSnapshot.isAdmin
                  ? "text-orange-700 border-orange-300 bg-orange-50 hover:bg-orange-100"
                  : usageSnapshot.trial.expired
                  ? "text-red-700 border-red-300 bg-red-50 hover:bg-red-100"
                  : "text-blue-700 border-blue-300 bg-blue-50 hover:bg-blue-100"
              }`}
              title={
                usageSnapshot.isAdmin
                  ? "SuperAdmin — bypasses all limits. Click for usage details."
                  : usageSnapshot.trial.expired
                  ? "Trial expired — click for details and upgrade"
                  : "View subscription usage and limits"
              }
            >
              <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x={2} y={3} width={12} height={10} rx={2} />
                <path d="M2 7h12" />
                <path d="M5 11h3" />
              </svg>
              <span>Subscription:</span>
              {usageSnapshot.underlyingTier && (
                <>
                  <span className="text-xs opacity-70 line-through">{usageSnapshot.underlyingTier.name}</span>
                  <span className="text-xs opacity-70">→</span>
                </>
              )}
              <strong className="font-semibold">{usageSnapshot.tier.name}</strong>
              {usageSnapshot.comp && (
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-purple-200 text-purple-800 font-medium">
                  comp · {Math.max(0, Math.ceil((new Date(usageSnapshot.comp.expiresAt).getTime() - Date.now()) / 86400000))}d
                </span>
              )}
              {usageSnapshot.trial.daysRemaining !== null && !usageSnapshot.isAdmin && !usageSnapshot.trial.expired && !usageSnapshot.comp && (
                <span className="text-xs opacity-80">• {usageSnapshot.trial.daysRemaining}d left</span>
              )}
              {usageSnapshot.trial.expired && !usageSnapshot.isAdmin && !usageSnapshot.comp && (
                <span className="text-xs font-semibold">• expired</span>
              )}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!readOnly && (
            <>
              {/* Hidden file inputs reused by the File menu */}
              <input
                ref={fileInputRef}
                type="file"
                accept={importFormat === "xml" ? ".xml" : ".json"}
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); e.target.value = ""; }}
              />
              <input
                ref={restoreFileInputRef}
                type="file"
                accept=".diag"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleRestoreFile(f);
                  e.target.value = "";
                }}
              />
              <input
                ref={visioInputRef}
                type="file"
                accept=".vsdx"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) handleVisioFileSelected(f);
                }}
              />
              <input
                ref={bpmnFolderInputRef}
                type="file"
                multiple
                accept=".bpmn,.xml"
                className="hidden"
                onChange={e => {
                  const fl = e.target.files;
                  const arr: File[] = fl ? Array.from(fl) : [];
                  e.target.value = "";
                  if (arr.length > 0) handleBpmnFolderSelected(arr);
                }}
              />

              {/* SuperAdmin shortcut — leftmost item in the header menu
                  cluster, SuperAdmin-only. Same destination as the entry
                  that used to live inside the System menu (now removed). */}
              {isSu && (
                <a
                  href="/dashboard/admin?from=/dashboard"
                  className="text-xs text-red-700 hover:text-red-800 font-medium border border-red-300 rounded px-2 py-1 hover:bg-red-50"
                  title="Open the SuperAdmin dashboard"
                >
                  SuperAdmin
                </a>
              )}

              {/* Org-level shortcuts — visible to OrgOwner / OrgAdmin
                  only. SuperAdmins reach the same pages via the
                  SuperAdmin chip above, so we don't render a second
                  copy for them. Orange styling matches the SuperAdmin
                  chip pattern — both are elevated roles and should
                  read as such across the app. */}
              {!isSu && (orgRole === "Owner" || orgRole === "Admin") && (
                <a
                  href="/dashboard/org-admin"
                  className="text-xs text-orange-600 hover:text-orange-800 font-medium border border-orange-300 rounded px-2 py-1"
                  title="OrgAdmin menu — Registered Users, Org Settings, Project Sharing"
                >
                  OrgAdmin
                </a>
              )}

              {/* Collaboration Groups — opens the Groups dashboard page */}
              <button
                onClick={() => router.push("/dashboard/groups")}
                className="text-xs font-medium rounded px-2 py-1 border text-gray-600 border-gray-300 hover:bg-gray-50"
                title="Manage Collaboration Groups"
              >
                Groups
              </button>

              {/* In-app notifications — opens the panel as a modal over
                  the dashboard (dashboard shows behind, shaded). */}
              <NotificationsBell onOpen={() => setShowNotifications(true)} />

              {/* Unified File menu */}
              <div className="relative" ref={fileMenuRef}>
                <button
                  onClick={() => setFileMenuOpen(prev => !prev)}
                  disabled={importing || backingUp || restoring}
                  className={`text-xs font-medium rounded px-2 py-1 border ${
                    importing || backingUp || restoring
                      ? "bg-blue-600 text-white border-blue-600"
                      : "text-gray-600 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {importing
                    ? "Importing\u2026"
                    : backingUp
                      ? "Backing up\u2026"
                      : restoring
                        ? "Restoring\u2026"
                        : "System \u25BE"}
                </button>
                {fileMenuOpen && !(importing || backingUp || restoring) && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded shadow-lg z-50">
                    {/* Import ▸ — all import sources, grouped Local / SharePoint */}
                    <div className="relative">
                      <button
                        onClick={() => { const nx = !impOpen; setImpOpen(nx); setImpDest(nx && !hasMicrosoft ? "local" : null); }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-xs ${impOpen ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                      >
                        <span>Import</span><span className="text-gray-400">▸</span>
                      </button>
                      {impOpen && (
                        <div className="absolute bg-white border border-gray-200 rounded shadow-lg py-1 z-[10001]" style={{ top: "100%", left: -100, minWidth: 150 }}>
                          {(["local", "sharepoint"] as const).map((dest) => {
                            const disabled = dest === "sharepoint" && !hasMicrosoft;
                            return (
                              <div key={dest} className="relative">
                                <button
                                  disabled={disabled}
                                  onClick={() => { if (!disabled) setImpDest(impDest === dest ? null : dest); }}
                                  className={`flex w-full items-center justify-between px-3 py-2 text-xs ${disabled ? "text-gray-300 cursor-not-allowed" : impDest === dest ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                                  title={disabled ? "Sign in with Microsoft to enable SharePoint" : ""}
                                >
                                  <span>{dest === "local" ? "Local" : "SharePoint"}</span>
                                  <span className={disabled ? "text-gray-300" : "text-gray-400"}>▸</span>
                                </button>
                                {impDest === dest && !disabled && (
                                  <div className="absolute bg-white border border-gray-200 rounded shadow-lg py-1 z-[10001]" style={{ top: "100%", left: -100, minWidth: 150 }}>
                                    {dest === "local" ? (
                                      <>
                                        <button onClick={() => { closeSys(); setImportFormat("json"); if (fileInputRef.current) { fileInputRef.current.accept = ".json"; fileInputRef.current.click(); } }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">JSON</button>
                                        <button onClick={() => { closeSys(); setVisioImportError(""); visioInputRef.current?.click(); }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50" title="Import one or more pages from a Visio .vsdx file into a new project">Visio</button>
                                        <button onClick={() => { closeSys(); openBpmnImportDialog(); }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50" title="Pick a folder of .bpmn files; each file becomes one diagram in a new project">BPMN</button>
                                        <button onClick={() => { closeSys(); setImportFormat("xml"); if (fileInputRef.current) { fileInputRef.current.accept = ".xml"; fileInputRef.current.click(); } }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">XML</button>
                                        {isSu && (
                                          <button onClick={() => { closeSys(); setDdlProjectName(""); setDdlDiagramName(""); setDdlFile(null); setDdlDbType("postgres"); setDdlLog([]); setDdlResult(null); setShowDdlImport(true); }} className="block w-full text-left px-3 py-2 text-xs text-red-700 hover:bg-red-50" title="SuperAdmin — import a SQL DDL file as a Domain diagram">DDL</button>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <button onClick={() => { closeSys(); setSpImportFmt("json"); }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">JSON</button>
                                        <button onClick={() => { closeSys(); setSpImportFmt("visio"); }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">Visio</button>
                                        <button onClick={() => { closeSys(); setSpImportFmt("bpmn"); }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">BPMN</button>
                                        <button onClick={() => { closeSys(); setSpImportFmt("xml"); }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">XML</button>
                                        {isSu && (
                                          <button onClick={() => { closeSys(); setSpImportFmt("ddl"); }} className="block w-full text-left px-3 py-2 text-xs text-red-700 hover:bg-red-50" title="SuperAdmin — import a SQL DDL file from SharePoint">DDL</button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="border-t border-gray-100" />
                    <a
                      href="/dashboard/prompts"
                      onClick={() => setFileMenuOpen(false)}
                      className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      AI Prompt Maintenance
                    </a>
                    <a
                      href="/dashboard/deleted-diagrams"
                      onClick={() => setFileMenuOpen(false)}
                      className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      Deleted Diagrams
                    </a>
                    <div className="border-t border-gray-100" />
                    <button
                      onClick={() => { setFileMenuOpen(false); handleBackupDownload(); }}
                      title="Download a complete backup of all your projects, diagrams and templates"
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      {"Backup\u2026"}
                    </button>
                    <button
                      onClick={() => { setFileMenuOpen(false); restoreFileInputRef.current?.click(); }}
                      title="Restore a Diagramatix backup (.diag) — adds all projects alongside your existing ones"
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      {"Restore\u2026"}
                    </button>
                    <div className="border-t border-gray-100" />
                    {/* Zoom flyout \u2014 hover the parent to reveal a sub-panel
                        with the two specific zoom tunables. Uses Tailwind
                        group-hover so no extra state is needed. */}
                    <div className="relative group">
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center justify-between"
                        title="Adjust zoom defaults: Initial Zoom (open-a-diagram) and Edit Zoom (focus-edit snap)."
                      >
                        <span>{"Zoom"}</span>
                        <span className="text-gray-400">{"\u25b8"}</span>
                      </button>
                      <div className="absolute left-full top-0 hidden group-hover:block bg-white border border-gray-200 rounded shadow-lg min-w-[160px] z-50">
                        <button
                          onClick={() => { setFileMenuOpen(false); setShowInitialZoom(true); }}
                          title="Zoom level used when opening a diagram. Small diagrams centre; large diagrams anchor to top-left."
                          className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          {"Initial Zoom\u2026"}
                        </button>
                        <button
                          onClick={() => { setFileMenuOpen(false); setShowEditZoom(true); }}
                          title="How much of the screen width the edited element occupies when you double-click to edit a label (focus-edit snap)."
                          className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          {"Edit Zoom\u2026"}
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => { setFileMenuOpen(false); setShowMatrixConfig(true); }}
                      title="Set how long the screen must be idle before the Matrix screensaver kicks in (when the green M in the bottom-right is on)."
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      {"Matrix Screensaver\u2026"}
                    </button>
                    {/* Admin moved out of the System menu and into the
                        top-level header bar as the leftmost menu item. */}
                  </div>
                )}
              </div>
            </>
          )}
          <a
            href="/features"
            target="_blank"
            rel="noopener"
            className="text-xs text-gray-500 hover:text-blue-600"
            title="What Diagramatix can do (opens the public Features page in a new tab)"
          >
            Features
          </a>
          <a
            href="/help"
            className="text-xs text-gray-500 hover:text-blue-600"
            title="User Guide"
          >
            User Guide
          </a>
          {orgName && (
            <div
              className="text-xs text-gray-600 border border-gray-200 rounded px-2 py-1 bg-gray-50"
              title="Active organisation"
            >
              {orgName}
            </div>
          )}
          <button
            onClick={() => setShowAccount(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded px-2 py-1 hover:bg-gray-50"
            title="Account settings"
          >
            <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <circle cx={8} cy={5} r={3} />
              <path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" />
            </svg>
            <span>{userName}</span>
            {userEmail && <span className="text-gray-400 font-normal">{userEmail}</span>}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto min-h-0">
       <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Send-for-Review collections (Phase 2) — pinned above projects.
            Renders nothing when the user has no reviews either way. */}
        <ReviewsSection />

        {/* Projects — collapsible, first below Reviews. */}
        <CollapsibleSection
          title="Projects"
          count={projects.length}
          action={!readOnly ? (
            <button
              onClick={() => setShowNewProject(true)}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs font-medium"
            >
              + New Project
            </button>
          ) : undefined}
        >

          {projects.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <p className="text-gray-500 mb-4">{readOnly ? "No projects" : "No projects yet"}</p>
              {!readOnly && (
                <button
                  onClick={() => setShowNewProject(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                >
                  Create your first project
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {projects.map((p) => {
                // Tile state taxonomy \u2014 two distinct shared states, two
                // distinct colour schemes:
                //   \u2022 isSharedToMe \u2014 the caller is a recipient. Pale
                //     amber tile; "by owner" line; no Shared dropdown
                //     (irrelevant to a recipient who isn't sharing it
                //     to anyone else).
                //   \u2022 isSharedOut  \u2014 caller is the owner AND has at
                //     least one ProjectShare row. Purple tile; Shared
                //     dropdown listing the recipients (this is the
                //     owner's affordance for "see who I shared with").
                //   \u2022 neither      \u2014 plain white tile.
                // The split was introduced 2026-06-07 from Paul's
                // testing notes \u2014 earlier purple-for-everything looked
                // wrong on the recipient side and the dropdown made no
                // sense there.
                const role = deriveProjectRole(p);
                const isSharedToMe = role !== "owner";
                const shareCount = p._count.shares ?? 0;
                const isSharedOut = !isSharedToMe && shareCount > 0;
                const ownerLine = isSharedToMe && p.user
                  ? `by ${(p.user.name ?? "").trim() || p.user.email} \u00B7 ${p.user.email}`
                  : "";
                const tileSharedListOpen = tileShareDropdownProjectId === p.id;
                const tileSharedList = shareListByProject[p.id];
                return (
                <div
                  key={p.id}
                  onClick={() => {
                    setSelectedProjectId(p.id);
                    setEditDesc(p.description ?? "");
                    setEditOwner(p.ownerName ?? "");
                  }}
                  onDoubleClick={(e) => { e.preventDefault(); router.push(`/dashboard/projects/${p.id}`); }}
                  onContextMenu={(e) => {
                    if (readOnly) return;
                    e.preventDefault();
                    setSelectedProjectId(p.id);
                    setEditDesc(p.description ?? "");
                    setEditOwner(p.ownerName ?? "");
                    setTileContextMenu({ projectId: p.id, x: e.clientX, y: e.clientY });
                  }}
                  onDragOver={(e) => { if (dragDiagramId) { e.preventDefault(); setDropTargetProjectId(p.id); } }}
                  onDragLeave={() => { if (dropTargetProjectId === p.id) setDropTargetProjectId(null); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragDiagramId) {
                      handleMoveDiagram(dragDiagramId, p.id);
                      setDragDiagramId(null);
                      setDropTargetProjectId(null);
                    }
                  }}
                  className={`relative border rounded px-3 py-2 hover:shadow-sm cursor-pointer group transition-all select-none ${
                    dropTargetProjectId === p.id ? "border-blue-500 ring-2 ring-blue-300 bg-blue-50" :
                    selectedProjectId === p.id
                      ? isSharedToMe
                        ? "bg-amber-50 border-amber-500 ring-1 ring-amber-300"
                        : isSharedOut
                          ? "bg-purple-50 border-purple-500 ring-1 ring-purple-300"
                          : "bg-white border-blue-500 ring-1 ring-blue-300"
                      : isSharedToMe
                        ? "bg-amber-50 border-amber-300 hover:border-amber-400"
                        : isSharedOut
                          ? "bg-purple-50 border-purple-300 hover:border-purple-400"
                          : "bg-white border-gray-200 hover:border-blue-300"
                  }`}
                >
                  <div className="flex items-center justify-between group/row">
                    <h3
                      className="font-medium text-gray-900 text-xs truncate"
                      title={p.name}
                    >
                      {p.name}
                    </h3>
                    {!readOnly && (
                      <div
                        className={`flex gap-0.5 shrink-0 ml-1 transition-opacity ${
                          selectedProjectId === p.id
                            ? "opacity-100"
                            : "opacity-0 group-hover/row:opacity-100"
                        }`}
                      >
                        <button
                          onClick={(e) => handleCloneProject(p.id, e)}
                          className="text-gray-400 hover:text-blue-500 text-[10px] px-0.5"
                          title="Clone project"
                        >
                          {"\u29C9"}
                        </button>
                        {/* Destructive actions moved to the right-click
                            context menu (item 6, 2026-06-08). */}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-gray-500">
                      {p._count.diagrams} {p._count.diagrams === 1 ? "diagram" : "diagrams"}
                    </span>
                    <span className="text-[10px] text-gray-400">{new Date(p.updatedAt).toLocaleDateString()}</span>
                  </div>
                  {isSharedToMe && (
                    <div
                      className="text-[10px] text-amber-700 mt-0.5 truncate"
                      title={ownerLine}
                    >
                      {ownerLine}
                    </div>
                  )}
                  {/* Bottom-right "Shared" button — OWNER-ONLY surface
                      listing the recipients they've shared with. Hidden
                      on recipient tiles where the dropdown would just
                      show "everyone else who has access" — not useful
                      to a viewer/editor and confusing alongside the
                      amber styling. Removed for recipients 2026-06-07
                      per Paul's testing feedback. */}
                  {isSharedOut && (
                    <div className="flex justify-end mt-1 relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (tileSharedListOpen) {
                            setTileShareDropdownProjectId(null);
                            return;
                          }
                          setTileShareDropdownProjectId(p.id);
                          if (!tileSharedList) loadShares(p.id);
                        }}
                        className="text-[10px] font-medium px-1.5 py-0.5 border border-purple-300 rounded text-purple-700 hover:bg-purple-100"
                        title="Show users this project is shared with"
                      >
                        Shared ({shareCount}) {tileSharedListOpen ? "▾" : "▸"}
                      </button>
                      {tileSharedListOpen && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-full mt-1 z-30 bg-white border border-purple-300 rounded shadow-md min-w-[140px] max-w-[220px] py-1 px-2"
                        >
                          {!tileSharedList ? (
                            <p className="text-[10px] text-gray-400 italic">Loading…</p>
                          ) : tileSharedList.length === 0 ? (
                            <p className="text-[10px] text-gray-400 italic">No recipients.</p>
                          ) : (
                            tileSharedList.map(s => (
                              <div key={s.id} className="text-[10px] text-gray-700 flex items-center justify-between gap-1">
                                <span className="truncate" title={s.user.email}>
                                  {(s.user.name ?? "").trim() || s.user.email}
                                </span>
                                <span className="text-[9px] text-gray-500 shrink-0">{s.role === "EDIT" ? "E" : "V"}</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </CollapsibleSection>

        {/* Published by me / Published to me — each renders only when it has
            content (handled inside PublishedSection) and is collapsible. */}
        <PublishedSection />

        {/* Sandpit — collapsible; collapsed by default when empty, but the
            New Diagram button stays inline with the label either way. */}
        <CollapsibleSection
          title="Sandpit"
          count={unorganized.length}
          defaultOpen={unorganized.length > 0}
          action={
            <button
              onClick={() => setShowNewDiagram(true)}
              className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-xs font-medium"
            >
              + New Diagram
            </button>
          }
        >
          {unorganized.length === 0 ? (
            <div className="text-center py-8 bg-white rounded-lg border border-gray-200 border-dashed">
              <p className="text-gray-400 text-sm">The Sandpit is empty</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {unorganized.map((d) => (
                <DiagramCard
                  key={d.id}
                  diagram={d}
                  projects={projects}
                  onDelete={handleDeleteDiagram}
                  onMove={handleMoveDiagram}
                  onDragStart={() => setDragDiagramId(d.id)}
                  onDragEnd={() => { setDragDiagramId(null); setDropTargetProjectId(null); }}
                />
              ))}
            </div>
          )}
        </CollapsibleSection>
       </div>
      </main>

      {/* Project Properties Panel */}
      {selectedProject && (
        <div className="fixed right-0 top-[65px] bottom-0 w-56 bg-white border-l border-gray-200 p-3 overflow-y-auto z-10 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Project Properties</span>
            <button onClick={() => setSelectedProjectId(null)}
              className="text-gray-400 hover:text-gray-600 text-xs">{"\u2715"}</button>
          </div>
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-gray-500">Name</label>
              <p className="text-xs font-medium text-gray-800">{selectedProject.name}</p>
            </div>
            {/* Project Owner (registered user). For shared tiles the
                viewer sees the project owner's identity here \u2014 clearly
                separate from the free-text "Owner" label below, which
                is just a display string. */}
            {selectedProject.user && (
              <div>
                <label className="text-[10px] text-gray-500">Project Owner</label>
                <p className="text-xs text-gray-800 truncate" title={selectedProject.user.email}>
                  {(selectedProject.user.name ?? "").trim() || selectedProject.user.email}
                </p>
                <p className="text-[10px] text-gray-500 truncate">{selectedProject.user.email}</p>
              </div>
            )}
            <div>
              <label className="text-[10px] text-gray-500">Description</label>
              {selectedRole === "owner" ? (
                <>
                  <textarea
                    className="w-full text-[10px] border border-gray-300 rounded px-1.5 py-0.5 resize-y"
                    rows={3}
                    value={editDesc}
                    onChange={e => setEditDesc(e.target.value)}
                    onBlur={() => {
                      saveProjectProps(selectedProject.id, { description: editDesc });
                      setProjects(prev => prev.map(p => p.id === selectedProject.id ? { ...p, description: editDesc } : p));
                    }}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
                    placeholder="Project description..."
                  />
                  <p className="text-[9px] text-gray-400">Shift+Enter for new line</p>
                </>
              ) : (
                // Non-owners see description read-only \u2014 matches the rule
                // that name/description/typography are owner-only writes.
                <p className="text-[10px] text-gray-700 whitespace-pre-line">
                  {selectedProject.description?.trim() || <span className="text-gray-400 italic">(no description)</span>}
                </p>
              )}
            </div>
            {/* Export Owner Name field hidden 2026-06-06 — the registered
                Project Owner field above already shows who owns the
                project. The free-text string still lives on Project.ownerName,
                still round-trips through .diag-project XML exports and full
                .diag account backups, but no longer clutters the sidebar.
                Re-introduce here if a use case for a different export-only
                name appears. */}
            <div>
              <label className="text-[10px] text-gray-500">Diagrams</label>
              <p className="text-xs text-gray-700">{selectedProject._count.diagrams}</p>
            </div>
            <div>
              <label className="text-[10px] text-gray-500">Last Updated</label>
              <p className="text-[10px] text-gray-500">{new Date(selectedProject.updatedAt).toLocaleString()}</p>
            </div>

            {/* Sharing section \u2014 collapsible "Shared with N" row + the
                owner's Manage Sharing button. Editors and viewers can
                still see the list (transparency about who else is in
                the room); only the owner sees Manage. */}
            <div className="border-t border-gray-100 pt-2 mt-1">
              <button
                onClick={() => {
                  const next = !shareListOpen;
                  setShareListOpen(next);
                  if (next && !shareListByProject[selectedProject.id]) {
                    loadShares(selectedProject.id);
                  }
                }}
                className="w-full flex items-center justify-between text-[10px] text-gray-500 hover:text-gray-700"
                title="Show the list of users this project is shared with"
              >
                <span className="font-semibold uppercase tracking-wide">
                  Shared with {selectedProject._count.shares ?? 0}
                </span>
                <span className="text-gray-400">{shareListOpen ? "\u25be" : "\u25b8"}</span>
              </button>
              {shareListOpen && (
                <div className="mt-1 space-y-1">
                  {shareListLoading && (
                    <p className="text-[10px] text-gray-400 italic">Loading{"\u2026"}</p>
                  )}
                  {shareListError && (
                    <p className="text-[10px] text-red-600">{shareListError}</p>
                  )}
                  {!shareListLoading && !shareListError && (
                    (shareListByProject[selectedProject.id] ?? []).length === 0 ? (
                      <p className="text-[10px] text-gray-400 italic">Not shared with anyone.</p>
                    ) : (
                      (shareListByProject[selectedProject.id] ?? []).map(s => (
                        <div key={s.id} className="text-[10px] text-gray-700 flex items-center justify-between gap-1">
                          <span className="truncate" title={s.user.email}>
                            {(s.user.name ?? "").trim() || s.user.email}
                          </span>
                          <span className="text-[9px] text-gray-500 shrink-0">{s.role === "EDIT" ? "Edit" : "View"}</span>
                        </div>
                      ))
                    )
                  )}
                </div>
              )}
              {selectedRole === "owner" && !readOnly && (
                <button
                  onClick={() => setShareDialogOpen(true)}
                  className={
                    "w-full mt-2 px-2 py-1 text-xs border rounded " +
                    ((selectedProject._count.shares ?? 0) > 0
                      ? "border-purple-400 bg-purple-50 hover:bg-purple-100 text-purple-700"
                      : "border-gray-300 hover:bg-gray-50 text-gray-700")
                  }
                >
                  Manage Sharing{"\u2026"}
                </button>
              )}
            </div>

            {/* Open Project button removed 2026-06-06 \u2014 double-click the
                tile to open. The button was duplicating the tile
                interaction without adding new affordance. */}
          </div>
        </div>
      )}

      {/* Project Share dialog (owner-only \u2014 gated by the Manage Sharing
          button above and re-checked server-side on every action). */}
      {selectedProject && shareDialogOpen && (
        <ProjectShareDialog
          projectId={selectedProject.id}
          projectName={selectedProject.name}
          ownerUserId={selectedProject.user?.id ?? null}
          onClose={() => {
            setShareDialogOpen(false);
            // Re-pull the share list and the count so the sidebar and
            // tile reflect any add/remove/role-change made in the dialog.
            loadShares(selectedProject.id);
            fetch(`/api/projects`)
              .then(r => r.ok ? r.json() : null)
              .then((rows: ProjectSummary[] | null) => {
                if (rows) setProjects(rows);
              })
              .catch(() => {});
          }}
        />
      )}

      {/* Import name dialog */}
      {showImportNameDialog && pendingImportData && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Import Project</h2>
            <p className="text-[10px] text-gray-500 mb-1">
              Original: &quot;{(pendingImportData.project as Record<string,unknown>)?.name as string}&quot;
              {"\u00B7"} {((pendingImportData.diagrams as unknown[]) ?? []).length} diagram(s)
            </p>
            <label className="block text-xs text-gray-600 mb-1 mt-3">Project Name</label>
            <input autoFocus type="text" value={importProjectName}
              onChange={e => setImportProjectName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && importProjectName.trim()) handleImportProject(); }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setShowImportNameDialog(false); setPendingImportData(null); }}
                className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
              <button onClick={handleImportProject} disabled={!importProjectName.trim()}
                className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">Import</button>
            </div>
          </div>
        </div>
      )}

      {/* Import progress modal */}
      {importing && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[70vh]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">
                {importResult === "success" ? "\u2714 Import Complete" : importResult === "failed" ? "\u2718 Import Failed" : "Importing Project\u2026"}
              </h2>
              {importResult && (
                <button onClick={() => {
                  if (importResult === "success" && importedProjectId) {
                    router.push(`/dashboard/projects/${importedProjectId}`);
                  }
                  setImporting(false); setImportLog([]); setImportResult(null); setImportedProjectId(null);
                }}
                  className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 font-mono text-[10px] text-gray-600 space-y-0.5">
              {importLog.map((line, i) => (
                <p key={i} className={
                  line.startsWith("\u2714") ? "text-green-600" :
                  line.startsWith("\u2718") ? "text-red-600" :
                  line.startsWith("  ") ? "text-gray-500 pl-2" :
                  line.startsWith("   ") ? "text-gray-400 pl-4" : "text-gray-700"
                }>{line}</p>
              ))}
              {!importResult && (
                <p className="text-blue-500 animate-pulse">{"\u25CF"} Working...</p>
              )}
            </div>
            {importResult && (
              <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
                {importResult === "success" && importedProjectId && (
                  <button onClick={() => {
                    setImporting(false); setImportLog([]); setImportResult(null);
                    router.push(`/dashboard/projects/${importedProjectId}`);
                  }}
                    className="px-4 py-1.5 text-xs rounded-md text-white bg-blue-600 hover:bg-blue-700">
                    Open Project
                  </button>
                )}
                <button onClick={() => {
                  setImporting(false); setImportLog([]); setImportResult(null); setImportedProjectId(null);
                  if (importResult === "success") router.refresh();
                }}
                  className={`px-4 py-1.5 text-xs rounded-md text-white ${importResult === "success" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Restore progress dialog */}
      {(restoring || restoreLog.length > 0) && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[70vh]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">
                {restoreResult === "success" ? "\u2714 Restore Complete" :
                 restoreResult === "failed" ? "\u2718 Restore Failed" :
                 "Restoring Backup\u2026"}
              </h2>
              {restoreResult && (
                <button onClick={() => {
                  setRestoring(false);
                  setRestoreLog([]);
                  setRestoreResult(null);
                }}
                  className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 font-mono text-[10px] text-gray-600 space-y-0.5">
              {restoreLog.map((line, i) => (
                <p key={i} className={
                  line.startsWith("\u2714") ? "text-green-600" :
                  line.startsWith("\u2718") ? "text-red-600" :
                  line.startsWith("  ") ? "text-gray-500 pl-2" : "text-gray-700"
                }>{line}</p>
              ))}
              {!restoreResult && (
                <p className="text-purple-500 animate-pulse">{"\u25CF"} Working...</p>
              )}
            </div>
            {restoreResult && (
              <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
                <button onClick={() => {
                  setRestoring(false);
                  setRestoreLog([]);
                  setRestoreResult(null);
                  if (restoreResult === "success") router.refresh();
                }}
                  className={`px-4 py-1.5 text-xs rounded-md text-white ${restoreResult === "success" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SharePoint import file picker (System ▸ Import ▸ SharePoint) */}
      {spImportFmt && (() => {
        const ext: Record<"json" | "xml" | "visio" | "bpmn" | "ddl", string[]> = { json: [".json"], xml: [".xml"], visio: [".vsdx"], bpmn: [".bpmn"], ddl: [".sql", ".ddl"] };
        return (
          <SharePointPicker
            mode="file"
            title={`Open a ${spImportFmt.toUpperCase()} file from SharePoint`}
            confirmLabel="Open"
            fileExtensions={ext[spImportFmt]}
            onCancel={() => setSpImportFmt(null)}
            onPick={(sel) => { const f = spImportFmt; setSpImportFmt(null); if (f) void handleSpImport(f, sel); }}
          />
        );
      })()}
      {spBusy && (
        <div className="fixed inset-0 bg-black/10 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl px-5 py-4 text-xs text-gray-700">Working with SharePoint…</div>
        </div>
      )}

      {/* DDL Import dialog */}
      {showDdlImport && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">
                {ddlResult === "success" ? "\u2714 Import Complete" :
                 ddlResult === "failed" ? "\u2718 Import Failed" :
                 ddlImporting ? "Importing DDL\u2026" :
                 "Import DDL"}
              </h2>
              {!ddlImporting && (
                <button onClick={() => setShowDdlImport(false)}
                  className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
              )}
            </div>

            {!ddlImporting && !ddlResult && (
              <div className="px-5 py-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Database Type</label>
                  <select value={ddlDbType} onChange={e => setDdlDbType(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white">
                    <option value="postgres">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                    <option value="mssql">SQL Server</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Project Name</label>
                  <input type="text" value={ddlProjectName}
                    onChange={e => setDdlProjectName(e.target.value)}
                    placeholder="e.g. My Database Schema"
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Diagram Name <span className="text-gray-400">(optional)</span></label>
                  <input type="text" value={ddlDiagramName}
                    onChange={e => setDdlDiagramName(e.target.value)}
                    placeholder="defaults to Project Name + Schema"
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">DDL File (.sql or .ddl)</label>
                  <input ref={ddlFileInputRef} type="file" accept=".sql,.ddl"
                    onChange={e => setDdlFile(e.target.files?.[0] ?? null)}
                    className="w-full text-xs text-gray-600" />
                </div>
              </div>
            )}

            {(ddlImporting || ddlLog.length > 0) && (
              <div className="flex-1 overflow-y-auto px-5 py-3 font-mono text-[10px] text-gray-600 space-y-0.5">
                {ddlLog.map((line, i) => (
                  <p key={i} className={
                    line.startsWith("\u2714") ? "text-green-600" :
                    line.startsWith("\u2718") ? "text-red-600" :
                    "text-gray-700"
                  }>{line}</p>
                ))}
                {ddlImporting && !ddlResult && (
                  <p className="text-purple-500 animate-pulse">{"\u25CF"} Working...</p>
                )}
              </div>
            )}

            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              {!ddlImporting && !ddlResult && (
                <>
                  <button onClick={() => setShowDdlImport(false)}
                    className="px-4 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={handleDdlImport}
                    disabled={!ddlFile || !ddlProjectName.trim()}
                    className="px-4 py-1.5 text-xs text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    Import
                  </button>
                </>
              )}
              {ddlResult && (
                <button onClick={() => {
                  setShowDdlImport(false);
                  setDdlLog([]);
                  setDdlResult(null);
                }}
                  className={`px-4 py-1.5 text-xs rounded-md text-white ${ddlResult === "success" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Account settings modal */}
      {showAccount && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">Account Settings</h2>
              <button onClick={() => { setShowAccount(false); setAcctMsg(null); }}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {/* Profile */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                <input type="text" value={acctName}
                  onChange={e => setAcctName(e.target.value)}
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={acctEmail}
                  onChange={e => setAcctEmail(e.target.value)}
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                {acctEmail !== (userEmail ?? "") && (
                  <p className="text-[10px] text-amber-600 mt-0.5">
                    Changing your email will update your sign-in credentials immediately.
                  </p>
                )}
              </div>

              {/* Organisation */}
              <div className="border-t border-gray-100 pt-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">Organisation Name</label>
                <input type="text" value={acctOrgName}
                  onChange={e => setAcctOrgName(e.target.value)}
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>

              {/* Change Password */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-medium text-gray-700 mb-2">Change Password</p>
                <div className="space-y-2">
                  <div className="relative">
                    <input type={acctShowCurPwd ? "text" : "password"} value={acctCurPwd}
                      onChange={e => setAcctCurPwd(e.target.value)}
                      placeholder="Current password"
                      className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 pr-8 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <button type="button" onClick={() => setAcctShowCurPwd(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-[10px]">
                      {acctShowCurPwd ? "Hide" : "Show"}
                    </button>
                  </div>
                  <div className="relative">
                    <input type={acctShowNewPwd ? "text" : "password"} value={acctNewPwd}
                      onChange={e => setAcctNewPwd(e.target.value)}
                      placeholder="New password (min 6 characters)"
                      className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 pr-8 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <button type="button" onClick={() => setAcctShowNewPwd(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-[10px]">
                      {acctShowNewPwd ? "Hide" : "Show"}
                    </button>
                  </div>
                  <div className="relative">
                    <input type={acctShowConfirmPwd ? "text" : "password"} value={acctConfirmPwd}
                      onChange={e => setAcctConfirmPwd(e.target.value)}
                      placeholder="Confirm new password"
                      className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 pr-8 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <button type="button" onClick={() => setAcctShowConfirmPwd(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-[10px]">
                      {acctShowConfirmPwd ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Status message */}
              {acctMsg && (
                <p className={`text-xs ${acctMsg.ok ? "text-green-600" : "text-red-600"}`}>
                  {acctMsg.text}
                </p>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-200 flex items-center gap-2">
              <button onClick={() => signOut({ callbackUrl: "/login" })}
                className="px-4 py-1.5 text-xs text-red-600 border border-red-300 rounded-md hover:bg-red-50">
                Sign Out
              </button>
              <div className="flex-1" />
              <button onClick={() => { setShowAccount(false); setAcctMsg(null); }}
                className="px-4 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleAccountSave} disabled={acctSaving}
                className="px-4 py-1.5 text-xs text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
                {acctSaving ? "Saving\u2026" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visio Bulk Import dialog (dashboard-level → always creates a
          new project for the imported diagrams). */}
      {showVisioImportDialog && visioImportFile && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Import Visio Diagrams</h2>
            <p className="text-xs text-gray-600 mb-4 truncate">
              <span className="font-mono">{visioImportFile.name}</span> · {visioImportPages.length} page{visioImportPages.length === 1 ? "" : "s"}
            </p>
            {visioImportError && (
              <p className="mb-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{visioImportError}</p>
            )}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">Select pages to import</label>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setVisioImportSelected(new Set(visioImportPages.map((p) => p.index)))}
                    className="text-blue-600 hover:underline"
                  >Select all</button>
                  <button
                    type="button"
                    onClick={() => setVisioImportSelected(new Set())}
                    className="text-blue-600 hover:underline"
                  >Clear</button>
                </div>
              </div>
              <div className="max-h-[40vh] overflow-y-auto border border-gray-300 rounded">
                {visioImportPages.map((p) => {
                  const checked = visioImportSelected.has(p.index);
                  return (
                    <label
                      key={p.index}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setVisioImportSelected((prev) => {
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
              <p className="mt-1.5 text-xs text-gray-500">{visioImportSelected.size} of {visioImportPages.length} selected.</p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">New project name</label>
              <input
                type="text"
                value={visioImportProjectName}
                onChange={(e) => setVisioImportProjectName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Folder</label>
              <input
                type="text"
                value={visioImportFolderName}
                onChange={(e) => setVisioImportFolderName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Imported BPMN Diagrams"
              />
              <p className="mt-1.5 text-xs text-gray-500">Folder inside the new project for the imported diagrams. Leave blank to place them at the project root.</p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowVisioImportDialog(false);
                  setVisioImportFile(null);
                  setVisioImportError("");
                }}
                disabled={visioImportBusy}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleVisioImportConfirm}
                disabled={visioImportBusy || visioImportSelected.size === 0}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {visioImportBusy ? "Importing…" : `Import ${visioImportSelected.size} page${visioImportSelected.size === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BPMN Bulk Import dialog (dashboard-level → always creates a
          new project for the imported diagrams). Opens FIRST, then hosts
          a drag-and-drop zone + multi-file picker fallback. */}
      {showBpmnImportDialog && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="p-6 pb-2 shrink-0">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Import BPMN Diagrams</h2>
              <p className="text-xs text-gray-600">
                Drag a folder of <span className="font-mono">.bpmn</span> files onto the zone below (or pick files individually). Each file becomes one diagram in a new project; diagram names come from filenames.
              </p>
            </div>
            <div className="px-6 overflow-y-auto flex-1 min-h-0">
            {bpmnImportError && (
              <p className="mb-3 mt-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{bpmnImportError}</p>
            )}

            <div
              onDragOver={(e) => { e.preventDefault(); if (!bpmnImportBusy) setBpmnDragHover(true); }}
              onDragLeave={() => setBpmnDragHover(false)}
              onDrop={(e) => { if (!bpmnImportBusy) handleBpmnDrop(e); }}
              className={`mb-4 border-2 border-dashed rounded-md p-4 text-center text-sm transition-colors ${
                bpmnDragHover
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : bpmnImportFiles.length > 0
                    ? "border-gray-300 bg-gray-50 text-gray-700"
                    : "border-gray-300 text-gray-600"
              }`}
            >
              <div className="font-medium">
                {bpmnImportFiles.length === 0
                  ? "Drag a folder of .bpmn files here"
                  : `${bpmnImportFiles.length} BPMN file${bpmnImportFiles.length === 1 ? "" : "s"} loaded`}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                or{" "}
                <button
                  type="button"
                  onClick={() => bpmnFolderInputRef.current?.click()}
                  disabled={bpmnImportBusy}
                  className="text-blue-600 hover:underline disabled:opacity-50"
                >
                  pick individual .bpmn files
                </button>
              </div>
            </div>

            {bpmnImportFiles.length > 0 && (
              <>
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">Select files to import</label>
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setBpmnImportSelected(new Set(bpmnImportFiles.map((_, i) => i)))}
                        className="text-blue-600 hover:underline"
                      >Select all</button>
                      <button
                        type="button"
                        onClick={() => setBpmnImportSelected(new Set())}
                        className="text-blue-600 hover:underline"
                      >Clear</button>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto border border-gray-300 rounded">
                    {bpmnImportFiles.map((f, i) => {
                      const checked = bpmnImportSelected.has(i);
                      return (
                        <label
                          key={i}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setBpmnImportSelected((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(i);
                                else next.delete(i);
                                return next;
                              });
                            }}
                            className="h-3.5 w-3.5"
                          />
                          <span className="text-gray-400 text-xs tabular-nums w-6">{i + 1}.</span>
                          <span className="truncate">{f.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500">{bpmnImportSelected.size} of {bpmnImportFiles.length} selected.</p>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">New project name</label>
                  <input
                    type="text"
                    value={bpmnImportProjectName}
                    onChange={(e) => setBpmnImportProjectName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1.5 text-xs text-gray-500">Defaults to the source folder name.</p>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Folder</label>
                  <input
                    type="text"
                    value={bpmnImportFolderName}
                    onChange={(e) => setBpmnImportFolderName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Imported BPMN Diagrams"
                  />
                  <p className="mt-1.5 text-xs text-gray-500">Folder inside the new project for the imported diagrams. Leave blank to place them at the project root.</p>
                </div>
              </>
            )}

            {bpmnImportBusy && bpmnImportProgress.total > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1 text-xs text-gray-600">
                  <span className="truncate">{bpmnImportProgress.current || "Starting…"}</span>
                  <span className="tabular-nums ml-2 shrink-0">{bpmnImportProgress.done} / {bpmnImportProgress.total}</span>
                </div>
                <div className="w-full bg-gray-200 rounded h-1.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full transition-all"
                    style={{ width: `${bpmnImportProgress.total > 0 ? (bpmnImportProgress.done / bpmnImportProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
            </div>
            <div className="p-6 pt-3 shrink-0 border-t border-gray-100 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowBpmnImportDialog(false);
                  setBpmnImportFiles([]);
                  setBpmnImportError("");
                }}
                disabled={bpmnImportBusy}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBpmnImportConfirm}
                disabled={bpmnImportBusy || bpmnImportSelected.size === 0 || bpmnImportFiles.length === 0}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {bpmnImportBusy
                  ? "Importing…"
                  : bpmnImportFiles.length === 0
                    ? "Import"
                    : `Import ${bpmnImportSelected.size} file${bpmnImportSelected.size === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Zoom dialog */}
      {showEditZoom && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Edit Zoom</h2>
            <p className="text-xs text-gray-500 mb-4">
              When you double-click a label, the canvas snaps so the edited
              element occupies this fraction of the screen width. Default is 20%.
              5% (almost no zoom) to 95% (fills the viewport). Leave blank to
              revert to 20%. Turn Active off to disable the snap entirely (your
              chosen percentage is remembered for when you turn it back on).
            </p>
            <label className="flex items-center gap-2 mb-4 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={editZoomActive}
                onChange={(e) => setEditZoomActive(e.target.checked)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="font-medium">Active</span>
            </label>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Element width %</label>
              <input
                autoFocus
                type="number"
                min={5}
                max={95}
                step={5}
                value={editZoomInput}
                onChange={(e) => setEditZoomInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEditZoomSave()}
                disabled={!editZoomActive}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                placeholder="e.g. 20"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowEditZoom(false)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEditZoomSave}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Matrix Screensaver dialog */}
      {showMatrixConfig && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Matrix Screensaver</h2>
            <p className="text-xs text-gray-500 mb-4">
              Set how many seconds the page must be idle before the green
              katakana rain kicks in. The screensaver only activates while the
              floating green M (bottom-right) is on; any keyboard or mouse
              activity dismisses it. Default is 30. Range 5–3600 seconds.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Idle time (seconds)</label>
              <input
                autoFocus
                type="number"
                min={5}
                max={3600}
                step={5}
                value={matrixIdleInput}
                onChange={(e) => setMatrixIdleInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleMatrixConfigSave()}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="30"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowMatrixConfig(false)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleMatrixConfigSave}
                className="px-4 py-2 text-sm text-white bg-green-600 rounded-md hover:bg-green-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Initial Zoom dialog */}
      {showInitialZoom && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Initial Zoom</h2>
            <p className="text-xs text-gray-500 mb-4">
              Zoom percentage used when you open a diagram. Default is 70%.
              Small diagrams that fit the viewport are centred; larger diagrams anchor to the top-left corner.
              Leave blank to revert to the 70% default.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Zoom %</label>
              <input
                autoFocus
                type="number"
                min={25}
                max={300}
                step={5}
                value={initialZoomInput}
                onChange={(e) => setInitialZoomInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInitialZoomSave()}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 100"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowInitialZoom(false)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleInitialZoomSave}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Project dialog */}
      {showNewProject && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New Project</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                autoFocus
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="My project"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowNewProject(false); setNewProjectName(""); }}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                disabled={creatingProject}
                className={`px-4 py-2 text-sm text-white rounded-md ${
                  creatingProject ? "bg-green-600" : "bg-blue-600 hover:bg-blue-700"
                } disabled:cursor-not-allowed`}
              >
                {creatingProject ? "Creating\u2026" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Diagram dialog (unorganized) */}
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

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
              <div className="space-y-2">
                {DIAGRAM_TYPES.map((dt) => (
                  <label
                    key={dt.value}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer ${
                      newType === dt.value ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="type"
                      value={dt.value}
                      checked={newType === dt.value}
                      onChange={() => setNewType(dt.value)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{dt.label}</p>
                      <p className="text-xs text-gray-500">{dt.description}</p>
                    </div>
                  </label>
                ))}
              </div>
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

      {tileContextMenu && (() => {
        const p = projects.find(pp => pp.id === tileContextMenu.projectId);
        if (!p) return null;
        const role = deriveProjectRole(p);
        const isOwnerOfThis = role === "owner";
        // Tier visibility per Paul's 2026-06-08 spec:
        //   x  : project Owner OR OrgAdmin OR SuperAdmin
        //   x+ : OrgAdmin (any project in the Org)
        //   x++: SuperAdmin AND project Owner
        const canSee_x      = isOwnerOfThis || isOrgAdmin || !!isSu;
        const canSee_xPlus  = isOrgAdmin;
        const canSee_xPlus2 = !!isSu && isOwnerOfThis;
        const close = () => setTileContextMenu(null);
        // Stop click from bubbling to the window-level close listener.
        const stopBubble = (e: React.MouseEvent) => e.stopPropagation();
        return (
          <div
            className="fixed z-50 w-max bg-white border border-gray-200 rounded shadow-lg py-1 text-xs"
            style={{ left: tileContextMenu.x, top: tileContextMenu.y }}
            onClick={stopBubble}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100 truncate" title={p.name}>
              {p.name}
            </div>
            <button
              onClick={() => { close(); router.push(`/dashboard/projects/${p.id}`); }}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700"
            >
              Open
            </button>
            <button
              onClick={(e) => { close(); handleCloneProject(p.id, e); }}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700"
            >
              Clone project
            </button>
            {(canSee_x || canSee_xPlus || canSee_xPlus2) && (
              <div className="border-t border-gray-100 my-0.5" />
            )}
            {canSee_x && (
              <button
                onClick={(e) => { close(); handleDeleteProject(p.id, e); }}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700"
                title="Delete project. Diagrams move to the Sandpit."
              >
                <span className="font-mono mr-2">x</span>
                Delete project (diagrams → Sandpit)
              </button>
            )}
            {canSee_xPlus && (
              <button
                onClick={(e) => { close(); handleDeleteProjectCascade(p.id, e); }}
                className="w-full text-left px-3 py-1.5 hover:bg-orange-50 text-orange-700"
                title="OrgAdmin: delete project. Diagrams move to system Archive."
              >
                <span className="font-mono mr-2">x+</span>
                Delete project (diagrams → Archive)
              </button>
            )}
            {canSee_xPlus2 && (
              <button
                onClick={(e) => { close(); handleHardDeleteProject(p.id, e); }}
                className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-700"
                title="SuperAdmin: hard-delete the project AND every diagram in it. Cannot be undone."
              >
                <span className="font-mono mr-2">x++</span>
                Hard delete: project + all diagrams
              </button>
            )}
          </div>
        );
      })()}

      {showUsagePopover && usageSnapshot && (
        <UsagePopover
          mode={{ kind: "self", initial: usageSnapshot }}
          onClose={() => setShowUsagePopover(false)}
        />
      )}

      {tierPickerOpen && tierCards && tierCards.length > 0 && (
        <TierPicker
          tiers={tierCards}
          onDismiss={() => setTierPickerOpen(false)}
        />
      )}

      {showNotifications && (
        <NotificationsClient
          currentUserId={currentUserId}
          currentUserName={userName}
          currentUserEmail={userEmail ?? ""}
          initialAsUserId={currentUserId}
          adminScope={null}
          backHref="/dashboard"
          visitedDiagramId={notifVisited}
          overlay
          onContinue={closeNotifications}
          selfPath="/dashboard"
          selfExtraParam="notifications=1"
        />
      )}

      {backupModal && (
        <BackupProgressModal
          url={backupModal.url}
          previewUrl={backupModal.previewUrl}
          title={backupModal.title}
          onClose={() => { setBackupModal(null); setBackingUp(false); }}
        />
      )}
    </div>
  );
}
