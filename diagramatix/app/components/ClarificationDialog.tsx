"use client";

import { useState } from "react";

interface Props {
  /** The AI's open questions, in order. */
  questions: string[];
  /** Prior answers (e.g. from a previously-saved aiFeedback), indexed by question. */
  initialAnswers?: string[];
  /** Called with one answer string per question ("" = skipped). */
  onSubmit: (answers: string[]) => void;
  onCancel: () => void;
}

/**
 * In-app clarification dialog (Diagramatix-native — NEVER window.prompt).
 * Presents the AI's open questions as a list with an answer box each, so the
 * user can resolve the ambiguities the AI flagged. The answers are returned to
 * the caller, which appends them to the generation prompt and re-runs.
 */
export function ClarificationDialog({ questions, initialAnswers, onSubmit, onCancel }: Props) {
  const [answers, setAnswers] = useState<string[]>(
    () => questions.map((_, i) => initialAnswers?.[i] ?? ""),
  );
  const answeredCount = answers.filter((a) => a.trim().length > 0).length;

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-sm font-semibold text-gray-900">Ask for Clarification</h3>
          <p className="text-xs text-gray-600 leading-relaxed mt-1">
            The AI flagged these open questions while building the diagram. Answer
            the ones you can — your answers are added to the prompt and the diagram
            is regenerated. Leave any blank to skip.
          </p>
        </div>

        <div className="px-5 py-3 overflow-y-auto flex-1 space-y-3">
          {questions.map((q, i) => (
            <div key={i}>
              <p className="text-xs font-medium text-gray-800 mb-1">
                <span className="text-blue-600">{i + 1}.</span> {q}
              </p>
              <textarea
                value={answers[i]}
                onChange={(e) => setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))}
                rows={2}
                placeholder="Your answer (optional)…"
                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-400 resize-y"
              />
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
              onClick={() => onSubmit(answers)}
              disabled={answeredCount === 0}
              className="px-3 py-1.5 text-xs font-medium text-white rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Apply &amp; Regenerate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
