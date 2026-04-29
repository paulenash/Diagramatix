"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";
import { buildBpmnPrompt } from "@/app/lib/diagram/prompt-from-diagram";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { SpeechRecognition: any; webkitSpeechRecognition: any; }
}

interface SavedPrompt { id: string; name: string; text: string; }

interface Props {
  diagramType: string;
  onApplyDiagram: (data: DiagramData) => void;
  onAddToDiagram: (elements: DiagramElement[], connectors: Connector[]) => void;
  onClose: () => void;
  isAdmin?: boolean;
  currentElements?: DiagramElement[];
  currentConnectors?: Connector[];
}

export function AiPanel({
  diagramType,
  onApplyDiagram,
  onAddToDiagram,
  onClose,
  isAdmin = false,
  currentElements,
  currentConnectors,
}: Props) {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [mode, setMode] = useState<"replace" | "add">("replace");

  // Saved prompts
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // File attachment
  const [attachment, setAttachment] = useState<{ name: string; type: string; data: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileAttach(file: File) {
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) { setError("File too large (max 10MB)"); return; }

    if (file.type === "application/pdf") {
      // Send as base64 for Claude's native PDF support
      const buffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      setAttachment({ name: file.name, type: "pdf", data: base64 });
    } else {
      // Read as text for .txt, .md, .csv, .doc, .rtf, etc.
      const text = await file.text();
      setAttachment({ name: file.name, type: "text", data: text });
    }
    setError(null);
  }

  // Speech-to-text dictation
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  const speechSupported = typeof window !== "undefined"
    && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  function toggleDictation() {
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    const SR = (window as any).SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-AU";

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const text = event.results[i][0].transcript;
          setPrompt(prev => {
            const base = prev && !prev.endsWith(" ") && !prev.endsWith("\n") ? prev + " " : prev;
            return base + text;
          });
        }
      }
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  // Stop dictation on unmount
  useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, []);

  const loadPrompts = useCallback(async () => {
    try {
      const res = await fetch(`/api/prompts?diagramType=${encodeURIComponent(diagramType)}`);
      if (res.ok) setSavedPrompts(await res.json());
    } catch { /* ignore */ }
  }, [diagramType]);

  useEffect(() => { loadPrompts(); }, [loadPrompts]);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);
    setStatus("Generating diagram (this may take 15-30 seconds)...");

    try {
      // Use BPMN-specific endpoint (with layout engine) for BPMN, generic for others
      const endpoint = diagramType === "bpmn" ? "/api/ai/generate-bpmn" : "/api/ai/generate-diagram";
      const body = diagramType === "bpmn"
        ? { prompt: prompt.trim(), mode: "generate", attachment: attachment ?? undefined }
        : { prompt: prompt.trim(), diagramType, attachment: attachment ?? undefined };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        setError(err.error ?? "Generation failed");
        setStatus(null);
        return;
      }

      const result = await res.json();

      // BPMN has its own layout engine, other types use simple grid layout
      if (diagramType === "bpmn") {
        if (!result.diagramData?.elements) {
          setError("AI returned unexpected format. Try rephrasing your prompt.");
          setStatus(null);
          return;
        }
        setStatus(`Generated ${result.elementCount} elements, ${result.connectionCount} connections`);
      } else {
        // Generic: apply simple layout to parsed elements
        const { layoutGenericDiagram } = await import("@/app/lib/diagram/genericLayout");
        const diagramData = layoutGenericDiagram(result.parsed, diagramType);
        result.diagramData = diagramData;
        result.elementCount = diagramData.elements.length;
        result.connectionCount = diagramData.connectors.length;
        setStatus(`Generated ${result.elementCount} elements, ${result.connectionCount} connections`);
      }
      if (mode === "add") {
        onAddToDiagram(result.diagramData.elements, result.diagramData.connectors);
      } else {
        onApplyDiagram(result.diagramData);
      }
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
      if (editingPromptId) {
        // Update existing prompt
        const res = await fetch(`/api/prompts/${editingPromptId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: saveName.trim(), text: prompt.trim() }),
        });
        if (res.ok) { setShowSave(false); setSaveName(""); setEditingPromptId(null); loadPrompts(); }
      } else {
        // Create new prompt
        const res = await fetch("/api/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: saveName.trim(), text: prompt.trim(), diagramType }),
        });
        if (res.ok) { setShowSave(false); setSaveName(""); loadPrompts(); }
      }
    } catch { /* ignore */ }
  }

  async function handleDeletePrompt(id: string) {
    try {
      await fetch(`/api/prompts/${id}`, { method: "DELETE" });
      setSavedPrompts(prev => prev.filter(p => p.id !== id));
    } catch { /* ignore */ }
    setConfirmDeleteId(null);
  }

  return (
    <div className="w-80 border-l border-gray-200 bg-white flex flex-col shrink-0 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">AI Generate</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">&times;</button>
      </div>

      {savedPrompts.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-100">
          <p className="text-[10px] text-gray-400 font-medium uppercase mb-1">Saved Prompts</p>
          <div className="space-y-0.5 max-h-28 overflow-y-auto">
            {savedPrompts.map(sp => (
              <div key={sp.id} className="flex items-center gap-1 group">
                {confirmDeleteId === sp.id ? (
                  <>
                    <span className="flex-1 text-[10px] text-red-600 truncate">Delete &ldquo;{sp.name}&rdquo;?</span>
                    <button onClick={() => handleDeletePrompt(sp.id)}
                      className="text-[10px] text-red-600 font-medium hover:text-red-800 px-1">Yes</button>
                    <button onClick={() => setConfirmDeleteId(null)}
                      className="text-[10px] text-gray-500 hover:text-gray-700 px-1">No</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setPrompt(sp.text); setEditingPromptId(sp.id); setSaveName(sp.name); }}
                      className={`flex-1 text-left text-[11px] truncate py-0.5 ${editingPromptId === sp.id ? "text-blue-600 font-medium" : "text-gray-700 hover:text-blue-600"}`}
                      title={sp.text}>{sp.name}{editingPromptId === sp.id ? " (editing)" : ""}</button>
                    <button onClick={() => setConfirmDeleteId(sp.id)}
                      className="text-gray-300 hover:text-red-500 text-[10px] opacity-0 group-hover:opacity-100">&times;</button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 px-3 py-2 flex flex-col gap-2 overflow-y-auto">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-gray-500 font-medium">Describe the process</label>
            {speechSupported && (
              <button
                onClick={toggleDictation}
                className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${
                  listening
                    ? "text-red-600 border-red-300 bg-red-50 hover:bg-red-100"
                    : "text-gray-500 border-gray-300 hover:bg-gray-50"
                }`}
                title={listening ? "Stop dictation" : "Dictate prompt"}
              >
                <svg width={10} height={10} viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 11a3 3 0 0 0 3-3V4a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3z" />
                  <path d="M13 8a1 1 0 1 0-2 0 3 3 0 0 1-6 0 1 1 0 1 0-2 0 5 5 0 0 0 4 4.9V14H5.5a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1H9v-1.1A5 5 0 0 0 13 8z" />
                </svg>
                {listening ? "Stop" : "Dictate"}
              </button>
            )}
          </div>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={10}
            placeholder="e.g. A customer places an order. The Sales Team checks the order..."
            className={`w-full text-xs border rounded px-2 py-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed ${
              listening ? "border-red-300 bg-red-50/30" : "border-gray-300"
            }`} />
          {listening && (
            <p className="text-[9px] text-red-500 mt-0.5 animate-pulse">Listening...</p>
          )}

          {/* File attachment */}
          <div className="flex items-center gap-1.5 mt-1">
            <input ref={fileInputRef} type="file" className="hidden"
              accept=".pdf,.txt,.md,.csv,.rtf,.doc,.docx"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileAttach(f); e.target.value = ""; }} />
            <button onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 text-[10px] text-gray-500 border border-gray-300 rounded px-1.5 py-0.5 hover:bg-gray-50"
              title="Attach a document (PDF, TXT, MD, CSV)">
              <svg width={10} height={10} viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.5 3a2.5 2.5 0 0 1 5 0v9a1.5 1.5 0 0 1-3 0V5a.5.5 0 0 1 1 0v7a.5.5 0 0 0 1 0V3a1.5 1.5 0 0 0-3 0v9a2.5 2.5 0 0 0 5 0V5a.5.5 0 0 1 1 0v7a3.5 3.5 0 0 1-7 0V3z" />
              </svg>
              Attach
            </button>
            {attachment && (
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <span className="text-[10px] text-blue-600 truncate flex-1">{attachment.name}</span>
                <button onClick={() => setAttachment(null)} className="text-gray-400 hover:text-red-500 text-[10px] shrink-0" title="Remove attachment">&times;</button>
              </div>
            )}
          </div>
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

        {isAdmin && diagramType === "bpmn" && (
          <button
            onClick={() => {
              const els = currentElements ?? [];
              const conns = currentConnectors ?? [];
              const generated = buildBpmnPrompt(els, conns);
              setPrompt(generated);
              setEditingPromptId(null);
              setSaveName("");
              setShowSave(false);
              setError(null);
              setStatus("Created prompt from current diagram. Edit and save if you'd like.");
            }}
            className="px-3 py-1.5 text-xs text-purple-700 bg-purple-50 border border-purple-300 rounded hover:bg-purple-100"
            title="Admin only \u2014 reverse-engineer the current diagram into a structured prompt"
          >
            Create Prompt from Diagram
          </button>
        )}

        <div className="flex gap-1.5">
          <button onClick={handleGenerate} disabled={generating || !prompt.trim()}
            className="flex-1 px-3 py-1.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {generating ? "Generating\u2026" : "Generate"}
          </button>
          {editingPromptId ? (
            <>
              <button onClick={() => { setShowSave(true); }}
                disabled={!prompt.trim()}
                className="px-2 py-1.5 text-xs text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                title="Update saved prompt">Update</button>
              <button onClick={() => { setEditingPromptId(null); setSaveName(""); setShowSave(false); }}
                className="px-2 py-1.5 text-xs text-gray-500 border border-gray-300 rounded hover:bg-gray-50"
                title="Stop editing, save as new instead">New</button>
            </>
          ) : (
            <button onClick={() => { setShowSave(!showSave); setEditingPromptId(null); }} disabled={!prompt.trim()}
              className="px-2 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              title="Save this prompt">Save</button>
          )}
        </div>

        {showSave && (
          <div className="flex gap-1">
            <input type="text" value={saveName} onChange={e => setSaveName(e.target.value)}
              placeholder="Prompt name" className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
              onKeyDown={e => { if (e.key === "Enter") handleSavePrompt(); }} />
            <button onClick={handleSavePrompt} disabled={!saveName.trim()}
              className="px-2 py-1 text-xs text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50">
              {editingPromptId ? "Update" : "\u2713"}</button>
            <button onClick={() => { setShowSave(false); setSaveName(""); setEditingPromptId(null); }}
              className="px-2 py-1 text-xs text-gray-500 border border-gray-300 rounded hover:bg-gray-50">{"\u2715"}</button>
          </div>
        )}

        <p className="text-[9px] text-gray-400">
          Your BPMN rules are included automatically. Edit rules from the Dashboard.
        </p>

        {status && <p className="text-[10px] text-green-600">{status}</p>}
        {error && <p className="text-[10px] text-red-600">{error}</p>}
      </div>
    </div>
  );
}
