"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useFeatureColors } from "@/app/lib/theme/useFeatureColors";
import { tonesFor } from "@/app/lib/theme/featureColors";

interface Agg {
  invocations: number;
  success: number;
  failure: number;
  inTokens: number;
  outTokens: number;
  retries: number;
  cost: number;
}
interface Rate { provider: string; model: string; inputPer1M: number; outputPer1M: number; currency: string; source: "default" | "override" }

interface Props {
  isSuperAdmin: boolean;
  activeOrgName: string | null;
  filters: { range: string; provider: string; model: string; point: string; org: string; user: string };
  filterOptions: {
    providers: string[];
    models: string[];
    points: { value: string; label: string }[];
    orgs: { id: string; name: string }[];
  };
  summary: Agg;
  byModel: Array<{ key: string; provider: string } & Agg>;
  byPoint: Array<{ key: string; label: string } & Agg>;
  byProvider: Array<{ key: string } & Agg>;
  series: Array<{ day: string; success: number; failure: number; inTokens: number; outTokens: number; cost: number }>;
  seriesCapped: boolean;
  byOrg: Array<{ id: string; name: string } & Agg>;
  byUser: Array<{ id: string; name: string } & Agg>;
  rates: Rate[];
}

const fmtInt = (n: number) => n.toLocaleString();
const fmtTokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const fmtCost = (n: number) => (n === 0 ? "$0" : n < 0.01 ? `${(n * 100).toFixed(2)}¢` : `$${n.toFixed(n < 1 ? 3 : 2)}`);
const pct = (num: number, den: number) => (den <= 0 ? 0 : Math.round((num / den) * 100));

/** A horizontal bar: grey track + coloured fill scaled to `max` (cost-bars idiom). */
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max <= 0 ? 0 : Math.max(value > 0 ? 2 : 0, (value / max) * 100);
  return (
    <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden min-w-[40px]">
      <div className="h-full rounded" style={{ width: `${w}%`, backgroundColor: color }} />
    </div>
  );
}

