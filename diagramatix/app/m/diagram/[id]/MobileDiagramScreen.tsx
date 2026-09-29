"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sanitizeRichText } from "@/app/lib/diagram/richText";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import type { SymbolColorConfig } from "@/app/lib/diagram/colors";
import { MobileDiagramView } from "@/app/components/mobile/MobileDiagramView";
import { MobileReviewLayer } from "@/app/components/mobile/MobileReviewLayer";
import { MobileCommentSheet } from "@/app/components/mobile/MobileCommentSheet";
import { thumbnailFrameFor } from "@/app/lib/diagram/templateThumbnail";
import { isHiddenOnCanvas } from "@/app/lib/diagram/diagramThumbnail";
import { buildReviewComment } from "@/app/lib/diagram/reviewComment";
import { collapseAllReviewComments } from "@/app/lib/diagram/reviewCollapse";
import { isMobileSupportedType, MOBILE_SUPPORTED_LABEL } from "@/app/lib/diagram/mobileSupport";
import { healOnLoad } from "@/app/lib/diagram/healOnLoad";
import { effectiveSymbolColors } from "@/app/lib/diagram/colors";
import { MobileCorrectionSheet } from "@/app/components/mobile/MobileCorrectionSheet";
import {
  correctionErrorText, correctionFromRun, correctionRefusalText, correctionRequest, correctionSource, reviewCommentCount,
} from "@/app/lib/mobile/correction";
import { MobileGenerateSheet } from "@/app/components/mobile/MobileGenerateSheet";
import { useAiAllowed } from "@/app/lib/auth/useAiAllowed";
import {
  EMPTY_DRAFT, draftFromFailedJob, draftToRequest, draftWordsForStorage, draftWordsFromStorage, photoToUpload,
  withRestoredPhoto, type GenerateDraft,
} from "@/app/lib/mobile/generateDraft";

/**
 * A failed run's words — and its photo — put back. A photo run wins over words
 * kept for the camera (they are its own words, from before it started); a
 * draft already holding a photo is left alone.
 */
function restoreFailedRun(
  cur: GenerateDraft,
  job: { promptText: string; sourceImageId: string | null; freeForm?: boolean; selectedPrompt?: SavedPromptPick | null },
): GenerateDraft {
  if (cur.photo) return cur;
  const back = withRestoredPhoto(draftFromFailedJob(job.promptText, job.selectedPrompt), job);
  if (back.photo) return back;
  return cur.prompt ? cur : back;
}
import { draftStorageKey, photoFromFile } from "@/app/lib/mobile/pickPhoto";
import { sourceImageUrl, uploadSourceImageBlob } from "@/app/lib/ai/sourceImage";
import { MobilePhotoViewer } from "@/app/components/mobile/MobilePhotoViewer";
import { MobileRenameSheet } from "@/app/components/mobile/MobileRenameSheet";
import { renameFailureText } from "@/app/lib/mobile/rename";
import type { SavedPromptPick } from "@/app/lib/mobile/generateDraft";
import type { GenerateJobView } from "@/app/lib/ai/generateJob";

interface Loaded {
  name: string; type: string; data: DiagramData; projectId: string | null;
  version: number; canReview: boolean; viewer: { id: string; name: string };
  /** May change the CONTENT (owners/editors; never a reviewer) — the Generate gate. */
  canEdit: boolean;
  colorConfig?: SymbolColorConfig;
}

/** Where a phone Generate run stands (the run itself is a server job). */
type GenState =
  | { phase: "idle" }
  | { phase: "starting" }
  /** generate: filling the empty diagram; correct: re-generating it with a correction (stage 3). */
  | { phase: "running"; jobId: string; stage: string; since: number; kind: "generate" | "correct" }
  | { phase: "failed"; message: string };

const STAGE_LABEL: Record<string, string> = {
  queued: "Starting",
  planning: "The AI is working out the process",
  shaping: "Laying it out",
  saving: "Saving",
};
/** A failed run older than this is history, not news. */
const RECENT_FAILURE_MS = 60 * 60 * 1000;
const fmtElapsed = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
const hasContent = (x: Loaded | null) => (x?.data.elements?.length ?? 0) > 0;
/** A failed re-generate, said in the message strip over the diagram — and, when there are words to go back to, where they are. */
const correctionFailedText = (why: string, wordsKept: boolean) =>
  `The correction wasn’t applied. ${why}${wordsKept ? " Your words are kept — tap ✎ Correct to try again." : ""}`;

const isContainer = (e: DiagramElement) => e.type === "pool" || e.type === "lane" || e.type === "sublane";
const stripHtml = (s: string) => s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
function elementLabel(e: DiagramElement): string {
  const l = stripHtml(e.label ?? "");
  return l || e.type.replace(/-/g, " ");
}

/**
 * Mobile diagram screen: read-only pan/zoom viewer + (for owners/editors/assigned
 * reviewers) the ability to attach Review Comments to elements — typed or dictated —
 * and Save. Review comments are ALWAYS collapsed on save. Everything else is view-only,
 * except Generate: an owner or editor can fill an EMPTY BPMN diagram by describing
 * the process (MobileGenerateSheet → a server job that saves it; 2026-09-28).
 */
