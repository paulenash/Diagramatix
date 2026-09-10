"use client";

/**
 * "Did it get better or worse?" — the question everybody asks second, and the
 * one the Miner could not answer on any screen until now.
 *
 * Phase 9 shipped `compareRuns` and the `series` route; Phase 10 shipped the
 * alert rules. Both were reachable only by the cron and by curl. That is a
 * particular kind of gap: fully built, fully tested, and worth nothing to the
 * person the product is for. Phase 11 forced it, because the Accounts Payable
 * example ships three period logs whose entire lesson is compliance decaying
 * over time — an example that could not be run.
 *
 * Two things this deliberately does NOT do.
 *
 * It does not compute. Every delta, every refusal and every alert on this
 * screen was produced server-side by the same functions the cron uses, so the
 * panel and the email cannot disagree about whether anything is wrong. This
 * component fetches and renders.
 *
 * And it does not soften a refusal. When `compareRuns` says the two runs are
 * too different to compare, that sentence IS the answer — it is not demoted to
 * a caveat above a table of deltas that would all be nonsense.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDuration, pickClockUnit } from "@/app/lib/mining/analytics";
import type { RunComparison, FitnessPoint } from "@/app/lib/mining/compareRuns";
import type { MiningAlert } from "@/app/lib/mining/alerts";
import { DiagramatixThrobber } from "@/app/components/DiagramatixThrobber";

interface SeriesResponse {
  series: { id: string; name: string; createdAt: string }[];
  history: FitnessPoint[];
  comparison: RunComparison | null;
  alerts: MiningAlert[];
  notEvaluated: string[];
  truncated?: boolean;
  note?: string;
}

export interface CompareTabProps {
  projectId: string;
  runId: string;
}

interface RunOption { id: string; name: string; createdAt: string }

const pct = (x: number) => Math.round(x * 100) + "%";
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** A duration, in whatever unit a delay of that size should be read in. The
 *  unit is chosen by the shared rule rather than a local one, so a hand-off
 *  described in hours on the Between-steps tab is not described in minutes
 *  here. */
const dur = (ms: number) => formatDuration(Math.abs(ms), pickClockUnit(Math.abs(ms)));

/** A delta's units are not in the payload, so they are read off the label —
 *  the same convention `compareRuns` writes them under. */
function formatValue(label: string, v: number): string {
  if (/fitness|rate|share/i.test(label)) return pct(v);
  if (/time|cycle|duration|median|p90/i.test(label)) return dur(v);
  return Math.abs(v).toLocaleString();
}

export function CompareTab({ projectId, runId }: CompareTabProps) {
  const [against, setAgainst] = useState("");
  const [otherRuns, setOtherRuns] = useState<RunOption[]>([]);
  const [data, setData] = useState<SeriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = against ? "?against=" + encodeURIComponent(against) : "";
      const res = await fetch("/api/projects/" + projectId + "/mining/runs/" + runId + "/series" + qs, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json.error ?? "Could not load the comparison.");
        setData(null);
        return;
      }
      setData(json as SeriesResponse);
    } catch {
      setErr("Could not load the comparison.");
    } finally {
      setLoading(false);
    }
  }, [projectId, runId, against]);

  useEffect(() => { void load(); }, [load]);

  // The picker's options. Fetched here rather than threaded down from the
  // console: nothing between the two screens needs to know that this tab offers
  // a choice, and a prop passed through three components to reach one <select>
  // is how a panel ends up with twenty of them.
  useEffect(() => {
    fetch("/api/projects/" + projectId + "/mining/runs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { runs: [] }))
      .then((j) => setOtherRuns(j.runs ?? []))
      .catch(() => {});
  }, [projectId]);

  const cmp = data?.comparison ?? null;
  // Newest first: the run you want to compare against is nearly always the one
  // just before this one.
  const pickable = useMemo(
    () => otherRuns.filter((r) => r.id !== runId).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [otherRuns, runId],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        <span className="text-stone-400">Compare this run against</span>
        <select
          value={against}
          onChange={(e) => setAgainst(e.target.value)}
          className="bg-stone-800 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs max-w-[22rem]"
        >
          <option value="">its own history (linked snapshots)</option>
          {pickable.map((r) => (
            <option key={r.id} value={r.id}>{r.name} — {shortDate(r.createdAt)}</option>
          ))}
        </select>
        {pickable.length === 0 && (
          <span className="text-stone-500">This project has only one run — mine another period and the two can be put side by side.</span>
        )}
      </div>

      <p className="text-[10px] text-stone-500 leading-snug">
        A comparison is always of the two runs WHOLE. The filter above describes this run only — the
        other one was never sliced, and two differently-sliced runs put side by side is a table of
        numbers nobody can cite.
      </p>

      {loading && <div className="py-6 flex items-center gap-2 text-[11px] text-stone-400"><DiagramatixThrobber size={16} tone="amber" />Comparing…</div>}
      {err && <p className="text-[11px] text-red-300">{err}</p>}

      {!loading && data && (
        <>
          <WatchBlock alerts={data.alerts} notEvaluated={data.notEvaluated} />

          {data.history.length > 1 && <History history={data.history} />}

          {!cmp && <p className="text-[11px] text-stone-400 leading-snug">{data.note}</p>}

          {cmp && !cmp.ok && (
            // The refusal, at full size. Demoting this to a warning above a
            // table would be the most misleading thing this screen could do:
            // every delta between two different processes is enormous, and
            // every one of them reads like a finding.
            <div className="rounded border border-red-700/60 bg-red-950/25 p-3">
              <p className="text-xs font-semibold text-red-200 mb-1">These two runs are not comparable</p>
              <p className="text-[11px] text-red-100/80 leading-snug">{cmp.refusal}</p>
              <p className="text-[10px] text-stone-400 mt-2">
                They share {pct(cmp.overlap)} of their activities. Comparing them would report a different
                process as a dramatic regression.
              </p>
            </div>
          )}

          {cmp?.ok && <Comparison cmp={cmp} />}
        </>
      )}
    </div>
  );
}

