"use client";

import { useState } from "react";
import type { DiagramElement } from "@/app/lib/diagram/types";
import { getRiskControl, riskControlPatch, type RiskControlRef } from "@/app/lib/diagram/riskControl";
import type { RiskControlKind } from "@/app/lib/riskControls/types";

/** Catalog items available to attach (from the project's Risk & Control library).
 *  Steps carry Risks + Controls (the RCM); governance objects link to those in
 *  the catalog rather than attaching directly to a step. */
export interface RiskCatalogItem { id: string; code: string; name: string; kind: RiskControlKind; }

const ATTACHABLE = new Set(["task", "subprocess", "subprocess-expanded", "call-activity", "transaction", "gateway", "data-object", "data-store"]);

/**
 * Properties-panel section for attaching catalog Risks and Controls to a step.
 * Stores lightweight references in element.properties.risk (mirrors the sim
 * params pattern). Shown only for activity/gateway/data element types.
 */
export function RiskControlSection({
  element, catalog, onUpdateProperties, onCreate, open: controlledOpen, onToggle,
}: {
  element: DiagramElement;
  catalog: RiskCatalogItem[];
  onUpdateProperties: (id: string, props: Record<string, unknown>) => void;
  /** Create a new catalog Risk/Control from the diagram, then attach it. */
  onCreate?: (kind: "Risk" | "Control", name: string) => Promise<RiskCatalogItem | null>;
  /** Controlled open state (owned by the editor so it's sticky across diagrams
   *  and drives the canvas highlight). Falls back to local state if omitted. */
  open?: boolean;
  onToggle?: (open: boolean) => void;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = (next: boolean) => { if (onToggle) onToggle(next); else setLocalOpen(next); };
  const [creating, setCreating] = useState<null | "risk" | "control">(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const gatewayLike = element.type === "gateway" || element.type.startsWith("gateway");
  if (!ATTACHABLE.has(element.type) && !gatewayLike) return null;

  const rc = getRiskControl(element);
  const risks = catalog.filter((c) => c.kind === "Risk");
  const controls = catalog.filter((c) => c.kind === "Control");
  const attach = (kind: "risk" | "control", item: RiskCatalogItem) => {
    const key = kind === "risk" ? "riskRefs" : "controlRefs";
    const cur = (rc[key] ?? []) as RiskControlRef[];
    if (cur.some((r) => r.itemId === item.id)) return;
    onUpdateProperties(element.id, riskControlPatch(element, { [key]: [...cur, { itemId: item.id, code: item.code, label: item.name }] }));
  };
  const createAndAttach = async (kind: "risk" | "control") => {
    if (!onCreate || !newName.trim() || busy) return;
    setBusy(true);
    try {
      const item = await onCreate(kind === "risk" ? "Risk" : "Control", newName);
      if (item) attach(kind, item);
      setNewName(""); setCreating(null);
    } finally { setBusy(false); }
  };
  const createRow = (kind: "risk" | "control") => onCreate && (
    creating === kind ? (
      <div className="flex items-center gap-1">
        <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void createAndAttach(kind); if (e.key === "Escape") { setCreating(null); setNewName(""); } }}
          placeholder={`New ${kind} name…`} className="text-[10px] border border-gray-300 rounded px-1 py-0.5 flex-1" />
        <button onClick={() => void createAndAttach(kind)} disabled={busy || !newName.trim()} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white disabled:opacity-40">{busy ? "…" : "Add"}</button>
        <button onClick={() => { setCreating(null); setNewName(""); }} className="text-[10px] text-gray-400 px-1">✕</button>
      </div>
    ) : (
      <button onClick={() => { setCreating(kind); setNewName(""); }} className="text-[10px] text-blue-600 hover:text-blue-800">＋ new {kind}</button>
    )
  );
  const detach = (kind: "risk" | "control", itemId: string) => {
    const key = kind === "risk" ? "riskRefs" : "controlRefs";
    const cur = (rc[key] ?? []) as RiskControlRef[];
    onUpdateProperties(element.id, riskControlPatch(element, { [key]: cur.filter((r) => r.itemId !== itemId) }));
  };

  const hasRisk = !!rc.riskRefs?.length;
  const gap = hasRisk && !rc.controlRefs?.length;

  const chip = (kind: "risk" | "control", r: RiskControlRef) => (
    <span key={r.itemId} className={`text-[10px] rounded px-1.5 py-0.5 flex items-center gap-1 ${kind === "risk" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
      {r.code} {r.label}
      <button onClick={() => detach(kind, r.itemId)} className="opacity-60 hover:opacity-100">×</button>
    </span>
  );

  return (
    <div className="border-t border-gray-200 pt-2 mt-2">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-[11px] font-medium text-gray-700">
        <span>Risk &amp; Controls {(rc.riskRefs?.length || rc.controlRefs?.length) ? <span className="text-gray-400">({(rc.riskRefs?.length ?? 0) + (rc.controlRefs?.length ?? 0)})</span> : null}{gap && <span className="text-red-500 ml-1">• gap</span>}</span>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {catalog.length === 0 && <p className="text-[10px] text-gray-400 italic">No project Risk &amp; Control library. Add one in the project’s Risk &amp; Controls panel.</p>}
          {/* Risks */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-gray-400">Risks</p>
            <div className="flex flex-wrap gap-1">{(rc.riskRefs ?? []).map((r) => chip("risk", r))}</div>
            {risks.length > 0 && (
              <select value="" onChange={(e) => { const it = risks.find((x) => x.id === e.target.value); if (it) attach("risk", it); }} className="text-[10px] border border-gray-200 rounded px-1 py-0.5 w-full">
                <option value="">+ attach risk…</option>
                {risks.map((r) => <option key={r.id} value={r.id}>{r.code} {r.name}</option>)}
              </select>
            )}
            {createRow("risk")}
          </div>
          {/* Controls */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-gray-400">Controls</p>
            <div className="flex flex-wrap gap-1">{(rc.controlRefs ?? []).map((r) => chip("control", r))}</div>
            {controls.length > 0 && (
              <select value="" onChange={(e) => { const it = controls.find((x) => x.id === e.target.value); if (it) attach("control", it); }} className="text-[10px] border border-gray-200 rounded px-1 py-0.5 w-full">
                <option value="">+ attach control…</option>
                {controls.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
              </select>
            )}
            {createRow("control")}
          </div>
          {gap && <p className="text-[10px] text-red-500">This step has a risk with no control (coverage gap — flagged by the diagram scan).</p>}
        </div>
      )}
    </div>
  );
}