export function AiUsageClient(props: Props) {
  const { isSuperAdmin: su, activeOrgName, filters, filterOptions, summary, byModel, byPoint, byProvider, series, seriesCapped, byOrg, byUser } = props;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ai = tonesFor(useFeatureColors(), "ai").text;

  function setFilter(key: string, value: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (value) p.set(key, value); else p.delete(key);
    router.push(`${pathname}?${p.toString()}`);
  }

  const backHref = su ? "/dashboard/admin" : "/dashboard/org-admin";
  const empty = summary.invocations === 0;

  return (
    <div className="h-screen dgx-dashboard-bg flex flex-col overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 shrink-0">
        <Link href={backHref} className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
          <span>←</span><span className="underline">{su ? "SuperAdmin" : "OrgAdmin"}</span>
        </Link>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/diagramatix-icon.svg" alt="Diagramatix" className="w-7 h-7" />
        <h1 className="text-lg font-semibold text-gray-900">AI Usage</h1>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${ai}1a`, color: ai }}>
          {su ? "All organisations" : activeOrgName ?? "Your organisation"}
        </span>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
      <p className="text-sm text-gray-500">
        Invocations, tokens, retries &amp; estimated cost across every AI call.
        {su ? " You see every org, per-user, and can edit the cost rates below." : " Org totals only — individual members aren't singled out."}
      </p>

      {/* ── Filters ── */}
      <div className="mt-4 flex flex-wrap gap-3 items-end bg-white border border-gray-200 rounded-lg p-3">
        <Select label="Range" value={filters.range} onChange={(v) => setFilter("range", v)}
          options={[["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["365", "Last year"], ["all", "All time"]]} />
        <Select label="Provider" value={filters.provider} onChange={(v) => setFilter("provider", v)}
          options={[["", "All providers"], ...filterOptions.providers.map((p) => [p, p] as [string, string])]} />
        <Select label="Model" value={filters.model} onChange={(v) => setFilter("model", v)}
          options={[["", "All models"], ...filterOptions.models.map((m) => [m, m] as [string, string])]} />
        <Select label="Invocation point" value={filters.point} onChange={(v) => setFilter("point", v)}
          options={[["", "All points"], ...filterOptions.points.map((p) => [p.value, p.label] as [string, string])]} />
        {su && (
          <Select label="Organisation" value={filters.org} onChange={(v) => setFilter("org", v)}
            options={[["", "All orgs"], ...filterOptions.orgs.map((o) => [o.id, o.name] as [string, string])]} />
        )}
        {(filters.provider || filters.model || filters.point || filters.org || filters.user || filters.range !== "30") && (
          <button onClick={() => router.push(pathname)} className="text-xs text-gray-500 hover:text-gray-800 underline pb-1.5">Reset</button>
        )}
      </div>

      {/* ── Summary cards ── */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Stat label="Invocations" value={fmtInt(summary.invocations)}
          sub={`${pct(summary.success, summary.invocations)}% ok · ${fmtInt(summary.failure)} failed`} />
        <Stat label="Input tokens" value={fmtTokens(summary.inTokens)} />
        <Stat label="Output tokens" value={fmtTokens(summary.outTokens)} />
        <Stat label="Retries" value={fmtInt(summary.retries)} />
        <Stat label="Est. cost (USD)" value={fmtCost(summary.cost)} accent={ai} />
      </div>

      {empty ? (
        <div className="mt-8 text-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg py-12">
          No AI activity in this range yet. Charts appear once AI calls are made.
        </div>
      ) : (
        <>
          {/* ── Over time ── */}
          <Card title="Invocations over time" note="green = success · red = failure">
            <TimeSeries series={series} />
            {seriesCapped && <p className="text-xs text-amber-600 mt-2">Showing the most recent 5,000 rows — narrow the range for exact daily totals.</p>}
          </Card>

          {/* ── By invocation point ── */}
          <Card title="By invocation point">
            <BreakdownTable
              rows={byPoint.map((p) => ({ name: p.label, ...p }))}
              max={Math.max(1, ...byPoint.map((p) => p.invocations))}
              barColor={ai}
              metric="invocations"
            />
          </Card>

          {/* ── By model ── */}
          <Card title="By model" note="tokens & estimated cost per model">
            <div className="space-y-3">
              {byModel.map((m) => {
                const maxTok = Math.max(1, ...byModel.map((x) => x.inTokens + x.outTokens));
                const tot = m.inTokens + m.outTokens;
                return (
                  <div key={m.key} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-800 truncate">{m.key}</span>
                      <span className="text-gray-400 text-xs shrink-0">{m.provider} · {fmtInt(m.invocations)} calls · {fmtTokens(tot)} tok · <span style={{ color: ai }}>{fmtCost(m.cost)}</span></span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {/* input vs output split */}
                      <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden flex min-w-[60px]">
                        <div className="h-full bg-sky-400" style={{ width: `${(m.inTokens / maxTok) * 100}%` }} title={`input ${fmtTokens(m.inTokens)}`} />
                        <div className="h-full bg-amber-400" style={{ width: `${(m.outTokens / maxTok) * 100}%` }} title={`output ${fmtTokens(m.outTokens)}`} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <Legend items={[["bg-sky-400", "input tokens"], ["bg-amber-400", "output tokens"]]} />
          </Card>

          {/* ── By provider + reliability ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="By provider">
              <BreakdownTable
                rows={byProvider.map((p) => ({ name: p.key, ...p }))}
                max={Math.max(1, ...byProvider.map((p) => p.invocations))}
                barColor={ai}
                metric="invocations"
              />
            </Card>
            <Card title="Reliability & retries" note="failure rate + retries by point">
              <div className="space-y-2">
                {byPoint.map((p) => (
                  <div key={p.key} className="text-sm flex items-center justify-between gap-2">
                    <span className="text-gray-700 truncate">{p.label}</span>
                    <span className="text-xs shrink-0">
                      <span className={p.failure ? "text-red-600" : "text-gray-400"}>{pct(p.failure, p.invocations)}% fail</span>
                      <span className="text-gray-400"> · {fmtInt(p.retries)} retries</span>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* ── SuperAdmin: by org + by user ── */}
          {su && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card title="By organisation">
                <BreakdownTable rows={byOrg} max={Math.max(1, ...byOrg.map((o) => o.invocations))} barColor={ai} metric="invocations" showCost />
              </Card>
              <Card title="Top users" note="who is generating the AI load">
                <BreakdownTable rows={byUser.slice(0, 12)} max={Math.max(1, ...byUser.map((u) => u.invocations))} barColor={ai} metric="invocations" showCost />
              </Card>
            </div>
          )}
        </>
      )}

      {/* ── SuperAdmin: editable cost rates ── */}
      {su && <RateEditor initial={props.rates} accent={ai} />}
      </div>
      </main>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="text-xs text-gray-500 flex flex-col gap-1">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="text-sm text-gray-800 border border-gray-300 rounded px-2 py-1 bg-white min-w-[130px]">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold mt-0.5" style={{ color: accent ?? "#111827" }}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        {note && <span className="text-xs text-gray-400">{note}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="flex gap-4 mt-3">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1 text-xs text-gray-500"><span className={`w-3 h-2 rounded ${c}`} />{l}</span>
      ))}
    </div>
  );
}

function BreakdownTable({ rows, max, barColor, metric, showCost }: {
  rows: Array<{ name: string } & Agg>;
  max: number;
  barColor: string;
  metric: "invocations";
  showCost?: boolean;
}) {
  if (!rows.length) return <p className="text-sm text-gray-400">No data.</p>;
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={`${r.name}-${i}`} className="text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-gray-800 truncate">{r.name}</span>
            <span className="text-xs text-gray-400 shrink-0">
              {fmtInt(r[metric])} · {fmtTokens(r.inTokens + r.outTokens)} tok
              {showCost ? <> · <span style={{ color: barColor }}>{fmtCost(r.cost)}</span></> : <> · <span style={{ color: barColor }}>{fmtCost(r.cost)}</span></>}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Bar value={r[metric]} max={max} color={barColor} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TimeSeries({ series }: { series: Array<{ day: string; success: number; failure: number; inTokens: number; outTokens: number; cost: number }> }) {
  if (!series.length) return <p className="text-sm text-gray-400">No data.</p>;
  const max = Math.max(1, ...series.map((s) => s.success + s.failure));
  return (
    <div className="flex items-end gap-1 h-32 overflow-x-auto pb-1">
      {series.map((s) => {
        const total = s.success + s.failure;
        const h = (total / max) * 100;
        const okH = total > 0 ? (s.success / total) * 100 : 0;
        return (
          <div key={s.day} className="flex flex-col items-center gap-1 shrink-0" style={{ width: 14 }} title={`${s.day}\n${s.success} ok, ${s.failure} failed\n${fmtTokens(s.inTokens + s.outTokens)} tokens · ${fmtCost(s.cost)}`}>
            <div className="w-full bg-gray-100 rounded-sm flex flex-col justify-end" style={{ height: `${Math.max(3, h)}%` }}>
              <div className="w-full bg-red-400" style={{ height: `${100 - okH}%` }} />
              <div className="w-full bg-green-400" style={{ height: `${okH}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** SuperAdmin cost-rate editor — edits AiModelRate via PUT /api/admin/ai-rates. */
function RateEditor({ initial, accent }: { initial: Rate[]; accent: string }) {
  const [open, setOpen] = useState(false);
  const [rates, setRates] = useState<Rate[]>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = useMemo(() => JSON.stringify(rates) !== JSON.stringify(initial), [rates, initial]);

  function edit(i: number, field: "inputPer1M" | "outputPer1M", value: string) {
    const n = parseFloat(value);
    setRates((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: isNaN(n) ? 0 : n } : r)));
  }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/ai-rates", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rates: rates.map((r) => ({ provider: r.provider, model: r.model, inputPer1M: r.inputPer1M, outputPer1M: r.outputPer1M })) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error ?? "Failed to save"); return; }
      if (Array.isArray(j.rates)) setRates(j.rates);
      setMsg("Saved — cost figures update on refresh.");
    } catch {
      setMsg("Network error");
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-6 bg-white border border-gray-200 rounded-lg">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800">
        <span>Model Cost Rates (USD per 1M tokens) — editable</span>
        <span className="text-gray-400">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <p className="text-xs text-gray-500 mb-3">These rates drive every cost figure above. Overrides persist; un-edited models use the built-in snapshot.</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="py-1">Provider</th><th>Model</th><th className="text-right">Input /1M</th><th className="text-right">Output /1M</th><th className="text-right">Source</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r, i) => (
                <tr key={`${r.provider}-${r.model}`} className="border-b border-gray-50">
                  <td className="py-1.5 text-gray-500">{r.provider}</td>
                  <td className="text-gray-800">{r.model}</td>
                  <td className="text-right"><input type="number" step="0.01" min="0" value={r.inputPer1M} onChange={(e) => edit(i, "inputPer1M", e.target.value)} className="w-20 text-right border border-gray-300 rounded px-1 py-0.5" /></td>
                  <td className="text-right"><input type="number" step="0.01" min="0" value={r.outputPer1M} onChange={(e) => edit(i, "outputPer1M", e.target.value)} className="w-20 text-right border border-gray-300 rounded px-1 py-0.5" /></td>
                  <td className="text-right text-xs text-gray-400">{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-3 mt-3">
            <button onClick={save} disabled={!dirty || busy} className="text-sm text-white px-3 py-1.5 rounded disabled:opacity-40" style={{ backgroundColor: accent }}>
              {busy ? "Saving…" : "Save rates"}
            </button>
            {msg && <span className="text-xs text-gray-500">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
