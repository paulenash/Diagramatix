"use client";

/**
 * Phase 1 "Plan" panel for 2-phase BPMN AI generation.
 *
 * Minimal MVP: prompt box + Plan/Apply Layout/Re-send buttons + Raw JSON view.
 * Structured views (pools/lanes tree, elements, connectors) are added in a
 * later milestone; the JSON textarea already lets the user edit everything.
 */
import { useState, useCallback } from "react";
import type { DiagramData } from "@/app/lib/diagram/types";

interface Props {
  diagramType: string;
  onApplyDiagram: (data: DiagramData) => void;
  onClose: () => void;
}

export function PlanPanel({ diagramType, onApplyDiagram, onClose }: Props) {
  const [prompt, setPrompt] = useState("");
  const [planJsonText, setPlanJsonText] = useState("");
  const [busy, setBusy] = useState<"plan" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const hasPlan = planJsonText.trim().length > 0;

  const callPlan = useCallback(async () => {
    if (!prompt.trim() || busy) return;
    setBusy("plan");
    setError(null);
    setIssues(null);
    setStatus("Requesting plan from Sonnet (15–30 s)…");
    try {
      const res = await fetch("/api/ai/bpmn/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Plan request failed");
        if (json.raw) setPlanJsonText(json.raw);
        setStatus(null);
        return;
      }
      setPlanJsonText(JSON.stringify(json.plan, null, 2));
      setStatus(`Plan received: ${json.elementCount} elements, ${json.connectionCount} connections`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setStatus(null);
    } finally {
      setBusy(null);
    }
  }, [prompt, busy]);

  const callApplyLayout = useCallback(async () => {
    if (!hasPlan || busy) return;
    setBusy("apply");
    setError(null);
    setIssues(null);
    setStatus("Applying layout…");
    let parsedPlan: unknown;
    try {
      parsedPlan = JSON.parse(planJsonText);
    } catch (e) {
      setError(`JSON is not valid: ${(e as Error).message}`);
      setStatus(null);
      setBusy(null);
      return;
    }
    try {
      const res = await fetch("/api/ai/bpmn/apply-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: parsedPlan }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Layout failed");
        if (Array.isArray(json.issues)) setIssues(json.issues);
        setStatus(null);
        return;
      }
      if (!json.diagramData?.elements) {
        setError("Layout returned unexpected format.");
        setStatus(null);
        return;
      }
      onApplyDiagram(json.diagramData);
      setStatus(`Applied: ${json.elementCount} elements, ${json.connectionCount} connections`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setStatus(null);
    } finally {
      setBusy(null);
    }
  }, [planJsonText, hasPlan, busy, onApplyDiagram]);

  // In this MVP the "Re-send to Sonnet" button is just re-running callPlan —
  // there's nothing else to preserve yet. When we add structured views and
  // persisted edits, this will need a "discard edits?" confirm.
  const reSend = callPlan;

  return (
    <div className="w-80 border-l border-gray-200 bg-white flex flex-col shrink-0 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          AI Plan <span className="text-[10px] font-normal text-gray-400 lowercase">(2-phase)</span>
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm" title="Close">&times;</button>
      </div>

      <div className="flex-1 px-3 py-2 flex flex-col gap-2 overflow-y-auto">
        {diagramType !== "bpmn" && (
          <p className="text-[11px] text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1">
            2-phase mode is currently BPMN-only.
          </p>
        )}

        <div>
          <label className="text-[10px] text-gray-500 font-medium mb-1 block">Describe the process</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={5}
            placeholder="A customer places an order. The warehouse checks stock. If in stock, it ships the order. Otherwise it notifies the customer."
            className="w-full px-2 py-1.5 text-[11px] border border-gray-300 rounded resize-y focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={callPlan}
            disabled={!prompt.trim() || busy !== null}
            className="flex-1 px-2 py-1 text-[11px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === "plan" ? "Planning…" : hasPlan ? "Re-send to Sonnet" : "Plan"}
          </button>
          <button
            onClick={callApplyLayout}
            disabled={!hasPlan || busy !== null}
            className="flex-1 px-2 py-1 text-[11px] font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Run the deterministic layout engine on the current plan"
          >
            {busy === "apply" ? "Applying…" : "Apply Layout"}
          </button>
        </div>

        {status && <p className="text-[10px] text-gray-500">{status}</p>}
        {error && (
          <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
            <p className="font-medium">{error}</p>
            {issues && issues.length > 0 && (
              <ul className="mt-1 list-disc list-inside space-y-0.5">
                {issues.slice(0, 8).map((iss, i) => <li key={i}>{iss}</li>)}
                {issues.length > 8 && <li>…and {issues.length - 8} more</li>}
              </ul>
            )}
          </div>
        )}

        <div className="flex-1 flex flex-col">
          <label className="text-[10px] text-gray-500 font-medium mb-1">Plan (JSON) — edit freely, then Apply Layout</label>
          <textarea
            value={planJsonText}
            onChange={e => setPlanJsonText(e.target.value)}
            rows={20}
            placeholder="(empty — click Plan above to populate)"
            spellCheck={false}
            className="flex-1 w-full px-2 py-1.5 text-[10px] font-mono border border-gray-300 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
}
