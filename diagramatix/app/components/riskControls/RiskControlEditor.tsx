"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import {
  CONTROL_TYPES, CONTROL_TYPE_LABELS, RATING_SCALE, riskScore, riskBand,
  type RiskControlLibraryDTO, type RiskControlItemDTO,
} from "@/app/lib/riskControls/types";

/**
 * Reusable editor for ONE Risk & Control library. Two columns — Risks and
 * Controls — each with inline add / edit attributes / delete, plus a mitigation
 * linker (which Controls mitigate each Risk). CRUDs against `basePath` (the org
 * or project risk-controls route). Read-only when `canEdit` is false.
 */
const BAND_COLOR: Record<string, string> = {
  high: "bg-red-100 text-red-700", medium: "bg-amber-100 text-amber-700",
  low: "bg-emerald-100 text-emerald-700", none: "bg-gray-100 text-gray-500",
};

export function RiskControlEditor({
  library, basePath, canEdit, onChange,
}: {
  library: RiskControlLibraryDTO;
  basePath: string;              // /api/orgs/[id]/risk-controls or /api/projects/[id]/risk-controls
  canEdit: boolean;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);

  const risks = library.items.filter((i) => i.kind === "Risk");
  const controls = library.items.filter((i) => i.kind === "Control");
  const itemsUrl = `${basePath}/${library.id}/items`;
  const linksUrl = `${basePath}/${library.id}/links`;
  const controlsForRisk = (riskId: string) => library.links.filter((l) => l.riskId === riskId).map((l) => l.controlId);

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error ?? "Action failed"); return false; }
      onChange();
      return true;
    } finally { setBusy(false); }
  }
  const addItem = (kind: "Risk" | "Control") => call(itemsUrl, "POST", { kind, name: kind === "Risk" ? "New risk" : "New control" });
  const patchItem = (id: string, patch: Record<string, unknown>) => call(`${itemsUrl}/${id}`, "PUT", patch);
  const delItem = (id: string) => call(`${itemsUrl}/${id}`, "DELETE");
  const link = (controlId: string, riskId: string) => call(linksUrl, "POST", { controlId, riskId });
  const unlink = (controlId: string, riskId: string) => call(linksUrl, "DELETE", { controlId, riskId });

  const inp = "border border-gray-300 rounded px-1.5 py-0.5 text-xs";

  return (
    <div className="space-y-4">
      {err && <p className="text-[11px] text-red-500">{err}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {/* ── Risks ── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Risks ({risks.length})</h4>
            {canEdit && <button onClick={() => addItem("Risk")} disabled={busy} className="text-[11px] text-blue-600 hover:text-blue-800">+ Add risk</button>}
          </div>
          {risks.length === 0 && <p className="text-xs text-gray-400 italic">No risks yet.</p>}
          {risks.map((r) => {
            const score = riskScore(r);
            return (
              <div key={r.id} className="border border-gray-200 rounded p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-gray-500">{r.code}</span>
                  {canEdit ? (
                    <input defaultValue={r.name} onBlur={(e) => e.target.value.trim() !== r.name && patchItem(r.id, { name: e.target.value })} className={`${inp} flex-1`} />
                  ) : <span className="text-xs flex-1">{r.name}</span>}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${BAND_COLOR[riskBand(score)]}`}>{score ?? "—"}</span>
                  {canEdit && <button onClick={() => setEditId(editId === r.id ? null : r.id)} className="text-[11px] text-gray-500 hover:text-gray-800">{editId === r.id ? "▾" : "▸"}</button>}
                  {canEdit && <button onClick={() => setConfirm({ id: r.id, name: r.name })} className="text-[11px] text-red-500 hover:text-red-700">✕</button>}
                </div>
                {editId === r.id && canEdit && (
                  <div className="flex flex-wrap gap-1.5 text-[10px] items-center">
                    <label className="flex items-center gap-1">L
                      <select defaultValue={r.likelihood ?? ""} onChange={(e) => patchItem(r.id, { likelihood: e.target.value })} className={inp}>
                        <option value="">—</option>{RATING_SCALE.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select></label>
                    <label className="flex items-center gap-1">I
                      <select defaultValue={r.impact ?? ""} onChange={(e) => patchItem(r.id, { impact: e.target.value })} className={inp}>
                        <option value="">—</option>{RATING_SCALE.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select></label>
                    <input defaultValue={r.riskCategory ?? ""} placeholder="category" onBlur={(e) => patchItem(r.id, { riskCategory: e.target.value })} className={`${inp} w-24`} />
                  </div>
                )}
                {/* mitigating controls */}
                <div className="flex flex-wrap gap-1 items-center">
                  {controlsForRisk(r.id).map((cid) => {
                    const c = controls.find((x) => x.id === cid);
                    return <span key={cid} className="text-[10px] bg-blue-50 text-blue-700 rounded px-1.5 py-0.5 flex items-center gap-1">{c?.code ?? "?"}{canEdit && <button onClick={() => unlink(cid, r.id)} className="text-blue-400 hover:text-blue-700">×</button>}</span>;
                  })}
                  {controlsForRisk(r.id).length === 0 && <span className="text-[10px] text-red-500">no control — coverage gap</span>}
                  {canEdit && controls.length > 0 && (
                    <select value="" onChange={(e) => e.target.value && link(e.target.value, r.id)} className="text-[10px] border border-gray-200 rounded px-1 py-0.5">
                      <option value="">+ link control…</option>
                      {controls.filter((c) => !controlsForRisk(r.id).includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* ── Controls ── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Controls ({controls.length})</h4>
            {canEdit && <button onClick={() => addItem("Control")} disabled={busy} className="text-[11px] text-blue-600 hover:text-blue-800">+ Add control</button>}
          </div>
          {controls.length === 0 && <p className="text-xs text-gray-400 italic">No controls yet.</p>}
          {controls.map((c) => (
            <div key={c.id} className="border border-gray-200 rounded p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-gray-500">{c.code}</span>
                {canEdit ? (
                  <input defaultValue={c.name} onBlur={(e) => e.target.value.trim() !== c.name && patchItem(c.id, { name: e.target.value })} className={`${inp} flex-1`} />
                ) : <span className="text-xs flex-1">{c.name}</span>}
                {canEdit && <button onClick={() => setEditId(editId === c.id ? null : c.id)} className="text-[11px] text-gray-500 hover:text-gray-800">{editId === c.id ? "▾" : "▸"}</button>}
                {canEdit && <button onClick={() => setConfirm({ id: c.id, name: c.name })} className="text-[11px] text-red-500 hover:text-red-700">✕</button>}
              </div>
              {editId === c.id && canEdit && (
                <div className="flex flex-wrap gap-1.5 text-[10px] items-center">
                  <select defaultValue={c.controlType ?? ""} onChange={(e) => patchItem(c.id, { controlType: e.target.value })} className={inp}>
                    <option value="">type…</option>{CONTROL_TYPES.map((t) => <option key={t} value={t}>{CONTROL_TYPE_LABELS[t]}</option>)}
                  </select>
                  <input defaultValue={c.frequency ?? ""} placeholder="frequency" onBlur={(e) => patchItem(c.id, { frequency: e.target.value })} className={`${inp} w-20`} />
                  <input defaultValue={c.owner ?? ""} placeholder="owner" onBlur={(e) => patchItem(c.id, { owner: e.target.value })} className={`${inp} w-20`} />
                  <input defaultValue={c.frameworkRef ?? ""} placeholder="framework (SOX…)" onBlur={(e) => patchItem(c.id, { frameworkRef: e.target.value })} className={`${inp} w-28`} />
                </div>
              )}
              {(c.controlType || c.owner) && (
                <div className="text-[10px] text-gray-500">{c.controlType ? CONTROL_TYPE_LABELS[c.controlType] : ""}{c.owner ? ` · ${c.owner}` : ""}{c.frameworkRef ? ` · ${c.frameworkRef}` : ""}</div>
              )}
            </div>
          ))}
        </section>
      </div>

      {confirm && (
        <ConfirmDialog title="Delete item" message={`Delete "${confirm.name}"? Its mitigation links are removed too.`} destructive
          onConfirm={() => { delItem(confirm.id); setConfirm(null); }} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
