"use client";

/**
 * Side-by-side comparison of the latest run of each scenario in a study, with
 * deltas against the baseline scenario. Matrix-styled. Fetches each scenario's
 * newest run with metrics on mount.
 */

import { useCallback, useEffect, useState } from "react";
import { type RunMetrics, type RunRow, fmtDelta } from "@/app/lib/simulation/results";

interface ScenarioLite { id: string; name: string; isBaseline: boolean }

export function ScenarioCompare({ scenarios, runUrlFor }: { scenarios: ScenarioLite[]; runUrlFor: (scenarioId: string) => string }) {
  const [byId, setById] = useState<Record<string, RunMetrics | null>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const entries = await Promise.all(scenarios.map(async (s) => {
        try {
          const res = await fetch(runUrlFor(s.id));
          if (!res.ok) return [s.id, null] as const;
          const json = await res.json();
          const latest: RunRow | undefined = (json.runs ?? []).find((r: RunRow) => r.metrics);
          return [s.id, latest?.metrics ?? null] as const;
        } catch { return [s.id, null] as const; }
      }));
      setById(Object.fromEntries(entries));
    } finally { setLoading(false); }
  }, [scenarios, runUrlFor]);

  useEffect(() => { load(); }, [load]);

  const baseline = scenarios.find((s) => s.isBaseline);
  const baseM = baseline ? byId[baseline.id] : null;

  const topUtil = (m: RunMetrics | null): number | undefined => {
    if (!m) return undefined;
    const top = m.bottlenecks[0];
    return top ? m.stats.perTeam[top]?.utilization.mean : undefined;
  };

  const rows: { label: string; get: (m: RunMetrics | null) => number | undefined; digits: number; pct?: boolean }[] = [
    { label: "Completed", get: (m) => m?.stats.completed.mean, digits: 0 },
    { label: "Flow p50", get: (m) => m?.stats.flowTime.p50, digits: 1 },
    { label: "Flow p95", get: (m) => m?.stats.flowTime.p95, digits: 1 },
    { label: "Top util", get: topUtil, digits: 2, pct: true },
  ];

  const ran = scenarios.filter((s) => byId[s.id]);
  if (loading && ran.length === 0) return <p className="text-green-400/50 text-[10px]">Loading runs…</p>;
  if (ran.length === 0) return <p className="text-green-400/50 text-[10px]">No runs yet — run a scenario or two, then compare.</p>;

  return (
    <table className="w-full border-collapse text-[10px] text-green-300/90">
      <thead>
        <tr className="border-b border-green-500/30">
          <th className="py-0.5 text-left font-normal text-green-400/60">metric</th>
          {scenarios.map((s) => (
            <th key={s.id} className="py-0.5 text-right font-normal text-green-400/70">
              {s.name}{s.isBaseline ? " ◆" : ""}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const baseVal = row.get(baseM);
          return (
            <tr key={row.label} className="border-b border-green-500/10">
              <td className="py-0.5 text-left text-green-400/60">{row.label}</td>
              {scenarios.map((s) => {
                const m = byId[s.id] ?? null;
                const v = row.get(m);
                if (v === undefined) return <td key={s.id} className="py-0.5 text-right text-green-400/30">—</td>;
                const shown = row.pct ? `${(v * 100).toFixed(0)}%` : v.toFixed(row.digits);
                const delta = s.isBaseline ? "" : fmtDelta(row.pct ? v * 100 : v, baseVal === undefined ? undefined : (row.pct ? baseVal * 100 : baseVal), row.pct ? 0 : row.digits);
                return (
                  <td key={s.id} className="py-0.5 text-right tabular-nums">
                    <span className="text-green-200">{shown}</span>
                    {delta && <span className="text-green-400/45">{" "}{delta}{row.pct ? "pp" : ""}</span>}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr><td colSpan={scenarios.length + 1} className="pt-1 text-green-400/40">◆ baseline · deltas are vs baseline.</td></tr>
      </tfoot>
    </table>
  );
}
