"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { SUPERUSER_EMAILS } from "@/app/lib/superuser";
import type { DiagramData, DiagramElement, Connector, DiagramType, AiFeedback } from "@/app/lib/diagram/types";
import { DiagramatixThrobber } from "@/app/components/DiagramatixThrobber";
import { AttachmentPreviewDialog } from "@/app/components/AttachmentPreviewDialog";
import { ClarificationDialog } from "@/app/components/ClarificationDialog";
import { startDictation, type DictationHandle } from "@/app/lib/dictation";
import { AudioToProcessButton } from "@/app/components/AudioToProcessButton";
import { appendClarifications } from "@/app/lib/diagram/clarifications";
import { buildPromptFromDiagram } from "@/app/lib/diagram/prompt-from-diagram";

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
  /** Reports the panel's `generating` state to the parent so a
   *  full-canvas overlay can be rendered while Sonnet runs. */
  onGeneratingChange?: (generating: boolean) => void;
  /** Admin-only Create Prompt from Diagram block. The two buttons —
   *  Technical Description (deterministic walker) and Staff Narrative
   *  (Sonnet rewrite under the editable briefing) — only render when
   *  isAdmin is true. */
  isAdmin?: boolean;
  /** Current diagram contents fed into buildPromptFromDiagram for both
   *  the Technical Description and the Staff Narrative paths. */
  currentElements?: DiagramElement[];
  currentConnectors?: Connector[];
  /** Reports the Staff Narrative call's busy state so the parent can
   *  flip the full-canvas overlay copy to "Asking Sonnet for a staff
   *  narrative…" while the call is in-flight. */
  onNarrativeGeneratingChange?: (generating: boolean) => void;
  /** Reports the audio/transcript acquisition phase so the parent can show
   *  the big canvas throbber overlay (same as plan generation). */
  onAudioPhaseChange?: (phase: null | "transcribing" | "reading" | "tidying") => void;
  /** Persisted AI feedback (open questions + answers) for this diagram. */
  aiFeedback?: AiFeedback;
  /** Persist the AI feedback on the diagram. */
  onAiFeedback?: (feedback: AiFeedback | undefined) => void;
  /** The current diagram's id — needed by the SuperAdmin "Compare all models"
   *  action (the server fills this diagram with the best output). */
  diagramId?: string;
  /** Notifies the parent when a model comparison was produced, so it can show
   *  the "AI Comparison Results" button. */
  onComparison?: (comparison: unknown) => void;
}

