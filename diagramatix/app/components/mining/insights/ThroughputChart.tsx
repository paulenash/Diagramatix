"use client";

/**
 * Arrivals and completions over the life of the log — and the date filter.
 *
 * `analytics.throughput` has been computed and persisted on every run since
 * import and drawn nowhere. Two things wanted it: "is the backlog growing?" and
 * "show me only last quarter". They are the same picture, so this is one chart
 * doing both jobs: the bars answer the first question and dragging across them
 * answers the second.
 *
 * The bars are always the WHOLE run, deliberately. A chart that redrew itself
 * from its own selection would move the ground under the hand dragging it, and
 * a user could brush a range only to find the range had gone. The current
 * selection is drawn as a window over unchanging bars.
 */

import { useCallback, useRef, useState } from "react";
import type { ThroughputBucket } from "@/app/lib/mining/analytics";

const W = 720, H = 96, PAD_T = 8, PAD_B = 18;

export interface ThroughputChartProps {
  buckets: ThroughputBucket[];
  /** The active range, or nulls for "everything". */
  from: number | null;
  to: number | null;
  onChange: (from: number | null, to: number | null) => void;
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function ThroughputChart({ buckets, from, to, onChange }: ThroughputChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);

  if (buckets.length < 2) {
    return <p className="text-[11px] text-stone-500">Not enough of a time span in this log to chart.</p>;
  }

  const width = buckets[1].t - buckets[0].t;
  const lo = buckets[0].t - width / 2;
  const hi = buckets[buckets.length - 1].t + width / 2;
  const span = Math.max(1, hi - lo);
  const peak = Math.max(1, ...buckets.map((b) => Math.max(b.started, b.completed)));

  const xOf = (t: number) => ((t - lo) / span) * W;
  const tOf = (x: number) => lo + (Math.max(0, Math.min(W, x)) / W) * span;
  const barW = Math.max(1, (W / buckets.length) * 0.42);
  const yOf = (n: number) => PAD_T + (1 - n / peak) * (H - PAD_T - PAD_B);

  /** Pointer x in the chart's own coordinates, whatever the element's size. */
  const localX = useCallback((e: React.PointerEvent) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return 0;
    return ((e.clientX - box.left) / box.width) * W;
  }, []);

  const commit = (a: number, b: number) => {
    // A click rather than a drag clears the range — the cheapest way back to the
    // whole run, and what a user expects from a mis-drag.
    if (Math.abs(a - b) < 4) { onChange(null, null); return; }
    const [x0, x1] = a < b ? [a, b] : [b, a];
    onChange(Math.round(tOf(x0)), Math.round(tOf(x1)));
  };

  const sel = drag
    ? { x: Math.min(drag.a, drag.b), w: Math.abs(drag.a - drag.b) }
    : from != null || to != null
      ? { x: xOf(from ?? lo), w: xOf(to ?? hi) - xOf(from ?? lo) }
      : null;

  return (
    <div className="flex flex-col gap-1">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-24 select-none touch-none cursor-crosshair"
        onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); const x = localX(e); setDrag({ a: x, b: x }); }}
        onPointerMove={(e) => { if (drag) setDrag({ ...drag, b: localX(e) }); }}
        onPointerUp={(e) => { if (drag) { commit(drag.a, localX(e)); setDrag(null); } }}
        onPointerCancel={() => setDrag(null)}
      >
        <rect x={0} y={0} width={W} height={H} fill="#1c1917" />
        {sel && sel.w > 0 && (
          <rect x={sel.x} y={0} width={sel.w} height={H - PAD_B} fill="#f59e0b" fillOpacity={0.14} stroke="#f59e0b" strokeOpacity={0.5} />
        )}
        {buckets.map((b, i) => {
          const x = xOf(b.t);
          return (
            <g key={i}>
              {/* Started on the left, completed on the right, so a gap between
                  the two heights IS the backlog growing or shrinking. */}
              <rect x={x - barW} y={yOf(b.started)} width={barW} height={Math.max(0, H - PAD_B - yOf(b.started))} fill="#f59e0b" fillOpacity={0.85} />
              <rect x={x} y={yOf(b.completed)} width={barW} height={Math.max(0, H - PAD_B - yOf(b.completed))} fill="#34d399" fillOpacity={0.75} />
            </g>
          );
        })}
        <line x1={0} y1={H - PAD_B} x2={W} y2={H - PAD_B} stroke="#57534e" />
        <text x={2} y={H - 5} fontSize={10} fill="#a8a29e">{day(lo)}</text>
        <text x={W - 2} y={H - 5} fontSize={10} fill="#a8a29e" textAnchor="end">{day(hi)}</text>
      </svg>
      <div className="flex items-center gap-3 flex-wrap text-[10px]">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 bg-amber-500" /> <span className="text-stone-400">started</span></span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 bg-emerald-400" /> <span className="text-stone-400">completed</span></span>
        <span className="text-stone-500">Drag across the chart to narrow the date range; click once to clear it.</span>
        {(from != null || to != null) && (
          <button onClick={() => onChange(null, null)} className="text-amber-300 hover:text-amber-200 underline">
            clear {from != null ? day(from) : "start"} → {to != null ? day(to) : "end"}
          </button>
        )}
      </div>
      <p className="text-[10px] text-stone-500">These bars are always the whole run — the window above shows what is selected, so the chart cannot move under a drag.</p>
    </div>
  );
}
