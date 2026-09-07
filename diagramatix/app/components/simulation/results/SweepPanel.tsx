"use client";

/**
 * The response curve — sweep one number across a range and see the shape, with
 * the knee marked.
 *
 * The chart is the feature. A staffing answer given as a number invites the same
 * conversation again in six months; given as a curve with the elbow on it, it
 * does not. Hand-rolled SVG in the FlowHistogram idiom — no chart library.
 */

import { useCallback, useState } from "react";
import { OBJECTIVES, type SweepAnalysis, type SweepLever, type SweepObjective } from "@/app/lib/simulation/sweep";
import { DiagramatixThrobber } from "@/app/components/DiagramatixThrobber";

const W = 340, H = 130, PAD_L = 34, PAD_R = 10, PAD_T = 10, PAD_B = 22;
const inp = "bg-black/40 border border-green-500/40 rounded px-1.5 py-0.5 text-green-200 text-[10px] w-16";

export function SweepPanel({ sweepUrl, levers }: {
  /** `/api/projects/:id/simulation/studies/:sid/scenarios/:scid/sweep` */
  sweepUrl: string;
  /** Team capacities and task times this scenario could sweep. */
  levers: SweepLever[];
}) {
  const [leverKey, setLeverKey] = useState(levers[0] ? `${levers[0].kind}${levers[0].target}` : "");
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("10");
  const [steps, setSteps] = useState("8");
  const [objective, setObjective] = useState<SweepObjective>("nearWorst");

  const [analysis, setAnalysis] = useState<SweepAnalysis | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(async () => {
    const lever = levers.find((l) => `${l.kind}${l.target}` === leverKey);
    if (!lever) { setErr("Pick something to sweep."); return; }
    setBusy(true); setErr(null); setNote(null);
    try {
      const res = await fetch(sweepUrl, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lever, from: Number(from), to: Number(to), steps: Number(steps), objective }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "The sweep failed"); return; }
      setAnalysis(json.analysis ?? null);
      // A clamped sweep is a different sweep from the one that was asked for, so
      // say so rather than quietly returning a coarser curve.
      if (json.clamped) {
        setNote(`Reduced to ${json.steps} points at ${json.replications} replications to stay inside the run budget.`);
      }
    } catch {
      setErr("The sweep failed");
    } finally { setBusy(false); }
  }, [sweepUrl, levers, leverKey, from, to, steps, objective]);

  return (
    <div className="flex flex-col gap-2 text-[10px]">
      <div className="flex items-end gap-2 flex-wrap">
        <label className="flex flex-col gap-0.5">
          <span className="text-green-400/60">Sweep</span>
          <select value={leverKey} onChange={(e) => setLeverKey(e.target.value)} className={`${inp} w-auto`}>
            {levers.map((l) => (
              <option key={`${l.kind}${l.target}`} value={`${l.kind}${l.target}`}>
                {l.label}{l.kind === "teamCapacity" ? "" : l.kind === "taskCycleTime" ? " (time)" : " (arrivals)"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-green-400/60">from</span>
          <input value={from} onChange={(e) => setFrom(e.target.value)} inputMode="decimal" className={inp} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-green-400/60">to</span>
          <input value={to} onChange={(e) => setTo(e.target.value)} inputMode="decimal" className={inp} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-green-400/60">points</span>
          <input value={steps} onChange={(e) => setSteps(e.target.value)} inputMode="numeric" className={inp} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-green-400/60">measuring</span>
          <select value={objective} onChange={(e) => setObjective(e.target.value as SweepObjective)} className={`${inp} w-auto`}>
            {OBJECTIVES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <button onClick={run} disabled={busy || levers.length === 0}
          className="rounded px-2 py-0.5 border border-green-400/60 text-green-200 hover:bg-green-400/10 disabled:opacity-40">
          {busy ? "Sweeping…" : "↗ Run the sweep"}
        </button>
        {busy && <DiagramatixThrobber size={14} tone="amber" />}
      </div>
      {busy && <p className="text-green-400/50">Running one full simulation per point — this takes longer than a single run.</p>}
      {note && <p className="text-amber-300/80">{note}</p>}
      {err && <p className="text-red-400">{err}</p>}

      {analysis && analysis.points.length > 1 && <Curve analysis={analysis} />}
      {analysis && <p className="text-green-200 leading-relaxed">{analysis.statement}</p>}
    </div>
  );
}

function Curve({ analysis }: { analysis: SweepAnalysis }) {
  const pts = analysis.points;
  const xs = pts.map((p) => p.value), ys = pts.map((p) => p.y);
  const xLo = Math.min(...xs), xHi = Math.max(...xs);
  const yLo = Math.min(...ys), yHi = Math.max(...ys);
  const xSpan = xHi - xLo || 1, ySpan = yHi - yLo || 1;
  const x = (v: number) => PAD_L + ((v - xLo) / xSpan) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - (v - yLo) / ySpan) * (H - PAD_T - PAD_B);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.value).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");
  const knee = analysis.knee;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${analysis.objectiveLabel} against the swept value`}>
        {/* y extent, so the shape cannot be read as bigger than it is */}
        <text x={2} y={y(yHi) + 3} className="fill-green-400/50" fontSize={8}>{yHi.toFixed(0)}</text>
        <text x={2} y={y(yLo) + 3} className="fill-green-400/50" fontSize={8}>{yLo.toFixed(0)}</text>

        {/* the point of diminishing returns, behind the curve */}
        {analysis.diminishingFrom !== undefined && (
          <>
            <rect x={x(analysis.diminishingFrom)} y={PAD_T} width={Math.max(0, W - PAD_R - x(analysis.diminishingFrom))}
              height={H - PAD_T - PAD_B} className="fill-green-400/5" />
            <text x={x(analysis.diminishingFrom) + 3} y={PAD_T + 9} className="fill-green-400/40" fontSize={7}>
              inside the noise →
            </text>
          </>
        )}

        <path d={path} fill="none" stroke="currentColor" className="text-green-400" strokeWidth={1.5} />
        {pts.map((p) => (
          <g key={p.value}>
            <circle cx={x(p.value)} cy={y(p.y)} r={2} className="fill-green-300" />
            <title>{`${p.value} → ${p.y}${analysis.unit ? " " + analysis.unit : ""}`}</title>
          </g>
        ))}

        {knee && (
          <g>
            <line x1={x(knee.value)} y1={PAD_T} x2={x(knee.value)} y2={H - PAD_B}
              stroke="currentColor" className="text-amber-400/60" strokeWidth={1} strokeDasharray="2 2" />
            <circle cx={x(knee.value)} cy={y(knee.y)} r={4} fill="none" stroke="currentColor" className="text-amber-300" strokeWidth={1.5} />
            <text x={x(knee.value) + 4} y={y(knee.y) - 6} className="fill-amber-300" fontSize={8}>knee · {knee.value}</text>
          </g>
        )}

        <text x={PAD_L} y={H - 4} className="fill-green-400/50" fontSize={8}>{xLo}</text>
        <text x={W - PAD_R} y={H - 4} textAnchor="end" className="fill-green-400/50" fontSize={8}>{xHi}</text>
        <text x={(W + PAD_L) / 2} y={H - 4} textAnchor="middle" className="fill-green-400/40" fontSize={8}>{analysis.objectiveLabel}</text>
      </svg>
    </div>
  );
}
