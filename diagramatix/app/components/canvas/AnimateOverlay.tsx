"use client";

/**
 * Animate! — a Diagram Option that gradually "draws" the diagram: pools, then
 * lanes, then flow elements traversed Breadth- or Depth-first from the start
 * events, with each connector appearing the moment both its endpoints are
 * present. A movable control panel regulates speed and traversal. Read-only and
 * non-destructive (it reveals a subset of the real diagram; the saved data is
 * never touched).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DiagramData } from "@/app/lib/diagram/types";
import { buildAnimationOrder, type AnimateTraversal } from "@/app/lib/diagram/animateOrder";
import { ReplayDiagramBackdrop } from "@/app/components/simulation/replay/ReplayDiagramBackdrop";

export function AnimateOverlay({ data, diagramName, onClose }: { data: DiagramData; diagramName?: string; onClose: () => void }) {
  const [mode, setMode] = useState<AnimateTraversal>("bfs");
  const [speed, setSpeed] = useState(5);           // items revealed per second
  const [playing, setPlaying] = useState(true);
  const [step, setStep] = useState(0);             // number of ids revealed so far

  const order = useMemo(() => buildAnimationOrder(data, mode), [data, mode]);
  const total = order.length;
  const visibleIds = useMemo(() => new Set(order.slice(0, step)), [order, step]);

  // Restart from the beginning whenever the traversal changes.
  useEffect(() => { setStep(0); setPlaying(true); }, [mode]);

  // Reveal tick.
  useEffect(() => {
    if (!playing || step >= total) return;
    const t = window.setTimeout(() => setStep((s) => Math.min(total, s + 1)), 1000 / speed);
    return () => window.clearTimeout(t);
  }, [playing, step, speed, total]);
  const done = step >= total;

  // Fit-to-content viewBox (stable across the whole animation).
  const vb = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of data.elements) {
      minX = Math.min(minX, e.x); minY = Math.min(minY, e.y);
      maxX = Math.max(maxX, e.x + e.width); maxY = Math.max(maxY, e.y + e.height);
    }
    for (const c of data.connectors) for (const w of c.waypoints ?? []) {
      minX = Math.min(minX, w.x); minY = Math.min(minY, w.y); maxX = Math.max(maxX, w.x); maxY = Math.max(maxY, w.y);
    }
    if (!isFinite(minX)) return { x: 0, y: 0, w: 400, h: 300 };
    const pad = 80;
    return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
  }, [data]);

  // ── Movable control panel ──────────────────────────────────────────────────
  const [pos, setPos] = useState({ left: 24, top: 24 });
  const drag = useRef<{ sx: number; sy: number; left: number; top: number } | null>(null);
  const onMove = useCallback((e: PointerEvent) => {
    if (!drag.current) return;
    setPos({ left: Math.max(0, drag.current.left + (e.clientX - drag.current.sx)), top: Math.max(0, drag.current.top + (e.clientY - drag.current.sy)) });
  }, []);
  const onUp = useCallback(() => { drag.current = null; window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); }, [onMove]);
  const startDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = { sx: e.clientX, sy: e.clientY, left: pos.left, top: pos.top };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [pos, onMove, onUp]);
  useEffect(() => () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); }, [onMove, onUp]);

  const restart = () => { setStep(0); setPlaying(true); };

  return (
    <div className="fixed inset-0 z-[70] bg-white flex flex-col">
      {/* Diagram surface */}
      <svg width="100%" height="100%" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" className="flex-1">
        <ReplayDiagramBackdrop data={data} visibleIds={visibleIds} />
      </svg>

      {/* Movable control panel */}
      <div className="absolute w-64 bg-white border border-gray-300 rounded-lg shadow-xl select-none" style={{ left: pos.left, top: pos.top }}>
        <div onPointerDown={startDrag} className="flex items-center justify-between px-3 py-2 border-b border-gray-200 cursor-move bg-gray-50 rounded-t-lg" style={{ touchAction: "none" }}>
          <span className="text-xs font-semibold text-gray-800">▸ Animate{diagramName ? ` — ${diagramName}` : ""}</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm px-1" title="Close">✕</button>
        </div>
        <div className="p-3 space-y-3">
          {/* Transport */}
          <div className="flex items-center gap-2">
            <button onClick={() => (done ? restart() : setPlaying((p) => !p))}
              className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 font-medium">
              {done ? "↻ Replay" : playing ? "⏸ Pause" : "▶ Play"}
            </button>
            <button onClick={restart} className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50" title="Restart">⏮ Restart</button>
            <span className="ml-auto text-[11px] text-gray-500 tabular-nums">{step} / {total}</span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 rounded bg-gray-200 overflow-hidden">
            <div className="h-full bg-blue-500 transition-[width] duration-150" style={{ width: total ? `${(step / total) * 100}%` : "0%" }} />
          </div>

          {/* Speed */}
          <label className="block">
            <span className="text-[11px] text-gray-600">Speed — {speed}/s</span>
            <input type="range" min={1} max={20} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full accent-blue-600" />
          </label>

          {/* Traversal */}
          <div>
            <span className="text-[11px] text-gray-600 block mb-1">Traversal</span>
            <div className="grid grid-cols-2 gap-1">
              {(["bfs", "dfs"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`text-[11px] px-2 py-1 rounded border ${mode === m ? "bg-gray-900 text-white border-gray-900" : "text-gray-700 border-gray-300 hover:bg-gray-50"}`}>
                  {m === "bfs" ? "Breadth-first" : "Depth-first"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
