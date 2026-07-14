"use client";

import { useState } from "react";
import type { RefineQuestion } from "@/app/lib/ai/refineQuestions";

interface Props {
  /** The AI's clarifying questions (radio for "single", checkbox for "multi"). */
  questions: RefineQuestion[];
  /** Called with one {label, answer} per question. answer "" = skipped. */
  onSubmit: (answers: { label: string; answer: string }[]) => void;
  onCancel: () => void;
}

const OTHER = "__other__";

/**
 * Refine questions dialog — in-app, Diagramatix-native (NEVER window.prompt).
 * Renders each AI question as radio (single) or checkbox (multi), always with an
 * "Other…" free-text valve and, for radio, a "Skip" option. The answers are
 * returned to the caller, which appends them to the prompt (labelled lines) and
 * lets the user press Plan — this dialog never regenerates anything itself.
 */
export function RefineQuestionsDialog({ questions, onSubmit, onCancel }: Props) {
  // Radio selection per question ("" = skip, an option, or OTHER).
  const [single, setSingle] = useState<Record<number, string>>({});
  // Checkbox selections per question (a set of options and/or OTHER).
  const [multi, setMulti] = useState<Record<number, Set<string>>>({});
  // Free-text for the "Other…" valve, per question.
  const [other, setOther] = useState<Record<number, string>>({});

  const answerFor = (q: RefineQuestion, i: number): string => {
    if (q.type === "single") {
      const sel = single[i] ?? "";
      if (sel === OTHER) return (other[i] ?? "").trim();
      return sel; // "" = skip
    }
    const set = multi[i] ?? new Set<string>();
    const parts = [...set].filter((o) => o !== OTHER);
    if (set.has(OTHER) && (other[i] ?? "").trim()) parts.push((other[i] ?? "").trim());
    return parts.join(", ");
  };

  const answeredCount = questions.filter((q, i) => answerFor(q, i).trim().length > 0).length;

  const toggleMulti = (i: number, opt: string) => {
    setMulti((prev) => {
      const next = new Set(prev[i] ?? []);
      if (next.has(opt)) next.delete(opt); else next.add(opt);
      return { ...prev, [i]: next };
    });
  };

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-sm font-semibold text-gray-900">Refine the prompt</h3>
          <p className="text-xs text-gray-600 leading-relaxed mt-1">
            Answer what you can — your answers are added to the prompt so the plan
            has more to work with. Choose <span className="font-medium">Other…</span> to
            type your own, or skip anything that doesn&apos;t apply. Nothing is generated
            until you press Plan.
          </p>
        </div>

        <div className="px-5 py-3 overflow-y-auto flex-1 space-y-4">
          {questions.map((q, i) => (
            <div key={i}>
              <p className="text-xs font-medium text-gray-800 mb-1.5">
                <span className="text-blue-600">{i + 1}.</span> {q.question}
              </p>
              <div className="space-y-1 pl-1">
                {q.type === "single" ? (
                  <>
                    {q.options.map((opt) => (
                      <label key={opt} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                        <input type="radio" name={`q${i}`} className="cursor-pointer"
                          checked={single[i] === opt}
                          onChange={() => setSingle((p) => ({ ...p, [i]: opt }))} />
                        {opt}
                      </label>
                    ))}
                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input type="radio" name={`q${i}`} className="cursor-pointer"
                        checked={single[i] === OTHER}
                        onChange={() => setSingle((p) => ({ ...p, [i]: OTHER }))} />
                      Other…
                    </label>
                    {single[i] === OTHER && (
                      <input autoFocus value={other[i] ?? ""} onChange={(e) => setOther((p) => ({ ...p, [i]: e.target.value }))}
                        placeholder="Type your answer" className="ml-6 w-[calc(100%-1.5rem)] px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-400" />
                    )}
                    <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                      <input type="radio" name={`q${i}`} className="cursor-pointer"
                        checked={(single[i] ?? "") === ""}
                        onChange={() => setSingle((p) => ({ ...p, [i]: "" }))} />
                      Skip
                    </label>
                  </>
                ) : (
                  <>
                    {q.options.map((opt) => (
                      <label key={opt} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                        <input type="checkbox" className="cursor-pointer"
                          checked={(multi[i] ?? new Set()).has(opt)}
                          onChange={() => toggleMulti(i, opt)} />
                        {opt}
                      </label>
                    ))}
                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input type="checkbox" className="cursor-pointer"
                        checked={(multi[i] ?? new Set()).has(OTHER)}
                        onChange={() => toggleMulti(i, OTHER)} />
                      Other…
                    </label>
                    {(multi[i] ?? new Set()).has(OTHER) && (
                      <input autoFocus value={other[i] ?? ""} onChange={(e) => setOther((p) => ({ ...p, [i]: e.target.value }))}
                        placeholder="Type your answer(s)" className="ml-6 w-[calc(100%-1.5rem)] px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-400" />
                    )}
                    <p className="text-[10px] text-gray-400 pl-6">Leave all unticked to skip.</p>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-100 shrink-0">
          <span className="text-[11px] text-gray-500">{answeredCount} of {questions.length} answered</span>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => onSubmit(questions.map((q, i) => ({ label: q.label, answer: answerFor(q, i) })))}
              disabled={answeredCount === 0}
              className="px-3 py-1.5 text-xs font-medium text-white rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add to prompt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
