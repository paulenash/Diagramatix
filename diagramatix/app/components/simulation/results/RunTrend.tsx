"use client";

/**
 * The Run History trend — headline numbers across every run since the one pinned
 * as the baseline, so improvement over months is visible rather than
 * reconstructed from memory.
 *
 * Hand-rolled SVG in the FlowHistogram idiom: no chart library, and the axis is
 * anchored at the baseline so a flat line genuinely means "no change".
 */

import { buildRunTrend, type TrendRun } from "@/app/lib/simulation/runTrend";

const W = 320, H = 90, PAD_L = 4, PAD_R = 4, PAD_T = 8, PAD_B = 14;

/** Signed percentage, coloured by direction — for flow time, LOWER is better. */
function Delta({ pct }: { pct: number }) {
  if (Math.abs(pct) < 0.5) return <span className="text-green-400/50">no change</span>;
  const better = pct < 0;
  return (
    <span className={better ? "text-green-300" : "text-amber-300"}>
      {pct > 0 ? "+" : ""}{pct.toFixed(0)}% {better ? "faster" : "slower"}
    </span>
  );
}

export function RunTrend({ runs }: { runs: TrendRun[] }) {
  const trend = buildRunTrend(runs);

  if (!trend.hasBaseline) {
    return (
      <p className="text-[10px] text-green-400/50 leading-relaxed">
        No baseline pinned. Mark one run ⚑ to measure every later run against it — that is what turns
        the history into a trend.
      </p>
    );
  }
  if (trend.points.length < 2) {
    return (
      <p className="text-[10px] text-green-400/50">
        Baseline pinned. Run this scenario again and the movement since will be charted here.
      </p>
    );
  }

  const pts = trend.points;
  const vals = pts.flatMap((p) => [p.typical, p.nearWorst]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i: number) => PAD_L + (i / (pts.length - 1)) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - (v - lo) / span) * (H - PAD_T - PAD_B);
  const line = (pick: (p: (typeof pts)[number]) => number) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(pick(p)).toFixed(1)}`).join(" ");

  const baseTypicalY = y(pts[0].typical);

  return (
    <div className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Headline metrics since the baseline run">
        {/* the baseline itself, as the reference the eye measures against */}
        <line x1={PAD_L} y1={baseTypicalY} x2={W - PAD_R} y2={baseTypicalY} stroke="currentColor" className="text-green-400/25" strokeWidth={1} strokeDasharray="3 3" />
        <path d={line((p) => p.nearWorst)} fill="none" stroke="currentColor" className="text-amber-400/70" strokeWidth={1.5} />
        <path d={line((p) => p.typical)} fill="none" stroke="currentColor" className="text-green-400" strokeWidth={1.5} />
        {pts.map((p, i) => (
          <g key={p.runId}>
            <circle cx={x(i)} cy={y(p.typical)} r={p.isBaseline ? 3.5 : 2.5} className="fill-green-300" />
            <circle cx={x(i)} cy={y(p.nearWorst)} r={2} className="fill-amber-300" />
            <title>{`${p.label}\ntypical ${p.typical.toFixed(1)} ${trend.clockUnit}\nnear-worst ${p.nearWorst.toFixed(1)} ${trend.clockUnit}`}</title>
          </g>
        ))}
        <text x={PAD_L} y={H - 3} className="fill-green-400/50" fontSize={8}>⚑ {pts[0].label}</text>
        <text x={W - PAD_R} y={H - 3} textAnchor="end" className="fill-green-400/50" fontSize={8}>{pts[pts.length - 1].label}</text>
      </svg>

      <div className="flex items-center gap-3 text-[10px] flex-wrap">
        <span className="text-green-400/60">
          <span className="inline-block w-2 h-px bg-green-400 align-middle mr-1" />typical
        </span>
        <span className="text-green-400/60">
          <span className="inline-block w-2 h-px bg-amber-400/70 align-middle mr-1" />near-worst
        </span>
        {trend.net && (
          <span className="text-green-400/70">
            over {trend.net.runs} run{trend.net.runs === 1 ? "" : "s"} since the baseline:{" "}
            <Delta pct={trend.net.typicalPct} /> typical, <Delta pct={trend.net.nearWorstPct} /> near-worst
          </span>
        )}
      </div>
    </div>
  );
}
