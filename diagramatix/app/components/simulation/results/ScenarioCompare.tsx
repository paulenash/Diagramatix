"use client";

/**
 * Side-by-side comparison of the latest run of each scenario in a study, with
 * deltas against the baseline scenario. Matrix-styled. Fetches each scenario's
 * newest run with metrics on mount.
 */

import { useCallback, useEffect, useState } from "react";
import { type RunMetrics, type RunRow, fmtDelta, fmtMoney } from "@/app/lib/simulation/results";
import { FlowHistogram } from "./FlowHistogram";

interface ScenarioLite { id: string; name: string; isBaseline: boolean }

/** One-line As-is→To-be verdict: speed, throughput, cost/case, FTE freed. */
function verdict(base: RunMetrics, tobe: RunMetrics, name: string): string {
  const parts: string[] = [];
  const bFlow = base.stats.flowTime.mean, tFlow = tobe.stats.flowTime.mean;
  if (bFlow > 0) {
    const d = ((bFlow - tFlow) / bFlow) * 100;
    parts.push(`${Math.abs(d).toFixed(0)}% ${d >= 0 ? "faster" : "slower"}`);
  }
  const bThru = base.stats.completed.mean, tThru = tobe.stats.completed.mean;
  if (bThru > 0) {
    const d = ((tThru - bThru) / bThru) * 100;
    if (Math.abs(d) >= 1) parts.push(`${d >= 0 ? "+" : ""}${d.toFixed(0)}% throughput`);
  }
  const bCpc = base.stats.costPerCase?.mean ?? 0, tCpc = tobe.stats.costPerCase?.mean ?? 0;
  if (bCpc > 0 || tCpc > 0) {
    const save = bCpc - tCpc;
    parts.push(`${fmtMoney(Math.abs(save))} ${save >= 0 ? "less" : "more"} per case`);
  }
  // FTE freed on the as-is bottleneck team.
  const top = base.bottlenecks[0];
  const cap = top ? base.teamCapacities?.[top] : undefined;
  if (top && cap) {
    const fte = ((base.stats.perTeam[top]?.utilization.mean ?? 0) - (tobe.stats.perTeam[top]?.utilization.mean ?? 0)) * cap;
    if (Math.abs(fte) >= 0.1) parts.push(`frees ≈${fte.toFixed(1)} FTE of ${top}`);
  }
  return `${name}: ${parts.join(", ")}.`;
}

