"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import {
  RISK_CONTROL_KINDS, KIND_LABEL, KIND_LABEL_PLURAL,
  CONTROL_TYPES, CONTROL_TYPE_LABELS, CONTROL_AUTOMATIONS, CONTROL_AUTOMATION_LABELS,
  RATING_SCALE, riskScore, riskBand, relationVerb, aIsSource,
  type RiskControlLibraryDTO, type RiskControlItemDTO, type RiskControlKind,
} from "@/app/lib/riskControls/types";
import type { ObservedDeviation, ControlEffectiveness } from "@/app/lib/riskControls/controlEffectiveness";

/**
 * Reusable editor for ONE GRC library. A section per item kind (Risks, Controls,
 * Policies, Regulations, Audit Findings, KRIs, KPIs); each item has inline
 * attributes + a generic traceability linker (relate this item to any other —
 * a Control→Risk edge is the RCM mitigation). CRUDs against `basePath`.
 */
const BAND_COLOR: Record<string, string> = {
  high: "bg-red-100 text-red-700", medium: "bg-amber-100 text-amber-700",
  low: "bg-emerald-100 text-emerald-700", none: "bg-gray-100 text-gray-500",
};

export function RiskControlEditor({
  library, basePath, canEdit, onChange, deviations, effectiveness, attachments,
}: {
  library: RiskControlLibraryDTO;
  basePath: string;
  canEdit: boolean;
  onChange: () => void;
  /** Observed mining deviations to map controls against (project context only). */
  deviations?: ObservedDeviation[];
  /** Per-control operating effectiveness from the latest conformance run. */
  effectiveness?: Record<string, ControlEffectiveness>;
  /** Per-item process steps it's attached to ("<Diagram> — <Step>"), reverse lookup. */
  attachments?: Record<string, string[]>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  // Collapsible kind sections — the RCM core (Risks + Controls) open by default,
  // the wider governance kinds folded away.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(["Policy", "Regulation", "AuditFinding", "KRI", "KPI"]));
  const toggle = (kind: string) => setCollapsed((c) => { const n = new Set(c); n.has(kind) ? n.delete(kind) : n.add(kind); return n; });

  const byId = new Map(library.items.map((i) => [i.id, i]));
  const itemsUrl = `${basePath}/${library.id}/items`;
  const linksUrl = `${basePath}/${library.id}/links`;

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error ?? "Action failed"); return false; }
      onChange();
      return true;
    } finally { setBusy(false); }
  }
  const addItem = (kind: RiskControlKind) => call(itemsUrl, "POST", { kind, name: `New ${KIND_LABEL[kind].toLowerCase()}` });
  const patchItem = (id: string, patch: Record<string, unknown>) => call(`${itemsUrl}/${id}`, "PUT", patch);
  const delItem = (id: string) => call(`${itemsUrl}/${id}`, "DELETE");
  const linkPair = (a: RiskControlItemDTO, b: RiskControlItemDTO) => {
    const [sourceId, targetId] = aIsSource(a.kind, b.kind) ? [a.id, b.id] : [b.id, a.id];
    return call(linksUrl, "POST", { sourceId, targetId });
  };
  const unlink = (sourceId: string, targetId: string) => call(linksUrl, "DELETE", { sourceId, targetId });

  // Edges touching an item, oriented for display.
  const edgesOf = (id: string) => library.links
    .filter((l) => l.sourceId === id || l.targetId === id)
    .map((l) => {
      const other = byId.get(l.sourceId === id ? l.targetId : l.sourceId);
      const src = byId.get(l.sourceId), tgt = byId.get(l.targetId);
      const verb = src && tgt ? relationVerb(src.kind, tgt.kind) : "relates to";
      return { link: l, other, verb, outgoing: l.sourceId === id };
    })
    .filter((e) => e.other);

  const inp = "border border-gray-300 rounded px-1.5 py-0.5 text-xs";

  const renderAttrs = (it: RiskControlItemDTO) => {
    if (it.kind === "Risk") return (
      <div className="flex flex-wrap gap-1.5 text-[10px] items-center">
        <label className="flex items-center gap-1">L
          <select defaultValue={it.likelihood ?? ""} onChange={(e) => patchItem(it.id, { likelihood: e.target.value })} className={inp}>
            <option value="">—</option>{RATING_SCALE.map((n) => <option key={n} value={n}>{n}</option>)}
          </select></label>
        <label className="flex items-center gap-1">I
          <select defaultValue={it.impact ?? ""} onChange={(e) => patchItem(it.id, { impact: e.target.value })} className={inp}>
            <option value="">—</option>{RATING_SCALE.map((n) => <option key={n} value={n}>{n}</option>)}
          </select></label>
        <input defaultValue={it.riskCategory ?? ""} placeholder="category" onBlur={(e) => patchItem(it.id, { riskCategory: e.target.value })} className={`${inp} w-24`} />
        <span className="text-gray-400">residual</span>
        <label className="flex items-center gap-1">L
          <select defaultValue={it.residualLikelihood ?? ""} onChange={(e) => patchItem(it.id, { residualLikelihood: e.target.value })} className={inp}>
            <option value="">—</option>{RATING_SCALE.map((n) => <option key={n} value={n}>{n}</option>)}
          </select></label>
        <label className="flex items-center gap-1">I
          <select defaultValue={it.residualImpact ?? ""} onChange={(e) => patchItem(it.id, { residualImpact: e.target.value })} className={inp}>
            <option value="">—</option>{RATING_SCALE.map((n) => <option key={n} value={n}>{n}</option>)}
          </select></label>
      </div>
    );
    if (it.kind === "Control") return (
      <div className="flex flex-wrap gap-1.5 text-[10px] items-center">
        <select defaultValue={it.controlType ?? ""} onChange={(e) => patchItem(it.id, { controlType: e.target.value })} className={inp}>
          <option value="">type…</option>{CONTROL_TYPES.map((t) => <option key={t} value={t}>{CONTROL_TYPE_LABELS[t]}</option>)}
        </select>
        <select defaultValue={it.automation ?? ""} onChange={(e) => patchItem(it.id, { automation: e.target.value })} className={inp}>
          <option value="">automation…</option>{CONTROL_AUTOMATIONS.map((a) => <option key={a} value={a}>{CONTROL_AUTOMATION_LABELS[a]}</option>)}
        </select>
        <input defaultValue={it.frequency ?? ""} placeholder="frequency" onBlur={(e) => patchItem(it.id, { frequency: e.target.value })} className={`${inp} w-20`} />
        <input defaultValue={it.owner ?? ""} placeholder="owner" onBlur={(e) => patchItem(it.id, { owner: e.target.value })} className={`${inp} w-20`} />
        <input defaultValue={it.frameworkRef ?? ""} placeholder="framework (SOX…)" onBlur={(e) => patchItem(it.id, { frameworkRef: e.target.value })} className={`${inp} w-28`} />
        <input defaultValue={it.evidence ?? ""} placeholder="evidence" onBlur={(e) => patchItem(it.id, { evidence: e.target.value })} className={`${inp} w-32`} />
        <input defaultValue={it.testMethod ?? ""} placeholder="test method" onBlur={(e) => patchItem(it.id, { testMethod: e.target.value })} className={`${inp} w-28`} />
        <input defaultValue={it.testFrequency ?? ""} placeholder="test freq" onBlur={(e) => patchItem(it.id, { testFrequency: e.target.value })} className={`${inp} w-20`} />
        {deviations !== undefined && (
          <select defaultValue={it.monitorSignature ?? ""} onChange={(e) => patchItem(it.id, { monitorSignature: e.target.value })} className={inp} title="Which mining deviation a bypass of this control produces">
            <option value="">monitors deviation… (mining)</option>
            {[...(deviations ?? []),
              ...(it.monitorSignature && !(deviations ?? []).some((d) => d.signature === it.monitorSignature)
                ? [{ signature: it.monitorSignature, label: it.monitorSignature, rule: "", cases: 0 }] : [])]
              .map((d) => <option key={d.signature} value={d.signature}>{d.label}{d.cases ? ` (${d.cases})` : ""}</option>)}
          </select>
        )}
      </div>
    );
    // Policy / Regulation / Audit Finding / KRI / KPI — generic governance fields.
    return (
      <div className="flex flex-wrap gap-1.5 text-[10px] items-center">
        <input defaultValue={it.description ?? ""} placeholder="description" onBlur={(e) => patchItem(it.id, { description: e.target.value })} className={`${inp} w-48`} />
        <input defaultValue={it.owner ?? ""} placeholder="owner" onBlur={(e) => patchItem(it.id, { owner: e.target.value })} className={`${inp} w-24`} />
        <input defaultValue={it.frameworkRef ?? ""} placeholder="reference" onBlur={(e) => patchItem(it.id, { frameworkRef: e.target.value })} className={`${inp} w-28`} />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {err && <p className="text-[11px] text-red-500">{err}</p>}
      {RISK_CONTROL_KINDS.map((kind) => {
        const items = library.items.filter((i) => i.kind === kind);
        const isOpen = !collapsed.has(kind);
        return (
          <section key={kind} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <button onClick={() => toggle(kind)} className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wide hover:text-gray-900">
                <span className="text-gray-400 text-[10px] w-3">{isOpen ? "▾" : "▸"}</span>
                {KIND_LABEL_PLURAL[kind]} <span className="text-gray-400 font-normal">({items.length})</span>
              </button>
              {canEdit && isOpen && <button onClick={() => addItem(kind)} disabled={busy} className="text-[11px] text-blue-700 hover:text-blue-900">+ Add {KIND_LABEL[kind].toLowerCase()}</button>}
            </div>
            {isOpen && items.map((it) => {
              const score = kind === "Risk" ? riskScore(it) : null;
              const edges = edgesOf(it.id);
              return (
                <div key={it.id} className="border border-gray-200 rounded p-2 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-gray-500">{it.code}</span>
                    {canEdit ? (
                      <input defaultValue={it.name} onBlur={(e) => e.target.value.trim() !== it.name && patchItem(it.id, { name: e.target.value })} className={`${inp} flex-1`} />
                    ) : <span className="text-xs flex-1">{it.name}</span>}
                    {kind === "Risk" && <span className={`text-[10px] px-1.5 py-0.5 rounded ${BAND_COLOR[riskBand(score)]}`}>{score ?? "—"}</span>}
                    {kind === "Control" && effectiveness?.[it.id] && (() => {
                      const e = effectiveness[it.id]; const pct = e.effectivenessPct;
                      const cls = pct == null ? "bg-gray-100 text-gray-500" : pct >= 95 ? "bg-emerald-100 text-emerald-700" : pct >= 80 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
                      const src = e.source === "log" ? "from mined Control IDs on events" : "from mining conformance";
                      return <span className={`text-[10px] px-1.5 py-0.5 rounded ${cls}`} title={`Bypassed in ${e.bypassedCases} of ${e.totalCases} cases (${src})`}>{pct == null ? "—" : `${pct}%`}{e.bypassedCases ? ` · ${e.bypassedCases} bypassed` : ""}</span>;
                    })()}
                    {canEdit && <button onClick={() => setEditId(editId === it.id ? null : it.id)} className="text-[11px] text-gray-500 hover:text-gray-800">{editId === it.id ? "▾" : "▸"}</button>}
                    {canEdit && <button onClick={() => setConfirm({ id: it.id, name: it.name })} className="text-[11px] text-red-500 hover:text-red-700">✕</button>}
                  </div>
                  {editId === it.id && canEdit && renderAttrs(it)}
                  {/* traceability links */}
                  <div className="flex flex-wrap gap-1 items-center">
                    {edges.map((e) => (
                      <span key={e.link.id} className="text-[10px] bg-blue-50 text-blue-700 rounded px-1.5 py-0.5 flex items-center gap-1" title={`${e.outgoing ? "" : "← "}${e.verb}${e.outgoing ? " →" : ""} ${e.other!.name}`}>
                        {e.outgoing ? "" : "← "}{e.verb} {e.other!.code}{e.outgoing ? " →" : ""}
                        {canEdit && <button onClick={() => unlink(e.link.sourceId, e.link.targetId)} className="text-blue-500 hover:text-blue-700">×</button>}
                      </span>
                    ))}
                    {kind === "Risk" && !edges.some((e) => byId.get(e.link.sourceId)?.kind === "Control") && (
                      <span className="text-[10px] text-red-500">no control — coverage gap</span>
                    )}
                    {canEdit && library.items.length > 1 && (
                      <select value="" onChange={(e) => { const o = byId.get(e.target.value); if (o) linkPair(it, o); }} className="text-[10px] border border-gray-200 rounded px-1 py-0.5">
                        <option value="">+ link…</option>
                        {library.items.filter((o) => o.id !== it.id && !edges.some((e) => e.other!.id === o.id))
                          .map((o) => <option key={o.id} value={o.id}>{KIND_LABEL[o.kind]}: {o.code} {o.name}</option>)}
                      </select>
                    )}
                  </div>
                  {/* Which process steps this item is attached to (reverse lookup). */}
                  {attachments?.[it.id]?.length ? (
                    <div className="text-[10px] text-gray-500 mt-0.5" title={attachments[it.id].join("\n")}>
                      <span className="text-gray-400">on:</span> {attachments[it.id].slice(0, 3).join(" · ")}{attachments[it.id].length > 3 ? ` +${attachments[it.id].length - 3} more` : ""}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        );
      })}

      {confirm && (
        <ConfirmDialog title="Delete item" message={`Delete "${confirm.name}"? Its links are removed too.`} destructive
          onConfirm={() => { delItem(confirm.id); setConfirm(null); }} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
