"use client";

/**
 * The list of imports, down the right-hand column.
 *
 * Extracted in Phase 0.2. Pure presentation over `runs`: it selects and it asks
 * to delete — the console owns the confirm dialogs and the actual DELETE, since
 * deleting a run also has to clear the selection.
 */

import type { RunRow } from "./shared";
import { studyNameOf } from "./shared";

export interface RunListProps {
  runs: RunRow[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Ask to delete one run — the console confirms first. */
  onDeleteRun: (run: RunRow) => void;
  /** Ask to delete a whole OCEL study (every object-type run in it). */
  onDeleteStudy: (study: { groupId: string; name: string; count: number }) => void;
}

export function RunList({ runs, selectedId, onSelect, onDeleteRun, onDeleteStudy }: RunListProps) {
  // Group OCEL studies (by ocelGroupId); other imports are single runs.
  const byGroup = new Map<string, RunRow[]>();
  const standalone: RunRow[] = [];
  for (const r of runs) {
    if (r.ocelGroupId) { const g = byGroup.get(r.ocelGroupId) ?? []; g.push(r); byGroup.set(r.ocelGroupId, g); }
    else standalone.push(r);
  }
  const studyName = (rs: RunRow[]) => studyNameOf(rs[0]?.name ?? "");

  return (
    <section className="bg-stone-900 border border-stone-700 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-amber-200 mb-2">Imports</h2>
      <p className="text-[10px] text-stone-500 mb-2">Every import you run is kept here. An OCEL import is grouped as one study with a run per object type.</p>
      {runs.length === 0 && <p className="text-xs text-stone-400">No imports yet — import a log.</p>}
      <div className="flex flex-col gap-2">
        {[...byGroup.entries()].map(([gid, rs]) => (
          <div key={gid} className="rounded border border-emerald-500/25 overflow-hidden">
            <div className="flex items-center gap-2 px-2 py-1 bg-emerald-950/25">
              <span className="flex-1 truncate text-[11px] font-semibold text-emerald-200" title={studyName(rs)}>{studyName(rs)}</span>
              <span className="text-[10px] text-stone-400">{rs.length} entit{rs.length === 1 ? "y" : "ies"}</span>
              <button onClick={() => onDeleteStudy({ groupId: gid, name: studyName(rs), count: rs.length })} className="text-rose-400/70 hover:text-rose-300 px-1" title="Delete this whole import (all its entity runs)">✕</button>
            </div>
            {rs.map((r) => (
              <div key={r.id} className={`flex items-center gap-2 px-2 py-1 text-xs ${selectedId === r.id ? "bg-amber-600/15" : "hover:bg-stone-800"}`}>
                <button onClick={() => onSelect(selectedId === r.id ? null : r.id)} className="flex-1 text-left truncate capitalize text-stone-200" title={r.name}>{r.objectType ?? r.name}</button>
                <span className="text-stone-400">{r.stats?.cases ?? 0}c</span>
                <button onClick={() => onDeleteRun(r)} className="text-rose-400/70 hover:text-rose-300 px-1" title="Delete this entity's run">✕</button>
              </div>
            ))}
          </div>
        ))}
        {standalone.map((r) => (
          <div key={r.id} className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${selectedId === r.id ? "bg-amber-600/15" : "hover:bg-stone-800"}`}>
            <button onClick={() => onSelect(selectedId === r.id ? null : r.id)} className="flex-1 text-left truncate text-stone-200" title={r.name}>{r.name}</button>
            <span className="text-stone-400">{r.stats?.cases ?? 0}c</span>
            <button onClick={() => onDeleteRun(r)} className="text-rose-400/70 hover:text-rose-300 px-1" title="Delete run">✕</button>
          </div>
        ))}
      </div>
    </section>
  );
}
