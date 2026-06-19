"use client";

/**
 * The Matrix-styled Simulator console shell. Phase 1 scaffold — the engine
 * core is online; the Teams / Studies / Scenarios / Run managers land in the
 * later phases. Faint ambient rain behind green-phosphor panels.
 */

import { MatrixRain } from "./matrix/MatrixRain";
import { MatrixButton, MatrixPanel } from "./matrix/MatrixChrome";

export function SimulatorConsole({ diagramName, onClose }: { diagramName?: string; onClose: () => void }) {
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
          </div>
          <MatrixButton variant="danger" onClick={onClose}>✕ EXIT</MatrixButton>
        </header>

        <main className="flex-1 overflow-auto p-6 grid gap-4 md:grid-cols-3 content-start">
          <MatrixPanel title="Teams">
            <p className="text-xs text-green-400/60">Shared capacity pools — coming online.</p>
          </MatrixPanel>
          <MatrixPanel title="Studies & Scenarios">
            <p className="text-xs text-green-400/60">Portfolios + what-if scenarios — coming online.</p>
          </MatrixPanel>
          <MatrixPanel title="Run / Replay">
            <p className="text-xs text-green-400/60">Live token replay + Operator console — coming online.</p>
          </MatrixPanel>
          <MatrixPanel title="Engine status" className="md:col-span-3">
            <p className="text-xs text-green-400/70 leading-relaxed">
              Discrete-event core <span className="text-green-300">ONLINE</span> · resumable · M/M/1-verified ·
              BPSim-aligned. Annotate elements via <span className="text-green-300">Properties → ◈ Simulation</span>,
              then runs + heat-maps will surface here.
            </p>
          </MatrixPanel>
        </main>
      </div>
    </div>
  );
}
