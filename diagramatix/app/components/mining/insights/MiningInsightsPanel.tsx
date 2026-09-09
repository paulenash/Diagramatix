"use client";

/**
 * DiagramatixMINER "Insights" — the analyst workbench over a mined run. Tabbed:
 * Heat (bottleneck/frequency colouring of the discovered model) and Variants
 * (Pareto + path isolation + compare). Later slices add Cases, Outcomes, Export.
 * Self-fetches the run's full detail (analytics + variants + kpiConfig) and the
 * discovered diagram data once, shared across tabs.
 *
 * Every tab reads its numbers through `useRunView` rather than from the fetched
 * analytics directly. That seam is what a filter will one day change in ONE
 * place instead of six — and what stops a filtered figure ever sitting beside an
 * unfiltered one without saying so.
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
import { automationOpportunities, taskAutomationScore, buildAutomationSpec, automationRoi } from "@/app/lib/mining/taskMining/automation";
import { isTaskRun, detectReworkActivities, pingPongFromVariants } from "@/app/lib/mining/taskMining/insights";
import { buildTaskProcedure } from "@/app/lib/mining/taskMining/procedure";
import { ReplayDiagramBackdrop } from "@/app/components/simulation/replay/ReplayDiagramBackdrop";
import { transitionRows, MIN_EDGE_OBS } from "@/app/lib/mining/handover";
import { evidenceFor, caseTimeline, casesCsv } from "@/app/lib/mining/caseEvidence";
import { computeTeamFlow } from "@/app/lib/mining/teamFlow";
import type { ConformanceResult } from "@/app/lib/mining/transitionConformance";
import { useRunView, exactnessLabel, exactnessTone } from "./useRunView";
import { FilterBar } from "./FilterBar";
import { EMPTY_FILTER, type MiningFilter } from "@/app/lib/mining/filterAnalytics";
import { ExpandedView } from "./ExpandedView";
import { DiagramatixThrobber } from "@/app/components/DiagramatixThrobber";

const EXPAND_BTN = "ml-auto text-[11px] rounded px-2 py-0.5 bg-stone-800 text-amber-200 hover:bg-stone-700";

interface RunLite { id: string; discoveredBpmnId: string | null; discoveredSmId: string | null }

type TabKey = "tasks" | "activities" | "between" | "heat" | "teams" | "variants" | "cases" | "conformance" | "outcomes" | "export";
const TASK_TAB: { key: TabKey; label: string } = { key: "tasks", label: "🤖 Automation" };
const TABS: { key: TabKey; label: string }[] = [
  { key: "activities", label: "📋 Activities" },
  { key: "between", label: "⏳ Between steps" },
  { key: "heat", label: "🔥 Insights" },
  { key: "teams", label: "👥 Teams" },
  { key: "variants", label: "🔀 Variants" },
  { key: "cases", label: "🎞 Cases" },
  { key: "conformance", label: "⚖ Deviations" },
  { key: "outcomes", label: "🎯 Outcomes" },
  { key: "export", label: "⬇ Export" },
];

/** What each tab's figures are made of, and therefore what they may claim
 *  under a filter. Counts filter from the case index alone; timings need the
 *  per-event vectors, which not every run carries. */
const TAB_SHAPE: Record<TabKey, "count" | "time"> = {
  tasks: "time", activities: "time", between: "time", heat: "time", teams: "time",
  variants: "count", cases: "count", conformance: "count", outcomes: "count", export: "count",
};

