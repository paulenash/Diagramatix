"use client";

/**
 * The Matrix-styled Simulator console. Home shows the manager panels; the
 * Run / Replay panel launches the live green-token replay + Operator console
 * on the current diagram. Teams / Studies / Scenarios managers land in later
 * phases.
 */

import { useCallback, useEffect, useState } from "react";
import type { DiagramData } from "@/app/lib/diagram/types";
import { MatrixRain } from "./matrix/MatrixRain";
import { MatrixButton, MatrixPanel } from "./matrix/MatrixChrome";
import { ReplayView } from "./replay/ReplayView";
import { SimulationHeatmap } from "./results/SimulationHeatmap";
import { TeamLibraryManager } from "./TeamLibraryManager";
import { StudyManager } from "./StudyManager";
import { SimDataPanel } from "./SimDataPanel";
import { defaultReplayConfig } from "@/app/lib/simulation/replaySource";
import { autofillSimulation } from "@/app/lib/simulation/autofill";
import type { ScenarioRunConfig } from "@/app/lib/simulation/types";

const EMPTY_DIAGRAM: DiagramData = { elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } };

export function SimulatorConsole({ data = EMPTY_DIAGRAM, diagramId, projectId, isAdmin, diagramName, projectName, onClose, onFillTestData, onApplyData }: {
  data?: DiagramData; diagramId?: string; projectId: string | null; isAdmin?: boolean; diagramName?: string; projectName?: string; onClose: () => void; onFillTestData?: () => number; onApplyData?: (next: DiagramData) => void;
}) {
  // Project mode = entered from a Project (no single open diagram): show the
  // project name + a variant selector across all its processes for comparison.
  // Diagram mode = entered from one diagram: single-process, just that name.
  const projectMode = !diagramId;
  const [mode, setMode] = useState<"home" | "replay" | "heatmap">("home");
  const [teamCapacities, setTeamCapacities] = useState<Record<string, number>>({});
  // Config of the LAST scenario that ran (from Studies & Scenarios), so "Launch
  // replay" animates that run — its full horizon → the real volume of tokens —
  // rather than a short default window. One replication + no warm-up so every
  // token is shown from t=0.
  const [lastRunCfg, setLastRunCfg] = useState<ScenarioRunConfig | null>(null);
  const replayCfg = lastRunCfg ? { ...defaultReplayConfig(lastRunCfg.seed ?? 1), ...lastRunCfg, replications: 1, warmUp: 0 } : defaultReplayConfig();

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

  // Project mode has no open diagram — default the panels to the first process
  // once the list loads, so they aren't empty.
  useEffect(() => {
    if (projectMode && !activeId && diagramList.length) setActiveId(diagramList[0].id);
  }, [projectMode, activeId, diagramList]);

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
  const applyActive = useCallback((next: DiagramData) => {
    if (isOpen) { onApplyData?.(next); return; }
    setVariantData(next);
    fetch(`/api/diagrams/${activeId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: next }) }).catch(() => {});
  }, [isOpen, activeId, onApplyData]);
  const fillActive = useCallback(() => {
    const { data: filled, filled: n } = autofillSimulation(activeData);
    applyActive(filled);
    return n;
  }, [activeData, applyActive]);
  const canEditActive = isOpen ? !!onApplyData : !!variantData;

  return (
    <div className="fixed inset-0 z-[60] bg-black text-green-400 font-mono overflow-hidden">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <MatrixRain fontSize={18} />
      </div>
      <div className="relative z-10 flex flex-col h-full">
        <header className="flex items-center justify-between px-5 py-3 border-b border-green-500/40">
          <div className="flex items-center gap-3">
            <span className="text-green-300 tracking-[0.3em] text-sm">◈ DIAGRAMATIX SIMULATOR</span>
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
          <MatrixButton variant="danger" onClick={onClose}>✕ EXIT</MatrixButton>
        </header>

        {mode === "home" ? (
          <main className="flex-1 overflow-auto p-4">
            {/* Centred, compact column of panels — the ambient Matrix rain shows
                in the margins on either side rather than the panels filling the
                whole width. */}
            <div className="max-w-5xl mx-auto grid gap-3 md:grid-cols-3 content-start">
              <MatrixPanel title="Teams" className="md:col-span-2">
                <TeamLibraryManager projectId={projectId} onCapacities={setTeamCapacities} />
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
                </div>
              </MatrixPanel>
              <MatrixPanel title="Studies & Scenarios" className="md:col-span-3">
                <StudyManager projectId={projectId} isAdmin={isAdmin} onRan={setLastRunCfg} />
              </MatrixPanel>
              <MatrixPanel title={`Simulation Data — see, edit, fill & clear${!isOpen ? ` · ${diagramList.find((d) => d.id === activeId)?.name ?? "variant"}` : ""}`} className="md:col-span-3">
                {!isOpen && (
                  <p className="text-[10px] text-green-400/50 mb-1">
                    Editing <span className="text-green-300">{diagramList.find((d) => d.id === activeId)?.name ?? "selected"}</span> — changes save straight to that diagram.
                    <button onClick={() => setActiveId(diagramId ?? diagramList[0]?.id ?? null)} className="ml-2 text-green-400/70 hover:text-green-200">‹ back</button>
                  </p>
                )}
                {canEditActive
                  ? <SimDataPanel data={activeData} onApplyData={applyActive} onFillMissing={fillActive} onOpenDiagram={setActiveId} />
                  : <p className="text-xs text-green-400/60">{loadingVariant ? "Loading variant…" : "Open this diagram from its editor to edit simulation data here."}</p>}
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
            <ReplayView data={activeData} config={replayCfg} teamCapacities={teamCapacities} diagramId={activeId ?? diagramId} diagramsById={diagramsById} onClose={() => setMode("home")} />
          </main>
        ) : (
          <main className="flex-1 overflow-hidden p-4">
            <SimulationHeatmap data={activeData} teamCapacities={teamCapacities} onClose={() => setMode("home")} />
          </main>
        )}
      </div>
    </div>
  );
}
