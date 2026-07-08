"use client";

import { useEffect, useState } from "react";

interface Preview {
  hasPrevious: boolean;
  from?: { variant: string; version: string };
  to?: { variant: string; version: string };
  summary?: { added: number; removed: number; renamed: number; unchanged: number };
  added?: { hierarchyId: string; name: string }[];
  removed?: { hierarchyId: string; name: string }[];
  renamed?: { hierarchyId: string; oldName: string; newName: string }[];
  impact?: { classifications: number; classificationsOrphaned: number; tailored: number; tailoredOrphaned: number };
}

/**
 * Version upgrade wizard (L5). Previews the diff of the selected reference
 * framework vs its predecessor (by stable pcfId) + this org's usage impact, then
 * (Apply) re-points classifications + tailored-node provenance to the new version.
 */
export function PcfUpgradeModal({ orgId, frameworkId, onClose, onApplied }: {
  orgId: string; frameworkId: string; onClose: () => void; onApplied: () => void;
}) {
  const base = `/api/orgs/${orgId}/pcf/${frameworkId}/upgrade`;
  const [p, setP] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ repointed: number; flaggedRemoved: number; tailoredRepointed: number } | null>(null);

  useEffect(() => {
    fetch(base).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error ?? "Failed"); return; } setP(j); })
      .catch(() => setErr("Failed to load"));
  }, [base]);

  async function apply() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(base, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "Apply failed"); return; }
      setResult(j);
      onApplied();
    } catch { setErr("Apply failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={busy ? undefined : onClose}>
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-[560px] max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Version upgrade</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
        </div>

        <div className="p-5 overflow-y-auto">
          {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
          {!p && !err && <p className="text-xs text-gray-400">Computing diff…</p>}

          {p && p.hasPrevious === false && (
            <p className="text-xs text-gray-500">This framework has no earlier version to upgrade from. Import a newer workbook of the same variant first — it supersedes the previous version, then this wizard re-points your usage.</p>
          )}

          {p?.hasPrevious && p.summary && (
            <>
              <p className="text-xs text-gray-600 mb-3">
                Upgrading <span className="font-medium">{p.from?.variant} v{p.from?.version}</span> → <span className="font-medium text-emerald-700">v{p.to?.version}</span>
              </p>
              <div className="flex gap-4 mb-4 text-[11px]">
                <span className="text-emerald-700">+{p.summary.added} added</span>
                <span className="text-amber-700">{p.summary.renamed} renamed</span>
                <span className="text-red-600">−{p.summary.removed} removed</span>
                <span className="text-gray-400">{p.summary.unchanged} unchanged</span>
              </div>

              {p.impact && (
                <div className="rounded border border-gray-200 bg-gray-50/60 p-3 mb-4 text-[11px] text-gray-700 space-y-1">
                  <p className="uppercase text-[9px] tracking-wide text-gray-400">Your usage</p>
                  <p>{p.impact.classifications} classified diagram{p.impact.classifications === 1 ? "" : "s"} on the old version{p.impact.classificationsOrphaned > 0 && <span className="text-red-600"> — {p.impact.classificationsOrphaned} point at removed processes (will be flagged)</span>}</p>
                  <p>{p.impact.tailored} tailored node{p.impact.tailored === 1 ? "" : "s"} sourced from it{p.impact.tailoredOrphaned > 0 && <span className="text-red-600"> — {p.impact.tailoredOrphaned} from removed processes (left as-is, flagged)</span>}</p>
                </div>
              )}

              {result ? (
                <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-800">
                  Done — re-pointed {result.repointed} classification{result.repointed === 1 ? "" : "s"} and {result.tailoredRepointed} tailored node{result.tailoredRepointed === 1 ? "" : "s"}{result.flaggedRemoved > 0 ? `; flagged ${result.flaggedRemoved} on removed processes` : ""}.
                </div>
              ) : (
                <>
                  <DiffList title="Removed" tone="text-red-600" items={(p.removed ?? []).map((n) => `${n.hierarchyId} ${n.name}`)} />
                  <DiffList title="Renamed" tone="text-amber-700" items={(p.renamed ?? []).map((n) => `${n.hierarchyId} ${n.oldName} → ${n.newName}`)} />
                  <DiffList title="Added" tone="text-emerald-700" items={(p.added ?? []).map((n) => `${n.hierarchyId} ${n.name}`)} />
                </>
              )}
            </>
          )}
        </div>

        {p?.hasPrevious && !result && (
          <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
            <button onClick={onClose} disabled={busy} className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
            <button onClick={apply} disabled={busy} className="px-3 py-1 text-xs text-white bg-emerald-600 rounded hover:bg-emerald-700 disabled:opacity-50">{busy ? "Applying…" : "Apply upgrade"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function DiffList({ title, tone, items }: { title: string; tone: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      <p className={`text-[10px] uppercase tracking-wide mb-1 ${tone}`}>{title} ({items.length}{items.length === 200 ? "+" : ""})</p>
      <div className="max-h-32 overflow-y-auto text-[11px] text-gray-700 space-y-0.5">
        {items.map((s, i) => <p key={i} className="truncate" title={s}>{s}</p>)}
      </div>
    </div>
  );
}
