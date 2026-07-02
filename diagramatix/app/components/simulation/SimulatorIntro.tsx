"use client";

/**
 * The dramatic entry: types "Entering the DiagramMATRIX Simulator…", holds it on
 * screen for a 5s dramatic beat, then plays a short Matrix digital-rain burst and
 * hands off to the console. Skippable by click / any key (which cancels the
 * pause). The rain component itself handles reduced-motion.
 */

import { useEffect, useRef, useState } from "react";
import { MatrixRain } from "./matrix/MatrixRain";
import { MatrixTypewriter } from "./matrix/MatrixChrome";

export function SimulatorIntro({ onEnter }: { onEnter: () => void }) {
  const [phase, setPhase] = useState<"typing" | "rain">("typing");
  const done = useRef(false);
  // Dramatic beat: hold the fully-typed message on screen before the rain.
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
    <div
      onClick={enter}
      className="fixed inset-0 z-[60] bg-black overflow-hidden flex items-center justify-center cursor-pointer"
    >
      {phase === "rain" && <MatrixRain durationMs={1800} onDone={enter} />}
      <div className="relative z-10 text-center px-6 pointer-events-none">
        {phase === "typing" ? (
          <MatrixTypewriter
            text="Entering the DiagramMATRIX Simulator…"
            speedMs={45}
            onDone={() => { pauseTimer.current = window.setTimeout(() => setPhase("rain"), 5000); }}
            className="text-lg sm:text-2xl drop-shadow-[0_0_10px_rgba(74,222,128,0.6)]"
          />
        ) : (
          <span className="font-mono text-green-400/80 text-sm tracking-widest">initialising engine</span>
        )}
        <p className="mt-8 text-[10px] text-green-400/40 font-mono">click or press any key to skip</p>
      </div>
    </div>
  );
}
