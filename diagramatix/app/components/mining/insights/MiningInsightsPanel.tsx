"use client";

/**
 * DiagramatixMINER "Insights" — the analyst workbench over a mined run. Tabbed:
 * Heat (bottleneck/frequency colouring of the discovered model) and Variants
 * (Pareto + path isolation + compare). Later slices add Cases, Outcomes, Export.
 * Self-fetches the run's full detail (analytics + variants + kpiConfig) and the
 * discovered diagram data once, shared across tabs.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DiagramData } from "@/app/lib/diagram/types";
import type { RunAnalytics } from "@/app/lib/mining/analytics";
import type { Variant } from "@/app/lib/mining/types";
import { formatDuration, toMs, fromMs } from "@/app/lib/mining/analytics";
import { applyHeat, heatColor, HEAT_METRICS, type HeatMetric } from "@/app/lib/mining/heat";
import { variantPathIds, variantDiff, variantPareto } from "@/app/lib/mining/variantView";
import { buildRunners, pointAt } from "@/app/lib/mining/replayRunners";
import { computeOutcomes, type KpiConfig } from "@/app/lib/mining/outcomes";
import { ReplayDiagramBackdrop } from "@/app/components/simulation/replay/ReplayDiagramBackdrop";
import { ExpandedView } from "./ExpandedView";
import { DiagramatixThrobber } from "@/app/components/DiagramatixThrobber";

const EXPAND_BTN = "ml-auto text-[11px] rounded px-2 py-0.5 bg-stone-800 text-amber-200 hover:bg-stone-700";

interface RunLite { id: string; discoveredBpmnId: string | null; discoveredSmId: string | null }

type TabKey = "heat" | "variants" | "cases" | "outcomes" | "export";
const TABS: { key: TabKey; label: string }[] = [
  { key: "heat", label: "🔥 Insights" },
  { key: "variants", label: "🔀 Variants" },
  { key: "cases", label: "🎞 Cases" },
  { key: "outcomes", label: "🎯 Outcomes" },
  { key: "export", label: "⬇ Export" },
];

export function MiningInsightsPanel({ projectId, run }: { projectId: string; run: RunLite }) {
  const [tab, setTab] = useState<TabKey>("heat");
  const [analytics, setAnalytics] = useState<RunAnalytics | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [kpiConfig, setKpiConfig] = useState<KpiConfig | null>(null);
  const [bpmn, setBpmn] = useState<DiagramData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setAnalytics(null); setVariants([]); setKpiConfig(null); setBpmn(null);
    try {
      const rd = await fetch(`/api/projects/${projectId}/mining/runs/${run.id}`, { cache: "no-store" });
      const rj = rd.ok ? await rd.json() : null;
      setAnalytics((rj?.run?.analytics ?? null) as RunAnalytics | null);
      setVariants((rj?.run?.variants ?? []) as Variant[]);
      setKpiConfig((rj?.run?.kpiConfig ?? null) as KpiConfig | null);
      if (run.discoveredBpmnId) {
        const dd = await fetch(`/api/diagrams/${run.discoveredBpmnId}`, { cache: "no-store" });
        if (dd.ok) setBpmn(((await dd.json())?.data ?? null) as DiagramData | null);
      }
    } catch { /* best-effort */ }
    finally { setLoading(false); }
  }, [projectId, run.id, run.discoveredBpmnId]);

  const saveKpi = useCallback(async (kpi: KpiConfig) => {
    setKpiConfig(kpi);
    try {
      await fetch(`/api/projects/${projectId}/mining/runs/${run.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kpiConfig: kpi }),
      });
    } catch { /* best-effort */ }
  }, [projectId, run.id]);

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
      {tab === "cases" && <CasesTab analytics={analytics} variants={variants} bpmn={bpmn} hasBpmn={!!run.discoveredBpmnId} />}
      {tab === "outcomes" && <OutcomesTab analytics={analytics} variants={variants} kpiConfig={kpiConfig} onSave={saveKpi} />}
      {tab === "export" && <ExportTab projectId={projectId} runId={run.id} hasAnalytics={!!analytics && analytics.activities.length > 0} />}
    </div>
  );
}

// ── Export tab (Word / Excel / PDF) ──────────────────────────────────────────

function ExportTab({ projectId, runId, hasAnalytics }: { projectId: string; runId: string; hasAnalytics: boolean }) {
  if (!hasAnalytics) return <NoAnalytics />;
  const base = `/api/projects/${projectId}/mining/runs/${runId}/analysis-export`;
  const btn = "text-xs rounded px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white";
  return (
    <div>
      <p className="text-[11px] text-stone-400 mb-2">Download the full analysis — summary, bottleneck table, variant Pareto and the on-time/late outcomes — as a report.</p>
      <div className="flex items-center gap-2">
        <a className={btn} href={`${base}?format=docx`}>Word (.docx)</a>
        <a className={btn} href={`${base}?format=xlsx`}>Excel (.xlsx)</a>
        <a className={btn} href={`${base}?format=pdf`} target="_blank" rel="noopener">PDF</a>
      </div>
      <p className="text-[10px] text-stone-500 mt-2">PDF is rendered server-side (needs LibreOffice on the host); Word/Excel download directly.</p>
    </div>
  );
}

// ── Outcomes tab (KPI/SLA on-time vs late + drivers) ─────────────────────────

function OutcomesTab({ analytics, variants, kpiConfig, onSave }: { analytics: RunAnalytics | null; variants: Variant[]; kpiConfig: KpiConfig | null; onSave: (k: KpiConfig) => void }) {
  const unit = analytics?.clockUnit ?? "hour";
  // SLA in clock-units for the input; default to p90 cycle when unset.
  const initial = kpiConfig?.slaMs ?? analytics?.cycle.p90Ms ?? 0;
  const [slaVal, setSlaVal] = useState<number>(() => Math.round(fromMs(initial, unit) * 10) / 10);
  useEffect(() => { setSlaVal(Math.round(fromMs(kpiConfig?.slaMs ?? analytics?.cycle.p90Ms ?? 0, unit) * 10) / 10); }, [kpiConfig?.slaMs, analytics, unit]);

  if (!analytics || analytics.cases.length === 0) return <NoAnalytics />;

  const slaMs = toMs(slaVal || 0, unit);
  const report = computeOutcomes(analytics, variants, { slaMs });
  const saved = kpiConfig?.slaMs != null;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {/* SLA control + split */}
      <div>
        <div className="text-xs font-semibold text-amber-200 mb-1">Case SLA</div>
        <div className="flex items-center gap-2 text-[11px] mb-2">
          <span className="text-stone-400">A case is late when its cycle time exceeds</span>
          <input type="number" min={0} step="0.1" value={slaVal} onChange={(e) => setSlaVal(Number(e.target.value))}
            className="w-20 bg-stone-800 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs" />
          <span className="text-stone-400">{unit}s</span>
          <button onClick={() => onSave({ slaMs })} className="rounded px-2 py-1 bg-amber-700 hover:bg-amber-600 text-white">
            {saved ? "Update SLA" : "Save SLA"}
          </button>
        </div>
        {report && report.total > 0 && (
          <>
            <div className="flex h-5 rounded overflow-hidden border border-stone-700 text-[10px]">
              <div className="bg-emerald-600 flex items-center justify-center text-white" style={{ width: `${report.onTimePct}%` }}>
                {report.onTimePct >= 12 ? `${report.onTimePct.toFixed(0)}% on-time` : ""}
              </div>
              <div className="bg-rose-600 flex items-center justify-center text-white" style={{ width: `${100 - report.onTimePct}%` }}>
                {100 - report.onTimePct >= 12 ? `${(100 - report.onTimePct).toFixed(0)}% late` : ""}
              </div>
            </div>
            <div className="text-[11px] text-stone-400 mt-1">
              <span className="text-emerald-300">{report.onTime} on-time</span> · <span className="text-rose-300">{report.late} late</span> of {report.total} cases
            </div>
          </>
        )}
      </div>

      {/* Drivers of lateness */}
      <div>
        <div className="text-xs font-semibold text-amber-200 mb-1">What drives late cases</div>
        {report && report.late > 0 ? (
          <>
            {report.activityDrivers.length > 0 && (
              <table className="w-full text-[11px] mb-2">
                <thead><tr className="text-stone-500 text-left"><th className="font-normal">Step</th><th className="font-normal text-right">Late rate</th><th className="font-normal text-right">×avg</th></tr></thead>
                <tbody>
                  {report.activityDrivers.slice(0, 6).map((d) => (
                    <tr key={d.activity} className="border-b border-stone-800">
                      <td className="py-1 pr-2 text-stone-200 truncate max-w-[9rem]" title={d.activity}>{d.activity}</td>
                      <td className="py-1 text-right text-stone-300 tabular-nums">{(d.lateRate * 100).toFixed(0)}%</td>
                      <td className="py-1 text-right text-rose-300 tabular-nums">{d.lift.toFixed(1)}×</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="text-[10px] text-stone-500 mb-1">Variants most over-represented in late cases</div>
            <table className="w-full text-[11px]">
              <tbody>
                {report.variantDrivers.slice(0, 5).map((d) => (
                  <tr key={d.variantIdx} className="border-b border-stone-800">
                    <td className="py-1 pr-2 text-stone-300">variant #{d.variantIdx + 1}</td>
                    <td className="py-1 pr-2 text-stone-500">{d.late}/{d.cases} late</td>
                    <td className="py-1 text-right text-rose-300 tabular-nums">{d.lift.toFixed(1)}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : <p className="text-[11px] text-stone-400">{report && report.total > 0 ? "No late cases at this SLA. 🎉" : "Set an SLA to see the split."}</p>}
      </div>
    </div>
  );
}

/** Read-only fitted SVG of a diagram. `emphasize` fades everything not in the set
 *  (variant/case highlight in context); `visibleIds` hides everything not in it.
 *  `captions` draws a small line of text under matching elements (e.g. the mined
 *  time + team, so the "simulation data" is visible under each element). */
function ModelSvg({ data, visibleIds, emphasize, captions, maxVh = 46 }: { data: DiagramData; visibleIds?: Set<string>; emphasize?: Set<string>; captions?: Map<string, string>; maxVh?: number }) {
  const viewBox = useMemo(() => boundsViewBox(data), [data]);
  return (
    <div className="bg-stone-100 rounded border border-stone-700 overflow-hidden">
      <svg viewBox={viewBox} className="w-full" style={{ maxHeight: `${maxVh}vh` }} preserveAspectRatio="xMidYMid meet">
        <ReplayDiagramBackdrop data={data} visibleIds={visibleIds} emphasize={emphasize} />
        {captions && data.elements.map((el) => {
          const t = captions.get(el.id);
          if (!t) return null;
          return <text key={`cap-${el.id}`} x={el.x + el.width / 2} y={el.y + el.height + 11} textAnchor="middle" fontSize={9} fontWeight={600} fill="#1e40af" style={{ pointerEvents: "none" }}>{t}</text>;
        })}
      </svg>
    </div>
  );
}

// ── Heat tab ────────────────────────────────────────────────────────────────

function HeatTab({ analytics, bpmn, hasBpmn, loading }: { analytics: RunAnalytics | null; bpmn: DiagramData | null; hasBpmn: boolean; loading: boolean }) {
  const [metric, setMetric] = useState<HeatMetric>("totalTime");
  const [expanded, setExpanded] = useState(false);
  const [showData, setShowData] = useState(true);
  const heated = useMemo(() => (bpmn && analytics ? applyHeat(bpmn, analytics, metric) : null), [bpmn, analytics, metric]);
  // The mined "simulation data" per task — median time-in-step + dominant team —
  // shown as a caption under each element (matched by activity label).
  const captions = useMemo(() => {
    if (!bpmn || !analytics) return undefined;
    const byAct = new Map(analytics.activities.map((a) => [a.activity, a]));
    const m = new Map<string, string>();
    for (const el of bpmn.elements) {
      const a = byAct.get((el.label ?? "").trim());
      if (a) m.set(el.id, `${formatDuration(a.medianDurMs, analytics.clockUnit)}${a.dominantResource ? " · " + a.dominantResource : ""}`);
    }
    return m;
  }, [bpmn, analytics]);
  const metricOf = HEAT_METRICS.find((m) => m.key === metric)!.of;
  const fmt = useCallback((v: number) => (metric === "frequency" ? String(v) : analytics ? formatDuration(v, analytics.clockUnit) : String(v)), [metric, analytics]);

  if (!hasBpmn) return <NeedBpmn what="heat map" />;
  if (loading && !analytics) return <p className="text-[11px] text-stone-500">Loading analytics…</p>;
  if (!analytics || analytics.activities.length === 0) return <NoAnalytics />;

  const top = [...analytics.activities].sort((a, b) => metricOf(b) - metricOf(a)).slice(0, 8);
  const maxV = Math.max(1, ...analytics.activities.map(metricOf));

  if (expanded) return (
    <ExpandedView title="Insights — bottleneck heat" data={heated} captions={showData ? captions : undefined} onClose={() => setExpanded(false)}>
      <table className="w-full text-[11px]">
        <thead><tr className="text-stone-500 text-left"><th></th><th className="font-normal">Step</th><th className="font-normal text-right">{HEAT_METRICS.find((m) => m.key === metric)!.label}</th><th className="font-normal text-right">Cases</th></tr></thead>
        <tbody>
          {[...analytics.activities].sort((a, b) => metricOf(b) - metricOf(a)).map((a) => { const v = metricOf(a); return (
            <tr key={a.activity} className="border-b border-stone-800">
              <td className="py-1 pr-1"><span className="inline-block w-2.5 h-2.5 rounded-sm align-middle" style={{ background: heatColor(v / maxV) }} /></td>
              <td className="py-1 pr-2 text-stone-200">{a.activity}</td>
              <td className="py-1 text-right text-stone-300 tabular-nums">{fmt(v)}</td>
              <td className="py-1 text-right text-stone-400 tabular-nums">{a.caseFreq}</td>
            </tr>); })}
        </tbody>
      </table>
    </ExpandedView>
  );

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
          <button onClick={() => setShowData((s) => !s)} title="Show the mined time + team under each task"
            className={`text-[11px] rounded px-2 py-0.5 ${showData ? "bg-blue-800 text-white" : "bg-stone-800 text-stone-300 hover:bg-stone-700"}`}>🏷 time · team</button>
          <button onClick={() => setExpanded(true)} className={EXPAND_BTN}>⤢ Expand</button>
        </div>
        {heated && <ModelSvg data={heated} captions={showData ? captions : undefined} />}
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
  const [expanded, setExpanded] = useState(false);
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

  if (expanded) return (
    <ExpandedView title={visibleIds ? "Variants — selected path(s) isolated" : "Variants — discovered model"} data={bpmn} visibleIds={visibleIds} onClose={() => setExpanded(false)}>
      <table className="w-full text-[11px]">
        <thead><tr className="text-stone-500 text-left"><th className="font-normal">#</th><th className="font-normal text-right">Cases</th><th className="font-normal text-right">Share</th><th className="font-normal text-right">Cum</th><th className="font-normal">Path</th></tr></thead>
        <tbody>
          {pareto.map((r) => (
            <tr key={r.idx} className={`border-b border-stone-800 cursor-pointer ${focus === r.idx ? "bg-amber-600/20" : "hover:bg-stone-800"}`} onClick={() => setFocus(focus === r.idx ? null : r.idx)}>
              <td className="py-1 pr-2 text-stone-400">#{r.idx + 1}</td>
              <td className="py-1 pr-2 text-right text-stone-200 tabular-nums">{r.count}</td>
              <td className="py-1 pr-2 text-right text-stone-500 tabular-nums">{(r.share * 100).toFixed(1)}%</td>
              <td className="py-1 pr-2 text-right text-stone-600 tabular-nums">{(r.cumulative * 100).toFixed(0)}%</td>
              <td className="py-1 text-stone-300">{r.events.join(" → ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ExpandedView>
  );

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {/* Pareto list */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-semibold text-amber-200">Variants ({variants.length}) — most frequent first</div>
          <div className="flex items-center gap-2">
            {checked.size > 0 && <button onClick={() => setChecked(new Set())} className="text-[10px] text-amber-300 hover:text-amber-200 underline">clear</button>}
            <button onClick={() => setExpanded(true)} className="text-[11px] rounded px-2 py-0.5 bg-stone-800 text-amber-200 hover:bg-stone-700">⤢ Expand</button>
          </div>
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
        {checked.size !== 2 && <p className="mt-1 text-[10px] text-stone-500">Click a variant to highlight its path on the model; tick two to compare.</p>}
      </div>

      {/* Right: the FULL model, with the selected variant's path (+ its numbers)
          emphasised and everything else faded. */}
      <div>
        {!hasBpmn ? <NeedBpmn what="path view" /> : bpmn ? (
          <>
            <div className="text-xs font-semibold text-amber-200 mb-1">
              {visibleIds ? (focus != null ? `Variant #${focus + 1} highlighted — ${variants[focus].count} cases` : "Selected path(s) highlighted") : "Full discovered model"}
            </div>
            <ModelSvg data={bpmn} emphasize={visibleIds} />
          </>
        ) : <p className="text-[11px] text-stone-500">Loading model…</p>}
      </div>
    </div>
  );
}

