"use client";

/**
 * Matrix-styled results report for one simulation run. Reads the persisted
 * metrics (aggregated mean/p5/p50/p95) and renders team utilisation +
 * bottleneck ranking, the flow-time summary, and the busiest nodes. Fetches
 * the latest run from the scenario's run-history endpoint on demand.
 */

import { useCallback, useEffect, useState } from "react";
import { type RunMetrics, type RunRow, fmtRange, fmtPct } from "@/app/lib/simulation/results";

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
        <Metric label={`Flow time (${unit})`} value={`p50 ${stats.flowTime.p50.toFixed(1)} · p95 ${stats.flowTime.p95.toFixed(1)}`} />
      </div>

      {/* Teams / resource pools */}
      <div>
        <Heading>Teams — utilisation &amp; queue</Heading>
        {teamOrder.length === 0 && <p className="text-green-400/40">No resource pools in this portfolio.</p>}
        {teamOrder.length > 0 && (
          <table className="w-full border-collapse">
            <thead>
              <Tr head><Th>team</Th><Th right>util</Th><Th right>avg queue</Th><Th right>max queue</Th></Tr>
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
                  </Tr>
                );
              })}
            </tbody>
          </table>
        )}
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
