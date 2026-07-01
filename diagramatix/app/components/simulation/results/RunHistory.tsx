"use client";

/**
 * Browsable Run History for one scenario. Lists its runs (named/pinned ones are
 * kept forever; unnamed ones are the transient recent few), and lets the user:
 * name a run (which pins it), pin/unpin, view its full results, delete it, and
 * select two runs to compare side by side (e.g. "Large Sales Team (25)" vs
 * "Small Sales Team (3)") with the grounded AI assessment.
 */

import { useCallback, useEffect, useState } from "react";
import type { RunMetrics, RunRow } from "@/app/lib/simulation/results";
import { ResultsReport } from "./ResultsReport";
import { CompareView, type CompareEntry } from "./CompareView";
import { PromptDialog } from "@/app/components/PromptDialog";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

type HistRun = Required<Pick<RunRow, "id">> & { name: string | null; pinned: boolean; metrics: RunMetrics | null; error: string | null; startedAt: string };

export function RunHistory({ historyUrl, runItemUrl, assessUrl, refreshKey }: {
  historyUrl: string; runItemUrl: (id: string) => string; assessUrl: string; refreshKey?: number;
}) {
  const [runs, setRuns] = useState<HistRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [renaming, setRenaming] = useState<HistRun | null>(null);
  const [deleting, setDeleting] = useState<HistRun | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(historyUrl);
      if (!res.ok) return;
      const json = await res.json();
      setRuns(((json.runs ?? []) as HistRun[]).filter((r) => !r.error));
    } finally { setLoading(false); }
  }, [historyUrl]);
  useEffect(() => { load(); }, [load, refreshKey]);

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(runItemUrl(id), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load();
  }
  async function del(id: string) {
    await fetch(runItemUrl(id), { method: "DELETE" });
    setSelected((s) => s.filter((x) => x !== id));
    if (openId === id) setOpenId(null);
    load();
  }
  function toggleSelect(id: string) {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : (s.length >= 2 ? [s[1], id] : [...s, id]));
  }

  const label = (r: HistRun) => r.name || `unnamed · ${new Date(r.startedAt).toLocaleString()}`;
  const compareEntries: CompareEntry[] = selected
    .map((id) => runs.find((r) => r.id === id))
    .filter((r): r is HistRun => !!r && !!r.metrics)
    .map((r, i) => ({ key: r.id, name: label(r), isBaseline: i === 0, metrics: r.metrics! }));

  const assessFn = compareEntries.length === 2
    ? async () => {
        const res = await fetch(assessUrl, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baselineRunId: compareEntries[0].key, compareRunId: compareEntries[1].key }),
        });
        const json = await res.json().catch(() => ({}));
        return res.ok ? { assessment: json.assessment } : { error: json.error || "Assessment failed" };
      }
    : undefined;

  const openRun = openId ? runs.find((r) => r.id === openId) : null;

  return (
    <div className="mt-1 flex flex-col gap-1.5">
      {loading && runs.length === 0 && <p className="text-green-400/50 text-[10px]">Loading history…</p>}
      {!loading && runs.length === 0 && <p className="text-green-400/40 text-[10px]">No runs yet — hit ▶ Run, then name the ones worth keeping.</p>}

      {runs.length > 0 && (
        <table className="w-full border-collapse text-[10px]">
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-green-500/10">
                <td className="py-0.5 w-4">
                  <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggleSelect(r.id)} className="accent-green-500 align-middle" title="select to compare" />
                </td>
                <td className="py-0.5 w-4 text-center">
                  <button onClick={() => patch(r.id, { pinned: !r.pinned })} className={r.pinned ? "text-green-300" : "text-green-400/30 hover:text-green-400/70"} title={r.pinned ? "kept (click to unpin)" : "pin to keep"}>
                    {r.pinned ? "★" : "☆"}
                  </button>
                </td>
                <td className="py-0.5">
                  <button onClick={() => setOpenId(openId === r.id ? null : r.id)} className="text-left text-green-300 hover:text-green-200 truncate max-w-[180px]" title="view results">
                    {openId === r.id ? "▾ " : "▸ "}{r.name ? <span className="text-green-200">{r.name}</span> : <span className="text-green-400/50">{label(r)}</span>}
                  </button>
                </td>
                <td className="py-0.5 text-right whitespace-nowrap">
                  <button onClick={() => setRenaming(r)} className="text-green-400/60 hover:text-green-300 mr-2" title="name / rename">✎</button>
                  <button onClick={() => setDeleting(r)} className="text-red-400/70 hover:text-red-300" title="delete">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected.length === 2 && (
        <button onClick={() => setComparing((v) => !v)} className="self-start text-[10px] px-2 py-0.5 rounded border border-green-500/40 text-green-200 hover:bg-green-400/10">
          {comparing ? "▾ hide compare" : "⇄ compare selected"}
        </button>
      )}
      {comparing && compareEntries.length === 2 && (
        <div className="border border-green-500/30 rounded p-2">
          <CompareView entries={compareEntries} assessFn={assessFn} />
        </div>
      )}
      {selected.length === 2 && compareEntries.length < 2 && (
        <p className="text-amber-400/70 text-[10px]">One of the selected runs has no results to compare.</p>
      )}

      {openRun?.metrics && (
        <div className="border border-green-500/30 rounded p-2">
          <ResultsReport key={openRun.id} runUrl={historyUrl} initial={openRun.metrics} />
        </div>
      )}

      {renaming && (
        <PromptDialog
          title="Name this run" message="Naming a run keeps it in the history (e.g. capacity or staffing variants)."
          defaultValue={renaming.name ?? ""} placeholder="e.g. Large Sales Team (25)" confirmLabel="Save"
          onConfirm={(v) => { patch(renaming.id, { name: v }); setRenaming(null); }}
          onCancel={() => setRenaming(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete run" message={`Delete "${label(deleting)}" from the run history?`} destructive
          onConfirm={() => { del(deleting.id); setDeleting(null); }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