export function AiPanel({
  diagramType, onApplyDiagram, onAddToDiagram, onClose, onGeneratingChange,
  isAdmin, currentElements, currentConnectors, onNarrativeGeneratingChange,
  onAudioPhaseChange, aiFeedback, onAiFeedback, diagramId, onComparison,
}: Props) {
  const { data: authSession } = useSession();
  const isSuperuser = !!authSession?.user?.email
    && SUPERUSER_EMAILS.has(authSession.user.email.toLowerCase());
  const [comparing, setComparing] = useState(false);
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [narrativeGenerating, setNarrativeGenerating] = useState(false);
  // Notify the parent so it can render a full-canvas Diagramatix overlay.
  useEffect(() => { onGeneratingChange?.(generating); }, [generating, onGeneratingChange]);
  useEffect(() => { onNarrativeGeneratingChange?.(narrativeGenerating); }, [narrativeGenerating, onNarrativeGeneratingChange]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [audioPhase, setAudioPhase] = useState<null | "transcribing" | "reading" | "tidying">(null);
  const [mode, setMode] = useState<"replace" | "add">("replace");

  // Saved prompts
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // File attachment
  const [attachment, setAttachment] = useState<{ name: string; type: string; data: string } | null>(null);
  const [showAttachPreview, setShowAttachPreview] = useState(false);
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
    // Seed the prompt only if the user hasn't typed anything yet.
    setPrompt(prev => prev.trim().length > 0
      ? prev
      : `I have attached a document, ${file.name}`);
  }

  // Speech-to-text dictation — Deepgram streaming (with browser fallback),
  // managed by the shared dictation client.
  const [listening, setListening] = useState(false);
  const [dictEngine, setDictEngine] = useState<"deepgram" | "browser" | null>(null);
  const dictRef = useRef<DictationHandle | null>(null);
  const speechSupported = typeof window !== "undefined"
    && (!!navigator.mediaDevices?.getUserMedia || !!(window.SpeechRecognition || window.webkitSpeechRecognition));

  async function toggleDictation() {
    if (listening) {
      dictRef.current?.stop();
      dictRef.current = null;
      setListening(false);
      setDictEngine(null);
      return;
    }
    setListening(true);
    setError(null);
    const handle = await startDictation({
      onText: (text) => setPrompt(prev => {
        const base = prev && !prev.endsWith(" ") && !prev.endsWith("\n") ? prev + " " : prev;
        return base + text;
      }),
      onError: (msg) => setError(msg),
      onEngine: (e) => setDictEngine(e),
      onEnd: () => { dictRef.current = null; setListening(false); setDictEngine(null); },
    });
    if (!handle) { setListening(false); setDictEngine(null); return; }
    dictRef.current = handle;
  }

  // Stop dictation on unmount
  useEffect(() => () => { dictRef.current?.stop(); }, []);

  /** Admin-only — reverse-engineer the current diagram into a
   *  structured Technical Description and drop it into the prompt
   *  textarea so the user can refine it and re-feed AI Generate. Sync
   *  walker; no Sonnet call. */
  const callTechnicalDescription = useCallback(() => {
    if (generating || narrativeGenerating) return;
    const text = buildPromptFromDiagram(
      currentElements ?? [],
      currentConnectors ?? [],
      diagramType as DiagramType,
    );
    if (!text.trim()) {
      setError("Diagram is empty — nothing to describe yet.");
      return;
    }
    setPrompt(text);
    setEditingPromptId(null);
    setSaveName("");
    setShowSave(false);
    setError(null);
    setStatus("Created prompt from current diagram. Edit and save if you'd like.");
  }, [currentElements, currentConnectors, diagramType, generating, narrativeGenerating]);

  /** Admin-only — send the structured Technical Description to Sonnet
   *  under the editable briefing (DiagramRules category="staff-narrative")
   *  and drop the returned first-person narrative into the prompt
   *  textarea. */
  const callStaffNarrative = useCallback(async () => {
    if (generating || narrativeGenerating) return;
    const technicalDescription = buildPromptFromDiagram(
      currentElements ?? [],
      currentConnectors ?? [],
      diagramType as DiagramType,
    );
    if (!technicalDescription.trim()) {
      setError("Diagram is empty — nothing to narrate yet.");
      return;
    }
    setNarrativeGenerating(true);
    setError(null);
    setStatus("Generating the staff narrative (15–30 s)…");
    try {
      const res = await fetch("/api/ai/staff-narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technicalDescription }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Staff narrative generation failed");
        setStatus(null);
        return;
      }
      setPrompt(json.narrative ?? "");
      setEditingPromptId(null);
      setSaveName("");
      setShowSave(false);
      setStatus("Staff narrative generated. Edit and save if you'd like.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setStatus(null);
    } finally {
      setNarrativeGenerating(false);
    }
  }, [generating, narrativeGenerating, currentElements, currentConnectors, diagramType]);

  const loadPrompts = useCallback(async () => {
    try {
      const res = await fetch(`/api/prompts?diagramType=${encodeURIComponent(diagramType)}`);
      if (res.ok) setSavedPrompts(await res.json());
    } catch { /* ignore */ }
  }, [diagramType]);

  useEffect(() => { loadPrompts(); }, [loadPrompts]);

  async function handleGenerate(promptOverride?: string) {
    const effPrompt = (promptOverride ?? prompt).trim();
    if (!effPrompt) return;
    setGenerating(true);
    setError(null);
    setStatus("Generating diagram (this may take 15-30 seconds)...");

    try {
      // Use BPMN-specific endpoint (with layout engine) for BPMN, generic for others
      const endpoint = diagramType === "bpmn" ? "/api/ai/generate-bpmn" : "/api/ai/generate-diagram";
      const body = diagramType === "bpmn"
        ? { prompt: effPrompt, mode: "generate", attachment: attachment ?? undefined }
        : { prompt: effPrompt, diagramType, attachment: attachment ?? undefined };

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

  /** SuperAdmin: generate this prompt across Fable 5 / Opus 4.8 / Sonnet 5 / Haiku 4.5,
   *  fill the current diagram with the best output, and save a diagram per
   *  model. Four live calls — slow. */
  async function handleCompare() {
    const effPrompt = prompt.trim();
    if (!effPrompt || !diagramId) return;
    setComparing(true);
    setGenerating(true); // drives the full-canvas overlay
    setError(null);
    setStatus("Comparing models — Fable 5, Opus 4.8, Sonnet 5, Haiku 4.5 (this takes 2-3 minutes)…");
    try {
      const res = await fetch("/api/ai/generate-bpmn/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: effPrompt, diagramId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        setError(err.error ?? "Comparison failed");
        setStatus(null);
        return;
      }
      const result = await res.json();
      if (result.diagramData?.elements) {
        onApplyDiagram(result.diagramData); // fill with the best output
      }
      onComparison?.(result.comparison);
      const chosen = result.comparison?.chosenModel;
      setStatus(chosen
        ? `Filled with the best result (${chosen}). All model diagrams saved — open "AI Comparison Results" to compare.`
        : `No model produced a diagram. Open "AI Comparison Results" for the per-model errors.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setStatus(null);
    } finally {
      setComparing(false);
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
        {isAdmin && (
          <div>
            {/* Admin-only red banner + two reverse-engineering options.
                Red picks them out from the regular blue/grey controls
                so admins spot them instantly. Mirrors the same block on
                the BPMN PlanPanel. */}
            <p className="text-[10px] font-semibold text-red-600 mb-1 uppercase tracking-wide">
              Create Prompt from Diagram
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={callTechnicalDescription}
                disabled={generating || narrativeGenerating}
                className="flex-1 px-2 py-1 text-[11px] font-medium text-red-700 bg-red-50 border border-red-300 rounded hover:bg-red-100 disabled:opacity-50"
                title="Admin only — reverse-engineer the current diagram into a structured Technical Description"
              >
                Technical Description
              </button>
              <button
                onClick={callStaffNarrative}
                disabled={generating || narrativeGenerating}
                className="flex-1 px-2 py-1 text-[11px] font-medium text-red-700 bg-red-50/60 border border-red-300 rounded hover:bg-red-100 disabled:opacity-50"
                title="Admin only — ask the AI to rewrite the diagram as a Staff Narrative (uses the editable briefing in /dashboard/rules → Staff Narrative Briefing)"
              >
                Staff Narrative
              </button>
            </div>
          </div>
        )}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-gray-500 font-medium">Describe the process</label>
            {speechSupported && (
              <button
                onClick={toggleDictation}
                className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${
                  listening
                    ? (dictEngine === "deepgram"
                        ? "text-blue-700 border-blue-400 bg-blue-50 hover:bg-blue-100"
                        : "text-red-600 border-red-300 bg-red-50 hover:bg-red-100")
                    : "text-gray-500 border-gray-300 hover:bg-gray-50"
                }`}
                title={listening
                  ? `Stop dictation — ${dictEngine === "deepgram" ? "Deepgram (high quality)" : "browser fallback"}`
                  : "Dictate prompt"}
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
              listening ? (dictEngine === "deepgram" ? "border-blue-400 bg-blue-50/30" : "border-red-300 bg-red-50/30") : "border-gray-300"
            }`} />
          {listening && (
            dictEngine === "deepgram"
              ? <p className="text-[9px] text-blue-600 mt-0.5 animate-pulse">Listening — Deepgram (high quality)…</p>
              : <p className="text-[9px] text-red-500 mt-0.5 animate-pulse">Listening — browser fallback…</p>
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
            <AudioToProcessButton
              disabled={generating}
              diagramType={diagramType}
              onPhaseChange={(p) => { setAudioPhase(p); onAudioPhaseChange?.(p); }}
              onError={(m) => { if (m) setError(m); }}
              onFeedback={(questions) => onAiFeedback?.({
                questions: questions.map(q => ({ q })),
                createdAt: new Date().toISOString(),
              })}
              onTranscript={(text) => setPrompt(prev => prev.trim()
                ? prev.trimEnd() + "\n" + text
                : "Generate the diagram from this discussion transcript; use people's roles or job functions rather than their personal names (in any actor, role, activity or annotation labels), and ignore small talk.\n\n" + text)}
            />
            {aiFeedback && aiFeedback.questions.length > 0 && (
              <button
                onClick={() => setClarifyOpen(true)}
                className="flex items-center gap-1 text-[10px] text-amber-700 border border-amber-300 bg-amber-50 rounded px-1.5 py-0.5 hover:bg-amber-100"
                title="Answer the AI's open questions and regenerate"
              >
                Ask for Clarification ({aiFeedback.questions.length})
              </button>
            )}
            {attachment && (
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <button onClick={() => setShowAttachPreview(true)} className="text-[10px] text-blue-600 truncate flex-1 text-left hover:underline" title="Preview attachment">{attachment.name}</button>
                <button onClick={() => setShowAttachPreview(true)} className="text-gray-400 hover:text-blue-500 text-[10px] shrink-0" title="Preview attachment">Preview</button>
                <button onClick={() => setAttachment(null)} className="text-gray-400 hover:text-red-500 text-[10px] shrink-0" title="Remove attachment">&times;</button>
              </div>
            )}
          </div>
        </div>

        {showAttachPreview && attachment && (
          <AttachmentPreviewDialog attachment={attachment} onClose={() => setShowAttachPreview(false)} />
        )}

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

        {/* Throbber banner while generating — same on-brand
            DiagramatixThrobber the BPMN PlanPanel uses, for visual
            consistency across every AI Generation flow. */}
        {(generating || narrativeGenerating) && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
            <DiagramatixThrobber size={28} />
            <span className="text-[11px] text-blue-800 font-medium">
              {narrativeGenerating
                ? "Generating the staff narrative — this usually takes 15–30 s…"
                : "Generating — this usually takes 15–30 s…"}
            </span>
          </div>
        )}
        {audioPhase && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
            <DiagramatixThrobber size={28} />
            <span className="text-[11px] text-blue-800 font-medium">
              {audioPhase === "transcribing"
                ? "Transcribing your recording — this can take a little while…"
                : audioPhase === "reading"
                  ? "Reading the meeting transcript…"
                  : "Tidying the discussion into an ordered process…"}
            </span>
          </div>
        )}

        {clarifyOpen && aiFeedback && (
          <ClarificationDialog
            questions={aiFeedback.questions.map(x => x.q)}
            initialAnswers={aiFeedback.questions.map(x => x.a ?? "")}
            onCancel={() => setClarifyOpen(false)}
            onSubmit={(answers) => {
              const updated: AiFeedback = {
                questions: aiFeedback.questions.map((x, i) => ({ q: x.q, a: answers[i]?.trim() || undefined })),
                createdAt: aiFeedback.createdAt,
              };
              onAiFeedback?.(updated);
              const newPrompt = appendClarifications(prompt, updated);
              setPrompt(newPrompt);
              setClarifyOpen(false);
              void handleGenerate(newPrompt);
            }}
          />
        )}

        <div className="flex gap-1.5">
          <button onClick={() => handleGenerate()} disabled={generating || !prompt.trim()}
            className="flex-1 px-3 py-1.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5">
            {generating && (
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
            {generating ? "Generating…" : "Generate"}
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

        {isSuperuser && diagramType === "bpmn" && (
          <button onClick={() => handleCompare()}
            disabled={generating || comparing || !prompt.trim() || !diagramId}
            className="w-full px-3 py-1.5 text-xs text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
            title="SuperAdmin: generate with Fable 5, Opus 4.8, Sonnet 5 and Haiku 4.5, fill this diagram with the best result, and save one diagram per model">
            {comparing && (
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
            {comparing ? "Comparing models…" : "Compare all models (SuperAdmin)"}
          </button>
        )}

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

        {status && (
          <div className="relative text-[10px] text-green-700 bg-green-50 border border-green-200 rounded pl-1.5 pr-5 py-0.5 max-h-32 overflow-y-auto whitespace-pre-wrap">
            <button
              onClick={() => setStatus(null)}
              className="absolute top-0.5 right-0.5 text-green-400 hover:text-green-700 leading-none"
              title="Dismiss"
              aria-label="Dismiss"
            >&times;</button>
            {status}
          </div>
        )}
        {error && <p className="text-[10px] text-red-600">{error}</p>}
      </div>
    </div>
  );
}
