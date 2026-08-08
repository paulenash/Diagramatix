"use client";

/**
 * DiagramatixMINER "Insights" — the analyst workbench over a mined run. Tabbed:
 * Heat (bottleneck/frequency colouring of the discovered model) and Variants
 * (Pareto + path isolation + compare). Later slices add Cases, Outcomes, Export.
 * Self-fetches the run's full detail (analytics + variants + kpiConfig) and the
 * discovered diagram data once, shared across tabs.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DiagramData } from "@/app/lib/diagram/types";
import type { RunAnalytics } from "@/app/lib/mining/analytics";
import type { Variant } from "@/app/lib/mining/types";
import { formatDuration } from "@/app/lib/mining/analytics";
import { applyHeat, heatColor, HEAT_METRICS, type HeatMetric } from "@/app/lib/mining/heat";
import { variantPathIds, variantDiff, variantPareto } from "@/app/lib/mining/variantView";
import { ReplayDiagramBackdrop } from "@/app/components/simulation/replay/ReplayDiagramBackdrop";
import { DiagramatixThrobber } from "@/app/components/DiagramatixThrobber";

interface RunLite { id: string; discoveredBpmnId: string | null; discoveredSmId: string | null }

type TabKey = "heat" | "variants";
const TABS: { key: TabKey; label: string }[] = [
  { key: "heat", label: "🔥 Insights" },
  { key: "variants", label: "🔀 Variants" },
];

export function MiningInsightsPanel({ projectId, run }: { projectId: string; run: RunLite }) {
  const [tab, setTab] = useState<TabKey>("heat");
  const [analytics, setAnalytics] = useState<RunAnalytics | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [bpmn, setBpmn] = useState<DiagramData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setAnalytics(null); setVariants([]); setBpmn(null);
    try {
      const rd = await fetch(`/api/projects/${projectId}/mining/runs/${run.id}`, { cache: "no-store" });
      const rj = rd.ok ? await rd.json() : null;
      setAnalytics((rj?.run?.analytics ?? null) as RunAnalytics | null);
      setVariants((rj?.run?.variants ?? []) as Variant[]);
      if (run.discoveredBpmnId) {
        const dd = await fetch(`/api/diagrams/${run.discoveredBpmnId}`, { cache: "no-store" });
        if (dd.ok) setBpmn(((await dd.json())?.data ?? null) as DiagramData | null);
      }
    } catch { /* best-effort */ }
    finally { setLoading(false); }
  }, [projectId, run.id, run.discoveredBpmnId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mt-4 pt-3 border-t border-stone-700">
      <div className="flex items-center gap-2 mb-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`text-xs rounded px-2.5 py-1 ${tab === t.key ? "bg-amber-700 text-white" : "bg-stone-800 text-stone-300 hover:bg-stone-700"}`}>
            {t.label}
          </button>
        ))}
        {loading && <DiagramatixThrobber size={16} tone="amber" />}
      </div>
      {tab === "heat" && <HeatTab analytics={analytics} bpmn={bpmn} hasBpmn={!!run.discoveredBpmnId} loading={loading} />}
      {tab === "variants" && <VariantsTab variants={variants} bpmn={bpmn} hasBpmn={!!run.discoveredBpmnId} />}
    </div>
  );
}

/** Read-only fitted SVG of a diagram (optionally isolating a path via visibleIds). */
function ModelSvg({ data, visibleIds, maxVh = 46 }: { data: DiagramData; visibleIds?: Set<string>; maxVh?: number }) {
  const viewBox = useMemo(() => boundsViewBox(data), [data]);
  return (
    <div className="bg-stone-100 rounded border border-stone-700 overflow-hidden">
      <svg viewBox={viewBox} className="w-full" style={{ maxHeight: `${maxVh}vh` }} preserveAspectRatio="xMidYMid meet">
        <ReplayDiagramBackdrop data={data} visibleIds={visibleIds} />
      </svg>
    </div>
  );
}

// ── Heat tab ────────────────────────────────────────────────────────────────

