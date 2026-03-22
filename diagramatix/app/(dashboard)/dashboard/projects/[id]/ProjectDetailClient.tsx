"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { DiagramType, DiagramData } from "@/app/lib/diagram/types";
import { resolveColor, DEFAULT_SYMBOL_COLORS, type SymbolColorConfig } from "@/app/lib/diagram/colors";
import { DiagramMaintenanceModal } from "./DiagramMaintenanceModal";

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
  context: "Context Diagram",
  basic: "Context Diagram",  // legacy alias
  "process-context": "Process Context",
  "state-machine": "State Machine",
  bpmn: "BPMN",
  domain: "Domain Diagram",
};

const DIAGRAM_TYPES: { value: DiagramType; label: string; description: string }[] = [
  { value: "context", label: "Context Diagram", description: "External entities, processes, and data flows" },
  { value: "process-context", label: "Process Context", description: "Use cases with actors showing process participants" },
  { value: "state-machine", label: "State Machine", description: "States and transitions for entity lifecycle" },
  { value: "bpmn", label: "BPMN", description: "Full Business Process Model and Notation" },
  { value: "domain", label: "Domain Diagram", description: "UML class diagrams with classes, enumerations, and relationships" },
];

export function ProjectDetailClient({ project, otherProjects }: Props) {
  const router = useRouter();
  const [diagrams, setDiagrams] = useState(project.diagrams);

  const [showNewDiagram, setShowNewDiagram] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [projectColorConfig, setProjectColorConfig] = useState<SymbolColorConfig>((project.colorConfig as SymbolColorConfig | null) ?? {});

  // Fetch fresh colorConfig from API on mount — bypasses Next.js Router Cache which may serve
  // stale server props after navigating away and back.
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
    router.push(`/diagram/${diagram.id}`);
  }

  async function handleDeleteDiagram(id: string) {
    if (!confirm("Delete this diagram?")) return;
    await fetch(`/api/diagrams/${id}`, { method: "DELETE" });
    setDiagrams((prev) => prev.filter((d) => d.id !== id));
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          ← Dashboard
        </button>
        <h1 className="text-lg font-semibold text-gray-900 flex-1">{project.name}</h1>
        <button
          onClick={() => setShowMaintenance(true)}
          className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Project Diagram Maintenance
        </button>
        <button
          onClick={() => setShowNewDiagram(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
        >
          + New Diagram
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {diagrams.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500 mb-4">No diagrams yet</p>
            <button
              onClick={() => setShowNewDiagram(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
            >
              Create your first diagram
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {diagrams.map((d) => (
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
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create"}
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
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowMove((v) => !v); }}
              className="text-gray-400 hover:text-blue-500 text-xs px-1"
              title="Move to..."
            >
              ↗
            </button>
            {showMove && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-5 z-20 bg-white border border-gray-200 rounded shadow-lg min-w-36 py-1"
              >
                <p className="px-3 py-1 text-xs text-gray-400 font-medium uppercase tracking-wide">Move to</p>
                {otherProjects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { onMove(diagram.id, p.id); setShowMove(false); }}
                    className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    {p.name}
                  </button>
                ))}
                <hr className="my-1 border-gray-100" />
                <button
                  onClick={() => { onMove(diagram.id, null); setShowMove(false); }}
                  className="block w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 italic"
                >
                  Unorganized
                </button>
              </div>
            )}
          </div>
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
      {diagram.data && (
        <div className="absolute bottom-2 right-2 w-24 h-16 opacity-40 group-hover:opacity-70 transition-opacity pointer-events-none">
          <DiagramThumbnail data={diagram.data} colorConfig={colorConfig} />
        </div>
      )}
    </div>
  );
}
