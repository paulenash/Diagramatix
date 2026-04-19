"use client";

/**
 * Phase 1 "Plan" panel for 2-phase BPMN AI generation.
 *
 * Holds the plan as the single source of truth (usePlanState). Four tabs
 * read and mutate it:
 *   - Pools & Lanes tree
 *   - Elements by container
 *   - Connectors by type
 *   - Raw JSON (commit-on-blur / explicit Apply to avoid stale overwrites)
 */
import { useState, useCallback, useEffect, useRef } from "react";
import type { DiagramData } from "@/app/lib/diagram/types";
import { usePlanState, type Plan } from "./ai-plan/usePlanState";
import { PoolsLanesTree } from "./ai-plan/PoolsLanesTree";
import { ElementsByContainerView } from "./ai-plan/ElementsByContainerView";
import { ConnectorsByTypeView } from "./ai-plan/ConnectorsByTypeView";

interface Props {
  diagramType: string;
  onApplyDiagram: (data: DiagramData) => void;
  onClose: () => void;
}

type Tab = "pools" | "elements" | "connectors" | "json";

export function PlanPanel({ diagramType, onApplyDiagram, onClose }: Props) {
  const [prompt, setPrompt] = useState("");
  const { plan, setPlan, updateElement, deleteElement, updateConnection, deleteConnection, asJson } = usePlanState();
  const [activeTab, setActiveTab] = useState<Tab>("pools");
  const [busy, setBusy] = useState<"plan" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Raw JSON tab has its own draft so mid-typing doesn't nuke structured state.
  // It syncs FROM `asJson` whenever the tab is NOT focused; pushes BACK to
  // state only on explicit "Apply JSON" (or blur with valid JSON).
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonFocused, setJsonFocused] = useState(false);
  const [jsonParseErr, setJsonParseErr] = useState<string | null>(null);
  useEffect(() => {
    if (!jsonFocused) setJsonDraft(asJson);
  }, [asJson, jsonFocused]);
  const commitJson = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonDraft);
      if (!Array.isArray(parsed?.elements) || !Array.isArray(parsed?.connections)) {
        setJsonParseErr("JSON must have { elements: [], connections: [] }");
        return false;
      }
      setPlan(parsed as Plan);
      setJsonParseErr(null);
      return true;
    } catch (e) {
      setJsonParseErr((e as Error).message);
      return false;
    }
  }, [jsonDraft, setPlan]);

  const hasPlan = plan.elements.length > 0 || plan.connections.length > 0;
  const lastSonnetResponseRef = useRef<string | null>(null);

  const callPlan = useCallback(async () => {
    if (!prompt.trim() || busy) return;
    // If the user has an edited plan in state, warn before clobbering.
    if (hasPlan && lastSonnetResponseRef.current != null && asJson !== lastSonnetResponseRef.current) {
      if (!confirm("You have edits on the current plan. Re-sending to Sonnet will replace them. Continue?")) return;
    }
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
        if (json.raw) setJsonDraft(json.raw);
        setStatus(null);
        return;
      }
      setPlan(json.plan);
      lastSonnetResponseRef.current = JSON.stringify(json.plan, null, 2);
      setStatus(`Plan received: ${json.elementCount} elements, ${json.connectionCount} connections`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setStatus(null);
    } finally {
      setBusy(null);
    }
  }, [prompt, busy, hasPlan, asJson, setPlan]);

  const callApplyLayout = useCallback(async () => {
    if (!hasPlan || busy) return;
    // If the user is in the JSON tab with uncommitted edits, commit them first.
    if (activeTab === "json" && jsonDraft !== asJson) {
      if (!commitJson()) return;
    }
    setBusy("apply");
    setError(null);
    setIssues(null);
    setStatus("Applying layout…");
    try {
      const res = await fetch("/api/ai/bpmn/apply-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
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
  }, [plan, hasPlan, busy, onApplyDiagram, activeTab, jsonDraft, asJson, commitJson]);

  return (
    <div className="w-96 border-l border-gray-200 bg-white flex flex-col shrink-0 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          AI Plan <span className="text-[10px] font-normal text-gray-400 lowercase">(2-phase)</span>
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm" title="Close">&times;</button>
      </div>

      <div className="flex-1 px-3 py-2 flex flex-col gap-2 overflow-hidden">
        {diagramType !== "bpmn" && (
          <p className="text-[11px] text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1">
            2-phase mode is currently BPMN-only.
          </p>
        )}

        <div className="shrink-0">
          <label className="text-[10px] text-gray-500 font-medium mb-1 block">Describe the process</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={3}
            placeholder="A customer places an order. The warehouse checks stock. If in stock, it ships the order. Otherwise it notifies the customer."
            className="w-full px-2 py-1.5 text-[11px] border border-gray-300 rounded resize-y focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="shrink-0 flex items-center gap-1.5">
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

        {status && <p className="text-[10px] text-gray-500 shrink-0">{status}</p>}
        {error && (
          <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5 shrink-0">
            <p className="font-medium">{error}</p>
            {issues && issues.length > 0 && (
              <ul className="mt-1 list-disc list-inside space-y-0.5">
                {issues.slice(0, 8).map((iss, i) => <li key={i}>{iss}</li>)}
                {issues.length > 8 && <li>…and {issues.length - 8} more</li>}
              </ul>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="shrink-0 flex border-b border-gray-200 text-[10px] -mb-px">
          {([
            { id: "pools",      label: "Pools / Lanes" },
            { id: "elements",   label: "Elements" },
            { id: "connectors", label: "Connectors" },
            { id: "json",       label: "Raw JSON" },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-2 py-1 border-b-2 ${
                activeTab === t.id
                  ? "border-blue-500 text-blue-700 font-medium"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto text-[11px]">
          {activeTab === "pools" && (
            <PoolsLanesTree elements={plan.elements} onRename={(id, label) => updateElement(id, { label })} onDelete={deleteElement} />
          )}
          {activeTab === "elements" && (
            <ElementsByContainerView elements={plan.elements} onRename={(id, label) => updateElement(id, { label })} onDelete={deleteElement} />
          )}
          {activeTab === "connectors" && (
            <ConnectorsByTypeView elements={plan.elements} connections={plan.connections} onRenameLabel={(idx, label) => updateConnection(idx, { label })} onDelete={deleteConnection} />
          )}
          {activeTab === "json" && (
            <div className="h-full flex flex-col gap-1">
              <textarea
                value={jsonDraft}
                onChange={e => { setJsonDraft(e.target.value); setJsonParseErr(null); }}
                onFocus={() => setJsonFocused(true)}
                onBlur={() => { setJsonFocused(false); commitJson(); }}
                rows={18}
                spellCheck={false}
                placeholder="(empty — click Plan above to populate)"
                className="flex-1 w-full px-2 py-1.5 text-[10px] font-mono border border-gray-300 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={commitJson}
                  disabled={jsonDraft === asJson}
                  className="px-2 py-0.5 text-[10px] text-white bg-gray-700 rounded hover:bg-gray-800 disabled:opacity-50"
                >
                  Apply JSON to structured tabs
                </button>
                {jsonParseErr && <span className="text-[10px] text-red-600">{jsonParseErr}</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
