"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListPopup } from "@/app/components/ListPopup";

interface SopRow {
  id: string; title: string; scope: string; scopeLabel: string | null; status: string; diagramName: string | null;
  updatedAt: string; stale?: boolean;
  /** Provenance — who generated it, when, and with which model. */
  createdAt?: string; createdBy?: string | null; model?: string | null;
}

/**
 * The Standard Operating Procedures generated in this project — open, or delete.
 * Fills the gap where lane/pool/subprocess SOPs were only reachable straight
 * after generating.
 *
 * Was a collapsible sidebar section. Paul, 2026-09-14: moved into the Project
 * menu as a small popup — "a scrollable list of the current SOP links and
 * options and a Continue button at the bottom right outside the scrollable
 * region". The list is unchanged; only the frame around it moved. It loads when
 * it mounts, which is when the popup opens, so it is always current.
 *
 * Each row also says who generated it and when. Paul, same day: "They seem to
 * be there without me creating them?" — an SOP can only come from Generate SOP
 * or an org-backup restore, and the row now says which person and which day,
 * so that question answers itself in the list.
 */
export function ProjectSopsList({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [rows, setRows] = useState<SopRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/sop`);
        const j = await res.json().catch(() => ({}));
        if (on && res.ok) setRows(j.documents ?? []);
      } finally { if (on) setLoaded(true); }
    })();
    return () => { on = false; };
  }, [projectId]);

  async function del(id: string) {
    await fetch(`/api/sop/${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const when = (iso?: string) => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  };

  if (!loaded) return <p className="text-[11px] text-gray-400 px-1">Loading…</p>;
  if (rows.length === 0) {
    return <p className="text-[11px] text-gray-400 px-1 italic">No SOPs yet. Open a BPMN diagram and click <span className="font-medium">Generate SOP</span>.</p>;
  }
  return (
    <div className="space-y-1">
      {rows.map((r) => {
        const provenance = [r.createdBy ? `by ${r.createdBy}` : null, when(r.createdAt)].filter(Boolean).join(" · ");
        return (
          <div key={r.id} className="group py-0.5">
            <div className="flex items-center gap-1 text-xs">
              <Link href={`/dashboard/projects/${projectId}/sop/${r.id}?from=${encodeURIComponent(`/dashboard/projects/${projectId}`)}`} className="flex-1 min-w-0 truncate text-blue-700 hover:underline" title={`${r.title}${r.diagramName ? " — " + r.diagramName : ""}`}>
                {r.title}
                {r.scopeLabel && r.scope !== "whole" && <span className="ml-1 text-[9px] text-gray-400">· {r.scopeLabel}</span>}
              </Link>
              {r.stale && <span className="text-[8px] uppercase text-amber-700 bg-amber-50 border border-amber-300 rounded px-1 shrink-0" title="The source diagram changed — SOP regeneration required">Regen</span>}
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
            {provenance && (
              <p className="text-[10px] text-gray-400 truncate" title={`Generated ${r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}${r.model ? ` with ${r.model}` : ""}`}>
                {provenance}{r.model ? ` · ${r.model}` : ""}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The Project-menu popup around the list. */
export function ProjectSopsDialog({ projectId, canEdit, onClose }: { projectId: string; canEdit: boolean; onClose: () => void }) {
  return (
    <ListPopup
      title="Standard Operating Procedures"
      subtitle="Generated in this project. Open one, or delete it. To create one, open a BPMN diagram and click Generate SOP."
      onContinue={onClose}
      width="max-w-lg"
    >
      <ProjectSopsList projectId={projectId} canEdit={canEdit} />
    </ListPopup>
  );
}
