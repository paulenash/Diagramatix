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
import { TeamLibraryManager } from "./TeamLibraryManager";
import { defaultReplayConfig } from "@/app/lib/simulation/replaySource";

export function SimulatorConsole({ data, projectId, diagramName, onClose, onFillTestData }: {
  data: DiagramData; projectId: string | null; diagramName?: string; onClose: () => void; onFillTestData?: () => number;
}) {
  const [mode, setMode] = useState<"home" | "replay">("home");
  const [fillMsg, setFillMsg] = useState<string | null>(null);
  const [teamCapacities, setTeamCapacities] = useState<Record<string, number>>({});

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
            {mode === "replay" && <button onClick={() => setMode("home")} className="text-green-400/60 text-xs hover:text-green-300">‹ back</button>}
          </div>
          <MatrixButton variant="danger" onClick={onClose}>✕ EXIT</MatrixButton>
        </header>

        {mode === "home" ? (
          <main className="flex-1 overflow-auto p-6 grid gap-4 md:grid-cols-3 content-start">
            <MatrixPanel title="Teams" className="md:col-span-2">
              <TeamLibraryManager projectId={projectId} onCapacities={setTeamCapacities} />
            </MatrixPanel>
            <MatrixPanel title="Studies & Scenarios">
              <p className="text-xs text-green-400/60">Portfolios + what-if scenarios — coming online.</p>
            </MatrixPanel>
            <MatrixPanel title="Run / Replay">
              <p className="text-xs text-green-400/60 mb-3">Watch tokens flow through the process; intervene live.</p>
              <MatrixButton onClick={() => setMode("replay")}>▶ Launch replay</MatrixButton>
            </MatrixPanel>
            {onFillTestData && (
              <MatrixPanel title="Test data" className="md:col-span-3">
                <p className="text-xs text-green-400/60 mb-3">
                  Populate any MISSING simulation values (arrival rates, cycle times, lane teams,
                  decision branch %) so a partially-modelled process can be run. Existing values are kept.
                </p>
                <div className="flex items-center gap-3">
                  <MatrixButton onClick={() => { const n = onFillTestData(); setFillMsg(`Filled ${n} attribute(s).`); }}>
                    ⚙ Fill missing simulation data
                  </MatrixButton>
                  {fillMsg && <span className="text-green-300 text-xs">{fillMsg}</span>}
                </div>
              </MatrixPanel>
            )}
            <MatrixPanel title="Engine status" className="md:col-span-3">
              <p className="text-xs text-green-400/70 leading-relaxed">
                Discrete-event core <span className="text-green-300">ONLINE</span> · resumable · M/M/1-verified ·
                BPSim-aligned. Annotate elements via <span className="text-green-300">Properties → ◈ Simulation</span>,
                then launch the replay to watch the flow and fork the timeline.
              </p>
            </MatrixPanel>
          </main>
        ) : (
          <main className="flex-1 overflow-hidden p-4">
            <ReplayView data={data} config={defaultReplayConfig()} teamCapacities={teamCapacities} onClose={() => setMode("home")} />
          </main>
        )}
      </div>
    </div>
  );
}
