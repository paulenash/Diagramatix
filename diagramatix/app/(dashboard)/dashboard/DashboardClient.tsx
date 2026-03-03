"use client";

import { useState } from "react";
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

interface Props {
  diagrams: DiagramSummary[];
  userName: string;
}

const DIAGRAM_TYPE_LABELS: Record<string, string> = {
  basic: "Basic",
  "process-context": "Process Context",
  "state-machine": "State Machine",
  bpmn: "BPMN",
};

const DIAGRAM_TYPES: { value: DiagramType; label: string; description: string }[] = [
  {
    value: "basic",
    label: "Basic Diagram",
    description: "Simple boxes and arrows — the best starting point",
  },
  {
    value: "process-context",
    label: "Process Context",
    description: "Use cases with actors showing process participants",
  },
  {
    value: "state-machine",
    label: "State Machine",
    description: "States and transitions for entity lifecycle",
  },
  {
    value: "bpmn",
    label: "BPMN",
    description: "Full Business Process Model and Notation",
  },
];

export function DashboardClient({ diagrams: initialDiagrams, userName }: Props) {
  const router = useRouter();
  const [diagrams, setDiagrams] = useState(initialDiagrams);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<DiagramType>("basic");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!newName.trim()) {
      setError("Please enter a name");
      return;
    }
    setCreating(true);
    setError("");

    const res = await fetch("/api/diagrams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), type: newType }),
    });

    setCreating(false);

    if (!res.ok) {
      setError("Failed to create diagram");
      return;
    }

    const diagram = await res.json();
    router.push(`/diagram/${diagram.id}`);
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this diagram?")) return;

    await fetch(`/api/diagrams/${id}`, { method: "DELETE" });
    setDiagrams((prev) => prev.filter((d) => d.id !== id));
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
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{userName}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900">My Diagrams</h1>
          <button
            onClick={() => setShowNewDialog(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
          >
            + New Diagram
          </button>
        </div>

        {diagrams.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500 mb-4">No diagrams yet</p>
            <button
              onClick={() => setShowNewDialog(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
            >
              Create your first diagram
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {diagrams.map((d) => (
              <div
                key={d.id}
                onClick={() => router.push(`/diagram/${d.id}`)}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm cursor-pointer group transition-all"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="w-8 h-8 bg-blue-50 rounded flex items-center justify-center">
                    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                      <rect x={1} y={4} width={6} height={4} rx={1} stroke="#2563eb" strokeWidth={1.2} />
                      <rect x={9} y={4} width={6} height={4} rx={1} stroke="#2563eb" strokeWidth={1.2} />
                      <line x1={7} y1={6} x2={9} y2={6} stroke="#2563eb" strokeWidth={1.2} />
                    </svg>
                  </div>
                  <button
                    onClick={(e) => handleDelete(d.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs px-1"
                  >
                    ✕
                  </button>
                </div>
                <h3 className="font-medium text-gray-900 text-sm mb-1">{d.name}</h3>
                <p className="text-xs text-gray-500 mb-2">
                  {DIAGRAM_TYPE_LABELS[d.type] ?? d.type}
                </p>
                <p className="text-xs text-gray-400">
                  {new Date(d.updatedAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* New diagram dialog */}
      {showNewDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              New Diagram
            </h2>

            {error && (
              <p className="mb-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
                {error}
              </p>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="My diagram"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type
              </label>
              <div className="space-y-2">
                {DIAGRAM_TYPES.map((dt) => (
                  <label
                    key={dt.value}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer ${
                      newType === dt.value
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
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
                      <p className="text-sm font-medium text-gray-900">
                        {dt.label}
                      </p>
                      <p className="text-xs text-gray-500">{dt.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowNewDialog(false);
                  setNewName("");
                  setError("");
                }}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
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
