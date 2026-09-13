"use client";

/**
 * NEW AI Generate — the full-screen console.
 *
 * Why it exists: AI Generate for BPMN grew into a big feature living in a 384px
 * sidebar, and every layout compromise in `PlanPanel` follows from that width —
 * 9px type, three drag-resizable regions, a structure pane that starts
 * collapsed so the prompt box has room. This is the same feature given a screen.
 *
 * It is a SECOND implementation, mounted behind its own button, deliberately:
 * `PlanPanel` is untouched so the two can be run side by side while the
 * replacement is judged. The leaf pieces are shared (the plan state hook, the
 * structure editor, the audio button, the dialogs) — what is re-implemented is
 * the orchestration and the layout.
 *
 * Everything the sidebar does is carried over, including the parts that are
 * easy to lose:
 *   • prompt provenance is sent on CREATE only — editing the wording of
 *     something you dictated must not reclassify it as typed
 *   • answering the AI Tidy questions plans immediately (the one path that
 *     generates without a Plan click)
 *   • a failed plan's raw model reply is kept, not discarded
 *   • `preservePositions` is re-derived at Apply time from whether the plan
 *     carries bounds, not from the attachment still being attached
 *   • the dictation stop-race guard
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { SUPERUSER_EMAILS } from "@/app/lib/superuser";
import { useSuperAdminChrome } from "@/app/hooks/useSuperAdminChrome";
import { AI_MODELS, type AiModel } from "@/app/lib/ai/models";
import { arrayBufferToBase64 } from "@/app/lib/base64";
import { planTypeConfig } from "@/app/lib/ai/planTypes";
import { buildPromptFromDiagram } from "@/app/lib/diagram/prompt-from-diagram";
import { appendClarifications, appendRefinements } from "@/app/lib/diagram/clarifications";
import { startDictation, type DictationHandle } from "@/app/lib/dictation";
import { useMicTest } from "@/app/lib/dictation/useMicTest";
import { useFeatureColors } from "@/app/lib/theme/useFeatureColors";
import { tonesFor } from "@/app/lib/theme/featureColors";
import { MatrixRain } from "@/app/components/simulation/matrix/MatrixRain";
import { ConsoleUserGuideLink } from "@/app/components/ConsoleUserGuideLink";
import { DiagramatixThrobber } from "@/app/components/DiagramatixThrobber";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { SaveChangesDialog } from "@/app/components/SaveChangesDialog";
import { AttachmentPreviewDialog } from "@/app/components/AttachmentPreviewDialog";
import { ClarificationDialog } from "@/app/components/ClarificationDialog";
import { RefineQuestionsDialog } from "@/app/components/RefineQuestionsDialog";
import type { RefineQuestion } from "@/app/lib/ai/refineQuestions";
import type { AllowedModel } from "../ModelSelect";
import { usePlanState, type Plan } from "../ai-plan/usePlanState";
import { PlanStructureModal } from "../ai-plan/PlanStructureModal";
import type {
  Connector, DiagramData, DiagramElement, DiagramType, AiApplyMeta, AiFeedback,
} from "@/app/lib/diagram/types";
import { aiTones, AiButton, AiPanel, AiSpinner } from "./AiConsoleChrome";
import { SavedPromptsPanel, type SavedPrompt } from "./SavedPromptsPanel";
import { PromptPanel } from "./PromptPanel";
import { SourcesPanel } from "./SourcesPanel";
import { SuperAdminOptionsModal } from "./SuperAdminOptionsModal";

type Busy = "plan" | "apply" | "save" | "load" | "narrative" | "compare" | "refine" | null;

type Attachment =
  | { name: string; type: "pdf" | "text"; data: string }
  | { name: string; type: "image"; data: string; mediaType: string };

const IMAGE_TYPES: Record<string, string> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

const TRANSCRIPT_PREAMBLE =
  "Build the BPMN process from this meeting transcript. Treat each distinct speaker as a role / lane, "
  + "and use roles or job functions — never an individual person's name — in pool, lane, task and "
  + "annotation names. Ignore small talk.\n\n";

interface Props {
  diagramType: string;
  diagramName?: string;
  onApplyDiagram: (data: DiagramData, meta?: AiApplyMeta) => void;
  onClose: () => void;
  isAdmin?: boolean;
  initialPrompt?: string;
  initialModel?: string;
  onPrefillConsumed?: () => void;
  aiModels?: AllowedModel[];
  currentAiModelId?: string;
  currentElements?: DiagramElement[];
  currentConnectors?: Connector[];
  onBusyChange?: (busy: Busy) => void;
  onAudioPhaseChange?: (phase: null | "transcribing" | "reading" | "tidying") => void;
  aiFeedback?: AiFeedback;
  onAiFeedback?: (feedback: AiFeedback | undefined) => void;
  diagramId?: string;
  onComparison?: (comparison: unknown) => void;
  pcf?: { nodeId: string; hierarchyId: string; name: string; variant: string };
}

export function AiGenerateScreen({
  diagramType, diagramName, onApplyDiagram, onClose, isAdmin = false,
  currentElements, currentConnectors, onBusyChange, onAudioPhaseChange,
  aiFeedback, onAiFeedback, diagramId, onComparison, pcf,
  initialPrompt, initialModel, onPrefillConsumed, aiModels = [], currentAiModelId,
}: Props) {
  const { data: authSession } = useSession();
  const accent = tonesFor(useFeatureColors(), "ai").text;
  const tones = useMemo(() => aiTones(accent), [accent]);
  const isSuperuser = !!authSession?.user?.email
    && SUPERUSER_EMAILS.has(authSession.user.email.toLowerCase());
  const { hidden: superAdminHidden } = useSuperAdminChrome(isSuperuser || !!isAdmin);

  const planCfg = planTypeConfig(diagramType);
  const flatPlan = !planCfg.structured;
  const apiBase = planCfg.apiBase;
  const layoutMode = "normal" as const;

  const { plan, setPlan, updateElement, deleteElement, updateConnection, deleteConnection, moveElementRelativeTo, asJson } = usePlanState();
  const hasPlan = plan.elements.length > 0 || plan.connections.length > 0;

  const [busy, setBusy] = useState<Busy>(null);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<
    { kind: string; label: string; field?: string; detail: string }[]
  >([]);
  /** The text of a model reply that could not be read as a plan — kept so it
   *  can be inspected and corrected rather than lost with the error. */
  const [rawReply, setRawReply] = useState<string | null>(null);
  // Refine questions and the transcript's open questions. Declared up here
  // because `clearForNew` resets them.
  const [refineQs, setRefineQs] = useState<RefineQuestion[] | null>(null);
  const [refineMsg, setRefineMsg] = useState<string | null>(null);
  const [clarifyOpen, setClarifyOpen] = useState(false);

  // ── Prompt + provenance ───────────────────────────────────────────────────
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<string>("");
  useEffect(() => { setModel((m) => m || currentAiModelId || ""); }, [currentAiModelId]);
  useEffect(() => {
    if (initialPrompt !== undefined) {
      setPrompt(initialPrompt);
      if (initialModel) setModel(initialModel);
      onPrefillConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt, initialModel]);
  /** How the text came to be. Refs, not state: nothing renders from them and a
   *  re-render must not reset them. Both are properties of the TEXT, not of the
   *  moment it is saved. */
  const dictatedRef = useRef(false);
  const refinedRef = useRef(false);

  // ── Saved prompts ─────────────────────────────────────────────────────────
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);
  const pendingClearRef = useRef(false);
  const [newGuardOpen, setNewGuardOpen] = useState(false);

  const loadPromptList = useCallback(async () => {
    try {
      const res = await fetch(`/api/prompts?diagramType=${encodeURIComponent(diagramType)}`);
      if (res.ok) setSavedPrompts(await res.json());
    } catch { /* ignore */ }
  }, [diagramType]);
  useEffect(() => { loadPromptList(); }, [loadPromptList]);

  const lastPlanResponseRef = useRef<string | null>(null);
  const planModelRef = useRef<string>("");

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
        lastPlanResponseRef.current = JSON.stringify(row.planJson, null, 2);
        setStatus(`Loaded "${sp.name}" (${row.planJson.elements.length} elements, ${row.planJson.connections.length} connections)`);
      } else {
        setPlan({ elements: [], connections: [] });
        lastPlanResponseRef.current = null;
        setStatus(`Loaded "${sp.name}" — no saved plan yet, click Plan to generate`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setBusy(null);
    }
  }, [busy, setPlan]);

  // ── Attachment ────────────────────────────────────────────────────────────
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [showAttachPreview, setShowAttachPreview] = useState(false);
  const [preserveLayout, setPreserveLayout] = useState(true);
  const imageDimsRef = useRef<{ w: number; h: number } | null>(null);

  const clearForNew = useCallback(() => {
    setPrompt("");
    setEditingPromptId(null);
    setSaveName("");
    setShowSave(false);
    setPlan({ elements: [], connections: [] });
    setAttachment(null);
    imageDimsRef.current = null;
    setRefineQs(null);
    setRefineMsg(null);
    setClarifyOpen(false);
    onAiFeedback?.(undefined);
    lastPlanResponseRef.current = null;
    setError(null);
    setStatus(null);
    setNewGuardOpen(false);
  }, [onAiFeedback, setPlan]);

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
      // Sent on CREATE only. Tidying the wording of something you dictated does
      // not make it typed, so an update must not carry these at all.
      const provenance = {
        source: dictatedRef.current ? "dictated" : "typed",
        fromImage: attachment?.type === "image",
        refined: refinedRef.current,
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
          body: JSON.stringify({ ...body, ...provenance, diagramType }),
        });
      }
      if (!res.ok) throw new Error("Save failed");
      const saved = await res.json();
      setEditingPromptId(saved.id);
      setShowSave(false);
      setStatus(`Saved "${saveName.trim()}"`);
      await loadPromptList();
      if (pendingClearRef.current) { pendingClearRef.current = false; clearForNew(); }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }, [saveName, prompt, busy, editingPromptId, diagramType, hasPlan, plan, attachment, loadPromptList, clearForNew]);

  const deletePrompt = useCallback(async (id: string) => {
    try {
      await fetch(`/api/prompts/${id}`, { method: "DELETE" });
      if (editingPromptId === id) { setEditingPromptId(null); setSaveName(""); }
      await loadPromptList();
    } catch { /* ignore */ }
  }, [editingPromptId, loadPromptList]);

  // ── Plan / Apply ──────────────────────────────────────────────────────────
  const [replacePlanConfirm, setReplacePlanConfirm] = useState(false);

  const executePlanCall = useCallback(async (promptOverride?: string) => {
    const effPrompt = (promptOverride ?? prompt).trim();
    setBusy("plan");
    setError(null);
    setIssues(null);
    setStatus("Requesting plan from the AI model (15–30 s)…");
    try {
      const res = await fetch(`${apiBase}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: effPrompt, attachment: attachment ?? undefined, pcfNodeId: pcf?.nodeId,
          model: model || undefined,
          captureGeometry: !flatPlan && attachment?.type === "image" ? preserveLayout : false,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Plan request failed");
        // A malformed reply is worth more than the error alone — keep it where
        // the structure editor's Raw tab can show it.
        if (json.raw) setRawReply(json.raw);
        setStatus(null);
        return;
      }
      setPlan(json.plan);
      planModelRef.current = (json.model as string) || model || "";
      lastPlanResponseRef.current = JSON.stringify(json.plan, null, 2);
      setRawReply(null);
      setStatus(`Plan received: ${json.elementCount} elements, ${json.connectionCount} ${planCfg.connectorNoun}s`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setStatus(null);
    } finally {
      setBusy(null);
    }
  }, [prompt, setPlan, attachment, apiBase, preserveLayout, pcf?.nodeId, model, flatPlan, planCfg.connectorNoun]);

  const callPlan = useCallback(async () => {
    if (!prompt.trim() || busy) return;
    if (hasPlan && lastPlanResponseRef.current != null && asJson !== lastPlanResponseRef.current) {
      setReplacePlanConfirm(true);
      return;
    }
    await executePlanCall();
  }, [prompt, busy, hasPlan, asJson, executePlanCall]);

  const callApplyLayout = useCallback(async () => {
    if (!hasPlan || busy) return;
    setBusy("apply");
    setError(null);
    setIssues(null);
    setStatus("Applying layout…");
    try {
      const savedName = editingPromptId
        ? savedPrompts.find((sp) => sp.id === editingPromptId)?.name
        : undefined;
      const promptLabel = (savedName?.trim().length ? savedName.trim() : prompt.trim().slice(0, 100))
        || undefined;
      // Derived from the PLAN, so it survives JSON edits and does not depend on
      // the attachment still being set.
      const planHasBounds = Array.isArray(plan?.elements)
        && plan.elements.some((e: { bounds?: unknown }) => e.bounds);
      const preservePositions = !flatPlan && preserveLayout && planHasBounds;
      setDiagnostics([]);
      const res = await fetch(`${apiBase}/apply-layout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan, promptLabel,
          preservePositions,
          imageAspect: preservePositions ? imageDimsRef.current ?? undefined : undefined,
          layoutMode,
        }),
      });
      const json = await res.json();
      setDiagnostics(Array.isArray(json.diagnostics) ? json.diagnostics : []);
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
      const sel = editingPromptId ? savedPrompts.find((p) => p.id === editingPromptId) : undefined;
      const effPrompt = prompt.trim();
      onApplyDiagram(json.diagramData, {
        promptText: effPrompt,
        // The PLAN's model is what produced the content; apply-layout is pure
        // layout and knows no model.
        model: (json.model as string) || planModelRef.current || model || "",
        selectedPromptId: sel?.id,
        selectedPromptName: sel?.name,
        selectedPromptUnchanged: sel ? sel.text.trim() === effPrompt : undefined,
        promptSource: dictatedRef.current ? "dictated" : "typed",
        promptFromImage: attachment?.type === "image",
        promptRefined: refinedRef.current,
        planJson: plan,
      });
      if (flatPlan) {
        setStatus(`Applied: ${json.elementCount} elements, ${json.connectionCount} ${planCfg.connectorNoun}s`);
      } else {
        const poolCount = plan.elements.filter((e) => e.type === "pool").length;
        setStatus(`Applied: ${poolCount} pool${poolCount === 1 ? "" : "s"}, ${json.elementCount} elements, ${json.connectionCount} connections`);
      }
      /**
       * Apply succeeded → leave. The sidebar stays open after an apply because
       * it sits BESIDE the canvas: you see the diagram it just produced. This
       * console covers the canvas completely, so staying open hides the one
       * thing the user pressed the button to see, and leaves a full-screen
       * animated backdrop running over a freshly re-rendered diagram.
       *
       * `onClose` directly, not `requestClose` — the dirty guard exists to stop
       * unsaved work being discarded, and applying is precisely how that work
       * stops being unsaved. Failure paths above all `return` before here, so a
       * console that could not apply stays put with its error on screen.
       */
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setStatus(null);
    } finally {
      setBusy(null);
    }
  }, [plan, hasPlan, busy, onApplyDiagram, apiBase, flatPlan, preserveLayout, prompt, editingPromptId,
    savedPrompts, model, attachment, planCfg.connectorNoun, onClose]);

  // ── Refine + clarifications ───────────────────────────────────────────────
  const handleRefine = useCallback(async () => {
    if (!prompt.trim() || busy !== null) return;
    setBusy("refine");
    setError(null);
    setRefineMsg(null);
    try {
      const res = await fetch("/api/ai/bpmn/refine-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, pcfNodeId: pcf?.nodeId }),
      });
      const json = await res.json();
      if (!res.ok) { setRefineMsg(null); setError(json.error ?? "Refine failed"); return; }
      const qs: RefineQuestion[] = Array.isArray(json.questions) ? json.questions : [];
      if (qs.length === 0) setRefineMsg("Prompt looks complete — ready to Plan.");
      else setRefineQs(qs);
    } catch {
      // Refine is always optional — fail quietly, change nothing.
      setRefineMsg("Couldn't generate questions — edit the prompt or press Plan.");
    } finally {
      setBusy(null);
    }
  }, [prompt, busy, pcf?.nodeId]);

  // ── Dictation + mic test ──────────────────────────────────────────────────
  const [listening, setListening] = useState(false);
  const [dictEngine, setDictEngine] = useState<"deepgram" | "browser" | null>(null);
  const [dictateMsg, setDictateMsg] = useState<string | null>(null);
  const [audioPhase, setAudioPhase] = useState<null | "transcribing" | "reading" | "tidying">(null);
  const dictRef = useRef<DictationHandle | null>(null);
  /** startDictation is async. A Stop pressed DURING that window would otherwise
   *  be a no-op against a null ref, and the resolving handle would leave a live
   *  mic nobody can turn off. */
  const stopRequestedRef = useRef(false);
  const speechSupported = typeof window !== "undefined"
    && (!!navigator.mediaDevices?.getUserMedia
      || !!((window as unknown as Record<string, unknown>).SpeechRecognition
        || (window as unknown as Record<string, unknown>).webkitSpeechRecognition));

  const toggleDictation = useCallback(async () => {
    if (listening) {
      stopRequestedRef.current = true;
      dictRef.current?.stop();
      dictRef.current = null;
      setListening(false);
      setDictEngine(null);
      return;
    }
    if (!speechSupported) return;
    stopRequestedRef.current = false;
    setDictateMsg(null);
    setListening(true);
    dictatedRef.current = true;
    const handle = await startDictation({
      onText: (text) => setPrompt((prev) => {
        const base = prev && !prev.endsWith(" ") && !prev.endsWith("\n") ? prev + " " : prev;
        return base + text;
      }),
      onError: (msg) => setDictateMsg(msg),
      onEngine: (e) => setDictEngine(e),
      onEnd: () => { dictRef.current = null; setListening(false); setDictEngine(null); },
    });
    if (!handle) { setListening(false); setDictEngine(null); return; }
    if (stopRequestedRef.current) {
      stopRequestedRef.current = false;
      handle.stop();
      setListening(false);
      setDictEngine(null);
      return;
    }
    dictRef.current = handle;
  }, [listening, speechSupported]);

  useEffect(() => () => { dictRef.current?.stop(); }, []);

  const mic = useMicTest();

  // ── File attach (one reader; two buttons) ─────────────────────────────────
  const handleFileAttach = useCallback(async (file: File) => {
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) { setError("File too large (max 10MB)"); return; }
    if (file.type === "application/pdf") {
      const base64 = arrayBufferToBase64(await file.arrayBuffer());
      setAttachment({ name: file.name, type: "pdf", data: base64 });
      setPrompt((prev) => prev.trim().length > 0 ? prev : `I have attached a document, ${file.name}`);
    } else if (IMAGE_TYPES[file.type]) {
      const base64 = arrayBufferToBase64(await file.arrayBuffer());
      setAttachment({ name: file.name, type: "image", data: base64, mediaType: IMAGE_TYPES[file.type] });
      // Natural dimensions, so an imported layout keeps the image's aspect.
      imageDimsRef.current = null;
      if (!flatPlan) {
        try {
          imageDimsRef.current = await new Promise<{ w: number; h: number } | null>((resolve) => {
            const img = new window.Image();
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => resolve(null);
            img.src = `data:${IMAGE_TYPES[file.type]};base64,${base64}`;
          });
        } catch { imageDimsRef.current = null; }
      }
      setPrompt((prev) => prev.trim().length > 0
        ? prev
        : `I have attached an image of a process diagram (${file.name}). Reverse-engineer the BPMN from it.`);
    } else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      || file.name.toLowerCase().endsWith(".docx")) {
      // A .docx is a ZIP. Reading it as text feeds the model archive bytes and
      // produces a diagram from noise without ever failing.
      try {
        const mammoth = await import("mammoth");
        const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        const text = value.trim();
        if (!text) { setError("That Word document has no readable text in it."); return; }
        setAttachment({ name: file.name, type: "text", data: text });
        setError(null);
        setPrompt((prev) => prev.trim().length > 0 ? prev : `I have attached a document, ${file.name}`);
      } catch {
        setError("That Word document could not be read. Save it as a PDF and try again.");
        return;
      }
    } else {
      const text = await file.text();
      setAttachment({ name: file.name, type: "text", data: text });
      setPrompt((prev) => prev.trim().length > 0 ? prev : `I have attached a document, ${file.name}`);
    }
    setError(null);
  }, [flatPlan]);

  // ── SuperAdmin ────────────────────────────────────────────────────────────
  const [saOpen, setSaOpen] = useState(false);
  const [availModels, setAvailModels] = useState<AiModel[]>(AI_MODELS);
  const [pickedModels, setPickedModels] = useState<Set<string>>(new Set<string>());
  const [comparing, setComparing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [compareStatus, setCompareStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!isSuperuser || superAdminHidden || diagramType !== "bpmn") return;
    let on = true;
    fetch("/api/admin/ai-model").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (on && Array.isArray(j?.models)) setAvailModels(j.models);
    }).catch(() => {});
    return () => { on = false; };
  }, [isSuperuser, superAdminHidden, diagramType]);

  const toggleCompareModel = (id: string) =>
    setPickedModels((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const handleExportPrompt = useCallback(async () => {
    const effPrompt = prompt.trim();
    if (!effPrompt && !attachment) return;
    setExporting(true);
    setError(null);
    setStatus("Building the full AI prompt export…");
    try {
      const res = await fetch("/api/ai/generate-bpmn/export-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: effPrompt,
          attachment: attachment ?? undefined,
          pcfNodeId: pcf?.nodeId,
          model: model || undefined,
          captureGeometry: attachment?.type === "image" ? preserveLayout : false,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Export failed" }));
        setError(err.error ?? "Export failed");
        setStatus(null);
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const name = /filename="([^"]+)"/.exec(cd)?.[1] || "ai-prompt.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      setStatus(`Exported ${name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
      setStatus(null);
    } finally {
      setExporting(false);
    }
  }, [prompt, attachment, pcf?.nodeId, model, preserveLayout]);

  const handleCompare = useCallback(async () => {
    const effPrompt = prompt.trim();
    if ((!effPrompt && !attachment) || !diagramId) return;
    const models = [...pickedModels];
    if (models.length === 0) return;
    setComparing(true);
    setBusy("compare");
    setError(null);
    const pickedLabels = availModels.filter((m) => pickedModels.has(m.id)).map((m) => m.label);
    setCompareStatus(`Comparing ${pickedLabels.join(" / ")} — this can take a few minutes…`);
    try {
      const res = await fetch("/api/ai/generate-bpmn/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: effPrompt,
          diagramId,
          models,
          attachment: attachment ?? undefined,
          captureGeometry: !flatPlan && attachment?.type === "image" ? preserveLayout : false,
          imageAspect: !flatPlan && attachment?.type === "image" ? imageDimsRef.current ?? undefined : undefined,
          pcfNodeId: pcf?.nodeId,
          layoutMode,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        setError(err.error ?? "Comparison failed");
        setCompareStatus(null);
        return;
      }
      const result = await res.json();
      if (result.diagramData?.elements) {
        const sel = editingPromptId ? savedPrompts.find((p) => p.id === editingPromptId) : undefined;
        onApplyDiagram(result.diagramData, {
          promptText: effPrompt,
          model: (result.comparison?.chosenModelId as string) || "",
          selectedPromptId: sel?.id,
          selectedPromptName: sel?.name,
          selectedPromptUnchanged: sel ? sel.text.trim() === effPrompt : undefined,
          promptSource: dictatedRef.current ? "dictated" : "typed",
          promptFromImage: attachment?.type === "image",
          promptRefined: refinedRef.current,
        });
      }
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
  }, [prompt, attachment, diagramId, pickedModels, availModels, flatPlan, preserveLayout, pcf?.nodeId,
    editingPromptId, savedPrompts, onApplyDiagram, onComparison]);

  const callNarrative = useCallback(async () => {
    if (busy) return;
    const technicalDescription = buildPromptFromDiagram(
      currentElements ?? [], currentConnectors ?? [], diagramType as DiagramType,
    );
    if (!technicalDescription.trim()) {
      setError("Diagram is empty — nothing to narrate yet.");
      return;
    }
    setBusy("narrative");
    setError(null);
    setStatus("Asking the AI for a staff narrative (15–30 s)…");
    try {
      const res = await fetch("/api/ai/staff-narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technicalDescription }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Staff narrative generation failed"); setStatus(null); return; }
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
  }, [busy, currentElements, currentConnectors, diagramType]);

  const handleTechnicalDescription = useCallback(() => {
    setPrompt(buildPromptFromDiagram(
      currentElements ?? [], currentConnectors ?? [], diagramType as DiagramType,
    ));
    setEditingPromptId(null);
    setSaveName("");
    setShowSave(false);
    setError(null);
    setStatus("Created prompt from current diagram. Edit and save if you'd like.");
  }, [currentElements, currentConnectors, diagramType]);

  // ── Structure editor + close guard ────────────────────────────────────────
  const [structOpen, setStructOpen] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);

  /**
   * Is there work that closing would throw away? A full-screen overlay is
   * easier to dismiss by accident than a sidebar, and nothing here is
   * persisted until Save or Apply.
   */
  const dirty = useMemo(() => {
    const text = prompt.trim();
    const saved = editingPromptId ? savedPrompts.find((p) => p.id === editingPromptId) : undefined;
    if (text && (!saved || saved.text.trim() !== text)) return true;
    // Hand edits to a plan that has not been applied.
    if (hasPlan && lastPlanResponseRef.current != null && asJson !== lastPlanResponseRef.current) return true;
    return false;
  }, [prompt, editingPromptId, savedPrompts, hasPlan, asJson]);

  const requestClose = useCallback(() => {
    if (dirty) { setCloseConfirm(true); return; }
    onClose();
  }, [dirty, onClose]);

  const planning = busy === "plan";
  const applying = busy === "apply";
  const modelLabel = aiModels.find((m) => m.id === (model || currentAiModelId))?.label || "the AI model";
  const saAvailable = (isSuperuser || isAdmin) && !superAdminHidden;

  return (
    <div className="fixed inset-0 z-[60] bg-black text-white/80 font-mono overflow-hidden" data-no-capture>
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <MatrixRain fontSize={20} color={accent} headColor="#ffffff" />
      </div>

      <div className="relative z-10 flex flex-col h-full">
        <header className="shrink-0 flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: tones.line }}>
          <div className="flex items-center gap-3 min-w-0">
            <span className="tracking-[0.25em] text-sm whitespace-nowrap" style={{ color: tones.bright }}>
              ✨ AI Generate
            </span>
            {diagramName && <span className="text-xs text-white/40 truncate">{diagramName}</span>}
            <span className="text-xs text-white/25 whitespace-nowrap">{diagramType.toUpperCase()} · 2-phase</span>
          </div>
          {/* Item 2 — close to the right, after the User Guide chip. */}
          <div className="flex items-center gap-2">
            {saAvailable && (
              <AiButton tones={tones} variant="outline" onClick={() => setSaOpen(true)}
                title="SuperAdmin / Admin AI Generate options — model comparison, prompt export, AI model, prompt-from-diagram">
                ⚙ SuperAdmin Options
              </AiButton>
            )}
            <ConsoleUserGuideLink chapter="ai-generate" reopen="ai-generate"
              title="Open the AI Generate section of the User Guide"
              className="text-xs border rounded px-3 py-1.5 hover:bg-white/10"
              style={{ color: tones.bright, borderColor: tones.line }} />
            <AiButton tones={tones} variant="danger" onClick={requestClose}>✕ EXIT</AiButton>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4">
          <div className="max-w-[1200px] mx-auto flex flex-col gap-3">
            {/* 3 — Saved prompts */}
            <SavedPromptsPanel
              prompts={savedPrompts}
              tones={tones}
              editingId={editingPromptId}
              busy={busy !== null}
              onLoad={(sp) => { void loadSavedPrompt(sp); }}
              onDelete={(id) => { void deletePrompt(id); }}
            />

            {/* 4, 5, 10 — prompt, dictation, save row, refine */}
            <PromptPanel
              tones={tones}
              prompt={prompt}
              onPromptChange={setPrompt}
              placeholder="A customer places an order. The warehouse checks stock. If in stock, it ships the order. Otherwise it notifies the customer."
              speechSupported={speechSupported}
              listening={listening}
              dictEngine={dictEngine}
              onToggleDictation={() => { void toggleDictation(); }}
              dictateMsg={dictateMsg}
              onDismissDictateMsg={() => setDictateMsg(null)}
              mic={mic}
              onToggleMicTest={mic.toggle}
              pcf={pcf}
              busy={busy !== null}
              saving={busy === "save"}
              editingPromptId={editingPromptId}
              canSave={!!prompt.trim()}
              onSave={() => { if (editingPromptId) void savePrompt(); else setShowSave(true); }}
              onNew={() => {
                if (!prompt.trim() && !hasPlan) { clearForNew(); return; }
                setNewGuardOpen(true);
              }}
              canRefine={diagramType === "bpmn"}
              refining={busy === "refine"}
              onRefine={() => { void handleRefine(); }}
              refineMsg={refineMsg}
              onDismissRefineMsg={() => setRefineMsg(null)}
            />

            {/* The name row, shown inline when a new prompt needs one. */}
            {showSave && (
              <div className="flex items-center gap-2 rounded border px-3 py-2" style={{ borderColor: tones.line }}>
                <input
                  autoFocus
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void savePrompt();
                    if (e.key === "Escape") { setShowSave(false); setSaveName(""); pendingClearRef.current = false; }
                  }}
                  placeholder="Name for saved prompt"
                  aria-label="Name for saved prompt"
                  className="flex-1 px-2 py-1 text-xs rounded bg-black/50 text-white/90 border focus:outline-none"
                  style={{ borderColor: tones.line }}
                />
                <AiButton tones={tones} variant="solid" onClick={() => { void savePrompt(); }}
                  disabled={!saveName.trim() || busy !== null}>Save</AiButton>
                <AiButton tones={tones} variant="muted"
                  onClick={() => { setShowSave(false); setSaveName(""); pendingClearRef.current = false; }}>Cancel</AiButton>
              </div>
            )}

            {/* 6, 7, 8 — sources */}
            <SourcesPanel
              tones={tones}
              busy={busy !== null}
              diagramType={diagramType}
              onFile={(f) => { void handleFileAttach(f); }}
              attachment={attachment}
              onPreviewAttachment={() => setShowAttachPreview(true)}
              onRemoveAttachment={() => { setAttachment(null); imageDimsRef.current = null; }}
              showPreserveLayout={!flatPlan && attachment?.type === "image"}
              preserveLayout={preserveLayout}
              onPreserveLayoutChange={setPreserveLayout}
              onAudioPhaseChange={(p) => { setAudioPhase(p); onAudioPhaseChange?.(p); }}
              onAudioError={(m) => setDictateMsg(m || null)}
              onAudioFeedback={(questions) => onAiFeedback?.({
                questions: questions.map((q) => ({ q })),
                createdAt: new Date().toISOString(),
              })}
              onTranscript={(text) => setPrompt((prev) => prev.trim()
                ? prev.trimEnd() + "\n" + text
                : TRANSCRIPT_PREAMBLE + text)}
              clarifyCount={aiFeedback?.questions.length ?? 0}
              onOpenClarify={() => setClarifyOpen(true)}
            />

            {/* 9, 11 — actions */}
            <AiPanel title="Generate" tones={tones} hint={hasPlan ? `plan: ${plan.elements.length} elements · ${plan.connections.length} ${planCfg.connectorNoun}s` : "no plan yet"}>
              <div className="flex flex-wrap items-center gap-2">
                <AiButton tones={tones} variant="solid" onClick={() => { void callPlan(); }}
                  disabled={!prompt.trim() || busy !== null}
                  title="Ask the AI for a structured plan — no shapes are drawn yet">
                  {planning && <AiSpinner />}
                  {planning ? "Planning…" : hasPlan ? "Re-plan" : "Plan"}
                </AiButton>
                <AiButton tones={tones} onClick={() => { void callApplyLayout(); }}
                  disabled={!hasPlan || busy !== null}
                  style={{ color: "#86efac", borderColor: "rgba(134,239,172,0.5)" }}
                  title="Run the deterministic layout engine on the current plan">
                  {applying && <AiSpinner />}
                  {applying ? "Applying…" : "Apply Layout"}
                </AiButton>
                <AiButton tones={tones} onClick={() => setStructOpen(true)}
                  disabled={!hasPlan && !rawReply}
                  title="Open the plan structure editor — pools and lanes, elements, connectors and the returned JSON">
                  ⤢ JSON / Plan structure
                </AiButton>
              </div>

              {audioPhase && (
                <div className="mt-3 flex items-center gap-2 rounded border px-3 py-2" style={{ borderColor: tones.line }}>
                  <DiagramatixThrobber size={28} />
                  <span className="text-xs" style={{ color: tones.bright }}>
                    {audioPhase === "transcribing"
                      ? "Transcribing your recording — this can take a little while…"
                      : audioPhase === "reading"
                        ? "Reading the meeting transcript…"
                        : "Tidying the discussion into an ordered process…"}
                  </span>
                </div>
              )}
              {(planning || applying || busy === "narrative") && (
                <div className="mt-3 flex items-center gap-2 rounded border px-3 py-2" style={{ borderColor: tones.line }}>
                  {applying ? <AiSpinner className="w-4 h-4" /> : <DiagramatixThrobber size={28} />}
                  <span className="text-xs" style={{ color: tones.bright }}>
                    {applying
                      ? "Running the layout engine…"
                      : busy === "narrative"
                        ? `Asking ${modelLabel} for a staff narrative — this usually takes 15–30 s…`
                        : `Asking ${modelLabel} for a plan — this usually takes 15–30 s…`}
                  </span>
                </div>
              )}

              {status && <p className="text-[11px] text-white/50 mt-2">{status}</p>}
              {rawReply && (
                <p className="text-[11px] text-amber-200 mt-2">
                  The model&apos;s reply could not be read as a plan. It is kept — open
                  {" "}<span className="underline">JSON / Plan structure</span> to inspect it.
                </p>
              )}
              {diagnostics.length > 0 && (
                <details className="text-[11px] rounded border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-amber-100 mt-2">
                  <summary className="cursor-pointer font-medium">
                    &#9888; {diagnostics.length} thing{diagnostics.length === 1 ? "" : "s"} the layout could not take at face value
                  </summary>
                  <ul className="mt-1 space-y-0.5">
                    {diagnostics.map((d, i) => (
                      <li key={i}>
                        <span className="uppercase text-[9px] tracking-wide">{d.kind}</span>{" "}
                        {d.label && <span className="italic">&ldquo;{d.label}&rdquo;</span>}
                        {d.field && <span>.{d.field}</span>} &mdash; {d.detail}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {error && (
                <div className="text-xs text-red-200 bg-red-500/10 border border-red-400/40 rounded px-3 py-2 mt-2">
                  <p className="font-medium">{error}</p>
                  {issues && issues.length > 0 && (
                    <ul className="mt-1 list-disc list-inside space-y-0.5">
                      {issues.slice(0, 8).map((iss, i) => <li key={i}>{iss}</li>)}
                      {issues.length > 8 && <li>…and {issues.length - 8} more</li>}
                    </ul>
                  )}
                </div>
              )}
              {compareStatus && (
                <p className="text-[11px] text-white/55 mt-2 whitespace-pre-wrap">{compareStatus}</p>
              )}
            </AiPanel>
          </div>
        </main>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {structOpen && (
        <PlanStructureModal
          plan={plan}
          diagramType={diagramType}
          flatPlan={flatPlan}
          applying={applying}
          accent={accent}
          initialRawJson={rawReply ?? undefined}
          updateElement={updateElement}
          deleteElement={deleteElement}
          updateConnection={updateConnection}
          deleteConnection={deleteConnection}
          moveElementRelativeTo={moveElementRelativeTo}
          setPlan={(next: Plan) => { setPlan(next); setRawReply(null); }}
          onApply={() => { void callApplyLayout(); }}
          onClose={() => setStructOpen(false)}
        />
      )}

      {saOpen && (
        <SuperAdminOptionsModal
          accent={accent}
          isSuperuser={isSuperuser}
          isAdmin={isAdmin}
          hidden={superAdminHidden}
          availModels={availModels}
          pickedModels={pickedModels}
          onTogglePicked={toggleCompareModel}
          onSetPicked={setPickedModels}
          comparing={comparing}
          exporting={exporting}
          canRun={(!!prompt.trim() || !!attachment) && !!diagramId}
          onCompare={() => { void handleCompare(); }}
          onExport={() => { void handleExportPrompt(); }}
          compareStatus={compareStatus}
          aiModels={aiModels}
          model={model}
          onModelChange={setModel}
          busy={busy !== null}
          onTechnicalDescription={() => { handleTechnicalDescription(); setSaOpen(false); }}
          onStaffNarrative={() => { void callNarrative(); setSaOpen(false); }}
          onClose={() => setSaOpen(false)}
        />
      )}

      {showAttachPreview && attachment && (
        <AttachmentPreviewDialog attachment={attachment} onClose={() => setShowAttachPreview(false)} />
      )}

      {refineQs && (
        <RefineQuestionsDialog
          questions={refineQs}
          onCancel={() => setRefineQs(null)}
          onSubmit={(answers) => {
            refinedRef.current = true;
            setPrompt((prev) => appendRefinements(prev, answers));
            setRefineQs(null);
          }}
        />
      )}

      {clarifyOpen && aiFeedback && (
        <ClarificationDialog
          questions={aiFeedback.questions.map((x) => x.q)}
          initialAnswers={aiFeedback.questions.map((x) => x.a ?? "")}
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
            // The one path that plans without a Plan click — answering the
            // questions IS the instruction to try again.
            void executePlanCall(newPrompt);
          }}
        />
      )}

      {newGuardOpen && (
        <SaveChangesDialog
          message="Save the current prompt before starting a new one?"
          onCancel={() => setNewGuardOpen(false)}
          onDiscard={() => clearForNew()}
          onSave={() => {
            setNewGuardOpen(false);
            pendingClearRef.current = true;
            if (editingPromptId) void savePrompt();
            else setShowSave(true);
          }}
        />
      )}

      {replacePlanConfirm && (
        <ConfirmDialog
          title="Replace your plan edits?"
          message="You have edits on the current plan. Re-planning will replace them."
          confirmLabel="Re-plan"
          cancelLabel="Keep edits"
          destructive
          onCancel={() => setReplacePlanConfirm(false)}
          onConfirm={() => { setReplacePlanConfirm(false); void executePlanCall(); }}
        />
      )}

      {closeConfirm && (
        <ConfirmDialog
          title="Close AI Generate?"
          message="Your prompt and plan are not saved. Closing discards them."
          confirmLabel="Close anyway"
          cancelLabel="Keep working"
          destructive
          onCancel={() => setCloseConfirm(false)}
          onConfirm={() => { setCloseConfirm(false); onClose(); }}
        />
      )}
    </div>
  );
}
