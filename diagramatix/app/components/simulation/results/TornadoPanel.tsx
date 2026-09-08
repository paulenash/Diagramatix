"use client";

/**
 * Which assumption is load-bearing? — the tornado.
 *
 * A model has thirty numbers in it and most of them do not matter. This pushes
 * each one ±X% in turn and ranks them by how far the answer moves.
 *
 * THE BOTTOM HALF OF THE CHART IS THE POINT. "But you guessed that number" is
 * the commonest objection a simulation meets in a meeting room, and the answer
 * is: yes, and here is the evidence it makes no difference. So the flat bars are
 * drawn, labelled and counted rather than filtered away as boring.
 *
 * And bars the model could not vary are drawn in a THIRD style, never as flat
 * ones — "untested" shown as "makes no difference" would be exactly the kind of
 * false reassurance this feature exists to disprove.
 *
 * Hand-rolled SVG in the FlowHistogram / SweepPanel idiom — no chart library.
 */

import { useCallback, useState } from "react";
import { OBJECTIVES, type SweepObjective } from "@/app/lib/simulation/sweep";
import type { SensitivityBar, Tornado } from "@/app/lib/simulation/sensitivity";
import { DiagramatixThrobber } from "@/app/components/DiagramatixThrobber";

const inp = "bg-black/40 border border-green-500/40 rounded px-1.5 py-0.5 text-green-200 text-[10px]";
const W = 340, LABEL_W = 108, PAD_R = 8, ROW_H = 13, PAD_T = 14, PAD_B = 14;

export function TornadoPanel({ sensitivityUrl }: {
  /** `/api/projects/:id/simulation/studies/:sid/scenarios/:scid/sensitivity` */
  sensitivityUrl: string;
}) {
  const [objective, setObjective] = useState<SweepObjective>("nearWorst");
  const [variation, setVariation] = useState("20");
  const [tornado, setTornado] = useState<Tornado | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(async () => {
    setBusy(true); setErr(null); setNote(null);
    try {
      const res = await fetch(sensitivityUrl, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objective, variationPct: (Number(variation) || 20) / 100 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "The sensitivity run failed"); return; }
      setTornado(json.tornado ?? null);
      // A tornado missing its biggest lever is worse than no tornado, so a
      // budget cut is named, not hinted at.
      const dropped: string[] = json.droppedForBudget ?? [];
      if (dropped.length) {
        setNote(`The run budget covered ${json.tested} of ${json.parameters} parameters. NOT tested: ${dropped.join(", ")}.`);
      } else if (json.clamped) {
        setNote(`Reduced to ${json.replications} replications to stay inside the run budget.`);
      }
    } catch {
      setErr("The sensitivity run failed");
    } finally { setBusy(false); }
  }, [sensitivityUrl, objective, variation]);

  return (
    <div className="flex flex-col gap-2 text-[10px]">
      <div className="flex items-end gap-2 flex-wrap">
        <label className="flex flex-col gap-0.5">
          <span className="text-green-400/60">measuring</span>
          <select value={objective} onChange={(e) => setObjective(e.target.value as SweepObjective)} className={inp}>
            {OBJECTIVES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-green-400/60">vary each by ±%</span>
          <input value={variation} onChange={(e) => setVariation(e.target.value)} inputMode="numeric" className={`${inp} w-14`} />
        </label>
        <button onClick={run} disabled={busy}
          className="rounded px-2 py-0.5 border border-green-400/60 text-green-200 hover:bg-green-400/10 disabled:opacity-40">
          {busy ? "Testing…" : "⛁ Test every assumption"}
        </button>
        {busy && <DiagramatixThrobber size={14} tone="amber" />}
      </div>
      {busy && <p className="text-green-400/50">Two full simulations per parameter — this takes longer than a sweep.</p>}
      {note && <p className="text-amber-300/80 leading-relaxed">{note}</p>}
      {err && <p className="text-red-400">{err}</p>}

      {tornado && tornado.bars.length > 0 && <Bars t={tornado} />}
      {tornado && <p className="text-green-200 leading-relaxed">{tornado.statement}</p>}
    </div>
  );
}

