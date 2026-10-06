"use client";

import { useEffect, useMemo, useState } from "react";

export interface MoveTarget { id: string; name: string }

/**
 * THE "Move to project" chooser — one dialog for every place a diagram can be moved to another project: the Project screen's tiles and
 * right-click menus, and the Dashboard's Sandpit tiles (Paul, 2026-10-06: "wider to display the names better, scrollable with a close
 * button"). A real modal, not a browser dialog: wide, a filter box once the list is long, a scrolling list, a Close button and Escape.
 * `sandpit` adds the "Sandpit" (no project) target.
 */
export function MoveToProjectDialog({
  diagramName, projects, sandpit = true, onPick, onClose,
}: {
  diagramName: string;
  projects: MoveTarget[];
  /** Offer "Sandpit" (a diagram that belongs to no project) as a destination. */
  sandpit?: boolean;
  onPick: (projectId: string | null) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? projects.filter((p) => p.name.toLowerCase().includes(s)) : projects;
  }, [projects, q]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" onClick={onClose} data-testid="move-to-project">
      <div
        role="dialog"
        aria-labelledby="move-to-project-title"
        className="w-full max-w-xl max-h-[80vh] flex flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div className="min-w-0">
            <h2 id="move-to-project-title" className="text-base font-semibold text-gray-900">Move to project</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate" title={diagramName}>Choose where to move <b className="text-gray-700">{diagramName}</b></p>
          </div>
          <button onClick={onClose} aria-label="Close" title="Close (Esc)"
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 text-base leading-none">{"✕"}</button>
        </div>

        {projects.length > 8 && (
          <div className="px-5 pb-2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter projects…"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1 text-gray-800 placeholder:text-gray-400" />
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2" data-testid="move-to-project-list">
          {shown.length === 0 && <p className="px-3 py-3 text-sm text-gray-400">{projects.length === 0 ? "There are no other projects." : "No project matches that."}</p>}
          {shown.map((p) => (
            <button key={p.id} onClick={() => onPick(p.id)} title={p.name}
              className="block w-full text-left px-3 py-2 text-sm text-gray-800 rounded hover:bg-blue-50 break-words">{p.name}</button>
          ))}
          {sandpit && (
            <>
              <hr className="my-1 border-gray-100" />
              <button onClick={() => onPick(null)}
                className="block w-full text-left px-3 py-2 text-sm text-gray-500 italic rounded hover:bg-gray-50">Sandpit (no project)</button>
            </>
          )}
        </div>

        <div className="flex justify-end px-5 py-3 border-t border-gray-100">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50">Close</button>
        </div>
      </div>
    </div>
  );
}
