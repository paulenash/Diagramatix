"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ComplianceReport, ControlSeries } from "@/app/lib/riskControls/compliance";

/**
 * Compliance Monitoring — org-wide control operating-effectiveness over time,
 * assembled from the process-mining runs retained across the org's projects.
 * Read-only aggregation (GET /api/orgs/[id]/compliance); hand-rolled SVG charts
 * in the FlowHistogram idiom. Slate governance identity.
 */
export function ComplianceMonitorConsole({
  orgId, orgName, backHref = "/dashboard/org-admin",
}: {
  orgId: string; orgName: string; backHref?: string;
}) {
  const router = useRouter();
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/orgs/${orgId}/compliance`);
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) { setErr(j.error ?? "Could not load compliance data"); return; }
        setReport(j);
        setSelectedCode(j.controls?.[0]?.code ?? null);
      } catch { if (!cancelled) setErr("Could not load compliance data"); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  const selected = useMemo(
    () => report?.controls.find((c) => c.code === selectedCode) ?? null,
    [report, selectedCode],
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col">
      <header className="bg-slate-800 text-white px-5 py-3 flex items-center justify-between shadow">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold tracking-tight">◎ Compliance Monitoring</h1>
          <span className="text-slate-300 text-xs">{orgName}</span>
          {report && (
            <span className="text-slate-200/80 text-[11px]">
              {report.summary.runCount} run{report.summary.runCount === 1 ? "" : "s"} · {report.summary.projectCount} project{report.summary.projectCount === 1 ? "" : "s"} · {report.summary.controlCount} controls monitored
            </span>
          )}
        </div>
        <button onClick={() => router.push(backHref)} className="text-xs bg-slate-900/60 hover:bg-slate-900 rounded px-3 py-1.5">✕ Close</button>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-5 space-y-4">
          {err && <p className="text-[12px] text-red-600">{err}</p>}
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : !report || report.summary.runCount === 0 ? (
            <EmptyState />
          ) : (
            <>
              <HeadlineStats report={report} />
              <Card title="Control effectiveness over time" subtitle="Org-wide (solid) vs conformance fitness (dashed). Each point is a mining run.">
                <TrendChart
                  xLabels={report.runs.map((r) => fmtDate(r.createdAt))}
                  lines={[
                    { name: "Effectiveness", color: "#2563eb", values: report.runs.map((r) => r.overallEffPct) },
                    { name: "Fitness", color: "#64748b", dashed: true, values: report.runs.map((r) => r.fitnessPct) },
                  ]}
                  threshold={report.threshold}
                />
              </Card>

              {(report.summary.controlsBelowThreshold > 0 || report.summary.decliningControls > 0) && (
                <Card title="Alerts" subtitle={`Controls below ${report.threshold}% or trending down`}>
                  <div className="space-y-1">
                    {report.controls.filter((c) => c.belowThreshold || c.declining).map((c) => (
                      <button key={c.code} onClick={() => setSelectedCode(c.code)}
                        className="w-full flex items-center justify-between text-left text-[12px] px-2 py-1 rounded hover:bg-slate-100">
                        <span className="truncate"><span className="font-mono text-gray-500">{c.code}</span> {c.name}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          {c.declining && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">↓ declining</span>}
                          <span className={`font-medium tabular-nums ${effColor(c.latestEffPct, report.threshold)}`}>{fmtPct(c.latestEffPct)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </Card>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <Card title="Control detail" subtitle="Pick a control to see its effectiveness over time (points by project).">
                  <select value={selectedCode ?? ""} onChange={(e) => setSelectedCode(e.target.value)}
                    className="text-xs border border-gray-300 rounded px-2 py-1 w-full mb-2">
                    {report.controls.map((c) => (
                      <option key={c.code} value={c.code}>{c.code} — {c.name}{c.belowThreshold ? " ⚠" : ""}</option>
                    ))}
                  </select>
                  {selected ? <ControlDetail control={selected} threshold={report.threshold} /> : <p className="text-[11px] text-gray-400">No controls measured yet.</p>}
                </Card>

                <Card title="By project" subtitle="Latest run per project.">
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-gray-400 text-left border-b border-gray-200">
                          <th className="py-1 pr-2 font-medium">Project</th>
                          <th className="py-1 px-2 font-medium text-right">Eff.</th>
                          <th className="py-1 px-2 font-medium text-right">Fitness</th>
                          <th className="py-1 pl-2 font-medium text-right">Last run</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.projects.map((p) => (
                          <tr key={p.projectId} className="border-b border-gray-100 hover:bg-slate-50 cursor-pointer"
                            onClick={() => p.projectId && router.push(`/dashboard/projects/${p.projectId}`)}>
                            <td className="py-1 pr-2 truncate max-w-[160px]" title={p.projectName}>{p.projectName}</td>
                            <td className={`py-1 px-2 text-right tabular-nums font-medium ${effColor(p.latestEffPct, report.threshold)}`}>{fmtPct(p.latestEffPct)}</td>
                            <td className="py-1 px-2 text-right tabular-nums text-gray-600">{fmtPct(p.latestFitnessPct)}</td>
                            <td className="py-1 pl-2 text-right text-gray-400">{fmtDate(p.lastRunAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

// ————— pieces —————

function EmptyState() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-xl">
      <h2 className="text-sm font-semibold text-gray-800 mb-1">No compliance data yet</h2>
      <p className="text-xs text-gray-500">
        Compliance Monitoring trends control operating-effectiveness across your org’s
        <span className="font-medium"> DiagramatixMINER</span> runs. Import an event log and run conformance in a
        project’s Miner (with controls attached in Risk &amp; Controls), then return here. It becomes meaningful once an
        org has <span className="font-medium">two or more runs</span> to trend across.
      </p>
    </div>
  );
}

function HeadlineStats({ report }: { report: ComplianceReport }) {
  const s = report.summary;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-3 sm:grid-cols-6 gap-4">
      <Stat label="Overall eff." value={fmtPct(s.overallEffPct)} tone={effColor(s.overallEffPct, report.threshold)} />
      <Stat label="Latest fitness" value={fmtPct(s.latestFitnessPct)} tone="text-slate-700" />
      <Stat label="Controls" value={s.controlCount} />
      <Stat label={`Below ${report.threshold}%`} value={s.controlsBelowThreshold} tone={s.controlsBelowThreshold ? "text-red-600" : "text-emerald-600"} />
      <Stat label="Declining" value={s.decliningControls} tone={s.decliningControls ? "text-amber-600" : "text-gray-800"} />
      <Stat label="Runs · projects" value={`${s.runCount} · ${s.projectCount}`} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="text-center">
      <div className={`text-xl font-semibold ${tone ?? "text-gray-800"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{title}</h3>
      {subtitle && <p className="text-[10px] text-gray-400 mb-2.5">{subtitle}</p>}
      {children}
    </div>
  );
}

