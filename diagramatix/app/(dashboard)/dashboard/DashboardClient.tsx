"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import type { DiagramType } from "@/app/lib/diagram/types";

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
  version?: number;
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
}: {
  diagram: DiagramSummary;
  projects: ProjectSummary[];
  onDelete: (id: string) => void;
  onMove: (diagramId: string, projectId: string | null) => void;
}) {
  const router = useRouter();
  const [showMove, setShowMove] = useState(false);

  return (
    <div
      onClick={() => router.push(`/diagram/${diagram.id}`)}
      className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm cursor-pointer group transition-all relative"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="w-8 h-8 bg-blue-50 rounded flex items-center justify-center">
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
      <h3 className="font-medium text-gray-900 text-sm mb-1">{diagram.name}</h3>
      <p className="text-xs text-gray-500 mb-2">{DIAGRAM_TYPE_LABELS[diagram.type] ?? diagram.type}</p>
      <p className="text-xs text-gray-400">{new Date(diagram.updatedAt).toLocaleDateString()}</p>
    </div>
  );
}

export function DashboardClient({ projects: initialProjects, unorganized: initialUnorganized, userName, userEmail, version }: Props) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [unorganized, setUnorganized] = useState(initialUnorganized);

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

  // New project state
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImportProject(file: File) {
    setImporting(true);
    setImportLog([]);
    setImportResult(null);
    setImportedProjectId(null);
    const log = (msg: string) => setImportLog(prev => [...prev, msg]);

    try {
      log(`Reading file: ${file.name} (${Math.round(file.size / 1024)} KB)`);
      const text = await file.text();
      const exportData = JSON.parse(text);
      if (!exportData.version || !exportData.project || !exportData.diagrams) {
        log("\u2718 Invalid export file format — missing required fields");
        setImportResult("failed"); return;
      }
      log(`\u2714 Valid export file (version ${exportData.version})`);
      log(`   Project: "${exportData.project.name}"`);
      log(`   Diagrams: ${exportData.diagrams.length}`);
      log(`   Exported: ${new Date(exportData.exportedAt).toLocaleString()}`);

      const importName = (exportData.project.name ?? "Imported") + " (imported)";

      log("Creating project...");
      const projRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: importName,
          description: exportData.project.description ?? "",
          ownerName: exportData.project.ownerName ?? "",
        }),
      });
      if (!projRes.ok) {
        log("\u2718 Failed to create project");
        setImportResult("failed"); return;
      }
      const newProject = await projRes.json();
      log(`\u2714 Project "${importName}" created`);

      if (exportData.project.colorConfig && Object.keys(exportData.project.colorConfig).length > 0) {
        log("Importing project colour settings...");
        await fetch(`/api/projects/${newProject.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ colorConfig: exportData.project.colorConfig }),
        });
        log("\u2714 Colour settings imported");
      }

      log(`Importing ${exportData.diagrams.length} diagram(s)...`);
      const idMap = new Map<string, string>();
      let successCount = 0;
      for (let i = 0; i < exportData.diagrams.length; i++) {
        const diag = exportData.diagrams[i];
        log(`  Importing diagram ${i + 1}/${exportData.diagrams.length}: "${diag.name}" (${diag.type ?? "context"})`);
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
          idMap.set(diag.originalId, newDiag.id);
          successCount++;
          log(`  \u2714 Diagram "${diag.name}" imported`);
        } else {
          log(`  \u2718 Failed to import diagram "${diag.name}"`);
        }
      }

      if (exportData.folderTree) {
        log("Importing folder structure...");
        const ft = exportData.folderTree;
        const remappedMap: Record<string, string> = {};
        for (const [oldId, folderId] of Object.entries(ft.diagramFolderMap ?? {})) {
          const newId = idMap.get(oldId);
          if (newId) remappedMap[newId] = folderId as string;
        }
        const remappedOrder: Record<string, string[]> = {};
        for (const [folderId, ids] of Object.entries(ft.diagramOrder ?? {})) {
          remappedOrder[folderId] = (ids as string[]).map(id => idMap.get(id) ?? id);
        }
        const remappedTree = {
          folders: ft.folders ?? [],
          diagramFolderMap: remappedMap,
          diagramOrder: remappedOrder,
          folderOrder: ft.folderOrder ?? {},
        };
        localStorage.setItem(`folder-tree-${newProject.id}`, JSON.stringify(remappedTree));
        const folderCount = (ft.folders ?? []).length;
        log(`\u2714 ${folderCount} folder(s) imported`);
      }

      log("");
      log(`\u2714 Import complete! ${successCount}/${exportData.diagrams.length} diagram(s) imported successfully.`);
      setImportResult("success");
      setImportedProjectId(newProject.id);
    } catch (err) {
      console.error("Import failed:", err);
      log(`\u2718 Import failed: ${err instanceof Error ? err.message : String(err)}`);
      setImportResult("failed");
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

  async function handleDeleteProject(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this project? Its diagrams will be moved to Unorganized.")) return;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setProjects((prev) => prev.filter((p) => p.id !== id));
    // Refresh the page so server re-fetches unorganized diagrams (SetNull moved them)
    router.refresh();
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

  async function handleDeleteDiagram(id: string) {
    if (!confirm("Delete this diagram?")) return;
    await fetch(`/api/diagrams/${id}`, { method: "DELETE" });
    setUnorganized((prev) => prev.filter((d) => d.id !== id));
  }

  async function handleMoveDiagram(diagramId: string, projectId: string | null) {
    const res = await fetch(`/api/diagrams/${diagramId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    if (!res.ok) return;
    if (projectId !== null) {
      // Moved to a project — remove from unorganized
      setUnorganized((prev) => prev.filter((d) => d.id !== diagramId));
      // Update project count
      setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, _count: { diagrams: p._count.diagrams + 1 } } : p));
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
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
          {version ? <span className="text-xs text-gray-400 ml-1">v1.0.{version}</span> : null}
          <span className="text-xs text-gray-400 ml-3">brought to you by: <strong className="text-gray-600">Nash AI</strong></span>
        </div>
        <div className="flex items-center gap-4">
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

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-10">
        {/* Projects section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold text-gray-900">Projects</h1>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImportProject(f); e.target.value = ""; }} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className={`px-4 py-2 text-sm font-medium rounded-md border ${
                importing ? "bg-green-600 text-white" : "text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {importing ? "Importing\u2026" : "Import Project"}
            </button>
            <button
              onClick={() => setShowNewProject(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
            >
              + New Project
            </button>
          </div>

          {projects.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <p className="text-gray-500 mb-4">No projects yet</p>
              <button
                onClick={() => setShowNewProject(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
              >
                Create your first project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => {
                    setSelectedProjectId(p.id);
                    setEditDesc(p.description ?? "");
                    setEditOwner(p.ownerName ?? "");
                  }}
                  onDoubleClick={() => router.push(`/dashboard/projects/${p.id}`)}
                  className={`bg-white border rounded-lg p-4 hover:shadow-sm cursor-pointer group transition-all ${
                    selectedProjectId === p.id ? "border-blue-500 ring-1 ring-blue-300" : "border-gray-200 hover:border-blue-300"
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-8 h-8 bg-purple-50 rounded flex items-center justify-center">
                      <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                        <rect x={1} y={4} width={14} height={11} rx={1.5} stroke="#7c3aed" strokeWidth={1.2} />
                        <path d="M1 7h14" stroke="#7c3aed" strokeWidth={1.2} />
                        <path d="M4 4V2.5A1.5 1.5 0 015.5 1h5A1.5 1.5 0 0112 2.5V4" stroke="#7c3aed" strokeWidth={1.2} />
                      </svg>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={(e) => handleCloneProject(p.id, e)}
                        className="text-gray-400 hover:text-blue-500 text-xs px-1"
                        title="Clone project"
                      >
                        ⧉
                      </button>
                      <button
                        onClick={(e) => handleDeleteProject(p.id, e)}
                        className="text-gray-400 hover:text-red-500 text-xs px-1"
                        title="Delete project"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <h3 className="font-medium text-gray-900 text-sm mb-1">{p.name}</h3>
                  <p className="text-xs text-gray-500 mb-1">
                    {p._count.diagrams} {p._count.diagrams === 1 ? "diagram" : "diagrams"}
                  </p>
                  <p className="text-xs text-gray-400">{new Date(p.updatedAt).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Unorganized diagrams section */}
        {(unorganized.length > 0 || true) && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Unorganized Diagrams</h2>
              <button
                onClick={() => setShowNewDiagram(true)}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium"
              >
                + New Diagram
              </button>
            </div>

            {unorganized.length === 0 ? (
              <div className="text-center py-8 bg-white rounded-lg border border-gray-200 border-dashed">
                <p className="text-gray-400 text-sm">No unorganized diagrams</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {unorganized.map((d) => (
                  <DiagramCard
                    key={d.id}
                    diagram={d}
                    projects={projects}
                    onDelete={handleDeleteDiagram}
                    onMove={handleMoveDiagram}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Project Properties Panel */}
      {selectedProject && (
        <div className="fixed right-0 top-12 bottom-0 w-56 bg-white border-l border-gray-200 p-3 overflow-y-auto z-10 shadow-lg">
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
    </div>
  );
}
