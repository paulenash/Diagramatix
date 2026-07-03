"use client";

/**
 * Process Mining console — ingest an event log, then discover / conform / simulate.
 * Slice 1: upload a CSV, map its columns to roles, and persist a run (the
 * compressed variants). Discovery, conformance and the digital-twin calibration
 * panels light up in later slices.
 */

import { useCallback, useEffect, useState } from "react";
import { parseCsv, guessMapping } from "@/app/lib/mining/parseEventLog";
import type { LogMapping, MiningStats } from "@/app/lib/mining/types";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

interface RunRow {
  id: string; name: string; stats: MiningStats; mapping: Partial<LogMapping>;
  discoveredBpmnId: string | null; discoveredSmId: string | null; referenceSmId: string | null;
  studyId: string | null; createdAt: string;
}

const ROLES: { key: keyof LogMapping; label: string; required: boolean; hint: string }[] = [
  { key: "caseId", label: "Case / entity id", required: true, hint: "The entity instance (e.g. Invoice #123) — the process case" },
  { key: "activity", label: "Activity / event", required: true, hint: "The business event that occurred" },
  { key: "timestamp", label: "Timestamp", required: true, hint: "When it happened (ISO or epoch)" },
  { key: "state", label: "State", required: true, hint: "The entity's resulting state after the event" },
  { key: "resource", label: "Resource (optional)", required: false, hint: "Who/what performed it → simulation team" },
  { key: "entityType", label: "Entity type (optional)", required: false, hint: "The entity kind (Invoice, Employee…)" },
];