// ── Cases tab (list + drill-down + log replay) ───────────────────────────────

function CasesTab({ analytics, variants, bpmn, hasBpmn }: { analytics: RunAnalytics | null; variants: Variant[]; bpmn: DiagramData | null; hasBpmn: boolean }) {
  const [sortDesc, setSortDesc] = useState(true);
  const [variantFilter, setVariantFilter] = useState<number | "all">("all");
  const [selected, setSelected] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(() => {
    if (!analytics) return [];
    let cs = analytics.cases;
    if (variantFilter !== "all") cs = cs.filter((c) => c.variantIdx === variantFilter);
    return [...cs].sort((a, b) => (sortDesc ? b.cycleMs - a.cycleMs : a.cycleMs - b.cycleMs)).slice(0, 60);
  }, [analytics, sortDesc, variantFilter]);

  if (!analytics || analytics.cases.length === 0) return <NoAnalytics />;
  const fmt = (ms: number) => formatDuration(ms, analytics.clockUnit);
  const sel = selected != null ? analytics.cases.find((c) => c.idx === selected) : null;
  // Highlight the selected case's variant path — or, if none selected, the filtered
  // variant's path — on the FULL model (emphasise in context). Works inline + expanded.
  const emphVariantIdx = sel ? sel.variantIdx : variantFilter !== "all" ? variantFilter : null;
  const emphPath = bpmn && emphVariantIdx != null ? variantPathIds(bpmn, variants[emphVariantIdx]?.events ?? []) : undefined;

  if (expanded) return (
    <ExpandedView title={sel ? `Cases — case ${sel.caseId} (variant #${sel.variantIdx + 1})` : emphVariantIdx != null ? `Cases — variant #${emphVariantIdx + 1}` : "Cases — discovered model"} data={bpmn} emphasize={emphPath} onClose={() => setExpanded(false)}>
      <table className="w-full text-[11px]">
        <thead><tr className="text-stone-500 text-left"><th className="font-normal">Case</th><th className="font-normal">Variant</th><th className="font-normal text-right">Steps</th><th className="font-normal text-right">Cycle</th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.idx} onClick={() => setSelected(selected === c.idx ? null : c.idx)} className={`cursor-pointer border-b border-stone-800 ${selected === c.idx ? "bg-amber-600/20" : "hover:bg-stone-800"}`}>
              <td className="py-1 pr-2 text-stone-300">{c.caseId}</td>
              <td className="py-1 pr-2 text-stone-500">#{c.variantIdx + 1}</td>
              <td className="py-1 pr-2 text-right text-stone-500">{c.events}</td>
              <td className="py-1 text-right text-stone-200 tabular-nums">{fmt(c.cycleMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ExpandedView>
  );

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {/* Replay — with the selected case's / variant's path emphasised */}
      <div>
        {hasBpmn && bpmn ? <CaseReplay data={bpmn} variants={variants} emphasize={emphPath} /> : <NeedBpmn what="replay" />}
      </div>
      {/* Case list */}
      <div>
        <div className="flex items-center gap-2 mb-1 text-[11px]">
          <span className="text-xs font-semibold text-amber-200">Cases</span>
          <span className="text-stone-500">{analytics.totalCases}{analytics.capped ? " (sampled)" : ""}</span>
          <button onClick={() => setExpanded(true)} className="ml-auto rounded px-2 py-0.5 bg-stone-800 text-amber-200 hover:bg-stone-700">⤢ Expand</button>
          <button onClick={() => setSortDesc((s) => !s)} className="rounded px-2 py-0.5 bg-stone-800 hover:bg-stone-700 text-stone-300">
            cycle {sortDesc ? "↓ longest" : "↑ shortest"}
          </button>
          <select value={String(variantFilter)} onChange={(e) => setVariantFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="bg-stone-800 border border-stone-600 rounded px-1 py-0.5 text-stone-100">
            <option value="all">all variants</option>
            {variants.map((_, i) => <option key={i} value={i}>variant #{i + 1}</option>)}
          </select>
        </div>
        <div className="max-h-[44vh] overflow-auto">
          <table className="w-full text-[11px]">
            <tbody>
              {rows.map((c) => (
                <tr key={c.idx} onClick={() => setSelected(selected === c.idx ? null : c.idx)}
                  className={`cursor-pointer border-b border-stone-800 ${selected === c.idx ? "bg-amber-600/20" : "hover:bg-stone-800"}`}>
                  <td className="py-1 pr-2 text-stone-300 truncate max-w-[8rem]" title={c.caseId}>{c.caseId}</td>
                  <td className="py-1 pr-2 text-stone-500">#{c.variantIdx + 1}</td>
                  <td className="py-1 pr-2 text-stone-500">{c.events} steps</td>
                  <td className="py-1 text-right text-stone-200 tabular-nums whitespace-nowrap">{fmt(c.cycleMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sel && (
          <div className="mt-2 rounded border border-stone-700 p-2 text-[11px]">
            <div className="font-semibold text-amber-200 mb-0.5">Case {sel.caseId}</div>
            <div className="text-stone-400">cycle {fmt(sel.cycleMs)} · {sel.events} steps · variant #{sel.variantIdx + 1}</div>
            <div className="text-[10px] text-stone-400 mt-1">{(variants[sel.variantIdx]?.events ?? []).join(" → ")}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Self-contained log-replay: tokens flow over the discovered model, weighted by
 *  variant frequency. Reuses ReplayDiagramBackdrop as the backdrop; no simulator. */
function CaseReplay({ data, variants, emphasize }: { data: DiagramData; variants: Variant[]; emphasize?: Set<string> }) {
  const runners = useMemo(() => buildRunners(data, variants), [data, variants]);
  const [playing, setPlaying] = useState(true);
  const [t, setT] = useState(0);
  const raf = useRef(0);
  const last = useRef<number | null>(null);
  const PERIOD = 9000; // ms for one full timeline sweep

  useEffect(() => {
    if (!playing) { last.current = null; return; }
    const step = (now: number) => {
      if (last.current != null) { const dt = now - last.current; setT((prev) => (prev + dt / PERIOD) % 1); }
      last.current = now;
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf.current); last.current = null; };
  }, [playing]);

  const viewBox = useMemo(() => boundsViewBox(data), [data]);
  const tokens = runners.map((r, i) => {
    const local = (t - r.start) / r.dur;
    if (local < 0 || local > 1) return null;
    const p = pointAt(r.points, local);
    return <circle key={i} cx={p.x} cy={p.y} r={7} fill="#f59e0b" fillOpacity={0.85} stroke="#78350f" strokeWidth={1} />;
  });

  return (
    <>
      <div className="flex items-center gap-2 mb-1">
        <button onClick={() => setPlaying((p) => !p)} className="text-[11px] rounded px-2 py-0.5 bg-amber-700 hover:bg-amber-600 text-white">
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <span className="text-[10px] text-stone-400">{runners.length} case flows (top variants)</span>
      </div>
      <div className="bg-stone-100 rounded border border-stone-700 overflow-hidden">
        <svg viewBox={viewBox} className="w-full" style={{ maxHeight: "50vh" }} preserveAspectRatio="xMidYMid meet">
          <ReplayDiagramBackdrop data={data} emphasize={emphasize} />
          {tokens}
        </svg>
      </div>
    </>
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
