"use client";
/**
 * Test Voice Assist — the text leg.
 *
 * Generate N commands, parse each one, and score which layer failed. **It all
 * runs in this browser**: the generator, the scorer and the grammar are pure
 * modules, so there is no route, no server work and no cost. A thousand cases
 * take about a second.
 *
 * The value is the comparison, not the absolute number: run it before a change
 * to `commandGrammar.ts` and after, and the difference is the blast radius —
 * which is a thing you can read, where today it is a thing you hope about.
 *
 * Only the per-row **investigate** button spends anything, and only on the row
 * somebody clicked.
 */
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { generateCases, FAMILY_NAMES, NOT_GENERATED } from "@/app/lib/assist/commandGenerator";
import { scoreCase, summarise, isFailure, type CaseResult, type Outcome } from "@/app/lib/assist/commandScore";
import { fixtureElements, fixtureDiagram } from "@/app/lib/assist/commandFixture";
import { DEFAULT_CORPUS_SEED } from "@/app/lib/assist/rng";
import { RecorderPanel } from "./RecorderPanel";
import { ReplayPanel } from "./ReplayPanel";
import { RecogniserBadge } from "./RecogniserBadge";
import { FamilyCasesWindow } from "./FamilyCasesWindow";
import { OUTCOME_STYLE, OUTCOME_MEANS } from "./outcomeStyle";
import { TestVoicePanel } from "./TestVoicePanel";


