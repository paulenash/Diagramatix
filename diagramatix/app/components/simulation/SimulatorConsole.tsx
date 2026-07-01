"use client";

/**
 * The Matrix-styled Simulator console. Home shows the manager panels; the
 * Run / Replay panel launches the live green-token replay + Operator console
 * on the current diagram. Teams / Studies / Scenarios managers land in later
 * phases.
 */

import { useState } from "react";
import type { DiagramData } from "@/app/lib/diagram/types";
import { MatrixRain } from "./matrix/MatrixRain";
import { MatrixButton, MatrixPanel } from "./matrix/MatrixChrome";
import { ReplayView } from "./replay/ReplayView";
import { SimulationHeatmap } from "./results/SimulationHeatmap";
import { TeamLibraryManager } from "./TeamLibraryManager";
import { StudyManager } from "./StudyManager";
import { SimDataPanel } from "./SimDataPanel";
import { defaultReplayConfig } from "@/app/lib/simulation/replaySource";
import type { ScenarioRunConfig } from "@/app/lib/simulation/types";

export function SimulatorConsole({ data, projectId, isAdmin, diagramName, onClose, onFillTestData, onApplyData }: {
  data: DiagramData; projectId: string | null; isAdmin?: boolean; diagramName?: string; onClose: () => void; onFillTestData?: () => number; onApplyData?: (next: DiagramData) => void;
}) {
  const [mode, setMode] = useState<"home" | "replay" | "heatmap">("home");
  const [teamCapacities, setTeamCapacities] = useState<Record<string, number>>({});
  // Config of the LAST scenario that ran (from Studies & Scenarios), so "Launch
  // replay" animates that run — its full horizon → the real volume of tokens —
  // rather than a short default window. One replication + no warm-up so every
  // token is shown from t=0.
  const [lastRunCfg, setLastRunCfg] = useState<ScenarioRunConfig | null>(null);
  const replayCfg = lastRunCfg ? { ...defaultReplayConfig(lastRunCfg.seed ?? 1), ...lastRunCfg, replications: 1, warmUp: 0 } : defaultReplayConfig();

  return (
    <div className="fixed inset-0 z-[60] bg-black text-green-400 font-mono overflow-hidden">
      <div className="absolute inset-0 opacity-15 pointer-events-none">
        <MatrixRain fontSize={18} />
      </div>
      <div className="relative z-10 flex flex-col h-full">
        <header className="flex items-center justify-between px-5 py-3 border-b border-green-500/40">
          <div className="flex items-center gap-3">
            <span className="text-green-300 tracking-[0.3em] text-sm">◈ DIAGRAMATIX SIMULATOR</span>
            {diagramName && <span className="text-green-400/50 text-xs">/ {diagramName}</span>}
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
                  Watch tokens flow through the process; intervene live. Or see where the heat builds up.
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
              <MatrixPanel title="Simulation Data — see, edit, fill & clear" className="md:col-span-3">
                {onApplyData
                  ? <SimDataPanel data={data} onApplyData={onApplyData} onFillMissing={onFillTestData} />
                  : <p className="text-xs text-green-400/60">Open this diagram from its editor to edit simulation data here.</p>}
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
            <ReplayView data={data} config={replayCfg} teamCapacities={teamCapacities} onClose={() => setMode("home")} />
          </main>
        ) : (
          <main className="flex-1 overflow-hidden p-4">
            <SimulationHeatmap data={data} teamCapacities={teamCapacities} onClose={() => setMode("home")} />
          </main>
        )}
      </div>
    </div>
  );
}