export function MiningInsightsPanel({ projectId, run }: { projectId: string; run: RunLite }) {
  const [tab, setTab] = useState<TabKey>("activities");
  const [filter, setFilter] = useState<MiningFilter>(EMPTY_FILTER);
  const [analytics, setAnalytics] = useState<RunAnalytics | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [kpiConfig, setKpiConfig] = useState<KpiConfig | null>(null);
  const [bpmn, setBpmn] = useState<DiagramData | null>(null);
  const [conformance, setConformance] = useState<ConformanceResult | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setAnalytics(null); setVariants([]); setKpiConfig(null); setBpmn(null); setConformance(null);
    try {
      const rd = await fetch(`/api/projects/${projectId}/mining/runs/${run.id}`, { cache: "no-store" });
      const rj = rd.ok ? await rd.json() : null;
      setAnalytics((rj?.run?.analytics ?? null) as RunAnalytics | null);
      setVariants((rj?.run?.variants ?? []) as Variant[]);
      setKpiConfig((rj?.run?.kpiConfig ?? null) as KpiConfig | null);
      setConformance((rj?.run?.conformance ?? null) as ConformanceResult | null);
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

  // Task run? (UI-step vocabulary). If so, surface the Automation tab first and
  // open into it once — a task run's headline is its automation potential.
  const isTask = useMemo(() => isTaskRun(variants), [variants]);
  const autoSwitched = useRef(false);
  useEffect(() => { if (isTask && !autoSwitched.current) { autoSwitched.current = true; setTab("tasks"); } }, [isTask]);
  const visibleTabs = isTask ? [TASK_TAB, ...TABS] : TABS;

  // THE SEAM. Every panel below reads its numbers through this, never from
  // `analytics` directly — see useRunView for why. The filter arrived in
  // Phase 5 and this line is the only place any panel had to learn about it.
  const view = useRunView(analytics, variants, filter);
  // The chip beside the active tab: what THESE figures are entitled to claim.
  const exactness = TAB_SHAPE[tab] === "time" ? view.timeExactness : view.countExactness;
  const chip = exactnessLabel(exactness);

  return (
    <div className="mt-4 pt-3 border-t border-stone-700">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {visibleTabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`text-xs rounded px-2.5 py-1 ${tab === t.key ? "bg-amber-700 text-white" : "bg-stone-800 text-stone-300 hover:bg-stone-700"}`}>
            {t.label}
          </button>
        ))}
        {loading && <DiagramatixThrobber size={16} tone="amber" />}
        {chip && (
          <span className={`text-[10px] rounded px-1.5 py-0.5 border ${exactnessTone(exactness)}`}
            title={exactness === "unfiltered"
              ? "This run cannot narrow timings, so the whole-run figures are shown"
              : exactness === "estimated"
                ? "Scaled from the stored sample of cases"
                : "These figures describe only the filtered cases"}>
            {chip}
          </span>
        )}
      </div>
      <FilterBar analytics={analytics} filter={filter} onChange={setFilter} view={view} />
      {tab === "tasks" && <TasksTab variants={view.variants} loading={loading} projectId={projectId} runId={run.id} />}
      {tab === "activities" && <ActivitiesTab analytics={view.analytics} loading={loading} />}
      {tab === "between" && <BetweenStepsTab analytics={view.analytics} loading={loading} />}
      {tab === "heat" && <HeatTab analytics={view.analytics} bpmn={bpmn} hasBpmn={!!run.discoveredBpmnId} loading={loading} />}
      {tab === "teams" && <TeamsTab analytics={view.analytics} variants={view.variants} loading={loading} />}
      {tab === "variants" && <VariantsTab variants={view.variants} bpmn={bpmn} hasBpmn={!!run.discoveredBpmnId} />}
      {tab === "cases" && <CasesTab analytics={view.analytics} variants={view.variants} bpmn={bpmn} hasBpmn={!!run.discoveredBpmnId} />}
      {tab === "conformance" && <ConformanceTab analytics={view.analytics} variants={view.variants} conformance={conformance} loading={loading} projectId={projectId} runId={run.id} onRecomputed={() => void load()} />}
      {tab === "outcomes" && <OutcomesTab analytics={view.analytics} variants={view.variants} kpiConfig={kpiConfig} onSave={saveKpi} />}
      {tab === "export" && <ExportTab projectId={projectId} runId={run.id} filter={filter} filterNote={view.description} hasAnalytics={!!analytics && analytics.activities.length > 0} />}
    </div>
  );
}

// ── Automation tab (Task Mining: opportunities + rework + RPA spec) ──────────

const verdictColor = (v: "high" | "medium" | "low") => (v === "high" ? "#86efac" : v === "medium" ? "#fcd34d" : "#94a3b8");