export function ProcessMiningConsole({ projectId, projectName, onClose }: { projectId: string; projectName?: string; onClose: () => void }) {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<RunRow | null>(null);

  // Import staging
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Partial<LogMapping>>({});
  const [runName, setRunName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(0);
  const [discovering, setDiscovering] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/mining/runs`);
    if (res.ok) setRuns((await res.json()).runs ?? []);
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    const text = await file.text();
    const { headers: h, rows: r } = parseCsv(text);
    if (h.length === 0 || r.length === 0) { setErr("Couldn't read any rows from that file."); return; }
    setFileName(file.name); setHeaders(h); setRows(r);
    setMapping(guessMapping(h));
    setRunName(file.name.replace(/\.[^.]+$/, ""));
  }

  const setRole = (key: keyof LogMapping, col: string) => setMapping((m) => ({ ...m, [key]: col || undefined }));
  const canImport = mapping.caseId && mapping.activity && mapping.timestamp && mapping.state && rows.length > 0;

  async function doImport() {
    if (!canImport) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/mining/import`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: runName.trim() || "Event log", mapping, headers, rows }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "Import failed"); return; }
      setFileName(null); setHeaders([]); setRows([]); setMapping({}); setRunName("");
      await load();
      setSelectedId(json.run?.id ?? null);
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    setDeleting(null);
    await fetch(`/api/projects/${projectId}/mining/runs/${id}`, { method: "DELETE" });
    if (selectedId === id) setSelectedId(null);
    await load();
  }

  async function discover(runId: string) {
    setDiscovering(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/mining/runs/${runId}/discover`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ edgeThreshold: threshold / 100 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "Discovery failed"); return; }
      await load();
    } finally { setDiscovering(false); }
  }

  async function discoverSm(runId: string) {
    setDiscovering(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/mining/runs/${runId}/discover-sm`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "State-machine discovery failed"); return; }
      await load();
    } finally { setDiscovering(false); }
  }

  const selected = runs.find((r) => r.id === selectedId) ?? null;
  const inp = "bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-100 text-xs";

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950 text-slate-200 overflow-auto">
      <header className="flex items-center justify-between px-5 py-3 border-b border-slate-700 sticky top-0 bg-slate-950/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="text-indigo-300 tracking-[0.25em] text-sm">◈ PROCESS MINING</span>
          {projectName && <span className="text-slate-400 text-xs">{projectName}</span>}
        </div>
        <button onClick={onClose} className="px-3 py-1.5 text-xs text-white bg-slate-700 hover:bg-slate-600 rounded">✕ Exit</button>
      </header>

      <main className="max-w-5xl mx-auto p-4 grid gap-4 md:grid-cols-3">
        {/* Import */}
        <section className="md:col-span-2 bg-slate-900 border border-slate-700 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-indigo-200 mb-1">Import an event log</h2>
          <p className="text-xs text-slate-400 mb-3">Upload a CSV exported from your source system(s). Map its columns to roles, then import — the process is inferred from the logs.</p>
          <label className="inline-block cursor-pointer text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded px-3 py-1.5">
            {fileName ? `↻ ${fileName}` : "⭱ Choose CSV…"}
            <input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={onFile} className="hidden" />
          </label>

          {headers.length > 0 && (
            <div className="mt-4 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map((role) => (
                  <label key={role.key} className="flex flex-col gap-0.5" title={role.hint}>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">{role.label}{role.required && <span className="text-rose-400"> *</span>}</span>
                    <select value={(mapping[role.key] as string) ?? ""} onChange={(e) => setRole(role.key, e.target.value)} className={inp}>
                      <option value="">—</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </label>
                ))}
              </div>

              {/* Preview */}
              <div className="overflow-x-auto border border-slate-700 rounded">
                <table className="text-[10px] min-w-full">
                  <thead className="bg-slate-800 text-slate-400">
                    <tr>{headers.map((h) => <th key={h} className="px-2 py-1 text-left font-medium whitespace-nowrap">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-t border-slate-800">{headers.map((_, c) => <td key={c} className="px-2 py-1 whitespace-nowrap text-slate-300">{r[c]}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-slate-500">{rows.length.toLocaleString()} rows · previewing first 5</p>

              <div className="flex items-center gap-2">
                <input value={runName} onChange={(e) => setRunName(e.target.value)} placeholder="run name" className={`${inp} flex-1`} />
                <button onClick={doImport} disabled={!canImport || busy} className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded px-3 py-1.5">
                  {busy ? "Importing…" : "Import log"}
                </button>
              </div>
              {!canImport && <p className="text-[10px] text-amber-400">Map case id, activity, timestamp and state to continue.</p>}
            </div>
          )}
          {err && <p className="text-rose-400 text-xs mt-2">{err}</p>}
        </section>

        {/* Runs */}
        <section className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-indigo-200 mb-2">Mining runs</h2>
          {runs.length === 0 && <p className="text-xs text-slate-500">No runs yet — import a log.</p>}
          <div className="flex flex-col gap-1">
            {runs.map((r) => (
              <div key={r.id} className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${selectedId === r.id ? "bg-indigo-500/15" : "hover:bg-slate-800"}`}>
                <button onClick={() => setSelectedId(selectedId === r.id ? null : r.id)} className="flex-1 text-left truncate text-slate-200" title={r.name}>{r.name}</button>
                <span className="text-slate-500">{r.stats?.cases ?? 0}c</span>
                <button onClick={() => setDeleting(r)} className="text-rose-400/70 hover:text-rose-300 px-1" title="Delete run">✕</button>
              </div>
            ))}
          </div>
        </section>

        {/* Selected run summary */}
        {selected && (
          <section className="md:col-span-3 bg-slate-900 border border-slate-700 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-indigo-200 mb-2">{selected.name}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
              <Stat label="Cases" value={selected.stats?.cases} />
              <Stat label="Events" value={selected.stats?.events} />
              <Stat label="Activities" value={selected.stats?.activities?.length} />
              <Stat label="States" value={selected.stats?.states?.length} />
              <Stat label="Variants" value={selected.stats?.variants} />
              <Stat label="Span" value={selected.stats?.from && selected.stats?.to ? `${Math.round((selected.stats.to - selected.stats.from) / 86400000)}d` : "—"} />
            </div>
            {/* Discover the BPMN process */}
            <div className="mt-4 pt-3 border-t border-slate-700">
              <h3 className="text-xs font-semibold text-indigo-200 mb-1">Discover the process</h3>
              <p className="text-[11px] text-slate-400 mb-2">Infer the BPMN implied by the logs. Raise the filter to hide rare paths and reveal the mainstream flow.</p>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2 text-[11px] text-slate-400">
                  detail
                  <input type="range" min={0} max={90} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="accent-indigo-500" />
                  <span className="w-16 text-slate-300">{threshold === 0 ? "all paths" : `−${threshold}%`}</span>
                </label>
                <button onClick={() => discover(selected.id)} disabled={discovering} className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded px-3 py-1.5">
                  {discovering ? "Discovering…" : "⚙ Discover process"}
                </button>
                {selected.discoveredBpmnId && (
                  <a href={`/diagram/${selected.discoveredBpmnId}`} className="text-xs text-indigo-300 hover:text-indigo-200 underline">Open discovered diagram →</a>
                )}
              </div>
            </div>

            {/* Discover the entity state machine */}
            <div className="mt-4 pt-3 border-t border-slate-700">
              <h3 className="text-xs font-semibold text-indigo-200 mb-1">Discover the state machine</h3>
              <p className="text-[11px] text-slate-400 mb-2">Infer the entity&rsquo;s lifecycle — its states and the events that move between them — a candidate you can edit and use as the conformance reference.</p>
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => discoverSm(selected.id)} disabled={discovering} className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded px-3 py-1.5">
                  {discovering ? "Working…" : "⚙ Discover state machine"}
                </button>
                {selected.discoveredSmId && (
                  <a href={`/diagram/${selected.discoveredSmId}`} className="text-xs text-indigo-300 hover:text-indigo-200 underline">Open state machine →</a>
                )}
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-3">Next: <span className="text-indigo-300">state-machine conformance</span> and <span className="text-indigo-300">calibrate a simulation twin</span> (coming in the next slices).</p>
          </section>
        )}
      </main>

      {deleting && (
        <ConfirmDialog title="Delete mining run" message={`Delete "${deleting.name}"? (Discovered diagrams are kept.)`} destructive
          onConfirm={() => remove(deleting.id)} onCancel={() => setDeleting(null)} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string | undefined }) {
  return (
    <div className="bg-slate-800/60 rounded p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-lg text-slate-100 tabular-nums">{value ?? "—"}</div>
    </div>
  );
}
