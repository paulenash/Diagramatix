"use client";

/**
 * "What should I try next?" — the ranked suggestions computed from a study's run
 * history, each with the evidence behind it and, where the lever allows a concrete
 * value, a button that creates the scenario.
 *
 * The panel renders only what the server computed. It never softens a finding: an
 * "inside the noise" result is shown as plainly as a promising one, because a
 * negative result is the useful half of the answer.
 */

import { useCallback, useEffect, useState } from "react";
import type { NextStepsReport, Suggestion, SuggestionKind } from "@/app/lib/simulation/nextSteps";
import type { OverrideSet } from "@/app/lib/simulation/overrides";
import { DiagramatixThrobber } from "@/app/components/DiagramatixThrobber";

interface Payload {
  report: NextStepsReport;
  narrative: string | null;
  deterministic?: boolean;
  aiError?: string;
}

/** Badge per finding kind. Colour carries the meaning: amber = act on this,
 *  slate = a negative result (stop looking here), green = an opportunity. */
const KIND: Record<SuggestionKind, { label: string; cls: string }> = {
  "unaddressed-bottleneck": { label: "bottleneck", cls: "border-amber-400/60 text-amber-300" },
  "still-improving": { label: "still paying", cls: "border-green-400/60 text-green-300" },
  "untried-lever": { label: "never varied", cls: "border-green-400/40 text-green-400/80" },
  "abandoned-lever": { label: "one point only", cls: "border-green-400/40 text-green-400/80" },
  "inside-noise": { label: "no effect", cls: "border-slate-400/40 text-slate-300" },
};

export function NextStepsPanel({ nextStepsUrl, onCreateScenario, refreshKey }: {
  nextStepsUrl: string;
  /** Create the scenario a suggestion proposes. Resolves once it exists. */
  onCreateScenario: (name: string, overrides: OverrideSet) => Promise<void>;
  /** Bump to re-fetch after a run finishes. */
  refreshKey?: unknown;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(nextStepsUrl, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "Could not work out the next steps"); return; }
      setData(json as Payload);
    } catch {
      setErr("Could not work out the next steps");
    } finally {
      setLoading(false);
    }
  }, [nextStepsUrl]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  async function create(s: Suggestion) {
    if (!s.scenarioName || !s.overrides) return;
    setBusy(s.title);
    try {
      await onCreateScenario(s.scenarioName, s.overrides);
      setCreated((prev) => new Set(prev).add(s.title));
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-green-400/60 text-[10px]">
        <DiagramatixThrobber size={14} tone="amber" /> reading the run history…
      </div>
    );
  }
  if (err) return <p className="text-red-400 text-[10px]">{err}</p>;
  if (!data) return null;

  const { report, narrative } = data;

  // Not enough history is a real answer. Say so rather than invent advice.
  if (!report.enough) {
    return (
      <div className="text-[10px] text-green-400/60 leading-relaxed">
        <p className="text-green-300/80 mb-1">Not enough history yet.</p>
        <p>{report.reason}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] text-green-400/50">
        From {report.observations} scenario{report.observations === 1 ? "" : "s"} that have been run.
        {data.deterministic && " Computed without AI."}
      </p>

      {narrative && (
        <div className="rounded border border-green-500/30 bg-green-400/5 p-2 text-[11px] text-green-200/90 whitespace-pre-wrap leading-relaxed">
          {narrative}
        </div>
      )}

      {report.suggestions.length === 0 && (
        <p className="text-[10px] text-green-400/60">
          Nothing stands out — every lever that has been varied moved the result, and no team has been left unexamined.
        </p>
      )}

      <ol className="flex flex-col gap-1.5">
        {report.suggestions.map((s, i) => {
          const k = KIND[s.kind];
          const done = created.has(s.title);
          return (
            <li key={s.title} className="rounded border border-green-500/20 p-2">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-green-400/40 text-[10px] tabular-nums">{i + 1}</span>
                <span className="text-green-200 text-[11px] font-semibold">{s.title}</span>
                <span className={`text-[9px] uppercase tracking-wider border rounded px-1 py-px ${k.cls}`}>{k.label}</span>
              </div>
              <p className="text-[10px] text-green-400/70 mt-1 leading-relaxed">{s.evidence}</p>
              {s.scenarioName && s.overrides && (
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    onClick={() => create(s)}
                    disabled={done || busy === s.title}
                    title={done ? "Already created" : `Creates the scenario "${s.scenarioName}"`}
                    className={`text-[10px] rounded px-2 py-0.5 border ${
                      done
                        ? "border-green-500/20 text-green-400/40 cursor-default"
                        : "border-green-400/60 text-green-300 hover:bg-green-400/10"
                    }`}
                  >
                    {done ? "✓ created" : busy === s.title ? "creating…" : `＋ Create "${s.scenarioName}"`}
                  </button>
                  {done && <span className="text-[10px] text-green-400/50">run it to see whether it helps</span>}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <button onClick={() => void load()} className="self-start text-[10px] text-green-400/50 hover:text-green-300">
        ↻ recompute
      </button>
    </div>
  );
}
