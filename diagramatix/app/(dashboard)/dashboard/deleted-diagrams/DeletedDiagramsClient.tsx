"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface DeletedDiagram {
  id: string;
  name: string;
  type: string;
  archivedAt: string;
  originalProjectName: string | null;
}

interface HistoryEntry {
  id: string;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  context: "Context",
  basic: "Context",
  "process-context": "Process Context",
  "state-machine": "State Machine",
  bpmn: "BPMN",
  domain: "Domain",
  "value-chain": "Value Chain",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  try {
    return d.toLocaleString("en-AU", {
      timeZone: "Australia/Sydney",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  } catch { return d.toLocaleString(); }
}

export function DeletedDiagramsClient() {
  const [diagrams, setDiagrams] = useState<DeletedDiagram[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyById, setHistoryById] = useState<Record<string, HistoryEntry[]>>({});
  const [loadingHistoryId, setLoadingHistoryId] = useState<string | null>(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/diagrams/deleted");
      if (res.ok) setDiagrams(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadHistory(id: string) {
    setLoadingHistoryId(id);
    try {
      const res = await fetch(`/api/diagrams/${id}/history`);
      if (res.ok) {
        const data = await res.json();
        setHistoryById(prev => ({ ...prev, [id]: data }));
      }
    } catch { /* ignore */ }
    setLoadingHistoryId(null);
  }

  async function toggleExpand(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!historyById[id]) await loadHistory(id);
  }

  async function handleRestore(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/diagrams/deleted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagramId: id }),
      });
      if (res.ok) {
        setDiagrams(prev => prev.filter(d => d.id !== id));
        setMessage({ text: "Diagram restored", ok: true });
      } else {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        setMessage({ text: err.error ?? "Restore failed", ok: false });
      }
    } catch {
      setMessage({ text: "Network error", ok: false });
    }
    setBusy(false);
    setConfirmRestoreId(null);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
            &larr; Dashboard
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">Deleted Diagrams</h1>
          <span className="text-xs text-gray-400">{diagrams.length} diagram{diagrams.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-400">History is preserved. Restore to bring a diagram back to its original project.</p>
          <Link href="/help" className="text-xs text-blue-600 hover:underline">User Guide</Link>
        </div>
      </header>

      {message && (
        <div className={`mx-6 mt-3 px-3 py-1.5 rounded text-xs ${message.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}

      <div className="flex-1 p-4">
        {loading ? (
          <p className="text-xs text-gray-400 italic">Loading...</p>
        ) : diagrams.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500 text-sm">You have no deleted diagrams</p>
          </div>
        ) : (
          <div className="space-y-2">
            {diagrams.map((d) => (
              <div key={d.id} className="bg-white border border-gray-200 rounded-lg">
                <div className="px-4 py-3 flex items-center gap-3">
                  <button onClick={() => toggleExpand(d.id)}
                    className="text-gray-400 hover:text-gray-600 text-xs w-5 shrink-0"
                    title={expandedId === d.id ? "Hide history" : "Show history"}>
                    {expandedId === d.id ? "\u25BC" : "\u25B6"}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate" title={d.name}>{d.name}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      <span className="px-1.5 py-0.5 bg-gray-100 rounded mr-2">{TYPE_LABELS[d.type] ?? d.type}</span>
                      From: {d.originalProjectName ?? <span className="italic">Unorganised</span>}
                      <span className="ml-2">Deleted: {formatDate(d.archivedAt)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {confirmRestoreId === d.id ? (
                      <>
                        <span className="text-[10px] text-blue-600">Restore?</span>
                        <button onClick={() => handleRestore(d.id)} disabled={busy}
                          className="text-[10px] px-2 py-0.5 text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50">Yes</button>
                        <button onClick={() => setConfirmRestoreId(null)}
                          className="text-[10px] px-2 py-0.5 text-gray-500 border border-gray-300 rounded hover:bg-gray-50">No</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmRestoreId(d.id)}
                        className="text-[10px] px-2 py-0.5 text-white bg-green-600 rounded hover:bg-green-700">
                        Restore
                      </button>
                    )}
                  </div>
                </div>

                {expandedId === d.id && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-2">
                    <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1">History</p>
                    {loadingHistoryId === d.id ? (
                      <p className="text-[10px] text-gray-400 italic">Loading...</p>
                    ) : (historyById[d.id]?.length ?? 0) === 0 ? (
                      <p className="text-[10px] text-gray-400 italic">No history entries</p>
                    ) : (
                      <ul className="space-y-0.5 max-h-48 overflow-y-auto">
                        {historyById[d.id]!.map((h, i) => (
                          <li key={h.id} className="text-[10px] text-gray-600 flex items-center gap-2 py-0.5">
                            <span className="w-8 text-right text-gray-400">{i === 0 ? "Latest" : `v${historyById[d.id]!.length - i}`}</span>
                            <span>{formatDate(h.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
