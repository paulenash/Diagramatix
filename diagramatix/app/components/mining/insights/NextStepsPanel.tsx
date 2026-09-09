"use client";

/**
 * "What should I do next?" — above the workbench, because it is the question
 * the reader has before they know which tab to open.
 *
 * Everything here is computed. The ranking is deterministic and nothing on this
 * panel came from a model: a finding is a measured number with a button on it.
 * The AI narration, where an org allows it, rewrites the same findings into
 * prose and is shown BELOW them, so the computed list is what a reader sees
 * first and the prose can never be mistaken for the source.
 */

import { useMemo, useState } from "react";
import type { RunAnalytics } from "@/app/lib/mining/analytics";
import type { ConformanceResult } from "@/app/lib/mining/transitionConformance";
import type { Variant } from "@/app/lib/mining/types";
import type { KpiConfig } from "@/app/lib/mining/outcomes";
import { findActions, type MinerAction, type MinerFinding } from "@/app/lib/mining/nextSteps";

const KIND_ICON: Record<MinerFinding["kind"], string> = {
  bottleneck: "⏱", handover: "⇄", rework: "↻", lateness: "🎯",
  deviation: "⚖", backlog: "📈", "cross-team": "👥",
};

export interface NextStepsPanelProps {
  analytics: RunAnalytics | null;
  variants: Variant[];
  conformance: ConformanceResult | null;
  kpiConfig: KpiConfig | null;
  hasTwin: boolean;
  /** Carry out a finding's action — open a tab, drill to cases, calibrate. */
  onAct: (action: MinerAction) => void;
  /** True when the numbers on screen describe a slice, so the advice does too. */
  filtered: boolean;
}

export function NextStepsPanel({ analytics, variants, conformance, kpiConfig, hasTwin, onAct, filtered }: NextStepsPanelProps) {
  const [open, setOpen] = useState(true);
  const result = useMemo(
    () => findActions({ analytics, variants, conformance, kpiConfig, hasTwin }),
    [analytics, variants, conformance, kpiConfig, hasTwin],
  );

  if (!analytics) return null;

  return (
    <div className="mb-3 rounded border border-amber-700/50 bg-amber-950/20 p-2.5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-semibold text-amber-200">What to do next</span>
        {filtered && <span className="text-[10px] rounded px-1.5 py-0.5 border border-amber-700/50 bg-amber-900/30 text-amber-200">for the current slice</span>}
        <button onClick={() => setOpen((v) => !v)} className="ml-auto text-[11px] text-amber-300 hover:text-amber-200">
          {open ? "hide" : "show"}
        </button>
      </div>

      {open && (
        <>
          {result.nothingStandsOut ? (
            // The answer a tool that always has a recommendation can never give,
            // and the reason the rest of this panel is worth believing.
            <p className="text-[11px] text-stone-300">
              Nothing stands out in this run. No step, hand-off or team dominates the elapsed time by
              enough to be worth acting on, on the evidence here.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {result.findings.map((f, i) => (
                <div key={i} className="flex items-start gap-2 rounded bg-stone-900/60 border border-stone-700 p-2">
                  <span className="text-sm leading-none pt-0.5" aria-hidden>{KIND_ICON[f.kind]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-stone-100">{f.title}</div>
                    <div className="text-[10px] text-stone-400 leading-snug">{f.detail}</div>
                  </div>
                  {f.share !== null && (
                    <span className="text-[11px] text-amber-200 tabular-nums whitespace-nowrap pt-0.5">{Math.round(f.share * 100)}%</span>
                  )}
                  <button onClick={() => onAct(f.action)}
                    className="text-[11px] rounded px-2 py-1 bg-amber-700 hover:bg-amber-600 text-white whitespace-nowrap">
                    {f.action.label}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* What was NOT assessed. Silence here would read as a clean bill:
              a reader cannot tell the difference between "your SLA is met" and
              "you never set one" unless the tool says which. */}
          {result.skipped.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {result.skipped.map((s, i) => (
                <li key={i} className="text-[10px] text-stone-500 leading-snug">— {s}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
