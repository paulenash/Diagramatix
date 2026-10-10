"use client";

/**
 * Create a New Value Chain — the wizard (Paul, 2026-10-10; Expert and above).
 *
 * Describe a value chain and its processes in plain language and the Master Prompt templates write its diagram prompts. The chain joins the
 * Org's Process Repository as C01, C02… and is managed by its owner, the OrgAdmin and the SuperAdmin ("My Value Chains").
 *
 *   1 The value chain   name + a general description
 *   2 The processes     5–12, each with its specific details; "Suggest processes" proposes a list to edit
 *   3 What to create    Value Chain + Context always; Process Context and ArchiMate optional; the AI attempts this will use
 *   4 Check narrative   the structured narrative the generators read, built from 1–2; read it, edit it, approve it
 *   5 A few questions   the same up-to-ten questions as Create Project from Process Repository (skippable)
 *   6 Create            allocate the code, write the prompts one by one, publish when complete; "Carry on" if a run stops
 *
 * Nothing is written to the repository until step 6. The server enforces everything this dialog shows (access, the 5–12 bounds, the allowance
 * and the Org's chain limit); the dialog's checks are a convenience so a problem is found before an AI call is spent on it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefineQuestionsDialog } from "@/app/components/RefineQuestionsDialog";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import type { RefineQuestion } from "@/app/lib/ai/refineQuestions";
import {
  MAX_PROCESSES, MIN_PROCESSES, MIN_NARRATIVE_CHARS, normaliseBrief, validateBuiltNarrative, type BriefProcess,
} from "@/app/lib/valueChain/chainNarrative";
import { plannedPromptCount, type NewChainOptions } from "@/app/lib/valueChain/newChainPlan";

interface Access { allowed: boolean; reason?: string; attemptsLeft?: number | null; chainsUsed?: number; chainsMax?: number | null }
interface Built { narrative: string; provisionalCode: string; templateVersion: number; signature: string }
type RowStatus = "pending" | "generating" | "done" | "error" | "refused";
interface Row { name: string; status: RowStatus; message?: string }
type Answers = { label: string; answer: string }[];

const STEPS = ["The value chain", "The processes", "What to create", "Check the narrative", "A few questions", "Create"];
const HINTS = [
  "what the value chain is for and what starts it", "what a good outcome looks like", "the teams and roles who take part",
  "the customers, suppliers or other outside parties", "the IT systems used", "the policies, rules and controls that matter",
];
const blankProcess = (): BriefProcess => ({ title: "", details: "" });
const sigOf = (title: string, general: string, ps: BriefProcess[]) => JSON.stringify([title.trim(), general.trim(), ps.map((p) => [p.title.trim(), p.details.trim()])]);

export function NewValueChainWizard({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [access, setAccess] = useState<Access | null>(null);
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [general, setGeneral] = useState("");
  const [processes, setProcesses] = useState<BriefProcess[]>(() => Array.from({ length: MIN_PROCESSES }, blankProcess));
  const [options, setOptions] = useState<NewChainOptions>({ processContext: false, archimate: false });
  const [built, setBuilt] = useState<Built | null>(null);
  const [narrativeEdited, setNarrativeEdited] = useState(false);
  const [answers, setAnswers] = useState<Answers>([]);
  const [questions, setQuestions] = useState<RefineQuestion[] | null>(null);
  const [questionsDone, setQuestionsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "suggest" | "build" | "questions" | "run">(null);
  const [confirm, setConfirm] = useState<null | { title: string; message: string; label: string; onYes: () => void }>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [chain, setChain] = useState<{ id: string; code: string } | null>(null);
  const [outcome, setOutcome] = useState<null | { complete: boolean; published: boolean; written: number; failed: number; missing: number }>(null);
  const stepBody = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/repository/new-chain/access").then((r) => r.json()).then((j: Access) => { if (live) setAccess(j); }).catch(() => { if (live) setAccess({ allowed: false, reason: "Could not check your access." }); });
    return () => { live = false; };
  }, []);
  useEffect(() => { stepBody.current?.scrollTo({ top: 0 }); }, [step]);

  const brief = useMemo(() => normaliseBrief({ title, generalNarrative: general, processes }), [title, general, processes]);
  const signature = sigOf(title, general, processes);
  const total = plannedPromptCount(options, processes.length);
  const left = access?.attemptsLeft;
  const affordable = left === null || left === undefined || left >= total;

  // ── per-step readiness ──
  const step1Ok = title.trim().length > 0 && general.trim().length >= MIN_NARRATIVE_CHARS;
  const step2Ok = brief.problems.every((p) => !/process|called/i.test(p)) && processes.length >= MIN_PROCESSES && processes.length <= MAX_PROCESSES;
  const narrativeProblems = built ? validateBuiltNarrative(built.narrative, built.provisionalCode, brief.brief) : ["Not built yet."];
  const step4Ok = !!built && narrativeProblems.length === 0 && built.signature === signature;
  const assumedCount = built ? (built.narrative.match(/\(assumed\)/g) ?? []).length : 0;

  const call = useCallback(async (path: string, body: unknown) => {
    const res = await fetch(`/api/repository/new-chain/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok, j: j as Record<string, unknown> };
  }, []);

  // ── step 2: suggest ──
  const doSuggest = useCallback(async () => {
    setBusy("suggest"); setError(null);
    try {
      const { ok, j } = await call("suggest-processes", { title, generalNarrative: general });
      if (!ok) { setError(String(j.message ?? j.error ?? "Could not suggest processes.")); return; }
      const list = (j.processes as { title: string; details: string }[]) ?? [];
      setProcesses(list.map((p) => ({ title: p.title, details: p.details })));
    } finally { setBusy(null); }
  }, [call, title, general]);
  const suggest = () => {
    if (processes.some((p) => p.title.trim() || p.details.trim())) {
      setConfirm({ title: "Replace your list?", message: "Suggesting processes replaces the list you have so far with a new one to edit.", label: "Replace", onYes: () => { setConfirm(null); void doSuggest(); } });
    } else void doSuggest();
  };

  // ── step 4: build ──
  const doBuild = useCallback(async () => {
    setBusy("build"); setError(null); setNote(null);
    try {
      const { ok, j } = await call("build-narrative", { title, generalNarrative: general, processes });
      if (!ok) { setError(String(j.message ?? j.error ?? "Could not build the narrative.")); return; }
      setBuilt({ narrative: String(j.narrative), provisionalCode: String(j.provisionalCode), templateVersion: Number(j.templateVersion) || 1, signature });
      setNarrativeEdited(false); setQuestions(null); setQuestionsDone(false); setAnswers([]);
    } finally { setBusy(null); }
  }, [call, title, general, processes, signature]);
  const rebuild = () => {
    if (narrativeEdited) setConfirm({ title: "Build it again?", message: "You have edited the narrative. Building again discards your edits.", label: "Build again", onYes: () => { setConfirm(null); void doBuild(); } });
    else void doBuild();
  };

  // ── step 5: questions ──
  const loadQuestions = useCallback(async () => {
    if (!built) return;
    setBusy("questions"); setError(null);
    try {
      const { ok, j } = await call("questions", { title, narrative: built.narrative });
      if (!ok) { setError(String(j.error ?? "Could not prepare the questions.")); setQuestionsDone(true); return; }
      const qs = (j.questions as RefineQuestion[]) ?? [];
      if (qs.length === 0) setQuestionsDone(true); else setQuestions(qs);
    } finally { setBusy(null); }
  }, [call, title, built]);

  // ── step 6: create / carry on ──
  const readStream = useCallback(async (path: string, body: unknown) => {
    setBusy("run"); setError(null); setNote(null); setOutcome(null);
    try {
      const res = await fetch(`/api/repository/new-chain/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setError(String(j.message ?? j.error ?? `The run failed (${res.status})`));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          let m: Record<string, unknown>;
          try { m = JSON.parse(line); } catch { continue; }
          if (m.t === "chain") setChain({ id: String(m.chainId), code: String(m.code ?? "") });
          else if (m.t === "prompt") {
            const name = String(m.name);
            setRows((r) => {
              const next: Row = { name, status: m.status as RowStatus, message: m.message as string | undefined };
              const at = r.findIndex((x) => x.name === name);
              return at < 0 ? [...r, next] : r.map((x, i) => (i === at ? next : x));
            });
          } else if (m.t === "halted") setNote(String(m.message ?? "The run stopped."));
          else if (m.t === "error") setError(String(m.message ?? "The run failed."));
          else if (m.t === "done") setOutcome({ complete: m.complete === true, published: m.published === true, written: Number(m.written) || 0, failed: Number(m.failed) || 0, missing: Number(m.missing) || 0 });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The run failed.");
    } finally { setBusy(null); }
  }, []);
  const create = () => {
    if (!built) return;
    setRows([]);
    void readStream("create", { title, generalNarrative: general, processes, narrative: built.narrative, provisionalCode: built.provisionalCode, options, answers, narrativeTemplateVersion: built.templateVersion });
  };
  const carryOn = () => { if (chain) void readStream("resume", { chainId: chain.id }); };

  // ── navigation ──
  const canNext = step === 1 ? step1Ok : step === 2 ? step2Ok : step === 3 ? affordable : step === 4 ? step4Ok : step === 5 ? busy === null : false;
  const next = () => {
    setError(null);
    const to = step + 1;
    setStep(to);
    if (to === 4 && (!built || built.signature !== signature)) void doBuild();
    if (to === 5 && !questionsDone && !questions) void loadQuestions();
  };
  const back = () => { setError(null); setStep((s) => Math.max(1, s - 1)); };
  const running = busy === "run";
  const started = rows.length > 0 || chain !== null;

  // ── process list editing ──
  const setProc = (i: number, patch: Partial<BriefProcess>) => setProcesses((ps) => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const move = (i: number, d: -1 | 1) => setProcesses((ps) => { const j = i + d; if (j < 0 || j >= ps.length) return ps; const a = [...ps]; [a[i], a[j]] = [a[j], a[i]]; return a; });

  if (access && !access.allowed) {
    return (
      <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Create a New Value Chain</h3>
          <p className="text-sm text-gray-700 mb-4">{access.reason ?? "This is not available to you."}</p>
          <div className="flex justify-end"><button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">Close</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
      {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.label} destructive={false} onConfirm={confirm.onYes} onCancel={() => setConfirm(null)} />}
      {questions && !questionsDone && (
        <RefineQuestionsDialog
          questions={questions}
          onCancel={() => { setQuestions(null); setQuestionsDone(true); }}
          onSubmit={(a) => { setAnswers(a.filter((x) => x.answer.trim())); setQuestions(null); setQuestionsDone(true); }}
        />
      )}
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[92vh] flex flex-col">
        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Create a New Value Chain</h3>
            <span className="text-[11px] text-gray-500">Step {step} of {STEPS.length} — {STEPS[step - 1]}</span>
          </div>
          <div className="flex gap-1 mt-2" aria-hidden>
            {STEPS.map((_, i) => <span key={i} className={`h-1 flex-1 rounded ${i + 1 <= step ? "bg-indigo-500" : "bg-gray-200"}`} />)}
          </div>
        </div>

        <div ref={stepBody} className="p-5 overflow-y-auto min-h-0 flex-1 text-sm text-gray-800">
          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5 mb-3" role="alert">{error}</p>}

          {step === 1 && (
            <>
              <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1" htmlFor="nvc-title">Name of the value chain</label>
              <input id="nvc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Customer Onboarding"
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 mb-3 bg-white text-gray-800" />
              <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1" htmlFor="nvc-general">Describe it in your own words</label>
              <textarea id="nvc-general" value={general} onChange={(e) => setGeneral(e.target.value)} rows={10}
                placeholder="What is this value chain for, what starts it, who takes part, which systems are used, which rules apply, and what a good result looks like?"
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-800" />
              <p className="text-[11px] text-gray-500 mt-1">{general.trim().length < MIN_NARRATIVE_CHARS ? `A few sentences, please (at least ${MIN_NARRATIVE_CHARS} characters).` : `${general.trim().length} characters.`}</p>
              <div className="mt-3 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded px-3 py-2">
                <p className="font-medium text-gray-700 mb-1">Worth covering:</p>
                <ul className="list-disc ml-4 space-y-0.5">{HINTS.map((h) => <li key={h}>{h}</li>)}</ul>
                <p className="mt-1">Say what you know. Where you are silent, the narrative marks its own assumption <span className="font-mono">(assumed)</span> for you to correct.</p>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-600">List <strong>{MIN_PROCESSES}–{MAX_PROCESSES}</strong> processes in the order the work happens, with what you know about each. <span className={processes.length < MIN_PROCESSES || processes.length > MAX_PROCESSES ? "text-red-700" : "text-gray-500"}>({processes.length})</span></p>
                <button type="button" onClick={suggest} disabled={busy !== null} title="Propose a list from your description — one AI attempt"
                  className="px-2.5 py-1 text-xs rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">{busy === "suggest" ? "Suggesting…" : "Suggest processes"}</button>
              </div>
              <ol className="space-y-2">
                {processes.map((p, i) => (
                  <li key={i} className="border border-gray-200 rounded p-2 bg-white">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] text-gray-400 w-5 shrink-0">{i + 1}.</span>
                      <input value={p.title} onChange={(e) => setProc(i, { title: e.target.value })} maxLength={120} placeholder="Process name" aria-label={`Process ${i + 1} name`}
                        className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 bg-white text-gray-800" />
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="px-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30">↑</button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === processes.length - 1} aria-label="Move down" className="px-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30">↓</button>
                      <button type="button" onClick={() => setProcesses((ps) => ps.filter((_, k) => k !== i))} disabled={processes.length <= MIN_PROCESSES} aria-label="Remove" title={processes.length <= MIN_PROCESSES ? `A value chain needs at least ${MIN_PROCESSES} processes` : "Remove"} className="px-1.5 text-red-600 hover:text-red-800 disabled:opacity-30">✕</button>
                    </div>
                    <textarea value={p.details} onChange={(e) => setProc(i, { details: e.target.value })} rows={3} aria-label={`Process ${i + 1} details`}
                      placeholder="What happens, who does it, which systems, the decisions and what can go wrong…"
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-800" />
                  </li>
                ))}
              </ol>
              <button type="button" onClick={() => setProcesses((ps) => [...ps, blankProcess()])} disabled={processes.length >= MAX_PROCESSES}
                className="mt-2 px-2.5 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40">+ Add a process</button>
              {brief.problems.filter((p) => /process|called/i.test(p)).slice(0, 3).map((p) => <p key={p} className="text-[11px] text-amber-700 mt-1">{p}</p>)}
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-xs text-gray-600 mb-3">These prompts will be written. Each prompt uses one AI attempt.</p>
              <ul className="border border-gray-200 rounded divide-y divide-gray-100 text-sm mb-3">
                <li className="px-3 py-1.5 flex items-center gap-2"><input type="checkbox" checked disabled aria-label="Value Chain" /> <span className="flex-1">Value Chain diagram prompt</span><span className="text-[10px] text-gray-400">always</span></li>
                <li className="px-3 py-1.5 flex items-center gap-2"><input type="checkbox" checked disabled aria-label="Context" /> <span className="flex-1">Context diagram prompt</span><span className="text-[10px] text-gray-400">always</span></li>
                <li className="px-3 py-1.5 flex items-center gap-2"><input type="checkbox" checked disabled aria-label="BPMN" /> <span className="flex-1">{processes.length} BPMN process prompts</span><span className="text-[10px] text-gray-400">always</span></li>
                <li className="px-3 py-1.5 flex items-center gap-2"><input id="opt-pc" type="checkbox" checked={options.processContext} onChange={(e) => setOptions((o) => ({ ...o, processContext: e.target.checked }))} /> <label htmlFor="opt-pc" className="flex-1">Process Context diagram prompt</label><span className="text-[10px] text-gray-400">optional</span></li>
                <li className="px-3 py-1.5 flex items-center gap-2"><input id="opt-am" type="checkbox" checked={options.archimate} onChange={(e) => setOptions((o) => ({ ...o, archimate: e.target.checked }))} /> <label htmlFor="opt-am" className="flex-1">ArchiMate diagram prompt</label><span className="text-[10px] text-gray-400">optional</span></li>
              </ul>
              <p className="text-sm"><strong>{total}</strong> prompts — about <strong>{total + 1}</strong> AI attempts in all (one more to build the narrative).</p>
              <p className={`text-xs mt-1 ${affordable ? "text-gray-500" : "text-red-700"}`}>
                {left === null || left === undefined ? "You have no limit on AI attempts." : affordable ? `You have ${left} AI attempts left.` : `You have only ${left} AI attempts left — not enough to write ${total} prompts.`}
              </p>
              {access?.chainsMax != null && <p className="text-[11px] text-gray-500 mt-1">Your organisation has made {access.chainsUsed} of {access.chainsMax} value chains this way.</p>}
            </>
          )}

          {step === 4 && (
            <>
              <p className="text-xs text-gray-600 mb-2">This is the document the prompt writers read. Check it says what you meant, correct anything wrong, and mark nothing as <span className="font-mono">(assumed)</span> that you disagree with. Process headings must stay exactly as they are.</p>
              {busy === "build" && <p className="text-sm text-gray-500 py-8 text-center">Building the narrative… this takes up to a minute.</p>}
              {built && busy !== "build" && (
                <>
                  <textarea value={built.narrative} onChange={(e) => { setBuilt({ ...built, narrative: e.target.value }); setNarrativeEdited(true); }} rows={22} spellCheck
                    className="w-full text-xs font-mono border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-800" aria-label="Structured narrative" />
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-gray-500">{assumedCount > 0 ? `${assumedCount} statement${assumedCount === 1 ? "" : "s"} marked (assumed) — please check ${assumedCount === 1 ? "it" : "them"}.` : "Nothing marked as assumed."}</span>
                    <button type="button" onClick={rebuild} disabled={busy !== null} className="text-[11px] text-indigo-700 hover:underline">Build it again</button>
                  </div>
                  {narrativeProblems.length > 0 && <ul className="mt-2 text-[11px] text-red-700 list-disc ml-4">{narrativeProblems.slice(0, 4).map((p) => <li key={p}>{p}</li>)}</ul>}
                  {built.signature !== signature && <p className="text-[11px] text-amber-700 mt-1">You changed steps 1–2 after this was built — build it again.</p>}
                </>
              )}
              {!built && busy !== "build" && <button type="button" onClick={() => void doBuild()} className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700">Build the narrative</button>}
            </>
          )}

          {step === 5 && (
            <>
              <p className="text-xs text-gray-600 mb-3">A few questions about how the processes should be drawn. They apply to the BPMN process prompts. Skip any you like.</p>
              {busy === "questions" && <p className="text-sm text-gray-500">Preparing the questions…</p>}
              {busy !== "questions" && questionsDone && (
                <p className="text-sm text-gray-700">{answers.length > 0 ? `${answers.length} answer${answers.length === 1 ? "" : "s"} recorded.` : "No answers given — the prompts will be written with the standard defaults."}</p>
              )}
              {busy !== "questions" && (
                <button type="button" onClick={() => { setQuestionsDone(false); void loadQuestions(); }} className="mt-2 text-xs text-indigo-700 hover:underline">{answers.length > 0 ? "Change my answers" : "Answer the questions"}</button>
              )}
            </>
          )}

          {step === 6 && (
            <>
              {!started && (
                <div className="text-sm">
                  <p className="mb-2">Ready to create <strong>{title.trim()}</strong>.</p>
                  <ul className="list-disc ml-5 text-xs text-gray-700 space-y-0.5">
                    <li>{processes.length} processes, {total} prompts (Value Chain, Context{options.processContext ? ", Process Context" : ""}{options.archimate ? ", ArchiMate" : ""} and {processes.length} BPMN).</li>
                    <li>It will be coded with your organisation&apos;s next C number and shared with your organisation when every prompt has been written.</li>
                    <li>It uses {total} AI attempts{left === null || left === undefined ? "" : ` of your ${left}`}. If a run stops part-way you can carry on later without paying again for what was written.</li>
                  </ul>
                </div>
              )}
              {chain && <p className="text-sm mb-2">Value chain <strong>{chain.code}</strong> — {title.trim()}</p>}
              {rows.length > 0 && (
                <ul className="border border-gray-200 rounded divide-y divide-gray-100 text-xs">
                  {rows.map((r) => (
                    <li key={r.name} className="flex items-center gap-2 px-2 py-1">
                      <span className="w-4 shrink-0">{r.status === "done" ? "✓" : r.status === "error" || r.status === "refused" ? "✗" : r.status === "generating" ? "…" : "·"}</span>
                      <span className="flex-1 truncate" title={r.name}>{r.name}</span>
                      {r.message && <span className={`text-[10px] truncate max-w-[260px] ${r.status === "error" || r.status === "refused" ? "text-red-700" : "text-gray-500"}`} title={r.message}>{r.message}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {note && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-2">{note}</p>}
              {outcome && (
                <p className={`text-sm mt-3 rounded px-3 py-2 border ${outcome.complete ? "text-green-800 bg-green-50 border-green-200" : "text-amber-800 bg-amber-50 border-amber-200"}`}>
                  {outcome.complete
                    ? `Done — ${chain?.code ?? "the value chain"} is now in your organisation's list of value chains. Create a project from it with Project ▾ → Create Project from Process Repository…`
                    : `${outcome.written} written, ${outcome.missing} still to write. The value chain is saved as a draft${chain ? ` (${chain.code})` : ""}; carry on when you are ready.`}
                </p>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 flex items-center justify-between gap-2 shrink-0">
          <button type="button" onClick={back} disabled={step === 1 || started || busy !== null} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40">Back</button>
          <div className="flex items-center gap-2">
            {outcome?.complete && (
              <button type="button" onClick={() => { router.push("/dashboard/my-value-chains"); onClose(); }} className="px-3 py-1.5 text-sm rounded-md bg-green-600 text-white hover:bg-green-700">Open My Value Chains</button>
            )}
            {started && !running && outcome && !outcome.complete && chain && (
              <button type="button" onClick={carryOn} className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700">Carry on</button>
            )}
            <button type="button" onClick={onClose} disabled={running} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">{outcome ? "Close" : "Cancel"}</button>
            {step < 6 && (
              <button type="button" onClick={next} disabled={!canNext || busy !== null || !access}
                className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">Next</button>
            )}
            {step === 6 && !started && (
              <button type="button" onClick={create} disabled={!built || !affordable || running}
                className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">{running ? "Creating…" : `Create (${total} prompts)`}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

