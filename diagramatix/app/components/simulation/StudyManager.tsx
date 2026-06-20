"use client";

/**
 * Matrix-styled manager for simulation Studies (portfolios) + their Scenarios.
 * A study is a set of root BPMN diagrams; the engine assembles each root's
 * forward-link closure into one network sharing the team pools. A scenario
 * layers a run config + planned (timed) interventions on top; running the
 * Monte-Carlo + results land in Phase 5, so the Run button is staged off here.
 */

import { useCallback, useEffect, useState } from "react";
import { MatrixButton } from "./matrix/MatrixChrome";
import {
  DEFAULT_RUN_CONFIG,
  type ScenarioRunConfig,
  type PlannedIntervention,
  type PlannedInterventionKind,
  type ClockUnit,
} from "@/app/lib/simulation/types";

interface DiagramLite { id: string; name: string }
interface StudyRow { id: string; name: string; _count?: { roots: number; scenarios: number } }
interface ScenarioRow { id: string; name: string; isBaseline: boolean; status: string; runConfig: ScenarioRunConfig; overrides: unknown }
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

export function StudyManager({ projectId }: { projectId: string | null }) {
  const [studies, setStudies] = useState<StudyRow[]>([]);
  const [diagrams, setDiagrams] = useState<DiagramLite[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StudyDetail | null>(null);
  const [newStudy, setNewStudy] = useState("");
  const [err, setErr] = useState<string | null>(null);

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
            <button onClick={() => deleteStudy(s.id)} className="text-red-400/70 hover:text-red-300 px-1" title="Delete study">✕</button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-green-500/20">
        <input
          type="text" value={newStudy} placeholder="new study (e.g. Q3 workload)"
          onChange={(e) => setNewStudy(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createStudy(); }}
          className="flex-1 bg-black border border-green-500/40 rounded px-1.5 py-0.5 text-green-300"
        />
        <MatrixButton onClick={createStudy}>+ Study</MatrixButton>
      </div>
      {err && <p className="text-red-400">{err}</p>}

      {/* Selected study detail */}
      {detail && (
        <div className="flex flex-col gap-3 pt-2 border-t border-green-500/30">
          <RootPicker diagrams={diagrams} roots={new Set(detail.roots.map((r) => r.diagram.id))} onToggle={toggleRoot} />
          <ScenarioList projectId={projectId} detail={detail} onChanged={() => loadDetail(detail.id)} />
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

function ScenarioList({ projectId, detail, onChanged }: { projectId: string; detail: StudyDetail; onChanged: () => void }) {
  const [newName, setNewName] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

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

  async function deleteScenario(scenarioId: string) {
    await fetch(`${base}/${scenarioId}`, { method: "DELETE" });
    if (openId === scenarioId) setOpenId(null);
    onChanged();
  }

  return (
    <div>
      <p className="text-green-400/70 uppercase tracking-widest text-[10px] mb-1">Scenarios</p>
      {detail.scenarios.length === 0 && <p className="text-green-400/40">No scenarios — add one below.</p>}
      <div className="flex flex-col gap-1">
        {detail.scenarios.map((s) => (
          <div key={s.id} className="border border-green-500/20 rounded">
            <div className="flex items-center gap-2 px-2 py-1">
              <button onClick={() => setOpenId(openId === s.id ? null : s.id)} className="flex-1 text-left text-green-300 hover:text-green-200 truncate">
                {openId === s.id ? "▾" : "▸"} {s.name}
              </button>
              {s.isBaseline
                ? <span className="text-green-300/80 text-[9px] border border-green-500/40 rounded px-1">BASELINE</span>
                : <button onClick={() => patchScenario(s.id, { isBaseline: true })} className="text-green-400/50 hover:text-green-300 text-[9px]">set baseline</button>}
              <button onClick={() => addScenario(s.id)} className="text-green-400/60 hover:text-green-300" title="Duplicate">⎘</button>
              <button onClick={() => deleteScenario(s.id)} className="text-red-400/70 hover:text-red-300" title="Delete">✕</button>
            </div>
            {openId === s.id && (
              <div className="px-2 pb-2 border-t border-green-500/20 pt-2">
                <ScenarioEditor scenario={s} runUrl={`${base}/${s.id}/run`} onSave={(cfg) => patchScenario(s.id, { runConfig: cfg })} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1 mt-1 border-t border-green-500/20">
        <input
          type="text" value={newName} placeholder="new scenario (e.g. surge staffing)"
          onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addScenario(); }}
          className="flex-1 bg-black border border-green-500/40 rounded px-1.5 py-0.5 text-green-300"
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

function ScenarioEditor({ scenario, runUrl, onSave }: { scenario: ScenarioRow; runUrl: string; onSave: (cfg: ScenarioRunConfig) => void }) {
  const initial: ScenarioRunConfig = { ...DEFAULT_RUN_CONFIG, ...(scenario.runConfig ?? {}) };
  const [cfg, setCfg] = useState<ScenarioRunConfig>(initial);
  const [dirty, setDirty] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunSummary | null>(null);
  const [runErr, setRunErr] = useState<string | null>(null);

  async function runScenario() {
    setRunning(true); setRunErr(null); setResult(null);
    try {
      // Persist the latest config first so the run uses what's on screen.
      onSave(cfg); setDirty(false);
      const res = await fetch(runUrl, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setRunErr(json.error ?? "Run failed"); return; }
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
      <div className="grid grid-cols-3 gap-2">
        <Labelled label="Clock unit">
          <select value={cfg.clockUnit} onChange={(e) => set({ clockUnit: e.target.value as ClockUnit })} className="w-full bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-300">
            {CLOCK_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Labelled>
        <Labelled label="Horizon"><NumIn value={cfg.horizon} onChange={(v) => set({ horizon: num(v, 1) })} /></Labelled>
        <Labelled label="Warm-up"><NumIn value={cfg.warmUp} onChange={(v) => set({ warmUp: num(v) })} /></Labelled>
        <Labelled label="Replications"><NumIn value={cfg.replications} onChange={(v) => set({ replications: num(v, 1) })} /></Labelled>
        <Labelled label="Seed"><NumIn value={cfg.seed} onChange={(v) => set({ seed: num(v) })} /></Labelled>
        <Labelled label="Queue stats">
          <select value={cfg.collectQueues ? "y" : "n"} onChange={(e) => set({ collectQueues: e.target.value === "y" })} className="w-full bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-300">
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
            <select value={iv.kind} onChange={(e) => setIv(i, { kind: e.target.value as PlannedInterventionKind })} className="bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-300">
              {INTERVENTION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input type="text" value={iv.target} placeholder="target" onChange={(e) => setIv(i, { target: e.target.value })} className="w-20 bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-300" title={KIND_HINT[iv.kind]} />
            <NumIn value={iv.value} onChange={(v) => setIv(i, { value: Number(v) || 0 })} className="w-14" title="value" />
            <NumIn value={iv.duration ?? 0} onChange={(v) => setIv(i, { duration: num(v) || undefined })} className="w-12" title="duration (0 = permanent)" />
            <button onClick={() => removeIv(i)} className="text-red-400/70 hover:text-red-300 px-1">✕</button>
          </div>
        ))}
        {interventions.length > 0 && <p className="text-green-400/40 text-[9px] mt-1">cols: time · kind · target · value · duration. {KIND_HINT[interventions[interventions.length - 1].kind]}</p>}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <MatrixButton onClick={() => { onSave(cfg); setDirty(false); }}>{dirty ? "Save config" : "Saved"}</MatrixButton>
        <MatrixButton onClick={runScenario}>{running ? "◴ running…" : "▶ Run"}</MatrixButton>
      </div>
      {runErr && <p className="text-red-400 text-[10px]">{runErr}</p>}
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
          <div className="text-green-400/40">Full heatmap + scenario comparison land next.</div>
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
      className={`bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-300 ${className || "w-full"}`}
    />
  );
}
