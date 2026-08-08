"use client";

import { useEffect, useState } from "react";
import type { ProcessDiff } from "@/app/lib/diagram/diff/processDiff";
import { ProcessDiffResults } from "./ProcessDiffResults";
import { FilePreviewDialog, type PreviewPayload } from "@/app/components/preview/FilePreviewDialog";

interface RunDetail { id: string; aName: string; bName: string; createdAt: string; result: ProcessDiff; aiSummary: string | null }

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read-only viewer for a single saved run — used by the admin management screens. */
export function DiffRunViewer({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<false | "docx" | "preview">(false);
  const [err, setErr] = useState<string | null>(null);
  const [previewPayload, setPreviewPayload] = useState<PreviewPayload | null>(null);

  useEffect(() => {
    let on = true;
    fetch(`/api/diagrams/diff/runs/${runId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (on) setDetail(d); })
      .catch(() => { if (on) setErr("Could not load run"); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [runId]);

  async function fetchDocx(): Promise<Blob | null> {
    const res = await fetch("/api/diagrams/diff", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, mode: "docx" }),
    });
    if (!res.ok) throw new Error("Word request failed");
    return await res.blob();
  }

  async function exportDocx() {
    if (!detail) return;
    setBusy("docx"); setErr(null);
    try {
      const blob = await fetchDocx();
      if (blob) download(`${detail.aName}-vs-${detail.bName}.docx`, blob);
    } catch (e) { setErr(e instanceof Error ? e.message : "Export failed"); }
    finally { setBusy(false); }
  }

  async function previewDocx() {
    if (!detail) return;
    setBusy("preview"); setErr(null);
    try {
      const base = `${detail.aName}-vs-${detail.bName}`;
      // True-to-layout PDF (LibreOffice); fall back to the mammoth content preview.
      const pdf = await fetch("/api/diagrams/diff", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, mode: "pdf" }),
      });
      if (pdf.ok && (pdf.headers.get("content-type") ?? "").includes("pdf")) {
        setPreviewPayload({ kind: "pdf", title: `${base}.pdf`, blob: await pdf.blob(), downloadName: `${base}.pdf` });
        return;
      }
      const blob = await fetchDocx();
      if (blob) setPreviewPayload({ kind: "docx", title: `${base}.docx`, blob, downloadName: `${base}.docx` });
    } catch (e) { setErr(e instanceof Error ? e.message : "Preview failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">{detail ? `${detail.aName} → ${detail.bName}` : "Diff run"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-3">
          {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
          {loading && <p className="text-xs text-gray-500">Loading…</p>}
          {!loading && detail && <ProcessDiffResults diff={detail.result} aiSummary={detail.aiSummary} />}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200">
          <button onClick={previewDocx} disabled={!detail || !!busy}
            className="text-xs text-gray-700 border border-gray-300 rounded px-3 py-1 hover:bg-gray-50 disabled:opacity-50" title="Preview the Word report (no download)">
            {busy === "preview" ? "Opening…" : "👁 Preview Word"}
          </button>
          <button onClick={exportDocx} disabled={!detail || !!busy}
            className="text-xs text-gray-700 border border-gray-300 rounded px-3 py-1 hover:bg-gray-50 disabled:opacity-50">
            {busy === "docx" ? "Exporting…" : "Export to Word"}
          </button>
          <button onClick={onClose} className="text-xs text-white bg-blue-600 rounded px-3 py-1 hover:bg-blue-700">Close</button>
        </div>
      </div>
      {previewPayload && <FilePreviewDialog payload={previewPayload} onClose={() => setPreviewPayload(null)} />}
    </div>
  );
}
