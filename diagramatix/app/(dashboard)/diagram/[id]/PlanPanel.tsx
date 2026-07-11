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
import { useSession } from "next-auth/react";
import { SUPERUSER_EMAILS } from "@/app/lib/superuser";
import { useSuperAdminChrome } from "@/app/hooks/useSuperAdminChrome";
import type { Connector, DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { buildPromptFromDiagram } from "@/app/lib/diagram/prompt-from-diagram";
import type { DiagramType } from "@/app/lib/diagram/types";
import { usePlanState, type Plan } from "./ai-plan/usePlanState";
import { PoolsLanesTree } from "./ai-plan/PoolsLanesTree";
import { ElementsByContainerView } from "./ai-plan/ElementsByContainerView";
import { ConnectorsByTypeView } from "./ai-plan/ConnectorsByTypeView";
import { PlanStructureModal } from "./ai-plan/PlanStructureModal";
import { DiagramatixThrobber } from "@/app/components/DiagramatixThrobber";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { AttachmentPreviewDialog } from "@/app/components/AttachmentPreviewDialog";
import { AudioToProcessButton } from "@/app/components/AudioToProcessButton";
import { ClarificationDialog } from "@/app/components/ClarificationDialog";
import { startDictation, type DictationHandle } from "@/app/lib/dictation";
import { appendClarifications } from "@/app/lib/diagram/clarifications";
import type { AiFeedback } from "@/app/lib/diagram/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { SpeechRecognition: any; webkitSpeechRecognition: any; }
}