/** The alert rules' verdict on this run, asked now rather than on the schedule. */
function WatchBlock({ alerts, notEvaluated }: { alerts: MiningAlert[]; notEvaluated: string[] }) {
  const [showQuiet, setShowQuiet] = useState(false);
  return (
    <div className="rounded border border-stone-700 bg-stone-900/60 p-2.5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-semibold text-amber-200">What would be raised right now</span>
        <span className="text-[10px] text-stone-500">the same rules the schedule uses</span>
        {notEvaluated.length > 0 && (
          <button onClick={() => setShowQuiet((v) => !v)} className="ml-auto text-[11px] text-amber-300 hover:text-amber-200">
            {showQuiet ? "hide what is not watched" : notEvaluated.length + " not watched"}
          </button>
        )}
      </div>

      {alerts.length === 0 ? (
        <p className="text-[11px] text-stone-300">Nothing would be raised.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {alerts.map((a, i) => (
            <div
              key={i}
              className={"rounded border p-2 " + (a.severity === "error" ? "border-red-700/60 bg-red-950/25" : "border-amber-700/50 bg-amber-950/20")}
            >
              <p className={"text-[11px] font-medium " + (a.severity === "error" ? "text-red-200" : "text-amber-200")}>{a.title}</p>
              <p className="text-[10px] text-stone-300 leading-snug mt-0.5">{a.detail}</p>
            </div>
          ))}
        </div>
      )}

      {/* Silence reads as a clean bill of health, so what ISN'T watched is
          available by name rather than left out. */}
      {showQuiet && (
        <ul className="mt-2 flex flex-col gap-1">
          {notEvaluated.map((n, i) => (
            <li key={i} className="text-[10px] text-stone-400 leading-snug">— {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Conformance across the series — a bar per observation, which is honest about
 *  how few observations there usually are. */
function History({ history }: { history: FitnessPoint[] }) {
  const measured = history.filter((h) => h.fitness !== null).map((h) => h.fitness as number);
  const max = measured.length > 0 ? Math.max(...measured) : 1;
  return (
    <div className="rounded border border-stone-700 bg-stone-900/60 p-2.5">
      <p className="text-xs font-semibold text-amber-200 mb-1.5">Conformance over the series</p>
      <div className="flex flex-col gap-1">
        {history.map((h) => (
          <div key={h.runId} className="flex items-center gap-2">
            <span className="text-[10px] text-stone-400 w-40 truncate" title={h.name}>{h.name}</span>
            <span className="text-[10px] text-stone-500 w-20">{shortDate(h.at)}</span>
            <div className="flex-1 h-2 bg-stone-800 rounded overflow-hidden">
              {h.fitness !== null && (
                <div className="h-full bg-amber-600" style={{ width: ((h.fitness / max) * 100) + "%" }} />
              )}
            </div>
            {/* Never checked is NOT 0%. A run with no reference model has no
                fitness, and printing zero would invent a catastrophe. */}
            <span className="text-[10px] w-24 text-right text-stone-300">
              {h.fitness === null ? <span className="text-stone-500">not checked</span> : pct(h.fitness)}
            </span>
            <span className="text-[10px] w-16 text-right text-stone-500">{h.cases.toLocaleString()} cases</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Comparison({ cmp }: { cmp: RunComparison }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-stone-400">
        <span className="text-stone-300">{cmp.before.name}</span>{" "}
        <span className="text-stone-500">({shortDate(cmp.before.createdAt)})</span>
        {" → "}
        <span className="text-stone-300">{cmp.after.name}</span>{" "}
        <span className="text-stone-500">({shortDate(cmp.after.createdAt)})</span>
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-stone-400 border-b border-stone-700">
              <th className="text-left font-normal py-1">Measure</th>
              <th className="text-right font-normal py-1">Before</th>
              <th className="text-right font-normal py-1">After</th>
              <th className="text-right font-normal py-1">Change</th>
            </tr>
          </thead>
          <tbody>
            {cmp.headline.map((d) => {
              const flat = d.change === 0;
              const better = d.betterWhen === "lower" ? d.change < 0 : d.change > 0;
              return (
                <tr key={d.label} className="border-b border-stone-800/60">
                  <td className="py-1 text-stone-300">{d.label}</td>
                  <td className="py-1 text-right text-stone-400">{formatValue(d.label, d.before)}</td>
                  <td className="py-1 text-right text-stone-200">{formatValue(d.label, d.after)}</td>
                  <td className={"py-1 text-right " + (flat ? "text-stone-500" : better ? "text-emerald-300" : "text-red-300")}>
                    {flat ? "—" : (d.change > 0 ? "+" : "−") + formatValue(d.label, d.change)}
                    {d.changePct !== null && !flat && (
                      <span className="text-stone-500"> ({d.changePct > 0 ? "+" : ""}{Math.round(d.changePct * 100)}%)</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {cmp.activities.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-200 mb-1">Which steps moved</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <tbody>
                {cmp.activities.slice(0, 12).map((a) => (
                  <tr key={a.activity} className="border-b border-stone-800/60">
                    <td className="py-1 text-stone-300">{a.activity}</td>
                    <td className="py-1 text-right text-stone-500 w-24">
                      {a.status === "added" ? "new" : dur(a.beforeMs ?? 0)}
                    </td>
                    <td className="py-1 text-right text-stone-200 w-24">
                      {a.status === "removed" ? "gone" : dur(a.afterMs ?? 0)}
                    </td>
                    <td className={"py-1 text-right w-28 " + (a.changeMs === null ? "text-stone-500" : a.changeMs > 0 ? "text-red-300" : "text-emerald-300")}>
                      {a.changeMs === null ? "—" : (a.changeMs > 0 ? "+" : "−") + dur(a.changeMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(cmp.newViolations.length > 0 || cmp.clearedViolations.length > 0) && (
        <div className="grid md:grid-cols-2 gap-2">
          {cmp.newViolations.length > 0 && (
            <div className="rounded border border-red-800/50 bg-red-950/20 p-2">
              <p className="text-[11px] font-medium text-red-200 mb-1">Deviations that appeared</p>
              <ul className="flex flex-col gap-0.5">
                {cmp.newViolations.map((v, i) => <li key={i} className="text-[10px] text-stone-300 leading-snug">— {v}</li>)}
              </ul>
            </div>
          )}
          {cmp.clearedViolations.length > 0 && (
            <div className="rounded border border-emerald-800/50 bg-emerald-950/20 p-2">
              <p className="text-[11px] font-medium text-emerald-200 mb-1">Deviations that went away</p>
              <ul className="flex flex-col gap-0.5">
                {cmp.clearedViolations.map((v, i) => <li key={i} className="text-[10px] text-stone-300 leading-snug">— {v}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {(cmp.added.length > 0 || cmp.removed.length > 0) && (
        <p className="text-[10px] text-stone-400 leading-snug">
          {cmp.added.length > 0 && <>New activities: <span className="text-stone-300">{cmp.added.join(", ")}</span>. </>}
          {cmp.removed.length > 0 && <>No longer seen: <span className="text-stone-300">{cmp.removed.join(", ")}</span>.</>}
        </p>
      )}

      {/* Caveats the comparison attached to itself — sampling, missing
          analytics, a run that was never conformance-checked. */}
      {cmp.notes.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {cmp.notes.map((n, i) => <li key={i} className="text-[10px] text-stone-500 leading-snug">— {n}</li>)}
        </ul>
      )}
    </div>
  );
}
