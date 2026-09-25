"use client";

/**
 * Every case in one family, and how each one scored (Paul, 2026-09-25: "a
 * scrollable window that shows the details of the commands in a Family, and
 * their statuses. Close button is outside the scrollable region").
 *
 * Only the list scrolls; the header and the footer with Close stay put, so a
 * family of two hundred cases can still be closed without scrolling back.
 */
import { useEffect } from "react";
import { isFailure, type CaseResult } from "@/app/lib/assist/commandScore";
import type { AssistOp } from "@/app/lib/assist/ops";
import { OUTCOME_STYLE, OUTCOME_MEANS } from "./outcomeStyle";

interface Props {
  family: string;
  results: CaseResult[];
  onClose: () => void;
}

/** One op per line, compact — easier to compare by eye than a JSON blob. */
const opsText = (ops: AssistOp[] | null) => (ops ? ops.map((o) => JSON.stringify(o)).join("\n") : "— (refused)");

export function FamilyCasesWindow({ family, results, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Failures first, then in corpus order.
  const rows = [...results].sort((a, b) => Number(isFailure(b.outcome)) - Number(isFailure(a.outcome)));
  const failed = results.filter((r) => isFailure(r.outcome)).length;

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50" onMouseDown={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={`${family} cases`}
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 flex flex-col max-h-[85vh]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <h3 className="text-sm font-semibold text-gray-900">{family}</h3>
          <p className="text-xs text-gray-500">
            {results.length} case{results.length === 1 ? "" : "s"} · {results.length - failed} passed
            {failed > 0 && <> · <span className="text-red-700 font-medium">{failed} failed</span></>}
          </p>
        </div>

        <div className="overflow-y-auto px-5 py-3 space-y-2 min-h-0">
          {rows.map((r) => (
            <div key={r.caseId} className={`border rounded p-2 text-xs ${isFailure(r.outcome) ? "border-red-100 bg-red-50" : "border-gray-100"}`}>
              <div className="flex items-start gap-2">
                <span className={`px-1 rounded text-[10px] shrink-0 ${OUTCOME_STYLE[r.outcome]}`}>{r.outcome}</span>
                <span className="flex-1 min-w-0 text-gray-800">“{r.heard}”</span>
                <span className="text-gray-400 text-[10px] shrink-0">{r.caseId}</span>
              </div>
              <div className="mt-1 text-[11px] text-gray-500">{OUTCOME_MEANS[r.outcome]}</div>
              {r.detail && <div className="mt-1 text-[11px] text-gray-700">{r.detail}</div>}
              <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-400">expected</div>
                  <pre className="text-[10px] text-gray-700 whitespace-pre-wrap break-all">{opsText(r.expected)}</pre>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-400">parsed</div>
                  <pre className="text-[10px] text-gray-700 whitespace-pre-wrap break-all">{opsText(r.actual)}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end px-5 py-3 border-t border-gray-100 shrink-0">
          <button onClick={onClose} autoFocus
            className="px-3 py-1.5 text-xs font-medium text-white rounded bg-purple-600 hover:bg-purple-700">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
