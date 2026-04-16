"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Prompt {
  id: string;
  name: string;
  text: string;
  diagramType: string;
  createdAt: string;
  updatedAt: string;
}

const DIAGRAM_TYPES: { value: string; label: string }[] = [
  { value: "bpmn", label: "BPMN" },
  { value: "state-machine", label: "State Machine" },
  { value: "value-chain", label: "Value Chain" },
  { value: "domain", label: "Domain Model" },
  { value: "context", label: "Context Diagram" },
  { value: "process-context", label: "Process Context" },
];

export function PromptMaintenance() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState("bpmn");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const loadPrompts = useCallback(async () => {
    try {
      const res = await fetch("/api/prompts");
      if (res.ok) setPrompts(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadPrompts(); }, [loadPrompts]);

  async function handleSave() {
    if (!editName.trim() || !editText.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      if (editingId) {
        const res = await fetch(`/api/prompts/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: editName.trim(), text: editText.trim() }),
        });
        if (res.ok) {
          setMessage({ text: "Prompt updated", type: "success" });
          setEditingId(null);
          setEditName("");
          setEditText("");
          loadPrompts();
        } else {
          setMessage({ text: "Failed to update", type: "error" });
        }
      } else {
        const res = await fetch("/api/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: editName.trim(), text: editText.trim(), diagramType: activeType }),
        });
        if (res.ok) {
          setMessage({ text: "Prompt created", type: "success" });
          setShowNew(false);
          setEditName("");
          setEditText("");
          loadPrompts();
        } else {
          setMessage({ text: "Failed to create", type: "error" });
        }
      }
    } catch {
      setMessage({ text: "Network error", type: "error" });
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/prompts/${id}`, { method: "DELETE" });
      setPrompts(prev => prev.filter(p => p.id !== id));
      setMessage({ text: "Prompt deleted", type: "success" });
      if (editingId === id) { setEditingId(null); setEditName(""); setEditText(""); }
    } catch {
      setMessage({ text: "Failed to delete", type: "error" });
    }
    setConfirmDeleteId(null);
  }

  function startEdit(p: Prompt) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditText(p.text);
    setShowNew(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setShowNew(false);
    setEditName("");
    setEditText("");
  }

  const activePrompts = prompts.filter(p => p.diagramType === activeType);

  if (loading) return <div className="p-8 text-gray-500">Loading prompts...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
            &larr; Dashboard
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">AI Prompt Maintenance</h1>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-400">
            Manage saved prompts for AI diagram generation
          </p>
          <a href="/help" className="text-xs text-blue-600 hover:underline shrink-0">User Guide</a>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Sidebar — diagram type list */}
        <nav className="w-52 bg-white border-r border-gray-200 p-3">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-2">Diagram Types</p>
          <div className="space-y-1">
            {DIAGRAM_TYPES.map(dt => {
              const count = prompts.filter(p => p.diagramType === dt.value).length;
              return (
                <button key={dt.value}
                  onClick={() => { setActiveType(dt.value); cancelEdit(); setMessage(null); }}
                  className={`w-full text-left px-3 py-1.5 rounded text-xs ${
                    activeType === dt.value
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {dt.label}
                  <span className="ml-1 text-gray-400">({count})</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {DIAGRAM_TYPES.find(d => d.value === activeType)?.label} Prompts
              </h2>
              <p className="text-[10px] text-gray-400">
                {activePrompts.length} prompt{activePrompts.length !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              onClick={() => { setShowNew(true); setEditingId(null); setEditName(""); setEditText(""); }}
              className="px-3 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700"
            >+ New Prompt</button>
          </div>

          {message && (
            <div className={`mb-3 px-3 py-1.5 rounded text-xs ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {message.text}
            </div>
          )}

          {/* New prompt form */}
          {showNew && !editingId && (
            <div className="mb-3 bg-white border border-blue-200 rounded-lg p-3 space-y-2">
              <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wide">New Prompt</p>
              <input
                type="text" value={editName} onChange={e => setEditName(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Prompt name"
              />
              <textarea
                value={editText} onChange={e => setEditText(e.target.value)} rows={6}
                className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed font-mono"
                placeholder="Prompt text — describe the diagram you want to generate"
              />
              <div className="flex gap-1.5">
                <button onClick={handleSave} disabled={saving || !editName.trim() || !editText.trim()}
                  className="px-3 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Creating\u2026" : "Create"}
                </button>
                <button onClick={cancelEdit}
                  className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Prompt list */}
          <div className="flex-1 space-y-2 overflow-y-auto">
            {activePrompts.length === 0 && !showNew && (
              <p className="text-xs text-gray-400 italic py-4">No saved prompts for this diagram type</p>
            )}
            {activePrompts.map(p => (
              <div key={p.id} className={`bg-white border rounded-lg ${editingId === p.id ? "border-blue-300 ring-1 ring-blue-200" : "border-gray-200"}`}>
                {editingId === p.id ? (
                  <div className="p-3 space-y-2">
                    <input
                      type="text" value={editName} onChange={e => setEditName(e.target.value)}
                      className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="Prompt name"
                    />
                    <textarea
                      value={editText} onChange={e => setEditText(e.target.value)} rows={6}
                      className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed font-mono"
                      placeholder="Prompt text"
                    />
                    <div className="flex gap-1.5">
                      <button onClick={handleSave} disabled={saving || !editName.trim() || !editText.trim()}
                        className="px-3 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
                        {saving ? "Saving\u2026" : "Save"}
                      </button>
                      <button onClick={cancelEdit}
                        className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-3 py-2.5 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800">{p.name}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">{p.text}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 pt-0.5">
                      <button onClick={() => startEdit(p)}
                        className="text-[10px] px-2 py-0.5 text-blue-600 border border-blue-200 rounded hover:bg-blue-50">
                        Edit
                      </button>
                      {confirmDeleteId === p.id ? (
                        <>
                          <span className="text-[10px] text-red-600">Delete?</span>
                          <button onClick={() => handleDelete(p.id)}
                            className="text-[10px] px-2 py-0.5 text-red-600 font-medium border border-red-300 rounded hover:bg-red-50">Yes</button>
                          <button onClick={() => setConfirmDeleteId(null)}
                            className="text-[10px] px-2 py-0.5 text-gray-500 border border-gray-300 rounded hover:bg-gray-50">No</button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(p.id)}
                          className="text-[10px] px-2 py-0.5 text-red-500 border border-red-200 rounded hover:bg-red-50">
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
