"use client";

/**
 * One filter bar above the tabs — the thing that turns a finding into a cause.
 *
 * It offers only what the run can actually honour: the date range (always), the
 * teams the log named (only when a resource column was mapped), and the columns
 * kept at import that have few enough distinct values to be a dimension.
 *
 * A column that was kept but is an identifier — an invoice number, a customer
 * reference — is SHOWN and disabled with the reason. Silently omitting it looks
 * like the import lost the column, and the user would go and re-import.
 */

import { ThroughputChart } from "./ThroughputChart";
import type { RunAnalytics } from "@/app/lib/mining/analytics";
import type { MiningFilter } from "@/app/lib/mining/filterAnalytics";
import type { RunView } from "./useRunView";

const SELECT = "bg-stone-800 border border-stone-600 rounded px-2 py-0.5 text-stone-100 text-[11px]";

export interface FilterBarProps {
  /** The WHOLE-RUN analytics — the vocabulary of what can be filtered on, and
   *  the unchanging bars of the chart. Never the filtered copy. */
  analytics: RunAnalytics | null;
  filter: MiningFilter;
  onChange: (next: MiningFilter) => void;
  view: RunView;
}

export function FilterBar({ analytics, filter, onChange, view }: FilterBarProps) {
  if (!analytics) return null;

  const attrs = analytics.attributes ?? [];
  const teams = [...(analytics.resourceDict ?? [])].sort();
  const setAttr = (name: string, value: string) => {
    const next = { ...(filter.attrs ?? {}) };
    if (value) next[name] = value; else delete next[name];
    onChange({ ...filter, attrs: next });
  };

  return (
    <div className="mb-3 rounded border border-stone-700 bg-stone-900/50 p-2.5 flex flex-col gap-2">
      <ThroughputChart
        buckets={analytics.throughput}
        from={filter.from ?? null}
        to={filter.to ?? null}
        onChange={(from, to) => onChange({ ...filter, from, to })}
      />

      <div className="flex items-center gap-2 flex-wrap text-[11px] pt-1 border-t border-stone-700/60">
        {teams.length > 0 && (
          <label className="flex items-center gap-1.5">
            <span className="text-stone-400">Team</span>
            <select value={filter.resource ?? ""} onChange={(e) => onChange({ ...filter, resource: e.target.value || null })} className={SELECT}>
              <option value="">any</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        )}

        {attrs.map((a) => (
          <label key={a.name} className="flex items-center gap-1.5">
            <span className={a.filterable ? "text-stone-400" : "text-stone-600"}>{a.name}</span>
            <select
              value={filter.attrs?.[a.name] ?? ""}
              onChange={(e) => setAttr(a.name, e.target.value)}
              disabled={!a.filterable}
              title={a.filterable ? `${a.distinct} distinct values` : a.reason}
              className={SELECT + (a.filterable ? "" : " opacity-40 cursor-not-allowed")}
            >
              <option value="">any</option>
              {(a.values ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        ))}

        {teams.length === 0 && attrs.length === 0 && (
          <span className="text-[10px] text-stone-500">
            No teams or kept columns to slice by. Map a resource column, or keep a column at import, and this run can be broken down by it.
          </span>
        )}

        {view.filtered && (
          <button onClick={() => onChange({})} className="ml-auto text-[11px] text-amber-300 hover:text-amber-200 underline">
            clear filter
          </button>
        )}
      </div>

      {/* What is on screen, said once, above everything it applies to. */}
      {view.filtered && (
        <div className="flex items-start gap-2 flex-wrap text-[11px] pt-1 border-t border-stone-700/60">
          <span className="rounded px-1.5 py-0.5 border border-amber-700/50 bg-amber-900/30 text-amber-100">{view.description}</span>
          <span className="text-stone-300">
            <span className="text-amber-200 tabular-nums">{view.estimatedCases.toLocaleString()}</span> of{" "}
            <span className="tabular-nums">{analytics.totalCases.toLocaleString()}</span> cases
            {view.estimatedCases !== view.matched && <span className="text-stone-500"> (from {view.matched.toLocaleString()} stored)</span>}
          </span>
          {view.note && <span className="text-amber-300/90 basis-full leading-snug">⚠ {view.note}</span>}
        </div>
      )}
    </div>
  );
}
