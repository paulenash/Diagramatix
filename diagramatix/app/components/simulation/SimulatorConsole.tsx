"use client";

/**
 * The Matrix-styled Simulator console. Home shows the manager panels; the
 * Run / Replay panel launches the live green-token replay + Operator console
 * on the current diagram. Teams / Studies / Scenarios managers land in later
 * phases.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DiagramData } from "@/app/lib/diagram/types";
import type { SymbolColorConfig } from "@/app/lib/diagram/colors";
import { MatrixRain } from "./matrix/MatrixRain";
import { MatrixButton, MatrixPanel } from "./matrix/MatrixChrome";
import { ReplayView } from "./replay/ReplayView";
import { SimulationHeatmap } from "./results/SimulationHeatmap";
import { TokenTraceTable } from "./results/TokenTraceTable";
import { TeamLibraryManager } from "./TeamLibraryManager";
import { CalendarLibraryManager, type CalendarRow } from "./CalendarLibraryManager";
import { BpsimInterchange } from "./BpsimInterchange";
import { StudyManager } from "./StudyManager";
import { SimDataPanel } from "./SimDataPanel";
import { defaultReplayConfig, buildReplay } from "@/app/lib/simulation/replaySource";
import { seedSimulationDefaults } from "@/app/lib/simulation/seedDefaults";
import { usedTeamNames } from "@/app/lib/simulation/harvestTeams";
import { autofillSimulation, unfillSimulation } from "@/app/lib/simulation/autofill";
import type { ScenarioRunConfig, WorkCalendar } from "@/app/lib/simulation/types";

const EMPTY_DIAGRAM: DiagramData = { elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } };

export function SimulatorConsole({ data = EMPTY_DIAGRAM, colorConfig, diagramId, projectId, isAdmin, diagramName, projectName, onClose, onFillTestData, onApplyData }: {
  data?: DiagramData; colorConfig?: SymbolColorConfig; diagramId?: string; projectId: string | null; isAdmin?: boolean; diagramName?: string; projectName?: string; onClose: () => void; onFillTestData?: () => number; onApplyData?: (next: DiagramData) => void;
}) {
  // Project mode = entered from a Project (no single open diagram): show the
  // project name + a variant selector across all its processes for comparison.
  // Diagram mode = entered from one diagram: single-process, just that name.
  const projectMode = !diagramId;
  const [mode, setMode] = useState<"home" | "replay" | "heatmap" | "table">("home");
  const [teamCapacities, setTeamCapacities] = useState<Record<string, number>>({});
  // Working calendars: the library (from the Calendars panel) + the team→calendar
  // assignment (from the Teams panel). Resolved into the maps the assembler wants
  // so replay/heatmap honour working hours, exactly like the authoritative run.
  const [calendars, setCalendars] = useState<CalendarRow[]>([]);
  const [teamCalMap, setTeamCalMap] = useState<Record<string, string>>({}); // team name → calendarId
  // Memoised so their identity is STABLE across renders — otherwise a fresh
  // object every render churns ReplayView's `replayOpts`, whose "rebuild on
  // diagrams load" effect then keeps resetting the clock to Monday 00:00 and
  // restarting the run (the replay-clock reset loop).
  const calendarsById = useMemo<Record<string, WorkCalendar>>(
    () => Object.fromEntries(calendars.map((c) => [c.id, c.pattern])),
    [calendars],
  );
  const teamCalendars = useMemo<Record<string, WorkCalendar>>(
    () => Object.fromEntries(
      Object.entries(teamCalMap).filter(([, calId]) => calId && calendarsById[calId]).map(([name, calId]) => [name, calendarsById[calId]]),
    ),
    [teamCalMap, calendarsById],
  );
  // Config of the LAST scenario that ran (from Studies & Scenarios), so "Launch
  // replay" animates that run — its full horizon → the real volume of tokens —
  // rather than a short default window. One replication + no warm-up so every
  // token is shown from t=0.
  const [lastRunCfg, setLastRunCfg] = useState<ScenarioRunConfig | null>(null);
  const replayCfg = useMemo(() => lastRunCfg ? { ...defaultReplayConfig(lastRunCfg.seed ?? 1), ...lastRunCfg, replications: 1, warmUp: 0 } : defaultReplayConfig(), [lastRunCfg]);

  // ── Variant selector ─────────────────────────────────────────────────────
  // For a comparison study the panels (Simulation Data, missing-data highlight,
  // heatmap, replay) should follow the chosen As-is/To-be diagram, not just the
  // one open in the editor. Pick any project BPMN diagram; the open one edits
  // live through the editor, others load + save via the diagram API.
  const [diagramList, setDiagramList] = useState<{ id: string; name: string }[]>([]);
  const [activeId, setActiveId] = useState<string | null>(diagramId ?? null);
  const [variantData, setVariantData] = useState<DiagramData | null>(null);
  const [loadingVariant, setLoadingVariant] = useState(false);
  // Full data of every project BPMN diagram, so the replay can splice linked
  // (collapsed) subprocesses in (their child diagrams live in this map).
  const [diagramsById, setDiagramsById] = useState<Map<string, DiagramData>>(new Map());
  useEffect(() => {
    if (!diagramList.length) return;
    let cancelled = false;
    Promise.all(diagramList.map((d) =>
      fetch(`/api/diagrams/${d.id}`).then((r) => (r.ok ? r.json() : null)).then((j) => [d.id, j?.data ?? null] as const).catch(() => [d.id, null] as const),
    )).then((entries) => { if (!cancelled) setDiagramsById(new Map(entries.filter((e): e is [string, DiagramData] => !!e[1]))); });
    return () => { cancelled = true; };
  }, [diagramList]);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/simulation/studies`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.diagrams) setDiagramList(j.diagrams); })
      .catch(() => {});
  }, [projectId]);

  // Project mode has no open diagram, so the ROOT process must be chosen before
  // anything is meaningful — silently defaulting to the first diagram in the
  // list simulates whichever process happens to sort first, which is rarely the
  // one the user meant. With exactly one candidate there is nothing to ask.
  const [rootPicked, setRootPicked] = useState(!projectMode);
  useEffect(() => {
    if (!projectMode || activeId || diagramList.length !== 1) return;
    setActiveId(diagramList[0].id);
    setRootPicked(true);
  }, [projectMode, activeId, diagramList]);
  const needsRootPick = projectMode && !rootPicked && diagramList.length > 1;

  // ── Auto-seed the default setup on first open ────────────────────────────
  // So the simulator is usable immediately instead of an empty library: the
  // three working calendars, one team per lane (capacity 1, Business Hours), and
  // an Initial Study / Baseline scenario if the project has none. Idempotent
  // (planDefaultSetup only creates what's missing). Runs once the project's
  // diagrams have loaded so lane-team harvest sees them; `seedKey` bump remounts
  // the library panels to show the newly-created rows.
  const [seedKey, setSeedKey] = useState(0);
  const seededRef = useRef(false);
  useEffect(() => {
    if (!projectId || seededRef.current) return;
    if (diagramList.length > 0 && diagramsById.size === 0) return; // wait for diagrams
    seededRef.current = true;
    seedSimulationDefaults(projectId, [...diagramsById.values()])
      .then((res) => { if (res.calendarsCreated || res.teamsCreated || res.studyCreated) setSeedKey((k) => k + 1); })
      .catch(() => { seededRef.current = false; }); // allow a retry on the next change
  }, [projectId, diagramList, diagramsById]);

  const isOpen = !activeId || activeId === diagramId;
  useEffect(() => {
    if (isOpen || !activeId) { setVariantData(null); return; }
    let cancelled = false;
    setLoadingVariant(true);
    fetch(`/api/diagrams/${activeId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setVariantData((j?.data ?? null) as DiagramData | null); })
      .finally(() => { if (!cancelled) setLoadingVariant(false); });
    return () => { cancelled = true; };
  }, [activeId, isOpen]);

  const activeData = isOpen ? data : (variantData ?? data);
  const canEditActive = isOpen ? !!onApplyData : !!variantData;
  const applyActive = useCallback((next: DiagramData) => {
    if (isOpen) { onApplyData?.(next); return; }
    setVariantData(next);
    fetch(`/api/diagrams/${activeId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: next, unconditional: true }) }).catch(() => {}); // authoritative sim write-back (DATA-32)
  }, [isOpen, activeId, onApplyData]);
  const fillActive = useCallback(() => {
    const { data: filled, filled: n } = autofillSimulation(activeData);
    applyActive(filled);
    return n;
  }, [activeData, applyActive]);
  const unfillActive = useCallback(() => {
    const { data: cleared, cleared: n } = unfillSimulation(activeData);
    applyActive(cleared);
    return n;
  }, [activeData, applyActive]);

  // ── Fill the process's missing simulation values on first open ────────────
  // Seeding the team/calendar/study libraries isn't enough to make the simulator
  // usable: without cycle times, arrival rates and branch %s there is nothing to
  // run. Fill them once per process, the same way the "⚙ Fill missing" button
  // does — so every value is provenance-tagged (shown purple) and "⎌ Unfill
  // missing" reverses it exactly, leaving anything typed by hand untouched.
  // Keyed by diagram id so switching variant fills that one too, but re-opening
  // never re-fills what is already there (autofill only writes absent values).
  const [autoFilled, setAutoFilled] = useState(0);
  const filledRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const key = activeId ?? diagramId;
    if (!key || needsRootPick || filledRef.current.has(key)) return;
    if (!canEditActive || activeData.elements.length === 0) return;
    filledRef.current.add(key);
    const n = fillActive();
    if (n > 0) setAutoFilled(n);
  }, [activeId, diagramId, needsRootPick, canEditActive, activeData, fillActive]);
  // Team names the project's diagrams actually reference, so the Teams panel can
  // mark rows nothing points at (a renamed or deleted lane leaves its old team
  // behind). Undefined until the diagrams load, so nothing is marked prematurely.
  const usedTeams = useMemo(
    () => (diagramsById.size === 0 && isOpen ? usedTeamNames([activeData]) : usedTeamNames([...diagramsById.values(), activeData])),
    [diagramsById, activeData, isOpen],
  );
  // The trace table runs one traced replication (like the replay) — built only
  // while the table is open so it costs nothing otherwise.
  const tableReplay = useMemo(
    () => mode === "table" ? buildReplay(activeData, replayCfg, teamCapacities, { rootId: activeId ?? diagramId, byId: diagramsById, teamCalendars, calendarsById }) : null,
    [mode, activeData, replayCfg, teamCapacities, activeId, diagramId, diagramsById, teamCalendars, calendarsById],
  );

  return (
    <div className="fixed inset-0 z-[60] bg-black text-green-400 font-mono overflow-hidden">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <MatrixRain fontSize={18} />
      </div>
      <div className="relative z-10 flex flex-col h-full">
        <header className="flex items-center justify-between px-5 py-3 border-b border-green-500/40">
          <div className="flex items-center gap-3">
            <span className="text-green-300 tracking-[0.3em] text-sm">◈ DiagramMATRIX SIMULATOR</span>
            {projectMode ? (
              <>
                {projectName && <span className="text-green-300 text-xs">{projectName}</span>}
                {diagramList.length > 0 && (
                  <label className="flex items-center gap-1 text-green-400/60 text-xs" title="Which process the panels below act on">
                    process
                    <select
                      value={activeId ?? ""}
                      onChange={(e) => setActiveId(e.target.value)}
                      className="bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-200 text-xs [color-scheme:dark]"
                    >
                      {diagramList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    {loadingVariant && <span className="text-green-400/40">loading…</span>}
                  </label>
                )}
              </>
            ) : diagramName ? (
              <span className="text-green-400/50 text-xs">{diagramName}</span>
            ) : null}
            {mode !== "home" && <button onClick={() => setMode("home")} className="text-green-400/60 text-xs hover:text-green-300">‹ back</button>}
          </div>
          <div className="flex items-center gap-2">
            <a href="/help?c=simulation" target="_blank" rel="noopener noreferrer"
              title="Open the Simulator section of the User Guide"
              className="text-green-300/80 hover:text-green-200 text-xs border border-green-500/40 rounded px-3 py-1.5">📖 User Guide</a>
            <MatrixButton variant="danger" onClick={onClose}>✕ EXIT</MatrixButton>
          </div>
        </header>

        {needsRootPick ? (
          // Entered from the Project screen: ask WHICH process to simulate
          // before filling anything, rather than silently picking whichever
          // diagram happens to sort first.
          <main className="flex-1 overflow-auto p-4">
            <div className="max-w-2xl mx-auto mt-6">
              <MatrixPanel title="Choose the root process">
                <p className="text-xs text-green-400/60 mb-3">
                  This project has {diagramList.length} processes. Pick the one to simulate — its
                  teams, calendars and missing values are set up for you. You can switch process at
                  any time from the header.
                </p>
                <div className="flex flex-col gap-1.5 max-h-[50vh] overflow-auto">
                  {diagramList.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => { setActiveId(d.id); setRootPicked(true); }}
                      className="text-left px-3 py-2 rounded border border-green-500/30 text-green-200 text-xs hover:bg-green-400/10 hover:border-green-400"
                    >
                      ▸ {d.name}
                    </button>
                  ))}
                </div>
              </MatrixPanel>
            </div>
          </main>
        ) : mode === "home" ? (
          <main className="flex-1 overflow-auto p-4">
            {/* Centred, compact column of panels — the ambient Matrix rain shows
                in the margins on either side rather than the panels filling the
                whole width. */}
            <div className="max-w-6xl mx-auto grid gap-3 md:grid-cols-3 content-start">
              <MatrixPanel title="Teams" className="md:col-span-2">
                <TeamLibraryManager key={`teams-${seedKey}`} projectId={projectId} onCapacities={setTeamCapacities} calendars={calendars} onTeamCalendars={setTeamCalMap} usedNames={usedTeams} />
              </MatrixPanel>
              <MatrixPanel title="Run / Replay">
                <p className="text-xs text-green-400/60 mb-3">
                  Watch tokens flow through the process with a <span className="text-green-300">live stats panel</span> (completed, queues, utilisation) climbing as it runs; intervene live. Or see where the heat builds up.
                  {lastRunCfg
                    ? <span className="text-green-300"> Replay uses your last scenario run ({lastRunCfg.horizon} {lastRunCfg.clockUnit}s).</span>
                    : <span className="text-green-400/40"> Run a scenario first for a full replay; otherwise a short sample runs.</span>}
                </p>
                <div className="flex flex-col gap-2">
                  <MatrixButton onClick={() => setMode("replay")}>▶ Launch replay</MatrixButton>
                  <MatrixButton onClick={() => setMode("heatmap")}>▦ Heatmap</MatrixButton>
                  <MatrixButton onClick={() => setMode("table")}>▤ Trace table</MatrixButton>
                </div>
              </MatrixPanel>
              <MatrixPanel title="Calendars — working hours" className="md:col-span-3">
                <CalendarLibraryManager key={`cals-${seedKey}`} projectId={projectId} onCalendars={setCalendars} />
              </MatrixPanel>
              <MatrixPanel title="Studies & Scenarios" className="md:col-span-3">
                <StudyManager key={`studies-${seedKey}`} projectId={projectId} isAdmin={isAdmin} onRan={(cfg) => { setLastRunCfg(cfg); setMode("replay"); }} />
              </MatrixPanel>
              <MatrixPanel title={`Simulation Data — see, edit, fill & clear${!isOpen ? ` · ${diagramList.find((d) => d.id === activeId)?.name ?? "variant"}` : ""}`} className="md:col-span-3">
                {!isOpen && (
                  <p className="text-[10px] text-green-400/50 mb-1">
                    Editing <span className="text-green-300">{diagramList.find((d) => d.id === activeId)?.name ?? "selected"}</span> — changes save straight to that diagram.
                    <button onClick={() => setActiveId(diagramId ?? diagramList[0]?.id ?? null)} className="ml-2 text-green-400/70 hover:text-green-200">‹ back</button>
                  </p>
                )}
                {canEditActive
                  ? <SimDataPanel data={activeData} onApplyData={applyActive} onFillMissing={fillActive} onUnfillMissing={unfillActive} onOpenDiagram={setActiveId} calendars={calendars} teams={Object.keys(teamCapacities)} />
                  : <p className="text-xs text-green-400/60">{loadingVariant ? "Loading variant…" : "Open this diagram from its editor to edit simulation data here."}</p>}
              </MatrixPanel>
              <MatrixPanel title="Interchange — BPSim export / import" className="md:col-span-3">
                <BpsimInterchange
                  data={activeData}
                  onApplyData={canEditActive ? applyActive : undefined}
                  calendars={calendars}
                  runCfg={lastRunCfg}
                  diagramName={isOpen ? diagramName : diagramList.find((d) => d.id === activeId)?.name}
                />
              </MatrixPanel>
              <MatrixPanel title="Engine status" className="md:col-span-3">
                <p className="text-xs text-green-400/70 leading-relaxed">
                  Discrete-event core <span className="text-green-300">ONLINE</span> · resumable · M/M/1-verified ·
                  BPSim-aligned. Edit every parameter right here in the{" "}
                  <span className="text-green-300">Simulation Data</span> panel above —{" "}
                  <span className="text-green-300">no need to exit</span> (the per-element{" "}
                  <span className="text-green-300">Properties → ◈ Simulation</span> editor back in the canvas is an
                  alternative). Then Run a scenario, or launch the replay to watch the flow and fork the timeline.
                </p>
              </MatrixPanel>
            </div>
          </main>
        ) : mode === "replay" ? (
          <main className="flex-1 overflow-hidden p-4">
            <ReplayView data={activeData} colorConfig={colorConfig} config={replayCfg} teamCapacities={teamCapacities} teamCalendars={teamCalendars} calendarsById={calendarsById} diagramId={activeId ?? diagramId} diagramsById={diagramsById} onClose={() => setMode("home")} />
          </main>
        ) : mode === "heatmap" ? (
          <main className="flex-1 overflow-hidden p-4">
            <SimulationHeatmap data={activeData} teamCapacities={teamCapacities} teamCalendars={teamCalendars} calendarsById={calendarsById} diagramId={activeId ?? diagramId} diagramsById={diagramsById} onClose={() => setMode("home")} />
          </main>
        ) : (
          <main className="flex-1 overflow-hidden p-4">
            {tableReplay && <TokenTraceTable replay={tableReplay} clockUnit={replayCfg.clockUnit} onClose={() => setMode("home")} />}
          </main>
        )}
      </div>
    </div>
  );
}