/** Tiny inline SVG throbber. `animate-spin` is a Tailwind utility. */
function Spinner({ className = "w-3 h-3 text-current" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// DiagramatixThrobber moved to app/components/DiagramatixThrobber.tsx so
// the canvas overlay (in DiagramEditor) can render it too.

interface Props {
  diagramType: string;
  onApplyDiagram: (data: DiagramData) => void;
  onClose: () => void;
  isAdmin?: boolean;
  currentElements?: DiagramElement[];
  currentConnectors?: Connector[];
  /** Fired whenever the panel's local busy state changes. Lets the
   *  parent (DiagramEditor) overlay a wait indicator on the canvas
   *  itself — the sidebar banner alone is easy to miss while the
   *  user's eyes are on the diagram. */
  onBusyChange?: (busy: "plan" | "apply" | "save" | "load" | "narrative" | "compare" | null) => void;
  /** Reports the audio/transcript acquisition phase so the parent can show
   *  the big canvas throbber overlay (same as plan generation). */
  onAudioPhaseChange?: (phase: null | "transcribing" | "reading" | "tidying") => void;
  /** Persisted AI feedback (open questions + answers) for this diagram. */
  aiFeedback?: AiFeedback;
  /** Persist the AI feedback on the diagram. */
  onAiFeedback?: (feedback: AiFeedback | undefined) => void;
  /** Current diagram id — the SuperAdmin "Compare all models" action fills this
   *  diagram with the best output. */
  diagramId?: string;
  /** Notifies the parent when a model comparison was produced. */
  onComparison?: (comparison: unknown) => void;
  /** The diagram's APQC PCF classification — grounds the plan to that standard
   *  process's decomposition (Level 3). */
  pcf?: { nodeId: string; hierarchyId: string; name: string; variant: string };
}

interface SavedPrompt { id: string; name: string; text: string; }

type Tab = "pools" | "elements" | "connectors" | "json";

export function PlanPanel({
  diagramType,
  onApplyDiagram,
  onClose,
  isAdmin = false,
  currentElements,
  currentConnectors,
  onBusyChange,
  onAudioPhaseChange,
  aiFeedback,
  onAiFeedback,
  diagramId,
  onComparison,
  pcf,
}: Props) {
  const { data: authSession } = useSession();
  const isSuperuser = !!authSession?.user?.email
    && SUPERUSER_EMAILS.has(authSession.user.email.toLowerCase());
  // SuperAdmin "presentation mode" (toggled by double-clicking the logo) — hides
  // the SuperAdmin-only AI options. No-op for non-SuperAdmins.
  const { hidden: superAdminHidden } = useSuperAdminChrome(isSuperuser || !!isAdmin);
  const [comparing, setComparing] = useState(false);
  const [compareStatus, setCompareStatus] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [clarifyOpen, setClarifyOpen] = useState(false);
  // Flowcharts use their own 2-phase endpoints + a deterministic top-down
  // layout. The structured Pools/Elements/Connectors tabs are BPMN-plan
  // shaped, so flowcharts edit the plan via the generic Raw JSON tab.
  const isFlowchart = diagramType === "flowchart";
  const apiBase = isFlowchart ? "/api/ai/flowchart" : "/api/ai/bpmn";
  const { plan, setPlan, updateElement, deleteElement, updateConnection, deleteConnection, moveElementRelativeTo, asJson } = usePlanState();
  const [activeTab, setActiveTab] = useState<Tab>(isFlowchart ? "json" : "pools");
  const [busy, setBusy] = useState<"plan" | "apply" | "save" | "load" | "narrative" | "compare" | null>(null);
  // Propagate busy transitions up so DiagramEditor can overlay a wait
  // indicator on the canvas.
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  const [error, setError] = useState<string | null>(null);

  /** SuperAdmin: generate this prompt across Fable 5 / Opus 4.8 / Sonnet 5 / Haiku 4.5,
   *  fill THIS diagram with the best output, and save one diagram per model.
   *  Four live calls — slow (2-3 min). */
  async function handleCompare() {
    const effPrompt = prompt.trim();
    if (!effPrompt || !diagramId) return;
    setComparing(true);
    setBusy("compare"); // drives the red full-canvas throbber overlay
    setError(null);
    setCompareStatus("Comparing Fable 5 / Opus 4.8 / Sonnet 5 / Haiku 4.5 — this takes 2-3 minutes…");
    try {
      const res = await fetch("/api/ai/generate-bpmn/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: effPrompt, diagramId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        setError(err.error ?? "Comparison failed");
        setCompareStatus(null);
        return;
      }
      const result = await res.json();
      if (result.diagramData?.elements) onApplyDiagram(result.diagramData);
      onComparison?.(result.comparison);
      setCompareStatus(result.comparison?.chosenModel
        ? `Filled with the best result (${result.comparison.chosenModel}). All model diagrams saved — open "AI Comparison Results" to compare.`
        : `No model produced a diagram. Open "AI Comparison Results" for the per-model errors.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setCompareStatus(null);
    } finally {
      setComparing(false);
      setBusy(null);
    }
  }
  const [issues, setIssues] = useState<string[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Saved prompts (with optional persisted plan JSON — Milestone D).
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [replacePlanConfirm, setReplacePlanConfirm] = useState(false);

  // Raw JSON tab has its own draft so mid-typing doesn't nuke structured state.
  // It syncs FROM `asJson` whenever the tab is NOT focused; pushes BACK to
  // state only on explicit "Apply JSON" (or blur with valid JSON).
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonFocused, setJsonFocused] = useState(false);

  // File attachment. PDF and image bytes go as base64 (Claude has native
  // support for both PDF documents and the four supported image types);
  // everything else is read as plain text.
  const [attachment, setAttachment] = useState<
    | { name: string; type: "pdf" | "text"; data: string }
    | { name: string; type: "image"; data: string; mediaType: string }
    | null
  >(null);
  const [showAttachPreview, setShowAttachPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const IMAGE_TYPES: Record<string, string> = {
    "image/png": "image/png",
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/webp": "image/webp",
    "image/gif": "image/gif",
  };

  async function handleFileAttach(file: File) {
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) { setError("File too large (max 10MB)"); return; }
    if (file.type === "application/pdf") {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      setAttachment({ name: file.name, type: "pdf", data: base64 });
      setPrompt(prev => prev.trim().length > 0
        ? prev : `I have attached a document, ${file.name}`);
    } else if (IMAGE_TYPES[file.type]) {
      // Image of a BPMN diagram or a flowchart — feed Sonnet's vision
      // API so it can reverse-engineer the process. The system prompt
      // teaches the shape-to-BPMN mapping.
      const buffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      setAttachment({ name: file.name, type: "image", data: base64, mediaType: IMAGE_TYPES[file.type] });
      setPrompt(prev => prev.trim().length > 0
        ? prev
        : `I have attached an image of a process diagram (${file.name}). Reverse-engineer the BPMN from it.`);
    } else {
      const text = await file.text();
      setAttachment({ name: file.name, type: "text", data: text });
      setPrompt(prev => prev.trim().length > 0
        ? prev : `I have attached a document, ${file.name}`);
    }
    setError(null);
  }

  // Speech-to-text dictation — Deepgram streaming (with browser fallback),
  // managed by the shared dictation client.
  const [listening, setListening] = useState(false);
  const [dictEngine, setDictEngine] = useState<"deepgram" | "browser" | null>(null);
  const [dictateMsg, setDictateMsg] = useState<string | null>(null);
  const [audioPhase, setAudioPhase] = useState<null | "transcribing" | "reading" | "tidying">(null);
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
    if (!speechSupported) return;
    setDictateMsg(null);
    setListening(true);
    const handle = await startDictation({
      onText: (text) => setPrompt(prev => {
        const base = prev && !prev.endsWith(" ") && !prev.endsWith("\n") ? prev + " " : prev;
        return base + text;
      }),
      onError: (msg) => setDictateMsg(msg),
      onEngine: (e) => setDictEngine(e),
      onEnd: () => { dictRef.current = null; setListening(false); setDictEngine(null); },
    });
    if (!handle) { setListening(false); setDictEngine(null); return; }
    dictRef.current = handle;
  }

  useEffect(() => () => { dictRef.current?.stop(); }, []);

  // ── Mic test ──────────────────────────────────────────────────────────────
  // Independent of the SpeechRecognition API: just grabs the raw audio
  // stream and shows a live level meter so the user can confirm Chrome is
  // actually hearing the selected microphone.
  const [testingMic, setTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);          // 0–100
  const [micDevice, setMicDevice] = useState<string | null>(null);
  const [micErr, setMicErr] = useState<string | null>(null);
  const micCleanupRef = useRef<(() => void) | null>(null);
  // Record the test audio so the user can replay it and hear what the mic captured.
  const [micRecordingUrl, setMicRecordingUrl] = useState<string | null>(null);
  const micRecorderRef = useRef<MediaRecorder | null>(null);

  function stopMicTest() {
    micCleanupRef.current?.();
    micCleanupRef.current = null;
    setTestingMic(false);
  }

  async function testMicrophone() {
    if (testingMic) { stopMicTest(); return; }
    setMicErr(null);
    setMicLevel(0);
    setMicDevice(null);
    // Clear any previous recording.
    setMicRecordingUrl((old) => { if (old) URL.revokeObjectURL(old); return null; });
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicErr("This browser doesn't expose getUserMedia (mic access).");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as Error & { name?: string }).name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setMicErr("Mic permission denied. Click the padlock in the address bar → Site settings → allow Microphone.");
      } else if (name === "NotFoundError") {
        setMicErr("No microphone detected by the browser.");
      } else {
        setMicErr(`Mic error: ${(err as Error).message ?? name ?? "unknown"}`);
      }
      return;
    }
    const track = stream.getAudioTracks()[0];
    setMicDevice(track?.label || "(unnamed device)");

    // Record the stream so it can be replayed afterwards.
    let recorder: MediaRecorder | null = null;
    const chunks: BlobPart[] = [];
    if (typeof MediaRecorder !== "undefined") {
      try {
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunks.push(ev.data); };
        recorder.onstop = () => {
          if (chunks.length === 0) return;
          const blob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
          setMicRecordingUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
        };
        recorder.start();
        micRecorderRef.current = recorder;
      } catch { recorder = null; }
    }

    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new AC();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    let raf = 0;
    let stopped = false;
    function tick() {
      if (stopped) return;
      analyser.getByteTimeDomainData(buf);
      // RMS of centred samples (128 = silence in Uint8 time-domain).
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const d = buf[i] - 128;
        sum += d * d;
      }
      const rms = Math.sqrt(sum / buf.length);          // 0–~128
      setMicLevel(Math.min(100, Math.round((rms / 64) * 100)));
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    setTestingMic(true);

    const cleanup = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      // Stop the recorder first (its onstop builds the replay clip), then
      // release the audio graph + mic.
      try { if (recorder && recorder.state !== "inactive") recorder.stop(); } catch {}
      micRecorderRef.current = null;
      try { src.disconnect(); } catch {}
      try { ctx.close(); } catch {}
      stream.getTracks().forEach(t => t.stop());
    };
    micCleanupRef.current = cleanup;
    // Auto-stop after 8 s so we don't hold the mic indefinitely.
    setTimeout(() => { if (micCleanupRef.current === cleanup) stopMicTest(); }, 8000);
  }

  useEffect(() => () => { micCleanupRef.current?.(); }, []);
  // Release the recorded-clip blob URL when it's replaced or on unmount.
  useEffect(() => () => { if (micRecordingUrl) URL.revokeObjectURL(micRecordingUrl); }, [micRecordingUrl]);

  // Resizable sections — Saved Prompts + Tabs. The Description textarea
  // takes whatever's left (flex-1). Dragging the horizontal handles between
  // sections re-sizes them. Tabs area starts COLLAPSED so the description
  // gets maximum room; the user expands it with the chevron or by dragging
  // the handle above it.
  const [savedPromptsH, setSavedPromptsH] = useState(96);
  const [tabsH, setTabsH] = useState(280);
  const [tabsExpanded, setTabsExpanded] = useState(false);
  const [structOpen, setStructOpen] = useState(false);

  function startResize(
    setter: React.Dispatch<React.SetStateAction<number>>,
    sign: 1 | -1,
    min: number,
    max: number,
  ) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      let startH = 0;
      setter(prev => { startH = prev; return prev; });
      function onMove(ev: MouseEvent) {
        const delta = (ev.clientY - startY) * sign;
        setter(Math.max(min, Math.min(max, startH + delta)));
      }
      function onUp() {
        document.body.style.cursor = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      }
      document.body.style.cursor = "row-resize";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };
  }
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

  // Load the saved-prompts list on mount.
  const loadPromptList = useCallback(async () => {
    try {
      const res = await fetch(`/api/prompts?diagramType=${encodeURIComponent(diagramType)}`);
      if (res.ok) setSavedPrompts(await res.json());
    } catch { /* ignore */ }
  }, [diagramType]);
  useEffect(() => { loadPromptList(); }, [loadPromptList]);

  // Select a saved prompt → fetch its planJson and load into state.
  const loadSavedPrompt = useCallback(async (sp: SavedPrompt) => {
    if (busy) return;
    setBusy("load");
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/prompts/${sp.id}`);
      if (!res.ok) throw new Error("Could not load prompt");
      const row = await res.json();
      setPrompt(row.text ?? sp.text);
      setEditingPromptId(sp.id);
      setSaveName(sp.name);
      if (row.planJson && Array.isArray(row.planJson.elements) && Array.isArray(row.planJson.connections)) {
        setPlan(row.planJson);
        lastSonnetResponseRef.current = JSON.stringify(row.planJson, null, 2);
        setStatus(`Loaded "${sp.name}" (${row.planJson.elements.length} elements, ${row.planJson.connections.length} connections)`);
      } else {
        setPlan({ elements: [], connections: [] });
        lastSonnetResponseRef.current = null;
        setStatus(`Loaded "${sp.name}" — no saved plan yet, click Plan to generate`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setBusy(null);
    }
  }, [busy, setPlan]);

  // Save the current prompt text + plan JSON. Creates a new prompt or updates
  // the existing one based on editingPromptId. planJson is sent as-is (can be
  // null for a prompt with no plan yet).
  const savePrompt = useCallback(async () => {
    if (!saveName.trim() || !prompt.trim() || busy) return;
    setBusy("save");
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: saveName.trim(),
        text: prompt.trim(),
        planJson: hasPlan ? plan : null,
      };
      let res: Response;
      if (editingPromptId) {
        res = await fetch(`/api/prompts/${editingPromptId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch("/api/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, diagramType }),
        });
      }
      if (!res.ok) throw new Error("Save failed");
      const saved = await res.json();
      setEditingPromptId(saved.id);
      setShowSave(false);
      setStatus(`Saved "${saveName.trim()}"`);
      await loadPromptList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }, [saveName, prompt, busy, editingPromptId, diagramType, hasPlan, plan, loadPromptList]);

  const deletePrompt = useCallback(async (id: string) => {
    try {
      await fetch(`/api/prompts/${id}`, { method: "DELETE" });
      if (editingPromptId === id) {
        setEditingPromptId(null);
        setSaveName("");
      }
      setConfirmDeleteId(null);
      await loadPromptList();
    } catch { /* ignore */ }
  }, [editingPromptId, loadPromptList]);

  const executePlanCall = useCallback(async (promptOverride?: string) => {
    const effPrompt = (promptOverride ?? prompt).trim();
    setBusy("plan");
    setError(null);
    setIssues(null);
    setStatus("Requesting plan from Sonnet (15–30 s)…");
    try {
      const res = await fetch(`${apiBase}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: effPrompt, attachment: attachment ?? undefined, pcfNodeId: pcf?.nodeId }),
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
  }, [prompt, setPlan, attachment, apiBase]);

  const callPlan = useCallback(async () => {
    if (!prompt.trim() || busy) return;
    // If the user has an edited plan in state, warn before clobbering.
    if (hasPlan && lastSonnetResponseRef.current != null && asJson !== lastSonnetResponseRef.current) {
      setReplacePlanConfirm(true);
      return;
    }
    await executePlanCall();
  }, [prompt, busy, hasPlan, asJson, executePlanCall]);

  /** Generate a Staff Narrative from the current diagram. Builds the
   *  Technical Description with the same walker the other button uses,
   *  sends it to /api/ai/staff-narrative, and drops the narrative back
   *  into the prompt textarea — same destination as Technical
   *  Description so the existing edit-and-resubmit workflow still
   *  works. */
  const callNarrative = useCallback(async () => {
    if (busy) return;
    const technicalDescription = buildPromptFromDiagram(
      currentElements ?? [],
      currentConnectors ?? [],
      diagramType as DiagramType,
    );
    if (!technicalDescription.trim()) {
      setError("Diagram is empty — nothing to narrate yet.");
      return;
    }
    setBusy("narrative");
    setError(null);
    setStatus("Asking Sonnet for a staff narrative (15–30 s)…");
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
      setBusy(null);
    }
  }, [busy, currentElements, currentConnectors, diagramType, setPrompt]);

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
      // R56: tag the AI-generated diagram with an annotation on the Start
      // Event. Label uses the saved prompt name when loaded, falling back
      // to the first 100 chars of the prompt text.
      const savedName = editingPromptId
        ? savedPrompts.find(sp => sp.id === editingPromptId)?.name
        : undefined;
      const promptLabel = (savedName?.trim().length ? savedName.trim() : prompt.trim().slice(0, 100))
        || undefined;
      const res = await fetch(`${apiBase}/apply-layout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, promptLabel }),
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
      if (isFlowchart) {
        setStatus(`Applied: ${json.elementCount} elements, ${json.connectionCount} flowlines`);
      } else {
        const poolCount = plan.elements.filter(e => e.type === "pool").length;
        setStatus(`Applied: ${poolCount} pool${poolCount === 1 ? "" : "s"}, ${json.elementCount} elements, ${json.connectionCount} connections`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setStatus(null);
    } finally {
      setBusy(null);
    }
  }, [plan, hasPlan, busy, onApplyDiagram, activeTab, jsonDraft, asJson, commitJson, apiBase, isFlowchart]);

  return (
    <div className="w-96 border-l border-gray-200 bg-white flex flex-col shrink-0 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          AI Plan <span className="text-[10px] font-normal text-gray-400 lowercase">(2-phase)</span>
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm" title="Close">&times;</button>
      </div>

      <div className="flex-1 px-3 py-2 flex flex-col overflow-hidden">
        {diagramType !== "bpmn" && (
          <p className="text-[11px] text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1 mb-2 shrink-0">
            2-phase mode is currently BPMN-only.
          </p>
        )}

        {savedPrompts.length > 0 && (
          <div className="shrink-0 mb-1" style={{ height: savedPromptsH }}>
            <p className="text-[10px] text-gray-400 font-medium uppercase mb-1">Saved Prompts</p>
            <div className="space-y-0.5 overflow-y-auto border border-gray-100 rounded" style={{ height: `calc(100% - 16px)` }}>
              {savedPrompts.map(sp => (
                <div key={sp.id} className="flex items-center gap-1 group px-1">
                  {confirmDeleteId === sp.id ? (
                    <>
                      <span className="flex-1 text-[10px] text-red-600 truncate">Delete &ldquo;{sp.name}&rdquo;?</span>
                      <button onClick={() => deletePrompt(sp.id)}
                        className="text-[10px] text-red-600 font-medium hover:text-red-800 px-1">Yes</button>
                      <button onClick={() => setConfirmDeleteId(null)}
                        className="text-[10px] text-gray-500 hover:text-gray-700 px-1">No</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => loadSavedPrompt(sp)}
                        className={`flex-1 text-left text-[11px] truncate py-0.5 ${editingPromptId === sp.id ? "text-blue-600 font-medium" : "text-gray-700 hover:text-blue-600"}`}
                        title={sp.text}
                      >
                        {sp.name}{editingPromptId === sp.id ? " (editing)" : ""}
                      </button>
                      <button onClick={() => setConfirmDeleteId(sp.id)}
                        className="text-gray-300 hover:text-red-500 text-[10px] opacity-0 group-hover:opacity-100 px-1"
                        title="Delete saved prompt"
                      >&times;</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {savedPrompts.length > 0 && (
          <div
            onMouseDown={startResize(setSavedPromptsH, 1, 40, 400)}
            className="shrink-0 h-1 cursor-row-resize hover:bg-blue-300 bg-gray-100 mb-1 rounded"
            title="Drag to resize Saved Prompts area"
          />
        )}

        <div className="flex-1 flex flex-col min-h-0 mb-2">
          <div className="flex items-center justify-between mb-1 shrink-0">
            <label className="text-[10px] text-gray-500 font-medium">Describe the process</label>
            <div className="flex items-center gap-1">
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
              <button
                onClick={testMicrophone}
                className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${
                  testingMic
                    ? "text-green-700 border-green-300 bg-green-50 hover:bg-green-100"
                    : "text-gray-500 border-gray-300 hover:bg-gray-50"
                }`}
                title="Test the browser's selected microphone for ~8 seconds. Talk and watch the bar move."
              >
                {testingMic ? "Stop test" : "Test mic"}
              </button>
            </div>
          </div>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="A customer places an order. The warehouse checks stock. If in stock, it ships the order. Otherwise it notifies the customer."
            className={`flex-1 w-full px-2 py-1.5 text-[11px] border rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 ${
              listening ? (dictEngine === "deepgram" ? "border-blue-400 bg-blue-50/30" : "border-red-300 bg-red-50/30") : "border-gray-300"
            }`}
          />
          {pcf && (
            <p className="mt-1 shrink-0 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1" title="The plan is aligned to this APQC PCF standard process's decomposition">
              ◎ Aligning to APQC PCF: <span className="font-mono">{pcf.hierarchyId}</span> {pcf.name}
            </p>
          )}
          {isSuperuser && !superAdminHidden && diagramType === "bpmn" && (
            <div className="mt-1 shrink-0">
              <button onClick={() => handleCompare()} disabled={comparing || !prompt.trim() || !diagramId}
                className="w-full px-2 py-1 text-[11px] text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
                title="SuperAdmin: generate with Fable 5, Opus 4.8, Sonnet 5 and Haiku 4.5, fill this diagram with the best result, and save one diagram per model">
                {comparing && (<svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>)}
                {comparing ? "Comparing models…" : "Compare all models (SuperAdmin)"}
              </button>
              {compareStatus && <p className="text-[9px] text-gray-600 mt-0.5 whitespace-pre-wrap">{compareStatus}</p>}
            </div>
          )}
          {listening && (
            dictEngine === "deepgram"
              ? <p className="text-[9px] text-blue-600 mt-0.5 animate-pulse shrink-0">Listening — Deepgram (high quality)…</p>
              : <p className="text-[9px] text-red-500 mt-0.5 animate-pulse shrink-0">Listening — browser fallback…</p>)}
          {dictateMsg && !listening && (
            <div className="relative text-[10px] text-orange-700 bg-orange-50 border border-orange-200 rounded pl-1.5 pr-5 py-0.5 mt-0.5 shrink-0 max-h-32 overflow-y-auto whitespace-pre-wrap">
              <button
                onClick={() => setDictateMsg(null)}
                className="absolute top-0.5 right-0.5 text-orange-400 hover:text-orange-700 leading-none"
                title="Dismiss"
                aria-label="Dismiss"
              >&times;</button>
              {dictateMsg}
            </div>
          )}
          {(testingMic || micErr || micDevice || micRecordingUrl) && (
            <div className="mt-1 shrink-0">
              {testingMic && (
                <>
                  <p className="text-[10px] text-green-700 mb-0.5">
                    Listening on: <span className="font-medium">{micDevice}</span> — talk now (it&apos;s recording)
                  </p>
                  <div className="h-2 bg-gray-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-[width] duration-75"
                      style={{ width: `${micLevel}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-gray-400 mt-0.5">
                    Bar should jump when you speak. Stop the test, then replay below to hear what was captured.
                  </p>
                </>
              )}
              {!testingMic && micDevice && !micErr && (
                <p className="text-[10px] text-gray-500">
                  Last test mic: <span className="font-medium">{micDevice}</span>
                </p>
              )}
              {!testingMic && micRecordingUrl && (
                <div className="mt-1">
                  <p className="text-[9px] text-gray-400 mb-0.5">Replay your test recording:</p>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio controls src={micRecordingUrl} className="w-full h-8" />
                </div>
              )}
              {micErr && (
                <p className="text-[10px] text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
                  {micErr}
                </p>
              )}
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-1 shrink-0">
            <input ref={fileInputRef} type="file" className="hidden"
              accept=".pdf,.txt,.md,.csv,.rtf,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif,image/*"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileAttach(f); e.target.value = ""; }} />
            <button onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 text-[10px] text-gray-500 border border-gray-300 rounded px-1.5 py-0.5 hover:bg-gray-50"
              title="Attach a document (PDF, TXT, MD, CSV, RTF, DOC, DOCX) or an image of a BPMN diagram / flowchart (PNG, JPEG, WebP, GIF)">
              <svg width={10} height={10} viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.5 3a2.5 2.5 0 0 1 5 0v9a1.5 1.5 0 0 1-3 0V5a.5.5 0 0 1 1 0v7a.5.5 0 0 0 1 0V3a1.5 1.5 0 0 0-3 0v9a2.5 2.5 0 0 0 5 0V5a.5.5 0 0 1 1 0v7a3.5 3.5 0 0 1-7 0V3z" />
              </svg>
              Attach
            </button>
            <AudioToProcessButton
              disabled={!!busy}
              diagramType={diagramType}
              onPhaseChange={(p) => { setAudioPhase(p); onAudioPhaseChange?.(p); }}
              onError={(m) => setDictateMsg(m || null)}
              onFeedback={(questions) => onAiFeedback?.({
                questions: questions.map(q => ({ q })),
                createdAt: new Date().toISOString(),
              })}
              onTranscript={(text) => setPrompt(prev => prev.trim()
                ? prev.trimEnd() + "\n" + text
                : "Build the BPMN process from this meeting transcript. Treat each distinct speaker as a role / lane, and use roles or job functions — never an individual person's name — in pool, lane, task and annotation names. Ignore small talk.\n\n" + text)}
            />
            {aiFeedback && aiFeedback.questions.length > 0 && (
              <button
                onClick={() => setClarifyOpen(true)}
                className="flex items-center gap-1 text-[10px] text-amber-700 border border-amber-300 bg-amber-50 rounded px-1.5 py-0.5 hover:bg-amber-100"
                title="Answer the AI's open questions and regenerate the plan"
              >
                Ask for Clarification ({aiFeedback.questions.length})
              </button>
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
                  void executePlanCall(newPrompt);
                }}
              />
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

        {isAdmin && !superAdminHidden && (
          <div className="shrink-0 mb-2">
            {/* Admin-only red banner + two reverse-engineering options.
                Red picks them out from the regular blue/grey controls
                so admins spot them instantly. */}
            <p className="text-[10px] font-semibold text-red-600 mb-1 uppercase tracking-wide">
              Create Prompt from Diagram
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={() => {
                  const generated = buildPromptFromDiagram(
                    currentElements ?? [],
                    currentConnectors ?? [],
                    diagramType as DiagramType,
                  );
                  setPrompt(generated);
                  setEditingPromptId(null);
                  setSaveName("");
                  setShowSave(false);
                  setError(null);
                  setStatus("Created prompt from current diagram. Edit and save if you'd like.");
                }}
                disabled={busy !== null}
                className="flex-1 px-2 py-1 text-[11px] font-medium text-red-700 bg-red-50 border border-red-300 rounded hover:bg-red-100 disabled:opacity-50"
                title="Admin only — reverse-engineer the current diagram into a structured Technical Description"
              >
                Technical Description
              </button>
              <button
                onClick={callNarrative}
                disabled={busy !== null}
                className="flex-1 px-2 py-1 text-[11px] font-medium text-red-700 bg-red-50/60 border border-red-300 rounded hover:bg-red-100 disabled:opacity-50"
                title="Admin only — ask Sonnet to rewrite the diagram as a Staff Narrative (uses the editable briefing in /dashboard/rules → Staff Narrative)"
              >
                Staff Narrative
              </button>
            </div>
          </div>
        )}

        <div className="shrink-0 flex items-center gap-1.5 mb-2">
          <button
            onClick={callPlan}
            disabled={!prompt.trim() || busy !== null}
            className="flex-1 px-2 py-1 text-[11px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
          >
            {busy === "plan" && <Spinner />}
            {busy === "plan" ? "Planning…" : hasPlan ? "Re-send to Sonnet" : "Plan"}
          </button>
          <button
            onClick={callApplyLayout}
            disabled={!hasPlan || busy !== null}
            className="flex-1 px-2 py-1 text-[11px] font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
            title="Run the deterministic layout engine on the current plan"
          >
            {busy === "apply" && <Spinner />}
            {busy === "apply" ? "Applying…" : "Apply Layout"}
          </button>
          <button
            onClick={() => {
              if (editingPromptId) {
                // Fast-path: update the already-open prompt without reopening the name dialog.
                savePrompt();
              } else {
                setShowSave(true);
              }
            }}
            disabled={!prompt.trim() || busy !== null}
            className="px-2 py-1 text-[11px] font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            title="Save this prompt (including the current plan) for later"
          >
            {busy === "save" ? "Saving…" : editingPromptId ? "Update" : "Save…"}
          </button>
        </div>

        {showSave && (
          <div className="shrink-0 flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded px-2 py-1.5 mb-2">
            <input
              autoFocus
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") savePrompt(); if (e.key === "Escape") { setShowSave(false); setSaveName(""); } }}
              placeholder="Name for saved prompt"
              className="flex-1 px-2 py-1 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button onClick={savePrompt} disabled={!saveName.trim() || busy !== null}
              className="px-2 py-1 text-[11px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
              Save
            </button>
            <button onClick={() => { setShowSave(false); setSaveName(""); }}
              className="px-2 py-1 text-[11px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50">
              Cancel
            </button>
          </div>
        )}

        {/* G04: prominent throbber banner while Sonnet / layout is running.
            The button label change alone is easy to miss on a tall panel.
            "plan" state uses the on-brand DiagramatixThrobber (rotating
            triangle + throbbing aura); "apply" stays on the generic
            spinner because layout-engine work is computationally
            different and isn't tied to the AI brand. */}
        {audioPhase && (
          <div className="shrink-0 mb-2 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
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
        {(busy === "plan" || busy === "apply" || busy === "narrative") && (
          <div className="shrink-0 mb-2 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
            {busy === "apply"
              ? <Spinner className="text-blue-600 w-4 h-4" />
              : <DiagramatixThrobber size={28} />}
            <span className="text-[11px] text-blue-800 font-medium">
              {busy === "apply"
                ? "Running the layout engine…"
                : busy === "narrative"
                  ? "Asking Sonnet for a staff narrative — this usually takes 15–30 s…"
                  : "Asking Sonnet for a plan — this usually takes 15–30 s…"}
            </span>
          </div>
        )}
        {status && <p className="text-[10px] text-gray-500 shrink-0 mb-1">{status}</p>}
        {error && (
          <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5 shrink-0 mb-2">
            <p className="font-medium">{error}</p>
            {issues && issues.length > 0 && (
              <ul className="mt-1 list-disc list-inside space-y-0.5">
                {issues.slice(0, 8).map((iss, i) => <li key={i}>{iss}</li>)}
                {issues.length > 8 && <li>…and {issues.length - 8} more</li>}
              </ul>
            )}
          </div>
        )}

        {/* Divider between Description and Tabs — only active while Tabs are expanded */}
        {tabsExpanded && (
          <div
            onMouseDown={startResize(setTabsH, -1, 80, 800)}
            className="shrink-0 h-1 cursor-row-resize hover:bg-blue-300 bg-gray-100 mb-1 rounded"
            title="Drag to resize Pools / Lanes table"
          />
        )}

        {/* Tabs header (always visible) with expand/collapse chevron */}
        <div className="shrink-0 flex items-end border-b border-gray-200 text-[10px] -mb-px">
          <div className="flex flex-1">
            {((isFlowchart
              ? [{ id: "json", label: "Plan JSON" }]
              : [
                  { id: "pools",      label: "Pools / Lanes" },
                  { id: "elements",   label: "Elements" },
                  { id: "connectors", label: "Connectors" },
                  { id: "json",       label: "Raw JSON" },
                ]) as { id: Tab; label: string }[]).map(t => (
              <button
                key={t.id}
                onClick={() => { setActiveTab(t.id); setTabsExpanded(true); }}
                className={`px-2 py-1 border-b-2 ${
                  activeTab === t.id && tabsExpanded
                    ? "border-blue-500 text-blue-700 font-medium"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {hasPlan && (
            <button
              onClick={() => setStructOpen(true)}
              className="px-2 py-1 text-blue-600 hover:text-blue-800 font-medium"
              title="Open the full structure editor in a pop-up"
            >
              ⤢ Editor
            </button>
          )}
          <button
            onClick={() => setTabsExpanded(v => !v)}
            className="px-2 py-1 text-gray-500 hover:text-gray-700"
            title={tabsExpanded ? "Collapse table" : "Expand table"}
          >
            {tabsExpanded ? "▲" : "▼"}
          </button>
        </div>

        <div
          className="overflow-y-auto text-[11px]"
          style={{ height: tabsExpanded ? tabsH : 0 }}
        >
          {activeTab === "pools" && (
            <PoolsLanesTree elements={plan.elements} onRename={(id, label) => updateElement(id, { label })} onDelete={deleteElement} onMove={moveElementRelativeTo} />
          )}
          {activeTab === "elements" && (
            <ElementsByContainerView elements={plan.elements} connections={plan.connections} onRename={(id, label) => updateElement(id, { label })} onDelete={deleteElement} onMove={moveElementRelativeTo} />
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

      {structOpen && (
        <PlanStructureModal
          plan={plan}
          diagramType={diagramType}
          isFlowchart={isFlowchart}
          applying={busy === "apply"}
          updateElement={updateElement}
          deleteElement={deleteElement}
          updateConnection={updateConnection}
          deleteConnection={deleteConnection}
          moveElementRelativeTo={moveElementRelativeTo}
          setPlan={setPlan}
          onApply={() => { void callApplyLayout(); }}
          onClose={() => setStructOpen(false)}
        />
      )}

      {replacePlanConfirm && (
        <ConfirmDialog
          title="Replace your plan edits?"
          message="You have edits on the current plan. Re-sending to Sonnet will replace them."
          confirmLabel="Re-send to Sonnet"
          cancelLabel="Keep edits"
          destructive
          onCancel={() => setReplacePlanConfirm(false)}
          onConfirm={() => {
            setReplacePlanConfirm(false);
            void executePlanCall();
          }}
        />
      )}
    </div>
  );
}
