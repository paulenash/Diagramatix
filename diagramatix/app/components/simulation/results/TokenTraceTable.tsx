"use client";

/**
 * Token Trace Table — the full run as a matrix: one row per token, one column
 * per visited element (Type / Name), each cell the TIME SPENT there (toggle to
 * wait / service), a Total-time column, an Outcome column, plus summary stats,
 * filters, a bottleneck-heatmap tint and CSV export. Read-only; built from the
 * replay trace the console already has.
 */

import { useMemo, useState } from "react";
import type { ReplayData } from "@/app/lib/simulation/replaySource";
import type { ClockUnit } from "@/app/lib/simulation/types";
import { buildTokenTable, type TokenCell } from "@/app/lib/simulation/tokenTable";
import { MatrixButton } from "../matrix/MatrixChrome";

type Metric = "time" | "wait" | "service";
const KIND_ABBR: Record<string, string> = {
  source: "start", sink: "end", task: "task", subprocess: "sub", delay: "event", gateway: "gw",
};

export function TokenTraceTable({ replay, clockUnit = "minute", onClose }: {
  replay: ReplayData; clockUnit?: ClockUnit; onClose?: () => void;
}) {
  const table = useMemo(() => buildTokenTable(replay.trace, replay.nodeMeta, replay.flowOrder), [replay]);
  const [metric, setMetric] = useState<Metric>("time");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("");
  const [interruptedOnly, setInterruptedOnly] = useState(false);
  const [minFlow, setMinFlow] = useState<number | "">("");

  const unit = clockUnit === "minute" ? "min" : clockUnit === "hour" ? "hr" : clockUnit === "day" ? "d" : clockUnit;
  const fmt = (n: number) => (n === 0 ? "" : n < 10 ? n.toFixed(1) : Math.round(n).toString());

  const rows = useMemo(() => table.rows.filter((r) =>
    (!outcomeFilter || r.outcome === outcomeFilter) &&
    (!interruptedOnly || r.hitBoundary) &&
    (minFlow === "" || r.total >= minFlow),
  ), [table.rows, outcomeFilter, interruptedOnly, minFlow]);

  const cellVal = (c: TokenCell | undefined): number => (!c ? 0 : metric === "time" ? c.time : metric === "wait" ? c.wait : c.service);
  const maxVal = metric === "time" ? table.maxCellTime : Math.max(1, ...table.rows.flatMap((r) => Object.values(r.cells).map((c) => cellVal(c))));
  const tint = (v: number) => (v <= 0 ? "transparent" : `rgba(74,222,128,${Math.min(0.55, 0.08 + (v / maxVal) * 0.5)})`); // green heatmap
  const bottleneck = [...table.stats.perElement].sort((a, b) => b.avgWait - a.avgWait)[0];

  function exportCsv() {
    const head = ["Token#", ...table.cols.map((c) => c.label.replace(/\s+/g, " ")), "Total", "Outcome"];
    const lines = [head.join(",")];
    for (const r of rows) {
      const cells = table.cols.map((c) => { const v = cellVal(r.cells[c.id]); return v ? v.toFixed(2) : ""; });
      lines.push([r.num, ...cells, r.total.toFixed(2), `"${r.outcome}"`].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `token-trace-${metric}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  }

  const s = table.stats;
  return (
    <div className="flex flex-col h-full gap-2 text-[11px] text-green-200 font-mono">
      {/* Summary stats */}
      <div className="flex flex-wrap items-stretch gap-2">
        <Stat label="Cases in" value={s.cases} />
        <Stat label="Completed" value={s.completed} accent="text-green-300" />
        <Stat label="In progress" value={s.inProgress} accent={s.inProgress ? "text-cyan-300" : undefined} />
        <Stat label="Interrupted" value={s.interrupted} accent={s.interrupted ? "text-amber-300" : undefined} />
        {s.internal > 0 && (
          <div className="px-2 py-1 border border-green-500/20 rounded bg-green-500/[0.02] flex flex-col justify-center min-w-[64px]"
            title="Tokens the engine created to run a sub-process body or a boundary handler. They are real tokens but not arrivals, which is why the row count exceeds the cases that entered.">
            <div className="text-[9px] text-green-500/50 uppercase tracking-wider">+ internal</div>
            <div className="text-sm text-green-400/60">{s.internal}</div>
          </div>
        )}
        {s.flow && <>
          <Stat label={`Flow avg (${unit})`} value={s.flow.avg.toFixed(1)} />
          <Stat label="median" value={s.flow.median.toFixed(1)} />
          <Stat label="P90" value={s.flow.p90.toFixed(1)} />
          <Stat label="max" value={s.flow.max.toFixed(1)} />
        </>}
        {bottleneck && bottleneck.avgWait > 0 && (
          <div className="px-2 py-1 border border-amber-500/40 rounded bg-amber-500/5 flex flex-col justify-center">
            <div className="text-[9px] text-amber-400/70 uppercase tracking-wider">Bottleneck (avg wait)</div>
            <div className="text-amber-200">{bottleneck.label} · {bottleneck.avgWait.toFixed(1)} {unit}</div>
          </div>
        )}
      </div>
      {/* Outcome breakdown */}
      <div className="flex flex-wrap gap-1.5">
        {s.outcomes.map((o) => (
          <button key={o.label} onClick={() => setOutcomeFilter((f) => (f === o.label ? "" : o.label))}
            className={`px-2 py-0.5 rounded border text-[10px] ${outcomeFilter === o.label ? "border-green-400 bg-green-400/15 text-green-200" : o.label === "interrupted" ? "border-amber-500/40 text-amber-300" : "border-green-500/40 text-green-400/80"} hover:bg-green-400/10`}>
            {o.label}: {o.count}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-green-400/60">cell:</span>
        {(["time", "wait", "service"] as Metric[]).map((m) => (
          <button key={m} onClick={() => setMetric(m)} className={`px-2 py-0.5 rounded border text-[10px] ${metric === m ? "border-green-400 bg-green-400/15 text-green-200" : "border-green-500/40 text-green-400/70"}`}>{m === "time" ? "time spent" : m}</button>
        ))}
        <label className="flex items-center gap-1 text-green-400/70"><input type="checkbox" checked={interruptedOnly} onChange={(e) => setInterruptedOnly(e.target.checked)} className="accent-amber-500" /> interrupted only</label>
        <label className="flex items-center gap-1 text-green-400/70">min flow <input type="number" value={minFlow} onChange={(e) => setMinFlow(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))} className="w-16 bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-200 [color-scheme:dark]" /></label>
        <span className="text-green-400/50">{rows.length}/{table.rows.length} tokens</span>
        <MatrixButton onClick={exportCsv}>⇩ CSV</MatrixButton>
        {onClose && <MatrixButton onClick={onClose}>✕ Close</MatrixButton>}
      </div>

      {/* The matrix */}
      <div className="flex-1 overflow-auto border border-green-500/30 rounded">
        <table className="border-collapse text-[10px] tabular-nums">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 bg-black border border-green-500/30 px-2 py-1 text-green-300">Token#</th>
              {table.cols.map((c) => (
                <th key={c.id} className="sticky top-0 z-10 bg-black border border-green-500/25 px-2 py-1 min-w-[70px] text-green-400/80" title={`${c.kind}${c.team ? " · " + c.team : ""}`}>
                  <div className="text-[8px] text-green-500/50 uppercase">{KIND_ABBR[c.kind] ?? c.kind}</div>
                  <div className="max-w-[110px] truncate">{c.label}</div>
                </th>
              ))}
              <th className="sticky top-0 z-10 bg-black border border-green-500/30 px-2 py-1 text-green-300">Total ({unit})</th>
              <th className="sticky top-0 z-10 bg-black border border-green-500/30 px-2 py-1 text-green-300">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.hitBoundary ? "bg-amber-500/[0.06]" : r.inProgress ? "bg-cyan-500/[0.05]" : ""}>
                <td className="sticky left-0 z-10 bg-black border border-green-500/25 px-2 py-0.5 text-green-400/80">{r.num}</td>
                {table.cols.map((c) => { const v = cellVal(r.cells[c.id]); return (
                  <td key={c.id} className="border border-green-500/15 px-1.5 py-0.5 text-center text-green-200" style={{ background: tint(v) }}
                    title={r.cells[c.id] ? `time ${r.cells[c.id]!.time.toFixed(1)} · wait ${r.cells[c.id]!.wait.toFixed(1)} · ${r.cells[c.id]!.visits}×` : undefined}>
                    {fmt(v)}
                  </td>
                ); })}
                <td className="border border-green-500/25 px-2 py-0.5 text-right text-green-300">{r.total.toFixed(1)}</td>
                <td className={`border border-green-500/25 px-2 py-0.5 ${r.completed ? "text-green-300" : r.inProgress ? "text-cyan-300" : "text-amber-300"}`}>{r.outcome}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={table.cols.length + 3} className="px-3 py-4 text-green-400/50">No tokens match the filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="px-2 py-1 border border-green-500/30 rounded bg-green-500/[0.04] flex flex-col justify-center min-w-[64px]">
      <div className="text-[9px] text-green-500/60 uppercase tracking-wider">{label}</div>
      <div className={`text-sm ${accent ?? "text-green-200"}`}>{value}</div>
    </div>
  );
}
