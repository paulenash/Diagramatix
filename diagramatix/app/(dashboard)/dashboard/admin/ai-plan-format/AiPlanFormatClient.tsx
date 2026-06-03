"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface PlanFormat {
  diagramType: string;
  supportedTypes: string[];
  assembledPrompt: string;
  promptTemplate: string;
  aiRules: string;
  layoutRules: string;
  counts: {
    fullRulesChars: number;
    aiRulesChars: number;
    layoutRulesChars: number;
    assembledPromptChars: number;
  };
}

type Tab = "assembled" | "template" | "green" | "red";

const TABS: Array<{ key: Tab; label: string; hint: string }> = [
  { key: "assembled", label: "Assembled prompt", hint: "Exactly what the model receives — template + green rules injected." },
  { key: "template", label: "Prompt template", hint: "The hard-coded format spec with no rules injected." },
  { key: "green", label: "Green rules (sent to AI)", hint: "Rules the model is told to follow." },
  { key: "red", label: "Red rules (layout code)", hint: "Code-backed rules NOT sent to the model — enforced by the layout engine." },
];

// Display labels for the type selector. Falls back to the slug if a
// supported type lands here without an entry — keeps the UI alive when
// new types are added on the backend before the labels list is updated.
const TYPE_LABELS: Record<string, string> = {
  bpmn: "BPMN",
  "state-machine": "State Machine",
  "value-chain": "Value Chain",
  domain: "Domain Model",
  context: "Context Diagram",
  "process-context": "Process Context",
};

export function AiPlanFormatClient() {
  const router = useRouter();
  const [type, setType] = useState<string>("bpmn");
  const [data, setData] = useState<PlanFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("assembled");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (t: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/ai-plan-format?type=${encodeURIComponent(t)}`);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(type); }, [load, type]);

  const text = data
    ? tab === "assembled" ? data.assembledPrompt
    : tab === "template" ? data.promptTemplate
    : tab === "green" ? data.aiRules
    : data.layoutRules
    : "";

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — ignore */ }
  }

  const supportedTypes = data?.supportedTypes
    ?? ["bpmn", "state-machine", "value-chain", "domain", "context", "process-context"];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard/admin")} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <span style={{ fontSize: "1.5em", lineHeight: 1 }}>{"←"}</span>
            Admin
          </button>
          <h1 className="font-semibold text-gray-900">Admin — AI Plan Formats</h1>
        </div>
        <button
          onClick={copyText}
          disabled={!text}
          className="text-xs text-orange-600 hover:text-orange-800 font-medium border border-orange-300 rounded px-2 py-1 disabled:opacity-40"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6">
        <p className="text-xs text-gray-500 mb-3">
          The system prompt sent to the model on every AI generation
          request for the selected diagram type. Green rules from{" "}
          <code className="text-[10px] bg-gray-100 px-1 rounded">/dashboard/rules</code>{" "}
          are injected verbatim; red (layout) rules are filtered out and
          enforced by the layout engine instead. BPMN uses the
          two-phase planner (plan + apply-layout); every other type
          uses the shared generic prompt builder.
        </p>

        {/* Diagram-type selector — same shape as the existing tab row. */}
        <div className="flex flex-wrap gap-1 mb-3">
          {supportedTypes.map(t => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`text-xs rounded px-2.5 py-1 border ${
                type === t
                  ? "bg-purple-600 text-white border-purple-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {TYPE_LABELS[t] ?? t}
            </button>
          ))}
        </div>

        {error ? (
          <p className="text-xs text-red-700">{error}</p>
        ) : !data || loading ? (
          <p className="text-xs text-gray-400 italic">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1 mb-2">
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`text-xs rounded px-2.5 py-1 border ${
                    tab === t.key
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 mb-2">
              {TABS.find(t => t.key === tab)?.hint}
              {" "}
              <span className="text-gray-400">
                ({text.length.toLocaleString()} chars)
              </span>
            </p>
            <pre className="bg-white border border-gray-200 rounded p-4 text-[11px] leading-relaxed text-gray-800 whitespace-pre-wrap overflow-x-auto max-h-[65vh] overflow-y-auto">
              {text || <span className="text-gray-400 italic">(empty)</span>}
            </pre>
            <div className="mt-3 text-[10px] text-gray-400">
              Full rules: {data.counts.fullRulesChars.toLocaleString()} chars ·
              {" "}Green: {data.counts.aiRulesChars.toLocaleString()} ·
              {" "}Red: {data.counts.layoutRulesChars.toLocaleString()} ·
              {" "}Assembled prompt: {data.counts.assembledPromptChars.toLocaleString()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
