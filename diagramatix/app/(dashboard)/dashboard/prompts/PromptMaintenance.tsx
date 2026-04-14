"use client";

import { useState, useEffect, useCallback } from "react";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editText, setEditText] = useState("");
  const [editType, setEditType] = useState("bpmn");
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
          body: JSON.stringify({ name: editName.trim(), text: editText.trim(), diagramType: editType }),
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
      if (editingId === id) {
        setEditingId(null);
        setEditName("");
        setEditText("");
      }
    } catch {
      setMessage({ text: "Failed to delete", type: "error" });
    }
    setConfirmDeleteId(null);
  }

  function startEdit(p: Prompt) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditText(p.text);
    setEditType(p.diagramType);
    setShowNew(false);
  }

  function startNew(diagramType: string) {
    setEditingId(null);
    setEditName("");
    setEditText("");
    setEditType(diagramType);
    setShowNew(true);
  }

  function cancelEdit() {
    setEditingId(null);
    setShowNew(false);
    setEditName("");
    setEditText("");
  }

  // Group prompts by diagram type
  const grouped = DIAGRAM_TYPES.map(dt => ({
    ...dt,
    prompts: prompts.filter(p => p.diagramType === dt.value),
  }));

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <div className="flex items-center gap-3 mb-6">
        <a href="/dashboard" className="text-xs text-blue-600 hover:underline">&larr; Dashboard</a>
        <h1 className="text-lg font-semibold text-gray-900">AI Prompt Maintenance</h1>
      </div>

      {message && (
        <div className={`mb-4 px-3 py-2 rounded text-xs ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <p className="text-xs text-gray-500">Loading prompts...</p>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.value} className="border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200 rounded-t-lg">
                <h2 className="text-sm font-semibold text-gray-700">{group.label}</h2>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400">{group.prompts.length} prompt{group.prompts.length !== 1 ? "s" : ""}</span>
                  <button
                    onClick={() => startNew(group.value)}
                    className="text-[10px] px-2 py-0.5 text-blue-600 border border-blue-300 rounded hover:bg-blue-50"
                  >+ Add</button>
                </div>
              </div>

              {group.prompts.length === 0 && !showNew && (
                <p className="px-4 py-3 text-xs text-gray-400 italic">No saved prompts</p>
              )}

              {group.prompts.map(p => (
                <div key={p.id} className={`px-4 py-2.5 border-b border-gray-100 last:border-b-0 ${editingId === p.id ? "bg-blue-50/50" : ""}`}>
                  {editingId === p.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Prompt name"
                      />
                      <textarea
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        rows={6}
                        className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed"
                        placeholder="Prompt text"
                      />
                      <div className="flex gap-1.5">
                        <button onClick={handleSave} disabled={saving || !editName.trim() || !editText.trim()}
                          className="px-3 py-1 text-xs text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50">
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button onClick={cancelEdit}
                          className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800">{p.name}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{p.text}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => startEdit(p)}
                          className="text-[10px] px-1.5 py-0.5 text-blue-600 border border-blue-200 rounded hover:bg-blue-50">
                          Edit
                        </button>
                        {confirmDeleteId === p.id ? (
                          <>
                            <span className="text-[10px] text-red-600">Delete?</span>
                            <button onClick={() => handleDelete(p.id)}
                              className="text-[10px] px-1.5 py-0.5 text-red-600 font-medium border border-red-300 rounded hover:bg-red-50">Yes</button>
                            <button onClick={() => setConfirmDeleteId(null)}
                              className="text-[10px] px-1.5 py-0.5 text-gray-500 border border-gray-300 rounded hover:bg-gray-50">No</button>
                          </>
                        ) : (
                          <button onClick={() => setConfirmDeleteId(p.id)}
                            className="text-[10px] px-1.5 py-0.5 text-red-500 border border-red-200 rounded hover:bg-red-50">
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* New prompt form for this group */}
              {showNew && editType === group.value && (
                <div className="px-4 py-3 bg-green-50/50 border-t border-gray-100 space-y-2">
                  <p className="text-[10px] text-gray-500 font-medium uppercase">New Prompt</p>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Prompt name"
                  />
                  <textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    rows={6}
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed"
                    placeholder="Prompt text"
                  />
                  <div className="flex gap-1.5">
                    <button onClick={handleSave} disabled={saving || !editName.trim() || !editText.trim()}
                      className="px-3 py-1 text-xs text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50">
                      {saving ? "Creating..." : "Create"}
                    </button>
                    <button onClick={cancelEdit}
                      className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
