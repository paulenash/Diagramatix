"use client";

import { useEffect, useRef } from "react";
import type { PlanSummary } from "@/app/lib/ai/planSummary";

/**
 * The pop-up that follows the Plan phase (Paul, 2026-10-07): what the plan found, and four ways forward —
 *   Re-plan · Refine Prompt · Layout Diagram · Cancel.
 * Shared by the sidebar Plan panel and the full-screen AI Generate console, so both say the same thing. Nothing is drawn until the person
 * chooses Layout Diagram; Cancel keeps the plan exactly as it is, for editing or for laying out later.
 *
 * Accessible: a modal dialog with a name, Escape = Cancel, Tab kept inside it, focus on the sensible default — Layout Diagram when the
 * plan looks sound, Re-plan when it has warnings — and returned to where it was on close.
 */
export function PlanSummaryDialog({
  summary, canRefine, onReplan, onRefine, onViewResponse, onLayout, onCancel,
}: {
  summary: PlanSummary;
  /** Opens the full response the AI returned. Absent, the button is not shown. */
  onViewResponse?: () => void;
  /** Refine asks clarifying questions — BPMN plans only. */
  canRefine: boolean;
  onReplan: () => void;
  onRefine: () => void;
  onLayout: () => void;
  onCancel: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const hasWarnings = summary.warnings.length > 0;
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    root.current?.querySelector<HTMLButtonElement>(hasWarnings ? "[data-act=replan]" : "[data-act=layout]")?.focus();
    return () => { (opener.current as HTMLElement | null)?.focus?.(); };
  }, [hasWarnings]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.stopPropagation(); onCancel(); return; }
    if (e.key !== "Tab") return;
    const items = Array.from(root.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
    if (items.length === 0) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  const { totals } = summary;
  const btn = "px-3 py-1.5 text-xs font-medium rounded border";
  return (
    <div className="fixed inset-0 z-[300] bg-black/30 flex items-center justify-center p-4" data-testid="plan-summary">
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-summary-title"
        onKeyDown={onKeyDown}
        className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
      >
        <div className="px-5 pt-4 pb-2 border-b border-gray-100">
          <h2 id="plan-summary-title" className="text-sm font-semibold text-gray-900">Plan ready</h2>
          <p className="text-xs text-gray-600 mt-0.5">
            {totals.elements} element{totals.elements === 1 ? "" : "s"} and {totals.connections} connection{totals.connections === 1 ? "" : "s"}
            {totals.message > 0 ? ` (${totals.sequence} sequence, ${totals.message} message)` : ""}. Nothing is drawn until you choose Layout Diagram.
          </p>
        </div>

        <div className="px-5 py-3 overflow-auto text-xs text-gray-800 space-y-3">
          {hasWarnings && (
            <div role="alert" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 space-y-1.5" data-testid="plan-summary-warnings">
              <p className="font-semibold">{summary.warnings.length === 1 ? "One thing to look at" : `${summary.warnings.length} things to look at`}</p>
              <ul className="list-disc pl-4 space-y-1">
                {summary.warnings.map((w) => <li key={w.code}>{w.message}</li>)}
              </ul>
            </div>
          )}

          {summary.mix.length > 0 && (
            <div>
              <p className="font-medium text-gray-700 mb-0.5">What it contains</p>
              <p className="text-gray-700">{summary.mix.map((m) => `${m.count} ${m.label.toLowerCase()}`).join(" · ")}</p>
            </div>
          )}

          {summary.pools.length > 0 && (
            <div>
              <p className="font-medium text-gray-700 mb-0.5">Pools and lanes</p>
              <ul className="space-y-1">
                {summary.pools.map((p) => (
                  <li key={p.name}>
                    <span className="font-medium">{p.name}</span>{" "}
                    <span className="text-gray-500">
                      {p.kind === "black-box" ? (p.system ? "system (black box)" : "outside party (black box)") : `organisation — ${p.lanes.length} lane${p.lanes.length === 1 ? "" : "s"}`}
                    </span>
                    {p.lanes.length > 0 && (
                      <ul className="pl-4 text-gray-700">
                        {p.lanes.map((l) => (
                          <li key={l.name} className={l.unconnected > 0 ? "text-amber-800" : undefined}>
                            {l.name} — {l.elements} step{l.elements === 1 ? "" : "s"}
                            {l.unconnected > 0 ? `, ${l.unconnected} not connected` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap items-center justify-end gap-2">
          <button data-act="replan" onClick={onReplan} className={`${btn} border-gray-300 text-gray-700 hover:bg-gray-50`}
            title="Ask the AI for a fresh plan from the same prompt">Re-plan</button>
          {canRefine && (
            <button data-act="refine" onClick={onRefine} className={`${btn} border-gray-300 text-gray-700 hover:bg-gray-50`}
              title="Answer a few questions about the gaps in the prompt, then plan again">Refine Prompt</button>
          )}
          {onViewResponse && (
            <button data-act="view-response" onClick={onViewResponse} className={`${btn} border-gray-300 text-gray-700 hover:bg-gray-50`}
              title="Close this and open the full response the AI returned (the plan as JSON)">View AI Response</button>
          )}
          <button data-act="layout" onClick={onLayout} className={`${btn} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`}
            title="Draw the diagram from this plan">Layout Diagram</button>
          <button data-act="cancel" onClick={onCancel} className={`${btn} border-gray-300 text-gray-700 hover:bg-gray-50`}
            title="Close this and keep the plan as it is (Esc)">Cancel</button>
        </div>
      </div>
    </div>
  );
}
