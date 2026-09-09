"use client";

/**
 * Everything about the run you have selected: what was imported, discover the
 * process, discover the lifecycle, check it against the reference, calibrate a
 * twin, validate it, explain it, and the Insights panel.
 *
 * Extracted in Phase 0.2 — this and the Import panel were two thirds of a
 * 1,183-line file, and they share nothing except the project id.
 *
 * One deliberate change while moving: errors from *this* panel (discovery,
 * conformance, calibration, explain) used to be rendered by the Import panel at
 * the top of the page, because a single `err` state was shared. A conformance
 * failure now says so where it happened.
 */

import { useCallback, useEffect, useState } from "react";
import { MiningInsightsPanel } from "../insights/MiningInsightsPanel";
import { ValidateTwinPanel } from "../ValidateTwinPanel";
import { DiagramatixThrobber } from "@/app/components/DiagramatixThrobber";
import { useAiAllowed } from "@/app/lib/auth/useAiAllowed";
import type { ConformanceResult } from "@/app/lib/mining/transitionConformance";
import { SaveRunAsExample } from "./SaveRunAsExample";
import { INPUT_CLASS as inp, studyNameOf, type RunRow } from "./shared";

export interface RunDetailProps {
  projectId: string;
  /** The selected run. */
  run: RunRow;
  /** Every run — only for an OCEL study's sibling overview. */
  runs: RunRow[];
  isAdmin?: boolean;
  onSelect: (id: string) => void;
  /** Re-fetch the run list (a run's discovered ids / conformance changed). */
  reload: () => Promise<void>;
  openDiagram: (id: string) => string;
  stashReturn: () => void;
  /** Persist a field on the run — applied optimistically by the console, then PATCHed. */
  patchRun: (runId: string, patch: { excludeFromCompliance?: boolean; referenceSmId?: string | null }) => void;
  /** A twin has been calibrated — hand off to the Simulator, ON that study. */
  onOpenSimulator?: (studyId?: string | null) => void;
}

