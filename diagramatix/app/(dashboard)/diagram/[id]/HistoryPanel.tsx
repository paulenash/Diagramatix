"use client";

import { useState, useEffect, useCallback } from "react";
import type { DiagramData } from "@/app/lib/diagram/types";

interface HistoryEntry {
  id: string;
  createdAt: string;
}

interface Props {
  diagramId: string;
  onPreview: (data: DiagramData) => void;
  onRestored: () => void;
  onClose: () => void;
  hasUnsavedChanges: boolean;
}

export function HistoryPanel({ diagramId, onPreview, onRestored, onClose, hasUnsavedChanges }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/diagrams/${diagramId}/history`);
      if (res.ok) setEntries(await res.json());
      else setError("Failed to load history");
    } catch {
      setError("Network error");
    }
    setLoading(false);
  }, [diagramId]);

  useEffect(() => { load(); }, [load]);

  async function handlePreview(snapshotId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/diagrams/${diagramId}/history/${snapshotId}`);
      if (!res.ok) { setError("Failed to load snapshot"); setBusy(false); return; }
      const snap = await res.json();
      const s = snap.snapshot;
      onPreview({
        elements: s.data?.elements ?? [],
        connectors: s.data?.connectors ?? [],
        viewport: s.data?.viewport ?? { x: 0, y: 0, zoom: 1 },
        fontSize: s.data?.fontSize,
        connectorFontSize: s.data?.connectorFontSize,
        titleFontSize: s.data?.titleFontSize,
        title: s.data?.title,
        database: s.data?.database,
      } as DiagramData);
      setPreviewingId(snapshotId);
    } catch {
      setError("Network error");
    }
    setBusy(false);
  }

  async function handleRestore(snapshotId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/diagrams/${diagramId}/history/${snapshotId}`, { method: "POST" });
      if (!res.ok) { setError("Failed to restore"); setBusy(false); setConfirmRestoreId(null); return; }
      onRestored();
    } catch {
      setError("Network error");
    }
    setBusy(false);
    setConfirmRestoreId(null);
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    try {
      return d.toLocaleString("en-AU", {
        timeZone: "Australia/Sydney",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
      });
    } catch { return d.toLocaleString(); }
  }

  return (
    <div className="w-80 border-l border-gray-200 bg-white flex flex-col shrink-0 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">History</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">&times;</button>
      </div>

      <div className="px-3 py-2 border-b border-gray-100 text-[10px] text-gray-500">
        Snapshots auto-created on each Save. Last 50 kept.
      </div>

      {hasUnsavedChanges && (
        <div className="px-3 py-2 bg-orange-50 border-b border-orange-200 text-[10px] text-orange-700">
          You have unsaved changes. Save first to preserve them before restoring.
        </div>
      )}

      {error && <div className="px-3 py-1.5 bg-red-50 text-[10px] text-red-700">{error}</div>}

      {loading ? (
        <p className="px-3 py-4 text-xs text-gray-400 italic">Loading history...</p>
      ) : entries.length === 0 ? (
        <p className="px-3 py-4 text-xs text-gray-400 italic">No history yet. Save the diagram to create the first snapshot.</p>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {entries.map((e, idx) => (
            <div key={e.id} className={`px-3 py-2 border-b border-gray-100 ${previewingId === e.id ? "bg-blue-50" : "hover:bg-gray-50"}`}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-gray-800">
                    {idx === 0 ? "Latest" : `v${entries.length - idx}`}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{formatDate(e.createdAt)}</p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={() => handlePreview(e.id)} disabled={busy}
                    className="text-[10px] px-1.5 py-0.5 text-blue-600 border border-blue-200 rounded hover:bg-blue-50 disabled:opacity-50">
                    Preview
                  </button>
                  {confirmRestoreId === e.id ? (
                    <div className="flex gap-0.5">
                      <button onClick={() => handleRestore(e.id)} disabled={busy}
                        className="text-[10px] px-1.5 py-0.5 text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50">Yes</button>
                      <button onClick={() => setConfirmRestoreId(null)}
                        className="text-[10px] px-1.5 py-0.5 text-gray-500 border border-gray-300 rounded hover:bg-gray-50">No</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmRestoreId(e.id)} disabled={busy}
                      className="text-[10px] px-1.5 py-0.5 text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
                      Restore
                    </button>
                  )}
                </div>
              </div>
              {confirmRestoreId === e.id && (
                <p className="text-[10px] text-red-600 mt-1">
                  Restore this version? Current state will be saved as a new history entry.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
