"use client";

/**
 * Full-screen, filterable view of a parsed event log (from CSV / XES / OCEL — they
 * all normalise to headers + rows), so you can see exactly what is being imported.
 * Free-text search across all columns + a per-column dropdown filter on
 * low-cardinality columns (activity / resource / state / …). Render-capped for a
 * large log; narrow the filters to see more.
 */
import { useEffect, useMemo, useState } from "react";

const RENDER_CAP = 2000;

export function MiningLogViewer({ headers, rows, title, onClose }: { headers: string[]; rows: string[][]; title?: string; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [colFilters, setColFilters] = useState<Record<number, string>>({});

  // Distinct values per column (for a dropdown) — only when low-cardinality.
  const distinct = useMemo(() => headers.map((_, ci) => {
    const s = new Set<string>();
    for (const r of rows) { s.add(r[ci] ?? ""); if (s.size > 60) return null; }
    return [...s].sort();
  }), [headers, rows]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const active = Object.entries(colFilters).filter(([, v]) => v);
    if (!ql && active.length === 0) return rows;
    return rows.filter((r) => {
      if (ql && !r.some((c) => (c ?? "").toLowerCase().includes(ql))) return false;
      for (const [ci, v] of active) if ((r[Number(ci)] ?? "") !== v) return false;
      return true;
    });
  }, [rows, q, colFilters]);
  const shown = filtered.slice(0, RENDER_CAP);
  const anyFilter = !!q || Object.values(colFilters).some(Boolean);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  return (
    <div data-no-capture className="fixed inset-0 z-[80] bg-stone-950/97 flex flex-col font-mono">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-amber-900/50 shrink-0 flex-wrap">
        <h3 className="text-sm font-semibold text-amber-200">{title ?? "Event log"}</h3>
        <span className="text-[11px] text-stone-400">{filtered.length.toLocaleString()} / {rows.length.toLocaleString()} rows</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all columns…"
          className="bg-stone-800 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs w-56" />
        {anyFilter && <button onClick={() => { setQ(""); setColFilters({}); }} className="text-[11px] text-amber-300 hover:text-amber-200 underline">clear filters</button>}
        <button onClick={onClose} className="ml-auto text-xs bg-amber-700 hover:bg-amber-600 text-white rounded px-3 py-1">↩ Close</button>
      </div>
      <div className="flex-1 overflow-auto p-3">
        <table className="text-[11px] border-collapse">
          <thead className="sticky top-0 bg-stone-900 z-10">
            <tr>
              {headers.map((h, ci) => (
                <th key={ci} className="text-left text-stone-200 font-semibold px-2 py-1 border-b border-stone-700 align-top">
                  <div>{h}</div>
                  {distinct[ci] && (
                    <select value={colFilters[ci] ?? ""} onChange={(e) => setColFilters((f) => ({ ...f, [ci]: e.target.value }))}
                      className="mt-1 bg-stone-800 border border-stone-600 rounded px-1 py-0.5 text-[10px] text-stone-200 font-normal max-w-[12rem]">
                      <option value="">(all)</option>
                      {distinct[ci]!.map((v) => <option key={v} value={v}>{v || "(blank)"}</option>)}
                    </select>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, ri) => (
              <tr key={ri} className="hover:bg-stone-800/50">
                {headers.map((_, ci) => <td key={ci} className="px-2 py-0.5 text-stone-300 whitespace-nowrap border-b border-stone-800/50">{r[ci] ?? ""}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > shown.length && (
          <p className="text-[10px] text-stone-500 mt-2">Showing the first {shown.length.toLocaleString()} of {filtered.length.toLocaleString()} matching rows — narrow the filters to see the rest.</p>
        )}
        {filtered.length === 0 && <p className="text-[11px] text-stone-500 mt-3">No rows match the filters.</p>}
      </div>
    </div>
  );
}
