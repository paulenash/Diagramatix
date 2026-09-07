"use client";

/**
 * "How do we know this model is right?" — answered with a number.
 *
 * Compares the twin's flow-time distribution against the real one from the log,
 * shows both curves overlaid, and states the verdict. Miner amber skin.
 *
 * The panel is deliberately blunt about what the figure means: agreement is not
 * proof the model is correct, and an in-sample check is the model marking its own
 * homework. A validation feature that oversells itself is worse than none.
 */

import { useCallback, useState } from "react";
import type { DistributionComparison } from "@/app/lib/simulation/validate";
import { DiagramatixThrobber } from "@/app/components/DiagramatixThrobber";

interface Payload {
  comparison: DistributionComparison;
  unit: string;
  outOfSample: boolean;
  observedCases: number;
  caveat: string;
}

const W = 320, H = 96, PAD_L = 6, PAD_R = 6, PAD_T = 8, PAD_B = 16;

export function ValidateTwinPanel({ validateUrl }: { validateUrl: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const check = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(validateUrl, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "The check could not be run"); return; }
      setData(json as Payload);
    } catch {
      setErr("The check could not be run");
    } finally { setBusy(false); }
  }, [validateUrl]);

  const c = data?.comparison;

  return (
    <div className="mt-4 pt-3 border-t border-stone-700">
      <h3 className="text-xs font-semibold text-amber-200 mb-1">Does the model match reality?</h3>
      <p className="text-[11px] text-stone-400 mb-2">
        Compare the twin&rsquo;s flow times against what actually happened in the log. Every simulation gets
        asked how we know it is right; this answers it with a number instead of judgement.
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={check} disabled={busy}
          className="text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white rounded px-3 py-1.5">
          {busy ? "Checking…" : "⚖ Check against reality"}
        </button>
        {busy && <DiagramatixThrobber size={18} tone="amber" />}
      </div>

      {err && <p className="text-rose-400 text-[11px] mt-2">{err}</p>}

      {c && (
        <div className="mt-3 flex flex-col gap-2">
          {!c.enough ? (
            <p className="text-[11px] text-amber-300/90 leading-relaxed">{c.statement}</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="text-2xl tabular-nums" style={{ color: c.close ? "#86efac" : "#fca5a5" }}>
                  {c.agreementPct}%
                </div>
                <div className="text-[11px]">
                  <div className={c.close ? "text-emerald-300" : "text-rose-300"}>
                    {c.close ? "✓ agrees with the log" : "✕ diverges from the log"}
                  </div>
                  <div className="text-stone-400">
                    {data!.outOfSample ? "out-of-sample" : "in-sample"} · {data!.observedCases} real cases
                  </div>
                </div>
              </div>

              <Curves c={c} unit={data!.unit} />

              <table className="text-[11px] w-full">
                <thead className="text-stone-500">
                  <tr>
                    <th className="text-left font-normal py-0.5"></th>
                    <th className="text-right font-normal py-0.5">Observed</th>
                    <th className="text-right font-normal py-0.5">Simulated</th>
                  </tr>
                </thead>
                <tbody>
                  {([["Typical (p50)", "p50"], ["p90", "p90"], ["Near-worst (p95)", "p95"]] as const).map(([label, key]) => (
                    <tr key={key} className="border-t border-stone-800">
                      <td className="py-0.5 text-stone-400">{label}</td>
                      <td className="py-0.5 text-right text-stone-200 tabular-nums">{c.observed[key].toFixed(1)}</td>
                      <td className="py-0.5 text-right text-stone-200 tabular-nums">{c.simulated[key].toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="text-[11px] text-stone-300 leading-relaxed">{c.statement}</p>
              <p className="text-[10px] text-amber-300/70 leading-relaxed">{data!.caveat}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** The two cumulative curves overlaid — the gap between them IS the statistic. */
function Curves({ c, unit }: { c: DistributionComparison; unit: string }) {
  // Both distributions are summarised by their percentiles, which is exactly a
  // cumulative curve: x = value, y = share of cases at or below it.
  const pts = (d: DistributionComparison["observed"]) => [
    { x: 0, y: 0 }, { x: d.p50, y: 0.5 }, { x: d.p90, y: 0.9 }, { x: d.p95, y: 0.95 },
  ];
  const o = pts(c.observed), s = pts(c.simulated);
  const xMax = Math.max(...[...o, ...s].map((p) => p.x)) || 1;
  const X = (v: number) => PAD_L + (v / xMax) * (W - PAD_L - PAD_R);
  const Y = (v: number) => PAD_T + (1 - v) * (H - PAD_T - PAD_B);
  const path = (ps: { x: number; y: number }[]) =>
    ps.map((p, i) => `${i === 0 ? "M" : "L"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Observed and simulated flow-time distributions">
        <path d={path(o)} fill="none" stroke="currentColor" className="text-emerald-400" strokeWidth={1.5} />
        <path d={path(s)} fill="none" stroke="currentColor" className="text-amber-400" strokeWidth={1.5} strokeDasharray="4 2" />
        <text x={PAD_L} y={H - 3} className="fill-stone-500" fontSize={8}>0</text>
        <text x={W - PAD_R} y={H - 3} textAnchor="end" className="fill-stone-500" fontSize={8}>
          {xMax.toFixed(0)} {unit}
        </text>
      </svg>
      <div className="flex items-center gap-3 text-[10px] text-stone-400">
        <span><span className="inline-block w-3 h-px bg-emerald-400 align-middle mr-1" />observed</span>
        <span><span className="inline-block w-3 h-px bg-amber-400 align-middle mr-1" style={{ borderTop: "1px dashed" }} />simulated</span>
      </div>
    </div>
  );
}
