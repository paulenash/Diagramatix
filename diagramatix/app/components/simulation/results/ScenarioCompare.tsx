"use client";

/**
 * Compare the latest run of each scenario in a study, side by side. Fetches each
 * scenario's newest run with metrics on mount, then delegates the rendering (+
 * grounded AI assessment) to CompareView.
 */

import { useCallback, useEffect, useState } from "react";
import { type RunMetrics, type RunRow } from "@/app/lib/simulation/results";
import { CompareView, type CompareEntry } from "./CompareView";

interface ScenarioLite { id: string; name: string; isBaseline: boolean }

export function ScenarioCompare({ scenarios, runUrlFor, assessUrl }: { scenarios: ScenarioLite[]; runUrlFor: (scenarioId: string) => string; assessUrl?: string }) {
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
  const firstCompare = scenarios.find((s) => !s.isBaseline && byId[s.id]);

  const entries: CompareEntry[] = scenarios
    .filter((s) => byId[s.id])
    .map((s) => ({ key: s.id, name: s.name, isBaseline: s.isBaseline, metrics: byId[s.id]! }));

  if (loading && entries.length === 0) return <p className="text-green-400/50 text-[10px]">Loading runs…</p>;
  if (entries.length === 0) return <p className="text-green-400/50 text-[10px]">No runs yet — run a scenario or two, then compare.</p>;

  const assessFn = assessUrl && baseline && firstCompare
    ? async () => {
        const res = await fetch(assessUrl, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baselineScenarioId: baseline.id, compareScenarioId: firstCompare.id }),
        });
        const json = await res.json().catch(() => ({}));
        return res.ok ? { assessment: json.assessment } : { error: json.error || "Assessment failed" };
      }
    : undefined;

  return <CompareView entries={entries} assessFn={assessFn} />;
}