function ControlDetail({ control, threshold }: { control: ControlSeries; threshold: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1 text-[11px]">
        <span className="text-gray-500">Org rollup <span className="font-medium text-gray-800">{fmtPct(control.orgEffPct)}</span></span>
        <span className={`font-medium ${effColor(control.latestEffPct, threshold)}`}>latest {fmtPct(control.latestEffPct)}</span>
      </div>
      <TrendChart
        xLabels={control.points.map((p) => fmtDate(p.createdAt))}
        lines={[{ name: control.code, color: "#2563eb", values: control.points.map((p) => p.effPct) }]}
        threshold={threshold}
        pointTitles={control.points.map((p) => `${p.projectName} · ${fmtDate(p.createdAt)} · ${fmtPct(p.effPct)} (${p.applied}/${p.expected})`)}
      />
    </div>
  );
}

/** Minimal multi-line SVG chart, 0–100%. Null values break the line. */
function TrendChart({ xLabels, lines, threshold, pointTitles }: {
  xLabels: string[];
  lines: { name: string; color: string; dashed?: boolean; values: (number | null)[] }[];
  threshold: number;
  pointTitles?: string[];
}) {
  const W = 460, H = 150, padL = 26, padB = 16, padT = 6, padR = 6;
  const n = xLabels.length;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xOf = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yOf = (v: number) => padT + (1 - v / 100) * plotH;

  if (n === 0) return <p className="text-[11px] text-gray-400">No data.</p>;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Effectiveness over time">
      {/* gridlines + y labels at 0/50/100 and the threshold */}
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1={padL} y1={yOf(g)} x2={W - padR} y2={yOf(g)} stroke="#e5e7eb" strokeWidth={1} />
          <text x={padL - 4} y={yOf(g) + 3} textAnchor="end" fontSize={8} fill="#9ca3af">{g}</text>
        </g>
      ))}
      <line x1={padL} y1={yOf(threshold)} x2={W - padR} y2={yOf(threshold)} stroke="#f59e0b" strokeWidth={1} strokeDasharray="3 3" />
      <text x={W - padR} y={yOf(threshold) - 2} textAnchor="end" fontSize={8} fill="#d97706">target {threshold}%</text>

      {lines.map((ln) => {
        // Build a polyline over non-null points; also draw dots.
        const pts = ln.values.map((v, i) => (v == null ? null : { x: xOf(i), y: yOf(v), v, i })).filter(Boolean) as { x: number; y: number; v: number; i: number }[];
        const d = pts.map((p, k) => `${k === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
        return (
          <g key={ln.name}>
            {pts.length > 1 && <path d={d} fill="none" stroke={ln.color} strokeWidth={1.6} strokeDasharray={ln.dashed ? "4 3" : undefined} />}
            {pts.map((p) => (
              <circle key={p.i} cx={p.x} cy={p.y} r={2.4} fill={ln.color}>
                {pointTitles?.[p.i] && <title>{pointTitles[p.i]}</title>}
              </circle>
            ))}
          </g>
        );
      })}

      {/* first / last x labels */}
      {n > 0 && <text x={padL} y={H - 4} fontSize={8} fill="#9ca3af">{xLabels[0]}</text>}
      {n > 1 && <text x={W - padR} y={H - 4} textAnchor="end" fontSize={8} fill="#9ca3af">{xLabels[n - 1]}</text>}
    </svg>
  );
}

// ————— helpers —————
function fmtPct(v: number | null | undefined) { return v == null ? "—" : `${v}%`; }
function fmtDate(iso: string) { const d = new Date(iso); return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function effColor(v: number | null | undefined, threshold: number) {
  if (v == null) return "text-gray-400";
  if (v >= 95) return "text-emerald-600";
  if (v >= threshold) return "text-amber-600";
  return "text-red-600";
}
