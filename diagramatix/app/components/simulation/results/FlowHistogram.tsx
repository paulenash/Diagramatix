"use client";

/**
 * SVG histogram of a case-level flow-time distribution (CaseDist). Shared by the
 * single-run ResultsReport (full, with axis + p50/p95 markers) and the
 * ScenarioCompare table (compact sparkline per column). Matrix-green styling.
 */

import type { CaseDist } from "@/app/lib/simulation/statistics";

export function FlowHistogram({ dist, unit, width = 300, height = 44, compact = false }: {
  dist: CaseDist; unit?: string; width?: number; height?: number; compact?: boolean;
}) {
  const { histogram: h, min, max, p50, p95 } = dist;
  if (!h.counts.length || dist.count === 0) return null;
  const n = h.counts.length, bw = width / n;
  const maxC = Math.max(1, ...h.counts);
  const xOf = (v: number) => (max > min ? ((v - min) / (max - min)) * width : 0);
  const labelH = compact ? 0 : 12;
  return (
    <svg viewBox={`0 0 ${width} ${height + labelH}`} className={compact ? "w-full max-w-[120px]" : "mt-1 w-full max-w-[320px]"} role="img" aria-label={`Flow-time distribution${unit ? ` (${unit})` : ""}`}>
      {h.counts.map((c, i) => {
        const bh = (c / maxC) * height;
        return <rect key={i} x={i * bw + 0.4} y={height - bh} width={Math.max(0.4, bw - 0.8)} height={bh} className="fill-green-400/55" />;
      })}
      <line x1={xOf(p50)} y1={0} x2={xOf(p50)} y2={height} className="stroke-green-300/80" strokeWidth={1} strokeDasharray="2 2" />
      <line x1={xOf(p95)} y1={0} x2={xOf(p95)} y2={height} className="stroke-amber-400/80" strokeWidth={1} strokeDasharray="2 2" />
      {!compact && (
        <>
          <text x={0} y={height + 10} className="fill-green-400/50" fontSize={8}>{min.toFixed(0)}</text>
          <text x={width} y={height + 10} textAnchor="end" className="fill-green-400/50" fontSize={8}>{max.toFixed(0)}</text>
          <text x={Math.min(width - 20, Math.max(10, xOf(p50)))} y={height + 10} textAnchor="middle" className="fill-green-300/70" fontSize={8}>✦{p50.toFixed(0)}</text>
          <text x={Math.min(width - 8, Math.max(24, xOf(p95)))} y={height + 10} textAnchor="middle" className="fill-amber-400/70" fontSize={8}>▸{p95.toFixed(0)}</text>
        </>
      )}
    </svg>
  );
}
