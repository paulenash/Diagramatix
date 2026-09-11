"use client";

/**
 * Prompt usage — the summary behind the maintenance screen.
 *
 * It answers one question: **which of these are earning their place?** Every
 * panel is chosen for that, which is why "never used" is the first number on
 * screen rather than a total, and why the distribution is buckets rather than a
 * mean — an average use count over a library where most prompts were run once
 * tells you nothing you can act on.
 *
 * Drawn as plain SVG, like the Simulator's charts. A charting library would be
 * a large dependency for six small panels, and none of these needs interaction
 * beyond a tooltip.
 *
 * It summarises EXACTLY what the screen is showing — one person's prompts, or
 * the whole org for an admin. A summary whose scope differs from the list
 * behind it is a summary nobody can reconcile.
 */
import { useMemo } from "react";

export interface SummaryPrompt {
  id: string;
  name: string;
  diagramType: string;
  createdAt: string;
  updatedAt: string;
  source?: string | null;
  refinedAt?: string | null;
  fromImage?: boolean;
  modelUsed?: string | null;
  lastUsedAt?: string | null;
  useCount?: number;
  planUpdatedAt?: string | null;
  ownerLabel?: string;
}

interface Props {
  prompts: SummaryPrompt[];
  /** What the numbers cover — said out loud, because the scope is the caveat. */
  scopeLabel: string;
  typeLabels: Record<string, string>;
  onClose: () => void;
}

const BAR = "#2563eb";
const BAR_MUTED = "#93c5fd";

