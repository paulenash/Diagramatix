"use client";

import { useCallback, useEffect, useState } from "react";
import { RiskControlEditor } from "./RiskControlEditor";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import type { RiskControlLibraryDTO } from "@/app/lib/riskControls/types";

/**
 * Project-level Risk & Control library: adopt an org master (a COPY the project
 * edits independently) or create one, attach Risks/Controls to steps on the
 * canvas, and export the Risk-Control Matrix. Owner-editable; read-only otherwise.
 */
export function ProjectRiskControlSection({
  projectId, canEdit,
}: {
  projectId: string;
  canEdit: boolean;
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
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(basePath);
    const j = await res.json().catch(() => ({ library: null }));
    setLibrary(j.library ?? null);
    setLoading(false);
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
      const res = await fetch(`${basePath.replace("/risk-controls", "")}/adopt-risk-controls${replace ? "?replace=true" : ""}`, {
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

  return (
    <div className="border-b border-gray-100">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-medium text-gray-700 hover:bg-gray-50">
        <span>Risk &amp; Controls <span className="text-gray-400 ml-1">— risks, controls &amp; the Risk-Control Matrix</span></span>
        <span className="text-gray-400">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="space-y-3 px-3 pb-3">
          {err && <p className="text-[11px] text-red-500">{err}</p>}
          {loading ? <p className="text-xs text-gray-400">Loading…</p> : library ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-gray-600">Library: <span className="font-medium">{library.name}</span></p>
                <a href={`${basePath}/export`} className="text-[11px] text-blue-600 hover:text-blue-800">⭳ Export Risk-Control Matrix (.xlsx)</a>
              </div>
              <RiskControlEditor library={library} basePath={basePath} canEdit={canEdit} onChange={refresh} />
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-gray-500">No Risk &amp; Control library in this project yet.</p>
              {canEdit && (
                <div className="space-y-1.5">
                  {masters.length > 0 && (
                    <div className="flex items-center gap-2">
                      <select value={chosen} onChange={(e) => setChosen(e.target.value)} disabled={busy} className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700">
                        <option value="">Adopt from {orgName || "org"}…</option>
                        {masters.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.itemCount})</option>)}
                      </select>
                      <button onClick={() => adopt(false)} disabled={busy || !chosen} className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40">Adopt</button>
                    </div>
                  )}
                  <button onClick={createEmpty} className="text-[11px] text-blue-600 hover:text-blue-800">+ create empty library</button>
                </div>
              )}
            </div>
          )}
          {confirmReplace && (
            <ConfirmDialog title="Replace existing library"
              message="This project already has a Risk & Control library. Replace it with the adopted copy? Existing risks/controls are removed."
              confirmLabel="Replace"
              onConfirm={() => { setConfirmReplace(false); adopt(true); }} onCancel={() => setConfirmReplace(false)} />
          )}
        </div>
      )}
    </div>
  );
}
