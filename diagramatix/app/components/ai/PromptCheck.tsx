"use client";

/**
 * "Check before you Plan" — the findings of checkPromptReadiness, listed under the prompt box. Nothing is shown for free text or for a
 * prompt with no findings except a quiet "looks ready" line for a house-format prompt. Clicking a finding jumps to its line.
 */
import { useDeferredValue, useMemo } from "react";
import { checkPromptReadiness, isHousePrompt } from "@/app/lib/valueChain/promptReadiness";

export function PromptCheck({ prompt, onJumpToLine }: { prompt: string; onJumpToLine: (line: number) => void }) {
  const deferred = useDeferredValue(prompt);
  const issues = useMemo(() => checkPromptReadiness(deferred), [deferred]);
  if (!isHousePrompt(deferred)) return null;

  if (issues.length === 0) {
    return <p className="mt-1.5 text-[10px] text-emerald-300/80" role="status">✓ Prompt check: nothing BPMN cannot draw, every branch says where it goes.</p>;
  }
  return (
    <div className="mt-1.5 rounded border border-amber-400/40 bg-amber-500/10 px-2 py-1.5" role="status" aria-label="Prompt check">
      <p className="text-[11px] font-semibold text-amber-200">
        Prompt check — {issues.length} thing{issues.length === 1 ? "" : "s"} to fix before you Plan
      </p>
      <ul className="mt-1 space-y-1 max-h-40 overflow-y-auto">
        {issues.map((i, n) => (
          <li key={n} className="text-[11px] text-amber-100/90">
            {i.line ? (
              <button type="button" onClick={() => onJumpToLine(i.line!)} className="text-left underline decoration-dotted hover:text-white"
                title="Jump to this line in the prompt">{i.message}</button>
            ) : i.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