function TasksTab({ variants, loading, projectId, runId }: { variants: Variant[]; loading: boolean; projectId: string; runId: string }) {
  const [copied, setCopied] = useState(false);
  const opps = useMemo(() => automationOpportunities(variants), [variants]);
  const score = useMemo(() => taskAutomationScore(variants), [variants]);
  const rework = useMemo(() => detectReworkActivities(variants), [variants]);
  const bounces = useMemo(() => pingPongFromVariants(variants), [variants]);
  // Item 07. Six seconds a step was a reasonable default and an unarguable
  // number: a reader who thinks their steps take fifteen has no way to say so,
  // and the whole ROI rests on it. Making it editable turns "we assume 6s"
  // from a caveat into a control.
  const [secondsPerStep, setSecondsPerStep] = useState(6);
  const roi = useMemo(() => automationRoi(variants, { secondsPerStep }), [variants, secondsPerStep]);
  const spec = useMemo(() => buildAutomationSpec(variants, "this task"), [variants]);
  const sop = useMemo(() => buildTaskProcedure(variants, "Enter Invoice"), [variants]);

  if (loading && variants.length === 0) return <p className="text-[11px] text-stone-500">Loading routine…</p>;
  if (variants.length === 0) return <p className="text-[11px] text-stone-400">No routine variants to analyse.</p>;

  const copySpec = () => { navigator.clipboard?.writeText(spec).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };
  const downloadText = (text: string, name: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {/* Headline score + rework */}
      <div>
        <div className="text-xs font-semibold text-amber-200 mb-1">Automation opportunity</div>
        <div className="flex items-center gap-3 mb-2">
          <div className="text-3xl tabular-nums" style={{ color: verdictColor(score.verdict) }}>{(score.score * 100).toFixed(0)}%</div>
          <div className="text-[11px]">
            <div className="uppercase tracking-wide font-semibold" style={{ color: verdictColor(score.verdict) }}>{score.verdict} potential</div>
            <div className="text-stone-400">{bounces} app ping-pong bounce{bounces === 1 ? "" : "s"} (Excel ↔ web form, etc.)</div>
          </div>
        </div>
        {/* ROI estimate */}
        <div className="rounded border border-stone-700 bg-stone-800/40 p-2 mb-3 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-stone-400">Est. time automatable</span>
            <span className="tabular-nums font-semibold text-emerald-300">{(roi.savedPct * 100).toFixed(0)}%</span>
          </div>
          <div className="text-[10px] text-stone-500 mt-0.5">
            ~{roi.currentHours.toFixed(1)}h of handling across {roi.cases} case{roi.cases === 1 ? "" : "s"} → ~{roi.savedHours.toFixed(1)}h saved ({roi.automatableCases} automatable). Scales with volume.
          </div>
          <label className="flex items-center gap-1.5 mt-1 text-[10px] text-stone-400">
            <span>Assume</span>
            <input type="number" min={1} max={120} value={secondsPerStep}
              onChange={(e) => setSecondsPerStep(Math.max(1, Math.min(120, Number(e.target.value) || 1)))}
              className="w-14 bg-stone-800 border border-stone-600 rounded px-1 py-0.5 text-stone-100 tabular-nums" />
            <span>seconds per step</span>
            {secondsPerStep !== 6 && (
              <button onClick={() => setSecondsPerStep(6)} className="text-amber-300 hover:text-amber-200 underline">reset</button>
            )}
            <span className="text-stone-600">· the saving above is entirely proportional to this</span>
          </label>
        </div>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <button onClick={copySpec} className="text-[11px] rounded px-2.5 py-1 bg-amber-700 hover:bg-amber-600 text-white">{copied ? "Copied ✓" : "Copy RPA spec"}</button>
          <button onClick={() => downloadText(spec, "automation-spec.md")} className="text-[11px] rounded px-2.5 py-1 bg-stone-800 text-amber-200 hover:bg-stone-700">RPA spec .md</button>
          {/* Item 08. The SOP was the only document in the product that did not
              go out through buildDocx, so somebody handed one could not tell it
              came from the same tool. Produced server-side now — which is also
              the boundary that lets `task-mining` finally be enforced. */}
          <a href={`/api/projects/${projectId}/mining/runs/${runId}/task-sop?format=docx`}
            className="text-[11px] rounded px-2.5 py-1 bg-amber-700 hover:bg-amber-600 text-white">SOP (.docx)</a>
          <a href={`/api/projects/${projectId}/mining/runs/${runId}/task-sop?format=pdf`} target="_blank" rel="noopener"
            className="text-[11px] rounded px-2.5 py-1 bg-stone-800 text-amber-200 hover:bg-stone-700">SOP (PDF)</a>
          <button onClick={() => downloadText(sop, "task-sop.md")} className="text-[11px] rounded px-2.5 py-1 bg-stone-800 text-amber-200 hover:bg-stone-700">SOP .md</button>
        </div>
        <div className="text-xs font-semibold text-amber-200 mb-1">Rework — repeated work steps</div>
        {rework.length ? (
          <table className="w-full text-[11px]"><tbody>
            {rework.map((r) => (
              <tr key={r.activity} className="border-b border-stone-800">
                <td className="py-1 pr-2 text-stone-200">{r.activity}</td>
                <td className="py-1 text-right text-rose-300 tabular-nums whitespace-nowrap">redone in {r.cases} case{r.cases === 1 ? "" : "s"}</td>
              </tr>
            ))}
          </tbody></table>
        ) : <p className="text-[11px] text-stone-400">No repeated steps — no rework detected.</p>}
      </div>

      {/* Candidate routines (RPA recipe) */}
      <div>
        <div className="text-xs font-semibold text-amber-200 mb-1">Candidate routines</div>
        <div className="max-h-[48vh] overflow-auto pr-1 space-y-2">
          {opps.map((o, i) => (
            <div key={o.variantIndex} className="rounded border border-stone-700 p-2">
              <div className="flex items-center gap-2 text-[11px] mb-1">
                <span className="text-stone-400">#{i + 1}</span>
                <span className="tabular-nums font-semibold" style={{ color: verdictColor(o.verdict) }}>{(o.score * 100).toFixed(0)}% {o.verdict}</span>
                <span className="text-stone-300 tabular-nums">{o.cases} case{o.cases === 1 ? "" : "s"} · {(o.share * 100).toFixed(0)}%</span>
              </div>
              <div className="text-[10px] text-stone-500 mb-1">{o.reason}</div>
              {i === 0 && (
                <ol className="text-[10px] text-stone-300 list-decimal ml-4 space-y-0.5">
                  {o.steps.map((s, si) => <li key={si}>{s}</li>)}
                </ol>
              )}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-stone-500 mt-1">The #1 routine is the strongest RPA candidate — its steps are the recipe. “Copy RPA spec” exports it.</p>
      </div>
    </div>
  );
}

// ── Export tab (Word / Excel / PDF) ──────────────────────────────────────────

function ExportTab({ projectId, runId, filter, filterNote, hasAnalytics }: { projectId: string; runId: string; filter: MiningFilter; filterNote: string | null; hasAnalytics: boolean }) {
  if (!hasAnalytics) return <NoAnalytics />;
  // The report is built server-side, so the slice has to travel with the
  // request. A report that silently described the whole run while the screen
  // showed a slice would be the same defect as a mixed page, except in a file
  // that gets forwarded to people who never saw the screen.
  const q = new URLSearchParams();
  if (filter.from != null) q.set("from", String(filter.from));
  if (filter.to != null) q.set("to", String(filter.to));
  if (filter.resource) q.set("resource", filter.resource);
  for (const [k, v] of Object.entries(filter.attrs ?? {})) q.set(`attr.${k}`, v);
  const qs = q.toString();
  const base = `/api/projects/${projectId}/mining/runs/${runId}/analysis-export`;
  const href = (format: string) => `${base}?format=${format}${qs ? `&${qs}` : ""}`;
  const btn = "text-xs rounded px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white";
  return (
    <div>
      <p className="text-[11px] text-stone-400 mb-2">Download the full analysis — summary, bottleneck table, variant Pareto and the on-time/late outcomes — as a report.</p>
      {filterNote && (
        <p className="text-[11px] text-amber-200 mb-2">
          The report will cover <span className="text-amber-100">{filterNote}</span> only, and will say so on its first page.
        </p>
      )}
      <div className="flex items-center gap-2">
        <a className={btn} href={href("docx")}>Word (.docx)</a>
        <a className={btn} href={href("xlsx")}>Excel (.xlsx)</a>
        <a className={btn} href={href("pdf")} target="_blank" rel="noopener">PDF</a>
      </div>
      <p className="text-[10px] text-stone-500 mt-2">PDF is rendered server-side (needs LibreOffice on the host); Word/Excel download directly.</p>
    </div>
  );
}

/** Hand the browser a file built in memory. Revoked immediately: the blob is
 *  only needed for the duration of the click. */
function downloadText(name: string, text: string, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
// ── Teams tab (who hands work to whom, and who repeats themselves) ──────────

function TeamsTab({ analytics, variants, loading }: { analytics: RunAnalytics | null; variants: Variant[]; loading: boolean }) {
  const flow = useMemo(() => computeTeamFlow(analytics, variants), [analytics, variants]);
  if (loading && !analytics) return <p className="text-[11px] text-stone-500">Loading…</p>;
  if (!analytics) return <NoAnalytics />;
  const unit = analytics.clockUnit;
  const fmt = (ms: number) => formatDuration(ms, unit);
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

  return (
    <div className="flex flex-col gap-3">
      {/* What this map is allowed to claim, before the map. An approximate map
          read as measured is worse than no map, because it invents hand-offs on
          exactly the activities more than one team performs. */}
      {flow.note && (
        <p className={`text-[11px] leading-relaxed ${flow.basis === "none" ? "text-stone-400" : "text-amber-300"}`}>
          {flow.basis !== "none" && "⚠ "}{flow.note}
        </p>
      )}

      {flow.handovers.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-amber-200 mb-1">
            Hand-offs between teams
            {flow.basis === "approximate" && <span className="ml-2 text-[10px] rounded px-1.5 py-0.5 border border-amber-700/50 bg-amber-900/30 text-amber-200">approximate</span>}
          </div>
          <div className="overflow-x-auto max-h-[30vh]">
            <table className="w-full text-[11px]">
              <thead className="text-stone-400 text-left sticky top-0 bg-stone-900">
                <tr>
                  <th className="font-normal py-1 pr-3">From</th>
                  <th className="font-normal py-1 pr-3">To</th>
                  <th className="font-normal py-1 pr-2 text-right">Times</th>
                  <th className="font-normal py-1 pr-2 text-right">Median wait</th>
                  <th className="font-normal py-1 text-right">Total waiting</th>
                </tr>
              </thead>
              <tbody>
                {flow.handovers.map((h, i) => (
                  <tr key={i} className="border-b border-stone-800 hover:bg-stone-800/60">
                    <td className="py-1 pr-3 text-stone-200">{h.from}</td>
                    <td className="py-1 pr-3 text-stone-200">{h.to}</td>
                    <td className="py-1 pr-2 text-right text-stone-400 tabular-nums">{h.count.toLocaleString()}</td>
                    <td className="py-1 pr-2 text-right text-stone-300 tabular-nums whitespace-nowrap">
                      {h.medianGapMs === null ? <span className="text-stone-600" title="Not measurable without per-event teams">—</span> : fmt(h.medianGapMs)}
                    </td>
                    <td className="py-1 text-right text-amber-200 tabular-nums whitespace-nowrap">{fmt(h.totalGapMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-stone-500 mt-1">The wait is the gap between one team&rsquo;s last step and the next team&rsquo;s first — the part of the process nobody owns.</p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {flow.loads.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-amber-200 mb-1">Workload</div>
            <table className="w-full text-[11px]">
              <tbody>
                {flow.loads.map((l) => (
                  <tr key={l.team} className="border-b border-stone-800">
                    <td className="py-1 pr-2 text-stone-200">{l.team}</td>
                    <td className="py-1 pr-2 text-stone-500 tabular-nums">{l.events.toLocaleString()} steps</td>
                    <td className="py-1 pr-2 text-stone-400 tabular-nums whitespace-nowrap">{fmt(l.totalTimeMs)}</td>
                    <td className="py-1 text-right text-amber-200 tabular-nums">{pct(l.share)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div>
          <div className="text-xs font-semibold text-amber-200 mb-1">Passed back and forth</div>
          {flow.pingPong.length === 0
            ? <p className="text-[11px] text-stone-500">{flow.basis === "exact" ? "No case comes back to a team it had already left." : "Not measurable on this run."}</p>
            : (
              <table className="w-full text-[11px]">
                <tbody>
                  {flow.pingPong.map((p, i) => (
                    <tr key={i} className="border-b border-stone-800">
                      <td className="py-1 pr-2 text-stone-200">{p.a} ↔ {p.b}</td>
                      <td className="py-1 pr-2 text-stone-400 tabular-nums">{p.bounces.toLocaleString()} bounces</td>
                      <td className="py-1 text-right text-stone-500 tabular-nums">{p.cases.toLocaleString()} cases</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

          <div className="text-xs font-semibold text-amber-200 mt-3 mb-1">Done more than once</div>
          {flow.rework.length === 0
            ? <p className="text-[11px] text-stone-500">No step repeats within a case.</p>
            : (
              <table className="w-full text-[11px]">
                <tbody>
                  {flow.rework.map((r) => (
                    <tr key={r.activity} className="border-b border-stone-800">
                      <td className="py-1 pr-2 text-stone-200">{r.activity}</td>
                      <td className="py-1 pr-2 text-amber-200 tabular-nums">{r.perCase.toFixed(1)}× per case</td>
                      <td className="py-1 text-right text-stone-500 tabular-nums">{r.cases.toLocaleString()} cases</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>
  );
}
// ── Conformance tab (a violation → the cases behind it) ─────────────────────

function ConformanceTab({ analytics, variants, conformance, loading, projectId, runId, onRecomputed }: { analytics: RunAnalytics | null; variants: Variant[]; conformance: ConformanceResult | null; loading: boolean; projectId: string; runId: string; onRecomputed: () => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [openCase, setOpenCase] = useState<string | null>(null);
  const [rechecking, setRechecking] = useState(false);

  /**
   * Re-run what the STORED data supports — which for an already-conformed run
   * means replaying it against its own reference, now recording which variants
   * deviated. No re-import: the variants and the reference have both been in
   * the run row all along.
   *
   * This is the recompute contract's first real consumer. It was built in
   * Phase 0.3 with no caller and that debt named at the time; this is it.
   */
  const recheck = async () => {
    setRechecking(true);
    try {
      await fetch(`/api/projects/${projectId}/mining/runs/${runId}/recompute`, { method: "POST" });
      onRecomputed();
    } finally { setRechecking(false); }
  };

  const violation = selected != null ? conformance?.violations[selected] ?? null : null;
  const evidence = useMemo(() => evidenceFor(violation, analytics, variants), [violation, analytics, variants]);
  const shown = useMemo(() => analytics?.cases.find((c) => c.caseId === openCase) ?? null, [analytics, openCase]);
  const steps = useMemo(() => caseTimeline(shown, variants, analytics?.resourceDict ?? []), [shown, variants, analytics]);

  if (loading && !conformance) return <p className="text-[11px] text-stone-500">Loading…</p>;
  if (!conformance) {
    return <p className="text-[11px] text-stone-400">No conformance result yet. Pick a reference state machine and run the check, and the deviations will be listed here with the cases behind them.</p>;
  }
  const unit = analytics?.clockUnit ?? "hour";
  const fmt = (ms: number) => formatDuration(ms, unit);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <div className="text-[11px] text-stone-400 mb-1">
          <span className="text-stone-200">{Math.round(conformance.fitness * 100)}%</span> of cases replay cleanly.
          Select a deviation to see which cases it refers to.
        </div>
        <div className="max-h-[44vh] overflow-auto">
          <table className="w-full text-[11px]">
            <tbody>
              {conformance.violations.map((v, i) => (
                <tr key={i} onClick={() => { setSelected(selected === i ? null : i); setOpenCase(null); }}
                  className={`cursor-pointer border-b border-stone-800 ${selected === i ? "bg-amber-600/20" : "hover:bg-stone-800"}`}>
                  <td className="py-1 pr-2 whitespace-nowrap">
                    <span className={v.severity === "error" ? "text-rose-300" : "text-amber-300"}>{v.severity === "error" ? "✕" : "!"}</span>
                  </td>
                  <td className="py-1 pr-2 text-stone-300">{v.message}</td>
                  <td className="py-1 text-right text-stone-200 tabular-nums">{v.cases || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        {!violation && <p className="text-[11px] text-stone-500">Nothing selected.</p>}
        {violation && (
          <>
            <div className="text-xs font-semibold text-amber-200 mb-0.5">{violation.message}</div>
            {/* The claim and how much of it can be shown, in one sentence. A list
                that quietly omits cases is what stops an auditor trusting this. */}
            <div className={`text-[11px] mb-1.5 ${evidence.partial || evidence.unattributed ? "text-amber-300" : "text-stone-400"}`}>
              {(evidence.partial || evidence.unattributed) && "⚠ "}{evidence.statement}
              {evidence.unattributed && (
                <button onClick={recheck} disabled={rechecking}
                  className="ml-2 rounded px-2 py-0.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white">
                  {rechecking ? "Re-checking…" : "Re-check now"}
                </button>
              )}
            </div>
            <div className="max-h-[36vh] overflow-auto">
              <table className="w-full text-[11px]">
                <tbody>
                  {evidence.cases.map((c) => (
                    <tr key={c.idx} onClick={() => setOpenCase(openCase === c.caseId ? null : c.caseId)}
                      className={`cursor-pointer border-b border-stone-800 ${openCase === c.caseId ? "bg-amber-600/20" : "hover:bg-stone-800"}`}>
                      <td className="py-1 pr-2 text-stone-300 truncate max-w-[10rem]" title={c.caseId}>{c.caseId}</td>
                      <td className="py-1 pr-2 text-stone-500">#{c.variantIdx + 1}</td>
                      <td className="py-1 text-right text-stone-200 tabular-nums whitespace-nowrap">{fmt(c.cycleMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {shown && steps.length > 0 && (
          <div className="mt-2 rounded border border-stone-700 p-2">
            <div className="text-[11px] font-semibold text-amber-200 mb-1">Case {shown.caseId}</div>
            <div className="flex flex-col gap-0.5">
              {steps.map((s, i) => (
                <div key={i} className="flex items-baseline gap-2 text-[10px]">
                  <span className="text-stone-500 w-4 text-right tabular-nums">{i + 1}</span>
                  <span className="text-stone-200">{s.activity}</span>
                  {s.state && s.state !== s.activity && <span className="text-amber-300/70">→ {s.state}</span>}
                  {s.resource && <span className="text-blue-300/70">{s.resource}</span>}
                  {/* Null, not zero: the last step has nothing after it to
                      measure against, and a run without per-event durations
                      has no timings at all. Neither is "took no time". */}
                  {s.durMs !== null && <span className="ml-auto text-stone-400 tabular-nums">{fmt(s.durMs)}</span>}
                </div>
              ))}
            </div>
            {steps.every((s) => s.durMs === null) && (
              <p className="text-[10px] text-stone-500 mt-1">This run did not keep per-event timings, so only the path is shown.</p>
            )}
          </div>
        )}
      </div>
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

// ── Activities tab (one row per activity: stats + team(s) + state(s)) ────────

function ActivitiesTab({ analytics, loading }: { analytics: RunAnalytics | null; loading: boolean }) {
  // Item 03. The amber flag has been able to say "more than one team does
  // this" since the run summary shipped, and there was no way to open it —
  // which is the whole question a reader has when they see it.
  const [openSplit, setOpenSplit] = useState<string | null>(null);
  if (loading && !analytics) return <p className="text-[11px] text-stone-500">Loading analytics…</p>;
  if (!analytics || analytics.activities.length === 0) return <NoAnalytics />;
  const unit = analytics.clockUnit;
  // Every distinct state observed across the log (with event counts) + every team.
  const stateCount = new Map<string, number>();
  const teamCount = new Map<string, number>();
  for (const a of analytics.activities) {
    for (const s of a.states ?? []) stateCount.set(s, (stateCount.get(s) ?? 0) + a.eventFreq);
    for (const r of a.resources ?? []) teamCount.set(r, (teamCount.get(r) ?? 0) + a.eventFreq);
  }
  const reimport = analytics.activities.some((a) => a.resources === undefined && a.states === undefined);
  const states = [...stateCount.entries()].sort((a, b) => b[1] - a[1]);
  const teams = [...teamCount.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <div className="text-[11px] text-stone-400 mb-2">
        {analytics.activities.length} activity types · {analytics.totalCases}{analytics.capped ? " (sampled)" : ""} cases — one row each (normally 1 team + 1 state; multiples are flagged amber). Sorted by total time.
      </div>
      {reimport && <p className="text-[10px] text-amber-400 mb-2">Teams / states are blank — this run was imported before the per-activity summary. Re-import the log to populate them.</p>}
      <div className="flex flex-wrap gap-1.5 items-center mb-1">
        <span className="text-[10px] uppercase tracking-wide text-stone-500">States ({states.length}):</span>
        {states.map(([s, n]) => <span key={s} className="text-[10px] rounded bg-amber-900/40 border border-amber-800/50 px-1.5 py-0.5 text-amber-100">{s} <span className="text-amber-300/60">{n.toLocaleString()}</span></span>)}
      </div>
      <div className="flex flex-wrap gap-1.5 items-center mb-2">
        <span className="text-[10px] uppercase tracking-wide text-stone-500">Teams ({teams.length}):</span>
        {teams.length ? teams.map(([t, n]) => <span key={t} className="text-[10px] rounded bg-blue-900/40 border border-blue-800/50 px-1.5 py-0.5 text-blue-100">{t} <span className="text-blue-300/60">{n.toLocaleString()}</span></span>) : <span className="text-[10px] text-stone-500">none (no resource column / enrichment)</span>}
      </div>
      <div className="overflow-x-auto max-h-[52vh]">
        <table className="w-full text-[11px]">
          <thead className="text-stone-400 text-left sticky top-0 bg-stone-900">
            <tr>
              <th className="font-normal py-1 pr-3">Activity</th>
              <th className="font-normal py-1 pr-2 text-right">Cases</th>
              <th className="font-normal py-1 pr-2 text-right">Events</th>
              <th className="font-normal py-1 pr-2 text-right">Median</th>
              <th className="font-normal py-1 pr-2 text-right">Total time</th>
              <th className="font-normal py-1 pr-3">Team(s)</th>
              <th className="font-normal py-1">State(s)</th>
            </tr>
          </thead>
          <tbody>
            {analytics.activities.map((a) => {
              const res = a.resources ?? [], sts = a.states ?? [];
              const multiRes = res.length > 1, multiState = sts.length > 1;
              return (
                <tr key={a.activity} className="border-b border-stone-800 hover:bg-stone-800/60">
                  <td className="py-1 pr-3 text-stone-200">{a.activity}</td>
                  <td className="py-1 pr-2 text-right text-stone-300 tabular-nums">{a.caseFreq.toLocaleString()}</td>
                  <td className="py-1 pr-2 text-right text-stone-400 tabular-nums">{a.eventFreq.toLocaleString()}</td>
                  <td className="py-1 pr-2 text-right text-stone-300 tabular-nums whitespace-nowrap">{formatDuration(a.medianDurMs, unit)}</td>
                  <td className="py-1 pr-2 text-right text-stone-300 tabular-nums whitespace-nowrap">{formatDuration(a.totalTimeMs, unit)}</td>
                  <td className={`py-1 pr-3 ${multiRes ? "text-amber-300" : "text-stone-300"}`}>
                    {multiRes && a.resourceCounts ? (
                      <button onClick={() => setOpenSplit(openSplit === a.activity ? null : a.activity)}
                        className="text-left underline decoration-dotted hover:text-amber-200"
                        title="More than one team does this — open the split">
                        {res.join(", ")} {openSplit === a.activity ? "▾" : "▸"}
                      </button>
                    ) : (res.length ? res.join(", ") : "—")}
                    {openSplit === a.activity && a.resourceCounts && (
                      <div className="mt-1 flex flex-col gap-0.5">
                        {Object.entries(a.resourceCounts).sort((x, y) => y[1] - x[1]).map(([team, n]) => (
                          <div key={team} className="flex items-center gap-2 text-[10px]">
                            <span className="text-stone-300">{team}</span>
                            <span className="text-stone-500 tabular-nums">{n.toLocaleString()}</span>
                            <span className="text-stone-600 tabular-nums">{a.eventFreq > 0 ? `${Math.round((n / a.eventFreq) * 100)}%` : ""}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {multiRes && !a.resourceCounts && (
                      <span className="block text-[10px] text-stone-500">the split was not recorded for this run — re-import to see it</span>
                    )}
                  </td>
                  <td className={`py-1 ${multiState ? "text-amber-300" : "text-stone-300"}`} title={multiState ? "More than one state seen for this activity" : undefined}>{sts.length ? sts.join(", ") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
          {/* The list on screen stops at 60 rows, which is right for reading
              and useless to anyone who wants to check the work — and checking
              the work is the first thing a sceptical reader asks to do. */}
          <button
            onClick={() => downloadText(
              `cases${analytics.capped ? "-sample" : ""}-${analytics.cases.length}.csv`,
              casesCsv(analytics, variants))}
            title={analytics.capped
              ? `Every case this run stores (${analytics.cases.length.toLocaleString()} of about ${analytics.totalCases.toLocaleString()}) — not just the 60 shown`
              : `All ${analytics.cases.length.toLocaleString()} cases — not just the 60 shown`}
            className="rounded px-2 py-0.5 bg-stone-800 text-amber-200 hover:bg-stone-700">⬇ CSV</button>
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
        {rows.length >= 60 && (
          <p className="text-[10px] text-stone-500 mt-1">
            Showing the 60 longest of {analytics.cases.length.toLocaleString()} stored cases
            {analytics.capped && <> (themselves a sample of about {analytics.totalCases.toLocaleString()})</>}.
            The CSV has every one.
          </p>
        )}
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
function BetweenStepsTab({ analytics, loading }: { analytics: RunAnalytics | null; loading: boolean }) {
  const view = useMemo(() => transitionRows(analytics?.edges), [analytics]);
  if (loading && !analytics) return <p className="text-[11px] text-stone-500">Loading analytics…</p>;
  if (!analytics) return <NoAnalytics />;
  if (view.rows.length === 0) {
    return <p className="text-[11px] text-stone-400">No transitions in this run — every case is a single event, so there is no gap between steps to measure.</p>;
  }
  const unit = analytics.clockUnit;
  const share = (x: number) => `${(x * 100).toFixed(0)}%`;
  return (
    <div>
      {/* The disclosure that makes this table honest. An event log records ONE
          timestamp per event, so the interval between two events is a single
          number and nothing says how much was work and how much was waiting —
          and the SAME milliseconds appear in the Activities table under the
          step they leave. Without this, a reader sums both tables and doubles
          the elapsed time of their own process. */}
      <div className="text-[11px] text-stone-400 mb-2 leading-relaxed">
        Every step-to-step gap in the log, ranked by how much of the total elapsed time it accounts for.
        <span className="text-stone-300"> These are the same milliseconds the Activities table charges to the step they leave</span> —
        this breaks that figure down by where the case was going next, rather than adding to it.
      </div>
      <div className="text-[10px] text-stone-500 mb-2 leading-relaxed">
        A log records one timestamp per event, so a gap cannot be split into work and waiting. Every figure here is the whole gap.
        {view.anyEstimated && <span className="text-amber-400"> Totals marked ≈ are estimated as median × count: this run was imported before totals were recorded, and re-importing would measure them.</span>}
      </div>
      <div className="overflow-x-auto max-h-[52vh]">
        <table className="w-full text-[11px]">
          <thead className="text-stone-400 text-left sticky top-0 bg-stone-900">
            <tr>
              <th className="font-normal py-1 pr-3">From</th>
              <th className="font-normal py-1 pr-3">To</th>
              <th className="font-normal py-1 pr-2 text-right">Times</th>
              <th className="font-normal py-1 pr-2 text-right">Median gap</th>
              <th className="font-normal py-1 pr-2 text-right">Total</th>
              <th className="font-normal py-1 pr-2 text-right">Share of run</th>
              <th className="font-normal py-1 text-right">Share of step</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <tr key={`${r.from}->${r.to}`} className="border-b border-stone-800 hover:bg-stone-800/60">
                <td className="py-1 pr-3 text-stone-200">{r.from}</td>
                <td className="py-1 pr-3 text-stone-200">{r.to}</td>
                <td className="py-1 pr-2 text-right text-stone-400 tabular-nums">{r.freq.toLocaleString()}</td>
                <td className="py-1 pr-2 text-right text-stone-300 tabular-nums whitespace-nowrap">
                  {r.medianMs === null
                    ? <span className="text-stone-600" title={`Fewer than ${MIN_EDGE_OBS} observations — too few for a median worth quoting`}>—</span>
                    : formatDuration(r.medianMs, unit)}
                </td>
                <td className="py-1 pr-2 text-right text-amber-200 tabular-nums whitespace-nowrap">
                  {r.estimated && <span className="text-amber-500/70" title="Estimated as median × count">≈ </span>}
                  {formatDuration(r.totalMs, unit)}
                </td>
                <td className="py-1 pr-2 text-right text-stone-400 tabular-nums">{view.totalMs > 0 ? share(r.totalMs / view.totalMs) : "—"}</td>
                <td className="py-1 text-right text-stone-400 tabular-nums" title={`Share of all the time leaving "${r.from}"`}>{share(r.shareOfFrom)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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
