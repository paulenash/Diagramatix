"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface PlanFormat {
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

export function AiPlanFormatClient() {
  const router = useRouter();
  const [data, setData] = useState<PlanFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("assembled");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/ai-plan-format");
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard/admin")} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <span style={{ fontSize: "1.5em", lineHeight: 1 }}>{"←"}</span>
            Admin
          </button>
          <h1 className="font-semibold text-gray-900">Admin — AI Plan Format</h1>
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
          This is the BPMN planner system prompt sent to the model on every
          AI generation (Quick generate + 2-phase plan). The green rules are
          injected verbatim; red (layout) rules are filtered out before the
          model sees them and enforced by the layout engine instead.
        </p>

        {error ? (
          <p className="text-xs text-red-700">{error}</p>
        ) : !data ? (
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
