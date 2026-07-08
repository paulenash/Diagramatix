"use client";

import { useCallback, useEffect, useState } from "react";
import { SharePointPicker } from "@/app/components/SharePointPicker";

interface Source {
  id: string; name: string; kind: string; apiKeyPrefix: string | null; runId: string | null;
  mapping: Record<string, string>; autoRefresh: boolean; eventCount: number;
  lastIngestAt: string | null; lastRefreshAt: string | null; hasConfig: boolean;
}

const KIND_LABEL: Record<string, string> = { webhook: "Webhook (push)", "azure-blob": "Azure Blob (folder)", sharepoint: "SharePoint (folder)" };
const ROLE_FIELDS: { key: string; label: string }[] = [
  { key: "caseId", label: "Case ID *" },
  { key: "activity", label: "Activity *" },
  { key: "timestamp", label: "Timestamp *" },
  { key: "state", label: "State" },
  { key: "resource", label: "Resource" },
  { key: "controlId", label: "Control ID" },
];

const inp = "w-full text-xs border border-stone-700 rounded px-2 py-1 bg-stone-800 text-stone-100 placeholder-stone-500";

/**
 * Live sources — connect a webhook or a watched folder that keeps a mining run
 * refreshed. Self-contained; the console drops it in as a section. Dark MINER skin.
 */
