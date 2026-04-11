"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import type { DiagramType } from "@/app/lib/diagram/types";
import { SCHEMA_VERSION } from "@/app/lib/diagram/types";
import { ImpersonationBanner } from "@/app/components/ImpersonationBanner";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

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
  _count: { diagrams: number };
}

interface Props {
  projects: ProjectSummary[];
  unorganized: DiagramSummary[];
  userName: string;
  userEmail?: string;
  orgName?: string;
  version?: number;
  readOnly?: boolean;
  viewingAsName?: string;
  viewingAsEmail?: string;
  isSuperuser?: boolean;
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

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", diagram.id); onDragStart?.(); }}
      onDragEnd={() => onDragEnd?.()}
      onClick={() => router.push(`/diagram/${diagram.id}`)}
      className="bg-white border border-gray-200 rounded px-3 py-2 hover:border-blue-300 hover:shadow-sm cursor-pointer group transition-all relative"
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
          <span className="text-[10px] text-gray-500">{DIAGRAM_TYPE_LABELS[diagram.type] ?? diagram.type}</span>
          <span className="text-[10px] text-gray-400">{new Date(diagram.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

export function DashboardClient({ projects: initialProjects, unorganized: initialUnorganized, userName, userEmail, orgName, version, readOnly, viewingAsName, viewingAsEmail, isSuperuser: isSu }: Props) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [unorganized, setUnorganized] = useState(initialUnorganized);

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
  const [newType, setNewType] = useState<DiagramType>("context");
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

  // Backup / Restore
  const [backingUp, setBackingUp] = useState(false);
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

  async function handleBackupDownload() {
    setBackingUp(true);
    try {
      const resp = await fetch("/api/backup");
      if (!resp.ok) {
        const msg = await resp.text();
        alert(`Backup failed: ${msg || resp.statusText}`);
        return;
      }
      const blob = await resp.blob();
      // Filename comes from Content-Disposition (best-effort parse)
      const cd = resp.headers.get("Content-Disposition") ?? "";
      const m = cd.match(/filename="([^"]+)"/);
      const filename = m?.[1] ?? `Diagramatix-backup-${new Date().toISOString().slice(0, 10)}.diag`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      alert(`Backup failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBackingUp(false);
    }
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
      message: `Are you sure you want to delete "${proj?.name ?? "this project"}"? Its diagrams will be moved to Unorganised.`,
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

  return (
    <div className={`min-h-screen ${readOnly ? "bg-orange-50" : "bg-gray-50"}`}>
      {readOnly && viewingAsName !== undefined && viewingAsEmail !== undefined && (
        <ImpersonationBanner viewingAsName={viewingAsName ?? ""} viewingAsEmail={viewingAsEmail ?? ""} />
      )}
      {/* Header */}
      <header className={`${readOnly ? "bg-orange-50" : "bg-white"} border-b border-gray-200 px-6 py-4 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center">
            <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
              <rect x={1} y={1} width={5} height={5} rx={1} fill="white" />
              <rect x={8} y={1} width={5} height={5} rx={1} fill="white" />
              <rect x={1} y={8} width={5} height={5} rx={1} fill="white" />
              <rect x={8} y={8} width={5} height={5} rx={1} fill="white" />
            </svg>
          </div>
          <span className="font-semibold text-gray-900">Diagramatix</span>
          {version ? <span className="text-xs text-gray-400 ml-1">v{SCHEMA_VERSION}.{version}</span> : null}
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
                        : "File \u25BE"}
                </button>
                {fileMenuOpen && !(importing || backingUp || restoring) && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded shadow-lg z-50">
                    <button
                      onClick={() => {
                        setFileMenuOpen(false);
                        setImportFormat("json");
                        if (fileInputRef.current) {
                          fileInputRef.current.accept = ".json";
                          fileInputRef.current.click();
                        }
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      Import JSON
                    </button>
                    <button
                      onClick={() => {
                        setFileMenuOpen(false);
                        setImportFormat("xml");
                        if (fileInputRef.current) {
                          fileInputRef.current.accept = ".xml";
                          fileInputRef.current.click();
                        }
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      Import XML
                    </button>
                    <button
                      onClick={() => {
                        setFileMenuOpen(false);
                        setDdlProjectName("");
                        setDdlDiagramName("");
                        setDdlFile(null);
                        setDdlDbType("postgres");
                        setDdlLog([]);
                        setDdlResult(null);
                        setShowDdlImport(true);
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      Import DDL
                    </button>
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
                    {isSu && (
                      <>
                        <div className="border-t border-gray-100" />
                        <a
                          href="/dashboard/admin"
                          onClick={() => setFileMenuOpen(false)}
                          className="block w-full text-left px-3 py-2 text-xs text-orange-600 hover:bg-orange-50 font-medium"
                        >
                          Admin
                        </a>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
          <a
            href="/help"
            className="text-xs text-gray-500 hover:text-blue-600"
            title="User Guide"
          >
            Help
          </a>
          {orgName && (
            <div
              className="text-xs text-gray-600 border border-gray-200 rounded px-2 py-1 bg-gray-50"
              title="Active organisation"
            >
              {orgName}
            </div>
          )}
          <div className="text-right">
            <span className="text-sm text-gray-700 font-medium">{userName}</span>
            {userEmail && <p className="text-[10px] text-gray-400 leading-tight">{userEmail}</p>}
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Projects section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-semibold text-gray-900">Projects</h1>
            {!readOnly && (
              <button
                onClick={() => setShowNewProject(true)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs font-medium"
              >
                + New Project
              </button>
            )}
          </div>

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
              {projects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => {
                    setSelectedProjectId(p.id);
                    setEditDesc(p.description ?? "");
                    setEditOwner(p.ownerName ?? "");
                  }}
                  onDoubleClick={() => router.push(`/dashboard/projects/${p.id}`)}
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
                  className={`bg-white border rounded px-3 py-2 hover:shadow-sm cursor-pointer group transition-all ${
                    dropTargetProjectId === p.id ? "border-blue-500 ring-2 ring-blue-300 bg-blue-50" :
                    selectedProjectId === p.id ? "border-blue-500 ring-1 ring-blue-300" : "border-gray-200 hover:border-blue-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900 text-xs truncate">{p.name}</h3>
                    {!readOnly && (
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 shrink-0 ml-1">
                        <button
                          onClick={(e) => handleCloneProject(p.id, e)}
                          className="text-gray-400 hover:text-blue-500 text-[10px] px-0.5"
                          title="Clone project"
                        >
                          {"\u29C9"}
                        </button>
                        <button
                          onClick={(e) => handleDeleteProject(p.id, e)}
                          className="text-gray-400 hover:text-red-500 text-[10px] px-0.5"
                          title="Delete project"
                        >
                          {"\u2715"}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-gray-500">
                      {p._count.diagrams} {p._count.diagrams === 1 ? "diagram" : "diagrams"}
                    </span>
                    <span className="text-[10px] text-gray-400">{new Date(p.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Unorganized diagrams section */}
        {(unorganized.length > 0 || true) && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Unorganised Diagrams</h2>
              <button
                onClick={() => setShowNewDiagram(true)}
                className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-xs font-medium"
              >
                + New Diagram
              </button>
            </div>

            {unorganized.length === 0 ? (
              <div className="text-center py-8 bg-white rounded-lg border border-gray-200 border-dashed">
                <p className="text-gray-400 text-sm">No unorganised diagrams</p>
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
          </section>
        )}
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
            <div>
              <label className="text-[10px] text-gray-500">Description</label>
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
            </div>
            <div>
              <label className="text-[10px] text-gray-500">Owner</label>
              <input type="text"
                className="w-full text-[10px] border border-gray-300 rounded px-1.5 py-0.5"
                value={editOwner}
                onChange={e => setEditOwner(e.target.value)}
                onBlur={() => {
                  saveProjectProps(selectedProject.id, { ownerName: editOwner });
                  setProjects(prev => prev.map(p => p.id === selectedProject.id ? { ...p, ownerName: editOwner } : p));
                }}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500">Diagrams</label>
              <p className="text-xs text-gray-700">{selectedProject._count.diagrams}</p>
            </div>
            <div>
              <label className="text-[10px] text-gray-500">Last Updated</label>
              <p className="text-[10px] text-gray-500">{new Date(selectedProject.updatedAt).toLocaleString()}</p>
            </div>
            <button
              onClick={() => router.push(`/dashboard/projects/${selectedProject.id}`)}
              className="w-full px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Open Project
            </button>
          </div>
        </div>
      )}

      {/* Import name dialog */}
      {showImportNameDialog && pendingImportData && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
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

      {/* DDL Import dialog */}
      {showDdlImport && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
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

      {/* New Project dialog */}
      {showNewProject && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
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
    </div>
  );
}
