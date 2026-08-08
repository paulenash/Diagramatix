"use client";

import { useEffect, useState } from "react";
import type { ProcessDiff } from "@/app/lib/diagram/diff/processDiff";
import { ProcessDiffResults } from "./ProcessDiffResults";

interface RunRow { id: string; aName: string; bName: string; createdAt: string; hasAiSummary: boolean; author: string | null }
interface RunDetail { id: string; aName: string; bName: string; createdAt: string; result: ProcessDiff; aiSummary: string | null }

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-AU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true });
  } catch { return iso; }
}
function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Diff Process Results — the saved-run history for one diagram. Lists runs in
 * reverse-chronological order (most recent highlighted), shows the selected run's
 * full results (+ AI summary) via <ProcessDiffResults>, and offers Export to
 * Word, Remove Run, and Continue. Opened from the diagram's properties.
 */
export function DiffRunsDialog({ diagramId, onClose }: { diagramId: string; onClose: () => void }) {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState<null | "docx" | "delete">(null);
  const [err, setErr] = useState<string | null>(null);

  async function loadList(selectFirst = true) {
    setLoadingList(true);
    try {
      const res = await fetch(`/api/diagrams/${diagramId}/diff-runs`, { cache: "no-store" });
      const j = res.ok ? await res.json() : { runs: [] };
      const rs: RunRow[] = j.runs ?? [];
      setRuns(rs);
      if (selectFirst) setSelectedId(rs[0]?.id ?? null);
      else if (selectedId && !rs.some((r) => r.id === selectedId)) setSelectedId(rs[0]?.id ?? null);
    } finally { setLoadingList(false); }
  }

  useEffect(() => { void loadList(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [diagramId]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let on = true;
    setLoadingDetail(true); setErr(null);
    fetch(`/api/diagrams/diff/runs/${selectedId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (on) setDetail(d); })
      .catch(() => { if (on) setErr("Could not load run"); })
      .finally(() => { if (on) setLoadingDetail(false); });
    return () => { on = false; };
  }, [selectedId]);

  async function exportDocx() {
    if (!selectedId || !detail) return;
    setBusy("docx"); setErr(null);
    try {
      const res = await fetch("/api/diagrams/diff", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: selectedId, mode: "docx" }),
      });
      if (!res.ok) throw new Error("Export failed");
      download(`${detail.aName}-vs-${detail.bName}.docx`, await res.blob());
    } catch (e) { setErr(e instanceof Error ? e.message : "Export failed"); }
    finally { setBusy(null); }
  }

  async function removeRun() {
    if (!selectedId) return;
    setBusy("delete"); setErr(null);
    try {
      const res = await fetch(`/api/diagrams/diff/runs/${selectedId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Remove failed");
      setSelectedId(null);
      await loadList(true);
    } catch (e) { setErr(e instanceof Error ? e.message : "Remove failed"); }
    finally { setBusy(null); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Diff Process Results</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* Runs list (reverse-chrono, most recent highlighted) */}
          <div className="w-64 shrink-0 border-r border-gray-100 overflow-y-auto">
            {loadingList ? (
              <p className="text-xs text-gray-500 p-3">Loading…</p>
            ) : runs.length === 0 ? (
              <p className="text-xs text-gray-400 p-3">No saved runs for this diagram.</p>
            ) : (
              runs.map((r) => (
                <button key={r.id} onClick={() => setSelectedId(r.id)}
                  className={`w-full text-left px-3 py-2 border-b border-gray-50 text-[11px] ${r.id === selectedId ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                  <div className="font-medium text-gray-800">{fmt(r.createdAt)}</div>
                  <div className="text-gray-500 truncate">{r.aName} → {r.bName}</div>
                  <div className="text-gray-400">
                    {r.author ?? ""}{r.hasAiSummary ? " · AI" : ""}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Selected run's results */}
          <div className="flex-1 overflow-auto px-5 py-3">
            {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
            {loadingDetail && <p className="text-xs text-gray-500">Loading run…</p>}
            {!loadingDetail && detail && <ProcessDiffResults diff={detail.result} aiSummary={detail.aiSummary} />}
            {!loadingDetail && !detail && runs.length > 0 && <p className="text-xs text-gray-400">Select a run.</p>}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200">
          <button onClick={exportDocx} disabled={!selectedId || busy === "docx"}
            className="text-xs text-gray-700 border border-gray-300 rounded px-3 py-1 hover:bg-gray-50 disabled:opacity-50">
            {busy === "docx" ? "Exporting…" : "Export to Word"}
          </button>
          <button onClick={removeRun} disabled={!selectedId || busy === "delete"}
            className="text-xs text-red-600 border border-red-300 rounded px-3 py-1 hover:bg-red-50 disabled:opacity-50">
            {busy === "delete" ? "Removing…" : "Remove Run"}
          </button>
          <button onClick={onClose} className="text-xs text-white bg-blue-600 rounded px-3 py-1 hover:bg-blue-700">Continue</button>
        </div>
      </div>
    </div>
  );
}