function HeatTab({ analytics, bpmn, hasBpmn, loading }: { analytics: RunAnalytics | null; bpmn: DiagramData | null; hasBpmn: boolean; loading: boolean }) {
  const [metric, setMetric] = useState<HeatMetric>("totalTime");
  const heated = useMemo(() => (bpmn && analytics ? applyHeat(bpmn, analytics, metric) : null), [bpmn, analytics, metric]);
  const metricOf = HEAT_METRICS.find((m) => m.key === metric)!.of;
  const fmt = useCallback((v: number) => (metric === "frequency" ? String(v) : analytics ? formatDuration(v, analytics.clockUnit) : String(v)), [metric, analytics]);

  if (!hasBpmn) return <NeedBpmn what="heat map" />;
  if (loading && !analytics) return <p className="text-[11px] text-stone-500">Loading analytics…</p>;
  if (!analytics || analytics.activities.length === 0) return <NoAnalytics />;

  const top = [...analytics.activities].sort((a, b) => metricOf(b) - metricOf(a)).slice(0, 8);
  const maxV = Math.max(1, ...analytics.activities.map(metricOf));

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="md:col-span-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-wide text-stone-400">Colour by</span>
          {HEAT_METRICS.map((m) => (
            <button key={m.key} onClick={() => setMetric(m.key)}
              className={`text-[11px] rounded px-2 py-0.5 ${metric === m.key ? "bg-amber-700 text-white" : "bg-stone-800 text-stone-300 hover:bg-stone-700"}`}>
              {m.label}
            </button>
          ))}
        </div>
        {heated && <ModelSvg data={heated} />}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] text-stone-400">low</span>
          <div className="h-2 flex-1 rounded" style={{ background: `linear-gradient(90deg, ${heatColor(0)}, ${heatColor(0.5)}, ${heatColor(1)})` }} />
          <span className="text-[10px] text-stone-400">high</span>
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold text-amber-200 mb-1">Top steps</div>
        <table className="w-full text-[11px]">
          <tbody>
            {top.map((a) => {
              const v = metricOf(a);
              return (
                <tr key={a.activity} className="border-b border-stone-800">
                  <td className="py-1 pr-1"><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{ background: heatColor(v / maxV) }} /></td>
                  <td className="py-1 pr-2 text-stone-200 truncate max-w-[8rem]" title={a.activity}>{a.activity}</td>
                  <td className="py-1 text-right text-stone-300 tabular-nums whitespace-nowrap">{fmt(v)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Variants tab ──────────────────────────────────────────────────────────────

function VariantsTab({ variants, bpmn, hasBpmn }: { variants: Variant[]; bpmn: DiagramData | null; hasBpmn: boolean }) {
  const [focus, setFocus] = useState<number | null>(null);   // single-click: isolate this variant's path
  const [checked, setChecked] = useState<Set<number>>(new Set()); // multi-select for filter / compare
  const pareto = useMemo(() => variantPareto(variants), [variants]);

  // visibleIds = focused variant's path, or the union of checked variants' paths.
  const visibleIds = useMemo(() => {
    if (!bpmn) return undefined;
    const idxs = checked.size ? [...checked] : focus != null ? [focus] : [];
    if (!idxs.length) return undefined;
    const set = new Set<string>();
    for (const i of idxs) for (const id of variantPathIds(bpmn, variants[i]?.events ?? [])) set.add(id);
    return set;
  }, [bpmn, variants, focus, checked]);

  const toggle = (i: number) => setChecked((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const cmp = checked.size === 2 ? [...checked] : null;
  const diff = cmp ? variantDiff(variants[cmp[0]].events, variants[cmp[1]].events) : null;

  if (variants.length === 0) return <p className="text-[11px] text-stone-400">No variants for this run.</p>;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {/* Pareto list */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-semibold text-amber-200">Variants ({variants.length}) — most frequent first</div>
          {checked.size > 0 && <button onClick={() => setChecked(new Set())} className="text-[10px] text-amber-300 hover:text-amber-200 underline">clear</button>}
        </div>
        <div className="max-h-[46vh] overflow-auto pr-1">
          {pareto.map((r) => (
            <div key={r.idx}
              className={`flex items-start gap-2 py-1 px-1 rounded cursor-pointer ${focus === r.idx ? "bg-amber-600/20" : "hover:bg-stone-800"}`}
              onClick={() => setFocus(focus === r.idx ? null : r.idx)}>
              <input type="checkbox" checked={checked.has(r.idx)} onChange={() => toggle(r.idx)} onClick={(e) => e.stopPropagation()} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-stone-400">#{r.idx + 1}</span>
                  <span className="text-stone-200 tabular-nums">{r.count}×</span>
                  <span className="text-stone-500">{(r.share * 100).toFixed(1)}%</span>
                  <span className="text-stone-600">· cum {(r.cumulative * 100).toFixed(0)}%</span>
                </div>
                <div className="text-[10px] text-stone-400 truncate" title={r.events.join(" → ")}>{r.events.join(" → ")}</div>
              </div>
            </div>
          ))}
        </div>
        {diff && (
          <div className="mt-2 rounded border border-stone-700 p-2 text-[11px]">
            <div className="font-semibold text-amber-200 mb-1">Compare #{cmp![0] + 1} vs #{cmp![1] + 1}</div>
            <DiffRow label={`Only in #${cmp![0] + 1}`} items={diff.onlyA} tone="text-rose-300" />
            <DiffRow label={`Only in #${cmp![1] + 1}`} items={diff.onlyB} tone="text-emerald-300" />
            <DiffRow label="Shared" items={diff.common} tone="text-stone-400" />
          </div>
        )}
        {checked.size !== 2 && <p className="mt-1 text-[10px] text-stone-500">Tick two variants to compare; tick any to isolate their paths on the model.</p>}
      </div>

      {/* Model with the selected path(s) isolated */}
      <div>
        {!hasBpmn ? <NeedBpmn what="path view" /> : bpmn ? (
          <>
            <div className="text-xs font-semibold text-amber-200 mb-1">
              {visibleIds ? "Selected path(s) isolated" : "Full discovered model"}
            </div>
            <ModelSvg data={bpmn} visibleIds={visibleIds} />
          </>
        ) : <p className="text-[11px] text-stone-500">Loading model…</p>}
      </div>
    </div>
  );
}

function DiffRow({ label, items, tone }: { label: string; items: string[]; tone: string }) {
  return (
    <div className="mb-0.5">
      <span className="text-stone-500">{label}: </span>
      <span className={tone}>{items.length ? items.join(", ") : "—"}</span>
    </div>
  );
}

function NeedBpmn({ what }: { what: string }) {
  return <p className="text-[11px] text-stone-400">Discover the <span className="text-amber-200">process (BPMN)</span> first — the {what} needs the discovered activities.</p>;
}
function NoAnalytics() {
  return <p className="text-[11px] text-stone-400">No analytics for this run yet. Re-import the log to compute the Insights (older runs predate this feature).</p>;
}

/** viewBox string fitting all elements with padding. */
function boundsViewBox(data: DiagramData, pad = 24): string {
  const xs = data.elements.flatMap((e) => [e.x, e.x + e.width]);
  const ys = data.elements.flatMap((e) => [e.y, e.y + e.height]);
  if (!xs.length) return "0 0 100 100";
  const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const h = Math.max(...ys) - Math.min(...ys) + pad * 2;
  return `${minX} ${minY} ${w} ${h}`;
}
