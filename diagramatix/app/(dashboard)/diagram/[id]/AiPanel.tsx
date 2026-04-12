"use client";

import { useState, useEffect, useCallback } from "react";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";

interface SavedPrompt { id: string; name: string; text: string; }

interface Props {
  onApplyDiagram: (data: DiagramData) => void;
  onAddToDiagram: (elements: DiagramElement[], connectors: Connector[]) => void;
  onClose: () => void;
}

export function AiPanel({ onApplyDiagram, onAddToDiagram, onClose }: Props) {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [mode, setMode] = useState<"replace" | "add">("replace");

  // Saved prompts
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);

  // 2-step: Plan review
  const [, setPlan] = useState<string | null>(null);
  const [planEditable, setPlanEditable] = useState("");
  const [step, setStep] = useState<"prompt" | "plan">("prompt");

  const loadPrompts = useCallback(async () => {
    try {
      const res = await fetch("/api/prompts");
      if (res.ok) setSavedPrompts(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadPrompts(); }, [loadPrompts]);

  // Step 1: Generate plan
  async function handleGeneratePlan() {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);
    setStatus("Generating plan (this may take 15-30 seconds)...");
    setPlan(null);

    try {
      const res = await fetch("/api/ai/generate-bpmn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), mode: "plan" }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        setError(err.error ?? "Plan generation failed");
        setStatus(null);
        return;
      }

      const { plan: planData } = await res.json();
      // Show as formatted JSON for editing
      const formatted = JSON.stringify(planData, null, 2);
      setPlan(formatted);
      setPlanEditable(formatted);
      setStep("plan");
      setStatus("Review the plan below. Edit if needed, then click Generate Diagram.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setStatus(null);
    } finally {
      setGenerating(false);
    }
  }

  // Step 2: Generate diagram from plan
  async function handleGenerateDiagram() {
    setGenerating(true);
    setError(null);
    setStatus("Generating diagram from plan...");

    try {
      const res = await fetch("/api/ai/generate-bpmn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Generate a BPMN diagram from this plan:\n${planEditable}`,
          mode: "generate",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        setError(err.error ?? "Generation failed");
        setStatus(null);
        return;
      }

      const { diagramData, elementCount, connectionCount } = await res.json();
      setStatus(`Generated ${elementCount} elements, ${connectionCount} connections`);
      if (mode === "add") {
        onAddToDiagram(diagramData.elements, diagramData.connectors);
      } else {
        onApplyDiagram(diagramData);
      }
      setStep("prompt");
      setPlan(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setStatus(null);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSavePrompt() {
    if (!saveName.trim() || !prompt.trim()) return;
    try {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saveName.trim(), text: prompt.trim() }),
      });
      if (res.ok) { setShowSave(false); setSaveName(""); loadPrompts(); }
    } catch { /* ignore */ }
  }

  async function handleDeletePrompt(id: string) {
    try {
      await fetch(`/api/prompts/${id}`, { method: "DELETE" });
      setSavedPrompts(prev => prev.filter(p => p.id !== id));
    } catch { /* ignore */ }
  }

  return (
    <div className="w-80 border-l border-gray-200 bg-white flex flex-col shrink-0 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          AI Generate {step === "plan" && "— Review Plan"}
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">&times;</button>
      </div>

      {/* Saved prompts */}
      {step === "prompt" && savedPrompts.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-100">
          <p className="text-[10px] text-gray-400 font-medium uppercase mb-1">Saved Prompts</p>
          <div className="space-y-0.5 max-h-28 overflow-y-auto">
            {savedPrompts.map(sp => (
              <div key={sp.id} className="flex items-center gap-1 group">
                <button onClick={() => setPrompt(sp.text)}
                  className="flex-1 text-left text-[11px] text-gray-700 truncate hover:text-blue-600 py-0.5"
                  title={sp.text}>{sp.name}</button>
                <button onClick={() => handleDeletePrompt(sp.id)}
                  className="text-gray-300 hover:text-red-500 text-[10px] opacity-0 group-hover:opacity-100">&times;</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 px-3 py-2 flex flex-col gap-2 overflow-y-auto">
        {step === "prompt" && (
          <>
            <div>
              <label className="text-[10px] text-gray-500 font-medium block mb-1">Describe the process</label>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={8}
                placeholder="e.g. A customer places an order. The warehouse checks stock..."
                className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed" />
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[10px] text-gray-600">
                <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} className="w-3 h-3" />
                Replace
              </label>
              <label className="flex items-center gap-1 text-[10px] text-gray-600">
                <input type="radio" name="mode" checked={mode === "add"} onChange={() => setMode("add")} className="w-3 h-3" />
                Add to diagram
              </label>
            </div>

            <div className="flex gap-1.5">
              <button onClick={handleGeneratePlan} disabled={generating || !prompt.trim()}
                className="flex-1 px-3 py-1.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {generating ? "Generating\u2026" : "Generate Plan"}
              </button>
              <button onClick={() => setShowSave(!showSave)} disabled={!prompt.trim()}
                className="px-2 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                title="Save this prompt">Save</button>
            </div>

            {showSave && (
              <div className="flex gap-1">
                <input type="text" value={saveName} onChange={e => setSaveName(e.target.value)}
                  placeholder="Prompt name" className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  onKeyDown={e => { if (e.key === "Enter") handleSavePrompt(); }} />
                <button onClick={handleSavePrompt} disabled={!saveName.trim()}
                  className="px-2 py-1 text-xs text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50">{"\u2713"}</button>
                <button onClick={() => { setShowSave(false); setSaveName(""); }}
                  className="px-2 py-1 text-xs text-gray-500 border border-gray-300 rounded hover:bg-gray-50">{"\u2715"}</button>
              </div>
            )}
          </>
        )}

        {step === "plan" && (
          <>
            <div>
              <label className="text-[10px] text-gray-500 font-medium block mb-1">
                Review &amp; edit the plan (JSON)
              </label>
              <textarea value={planEditable} onChange={e => setPlanEditable(e.target.value)} rows={20}
                className="w-full text-[10px] font-mono border border-gray-300 rounded px-2 py-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed" />
            </div>

            <div className="flex gap-1.5">
              <button onClick={() => { setStep("prompt"); setPlan(null); setStatus(null); }}
                className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
                Back
              </button>
              <button onClick={handleGenerateDiagram} disabled={generating}
                className="flex-1 px-3 py-1.5 text-xs text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {generating ? "Generating\u2026" : "Generate Diagram"}
              </button>
            </div>
          </>
        )}

        {status && <p className="text-[10px] text-green-600">{status}</p>}
        {error && <p className="text-[10px] text-red-600">{error}</p>}
      </div>
    </div>
  );
}