export function RunDetail({
  projectId, run, runs, isAdmin, onSelect, reload, openDiagram, stashReturn, patchRun, onOpenSimulator,
}: RunDetailProps) {
  const [err, setErr] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false); // any discovery in flight (disables all buttons)
  const [aiSm, setAiSm] = useState(false);     // AI reference-SM generation in flight (its own spinner)
  const [smBusy, setSmBusy] = useState(false); // deterministic state-machine discovery in flight
  const [aiBpmn, setAiBpmn] = useState(false); // AI process curation in flight (its own spinner)
  const [bpmnBusy, setBpmnBusy] = useState(false); // deterministic process discovery in flight
  // Conformance
  const [referenceSms, setReferenceSms] = useState<{ id: string; name: string }[]>([]);
  const [refSmId, setRefSmId] = useState("");
  const [runningConf, setRunningConf] = useState(false);
  const [conformance, setConformance] = useState<ConformanceResult | null>(null);
  // AI "Explain results"
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  // How much of the real spaghetti to draw. The discover route has accepted
  // `edgeThreshold` since it shipped and nothing ever sent it, while the
  // published User Guide already told users to "leave the detail slider on all
  // paths" — a control that did not exist. Shipping it repairs the guide,
  // which is better than editing the guide down to what the product does.
  const [edgeThreshold, setEdgeThreshold] = useState(0);
  // Hide the AI-curate / Explain actions when the org disables AI (server enforces regardless).
  const aiAllowed = useAiAllowed();

  // The reference picker is SCOPED to the selected run (its entity's lifecycle),
  // so cross-entity state machines + the run's own discovered mirror are excluded.
  const loadReferenceSms = useCallback(async (runId?: string | null) => {
    try {
      const q = runId ? `?runId=${encodeURIComponent(runId)}` : "";
      const r = await fetch(`/api/projects/${projectId}/mining/reference-sms${q}`);
      if (r.ok) { const j = await r.json(); if (j?.diagrams) setReferenceSms(j.diagrams); }
    } catch { /* ignore */ }
  }, [projectId]);

  // Sync the reference picker + last result to whichever run is selected. `run`
  // is a fresh object after every reload, so this also re-reads what the server
  // just persisted.
  useEffect(() => {
    // Default to the run's REFERENCE only — never the discovered mirror, so the
    // two are never conflated (editing a reference must not touch the discovered).
    setRefSmId(run.referenceSmId ?? "");
    setConformance(run.conformance ?? null);
    setExplanation(null);
    loadReferenceSms(run.id);   // scope the picker to this run's entity
  }, [run, loadReferenceSms]);

  // Choose a run's conformance reference — persisted immediately so the choice
  // survives navigating away to edit the reference and back (not just after a run).
  function selectReference(runId: string, refId: string) {
    setRefSmId(refId);
    patchRun(runId, { referenceSmId: refId || null });
  }

  async function calibrate(runId: string) {
    setCalibrating(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/mining/runs/${runId}/calibrate`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "Calibration failed"); return; }
      await reload();
      stashReturn();                       // exiting the Simulator returns here
      // The route has always returned { studyId, diagramId } and the caller has
      // always thrown both away, dropping the user into the Simulator in project
      // mode to hunt for the mined twin among auto-seeded default studies.
      onOpenSimulator?.(json.studyId ?? null);
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
      await reload();
    } finally { setRunningConf(false); }
  }

  async function explain(runId: string) {
    setExplaining(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/mining/runs/${runId}/explain`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "Explain failed"); return; }
      setExplanation(json.explanation ?? "");
    } finally { setExplaining(false); }
  }

  async function discover(runId: string, ai = false) {
    setDiscovering(true); if (ai) setAiBpmn(true); else setBpmnBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/mining/runs/${runId}/discover`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ai, edgeThreshold }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "Discovery failed"); return; }
      await reload();
    } finally { setDiscovering(false); setAiBpmn(false); setBpmnBusy(false); }
  }

  async function discoverSm(runId: string, opts: { ai?: boolean; as?: "discovered" | "reference" } = {}): Promise<string | null> {
    const { ai = false, as = "discovered" } = opts;
    // Isolate the spinners: a reference build spins its own button (aiSm); the
    // deterministic discovered SM spins its button (smBusy). `discovering`
    // disables every discovery button while any one runs.
    setDiscovering(true); if (as === "reference") setAiSm(true); else setSmBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/mining/runs/${runId}/discover-sm`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ai, as }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "State-machine discovery failed"); return null; }
      await reload();
      await loadReferenceSms(runId);   // refresh the (scoped) conformance picker
      return (json.diagramId as string) ?? null;
    } finally { setDiscovering(false); setAiSm(false); setSmBusy(false); }
  }

  // Create the governed REFERENCE — a SEPARATE state machine (its own diagram,
  // stored in referenceSmId) that discovery + refresh never overwrite, so editing
  // it never touches the discovered mirror. Deterministic by default (a copy of
  // the mined lifecycle, no AI credits); `ai:true` AI-curates a cleaner one.
  async function createReference(runId: string, ai = false) {
    const id = await discoverSm(runId, { ai, as: "reference" });
    if (id) selectReference(runId, id);
  }

  // "Explain results" lights up once the run is fully mined (process + lifecycle + conformance).
  const allStepsDone = !!(run.discoveredBpmnId && run.discoveredSmId && run.conformance);

  return (
    <section className="md:col-span-3 bg-stone-900 border border-stone-700 rounded-lg p-4">
      {run.objectType ? (
        <h2 className="mb-2 flex items-baseline gap-1.5 flex-wrap">
          <span className="text-[11px] text-amber-200/60">{studyNameOf(run.name)} —</span>
          <span className="text-xl font-bold text-amber-100 capitalize leading-none" title={`OCEL object type: ${run.objectType}`}>{run.objectType}</span>
        </h2>
      ) : (
        <h2 className="text-sm font-semibold text-amber-200 mb-2">{run.name}</h2>
      )}
      {run.domainDiagramId && (
        <a href={openDiagram(run.domainDiagramId)} onClick={stashReturn} className="inline-block mb-2 text-[11px] text-emerald-300 hover:text-emerald-200 underline" title="The OCEL object model — object types, relationships, and links to each type's state machine">
          Open the object model (Domain Diagram) →
        </a>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
        <Stat label="Cases" value={run.stats?.cases} />
        <Stat label="Events" value={run.stats?.events} />
        <Stat label="Activities" value={run.stats?.activities?.length} />
        <Stat label="States" value={run.stats?.states?.length} />
        <Stat label="Variants" value={run.stats?.variants} />
        <Stat label="Span" value={run.stats?.from && run.stats?.to ? `${Math.round((run.stats.to - run.stats.from) / 86400000)}d` : "—"} />
        {typeof run.stats?.unmappedRows === "number" && run.stats.unmappedRows > 0 && (
          <Stat label="Dropped rows" value={run.stats.unmappedRows} />
        )}
      </div>

      {/* OCEL study overview — every object type's progress at a glance. */}
      {run.ocelGroupId && (() => {
        const siblings = runs.filter((r) => r.ocelGroupId === run.ocelGroupId);
        const cell = "px-1.5 py-0.5";
        return (
          <div className="mt-3 rounded border border-emerald-500/30 bg-emerald-950/20 p-2.5">
            <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
              <span className="text-[11px] font-semibold text-emerald-200">OCEL study — {siblings.length} object type{siblings.length === 1 ? "" : "s"}</span>
              {run.domainDiagramId && <a href={openDiagram(run.domainDiagramId)} onClick={stashReturn} className="text-[11px] text-emerald-300 hover:text-emerald-200 underline">Open object model →</a>}
            </div>
            <p className="text-[10px] text-stone-400 mb-1.5">Each object type is analysed on its own — its <span className="text-stone-300">state machine is already discovered</span>. The BPMN process + conformance are optional per type; you don&rsquo;t need them all before analysing any one.</p>
            <div className="overflow-x-auto">
              <table className="text-[10px] w-full">
                <thead className="text-stone-500 uppercase tracking-wide">
                  <tr>
                    <th className={`${cell} text-left`}>Object type</th>
                    <th className={`${cell} text-left`}>State machine</th>
                    <th className={`${cell} text-left`}>Process</th>
                    <th className={`${cell} text-left`}>Conformance</th>
                  </tr>
                </thead>
                <tbody>
                  {siblings.map((r) => {
                    const sel = r.id === run.id;
                    return (
                      <tr key={r.id} className={sel ? "bg-emerald-800/30" : ""}>
                        <td className={cell}>
                          <button onClick={() => onSelect(r.id)} className={`text-left capitalize ${sel ? "text-emerald-200 font-semibold" : "text-stone-300 hover:text-stone-100"}`} title="Select this object type">
                            {sel ? "▸ " : ""}{r.objectType ?? r.name}
                          </button>
                        </td>
                        <td className={cell}>{r.discoveredSmId ? <a href={openDiagram(r.discoveredSmId)} onClick={stashReturn} className="text-emerald-300 hover:text-emerald-200 underline">✓ open</a> : <span className="text-stone-600">—</span>}</td>
                        <td className={cell}>{r.discoveredBpmnId ? <a href={openDiagram(r.discoveredBpmnId)} onClick={stashReturn} className="text-emerald-300 hover:text-emerald-200 underline">✓ open</a> : <span className="text-stone-500">not yet</span>}</td>
                        <td className={cell}>{r.conformance ? <span className="text-emerald-300">{Math.round((r.conformance.fitness ?? 0) * 100)}%</span> : <span className="text-stone-600">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Interchange export — round-trip with other process-mining tools. */}
      <div className="mt-3 flex items-center gap-2 text-[11px] text-stone-400">
        <span>Export log:</span>
        <a href={`/api/projects/${projectId}/mining/runs/${run.id}/export?format=xes`} className="text-amber-300 hover:text-amber-200 underline" title="IEEE 1849 XES — ProM, Celonis, Disco, Apromore, Signavio PI">XES</a>
        <span className="text-stone-600">·</span>
        <a href={`/api/projects/${projectId}/mining/runs/${run.id}/export?format=ocel`} className="text-amber-300 hover:text-amber-200 underline" title="OCEL 2.0 JSON (single-object)">OCEL</a>
        <span className="text-stone-600">— variant-level fidelity</span>
      </div>
      {/* Include/exclude from org Compliance Monitoring — keep test runs out of the trend. */}
      <label className="mt-2 flex items-center gap-2 text-[11px] text-stone-400 cursor-pointer select-none">
        <input type="checkbox" checked={!run.excludeFromCompliance} onChange={(e) => patchRun(run.id, { excludeFromCompliance: !e.target.checked })} className="accent-amber-500" />
        <span>Include in <span className="text-stone-200">Compliance Monitoring</span></span>
        {run.excludeFromCompliance && <span className="text-amber-300/80">— excluded (a test/throwaway run)</span>}
      </label>

      {/* Discover the BPMN process */}
      <div className="mt-4 pt-3 border-t border-stone-700">
        <h3 className="text-xs font-semibold text-amber-200 mb-1">Discover the process</h3>
        <p className="text-[11px] text-stone-400 mb-2">Turn the mined paths into a BPMN process — a faithful directly-follows model of the log (no AI needed). Optionally <span className="text-stone-300">AI-curate</span> a cleaner version (gateways at real branches, tidy labels, noise dropped) — needs API credits.</p>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => discover(run.id, false)} disabled={discovering} className="text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white rounded px-3 py-1.5" title="Build the BPMN directly from the mined paths (a faithful mirror of the log)">
            {bpmnBusy ? "Discovering…" : "Discover process"}
          </button>
          {bpmnBusy && <DiagramatixThrobber size={20} tone="amber" />}
          {aiAllowed && (
            <button onClick={() => discover(run.id, true)} disabled={discovering} className="text-xs bg-amber-900/60 hover:bg-amber-800 disabled:opacity-40 text-amber-100 rounded px-2.5 py-1.5" title="Use AI (rules + template + your configured model) to curate a cleaner process — needs ANTHROPIC_API_KEY + credits">
              {aiBpmn ? "✨ Curating…" : "✨ AI-curate"}
            </button>
          )}
          {aiBpmn && <DiagramatixThrobber size={20} tone="amber" />}
          {run.discoveredBpmnId && (
            <a href={openDiagram(run.discoveredBpmnId)} onClick={stashReturn} className="text-xs text-amber-300 hover:text-amber-200 underline">Open discovered diagram →</a>
          )}
        </div>
        {/* Real logs are noisy and an arrow-centric model is unreadable at full
            density, so this is the twin of the timing views rather than a
            polish item. Applies to the deterministic discovery only — AI
            curation does its own simplifying. */}
        <label className="mt-2.5 flex items-center gap-2 flex-wrap text-[11px]">
          <span className="text-stone-400">Detail:</span>
          <input type="range" min={0} max={0.5} step={0.05} value={edgeThreshold}
            onChange={(e) => setEdgeThreshold(Number(e.target.value))}
            className="w-40 accent-amber-500"
            title="Drop the rarest paths. 0 draws every path the log contains." />
          <span className="text-stone-300 tabular-nums w-28">
            {edgeThreshold === 0 ? "all paths" : `≥ ${Math.round(edgeThreshold * 100)}% of the busiest`}
          </span>
          <span className="text-[10px] text-stone-500">
            {edgeThreshold === 0
              ? "Every path in the log, spaghetti and all."
              : "Simpler: rare routes are dropped, so the model shows the dominant flow rather than everything that ever happened."}
          </span>
        </label>
      </div>

      {/* Discover the entity state machine (deterministic mirror of the log) */}
      <div className="mt-4 pt-3 border-t border-stone-700">
        <h3 className="text-xs font-semibold text-amber-200 mb-1">Discover the state machine</h3>
        <p className="text-[11px] text-stone-400 mb-2">Infer the entity&rsquo;s lifecycle — the states and the events that move between them — a faithful mirror of the event log. It refreshes with the data; your governed <span className="text-stone-300">reference</span> below is a separate diagram you edit.</p>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => discoverSm(run.id, { ai: false, as: "discovered" })} disabled={discovering} className="text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white rounded px-3 py-1.5" title="Build the discovered state machine directly from the mined state sequences (a faithful mirror of the log)">
            {smBusy ? "Discovering…" : "Discover state machine"}
          </button>
          {smBusy && <DiagramatixThrobber size={20} tone="amber" />}
          {run.discoveredSmId && (
            <a href={openDiagram(run.discoveredSmId)} onClick={stashReturn} className="text-xs text-amber-300 hover:text-amber-200 underline">Open state machine →</a>
          )}
        </div>
      </div>

      {/* Conformance vs a reference state machine */}
      <div className="mt-4 pt-3 border-t border-stone-700">
        <h3 className="text-xs font-semibold text-amber-200 mb-1">Conformance vs the reference</h3>
        <p className="text-[11px] text-stone-400 mb-2">Replay the real state changes against your single source of truth and see where reality deviates.</p>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={refSmId} onChange={(e) => selectReference(run.id, e.target.value)} className={`${inp} min-w-[12rem]`} title="The reference State-Machine diagram (this entity's lifecycle)">
            <option value="">— pick a reference state machine —</option>
            {referenceSms.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button onClick={() => runConformance(run.id)} disabled={!refSmId || runningConf} className="text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white rounded px-3 py-1.5">
            {runningConf ? "Checking…" : "✓ Check conformance"}
          </button>
          {refSmId && <a href={openDiagram(refSmId)} onClick={stashReturn} className="text-[11px] text-amber-300 hover:text-amber-200 underline">edit reference →</a>}
        </div>
        {!run.referenceSmId && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <button onClick={() => createReference(run.id, false)} disabled={discovering} className="text-xs bg-amber-800 hover:bg-amber-700 disabled:opacity-40 text-white rounded px-3 py-1.5" title="Create a SEPARATE reference (a copy of the mined lifecycle) that discovery + refresh never overwrite — no AI needed. Then edit it into your rulebook.">
              {smBusy ? "Creating…" : "＋ Create reference"}
            </button>
            {aiAllowed && (
              <button onClick={() => createReference(run.id, true)} disabled={discovering} className="text-xs bg-amber-900/60 hover:bg-amber-800 disabled:opacity-40 text-amber-100 rounded px-2.5 py-1.5" title="AI-curate a cleaner reference (tidy labels, merged states, noise dropped) — needs API credits">
                {aiSm ? "✨ Curating…" : "✨ AI-curate"}
              </button>
            )}
            {(smBusy || aiSm) && <DiagramatixThrobber size={18} tone="amber" />}
            <span className="text-[10px] text-stone-400">No reference yet — create a <span className="text-stone-300">separate</span> governed state machine, then <span className="text-stone-300">edit it into your rulebook</span> (prune the moves that shouldn&rsquo;t be allowed). It stays independent of the discovered mirror above, so editing it turns the discovered transitions <span className="text-rose-300">red</span> where they deviate.</span>
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
          <button onClick={() => calibrate(run.id)} disabled={calibrating} className="text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white rounded px-3 py-1.5">
            {calibrating ? "Calibrating…" : "▶ Calibrate & simulate"}
          </button>
          {run.studyId && <span className="text-[10px] text-emerald-300">✓ twin study ready — opens in the Simulator</span>}
        </div>
      </div>

      {/* The twin, checked against the log it came from. Only once there IS a
          twin — the question has no meaning before that. */}
      {run.studyId && (
        <ValidateTwinPanel validateUrl={`/api/projects/${projectId}/mining/runs/${run.id}/validate`} />
      )}

      {/* Explain results — lights up once fully mined. When the org allows AI it
          narrates; when AI is off it falls back to a deterministic templated summary
          (server picks the branch), so the card stays available either way. */}
      <div className={`mt-4 pt-3 border-t transition-colors ${allStepsDone ? "border-amber-500/60" : "border-stone-700"}`}>
        <h3 className={`text-xs font-semibold mb-1 ${allStepsDone ? "text-amber-200" : "text-stone-500"}`}>{aiAllowed ? "Explain results" : "Results summary"}</h3>
        <p className="text-[11px] text-stone-400 mb-2">
          {aiAllowed
            ? "An AI summary of what the mining revealed — the real process, the conformance findings, timing, and the twin."
            : "A structured summary of what the mining revealed — the real process, the conformance findings and timing — computed deterministically (no AI)."}
        </p>
        {/* Prerequisites — the button lights up when every step is done. */}
        <ul className="text-[11px] mb-2.5 flex flex-col gap-0.5">
          {[
            { done: !!run.discoveredBpmnId, label: "Discover the process", hint: "the Discover process step" },
            { done: !!run.discoveredSmId, label: "Discover the state machine", hint: "the Discover state machine step" },
            { done: !!run.conformance, label: "Check conformance against a reference", hint: "pick a reference state machine + run conformance" },
          ].map((s, i) => (
            <li key={i} className="flex items-baseline gap-1.5">
              <span className={s.done ? "text-emerald-400" : "text-stone-500"}>{s.done ? "✓" : "○"}</span>
              <span className={s.done ? "text-stone-300" : "text-stone-400"}>
                {s.label}
                {!s.done && <span className="text-stone-500"> — {s.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
        {allStepsDone
          ? <p className="text-[11px] text-amber-300/80 mb-2">All steps complete — ready to summarise.</p>
          : <p className="text-[11px] text-stone-500 mb-2">Complete the steps above to enable the summary.</p>}
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => explain(run.id)} disabled={!allStepsDone || explaining}
            className={`text-xs rounded px-3 py-1.5 text-white disabled:cursor-not-allowed ${allStepsDone ? "bg-amber-600 hover:bg-amber-500 shadow-[0_0_16px_rgba(217,119,6,0.5)]" : "bg-stone-700/60 !text-stone-400"}`}
            title={allStepsDone ? "Summarise what the mining discovered" : "Complete discovery + conformance first"}>
            {explaining ? "Analysing…" : aiAllowed ? "✨ Explain results" : "Summarise results"}
          </button>
          {explaining && <DiagramatixThrobber size={20} tone="amber" />}
        </div>
        {explanation && (
          <div className="mt-3 rounded border border-amber-500/40 bg-stone-900/70 p-3 text-[11px] text-stone-200 leading-relaxed whitespace-pre-wrap">{explanation}</div>
        )}
      </div>

      {/* Whatever failed above, said where it happened. */}
      {err && <p className="text-rose-400 text-xs mt-3">{err}</p>}

      {/* Insights — bottleneck/frequency heat over the discovered model (+ Variants/Cases/Outcomes/Export). */}
      <MiningInsightsPanel projectId={projectId} run={run} onCalibrate={() => void calibrate(run.id)} />

      {/* Admin: capture this run into the Mining-Example catalog */}
      {isAdmin && <SaveRunAsExample projectId={projectId} runId={run.id} defaultTitle={run.name} />}
    </section>
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