export function VoiceAssistTestClient() {
  const [tab, setTab] = useState<"text" | "record" | "replay" | "test-voice">("text");
  const [seed, setSeed] = useState(DEFAULT_CORPUS_SEED);
  const [count, setCount] = useState(200);
  const [family, setFamily] = useState<string>("");
  const [results, setResults] = useState<CaseResult[] | null>(null);
  const [ranMs, setRanMs] = useState(0);
  const [openFamily, setOpenFamily] = useState<string | null>(null);
  const [failuresOnly, setFailuresOnly] = useState(true);
  const [explaining, setExplaining] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>({});

  const run = useCallback(() => {
    const t0 = performance.now();
    const els = fixtureElements();
    const cases = generateCases({
      seed, count,
      world: els,
      ...(family ? { families: [family] } : {}),
    });
    // L4 too: each case is applied to its own headless copy of the fixture.
    setResults(cases.map((c) => scoreCase(c, undefined, els, { diagram: fixtureDiagram() })));
    setRanMs(Math.round(performance.now() - t0));
    setExplanations({});
  }, [seed, count, family]);

  const summary = useMemo(() => (results ? summarise(results) : null), [results]);
  const shown = useMemo(
    () => (results ?? []).filter((r) => (failuresOnly ? isFailure(r.outcome) : true)),
    [results, failuresOnly],
  );

  const investigate = async (r: CaseResult) => {
    setExplaining(r.caseId);
    try {
      const res = await fetch("/api/admin/voice-assist-test/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          utterance: r.heard, heard: r.heard, outcome: r.outcome,
          expected: r.expected, actual: r.actual, detail: r.detail,
        }),
      });
      const j = await res.json();
      setExplanations((p) => ({ ...p, [r.caseId]: j.explanation ?? j.error ?? "no answer" }));
    } catch (e) {
      setExplanations((p) => ({ ...p, [r.caseId]: e instanceof Error ? e.message : "failed" }));
    } finally {
      setExplaining(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-1">
        <Link href="/dashboard/admin" className="text-xs text-gray-500 hover:text-gray-700">← SuperAdmin</Link>
      </div>
      <h1 className="text-xl font-semibold text-gray-800 mb-1">Test Voice Assist</h1>

      <RecogniserBadge />

      <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
        {([["text", "Text leg — free"], ["record", "Record clips"], ["replay", "Replay — the real test"], ["test-voice", "Test voice"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1.5 text-xs -mb-px border-b-2 ${tab === k ? "border-purple-600 text-purple-700 font-medium" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "test-voice" ? <TestVoicePanel /> : tab === "record" ? <RecorderPanel /> : tab === "replay" ? <ReplayPanel /> : (
      <>
      <p className="text-xs text-gray-500 mb-4 max-w-3xl">
        Generates commands from the op vocabulary, parses each one, and says <strong>which layer</strong> failed.
        It all runs in this browser — the generator, the scorer and the grammar are pure — so a thousand cases
        cost nothing and take about a second. <strong>Run it before a grammar change and after: the difference is the blast radius.</strong>
        {" "}Only <em>investigate</em> spends anything.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-xs text-gray-700">
          <div className="mb-0.5">Seed</div>
          <input value={seed} onChange={(e) => setSeed(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-xs w-56"
            title="Same seed, same corpus — so a red case can always be reached again" />
        </label>
        <label className="text-xs text-gray-700">
          <div className="mb-0.5">Cases</div>
          <input type="number" min={1} max={5000} value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(5000, Number(e.target.value) || 1)))}
            className="border border-gray-300 rounded px-2 py-1 text-xs w-24" />
        </label>
        <label className="text-xs text-gray-700">
          <div className="mb-0.5">Family</div>
          <select value={family} onChange={(e) => setFamily(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-xs">
            <option value="">all</option>
            {FAMILY_NAMES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <button onClick={run} className="text-xs text-white bg-purple-600 hover:bg-purple-700 rounded px-3 py-1.5">Run</button>
        {summary && <span className="text-xs text-gray-500">{summary.total} cases in {ranMs} ms</span>}
      </div>

      {summary && (
        <>
          <div className="flex flex-wrap items-center gap-4 mb-3 text-sm">
            <span className="font-semibold text-gray-800">
              {summary.passed}/{summary.total} passed
              <span className="text-gray-400 font-normal"> ({Math.round((summary.passed / summary.total) * 100)}%)</span>
            </span>
            <span className="text-xs text-gray-600">
              fallback rate <strong>{Math.round(summary.fallbackRate * 1000) / 10}%</strong>
              <span className="text-gray-400"> — what the grammar refuses and the AI is billed for</span>
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {(Object.entries(summary.byOutcome) as Array<[Outcome, number]>)
              .sort((a, b) => b[1] - a[1])
              .map(([o, n]) => (
                <span key={o} className={`px-1.5 py-0.5 rounded text-[11px] ${OUTCOME_STYLE[o] ?? "bg-gray-100"}`} title={OUTCOME_MEANS[o]}>
                  {o} {n}
                </span>
              ))}
          </div>

          <table className="w-full text-xs border border-gray-200 mb-4">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-2 py-1 border-b border-gray-200">Family</th>
                <th className="text-right px-2 py-1 border-b border-gray-200">Cases</th>
                <th className="text-right px-2 py-1 border-b border-gray-200">Passed</th>
                <th className="text-right px-2 py-1 border-b border-gray-200">Failed</th>
                <th className="text-right px-2 py-1 border-b border-gray-200">Rate</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(summary.byFamily).sort((a, b) => b[1].failed - a[1].failed).map(([f, v]) => (
                <tr key={f} className={v.failed ? "bg-red-50" : ""}>
                  <td className="px-2 py-1 border-b border-gray-100">
                    <button onClick={() => setOpenFamily(f)} className="text-purple-700 hover:underline"
                      title="Show every case in this family and how it scored">{f}</button>
                  </td>
                  <td className="px-2 py-1 border-b border-gray-100 text-right">{v.total}</td>
                  <td className="px-2 py-1 border-b border-gray-100 text-right">{v.passed}</td>
                  <td className="px-2 py-1 border-b border-gray-100 text-right font-semibold">{v.failed || ""}</td>
                  <td className="px-2 py-1 border-b border-gray-100 text-right">{Math.round((v.passed / v.total) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          <label className="flex items-center gap-1.5 text-xs text-gray-700 mb-2">
            <input type="checkbox" checked={failuresOnly} onChange={(e) => setFailuresOnly(e.target.checked)} />
            failures only ({shown.length} shown)
          </label>

          <div className="space-y-1.5">
            {shown.map((r) => (
              <div key={r.caseId} className={`border rounded p-2 text-xs ${isFailure(r.outcome) ? "border-red-100 bg-red-50" : "border-gray-100"}`}>
                <div className="flex items-start gap-2">
                  <span className={`px-1 rounded text-[10px] shrink-0 ${OUTCOME_STYLE[r.outcome]}`} title={OUTCOME_MEANS[r.outcome]}>{r.outcome}</span>
                  <span className="text-gray-400 text-[10px] shrink-0">{r.family}</span>
                  <span className="flex-1 min-w-0">
                    <span className="text-gray-800">“{r.heard}”</span>
                    {r.detail && <span className="text-gray-500"> — {r.detail}</span>}
                  </span>
                  {isFailure(r.outcome) && (
                    <button onClick={() => { void investigate(r); }} disabled={explaining === r.caseId}
                      className="shrink-0 px-1.5 py-0.5 rounded border border-gray-300 hover:bg-white disabled:opacity-50"
                      title="Ask the AI to explain this ONE failure — the only thing on this page that costs anything">
                      {explaining === r.caseId ? "…" : "investigate"}
                    </button>
                  )}
                </div>
                {explanations[r.caseId] && (
                  <div className="mt-1.5 ml-1 text-[11px] text-gray-700 whitespace-pre-wrap border-l-2 border-purple-200 pl-2">
                    {explanations[r.caseId]}
                  </div>
                )}
              </div>
            ))}
            {shown.length === 0 && <p className="text-xs text-gray-500">Nothing failed.</p>}
          </div>
        </>
      )}

      {openFamily && results && (
        <FamilyCasesWindow family={openFamily} results={results.filter((r) => r.family === openFamily)}
          onClose={() => setOpenFamily(null)} />
      )}

      <details className="mt-6">
        <summary className="text-xs text-gray-500 cursor-pointer">Ops this corpus does not cover, and why</summary>
        <ul className="mt-2 text-[11px] text-gray-600 space-y-1">
          {Object.entries(NOT_GENERATED).map(([op, why]) => (
            <li key={op}><strong>{op}</strong> — {why}</li>
          ))}
        </ul>
      </details>
      </>
      )}
    </div>
  );
}