export function MiningSourcesPanel({ projectId }: { projectId: string }) {
  const base = `/api/projects/${projectId}/mining/sources`;
  const [sources, setSources] = useState<Source[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<{ sourceId: string; key: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [kind, setKind] = useState("webhook");
  const [map, setMap] = useState<Record<string, string>>({ caseId: "case", activity: "activity", timestamp: "timestamp" });
  const [blobUrl, setBlobUrl] = useState("");
  const [sp, setSp] = useState<{ driveId: string; itemId: string; name: string } | null>(null);
  const [showSpPicker, setShowSpPicker] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(base); const j = await r.json().catch(() => ({}));
    setSources(j.sources ?? []);
  }, [base]);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setErr(null);
    if (!map.caseId || !map.activity || !map.timestamp) { setErr("Case ID, Activity and Timestamp fields are required."); return; }
    const config: Record<string, unknown> = {};
    if (kind === "azure-blob") { if (!blobUrl.startsWith("http")) { setErr("Provide a container SAS URL."); return; } config.blobListUrl = blobUrl; }
    if (kind === "sharepoint") { if (!sp) { setErr("Pick a SharePoint folder."); return; } config.driveId = sp.driveId; config.itemId = sp.itemId; config.folderName = sp.name; }
    setBusy("create");
    try {
      const r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() || KIND_LABEL[kind], kind, mapping: map, config }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "Failed to create source"); return; }
      if (j.key) setNewKey({ sourceId: j.source.id, key: j.key });
      setCreating(false); setName(""); setBlobUrl(""); setSp(null);
      await load();
    } finally { setBusy(null); }
  }

  async function act(idPath: string, path: string, method = "POST") {
    setBusy(idPath + path); setErr(null);
    try {
      const r = await fetch(`${base}/${idPath}${path}`, { method });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.error ?? "Action failed");
      await load();
      return j;
    } finally { setBusy(null); }
  }

  const ingestUrl = (id: string) => (typeof window !== "undefined" ? window.location.origin : "") + `/api/mining/ingest/${id}`;
  const copy = (s: string) => navigator.clipboard?.writeText(s).catch(() => {});

  return (
    <section className="md:col-span-2 bg-stone-900 border border-stone-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-amber-200">Live sources <span className="text-[11px] font-normal text-stone-400">— connect once, refresh automatically</span></h2>
        {!creating && <button onClick={() => setCreating(true)} className="text-[11px] px-2 py-1 rounded border border-amber-800/60 text-amber-200 hover:bg-amber-950/40">＋ Connect a source</button>}
      </div>

      {err && <p className="text-[11px] text-red-400 mb-2">{err}</p>}

      {newKey && (
        <div className="mb-3 rounded border border-emerald-700/60 bg-emerald-950/30 p-2 text-[11px]">
          <p className="font-medium text-emerald-300 mb-1">Ingest key (shown once — copy it now):</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all bg-stone-800 border border-stone-700 rounded px-1.5 py-1 text-stone-100">{newKey.key}</code>
            <button onClick={() => copy(newKey.key)} className="text-emerald-300 hover:text-emerald-200">Copy</button>
          </div>
          <p className="mt-1.5 text-stone-400">POST events to <code className="text-stone-200">{ingestUrl(newKey.sourceId)}</code> with header <code>X-Api-Key</code>.</p>
          <button onClick={() => copy(`curl -X POST ${ingestUrl(newKey.sourceId)} -H "X-Api-Key: ${newKey.key}" -H "Content-Type: application/json" -d '{"${map.caseId}":"INV-1","${map.activity}":"Received","${map.timestamp}":"2026-07-08T10:00:00Z"}'`)} className="mt-1 text-emerald-300 hover:text-emerald-200">Copy curl example</button>
          <button onClick={() => setNewKey(null)} className="ml-3 text-stone-500 hover:text-stone-300">Dismiss</button>
        </div>
      )}

      {creating && (
        <div className="mb-3 rounded border border-stone-700 bg-stone-800/40 p-3 space-y-2">
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Source name" className={`flex-1 ${inp}`} />
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="text-xs border border-stone-700 rounded px-2 py-1 bg-stone-800 text-stone-100">
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <p className="text-[10px] text-stone-400">Map the incoming {kind === "webhook" ? "JSON field names" : "file column names"} to roles:</p>
          <div className="grid grid-cols-3 gap-2">
            {ROLE_FIELDS.map((f) => (
              <label key={f.key} className="text-[10px] text-stone-400">
                {f.label}
                <input value={map[f.key] ?? ""} onChange={(e) => setMap((m) => ({ ...m, [f.key]: e.target.value }))} className={inp} />
              </label>
            ))}
          </div>
          {kind === "azure-blob" && (
            <input value={blobUrl} onChange={(e) => setBlobUrl(e.target.value)} placeholder="Container SAS URL (https://acct.blob.core.windows.net/container?sv=…)" className={inp} />
          )}
          {kind === "sharepoint" && (
            <div className="flex items-center gap-2 text-[11px]">
              <button onClick={() => setShowSpPicker(true)} className="px-2 py-1 rounded border border-stone-700 text-stone-200 hover:bg-stone-800">{sp ? `Folder: ${sp.name}` : "Pick a SharePoint folder…"}</button>
              <span className="text-stone-500">manual refresh only</span>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className="text-[11px] text-stone-400">Cancel</button>
            <button onClick={create} disabled={busy === "create"} className="text-[11px] px-2 py-1 rounded bg-amber-700 text-white hover:bg-amber-600 disabled:opacity-50">{busy === "create" ? "Creating…" : "Connect"}</button>
          </div>
        </div>
      )}

      {sources.length === 0 && !creating ? (
        <p className="text-[11px] text-stone-500">No live sources yet. Connect a webhook (push events from any system, incl. Power Automate / Zapier) or a watched folder.</p>
      ) : (
        <div className="space-y-1.5">
          {sources.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-[11px] border border-stone-700/70 rounded px-2 py-1.5">
              <span className="font-medium text-stone-100 flex-1 truncate" title={s.name}>{s.name}<span className="ml-1.5 text-[9px] text-stone-500">{KIND_LABEL[s.kind] ?? s.kind}</span></span>
              <span className="text-stone-400 tabular-nums shrink-0">{s.eventCount} events</span>
              <span className="text-stone-500 shrink-0" title="last refresh">{s.lastRefreshAt ? new Date(s.lastRefreshAt).toLocaleString() : "never"}</span>
              <button onClick={() => act(s.id, "/refresh")} disabled={!!busy} className="text-amber-300 hover:text-amber-200 shrink-0 disabled:opacity-50">Refresh</button>
              {s.runId && <button onClick={() => act(`../runs/${s.runId}`, "/snapshot")} disabled={!!busy} className="text-emerald-300 hover:text-emerald-200 shrink-0 disabled:opacity-50" title="Freeze a dated run for the Compliance trend">Snapshot</button>}
              <button onClick={() => act(s.id, "", "DELETE")} disabled={!!busy} className="text-stone-500 hover:text-red-400 shrink-0">✕</button>
            </div>
          ))}
        </div>
      )}

      {showSpPicker && (
        <SharePointPicker mode="folder" title="Pick a folder to watch" confirmLabel="Use this folder"
          onPick={(sel) => { if (sel.itemId) setSp({ driveId: sel.driveId, itemId: sel.itemId, name: sel.name }); setShowSpPicker(false); }}
          onCancel={() => setShowSpPicker(false)} />
      )}
    </section>
  );
}
