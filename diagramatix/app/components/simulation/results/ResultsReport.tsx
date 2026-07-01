"use client";

/**
 * Matrix-styled results report for one simulation run. Reads the persisted
 * metrics (aggregated mean/p5/p50/p95) and renders team utilisation +
 * bottleneck ranking, the flow-time summary, and the busiest nodes. Fetches
 * the latest run from the scenario's run-history endpoint on demand.
 */

import { useCallback, useEffect, useState } from "react";
import { type RunMetrics, type RunRow, fmtRange, fmtPct, fmtMoney } from "@/app/lib/simulation/results";
import type { CaseDist, Stat } from "@/app/lib/simulation/statistics";
import { FlowHistogram } from "./FlowHistogram";

/** Monte-Carlo confidence half-width on a run-averaged mean (p5–p95 across runs,
 *  halved) — how much the ESTIMATE wobbles run-to-run, distinct from case spread. */
function runHalfWidth(s: Stat): number {
  return Math.max(0, (s.p95 - s.p5) / 2);
}

export function ResultsReport({ runUrl, initial }: { runUrl: string; initial?: RunMetrics | null }) {
  const [metrics, setMetrics] = useState<RunMetrics | null>(initial ?? null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(runUrl);
      if (!res.ok) return;
      const json = await res.json();
      const latest: RunRow | undefined = (json.runs ?? []).find((r: RunRow) => r.metrics);
      if (latest?.metrics) setMetrics(latest.metrics);
    } finally { setLoading(false); }
  }, [runUrl]);

  useEffect(() => { if (!initial) load(); }, [initial, load]);

  if (loading && !metrics) return <p className="text-green-400/50 text-[10px]">Loading results…</p>;
  if (!metrics) return <p className="text-green-400/50 text-[10px]">No run yet — hit ▶ Run.</p>;

  const { stats, bottlenecks, nodeLabels } = metrics;
  const unit = metrics.clockUnit ?? "";

  // Busiest nodes: tasks with the highest mean wait, top 8.
  const nodes = Object.entries(stats.perNode)
    .filter(([id]) => (nodeLabels[id]?.kind ?? "") === "task")
    .sort((a, b) => b[1].wait.mean - a[1].wait.mean)
    .slice(0, 8);

  // Teams ordered by the bottleneck ranking.
  const teamOrder = bottlenecks.length ? bottlenecks : Object.keys(stats.perTeam);

  return (
    <div className="flex flex-col gap-3 text-[10px] text-green-300/90">
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Metric label="Replications" value={String(stats.replications)} />
        <Metric label="Completed" value={fmtRange(stats.completed, 0)} />
        {(stats.totalCost?.mean ?? 0) > 0 && (
          <>
            <Metric label="Cost / case" value={fmtMoney(stats.costPerCase?.mean)} />
            <Metric label="Total cost" value={fmtMoney(stats.totalCost?.mean)} />
          </>
        )}
      </div>

      {/* Flow time — the per-case distribution (how long individual cases take),
          not the run-average. p50 = typical case, p95 = near-worst; sd = spread;
          plus the run-to-run confidence on the mean. */}
      <FlowTimeSection caseFlow={stats.caseFlow} runFlow={stats.flowTime} runs={stats.replications} unit={unit} />

      {/* Teams / resource pools */}
      <div>
        <Heading>Teams — utilisation &amp; queue</Heading>
        {teamOrder.length === 0 && <p className="text-green-400/40">No resource pools in this portfolio.</p>}
        {teamOrder.length > 0 && (() => {
          const hasCost = (stats.totalCost?.mean ?? 0) > 0;
          return (
          <table className="w-full border-collapse">
            <thead>
              <Tr head><Th>team</Th><Th right>util</Th><Th right>avg queue</Th><Th right>max queue</Th>{hasCost && <Th right>cost</Th>}</Tr>
            </thead>
            <tbody>
              {teamOrder.map((id, i) => {
                const t = stats.perTeam[id];
                if (!t) return null;
                return (
                  <Tr key={id} hot={i === 0 && t.utilization.mean > 0.85}>
                    <Td>{i === 0 ? "▸ " : ""}{id}</Td>
                    <Td right>{fmtPct(t.utilization.mean)}</Td>
                    <Td right>{t.avgQueue.mean.toFixed(2)}</Td>
                    <Td right>{t.maxQueue.mean.toFixed(0)}</Td>
                    {hasCost && <Td right>{fmtMoney(t.cost?.mean)}</Td>}
                  </Tr>
                );
              })}
            </tbody>
          </table>
          );
        })()}
        {teamOrder.length > 0 && (
          <p className="text-green-400/40 mt-1">▸ top bottleneck. Utilisation near 100% = the pool is the constraint.</p>
        )}
      </div>

      {/* Busiest nodes */}
      {nodes.length > 0 && (
        <div>
          <Heading>Busiest tasks — wait before service</Heading>
          <table className="w-full border-collapse">
            <thead>
              <Tr head><Th>task</Th><Th right>throughput</Th><Th right>avg wait ({unit})</Th></Tr>
            </thead>
            <tbody>
              {nodes.map(([id, n]) => (
                <Tr key={id}>
                  <Td>{nodeLabels[id]?.label ?? id.split("::").pop()}</Td>
                  <Td right>{n.count.mean.toFixed(0)}</Td>
                  <Td right>{n.wait.mean.toFixed(1)}</Td>
                </Tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span className="text-green-400/50">{label}: </span><span className="text-green-200">{value}</span></div>;
}

/** Flow-time block: per-case percentiles + spread + a distribution histogram,
 *  with the run-to-run confidence on the mean. Falls back to the run-averaged
 *  p50/p95 for runs recorded before per-case samples were collected. */
function FlowTimeSection({ caseFlow, runFlow, runs, unit }: {
  caseFlow?: CaseDist; runFlow: Stat; runs: number; unit: string;
}) {
  const hw = runHalfWidth(runFlow);
  const conf = `${runFlow.mean.toFixed(0)} ±${hw.toFixed(0)} over ${runs} runs`;
  if (!caseFlow || caseFlow.count === 0) {
    // Legacy run (no per-case samples) — show the run-average summary only.
    return (
      <div>
        <Heading>Flow time ({unit})</Heading>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <Metric label="Mean (per run)" value={conf} />
          <Metric label="p50 · p95 (per run)" value={`${runFlow.p50.toFixed(0)} · ${runFlow.p95.toFixed(0)}`} />
        </div>
      </div>
    );
  }
  const cf = caseFlow;
  return (
    <div>
      <Heading>Flow time per case ({unit})</Heading>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Metric label="Typical (p50)" value={cf.p50.toFixed(0)} />
        <Metric label="Near worst (p95)" value={cf.p95.toFixed(0)} />
        <Metric label="Spread (sd)" value={`±${cf.sd.toFixed(0)}`} />
        <Metric label="Range" value={`${cf.min.toFixed(0)}–${cf.max.toFixed(0)}`} />
        <Metric label="Mean" value={conf} />
      </div>
      <FlowHistogram dist={cf} unit={unit} />
      <p className="text-green-400/40 mt-0.5">Each bar = share of the {cf.count.toLocaleString()} cases finishing in that time band. ✦ p50 · ▸ p95.</p>
    </div>
  );
}
function Heading({ children }: { children: React.ReactNode }) {
  return <p className="text-green-400/70 uppercase tracking-widest text-[10px] mb-1">{children}</p>;
}
function Tr({ children, head, hot }: { children: React.ReactNode; head?: boolean; hot?: boolean }) {
  return <tr className={`${head ? "border-b border-green-500/30" : "border-b border-green-500/10"} ${hot ? "bg-green-400/10" : ""}`}>{children}</tr>;
}
function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`py-0.5 font-normal text-green-400/60 ${right ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={`py-0.5 ${right ? "text-right tabular-nums" : "text-left"}`}>{children}</td>;
}
