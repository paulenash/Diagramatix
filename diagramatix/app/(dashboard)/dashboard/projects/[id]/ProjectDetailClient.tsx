"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { DiagramType, DiagramData } from "@/app/lib/diagram/types";
import { resolveColor, DEFAULT_SYMBOL_COLORS, type SymbolColorConfig } from "@/app/lib/diagram/colors";
import { DiagramMaintenanceModal } from "./DiagramMaintenanceModal";

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
}

const ROOT_ID = "root";

function loadFolderTree(projectId: string): FolderTree {
  if (typeof window === "undefined") return { folders: [], diagramFolderMap: {} };
  try {
    const raw = localStorage.getItem(`folder-tree-${projectId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { folders: [], diagramFolderMap: {} };
}

function saveFolderTree(projectId: string, tree: FolderTree) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`folder-tree-${projectId}`, JSON.stringify(tree));
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
  colorConfig?: unknown;
  diagrams: DiagramSummary[];
}

interface OtherProject {
  id: string;
  name: string;
}

interface Props {
  project: ProjectDetail;
  otherProjects: OtherProject[];
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

export function ProjectDetailClient({ project, otherProjects }: Props) {
  const router = useRouter();
  const [diagrams, setDiagrams] = useState(project.diagrams);

  const [showNewDiagram, setShowNewDiagram] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [projectColorConfig, setProjectColorConfig] = useState<SymbolColorConfig>((project.colorConfig as SymbolColorConfig | null) ?? {});

  // Folder tree state
  const [folderTree, setFolderTree] = useState<FolderTree>(() => loadFolderTree(project.id));
  const [selectedFolderId, setSelectedFolderId] = useState<string>(ROOT_ID);
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [dragDiagramId, setDragDiagramId] = useState<string | null>(null);

  const updateTree = useCallback((updater: (t: FolderTree) => FolderTree) => {
    setFolderTree(prev => {
      const next = updater(prev);
      saveFolderTree(project.id, next);
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

  async function handleDeleteDiagram(id: string) {
    if (!confirm("Delete this diagram?")) return;
    await fetch(`/api/diagrams/${id}`, { method: "DELETE" });
    setDiagrams((prev) => prev.filter((d) => d.id !== id));
    updateTree(t => {
      const map = { ...t.diagramFolderMap };
      delete map[id];
      return { ...t, diagramFolderMap: map };
    });
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
  function renderFolder(folderId: string, depth: number): React.ReactNode {
    const isRoot = folderId === ROOT_ID;
    const folder = isRoot ? null : folderTree.folders.find(f => f.id === folderId);
    const name = isRoot ? project.name : (folder?.name ?? "?");
    const isSelected = selectedFolderId === folderId;
    const isCollapsed = folder?.collapsed ?? false;
    const childFolders = folderTree.folders.filter(f => (f.parentId === null && isRoot) || f.parentId === folderId);
    const directDiagrams = diagrams.filter(d => (folderTree.diagramFolderMap[d.id] ?? ROOT_ID) === folderId);
    const hasChildren = childFolders.length > 0 || directDiagrams.length > 0;

    return (
      <div key={folderId}>
        <div
          className={`flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer text-[11px] ${
            isSelected ? "bg-blue-100 text-blue-800" : "text-gray-700 hover:bg-gray-100"
          }`}
          style={{ paddingLeft: depth * 12 + 4 }}
          onClick={() => setSelectedFolderId(folderId)}
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
          <span className="truncate flex-1 font-medium">{name}</span>
          {/* Add subfolder button */}
          <button onClick={(e) => { e.stopPropagation(); handleAddFolder(folderId); }}
            className="opacity-0 group-hover:opacity-100 hover:!opacity-100 text-gray-400 hover:text-blue-500 text-[10px] px-0.5"
            title="Add subfolder"
            style={{ opacity: isSelected ? 1 : undefined }}
          >+</button>
          {!isRoot && (
            <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folderId); }}
              className="opacity-0 group-hover:opacity-100 hover:!opacity-100 text-gray-400 hover:text-red-500 text-[10px] px-0.5"
              title="Delete folder"
              style={{ opacity: isSelected ? 1 : undefined }}
            >{"\u2715"}</button>
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
                className={`flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer text-[10px] text-gray-600 hover:bg-gray-50 ${
                  dragDiagramId === d.id ? "opacity-40" : ""
                }`}
                style={{ paddingLeft: (depth + 1) * 12 + 4 }}
                onClick={() => router.push(`/diagram/${d.id}`)}
              >
                <span className="w-3" />
                <svg width={14} height={14} viewBox="0 0 18 16" fill="none">
                  <rect x={1} y={1} width={16} height={14} rx={2} fill="#fef9c3" stroke="#d97706" strokeWidth={0.7} />
                  <DiagramTypeMarker type={d.type} />
                </svg>
                <span className="truncate flex-1">{d.name}</span>
              </div>
            ))}
          </>
        )}
      </div>
    );
  }

  const visibleDiagrams = getDiagramsInFolder(selectedFolderId);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 flex-shrink-0">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          {"\u2190"} Dashboard
        </button>
        <h1 className="text-sm font-semibold text-gray-900 flex-1">{project.name}</h1>
        <button
          onClick={() => setShowMaintenance(true)}
          className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Project Maintenance
        </button>
        <button
          onClick={() => setShowNewDiagram(true)}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs font-medium"
        >
          + New Diagram
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Folder tree */}
        <div className="w-52 border-r border-gray-200 bg-white overflow-y-auto p-2 flex-shrink-0 group">
          {renderFolder(ROOT_ID, 0)}
        </div>

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
                  onMove={handleMoveDiagram}
                  colorConfig={projectColorConfig}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Diagram Maintenance modal */}
      {showMaintenance && (
        <DiagramMaintenanceModal
          projectId={project.id}
          initialColorConfig={projectColorConfig}
          onClose={() => setShowMaintenance(false)}
          onSaved={(config) => {
            setProjectColorConfig(config);
            router.refresh();
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
  onMove,
  colorConfig,
}: {
  diagram: DiagramSummary;
  otherProjects: OtherProject[];
  onDelete: (id: string) => void;
  onMove: (diagramId: string, projectId: string | null) => void;
  colorConfig?: SymbolColorConfig;
}) {
  const router = useRouter();
  const [showMove, setShowMove] = useState(false);

  return (
    <div
      onClick={() => router.push(`/diagram/${diagram.id}`)}
      className="bg-white border border-gray-200 rounded-md p-2.5 hover:border-blue-300 hover:shadow-sm cursor-pointer group transition-all relative"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-medium text-gray-900 text-xs truncate flex-1">{diagram.name}</h3>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 ml-1">
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
                  className="block w-full text-left px-3 py-1 text-xs text-gray-500 hover:bg-gray-50 italic">Unorganized</button>
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
      {diagram.data && (
        <div className="absolute bottom-1 right-1 w-16 h-10 opacity-30 group-hover:opacity-60 transition-opacity pointer-events-none">
          <DiagramThumbnail data={diagram.data} colorConfig={colorConfig} />
        </div>
      )}
    </div>
  );
}
