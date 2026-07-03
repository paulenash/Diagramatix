"use client";

/**
 * The DiagramatixMINER entry — same shape as the Simulator's DiagramMATRIX intro
 * but in a mining amber/brown palette: types "Entering DiagramatixMINER…", holds
 * it for a beat, plays a short amber digital-rain burst, then hands off to the
 * console. Skippable by click / any key.
 */

import { useEffect, useRef, useState } from "react";
import { MatrixRain } from "../simulation/matrix/MatrixRain";
import { MatrixTypewriter } from "../simulation/matrix/MatrixChrome";

export function DiagramatixMinerIntro({ onEnter }: { onEnter: () => void }) {
  const [phase, setPhase] = useState<"typing" | "rain">("typing");
  const done = useRef(false);
  const pauseTimer = useRef<number | null>(null);
  const enter = () => {
    if (pauseTimer.current) { window.clearTimeout(pauseTimer.current); pauseTimer.current = null; }
    if (!done.current) { done.current = true; onEnter(); }
  };

  useEffect(() => {
    const skip = () => enter();
    window.addEventListener("keydown", skip);
    return () => {
      window.removeEventListener("keydown", skip);
      if (pauseTimer.current) window.clearTimeout(pauseTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div onClick={enter} className="fixed inset-0 z-[60] bg-[#140d07] overflow-hidden flex items-center justify-center cursor-pointer">
      {phase === "rain" && <MatrixRain durationMs={1800} onDone={enter} color="#B45309" headColor="#FCD34D" />}
      <div className="relative z-10 text-center px-6 pointer-events-none">
        {phase === "typing" ? (
          <MatrixTypewriter
            text="Entering DiagramatixMINER…"
            speedMs={45}
            colorClass="text-amber-300"
            onDone={() => { pauseTimer.current = window.setTimeout(() => setPhase("rain"), 4000); }}
            className="text-lg sm:text-2xl drop-shadow-[0_0_10px_rgba(217,119,6,0.6)]"
          />
        ) : (
          <span className="font-mono text-amber-500/80 text-sm tracking-widest">excavating the process</span>
        )}
        <p className="mt-8 text-[10px] text-amber-500/40 font-mono">click or press any key to skip</p>
      </div>
    </div>
  );
}
