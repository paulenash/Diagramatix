"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SopRow { id: string; title: string; scope: string; scopeLabel: string | null; status: string; diagramName: string | null; updatedAt: string }

/**
 * Sidebar section listing the Standard Operating Procedures generated in this
 * project — open, or delete. Fills the gap where lane/pool/subprocess SOPs were
 * only reachable straight after generating. Collapsible, mirrors the Process
 * Structure section.
 */
export function ProjectSopsSection({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SopRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/projects/${projectId}/sop`);
      const j = await res.json().catch(() => ({}));
      if (res.ok) setRows(j.documents ?? []);
    } finally { setLoaded(true); }
  }
  // Load once when first expanded (and refresh whenever re-expanded).
  useEffect(() => { if (open) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, projectId]);

  async function del(id: string) {
    await fetch(`/api/sop/${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="border-b border-gray-100">
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-medium text-gray-700 hover:bg-gray-50">
        <span>{open ? "▾" : "▸"} Standard Operating Procedures{loaded ? ` (${rows.length})` : ""}</span>
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-1">
          {!loaded ? (
            <p className="text-[11px] text-gray-400 px-1">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-[11px] text-gray-400 px-1 italic">No SOPs yet. Open a BPMN diagram and click <span className="font-medium">Generate SOP</span>.</p>
          ) : rows.map((r) => (
            <div key={r.id} className="flex items-center gap-1 text-[11px] group">
              <Link href={`/dashboard/projects/${projectId}/sop/${r.id}?from=${encodeURIComponent(`/dashboard/projects/${projectId}`)}`} className="flex-1 min-w-0 truncate text-blue-700 hover:underline" title={`${r.title}${r.diagramName ? " — " + r.diagramName : ""}`}>
                {r.title}
                {r.scopeLabel && r.scope !== "whole" && <span className="ml-1 text-[9px] text-gray-400">· {r.scopeLabel}</span>}
              </Link>
              {r.status === "published" && <span className="text-[8px] uppercase text-green-700 bg-green-50 border border-green-200 rounded px-1 shrink-0">Pub</span>}
              {canEdit && (confirmDelete === r.id ? (
                <>
                  <button onClick={() => del(r.id)} className="text-white bg-red-600 rounded px-1 shrink-0">✓</button>
                  <button onClick={() => setConfirmDelete(null)} className="text-gray-400 hover:text-gray-700 px-0.5 shrink-0">✕</button>
                </>
              ) : (
                <button onClick={() => setConfirmDelete(r.id)} className="text-red-400 hover:text-red-600 px-0.5 shrink-0 opacity-0 group-hover:opacity-100" title="Delete SOP">🗑</button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
