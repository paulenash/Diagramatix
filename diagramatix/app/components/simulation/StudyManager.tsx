"use client";

/**
 * Matrix-styled manager for simulation Studies (portfolios) + their Scenarios.
 * A study is a set of root BPMN diagrams; the engine assembles each root's
 * forward-link closure into one network sharing the team pools. A scenario
 * layers a run config + planned (timed) interventions on top; running the
 * Monte-Carlo + results land in Phase 5, so the Run button is staged off here.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MatrixButton } from "./matrix/MatrixChrome";
import type { ReadinessIssue } from "@/app/lib/simulation/readiness";
import { ResultsReport } from "./results/ResultsReport";
import { ScenarioCompare } from "./results/ScenarioCompare";
import { RunHistory } from "./results/RunHistory";
import { PromptDialog } from "@/app/components/PromptDialog";
import {
  DEFAULT_RUN_CONFIG,
  type ScenarioRunConfig,
  type PlannedIntervention,
  type PlannedInterventionKind,
  type ClockUnit,
} from "@/app/lib/simulation/types";

interface DiagramLite { id: string; name: string }
interface StudyRow { id: string; name: string; _count?: { roots: number; scenarios: number } }
interface ScenarioRow { id: string; name: string; isBaseline: boolean; status: string; runConfig: ScenarioRunConfig; overrides: unknown; variantRootIds?: string[] }
interface StudyDetail { id: string; name: string; roots: { diagram: DiagramLite }[]; scenarios: ScenarioRow[] }

const CLOCK_UNITS: ClockUnit[] = ["second", "minute", "hour", "day"];
const INTERVENTION_KINDS: PlannedInterventionKind[] = ["capacity", "arrival", "branchProb", "inject", "outage"];
const KIND_HINT: Record<PlannedInterventionKind, string> = {
  capacity: "team → new capacity",
  arrival: "source node → rate ×",
  branchProb: "edge → probability 0–1",
  inject: "node → token count",
  outage: "team → capacity during outage",
};

export function StudyManager({ projectId, isAdmin, onRan }: { projectId: string | null; isAdmin?: boolean; onRan?: (cfg: ScenarioRunConfig) => void }) {
  const [studies, setStudies] = useState<StudyRow[]>([]);
  const [diagrams, setDiagrams] = useState<DiagramLite[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StudyDetail | null>(null);
  const [newStudy, setNewStudy] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // Import a Diagramatix simulation bundle → a brand-new project, then jump into it.
  async function importBundle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true); setErr(null);
    try {
      const body = JSON.parse(await file.text());
      const res = await fetch("/api/simulation/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "Import failed"); return; }
      if (json.openDiagramId) window.location.href = `/diagram/${json.openDiagramId}`;
      else window.location.reload();
    } catch { setErr("That file isn't a valid simulation bundle (JSON)."); }
    finally { setImporting(false); }
  }

  const loadStudies = useCallback(async () => {
    if (!projectId) return;
    const res = await fetch(`/api/projects/${projectId}/simulation/studies`);
    if (!res.ok) return;
    const json = await res.json();
    setStudies(json.studies ?? []);
    setDiagrams(json.diagrams ?? []);
  }, [projectId]);

  const loadDetail = useCallback(async (studyId: string) => {
    if (!projectId) return;
    const res = await fetch(`/api/projects/${projectId}/simulation/studies/${studyId}`);
    if (!res.ok) { setDetail(null); return; }
    setDetail((await res.json()).study ?? null);
  }, [projectId]);

  useEffect(() => { loadStudies(); }, [loadStudies]);
  useEffect(() => { if (selectedId) loadDetail(selectedId); else setDetail(null); }, [selectedId, loadDetail]);

  async function createStudy() {
    if (!projectId || !newStudy.trim()) return;
    setErr(null);
    const res = await fetch(`/api/projects/${projectId}/simulation/studies`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newStudy.trim() }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(json.error ?? "Failed"); return; }
    setNewStudy("");
    await loadStudies();
    setSelectedId(json.study?.id ?? null);
  }

  async function deleteStudy(studyId: string) {
    if (!projectId) return;
    await fetch(`/api/projects/${projectId}/simulation/studies/${studyId}`, { method: "DELETE" });
    if (selectedId === studyId) setSelectedId(null);
    await loadStudies();
  }

  async function toggleRoot(diagramId: string) {
    if (!projectId || !detail) return;
    const current = new Set(detail.roots.map((r) => r.diagram.id));
    if (current.has(diagramId)) current.delete(diagramId); else current.add(diagramId);
    const res = await fetch(`/api/projects/${projectId}/simulation/studies/${detail.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rootDiagramIds: [...current] }),
    });
    if (res.ok) { setDetail((await res.json()).study ?? detail); await loadStudies(); }
  }

  if (!projectId) return <p className="text-xs text-green-400/50">Open this diagram from a project to manage studies.</p>;

  return (
    <div className="flex flex-col gap-3 text-[11px]">
      {/* Study list */}
      <div className="flex flex-col gap-1">
        {studies.length === 0 && <p className="text-green-400/50">No studies yet — create one below.</p>}
        {studies.map((s) => (
          <div key={s.id} className={`flex items-center gap-2 px-1 rounded ${selectedId === s.id ? "bg-green-400/10" : ""}`}>
            <button onClick={() => setSelectedId(selectedId === s.id ? null : s.id)} className="flex-1 text-left text-green-300 hover:text-green-200 truncate">
              {selectedId === s.id ? "▾" : "▸"} {s.name}
            </button>
            <span className="text-green-400/40">{s._count?.roots ?? 0}r · {s._count?.scenarios ?? 0}s</span>
            <a href={`/api/projects/${projectId}/simulation/export?studyId=${s.id}`} download
              className="text-green-400/60 hover:text-green-300 px-1" title="Export this study as a Diagramatix simulation bundle (.dgxsim.json)">⭳</a>
            <button onClick={() => deleteStudy(s.id)} className="text-red-400/70 hover:text-red-300 px-1" title="Delete study">✕</button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-green-500/20">
        <input
          type="text" value={newStudy} placeholder="new study (e.g. Q3 workload)"
          onChange={(e) => setNewStudy(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createStudy(); }}
          className="flex-1 bg-black border border-green-500/40 rounded px-1.5 py-0.5 text-green-200 [color-scheme:dark]"
        />
        <MatrixButton onClick={createStudy}>+ Study</MatrixButton>
        <MatrixButton onClick={() => importRef.current?.click()}>{importing ? "…" : "⭱ Import"}</MatrixButton>
        <input ref={importRef} type="file" accept=".json,.dgxsim,application/json" onChange={importBundle} className="hidden" />
      </div>
      <p className="text-green-400/40 text-[10px]">⭳ on a study exports the whole simulation (diagrams + teams + calendars + scenarios) as a portable bundle; ⭱ Import recreates one in a new project.</p>
      {err && <p className="text-red-400">{err}</p>}

      {/* Selected study detail */}
      {detail && (
        <div className="flex flex-col gap-3 pt-2 border-t border-green-500/30">
          <RootPicker diagrams={diagrams} roots={new Set(detail.roots.map((r) => r.diagram.id))} onToggle={toggleRoot} />
          <ScenarioList projectId={projectId} detail={detail} diagrams={diagrams} onChanged={() => loadDetail(detail.id)} onRan={onRan} />
          {isAdmin && <SaveAsExample projectId={projectId} studyId={detail.id} defaultTitle={detail.name} />}
        </div>
      )}
    </div>
  );
}

function RootPicker({ diagrams, roots, onToggle }: { diagrams: DiagramLite[]; roots: Set<string>; onToggle: (id: string) => void }) {
  return (
    <div>
      <p className="text-green-400/70 uppercase tracking-widest text-[10px] mb-1">Root diagrams</p>
      {diagrams.length === 0 && <p className="text-green-400/40">No BPMN diagrams in this project.</p>}
      <div className="flex flex-col gap-0.5 max-h-40 overflow-auto">
        {diagrams.map((d) => (
          <label key={d.id} className="flex items-center gap-2 cursor-pointer hover:text-green-200">
            <input type="checkbox" checked={roots.has(d.id)} onChange={() => onToggle(d.id)} className="accent-green-500" />
            <span className={roots.has(d.id) ? "text-green-300" : "text-green-400/60"}>{d.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ScenarioList({ projectId, detail, diagrams, onChanged, onRan }: { projectId: string; detail: StudyDetail; diagrams: DiagramLite[]; onChanged: () => void; onRan?: (cfg: ScenarioRunConfig) => void }) {
  const [newName, setNewName] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [pairing, setPairing] = useState(false);
  // Scenarios that have a completed run — DONE from a prior session (persisted
  // status) plus any run in this session — so "compare scenarios" only enables
  // once there's something to compare.
  const [ranIds, setRanIds] = useState<Set<string>>(new Set());
  const hasRun = (s: ScenarioRow) => s.status === "DONE" || ranIds.has(s.id);
  const ranCount = detail.scenarios.filter(hasRun).length;
  const canCompare = ranCount >= 2;

  const base = `/api/projects/${projectId}/simulation/studies/${detail.id}/scenarios`;

  async function addScenario(duplicateOf?: string) {
    const name = duplicateOf ? `${detail.scenarios.find((s) => s.id === duplicateOf)?.name ?? "Scenario"} copy` : newName.trim();
    if (!name) return;
    const isBaseline = detail.scenarios.length === 0 && !duplicateOf; // first scenario = baseline
    const res = await fetch(base, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, duplicateOf, isBaseline }),
    });
    if (res.ok) { setNewName(""); onChanged(); }
  }

  async function patchScenario(scenarioId: string, patch: Record<string, unknown>) {
    await fetch(`${base}/${scenarioId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    onChanged();
  }

  /** Create an "As-is" + "To-be" scenario pair, each pinned to a diagram. */
  async function createAsIsToBe(asIsId: string, toBeId: string) {
    const mk = async (name: string, isBaseline: boolean, diagramId: string) => {
      const res = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, isBaseline }) });
      if (!res.ok) return;
      const id = (await res.json().catch(() => ({})))?.scenario?.id;
      if (id) await fetch(`${base}/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variantRootIds: [diagramId] }) });
    };
    await mk("As-is", true, asIsId);
    await mk("To-be", false, toBeId);
    setPairing(false);
    onChanged();
  }

  async function deleteScenario(scenarioId: string) {
    await fetch(`${base}/${scenarioId}`, { method: "DELETE" });
    if (openId === scenarioId) setOpenId(null);
    onChanged();
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <p className="text-green-400/70 uppercase tracking-widest text-[10px]">Scenarios</p>
        {diagrams.length >= 2 && (
          <button onClick={() => setPairing((v) => !v)} className="text-green-400/70 hover:text-green-300 text-[10px]">
            {pairing ? "▾ hide" : "⇄ set up As-is vs To-be"}
          </button>
        )}
        {detail.scenarios.length >= 2 && (
          <button
            onClick={() => { if (canCompare) setComparing((v) => !v); }}
            disabled={!canCompare}
            title={canCompare ? "Compare the scenarios' latest runs" : "Run both scenarios first, then compare"}
            className={`text-[10px] ${canCompare ? "text-green-400/70 hover:text-green-300" : "text-green-400/25 cursor-not-allowed"}`}
          >
            {comparing ? "▾ hide compare" : "⇄ compare scenarios"}
          </button>
        )}
      </div>
      {pairing && <AsIsToBeSetup diagrams={diagrams} onCreate={createAsIsToBe} />}
      {comparing && detail.scenarios.length >= 2 && (
        <div className="border border-green-500/30 rounded p-2 mb-2">
          <ScenarioCompare scenarios={detail.scenarios} runUrlFor={(sid) => `${base}/${sid}/run`} assessUrl={`/api/projects/${projectId}/simulation/studies/${detail.id}/assess`} />
        </div>
      )}
      {detail.scenarios.length === 0 && <p className="text-green-400/40">No scenarios — add one below.</p>}
      <div className="flex flex-col gap-1">
        {detail.scenarios.map((s) => (
          <div key={s.id} className={`border rounded ${openId === s.id ? "border-green-400 bg-green-400/5" : "border-green-500/20"}`}>
            <div className="flex items-center gap-2 px-2 py-1">
              <button onClick={() => setOpenId(openId === s.id ? null : s.id)} className={`flex-1 text-left hover:text-green-200 truncate ${openId === s.id ? "text-green-200" : "text-green-300"}`}>
                {openId === s.id ? "▾" : "▸"} {s.name}
              </button>
              {hasRun(s) && <span className="text-green-400 text-[10px]" title="has a completed run">✓ ran</span>}
              {s.isBaseline
                ? <span className="text-green-300/80 text-[9px] border border-green-500/40 rounded px-1">BASELINE</span>
                : <button onClick={() => patchScenario(s.id, { isBaseline: true })} className="text-green-400/50 hover:text-green-300 text-[9px]">set baseline</button>}
              <button onClick={() => addScenario(s.id)} className="text-green-400/60 hover:text-green-300" title="Duplicate">⎘</button>
              <button onClick={() => deleteScenario(s.id)} className="text-red-400/70 hover:text-red-300" title="Delete">✕</button>
            </div>
            {openId === s.id && (
              <div className="px-2 pb-2 border-t border-green-500/20 pt-2">
                <ScenarioEditor
                  scenario={s} runUrl={`${base}/${s.id}/run`} diagrams={diagrams}
                  runItemUrl={(rid) => `${base}/${s.id}/runs/${rid}`}
                  assessUrl={`/api/projects/${projectId}/simulation/studies/${detail.id}/assess`}
                  onSave={(cfg) => patchScenario(s.id, { runConfig: cfg })}
                  onSetVariant={(ids) => patchScenario(s.id, { variantRootIds: ids })}
                  onRan={(cfg) => { setRanIds((prev) => new Set(prev).add(s.id)); onRan?.(cfg); }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1 mt-1 border-t border-green-500/20">
        <input
          type="text" value={newName} placeholder="new scenario (e.g. surge staffing)"
          onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addScenario(); }}
          className="flex-1 bg-black border border-green-500/40 rounded px-1.5 py-0.5 text-green-200 [color-scheme:dark]"
        />
        <MatrixButton onClick={() => addScenario()}>+ Scenario</MatrixButton>
      </div>
    </div>
  );
}

interface RunSummary {
  completed: number;
  flowP50: number;
  flowP95: number;
  topBottleneck: string | null;
  topUtil: number;
}

/** Quick "As-is vs To-be" pair builder — pick the two variant diagrams. */
function AsIsToBeSetup({ diagrams, onCreate }: { diagrams: DiagramLite[]; onCreate: (asIsId: string, toBeId: string) => void }) {
  const [asIs, setAsIs] = useState(diagrams[0]?.id ?? "");
  const [toBe, setToBe] = useState(diagrams[1]?.id ?? diagrams[0]?.id ?? "");
  const sel = "bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-200 text-[11px] [color-scheme:dark]";
  return (
    <div className="border border-green-500/30 rounded p-2 mb-2 flex flex-col gap-1.5 text-[11px]">
      <p className="text-green-400/70">Creates an <span className="text-green-300">As-is</span> (baseline) + <span className="text-green-300">To-be</span> scenario, each pinned to a diagram. Tip: duplicate your process on the project screen, redesign the copy, then pair them here.</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-green-400/50">As-is</span>
        <select value={asIs} onChange={(e) => setAsIs(e.target.value)} className={sel}>{diagrams.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <span className="text-green-400/50">→ To-be</span>
        <select value={toBe} onChange={(e) => setToBe(e.target.value)} className={sel}>{diagrams.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <MatrixButton onClick={() => asIs && toBe && onCreate(asIs, toBe)}>Create pair</MatrixButton>
      </div>
    </div>
  );
}

function ScenarioEditor({ scenario, runUrl, runItemUrl, assessUrl, diagrams, onSave, onSetVariant, onRan }: { scenario: ScenarioRow; runUrl: string; runItemUrl: (rid: string) => string; assessUrl: string; diagrams: DiagramLite[]; onSave: (cfg: ScenarioRunConfig) => void; onSetVariant: (ids: string[]) => void; onRan?: (cfg: ScenarioRunConfig) => void }) {
  const initial: ScenarioRunConfig = { ...DEFAULT_RUN_CONFIG, ...(scenario.runConfig ?? {}) };
  const variantId = scenario.variantRootIds?.[0] ?? "";
  const [cfg, setCfg] = useState<ScenarioRunConfig>(initial);
  const [dirty, setDirty] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunSummary | null>(null);
  const [runErr, setRunErr] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [ran, setRan] = useState(0); // bump to refetch the report after a run
  const [setup, setSetup] = useState<ReadinessIssue[] | null>(null); // pre-run readiness dialog
  const [lastRunId, setLastRunId] = useState<string | null>(null); // the just-finished run, for "save to history"
  const [naming, setNaming] = useState(false); // quick-name dialog for the last run
  const [showHistory, setShowHistory] = useState(false);

  async function runScenario(force = false) {
    setRunning(true); setRunErr(null); setResult(null); setSetup(null);
    try {
      // Persist the latest config first so the run uses what's on screen.
      onSave(cfg); setDirty(false);
      const res = await fetch(runUrl + (force ? "?force=true" : ""), { method: "POST" });
      const json = await res.json().catch(() => ({}));
      // Pre-run readiness gate: the server returns the un-set parameters instead
      // of running; show them so the user can fix or Run anyway.
      if (json.needsSetup) { setSetup((json.issues ?? []) as ReadinessIssue[]); return; }
      if (!res.ok) { setRunErr(json.error ?? "Run failed"); return; }
      setLastRunId(json.run?.id ?? null);
      const stats = json.run?.metrics?.stats;
      const bottlenecks: string[] = json.run?.metrics?.bottlenecks ?? [];
      const top = bottlenecks[0] ?? null;
      setResult({
        completed: stats?.completed?.mean ?? 0,
        flowP50: stats?.flowTime?.p50 ?? 0,
        flowP95: stats?.flowTime?.p95 ?? 0,
        topBottleneck: top,
        topUtil: top ? stats?.perTeam?.[top]?.utilization?.mean ?? 0 : 0,
      });
      setRan((n) => n + 1); // force the report to refetch the new run
      onRan?.(cfg); // tell the console the config of the run just completed (for the replay)
    } catch (e) {
      setRunErr(e instanceof Error ? e.message : "Run failed");
    } finally { setRunning(false); }
  }

  const set = (patch: Partial<ScenarioRunConfig>) => { setCfg((c) => ({ ...c, ...patch })); setDirty(true); };
  const interventions = cfg.interventions ?? [];

  function setIv(idx: number, patch: Partial<PlannedIntervention>) {
    const next = interventions.map((iv, i) => (i === idx ? { ...iv, ...patch } : iv));
    set({ interventions: next });
  }
  function addIv() {
    const iv: PlannedIntervention = { id: crypto.randomUUID(), t: 0, kind: "capacity", target: "", value: 1 };
    set({ interventions: [...interventions, iv] });
  }
  function removeIv(idx: number) { set({ interventions: interventions.filter((_, i) => i !== idx) }); }

  const num = (v: string, min = 0) => Math.max(min, Number(v) || 0);

  return (
    <div className="flex flex-col gap-2">
      {/* Process variant (As-is vs To-be): which diagram this scenario runs. */}
      <Labelled label="Process variant (As-is / To-be)">
        <select
          value={variantId}
          onChange={(e) => onSetVariant(e.target.value ? [e.target.value] : [])}
          className="w-full bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-200 text-[11px] [color-scheme:dark]"
        >
          <option value="">(study process)</option>
          {diagrams.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Labelled>
      <div className="grid grid-cols-3 gap-2">
        <Labelled label="Clock unit">
          <select value={cfg.clockUnit} onChange={(e) => set({ clockUnit: e.target.value as ClockUnit })} className="w-full bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-200 [color-scheme:dark]">
            {CLOCK_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Labelled>
        <Labelled label="Horizon"><NumIn value={cfg.horizon} onChange={(v) => set({ horizon: num(v, 1) })} /></Labelled>
        <Labelled label="Warm-up"><NumIn value={cfg.warmUp} onChange={(v) => set({ warmUp: num(v) })} /></Labelled>
        <Labelled label="Replications"><NumIn value={cfg.replications} onChange={(v) => set({ replications: num(v, 1) })} /></Labelled>
        <Labelled label="Seed"><NumIn value={cfg.seed} onChange={(v) => set({ seed: num(v) })} /></Labelled>
        <Labelled label="Queue stats">
          <select value={cfg.collectQueues ? "y" : "n"} onChange={(e) => set({ collectQueues: e.target.value === "y" })} className="w-full bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-200 [color-scheme:dark]">
            <option value="y">on</option><option value="n">off</option>
          </select>
        </Labelled>
      </div>

      {/* Planned interventions */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-green-400/70 uppercase tracking-widest text-[10px]">Planned interventions</span>
          <button onClick={addIv} className="text-green-400/70 hover:text-green-300 text-[10px]">+ add</button>
        </div>
        {interventions.length === 0 && <p className="text-green-400/40 text-[10px]">None — the run uses the baseline throughout.</p>}
        {interventions.map((iv, i) => (
          <div key={iv.id} className="flex items-center gap-1 mt-1">
            <span className="text-green-400/40">@</span>
            <NumIn value={iv.t} onChange={(v) => setIv(i, { t: num(v) })} className="w-12" title="time (clock units)" />
            <select value={iv.kind} onChange={(e) => setIv(i, { kind: e.target.value as PlannedInterventionKind })} className="bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-200 [color-scheme:dark]">
              {INTERVENTION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input type="text" value={iv.target} placeholder="target" onChange={(e) => setIv(i, { target: e.target.value })} className="w-20 bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-200 [color-scheme:dark]" title={KIND_HINT[iv.kind]} />
            <NumIn value={iv.value} onChange={(v) => setIv(i, { value: Number(v) || 0 })} className="w-14" title="value" />
            <NumIn value={iv.duration ?? 0} onChange={(v) => setIv(i, { duration: num(v) || undefined })} className="w-12" title="duration (0 = permanent)" />
            <button onClick={() => removeIv(i)} className="text-red-400/70 hover:text-red-300 px-1">✕</button>
          </div>
        ))}
        {interventions.length > 0 && <p className="text-green-400/40 text-[9px] mt-1">cols: time · kind · target · value · duration. {KIND_HINT[interventions[interventions.length - 1].kind]}</p>}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <MatrixButton onClick={() => { onSave(cfg); setDirty(false); }}>{dirty ? "Save config" : "Saved"}</MatrixButton>
        <MatrixButton onClick={() => runScenario()}>{running ? "◴ running…" : "▶ Run"}</MatrixButton>
      </div>
      {runErr && <p className="text-red-400 text-[10px]">{runErr}</p>}
      {setup && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={() => setSetup(null)}>
          <div className="bg-black border border-green-500/50 rounded-lg max-w-md w-full max-h-[80vh] overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-green-400 uppercase tracking-widest text-[11px] mb-1">Complete the simulation setup</p>
            <p className="text-[11px] text-green-300/70 mb-2">
              {setup.some((i) => i.severity === "error")
                ? "Some parameters still need setting for the results to be meaningful:"
                : "These will use defaults — set them for accurate numbers, or run anyway:"}
            </p>
            <ul className="flex flex-col gap-1 text-[11px] mb-3">
              {setup.map((i, n) => (
                <li key={n} className="flex gap-1.5">
                  <span className={i.severity === "error" ? "text-red-400" : "text-yellow-400/80"}>{i.severity === "error" ? "✕" : "!"}</span>
                  <span className="text-green-200/90">{i.message}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <MatrixButton onClick={() => { setSetup(null); runScenario(true); }}>Run anyway</MatrixButton>
              <button onClick={() => setSetup(null)} className="text-green-400/60 hover:text-green-300 text-[11px]">Cancel &amp; fix</button>
            </div>
          </div>
        </div>
      )}
      {result && (
        <div className="border border-green-500/30 rounded p-2 mt-1 text-[10px] text-green-300/90 flex flex-col gap-0.5">
          <div className="text-green-400/60 uppercase tracking-widest">Latest run · {cfg.replications} rep(s)</div>
          <div>Completed (mean): <span className="text-green-200">{result.completed.toFixed(1)}</span></div>
          <div>Flow time p50 / p95: <span className="text-green-200">{result.flowP50.toFixed(1)} / {result.flowP95.toFixed(1)}</span> {cfg.clockUnit}s</div>
          <div>
            Top bottleneck:{" "}
            {result.topBottleneck
              ? <span className="text-green-200">{result.topBottleneck} ({(result.topUtil * 100).toFixed(0)}% util)</span>
              : <span className="text-green-400/50">no resource pools</span>}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <button onClick={() => setShowReport((v) => !v)} className="text-green-400/70 hover:text-green-300">
              {showReport ? "▾ hide full results" : "▸ full results"}
            </button>
            {lastRunId && <button onClick={() => setNaming(true)} className="text-green-300/80 hover:text-green-200" title="keep this run in the history under a name">★ save to history…</button>}
          </div>
        </div>
      )}
      {showReport && (
        <div className="border border-green-500/30 rounded p-2 mt-1">
          <ResultsReport key={ran} runUrl={runUrl} />
        </div>
      )}

      {/* Run History — named/pinned runs + compare two saved runs. */}
      <div className="mt-1 border-t border-green-500/20 pt-1">
        <button onClick={() => setShowHistory((v) => !v)} className="text-green-400/70 hover:text-green-300 text-[11px]">
          {showHistory ? "▾ Run History" : "▸ Run History"}
        </button>
        {showHistory && <RunHistory historyUrl={runUrl} runItemUrl={runItemUrl} assessUrl={assessUrl} refreshKey={ran} />}
      </div>

      {naming && lastRunId && (
        <PromptDialog
          title="Save run to history" message="Give this run a name to keep it (e.g. a capacity or staffing variant)."
          placeholder="e.g. Large Sales Team (25)" confirmLabel="Save"
          onConfirm={async (v) => {
            setNaming(false);
            if (!v.trim()) return;
            await fetch(runItemUrl(lastRunId), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: v.trim() }) });
            setShowHistory(true); setRan((n) => n + 1);
          }}
          onCancel={() => setNaming(false)}
        />
      )}
    </div>
  );
}

/** Admin-only: capture this study into a NEW draft example catalog entry. */
function SaveAsExample({ projectId, studyId, defaultTitle }: { projectId: string; studyId: string; defaultTitle: string }) {
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
      const res = await fetch(`/api/admin/simulation-examples/capture`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, studyId, title: title.trim(), concept: concept.trim(), difficulty }),
      });
      const json = await res.json().catch(() => ({}));
      setMsg(res.ok ? "Saved as a draft example ✓ — publish it in the Catalog manager." : (json.error ?? "Capture failed"));
    } finally { setBusy(false); }
  }

  return (
    <div className="pt-2 border-t border-green-500/20">
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-green-400/70 hover:text-green-300 text-[10px] uppercase tracking-widest">
          ⎘ Save study as example
        </button>
      ) : (
        <div className="flex flex-col gap-1.5 text-[11px]">
          <span className="text-green-400/70 uppercase tracking-widest text-[10px]">Save as example (admin)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="title"
            className="bg-black border border-green-500/40 rounded px-1.5 py-0.5 text-green-200 [color-scheme:dark]" />
          <input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="one-line concept"
            className="bg-black border border-green-500/40 rounded px-1.5 py-0.5 text-green-200 [color-scheme:dark]" />
          <div className="flex items-center gap-2">
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-200 [color-scheme:dark]">
              <option value="intro">intro</option><option value="core">core</option><option value="advanced">advanced</option>
            </select>
            <MatrixButton onClick={capture}>{busy ? "…" : "Capture"}</MatrixButton>
            <button onClick={() => setOpen(false)} className="text-green-400/50 hover:text-green-300 text-[10px]">cancel</button>
          </div>
          {msg && <span className="text-green-300 text-[10px]">{msg}</span>}
        </div>
      )}
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-green-400/50 text-[10px]">{label}</span>
      {children}
    </label>
  );
}

function NumIn({ value, onChange, className = "", title }: { value: number; onChange: (v: string) => void; className?: string; title?: string }) {
  return (
    <input
      type="number" value={value} title={title}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-200 [color-scheme:dark] ${className || "w-full"}`}
    />
  );
}
