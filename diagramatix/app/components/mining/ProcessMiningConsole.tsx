"use client";

/**
 * DiagramatixMINER console — ingest an event log, discover the implied BPMN + a
 * candidate state machine, and check conformance against a reference state
 * machine. Amber/brown "mining" skin, styled like the Simulator console. The
 * digital-twin simulator calibration lands in the final slice.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { parseCsv, guessMapping } from "@/app/lib/mining/parseEventLog";
import { validateEventLogMapping } from "@/app/lib/mining/validateLog";
import type { LogMapping, MiningStats } from "@/app/lib/mining/types";
import type { ConformanceResult } from "@/app/lib/mining/transitionConformance";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

interface RunRow {
  id: string; name: string; stats: MiningStats; mapping: Partial<LogMapping>;
  discoveredBpmnId: string | null; discoveredSmId: string | null; referenceSmId: string | null;
  conformance: ConformanceResult | null;
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

export function ProcessMiningConsole({ projectId, projectName, isAdmin, onClose, onOpenSimulator }: { projectId: string; projectName?: string; isAdmin?: boolean; onClose: () => void; onOpenSimulator?: () => void }) {
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
  const [discovering, setDiscovering] = useState(false);
  const [aiSm, setAiSm] = useState(false);   // AI state-machine generation in flight
  const [aiBpmn, setAiBpmn] = useState(false); // AI process generation in flight
  // Conformance
  const [referenceSms, setReferenceSms] = useState<{ id: string; name: string }[]>([]);
  const [refSmId, setRefSmId] = useState("");
  const [runningConf, setRunningConf] = useState(false);
  const [conformance, setConformance] = useState<ConformanceResult | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/mining/runs`);
    if (res.ok) setRuns((await res.json()).runs ?? []);
  }, [projectId]);
  useEffect(() => { load(); }, [load]);
  const loadReferenceSms = useCallback(async () => {
    try { const r = await fetch(`/api/projects/${projectId}/mining/reference-sms`); if (r.ok) { const j = await r.json(); if (j?.diagrams) setReferenceSms(j.diagrams); } } catch { /* ignore */ }
  }, [projectId]);
  useEffect(() => { loadReferenceSms(); }, [loadReferenceSms]);
  // Adopted-example hand-off: if the gallery stashed a raw sample log for this
  // project, pre-load the Import panel with it (confirm the analysis, then import).
  useEffect(() => {
    try {
      const key = `mining-sample:${projectId}`;
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      sessionStorage.removeItem(key);
      const s = JSON.parse(raw) as { fileName?: string; runName?: string; headers: string[]; rows: string[][]; mapping?: Partial<LogMapping> };
      if (Array.isArray(s.headers) && Array.isArray(s.rows) && s.headers.length && s.rows.length) {
        setHeaders(s.headers); setRows(s.rows);
        setMapping(s.mapping ?? guessMapping(s.headers));
        setFileName(s.fileName ?? "sample.csv");
        setRunName(s.runName ?? (s.fileName ?? "").replace(/\.[^.]+$/, ""));
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  // Sync the reference picker + last result to whichever run is selected.
  useEffect(() => {
    const s = runs.find((r) => r.id === selectedId);
    setRefSmId(s?.referenceSmId ?? s?.discoveredSmId ?? "");
    setConformance(s?.conformance ?? null);
  }, [selectedId, runs]);

  const [calibrating, setCalibrating] = useState(false);
  async function calibrate(runId: string) {
    setCalibrating(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/mining/runs/${runId}/calibrate`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "Calibration failed"); return; }
      await load();
      onOpenSimulator?.(); // hand off to the Simulator on the calibrated twin study
    } finally { setCalibrating(false); }
  }

  async function runConformance(runId: string) {
    if (!refSmId) return;
    setRunningConf(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/mining/runs/${runId}/conformance`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ referenceSmId: refSmId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "Conformance failed"); return; }
      setConformance(json.conformance ?? null);
      await load();
    } finally { setRunningConf(false); }
  }

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
  // Advisory pre-import validation off the already-parsed rows — confirm the
  // mapping is right + see what would be discarded, before ingesting.
  const validation = useMemo(
    () => (headers.length > 0 && rows.length > 0 ? validateEventLogMapping(headers, rows, mapping) : null),
    [headers, rows, mapping],
  );

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

  async function discover(runId: string, ai = false) {
    setDiscovering(true); if (ai) setAiBpmn(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/mining/runs/${runId}/discover`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ai }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "Discovery failed"); return; }
      await load();
    } finally { setDiscovering(false); setAiBpmn(false); }
  }

  async function discoverSm(runId: string, ai = false): Promise<string | null> {
    setDiscovering(true); if (ai) setAiSm(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/mining/runs/${runId}/discover-sm`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ai }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "State-machine discovery failed"); return null; }
      await load();
      await loadReferenceSms();       // so the new diagram appears in the conformance picker
      return (json.diagramId as string) ?? null;
    } finally { setDiscovering(false); setAiSm(false); }
  }

  // No reference yet? Scaffold a draft state-machine from the mined lifecycle and
  // select it — the user then prunes it into a governed reference (source of truth).
  async function createDraftReference(runId: string) {
    const id = await discoverSm(runId, true);
    if (id) setRefSmId(id);
  }

  const selected = runs.find((r) => r.id === selectedId) ?? null;
  const inp = "bg-stone-800 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs";
  // Open a discovered diagram with a back-link that returns to the MINER console
  // (via the ?mining deep-link) instead of the owning project.
  const openDiagram = (id: string) =>
    `/diagram/${id}?from=${encodeURIComponent(`/dashboard?mining=${projectId}&mp=${encodeURIComponent(projectName ?? "")}&pmnoi=1`)}`;

  return (
    <div className="fixed inset-0 z-[60] bg-stone-950 text-stone-200 overflow-auto font-mono">
      <header className="flex items-center justify-between px-5 py-3 border-b border-amber-900/50 sticky top-0 bg-stone-950/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="text-amber-300 tracking-[0.25em] text-sm">⛏ DiagramatixMINER</span>
          {projectName && <span className="text-stone-400 text-xs">{projectName}</span>}
        </div>
        <button onClick={onClose} className="px-3 py-1.5 text-xs text-white bg-stone-700 hover:bg-stone-600 rounded">✕ Exit</button>
      </header>

      <main className="max-w-5xl mx-auto p-4 grid gap-4 md:grid-cols-3">
        {/* Import */}
        <section className="md:col-span-2 bg-stone-900 border border-stone-700 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-amber-200 mb-1">Import an event log</h2>
          <p className="text-xs text-stone-400 mb-3">Upload a CSV exported from your source system(s). Map its columns to roles, then import — the process is inferred from the logs.</p>
          <label className="inline-block cursor-pointer text-xs bg-amber-700 hover:bg-amber-600 text-white rounded px-3 py-1.5">
            {fileName ? `↻ ${fileName}` : "⭱ Choose CSV…"}
            <input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={onFile} className="hidden" />
          </label>

          {headers.length > 0 && (
            <div className="mt-4 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map((role) => (
                  <label key={role.key} className="flex flex-col gap-0.5" title={role.hint}>
                    <span className="text-[10px] uppercase tracking-wide text-stone-400">{role.label}{role.required && <span className="text-rose-400"> *</span>}</span>
                    <select value={(mapping[role.key] as string) ?? ""} onChange={(e) => setRole(role.key, e.target.value)} className={inp}>
                      <option value="">—</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </label>
                ))}
              </div>

              {/* Preview */}
              <div className="overflow-x-auto border border-stone-700 rounded">
                <table className="text-[10px] min-w-full">
                  <thead className="bg-stone-800 text-stone-400">
                    <tr>{headers.map((h) => <th key={h} className="px-2 py-1 text-left font-medium whitespace-nowrap">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-t border-stone-800">{headers.map((_, c) => <td key={c} className="px-2 py-1 whitespace-nowrap text-stone-300">{r[c]}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-stone-400">{rows.length.toLocaleString()} rows · previewing first 5</p>

              {/* Advisory mapping verification — confirm the mapping + see what would be dropped */}
              {validation && (
                <div className="rounded border border-stone-700 bg-stone-900/60 p-2.5 flex flex-col gap-1.5 text-[10px]">
                  <div className="text-stone-300">
                    <span className="text-amber-200">{validation.usable.toLocaleString()}</span> usable
                    {" · "}
                    {validation.dropped > 0
                      ? <span className="text-rose-300">{validation.dropped.toLocaleString()} dropped</span>
                      : <span className="text-emerald-300">0 dropped</span>}
                    {" · "}<span className="text-stone-200">{validation.distinctCases.toLocaleString()}</span> cases
                    {mapping.activity ? <>{" · "}{validation.distinctActivities.toLocaleString()} activities</> : null}
                    {mapping.state ? <>{" · "}{validation.distinctStates.toLocaleString()} states</> : null}
                  </div>
                  <div className="text-stone-400">
                    timestamp: <span className={validation.timestampFormat === "unrecognised" ? "text-rose-300" : "text-stone-300"}>{validation.timestampFormat}</span>
                    {validation.from && validation.to ? ` · ${new Date(validation.from).toISOString().slice(0, 10)} → ${new Date(validation.to).toISOString().slice(0, 10)}` : ""}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {ROLES.map((r) => (validation.samples[r.key]?.length ? (
                      <div key={r.key} className="text-stone-400 truncate"><span className="text-stone-500">{r.label.replace(/ \(optional\)$/, "")}:</span> {validation.samples[r.key]!.join("  ·  ")}</div>
                    ) : null))}
                  </div>
                  {validation.warnings.map((w, i) => (
                    <div key={i} className="text-amber-300 leading-snug">⚠ {w.message}</div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input value={runName} onChange={(e) => setRunName(e.target.value)} placeholder="run name" className={`${inp} flex-1`} />
                <button onClick={doImport} disabled={!canImport || busy} className="text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white rounded px-3 py-1.5">
                  {busy ? "Importing…" : "Import log"}
                </button>
              </div>
              {!canImport && <p className="text-[10px] text-amber-400">Map case id, activity, timestamp and state to continue.</p>}
            </div>
          )}
          {err && <p className="text-rose-400 text-xs mt-2">{err}</p>}
        </section>

        {/* Runs */}
        <section className="bg-stone-900 border border-stone-700 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-amber-200 mb-2">Mining runs</h2>
          {runs.length === 0 && <p className="text-xs text-stone-400">No runs yet — import a log.</p>}
          <div className="flex flex-col gap-1">
            {runs.map((r) => (
              <div key={r.id} className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${selectedId === r.id ? "bg-amber-600/15" : "hover:bg-stone-800"}`}>
                <button onClick={() => setSelectedId(selectedId === r.id ? null : r.id)} className="flex-1 text-left truncate text-stone-200" title={r.name}>{r.name}</button>
                <span className="text-stone-400">{r.stats?.cases ?? 0}c</span>
                <button onClick={() => setDeleting(r)} className="text-rose-400/70 hover:text-rose-300 px-1" title="Delete run">✕</button>
              </div>
            ))}
          </div>
        </section>

        {/* Selected run summary */}
        {selected && (
          <section className="md:col-span-3 bg-stone-900 border border-stone-700 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-amber-200 mb-2">{selected.name}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
              <Stat label="Cases" value={selected.stats?.cases} />
              <Stat label="Events" value={selected.stats?.events} />
              <Stat label="Activities" value={selected.stats?.activities?.length} />
              <Stat label="States" value={selected.stats?.states?.length} />
              <Stat label="Variants" value={selected.stats?.variants} />
              <Stat label="Span" value={selected.stats?.from && selected.stats?.to ? `${Math.round((selected.stats.to - selected.stats.from) / 86400000)}d` : "—"} />
              {typeof selected.stats?.unmappedRows === "number" && selected.stats.unmappedRows > 0 && (
                <Stat label="Dropped rows" value={selected.stats.unmappedRows} />
              )}
            </div>
            {/* Discover the BPMN process */}
            <div className="mt-4 pt-3 border-t border-stone-700">
              <h3 className="text-xs font-semibold text-amber-200 mb-1">Discover the process</h3>
              <p className="text-[11px] text-stone-400 mb-2">Turn the mined paths into a clean, readable BPMN process — AI-curated (rules + template + your configured model): gateways at real branches, rework loops, tidy labels, noise dropped.</p>
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => discover(selected.id, true)} disabled={discovering} className="text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white rounded px-3 py-1.5">
                  {aiBpmn ? "✨ Generating…" : "✨ Discover process"}
                </button>
                {selected.discoveredBpmnId && (
                  <a href={openDiagram(selected.discoveredBpmnId)} className="text-xs text-amber-300 hover:text-amber-200 underline">Open discovered diagram →</a>
                )}
              </div>
            </div>

            {/* Discover the entity state machine */}
            <div className="mt-4 pt-3 border-t border-stone-700">
              <h3 className="text-xs font-semibold text-amber-200 mb-1">Discover the state machine</h3>
              <p className="text-[11px] text-stone-400 mb-2">Infer the entity&rsquo;s lifecycle — the states and the events that move between them — AI-curated into a clean, governable reference (tidy labels, merged states, noise dropped) that you can edit and use for conformance.</p>
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => discoverSm(selected.id, true)} disabled={discovering} className="text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white rounded px-3 py-1.5" title="Use AI (rules + template + your configured model) to curate a clean reference state machine from the mined lifecycle">
                  {aiSm ? "✨ Generating…" : "✨ Discover state machine"}
                </button>
                {selected.discoveredSmId && (
                  <a href={openDiagram(selected.discoveredSmId)} className="text-xs text-amber-300 hover:text-amber-200 underline">Open state machine →</a>
                )}
              </div>
            </div>

            {/* Conformance vs a reference state machine */}
            <div className="mt-4 pt-3 border-t border-stone-700">
              <h3 className="text-xs font-semibold text-amber-200 mb-1">Conformance vs the reference</h3>
              <p className="text-[11px] text-stone-400 mb-2">Replay the real state changes against your single source of truth and see where reality deviates.</p>
              <div className="flex items-center gap-2 flex-wrap">
                <select value={refSmId} onChange={(e) => setRefSmId(e.target.value)} className={`${inp} min-w-[12rem]`} title="The reference State-Machine diagram">
                  <option value="">— pick a reference state machine —</option>
                  {referenceSms.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button onClick={() => runConformance(selected.id)} disabled={!refSmId || runningConf} className="text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white rounded px-3 py-1.5">
                  {runningConf ? "Checking…" : "✓ Check conformance"}
                </button>
                {refSmId && <a href={openDiagram(refSmId)} className="text-[11px] text-amber-300 hover:text-amber-200 underline">edit reference →</a>}
              </div>
              {referenceSms.length === 0 && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <button onClick={() => createDraftReference(selected.id)} disabled={discovering} className="text-xs bg-amber-800 hover:bg-amber-700 disabled:opacity-40 text-white rounded px-3 py-1.5">
                    {discovering ? "Creating…" : "＋ Create draft reference"}
                  </button>
                  <span className="text-[10px] text-stone-400">No reference yet — scaffold one from the mined lifecycle, then <span className="text-stone-300">edit it into your rulebook</span> (prune the moves that shouldn&rsquo;t be allowed).</span>
                </div>
              )}

              {conformance && (
                <div className="mt-3">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="text-2xl tabular-nums" style={{ color: conformance.fitness >= 0.9 ? "#86efac" : conformance.fitness >= 0.6 ? "#fcd34d" : "#fca5a5" }}>
                      {(conformance.fitness * 100).toFixed(0)}%
                    </div>
                    <div className="text-[11px] text-stone-400">
                      fitness — <span className="text-stone-200">{conformance.conformingCases.toLocaleString()}</span> of <span className="text-stone-200">{conformance.totalCases.toLocaleString()}</span> cases replay cleanly
                    </div>
                  </div>
                  {conformance.violations.length === 0 ? (
                    <p className="text-xs text-emerald-300">✓ Fully conformant — no deviations.</p>
                  ) : (
                    <div className="overflow-x-auto border border-stone-700 rounded">
                      <table className="text-[11px] min-w-full">
                        <thead className="bg-stone-800 text-stone-400">
                          <tr><th className="px-2 py-1 text-left">Deviation</th><th className="px-2 py-1 text-left">Detail</th><th className="px-2 py-1 text-right">Cases</th></tr>
                        </thead>
                        <tbody>
                          {conformance.violations.map((v, i) => (
                            <tr key={i} className="border-t border-stone-800">
                              <td className="px-2 py-1 whitespace-nowrap"><span className={v.severity === "error" ? "text-rose-300" : "text-amber-300"}>{v.severity === "error" ? "✕" : "!"} {v.rule.replace(/-/g, " ")}</span></td>
                              <td className="px-2 py-1 text-stone-300">{v.message}</td>
                              <td className="px-2 py-1 text-right text-stone-300 tabular-nums">{v.cases || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Calibrate a simulation digital twin */}
            <div className="mt-4 pt-3 border-t border-stone-700">
              <h3 className="text-xs font-semibold text-amber-200 mb-1">Simulate a digital twin</h3>
              <p className="text-[11px] text-stone-400 mb-2">Calibrate a simulation from the mined data — cycle times, arrivals, branch splits, teams + working hours — then explore <em>to-be</em> improvements in the Simulator.</p>
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => calibrate(selected.id)} disabled={calibrating} className="text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white rounded px-3 py-1.5">
                  {calibrating ? "Calibrating…" : "▶ Calibrate & simulate"}
                </button>
                {selected.studyId && <span className="text-[10px] text-emerald-300">✓ twin study ready — opens in the Simulator</span>}
              </div>
            </div>

            {/* Admin: capture this run into the Mining-Example catalog */}
            {isAdmin && <SaveRunAsExample projectId={projectId} runId={selected.id} defaultTitle={selected.name} />}
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

/** Admin-only: capture this run (log + reference SM) into a NEW draft
 *  Mining-Example catalog entry. Mirrors the Simulator's "Save as example". */
function SaveRunAsExample({ projectId, runId, defaultTitle }: { projectId: string; runId: string; defaultTitle: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [concept, setConcept] = useState("");
  const [difficulty, setDifficulty] = useState("core");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function capture() {
    if (!title.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/mining-examples/capture`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, runId, title: title.trim(), concept: concept.trim(), difficulty }),
      });
      const json = await res.json().catch(() => ({}));
      setMsg(res.ok ? "Saved as a draft example ✓ — publish it in the Catalog manager." : (json.error ?? "Capture failed"));
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-4 pt-3 border-t border-stone-700">
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-amber-300/70 hover:text-amber-200 text-[10px] uppercase tracking-widest">
          ⎘ Save run as example
        </button>
      ) : (
        <div className="flex flex-col gap-1.5 text-[11px] max-w-md">
          <span className="text-amber-300/70 uppercase tracking-widest text-[10px]">Save as example (admin)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="title"
            className="bg-stone-900 border border-amber-500/40 rounded px-1.5 py-0.5 text-amber-100 [color-scheme:dark]" />
          <input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="one-line concept"
            className="bg-stone-900 border border-amber-500/40 rounded px-1.5 py-0.5 text-amber-100 [color-scheme:dark]" />
          <div className="flex items-center gap-2">
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="bg-stone-900 border border-amber-500/40 rounded px-1 py-0.5 text-amber-100 [color-scheme:dark]">
              <option value="intro">intro</option><option value="core">core</option><option value="advanced">advanced</option>
            </select>
            <button onClick={capture} disabled={busy} className="text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white rounded px-3 py-1">{busy ? "…" : "Capture"}</button>
            <button onClick={() => setOpen(false)} className="text-amber-300/50 hover:text-amber-200 text-[10px]">cancel</button>
          </div>
          {msg && <span className="text-amber-200 text-[10px]">{msg}</span>}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string | undefined }) {
  return (
    <div className="bg-stone-800/60 rounded p-2">
      <div className="text-[10px] uppercase tracking-wide text-stone-400">{label}</div>
      <div className="text-lg text-stone-100 tabular-nums">{value ?? "—"}</div>
    </div>
  );
}