export function ScenarioCompare({ scenarios, runUrlFor, assessUrl }: { scenarios: ScenarioLite[]; runUrlFor: (scenarioId: string) => string; assessUrl?: string }) {
  const [byId, setById] = useState<Record<string, RunMetrics | null>>({});
  const [loading, setLoading] = useState(false);
  const [assessment, setAssessment] = useState<string | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [assessErr, setAssessErr] = useState<string | null>(null);

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
  const firstCompare = scenarios.find((s) => !s.isBaseline && byId[s.id]);

  // Reset a stale assessment when the underlying runs change.
  useEffect(() => { setAssessment(null); setAssessErr(null); }, [byId]);

  async function runAssessment() {
    if (!assessUrl || !baseline || !firstCompare) return;
    setAssessing(true); setAssessErr(null);
    try {
      const res = await fetch(assessUrl, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baselineScenarioId: baseline.id, compareScenarioId: firstCompare.id }),
      });
      const json = await res.json();
      if (!res.ok) { setAssessErr(json.error || "Assessment failed"); return; }
      setAssessment(json.assessment);
    } catch { setAssessErr("Assessment failed — check the connection and try again."); }
    finally { setAssessing(false); }
  }

  const topUtil = (m: RunMetrics | null): number | undefined => {
    if (!m) return undefined;
    const top = m.bottlenecks[0];
    return top ? m.stats.perTeam[top]?.utilization.mean : undefined;
  };

  const rows: { label: string; get: (m: RunMetrics | null) => number | undefined; digits: number; pct?: boolean; money?: boolean }[] = [
    { label: "Completed", get: (m) => m?.stats.completed.mean, digits: 0 },
    // True per-case percentiles (fall back to the run-average for legacy runs).
    { label: "Typical (p50)", get: (m) => m?.stats.caseFlow?.p50 ?? m?.stats.flowTime.p50, digits: 0 },
    { label: "Near worst (p95)", get: (m) => m?.stats.caseFlow?.p95 ?? m?.stats.flowTime.p95, digits: 0 },
    { label: "Spread (sd)", get: (m) => m?.stats.caseFlow?.sd, digits: 0 },
    { label: "Top util", get: topUtil, digits: 2, pct: true },
    { label: "Cost / case", get: (m) => m?.stats.costPerCase?.mean, digits: 0, money: true },
    { label: "Total cost", get: (m) => m?.stats.totalCost?.mean, digits: 0, money: true },
  ];

  const ran = scenarios.filter((s) => byId[s.id]);
  if (loading && ran.length === 0) return <p className="text-green-400/50 text-[10px]">Loading runs…</p>;
  if (ran.length === 0) return <p className="text-green-400/50 text-[10px]">No runs yet — run a scenario or two, then compare.</p>;

  // Verdict lines: each non-baseline (To-be) scenario vs the baseline (As-is).
  const verdicts = baseM
    ? scenarios.filter((s) => !s.isBaseline && byId[s.id]).map((s) => verdict(baseM, byId[s.id]!, s.name))
    : [];

  return (
    <>
    {verdicts.length > 0 && (
      <div className="mb-2 border border-green-500/40 rounded bg-green-400/5 px-2 py-1.5">
        <div className="text-green-400/60 uppercase tracking-widest text-[9px] mb-0.5">As-is → To-be verdict</div>
        {verdicts.map((v, i) => <div key={i} className="text-green-200 text-[11px]">{v}</div>)}
      </div>
    )}

    {/* Grounded AI assessment — computed deltas, written up in plain English. */}
    {assessUrl && baseline && firstCompare && (
      <div className="mb-2">
        {!assessment && (
          <button
            onClick={runAssessment}
            disabled={assessing}
            className="text-[10px] px-2 py-1 rounded border border-green-500/40 text-green-200 hover:bg-green-400/10 disabled:opacity-50"
          >
            {assessing ? "Assessing…" : "✨ Explain these results"}
          </button>
        )}
        {assessErr && <p className="text-amber-400/80 text-[10px] mt-1">{assessErr}</p>}
        {assessment && (
          <div className="border border-green-500/40 rounded bg-green-400/5 px-2 py-1.5">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-green-400/60 uppercase tracking-widest text-[9px]">AI assessment</span>
              <button onClick={runAssessment} disabled={assessing} className="text-green-400/50 hover:text-green-200 text-[9px] disabled:opacity-50">
                {assessing ? "…" : "↻ regenerate"}
              </button>
            </div>
            <p className="text-green-200/90 text-[11px] leading-relaxed whitespace-pre-line">{assessment}</p>
            <p className="text-green-400/40 text-[9px] mt-1">Generated from the computed figures above — the numbers are not AI-invented.</p>
          </div>
        )}
      </div>
    )}
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
                const shown = row.money ? fmtMoney(v) : row.pct ? `${(v * 100).toFixed(0)}%` : v.toFixed(row.digits);
                let delta = "";
                if (!s.isBaseline && baseVal !== undefined) {
                  if (row.money) { const d = v - baseVal; delta = `${d >= 0 ? "+" : "−"}${fmtMoney(Math.abs(d))}`; }
                  else delta = fmtDelta(row.pct ? v * 100 : v, row.pct ? baseVal * 100 : baseVal, row.pct ? 0 : row.digits);
                }
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
        {/* Per-case flow-time distribution shape, side by side. */}
        <tr className="border-b border-green-500/10">
          <td className="py-1 text-left text-green-400/60 align-middle">flow shape</td>
          {scenarios.map((s) => {
            const cf = byId[s.id]?.stats.caseFlow;
            return (
              <td key={s.id} className="py-1 text-right align-middle">
                {cf && cf.count > 0
                  ? <div className="inline-block w-[120px]"><FlowHistogram dist={cf} compact width={120} height={28} /></div>
                  : <span className="text-green-400/30">—</span>}
              </td>
            );
          })}
        </tr>
      </tbody>
      <tfoot>
        <tr><td colSpan={scenarios.length + 1} className="pt-1 text-green-400/40">◆ baseline · deltas are vs baseline · ✦ p50 ▸ p95 on the flow-shape bars.</td></tr>
      </tfoot>
    </table>
    </>
  );
}
