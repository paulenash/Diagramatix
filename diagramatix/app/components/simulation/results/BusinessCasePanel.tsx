"use client";

/**
 * The business case — pick the two sides, supply the few figures the simulation
 * cannot know, and get money with a date on it, exportable to Word, Excel or PDF.
 *
 * Two things this panel is careful about, because they decide whether the case
 * survives being read by a finance director:
 *  - a missing input is shown as missing, never as zero;
 *  - the two kinds of waiting are never pooled, because one is answered by
 *    capacity and the other is not.
 */

import { useCallback, useEffect, useState } from "react";
import type { BusinessCaseFacts, BusinessCaseInputs, SideCosts } from "@/app/lib/simulation/facts/businessCase";
import { DiagramatixThrobber } from "@/app/components/DiagramatixThrobber";

interface ScenarioLite { id: string; name: string; isBaseline?: boolean }

const money = (n: number) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
const inp = "bg-black/40 border border-green-500/40 rounded px-1.5 py-0.5 text-green-200 text-[10px] w-24";

export function BusinessCasePanel({ baseUrl, scenarios, savedInputs }: {
  /** `/api/projects/:id/simulation/studies/:studyId/business-case` */
  baseUrl: string;
  scenarios: ScenarioLite[];
  savedInputs?: BusinessCaseInputs;
}) {
  const withRun = scenarios;
  const [baseId, setBaseId] = useState(() => (withRun.find((s) => s.isBaseline) ?? withRun[0])?.id ?? "");
  const [tobeId, setTobeId] = useState(() => withRun.find((s) => s.id !== (withRun.find((x) => x.isBaseline) ?? withRun[0])?.id)?.id ?? "");

  const [impl, setImpl] = useState(savedInputs?.implementationCost?.toString() ?? "");
  const [vol, setVol] = useState(savedInputs?.annualVolume?.toString() ?? "");
  const [delay, setDelay] = useState(savedInputs?.costOfDelayPerHour?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  const [facts, setFacts] = useState<BusinessCaseFacts | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const saveInputs = useCallback(async () => {
    setSaving(true);
    try {
      await fetch(baseUrl, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ implementationCost: impl, annualVolume: vol, costOfDelayPerHour: delay }),
      });
    } finally { setSaving(false); }
  }, [baseUrl, impl, vol, delay]);

  const build = useCallback(async () => {
    if (!baseId || !tobeId || baseId === tobeId) { setErr("Pick two different scenarios."); return; }
    setBusy(true); setErr(null);
    try {
      await saveInputs();
      const res = await fetch(baseUrl, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baselineScenarioId: baseId, compareScenarioId: tobeId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? "Could not build the business case"); return; }
      setFacts(json.facts ?? null);
      setNarrative(json.narrative ?? null);
      setTruncated(json.truncated === true);
    } catch {
      setErr("Could not build the business case");
    } finally { setBusy(false); }
  }, [baseUrl, baseId, tobeId, saveInputs]);

  useEffect(() => { setFacts(null); setNarrative(null); }, [baseId, tobeId]);

  const exportUrl = (format: string) =>
    `${baseUrl}?format=${format}&baselineScenarioId=${encodeURIComponent(baseId)}&compareScenarioId=${encodeURIComponent(tobeId)}`;

  const waitRow = (label: string, pick: (s: SideCosts) => number, cost: (s: SideCosts) => number | undefined) => (
    <tr className="border-b border-green-500/10">
      <td className="py-0.5 pr-2 text-green-400/70">{label}</td>
      {[facts!.base, facts!.tobe].map((s, i) => (
        <td key={i} className="py-0.5 pr-2 text-right text-green-200 tabular-nums whitespace-nowrap">
          {pick(s).toLocaleString(undefined, { maximumFractionDigits: 2 })} h
          {cost(s) !== undefined && <span className="text-green-400/60"> · {money(cost(s)!)}</span>}
        </td>
      ))}
    </tr>
  );

  return (
    <div className="flex flex-col gap-2 text-[10px]">
      {/* the two sides */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-green-400/60">Compare</span>
        <select value={baseId} onChange={(e) => setBaseId(e.target.value)} className={`${inp} w-auto`}>
          {withRun.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="text-green-400/60">with</span>
        <select value={tobeId} onChange={(e) => setTobeId(e.target.value)} className={`${inp} w-auto`}>
          {withRun.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* the figures the simulation cannot know */}
      <div className="flex items-end gap-3 flex-wrap">
        <label className="flex flex-col gap-0.5">
          <span className="text-green-400/60">One-off cost</span>
          <input value={impl} onChange={(e) => setImpl(e.target.value)} placeholder="—" inputMode="decimal" className={inp} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-green-400/60">Cases a year</span>
          <input value={vol} onChange={(e) => setVol(e.target.value)} placeholder="—" inputMode="decimal" className={inp} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-green-400/60" title="Business cost of an hour of elapsed time — penalties, lost revenue, working capital. NOT staff cost, which the cost of doing already carries.">
            Cost of delay /h
          </span>
          <input value={delay} onChange={(e) => setDelay(e.target.value)} placeholder="optional" inputMode="decimal" className={inp} />
        </label>
        <button onClick={build} disabled={busy || saving}
          className="rounded px-2 py-0.5 border border-green-400/60 text-green-200 hover:bg-green-400/10 disabled:opacity-40">
          {busy ? "Building…" : "£ Build the case"}
        </button>
        {(busy || saving) && <DiagramatixThrobber size={14} tone="amber" />}
      </div>
      <p className="text-green-400/40">
        Leave a field blank and the case says what is missing rather than assuming a zero. Cost of delay is the
        business cost of elapsed time only — staff cost is already counted in the cost of doing.
      </p>

      {err && <p className="text-red-400">{err}</p>}

      {facts && (
        <>
          {narrative && (
            <div className="rounded border border-green-500/30 bg-green-400/5 p-2 text-[11px] text-green-200/90 whitespace-pre-wrap leading-relaxed">
              {narrative}
              {truncated && (
                <p className="text-amber-400/80 text-[10px] mt-1">
                  ⚠ This case was cut off before it finished — rebuild it.
                </p>
              )}
            </div>
          )}

          <table className="w-full border-collapse">
            <thead>
              <tr className="text-green-400/50">
                <th className="text-left font-normal py-0.5 pr-2">Per case</th>
                <th className="text-right font-normal py-0.5 pr-2">{facts.base.name}</th>
                <th className="text-right font-normal py-0.5 pr-2">{facts.tobe.name}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-green-500/10">
                <td className="py-0.5 pr-2 text-green-400/70">Cost of doing the work</td>
                <td className="py-0.5 pr-2 text-right text-green-200 tabular-nums">{money(facts.base.doingPerCase)}</td>
                <td className="py-0.5 pr-2 text-right text-green-200 tabular-nums">{money(facts.tobe.doingPerCase)}</td>
              </tr>
              {!facts.base.waitingUnmeasured && !facts.tobe.waitingUnmeasured && (
                <>
                  {waitRow("Queueing for a person", (s) => s.queueHoursPerCase, (s) => s.queueCostPerCase)}
                  {waitRow("Waiting on the process", (s) => s.processHoursPerCase, (s) => s.processCostPerCase)}
                </>
              )}
              <tr>
                <td className="py-0.5 pr-2 text-green-300">Total</td>
                <td className="py-0.5 pr-2 text-right text-green-100 tabular-nums">{money(facts.base.totalPerCase)}</td>
                <td className="py-0.5 pr-2 text-right text-green-100 tabular-nums">{money(facts.tobe.totalPerCase)}</td>
              </tr>
            </tbody>
          </table>

          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <Fig label="Saving per case" value={`${money(facts.perCaseSaving)} (${facts.perCasePct}%)`} />
            {facts.annualSaving !== undefined && <Fig label="A year" value={money(facts.annualSaving)} />}
            {facts.paybackMonths !== undefined && <Fig label="Pays back in" value={`${facts.paybackMonths} months`} />}
          </div>
          {facts.paybackNote && <p className="text-amber-300/80">{facts.paybackNote}</p>}

          {facts.missing.length > 0 && (
            <div>
              <p className="text-green-400/60">What would sharpen this</p>
              <ul className="list-disc ml-4 text-green-400/60">
                {facts.missing.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-green-400/50">Export</span>
            <a className="text-green-300 hover:text-green-200 underline" href={exportUrl("docx")}>Word</a>
            <a className="text-green-300 hover:text-green-200 underline" href={exportUrl("xlsx")}>Excel</a>
            <a className="text-green-300 hover:text-green-200 underline" href={exportUrl("pdf")} target="_blank" rel="noopener">PDF</a>
          </div>
        </>
      )}
    </div>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-green-400/50">{label}</span>
      <span className="text-green-100 tabular-nums">{value}</span>
    </span>
  );
}
