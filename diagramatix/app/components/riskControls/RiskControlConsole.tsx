"use client";

import { useCallback, useEffect, useState } from "react";
import { RiskControlEditor } from "./RiskControlEditor";
import { RiskControlAnalytics } from "./RiskControlAnalytics";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import type { RiskControlLibraryDTO } from "@/app/lib/riskControls/types";
import type { ObservedDeviation, ControlEffectiveness } from "@/app/lib/riskControls/controlEffectiveness";

/**
 * Full-screen Risk & Control console for a project — its own screen (like the
 * Simulator / DiagramatixMINER consoles) for catalog maintenance: adopt or
 * create the library, edit Risks / Controls / Policies / Regulations / Findings /
 * KRIs / KPIs and their traceability, export the Risk-Control Matrix, and see
 * control operating-effectiveness from the project's mining conformance. Teal
 * identity throughout.
 */
export function RiskControlConsole({
  projectId, projectName, canEdit, onClose,
}: {
  projectId: string;
  projectName?: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const basePath = `/api/projects/${projectId}/risk-controls`;
  const [library, setLibrary] = useState<RiskControlLibraryDTO | null>(null);
  const [masters, setMasters] = useState<{ id: string; name: string; itemCount: number }[]>([]);
  const [orgName, setOrgName] = useState("");
  const [chosen, setChosen] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [deviations, setDeviations] = useState<ObservedDeviation[] | undefined>(undefined);
  const [effectiveness, setEffectiveness] = useState<Record<string, ControlEffectiveness>>({});
  const [runName, setRunName] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Record<string, string[]>>({});
  const [tab, setTab] = useState<"editor" | "analytics">("editor");

  const refresh = useCallback(async () => {
    const res = await fetch(basePath);
    const j = await res.json().catch(() => ({ library: null }));
    setLibrary(j.library ?? null);
    setLoading(false);
    fetch(`${basePath}/effectiveness`).then((r) => (r.ok ? r.json() : null)).then((e) => {
      if (!e) return;
      setDeviations(e.run ? (e.deviations ?? []) : undefined);
      setEffectiveness(e.effectiveness ?? {});
      setRunName(e.run?.name ?? null);
    }).catch(() => {});
    // Which process steps each Risk/Control is attached to (reverse lookup).
    fetch(`${basePath}/attachments`).then((r) => (r.ok ? r.json() : null)).then((a) => { if (a) setAttachments(a.attachments ?? {}); }).catch(() => {});
  }, [basePath]);

  useEffect(() => {
    refresh();
    fetch(`/api/projects/${projectId}/adopt-risk-controls`)
      .then((r) => (r.ok ? r.json() : { libraries: [] }))
      .then((j) => { setMasters(j.libraries ?? []); setOrgName(j.orgName ?? ""); })
      .catch(() => {});
  }, [refresh, projectId]);

  async function adopt(replace: boolean) {
    if (!chosen) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/adopt-risk-controls${replace ? "?replace=true" : ""}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgLibraryId: chosen }),
      });
      if (res.status === 409) { setConfirmReplace(true); return; }
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error ?? "Adopt failed"); return; }
      setChosen(""); refresh();
    } finally { setBusy(false); }
  }
  async function createEmpty() {
    await fetch(basePath, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Risk & Control Library" }) });
    refresh();
  }

  const controls = library?.items.filter((i) => i.kind === "Control") ?? [];
  const risks = library?.items.filter((i) => i.kind === "Risk") ?? [];
  const gaps = risks.filter((r) => !library!.links.some((l) => l.targetId === r.id && library!.items.find((i) => i.id === l.sourceId)?.kind === "Control")).length;

  return (
    <div className="fixed inset-0 z-50 bg-stone-50 flex flex-col">
      {/* header */}
      <header className="bg-blue-800 text-white px-5 py-3 flex items-center justify-between shadow">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold tracking-tight">◆ Risk &amp; Controls</h1>
          <span className="text-blue-200 text-xs">{projectName ?? "Project"}</span>
          {library && (
            <span className="text-blue-100/80 text-[11px]">
              {library.items.length} items · {library.links.length} links{gaps ? ` · ${gaps} coverage gap${gaps === 1 ? "" : "s"}` : ""}
              {runName && ` · effectiveness from “${runName}”`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {library && <a href={`${basePath}/export`} className="text-xs bg-blue-700 hover:bg-blue-600 rounded px-3 py-1.5">⭳ Export Risk-Control Matrix</a>}
          <button onClick={onClose} className="text-xs bg-blue-900/60 hover:bg-blue-900 rounded px-3 py-1.5">✕ Close</button>
        </div>
      </header>

      {/* body */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-5">
          {err && <p className="text-[11px] text-red-600 mb-3">{err}</p>}
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : library ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px] text-gray-600">
                <span>Library: <span className="font-medium text-gray-800">{library.name}</span></span>
                <span>{risks.length} risks · {controls.length} controls</span>
                {Object.keys(effectiveness).length > 0 && <span className="text-blue-700">{Object.keys(effectiveness).length} controls monitored for bypass</span>}
              </div>
              <div className="mb-3 flex items-center gap-1">
                {(["editor", "analytics"] as const).map((t) => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`text-xs px-3 py-1 rounded ${tab === t ? "bg-blue-700 text-white" : "text-gray-600 border border-gray-300 hover:bg-gray-50"}`}>
                    {t === "editor" ? "Catalog" : "📊 Analytics"}
                  </button>
                ))}
              </div>
              {tab === "analytics" ? (
                <RiskControlAnalytics library={library} effectiveness={effectiveness} attachments={attachments} />
              ) : (
                <div className="bg-white border border-blue-200 rounded-lg p-4">
                  <RiskControlEditor library={library} basePath={basePath} canEdit={canEdit} onChange={refresh} deviations={deviations} effectiveness={effectiveness} attachments={attachments} />
                </div>
              )}
            </>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-xl">
              <h2 className="text-sm font-semibold text-gray-800 mb-1">No Risk &amp; Control library yet</h2>
              <p className="text-xs text-gray-500 mb-4">Adopt your organisation’s master library, or start an empty one and add Risks and Controls.</p>
              {canEdit && (
                <div className="space-y-3">
                  {masters.length > 0 && (
                    <div className="flex items-center gap-2">
                      <select value={chosen} onChange={(e) => setChosen(e.target.value)} disabled={busy} className="text-sm border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 flex-1">
                        <option value="">Adopt from {orgName || "org"}…</option>
                        {masters.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.itemCount})</option>)}
                      </select>
                      <button onClick={() => adopt(false)} disabled={busy || !chosen} className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40">Adopt</button>
                    </div>
                  )}
                  <button onClick={createEmpty} className="text-xs text-blue-700 hover:text-blue-900">+ create empty library</button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {confirmReplace && (
        <ConfirmDialog title="Replace existing library"
          message="This project already has a Risk & Control library. Replace it with the adopted copy? Existing risks/controls are removed."
          confirmLabel="Replace"
          onConfirm={() => { setConfirmReplace(false); adopt(true); }} onCancel={() => setConfirmReplace(false)} />
      )}
    </div>
  );
}