export function MobileDiagramScreen({ diagramId }: { diagramId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Where "‹ Back" returns to: the diagram we were invoked FROM (a linked/parent
  // diagram carries ?from=…), else the project's diagram list. Link so a chain of
  // drill-ins each step back to their invoker rather than jumping to the list.
  const fromParam = searchParams.get("from");
  const linkHref = (id: string) => `/m/diagram/${id}?from=${encodeURIComponent(`/m/diagram/${diagramId}`)}`;
  const [d, setD] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [picking, setPicking] = useState(false);
  const [addTarget, setAddTarget] = useState<DiagramElement | null>(null);
  const [reading, setReading] = useState<DiagramElement | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [detail, setDetail] = useState<DiagramElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [showParents, setShowParents] = useState(false);
  const [parents, setParents] = useState<{ id: string; name: string }[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  // Loaded on open, and again when a Generate run has saved the diagram. Only
  // the latest request may land (a reload racing the first load).
  const loadSeq = useRef(0);
  const load = useCallback(async (): Promise<Loaded | null> => {
    const seq = ++loadSeq.current;
    try {
      const r = await fetch(`/api/diagrams/${diagramId}`, { cache: "no-store" });
      if (!r.ok) throw new Error("Could not load diagram");
      const j = await r.json();
      const next: Loaded = {
        name: j.name,
        type: j.type ?? "",
        // As the editor opens it (healOnLoad): a pool's header as wide as its name
        // needs, and any message label that was never placed, placed.
        data: healOnLoad((j.data ?? { elements: [], connectors: [] }) as DiagramData),
        projectId: j.projectId ?? null,
        version: j.version ?? 0,
        canReview: !!j.canReview,
        canEdit: !!j.canEdit,
        viewer: j.viewer ?? { id: "", name: "" },
        // The colours the editor paints with: the project's scheme under the
        // diagram's own, or black and white in hand-drawn mode.
        colorConfig: effectiveSymbolColors(j.projectColorConfig, j.colorConfig, j.displayMode),
      };
      if (seq === loadSeq.current) { setD(next); setErr(null); }
      return next;
    } catch (e) {
      if (seq === loadSeq.current) setErr(e instanceof Error ? e.message : "Could not load diagram");
      return null;
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [diagramId]);
  useEffect(() => {
    void load();
    return () => { loadSeq.current++; };
  }, [load]);

  // ── Generate (mobile voice stage 1) ──────────────────────────────────────
  const aiAllowed = useAiAllowed();
  const [gen, setGen] = useState<GenState>({ phase: "idle" });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraftState] = useState<GenerateDraft>(EMPTY_DRAFT);
  const setDraft = useCallback((u: (cur: GenerateDraft) => GenerateDraft) => setDraftState(u), []);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const canGenerate = !!d && d.canEdit && d.type === "bpmn" && aiAllowed;
  // ✎ Correct (stage 3): the words, kept until a re-generate succeeds.
  const [correcting, setCorrecting] = useState(false);
  const [correction, setCorrection] = useState("");
  // Free Form for a re-generate: the diagram's own choice, which the sheet can
  // change — kept with the words (a failed run gives both back).
  const [correctFreeForm, setCorrectFreeForm] = useState(false);
  const setCorrectionWords = useCallback((u: (w: string) => string) => setCorrection(u), []);
  const [correctErr, setCorrectErr] = useState<string | null>(null);
  // The diagram as last loaded, and the words, for the poll (which outlives renders).
  const dRef = useRef(d);
  dRef.current = d;
  const correctionRef = useRef(correction);
  correctionRef.current = correction;

  // A phone that reloaded (or came back to this diagram) mid-run picks the run
  // up again; one that failed within the hour says why and offers its words back.
  // Over a diagram with content it is a re-generate when the run's prompt is
  // this diagram's own plus a correction.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (!d || !d.canEdit || d.type !== "bpmn" || resumedRef.current) return;
    resumedRef.current = true;
    const full = hasContent(d);
    fetch(`/api/diagrams/${diagramId}/generate`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { job: GenerateJobView | null } | null) => {
        const job = j?.job;
        if (!job) return;
        const words = full ? correctionFromRun(d.data, job.promptText) : null;
        if (job.status === "queued" || job.status === "running") {
          setGen({ phase: "running", jobId: job.jobId, stage: job.stage, since: Date.now() - (job.elapsedMs ?? 0), kind: words !== null ? "correct" : "generate" });
          // Anything opened before the run was found would go with the old diagram.
          setCorrecting(false);
          setPicking(false);
          setAddTarget(null);
        } else if (job.status === "failed" && job.finishedAt && Date.now() - Date.parse(job.finishedAt) < RECENT_FAILURE_MS) {
          if (!full) {
            setGen({ phase: "failed", message: job.error?.message ?? "The last generation failed." });
            setDraftState((cur) => restoreFailedRun(cur, job));
            return;
          }
          // Only a failed correction OF THIS diagram is news here.
          if (!words) return;
          setCorrection((cur) => cur || words);
          if (job.sourceImageId) setCorrectFreeForm(job.freeForm === true);
          setSaveMsg({ ok: false, text: correctionFailedText(correctionErrorText(job.error?.code, job.error?.message ?? "The last re-generate failed."), true) });
        }
      })
      .catch(() => { /* nothing to resume */ });
  }, [d, diagramId]);

  // Poll the run. A phone coming back from a locked screen asks at once.
  const runningJobId = gen.phase === "running" ? gen.jobId : null;
  const runningKind = gen.phase === "running" ? gen.kind : null;
  useEffect(() => {
    if (!runningJobId) return;
    const isCorrection = runningKind === "correct";
    /** A run that ended without saving: said where the person is looking, and their words kept. */
    const ended = (why: string, job?: GenerateJobView) => {
      const cur = dRef.current;
      if (!isCorrection) {
        // The empty-diagram panel shows a failure; over content, the strip does.
        if (hasContent(cur)) { setGen({ phase: "idle" }); setSaveMsg({ ok: false, text: why }); return; }
        setGen({ phase: "failed", message: why });
        if (job) setDraftState((c) => restoreFailedRun(c, job));
        return;
      }
      setGen({ phase: "idle" });
      const words = job && cur ? correctionFromRun(cur.data, job.promptText) : null;
      if (words) {
        setCorrection((w) => w || words);
        if (job?.sourceImageId) setCorrectFreeForm(job.freeForm === true);
      }
      const kept = !!words || correctionRef.current.trim().length > 0;
      setSaveMsg({ ok: false, text: correctionFailedText(correctionErrorText(job?.error?.code, why), kept) });
    };
    let stopped = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (ms: number) => { clearTimeout(timer); timer = setTimeout(() => void poll(), ms); };
    async function poll() {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        const r = await fetch(`/api/diagrams/${diagramId}/generate/${runningJobId}`, { cache: "no-store" });
        if (stopped) return;
        if (r.status === 404) {
          ended(isCorrection ? "It could no longer be found." : "This generation could no longer be found. Tap Generate to try again.");
          return;
        }
        if (r.ok) {
          const job: GenerateJobView = await r.json();
          if (stopped) return;
          if (job.status === "succeeded") {
            const was = dRef.current;
            const fresh = await load();
            if (stopped) return;
            setGen({ phase: "idle" });
            if (isCorrection) {
              // The comments that were not saved went with the old diagram.
              setDirty(false);
              // A run started earlier (another tab) may have applied other words: keep these then.
              const applied = was ? correctionFromRun(was.data, job.promptText) : null;
              const pending = correctionRef.current.trim();
              const mine = !pending || applied === pending;
              if (mine) setCorrection("");
              setSaveMsg({ ok: true, text: !fresh
                ? "Re-generated ✓ — saved, but it couldn’t be shown. Reload the page to see it."
                : mine
                  ? "Re-generated with your correction ✓ — the previous version is in the diagram’s history."
                  : "Re-generated ✓ with a correction started earlier — yours is kept: tap ✎ Correct to add it." });
              return;
            }
            setDraftState(EMPTY_DRAFT);
            try { sessionStorage.removeItem(draftStorageKey(diagramId)); } catch { /* nothing kept */ }
            setSaveMsg({ ok: true, text: fresh
              ? "Generated ✓ — saved to this diagram."
              : "Generated ✓ — saved, but it couldn’t be shown. Reload the page to see it." });
            return;
          }
          if (job.status === "failed") {
            ended(job.error?.message ?? (isCorrection ? "The re-generate failed." : "Generation failed."), job);
            return;
          }
          setGen((g) => (g.phase === "running" && g.jobId === runningJobId ? { ...g, stage: job.stage } : g));
        }
      } catch { /* offline for a moment — keep asking */ }
      finally { inFlight = false; }
      if (!stopped) schedule(3000);
    }
    schedule(1500);
    const onVisible = () => { if (document.visibilityState === "visible") schedule(0); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [runningJobId, runningKind, diagramId, load]);

  // The elapsed-time clock while a run is under way.
  useEffect(() => {
    if (gen.phase !== "running") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [gen.phase]);

  function openGenerate() {
    setStartErr(null);
    setSheetOpen(true);
  }

  // Straight from the empty diagram to the camera; the sheet opens holding the photo.
  const [photoBusy, setPhotoBusy] = useState(false);
  async function photographWhiteboard(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    const r = await photoFromFile(file);
    setPhotoBusy(false);
    if (!r.ok) { setStartErr(r.message); setSheetOpen(true); return; }
    setDraftState((cur) => ({ ...cur, photo: r.photo, selected: null }));
    openGenerate();
  }

  // The words said before the camera took the screen, if the page was reloaded meanwhile.
  const restoredWordsRef = useRef(false);
  useEffect(() => {
    if (!d || hasContent(d) || restoredWordsRef.current) return;
    restoredWordsRef.current = true;
    let raw: string | null = null;
    try { raw = sessionStorage.getItem(draftStorageKey(diagramId)); } catch { /* none */ }
    const words = draftWordsFromStorage(raw);
    if (!words || !words.prompt.trim()) return;
    setDraftState((cur) => (cur.prompt || cur.photo ? cur : { ...cur, ...words }));
  }, [d, diagramId]);

  // "View photo": the whiteboard this diagram was generated from.
  const [viewingPhoto, setViewingPhoto] = useState(false);

  // Rename (2026-09-29): a name only — no version, no data — so it never
  // conflicts with unsaved comments or a run under way (the server does not
  // move the version for a rename).
  const [renamingDiagram, setRenamingDiagram] = useState(false);
  async function saveDiagramName(newName: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/diagrams/${diagramId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName }),
      });
      const j = await res.json().catch(() => ({})) as { name?: unknown; error?: unknown };
      if (!res.ok) return renameFailureText(res.status, typeof j.error === "string" ? j.error : null);
      const saved = typeof j.name === "string" ? j.name : newName;
      if (saved !== newName) return "You can’t rename this diagram.";
      setD((cur) => (cur ? { ...cur, name: saved } : cur));
      return null;
    } catch {
      return renameFailureText(0, null);
    }
  }

  async function startGenerate(finished?: GenerateDraft) {
    if (!d || gen.phase === "starting" || gen.phase === "running") return;
    const src = finished ?? draft;
    const request = draftToRequest(src);
    if (!request.prompt) return;
    setGen({ phase: "starting" });
    setStartErr(null);
    // A photo is kept first (the diagram's source-image store), once: a retry
    // reuses it. Unlike the desktop, a photo that cannot be kept stops the run —
    // it IS the content.
    let sourceImageId = src.photo?.storedId;
    const photoStep = photoToUpload(src);
    if (photoStep === "missing") { setGen({ phase: "idle" }); setStartErr("The photo is missing — take it again."); return; }
    if (photoStep === "upload" && src.photo?.blob) {
      const sent = src.photo.blob;
      const kept = await uploadSourceImageBlob(diagramId, sent, src.photo.name, src.photo.width, src.photo.height);
      if (!kept.ok) {
        setGen({ phase: "idle" });
        setStartErr(kept.status === 413 ? "The photo is too large to keep — take it again."
          : kept.status === 403 ? "You can't add a photo to this diagram."
          : kept.error ?? "The photo couldn’t be sent — check your connection and tap Generate again.");
        return;
      }
      sourceImageId = kept.image.id;
      // Only onto the photo that was sent — it may have been replaced meanwhile.
      setDraftState((cur) => (cur.photo && cur.photo.blob === sent ? { ...cur, photo: { ...cur.photo, storedId: kept.image.id } } : cur));
    }
    const body = { ...request, ...(sourceImageId ? { sourceImageId } : {}) };
    try {
      const r = await fetch(`/api/diagrams/${diagramId}/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, version: d.version }),
      });
      const j = await r.json().catch(() => ({})) as Record<string, unknown>;
      if (r.status === 202 && typeof j.jobId === "string") {
        // The run holds the words (and the photo) from here; a failure gives them back.
        try { sessionStorage.removeItem(draftStorageKey(diagramId)); } catch { /* nothing kept */ }
        setSheetOpen(false);
        setSaveMsg(null);
        setNow(Date.now());
        setGen({
          phase: "running", jobId: j.jobId, stage: typeof j.stage === "string" ? j.stage : "queued",
          since: Date.now() - (typeof j.elapsedMs === "number" ? j.elapsedMs : 0), kind: "generate",
        });
        return;
      }
      setGen({ phase: "idle" });
      if (r.status === 409 && (j.error === "conflict" || j.error === "has_content")) {
        // Changed on another device since it was opened: take the new copy first.
        const fresh = await load();
        if (hasContent(fresh)) {
          setSheetOpen(false);
          setSaveMsg({ ok: false, text: "This diagram was changed on another device, so nothing was generated." });
        } else {
          setStartErr("This diagram changed on another device. It has been reloaded — tap Generate again.");
        }
        return;
      }
      const said = (typeof j.message === "string" && j.message) || (typeof j.error === "string" && j.error) || null;
      setStartErr(said ?? "Generate couldn’t start. Try again in a moment.");
    } catch {
      setGen({ phase: "idle" });
      setStartErr("Couldn’t reach Diagramatix — check your connection.");
    }
  }

  // ── ✎ Correct (mobile voice stage 3) ─────────────────────────────────────
  const correctSrc = d ? correctionSource(d.data) : null;

  function openCorrect() {
    if (correctSrc && !correctSrc.ok) {
      setSaveMsg({ ok: false, text: correctionRefusalText(correctSrc.reason) });
      return;
    }
    setCorrectErr(null);
    setSaveMsg(null);
    // A fresh correction starts from the diagram's own choice; one being tried
    // again keeps the choice it was made with.
    if (correctSrc && !correction.trim()) setCorrectFreeForm(correctSrc.freeForm);
    setCorrecting(true);
  }

  async function startCorrect(words: string) {
    if (!d || gen.phase === "starting") return;
    if (gen.phase === "running") { setCorrectErr("A re-generate is already under way — wait for it to finish, then try again."); return; }
    const src = correctionSource(d.data);
    if (!src.ok || !words.trim()) return;
    const request = correctionRequest(src, words, d.version, correctFreeForm);
    setGen({ phase: "starting" });
    setCorrectErr(null);
    try {
      const r = await fetch(`/api/diagrams/${diagramId}/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const j = await r.json().catch(() => ({})) as Record<string, unknown>;
      if (r.status === 202 && typeof j.jobId === "string") {
        // A run this person started earlier (another tab, a lost reply) was
        // handed back instead: follow it, and say these words are still to come.
        const other = j.duplicate === true && j.promptText !== request.prompt;
        setCorrecting(false);
        setSaveMsg(other ? { ok: false, text: "A re-generate started earlier is still running, so it finishes first. Your words are kept — tap ✎ Correct again afterwards." } : null);
        setNow(Date.now());
        setGen({
          phase: "running", jobId: j.jobId, stage: typeof j.stage === "string" ? j.stage : "queued",
          since: Date.now() - (typeof j.elapsedMs === "number" ? j.elapsedMs : 0),
          kind: !other || (typeof j.promptText === "string" && correctionFromRun(d.data, j.promptText) !== null) ? "correct" : "generate",
        });
        return;
      }
      setGen({ phase: "idle" });
      if (r.status === 409 && j.error === "conflict") {
        // Changed on another device: take the new copy here — the words stay in
        // the sheet. Comments not saved yet were going with the old diagram anyway.
        const hadUnsaved = dirty;
        const fresh = await load();
        setDirty(false);
        // The diagram's own choice, as it now is.
        const now = fresh ? correctionSource(fresh.data) : null;
        if (now?.ok) setCorrectFreeForm(now.freeForm);
        setCorrectErr(`This diagram changed on another device. It has been reloaded${hadUnsaved ? " — your unsaved comments could not be kept" : ""}. Look it over, then tap Re-generate again.`);
        return;
      }
      const said = (typeof j.message === "string" && j.message) || (typeof j.error === "string" && j.error) || null;
      setCorrectErr(correctionErrorText(typeof j.error === "string" ? j.error : null, said ?? "The re-generate couldn’t start. Try again in a moment."));
    } catch {
      setGen({ phase: "idle" });
      setCorrectErr("Couldn’t reach Diagramatix — check your connection.");
    }
  }

  const empty = !!d && (d.data.elements?.length ?? 0) === 0;
  const unsupported = !!d && !isMobileSupportedType(d.type);
  const busy = gen.phase === "running" || gen.phase === "starting";

  // Split the diagram: review comments render in the interactive overlay; the
  // backdrop (everything else) is the read-only picture. Same element set drives
  // the shared thumbnail transform, so the overlay lines up.
  const { backdrop, comments, annotations, tx, ty } = useMemo(() => {
    const data: DiagramData = d?.data ?? { elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } };
    const comments = data.elements.filter((e) => e.type === "review-comment");
    const annotations = data.elements.filter((e) => e.type === "text-annotation");
    // Review comments AND text annotations render as tappable overlay icons (the
    // dark annotation boxes read badly on a phone), so keep them out of the backdrop.
    const overlayIds = new Set([...comments, ...annotations].map((e) => e.id));
    const backdrop: DiagramData = {
      ...data,
      elements: data.elements.filter((e) => e.type !== "review-comment" && e.type !== "text-annotation"),
      connectors: (data.connectors ?? []).filter(
        (c) => c.type !== "review-comment-link" && !overlayIds.has(c.sourceId) && !overlayIds.has(c.targetId),
      ),
    };
    // The same frame MobileDiagramView draws the picture in, so pins and taps line up.
    const tr = thumbnailFrameFor(backdrop as never, { trueColors: true, fullLabels: true });
    return { backdrop, comments, annotations, tx: tr.tx, ty: tr.ty };
  }, [d]);

  function onPick(svgX: number, svgY: number) {
    setPicking(false);
    if (!d) return;
    const dx = svgX - tx, dy = svgY - ty;   // → diagram coordinates
    // Topmost (last-drawn) non-review element under the point — never one the
    // picture does not show (a pain point with pain points switched off).
    const hit = [...d.data.elements].reverse().find(
      (e) => e.type !== "review-comment" && !isHiddenOnCanvas(e, d.data) && dx >= e.x && dx <= e.x + e.width && dy >= e.y && dy <= e.y + e.height,
    );
    if (hit) setAddTarget(hit);
  }

  // View-mode tap: open an element's details (rich description) and/or a button
  // to follow its linked diagram (BPMN subprocess, collapsed value-chain process,
  // sub-machine, …). Only opens when there's something to show.
  function onTapView(svgX: number, svgY: number) {
    if (!d) return;
    const dx = svgX - tx, dy = svgY - ty;
    const hit = [...d.data.elements].reverse().find(
      (e) => e.type !== "review-comment" && e.type !== "text-annotation" && !isHiddenOnCanvas(e, d.data) && dx >= e.x && dx <= e.x + e.width && dy >= e.y && dy <= e.y + e.height,
    );
    if (!hit) return;
    const linked = hit.properties?.linkedDiagramId as string | undefined;
    const desc = hit.properties?.description as string | undefined;
    const hasDesc = typeof desc === "string" && stripHtml(desc).length > 0;
    if (linked || hasDesc) setDetail(hit);
  }

  // Full-screen "landscape" mode — Diagramatix-controlled. Requests the browser
  // Fullscreen API (so we can best-effort lock landscape on Android); on platforms
  // without it (iOS Safari) the fixed-inset CSS still gives an app-level full screen
  // and the user rotates the device (the viewer re-fits automatically).
  async function toggleFullscreen() {
    if (!fullscreen) {
      setFullscreen(true);
      try { await rootRef.current?.requestFullscreen?.(); } catch { /* CSS fallback still applies */ }
      try { await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.("landscape"); } catch { /* best-effort; unsupported on iOS */ }
    } else {
      try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* noop */ }
      try { (screen.orientation as unknown as { unlock?: () => void })?.unlock?.(); } catch { /* noop */ }
      setFullscreen(false);
    }
  }
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) { setFullscreen(false); try { (screen.orientation as unknown as { unlock?: () => void })?.unlock?.(); } catch { /* noop */ } } };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Resolve parent (reverse-link) diagram names lazily when the sheet opens.
  useEffect(() => {
    if (!showParents || !d) return;
    const ids = d.data.parentDiagramIds ?? [];
    if (!ids.length) { setParents([]); return; }
    let on = true;
    Promise.all(ids.map((id) =>
      fetch(`/api/diagrams/${id}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => ({ id, name: (j?.name as string) ?? "Diagram" }))
        .catch(() => ({ id, name: "Diagram" })),
    )).then((rows) => { if (on) setParents(rows); });
    return () => { on = false; };
  }, [showParents, d]);

  function saveNote(text: string) {
    if (!d || !addTarget || !text) { setAddTarget(null); return; }
    const { element, connector } = buildReviewComment(addTarget, d.data.elements, text, {
      reviewerId: d.viewer.id, reviewerName: d.viewer.name,
    });
    setD((cur) => cur ? { ...cur, data: {
      ...cur.data,
      elements: [...cur.data.elements, element],
      connectors: [...(cur.data.connectors ?? []), connector],
    } } : cur);
    setDirty(true);
    setAddTarget(null);
    setSaveMsg(null);
  }

  async function saveDiagram() {
    if (!d) return;
    setSaving(true); setSaveMsg(null);
    const collapsed = collapseAllReviewComments(d.data);
    try {
      const res = await fetch(`/api/diagrams/${diagramId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: collapsed, version: d.version }),
      });
      if (res.status === 409) {
        setSaveMsg({ ok: false, text: "Changed on another device — reload to get the latest, then re-add your comments." });
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setSaveMsg({ ok: false, text: (j as { error?: string }).error ?? "Save failed" });
        return;
      }
      const j = await res.json().catch(() => ({}));
      setD((cur) => cur ? { ...cur, data: collapsed, version: (j as { version?: number }).version ?? cur.version } : cur);
      setDirty(false);
      setSaveMsg({ ok: true, text: "Saved ✓" });
    } catch {
      setSaveMsg({ ok: false, text: "Save failed — check your connection." });
    } finally {
      setSaving(false);
    }
  }

  const readerAuthor = (c: DiagramElement): string | undefined => {
    const p = c.properties as Record<string, unknown>;
    const name = (p.reviewerName || p.authorName || p.feedbackAuthor) as string | undefined;
    return name ? `— ${name}` : undefined;
  };

  return (
    <div ref={rootRef} className={`${fullscreen ? "fixed inset-0 z-50 bg-white" : "h-full"} flex flex-col`}>
      <div className="shrink-0 flex items-center gap-2 px-3 h-11 border-b border-gray-200 bg-white">
        <button onClick={() => router.push(fromParam || (d?.projectId ? `/m/project/${d.projectId}` : "/m"))}
          className="text-blue-600 text-sm">‹ Back</button>
        {d?.canEdit ? (
          <button onClick={() => setRenamingDiagram(true)} aria-label="Rename diagram"
            className="flex-1 min-w-0 flex items-center justify-center gap-1 text-sm font-medium text-gray-900 active:text-gray-600">
            <span className="truncate min-w-0">{d.name}</span>
            <span className="shrink-0 text-gray-400 text-xs">✎</span>
          </button>
        ) : (
          <span className="flex-1 text-sm font-medium text-gray-900 truncate text-center">{d?.name ?? "Diagram"}</span>
        )}
        {d && !empty && !unsupported && d.data.aiGeneration?.sourceImage && (
          <button onClick={() => setViewingPhoto(true)} className="text-gray-600 text-lg leading-none px-1" title="View the photo this was generated from">📷</button>
        )}
        {d && !empty && !unsupported && (d.data.parentDiagramIds?.length ?? 0) > 0 && (
          <button onClick={() => setShowParents(true)} className="text-blue-600 text-lg leading-none px-1" title="Linked from (parent diagrams)">↩</button>
        )}
        {d && !empty && !unsupported && (
          <button onClick={toggleFullscreen} className="text-gray-600 text-lg leading-none px-1" title={fullscreen ? "Exit full screen" : "Full screen (landscape)"}>{fullscreen ? "⤢" : "⛶"}</button>
        )}
        {d?.canReview && !empty && !unsupported ? (
          <button onClick={saveDiagram} disabled={saving || !dirty || busy}
            className="text-sm font-medium text-blue-600 disabled:text-gray-300">{saving ? "Saving…" : "Save"}</button>
        ) : canGenerate && empty && gen.phase !== "running" ? (
          <button onClick={openGenerate} className="text-sm font-medium text-blue-600">Generate</button>
        ) : <span className="w-8" />}
      </div>

      {saveMsg && (
        <div className={`shrink-0 px-3 py-1.5 text-xs ${saveMsg.ok ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>{saveMsg.text}</div>
      )}
      {d && !empty && gen.phase === "running" && (
        <div className="shrink-0 px-3 py-1.5 text-xs bg-blue-50 text-blue-800 flex items-center gap-2">
          <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
          <span>
            {gen.kind === "correct" ? "Re-generating with your correction" : "Generating"} · {STAGE_LABEL[gen.stage] ?? "Working"} · {fmtElapsed(now - gen.since)}
            <span className="block text-[11px] text-blue-700/80">You can lock your phone — it’s saved when it’s ready.</span>
          </span>
        </div>
      )}

      <div className="flex-1 relative">
        {loading && <p className="text-sm text-gray-500 p-4">Loading…</p>}
        {err && <p className="text-sm text-red-600 p-4">{err}</p>}
        {d && unsupported && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <p className="text-sm text-gray-400">This diagram type isn’t available on mobile. Mobile supports {MOBILE_SUPPORTED_LABEL}. Open it on the desktop app to view or edit.</p>
          </div>
        )}
        {d && empty && !unsupported && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            {gen.phase === "running" ? (
              <div className="max-w-xs">
                <div className="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                <p className="text-sm font-medium text-gray-900">Generating…</p>
                <p className="text-[13px] text-gray-600 mt-1">{STAGE_LABEL[gen.stage] ?? "Working"} · {fmtElapsed(now - gen.since)}</p>
                <p className="text-[11px] text-gray-500 mt-3">You can lock your phone or leave this screen — the diagram is saved when it’s ready.</p>
              </div>
            ) : canGenerate ? (
              <div className="max-w-xs">
                {gen.phase === "failed" && (
                  <p className="text-[12px] text-amber-800 bg-amber-50 rounded-md px-2 py-1.5 mb-3">{gen.message}</p>
                )}
                <p className="text-sm text-gray-600 mb-4">This diagram is empty. Describe the process out loud, type it, or photograph a whiteboard — and the AI draws it.</p>
                <button onClick={openGenerate}
                  className="h-12 px-5 rounded-full bg-blue-600 text-white text-sm font-medium shadow active:bg-blue-700">
                  🎤 Generate from your description
                </button>
                <label className="mt-3 h-11 px-5 rounded-full border border-gray-300 bg-white text-sm text-gray-700 flex items-center justify-center gap-1.5 active:bg-gray-50"
                  onClick={() => { try { if (draft.prompt.trim()) sessionStorage.setItem(draftStorageKey(diagramId), draftWordsForStorage(draft)); } catch { /* in memory only */ } }}>
                  {photoBusy ? "Preparing photo…" : "📷 Photograph a whiteboard"}
                  <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={photoBusy || gen.phase === "starting"}
                    onChange={(e) => void photographWhiteboard(e)} />
                </label>
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                {d.type === "bpmn" && d.canEdit && !aiAllowed
                  ? "This diagram is empty. AI generation is turned off by your organisation’s policy."
                  : d.type !== "bpmn" && d.canEdit
                    ? "This diagram is empty. Generating on the phone is available for BPMN diagrams."
                    : "This diagram is empty."}
              </p>
            )}
          </div>
        )}
        {d && !empty && !unsupported && (
          <MobileDiagramView
            data={backdrop}
            colorConfig={d.colorConfig}
            pickMode={picking}
            onPick={onPick}
            onTapView={picking ? undefined : onTapView}
            overlay={
              <MobileReviewLayer data={d.data} comments={comments} annotations={annotations} tx={tx} ty={ty} disabled={picking}
                onOpen={(c) => setReading(c)} />
            }
          />
        )}

        {/* Pick-a-target banner */}
        {picking && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-pink-600 text-white text-xs px-3 py-1.5 rounded-full shadow flex items-center gap-2">
            Tap an element to comment on
            <button onClick={() => setPicking(false)} className="underline">cancel</button>
          </div>
        )}

        {/* ✎ Correct FAB (owners/editors of a generated BPMN diagram), above Comment */}
        {d && canGenerate && !empty && !unsupported && !picking && !busy && correctSrc
          && (correctSrc.ok || correctSrc.reason !== "not_generated") && (
          <button onClick={openCorrect}
            className={`absolute ${d.canReview ? "bottom-[4.25rem]" : "bottom-3"} left-3 h-12 pl-3 pr-4 rounded-full bg-blue-600 text-white shadow-lg flex items-center gap-1.5 active:bg-blue-700`}>
            <span className="text-lg leading-none">✎</span><span className="text-sm font-medium">Correct</span>
          </button>
        )}

        {/* Add-comment FAB (owners/editors/reviewers only) */}
        {d?.canReview && !empty && !picking && !busy && (
          <button onClick={() => { setPicking(true); setSaveMsg(null); }}
            className="absolute bottom-3 left-3 h-12 pl-3 pr-4 rounded-full bg-pink-600 text-white shadow-lg flex items-center gap-1.5 active:bg-pink-700">
            <span className="text-lg leading-none">＋</span><span className="text-sm font-medium">Comment</span>
          </button>
        )}
      </div>

      {viewingPhoto && d?.data.aiGeneration?.sourceImage && (
        <MobilePhotoViewer src={sourceImageUrl(diagramId, d.data.aiGeneration.sourceImage.id)}
          alt={d.data.aiGeneration.sourceImage.name} onClose={() => setViewingPhoto(false)} />
      )}
      {sheetOpen && d && (
        <MobileGenerateSheet diagramId={diagramId} draft={draft} setDraft={setDraft}
          starting={gen.phase === "starting"} error={startErr}
          onGenerate={(finished) => void startGenerate(finished)} onClose={() => setSheetOpen(false)} />
      )}
      {correcting && d && correctSrc?.ok && (
        <MobileCorrectionSheet words={correction} setWords={setCorrectionWords}
          basePrompt={correctSrc.basePrompt} imageName={correctSrc.imageName}
          freeForm={correctFreeForm} setFreeForm={setCorrectFreeForm}
          comments={reviewCommentCount(d.data)} unsaved={dirty}
          starting={gen.phase === "starting"} error={correctErr}
          onSubmit={(finished) => void startCorrect(finished)} onClose={() => setCorrecting(false)} />
      )}
      {renamingDiagram && d && (
        <MobileRenameSheet title="Rename diagram" label="Diagram name" initial={d.name}
          onSave={saveDiagramName} onClose={() => setRenamingDiagram(false)} />
      )}
      {addTarget && (
        <MobileCommentSheet mode="edit" targetLabel={elementLabel(addTarget)}
          onSave={saveNote} onClose={() => setAddTarget(null)} />
      )}
      {reading && (
        <MobileCommentSheet mode="read"
          heading={reading.type === "text-annotation" ? "Annotation" : "Review comment"}
          initialText={stripHtml(reading.label ?? "")}
          html={reading.label ?? ""}
          authorLine={reading.type === "text-annotation" ? undefined : readerAuthor(reading)}
          onClose={() => setReading(null)} />
      )}

      {detail && (() => {
        const linked = detail.properties?.linkedDiagramId as string | undefined;
        const desc = detail.properties?.description as string | undefined;
        const hasDesc = typeof desc === "string" && stripHtml(desc).length > 0;
        return (
          <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setDetail(null)}>
            <div className="absolute inset-0 bg-black/30" />
            <div className="relative bg-white rounded-t-2xl shadow-xl p-4 pb-6" onClick={(e) => e.stopPropagation()}>
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" />
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-gray-900 truncate">{elementLabel(detail)}</h2>
                <button onClick={() => setDetail(null)} className="text-gray-400 text-xl leading-none px-1">×</button>
              </div>
              {hasDesc && (
                <>
                  <style>{`.mobile-rich ul{list-style:disc;padding-left:1.25rem}.mobile-rich ol{list-style:decimal;padding-left:1.25rem}.mobile-rich li{margin:0.1rem 0}.mobile-rich p{margin:0.25rem 0}.mobile-rich b,.mobile-rich strong{font-weight:600}`}</style>
                  <div className="mobile-rich text-sm text-gray-800 max-h-[40vh] overflow-y-auto mb-3"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichText(desc!) }} />
                </>
              )}
              {linked && (
                <button onClick={() => { setDetail(null); router.push(linkHref(linked)); }}
                  className="w-full py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg active:bg-blue-700">Open linked diagram →</button>
              )}
            </div>
          </div>
        );
      })()}

      {showParents && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setShowParents(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative bg-white rounded-t-2xl shadow-xl p-4 pb-6" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" />
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-900">Linked from</h2>
              <button onClick={() => setShowParents(false)} className="text-gray-400 text-xl leading-none px-1">×</button>
            </div>
            <p className="text-[11px] text-gray-500 mb-2">Diagrams that link to this one.</p>
            {parents.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">Loading…</p>
            ) : (
              <ul className="space-y-1.5 max-h-[45vh] overflow-y-auto">
                {parents.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => { setShowParents(false); router.push(linkHref(p.id)); }}
                      className="w-full text-left bg-gray-50 rounded-lg px-3 py-2.5 active:bg-gray-100 flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-900 break-words min-w-0">{p.name}</span>
                      <span className="text-gray-400 shrink-0">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