/** A horizontal bar row set. Labels left, value right, bar between. */
function BarList({ rows, accent = BAR }: { rows: { label: string; value: number; hint?: string }[]; accent?: string }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  if (rows.length === 0) return <p className="text-[10px] text-gray-400 italic">Nothing to show</p>;
  return (
    <div className="space-y-1">
      {rows.map(r => (
        <div key={r.label} className="flex items-center gap-2" title={r.hint}>
          <span className="w-28 shrink-0 text-[10px] text-gray-600 truncate">{r.label}</span>
          <div className="flex-1 h-3 bg-gray-100 rounded-sm overflow-hidden">
            <div className="h-full rounded-sm" style={{ width: `${(r.value / max) * 100}%`, background: accent }} />
          </div>
          <span className="w-8 shrink-0 text-[10px] text-gray-700 text-right tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** A donut for a two-part split, because the SHARE is the point. */
function Donut({ used, total }: { used: number; total: number }) {
  const r = 34, c = 2 * Math.PI * r;
  const share = total > 0 ? used / total : 0;
  return (
    <svg width={92} height={92} viewBox="0 0 92 92" className="shrink-0">
      <circle cx={46} cy={46} r={r} fill="none" stroke="#fde68a" strokeWidth={14} />
      <circle
        cx={46} cy={46} r={r} fill="none" stroke={BAR} strokeWidth={14}
        strokeDasharray={`${c * share} ${c}`} transform="rotate(-90 46 46)" strokeLinecap="butt"
      />
      <text x={46} y={44} textAnchor="middle" fontSize={16} fontWeight={600} fill="#111827">
        {total > 0 ? Math.round(share * 100) : 0}%
      </text>
      <text x={46} y={57} textAnchor="middle" fontSize={8} fill="#6b7280">used</text>
    </svg>
  );
}

/** Monthly columns. Twelve months is enough to see a habit without a scrollbar. */
function MonthlyColumns({ counts }: { counts: { key: string; label: string; n: number }[] }) {
  const max = Math.max(1, ...counts.map(c => c.n));
  return (
    <div className="flex items-end gap-1 h-20">
      {counts.map(c => (
        <div key={c.key} className="flex-1 flex flex-col items-center justify-end h-full" title={`${c.label}: ${c.n}`}>
          <div className="w-full rounded-t-sm" style={{ height: `${Math.max(2, (c.n / max) * 100)}%`, background: c.n ? BAR : "#e5e7eb" }} />
          <span className="text-[8px] text-gray-400 mt-0.5">{c.label}</span>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-3">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
      {hint && <p className="text-[9px] text-gray-400 mb-2 leading-snug">{hint}</p>}
      <div className={hint ? "" : "mt-2"}>{children}</div>
    </section>
  );
}

export function PromptUsageSummary({ prompts, scopeLabel, typeLabels, onClose }: Props) {
  const s = useMemo(() => {
    const total = prompts.length;
    const used = prompts.filter(p => (p.useCount ?? 0) > 0).length;
    const generations = prompts.reduce((n, p) => n + (p.useCount ?? 0), 0);

    const byType = Object.entries(
      prompts.reduce<Record<string, { n: number; runs: number }>>((acc, p) => {
        const k = p.diagramType;
        (acc[k] ??= { n: 0, runs: 0 }).n += 1;
        acc[k].runs += p.useCount ?? 0;
        return acc;
      }, {}),
    ).sort((a, b) => b[1].n - a[1].n);

    // Buckets, not an average. Most libraries are a long tail of
    // run-once prompts, and a mean over that says nothing you can act on.
    const buckets = [
      { label: "Never", test: (n: number) => n === 0 },
      { label: "Once", test: (n: number) => n === 1 },
      { label: "2–5", test: (n: number) => n >= 2 && n <= 5 },
      { label: "6+", test: (n: number) => n >= 6 },
    ].map(b => ({ label: b.label, value: prompts.filter(p => b.test(p.useCount ?? 0)).length }));

    // Twelve months back from this month.
    const now = new Date();
    const months: { key: string; label: string; n: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: d.toLocaleString(undefined, { month: "narrow" }), n: 0 });
    }
    const monthIndex = new Map(months.map((m, i) => [m.key, i]));
    for (const p of prompts) {
      const d = new Date(p.createdAt);
      if (isNaN(d.getTime())) continue;
      const i = monthIndex.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      if (i !== undefined) months[i].n += 1;
    }

    const written = [
      { label: "Typed", value: prompts.filter(p => p.source === "typed").length },
      { label: "Dictated", value: prompts.filter(p => p.source === "dictated").length },
      // Not the same as typed. Everything saved before this was recorded is
      // genuinely unknown, and folding it into "typed" would invent a fact.
      { label: "Not recorded", value: prompts.filter(p => !p.source).length },
    ];

    const carries = [
      { label: "Has a plan", value: prompts.filter(p => !!p.planUpdatedAt).length, hint: "Re-applies with no AI call" },
      { label: "Refined", value: prompts.filter(p => !!p.refinedAt).length, hint: "Went through the clarifying-questions pass" },
      { label: "From an image", value: prompts.filter(p => !!p.fromImage).length, hint: "Written against a photo or screenshot" },
    ];

    const models = Object.entries(
      prompts.reduce<Record<string, number>>((acc, p) => {
        if (p.modelUsed) acc[p.modelUsed] = (acc[p.modelUsed] ?? 0) + 1;
        return acc;
      }, {}),
    ).sort((a, b) => b[1] - a[1]).slice(0, 6);

    const top = [...prompts]
      .filter(p => (p.useCount ?? 0) > 0)
      .sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0))
      .slice(0, 8);

    const stale = prompts.filter(p => (p.useCount ?? 0) === 0);

    return { total, used, generations, byType, buckets, months, written, carries, models, top, stale };
  }, [prompts]);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-50 rounded-lg shadow-xl w-full max-w-4xl max-h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 py-3 border-b border-gray-200 bg-white rounded-t-lg flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Prompt usage</h3>
            {/* The scope IS the caveat — a summary you cannot reconcile with the
                list behind it is worse than none. */}
            <p className="text-[10px] text-gray-400">{scopeLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none px-1">×</button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {/* Headline. "Never used" first, because it is the number that
              changes what somebody does next. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3">
              <Donut used={s.used} total={s.total} />
              <div>
                <p className="text-lg font-semibold text-gray-900 tabular-nums">{s.stale.length}</p>
                <p className="text-[10px] text-gray-500 leading-tight">never used</p>
                <p className="text-[9px] text-amber-600 mt-0.5">of {s.total} prompts</p>
              </div>
            </div>
            {[
              { n: s.total, label: "prompts" },
              { n: s.generations, label: "diagrams generated" },
              { n: s.carries[0].value, label: "carry a saved plan", hint: "Re-apply with no AI call" },
            ].map(k => (
              <div key={k.label} className="bg-white border border-gray-200 rounded-lg p-3" title={k.hint}>
                <p className="text-2xl font-semibold text-gray-900 tabular-nums">{k.n}</p>
                <p className="text-[10px] text-gray-500 leading-tight">{k.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Panel title="By diagram type" hint="Prompts held, and diagrams generated from them.">
              <BarList rows={s.byType.map(([k, v]) => ({
                label: typeLabels[k] ?? k, value: v.n, hint: `${v.runs} diagram(s) generated`,
              }))} />
            </Panel>

            <Panel title="How often each is used" hint="Buckets rather than an average — most libraries are a long tail of run-once prompts, and a mean over that says nothing you can act on.">
              <BarList rows={s.buckets} accent={BAR_MUTED} />
            </Panel>

            <Panel title="Created" hint="The last twelve months.">
              <MonthlyColumns counts={s.months} />
            </Panel>

            <Panel title="How they were written" hint="“Not recorded” is not the same as “typed” — prompts saved before this was captured are genuinely unknown.">
              <BarList rows={s.written} accent={BAR_MUTED} />
            </Panel>

            <Panel title="What they carry">
              <BarList rows={s.carries} />
            </Panel>

            <Panel title="Model last used">
              {s.models.length
                ? <BarList rows={s.models.map(([m, n]) => ({ label: m, value: n }))} accent={BAR_MUTED} />
                : <p className="text-[10px] text-gray-400 italic">No generation has recorded a model yet</p>}
            </Panel>
          </div>

          <Panel title="Most used" hint="The prompts that have earned their place.">
            {s.top.length === 0 ? (
              <p className="text-[10px] text-gray-400 italic">Nothing here has been used yet</p>
            ) : (
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-gray-400 text-left">
                    <th className="font-medium py-0.5">Prompt</th>
                    <th className="font-medium py-0.5 w-24">Type</th>
                    {s.top.some(t => t.ownerLabel) && <th className="font-medium py-0.5 w-32">Owner</th>}
                    <th className="font-medium py-0.5 w-12 text-right">Used</th>
                  </tr>
                </thead>
                <tbody>
                  {s.top.map(p => (
                    <tr key={p.id} className="border-t border-gray-100">
                      <td className="py-1 pr-2 text-gray-700 truncate max-w-0">{p.name}</td>
                      <td className="py-1 text-gray-500">{typeLabels[p.diagramType] ?? p.diagramType}</td>
                      {s.top.some(t => t.ownerLabel) && <td className="py-1 text-gray-500 truncate">{p.ownerLabel ?? "—"}</td>}
                      <td className="py-1 text-right tabular-nums text-gray-700">{p.useCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <p className="text-[9px] text-gray-400 leading-relaxed px-1">
            Usage has been counted since 11 September 2026, plus a one-off backfill from every diagram that still
            records the prompt it was generated from. A diagram that has since been deleted no longer contributes —
            so a count is a floor, not a total.
          </p>
        </div>
      </div>
    </div>
  );
}