/** The three outcomes, kept visually distinct so they can never be read as each
 *  other. Untestable bars carry no width at all — there is nothing to draw. */
function toneOf(b: SensitivityBar) {
  if (b.verdict === "moves") return { bar: "fill-amber-400/70", text: "fill-green-300" };
  if (b.verdict === "no-difference") return { bar: "fill-green-400/25", text: "fill-green-400/60" };
  return { bar: "fill-transparent", text: "fill-green-400/40" };
}

function Bars({ t }: { t: Tornado }) {
  const [hover, setHover] = useState<number | null>(null);
  const widest = Math.max(...t.bars.map((b) => b.swing), 0) || 1;
  const H = PAD_T + t.bars.length * ROW_H + PAD_B;
  const plotW = W - LABEL_W - PAD_R;
  const mid = LABEL_W + plotW / 2;
  // Symmetric about the baseline: half the widest swing each side, so the bars
  // read as "how far either way", which is what a tornado means.
  const half = plotW / 2;
  const scale = (v: number) => (v / widest) * half;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`Parameters ranked by how far they move ${t.objectiveLabel}`}>
        {/* the baseline answer — every bar is measured against this */}
        <line x1={mid} y1={PAD_T - 4} x2={mid} y2={H - PAD_B} stroke="currentColor" className="text-green-400/40" strokeWidth={1} />
        <text x={mid} y={PAD_T - 6} textAnchor="middle" className="fill-green-400/60" fontSize={7}>
          {t.objectiveLabel} {t.baselineY}{t.unit ? " " + t.unit : ""}
        </text>

        {t.bars.map((b, i) => {
          const y = PAD_T + i * ROW_H;
          const tone = toneOf(b);
          const w = scale(b.swing);
          // Which end sits left is decided by which VALUE produced it, so the
          // reader can tell whether more of the parameter helps or hurts.
          const lowLeft = (b.lowY ?? 0) <= (b.highY ?? 0);
          return (
            <g key={`${b.param.kind}:${b.param.target}`}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={0} y={y} width={W} height={ROW_H} className={hover === i ? "fill-green-400/5" : "fill-transparent"} />
              <text x={0} y={y + ROW_H - 3} className={tone.text} fontSize={7.5}>
                {b.param.label.length > 20 ? b.param.label.slice(0, 19) + "…" : b.param.label}
              </text>
              {b.verdict === "not-testable" ? (
                <text x={mid + 4} y={y + ROW_H - 3} className="fill-amber-300/60" fontSize={7}>could not be varied — UNTESTED</text>
              ) : (
                <>
                  <rect x={mid - w / 2} y={y + 2} width={Math.max(w, 0.8)} height={ROW_H - 5} className={tone.bar} />
                  <text x={mid - w / 2 - 3} textAnchor="end" y={y + ROW_H - 4} className="fill-green-400/50" fontSize={6.5}>
                    {lowLeft ? b.lowValue : b.highValue}
                  </text>
                  <text x={mid + w / 2 + 3} y={y + ROW_H - 4} className="fill-green-400/50" fontSize={6.5}>
                    {lowLeft ? b.highValue : b.lowValue}
                  </text>
                </>
              )}
              <title>{b.note}</title>
            </g>
          );
        })}
      </svg>

      {/* The note for the hovered row, spelled out — a tooltip alone is not
          reachable by keyboard or readable in a screenshot. */}
      <p className="text-green-400/60 leading-relaxed min-h-[2.2em]">
        {hover !== null ? t.bars[hover].note : `Each parameter pushed ±${Math.round(t.variationPct * 100)}% in turn. Hover a row for what it did.`}
      </p>
    </div>
  );
}
