"use client";

/**
 * Live stats that climb as the animated replay plays: completed / in-flight, and
 * per-team current queue + in-service (utilisation), with the emerging bottleneck
 * ringed. Reads the precomputed snapshot timeline at the current playback clock.
 * One replication (what you're watching) — ▶ Run gives the rigorous multi-rep
 * numbers.
 */
import { useMemo } from "react";
import { statsAt, type StatSnapshot } from "@/app/lib/simulation/runningStats";

export function LiveStatsTable({ timeline, simT, teamCapacities, unit }: {
  timeline: StatSnapshot[]; simT: number; teamCapacities?: Record<string, number>; unit?: string;
}) {
  const s = useMemo(() => statsAt(timeline, simT), [timeline, simT]);
  const rows = useMemo(() => {
    if (!s) return [];
    return Object.entries(s.perTeam)
      .map(([team, live]) => {
        const cap = teamCapacities?.[team] ?? 1;
        return { team, queued: live.queued, busy: live.busy, cap, util: cap > 0 ? live.busy / cap : 0 };
      })
      .sort((a, b) => b.util - a.util || b.queued - a.queued);
  }, [s, teamCapacities]);

  if (!s) return null;
  const top = rows[0];
  return (
    <div className="font-mono text-[10px] text-green-300/90 bg-black/75 border border-green-500/40 rounded p-2 w-52">
      <div className="text-green-400/60 uppercase tracking-widest text-[9px] mb-1">live · t={simT.toFixed(0)}{unit ? ` ${unit}` : ""}</div>
      <div className="flex gap-4 mb-1">
        <span>done <span className="text-green-200 tabular-nums">{s.completed}</span></span>
        <span>in&nbsp;flight <span className="text-green-200 tabular-nums">{s.inFlight}</span></span>
      </div>
      {rows.length > 0 && (
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-green-400/50 border-b border-green-500/20">
              <th className="text-left font-normal">team</th>
              <th className="text-right font-normal">q</th>
              <th className="text-right font-normal">busy</th>
              <th className="text-right font-normal">util</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const hot = r === top && r.util >= 0.85;
              return (
                <tr key={r.team} className={hot ? "text-red-300" : ""}>
                  <td className="text-left truncate max-w-[96px]" title={r.team}>{r === top && (r.util > 0 || r.queued > 0) ? "▸ " : ""}{r.team}</td>
                  <td className="text-right tabular-nums">{r.queued}</td>
                  <td className="text-right tabular-nums">{r.busy}/{r.cap}</td>
                  <td className="text-right tabular-nums">{(r.util * 100).toFixed(0)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
