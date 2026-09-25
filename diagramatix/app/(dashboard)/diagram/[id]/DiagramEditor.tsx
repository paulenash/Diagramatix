"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { flushSync } from "react-dom";
import { filterAnnotations, NO_ANNOTATIONS, hasAnnotations, type AnnotationInclude } from "@/app/lib/diagram/annotationFilter";
import { useRouter, useSearchParams } from "next/navigation";
import { APQC_ATTRIBUTION, dataHasPcf } from "@/app/lib/pcf/attribution";
import {
  SCHEMA_VERSION,
  PRODUCT_VERSION,
  type AiApplyMeta,
  type Connector,
  type ConnectorType,
  type DiagramData,
  type DiagramElement,
  type DiagramType,
  type DirectionType,
  type Point,
  type RoutingType,
  type Side,
  type SymbolType,
  type TemplateData,
} from "@/app/lib/diagram/types";
import { mergeDiagram, type MergeConflict } from "@/app/lib/diagram/mergeDiagram";
import { AI_PROMPT_ANNOTATION_ID, buildPromptAnnotation, contentBBox, stripPromptAnnotations, stripPromptAnnotationConnectors } from "@/app/lib/ai/promptAnnotation";
import { usesPlanFlow } from "@/app/lib/ai/planTypes";
import { useAllowedModels } from "./ModelSelect";
import { BW_SYMBOL_COLORS, DEFAULT_SYMBOL_COLORS, type SymbolColorConfig } from "@/app/lib/diagram/colors";
import { setCurrentDiagramName } from "@/app/lib/help/currentDiagram";
import type { DisplayMode } from "@/app/lib/diagram/displayMode";
import { DiagramColorModal } from "./DiagramColorModal";
import { TemplateNameModal } from "./TemplateNameModal";
import { TemplateThumbnail } from "./TemplateThumbnail";
import { SopGenerateDialog } from "./SopGenerateDialog";
import { useDiagram, nanoid } from "@/app/hooks/useDiagram";
import { Canvas } from "@/app/components/canvas/Canvas";
import { Palette } from "@/app/components/canvas/Palette";
import { PresenceBar } from "@/app/components/canvas/PresenceBar";
import { usePresence } from "@/app/hooks/usePresence";
import { CollabRoom } from "@/app/components/canvas/CollabRoom";
import { CollabSyncSignal } from "@/app/components/canvas/CollabSyncSignal";
import { CollabFlushOnLeave } from "@/app/components/canvas/CollabFlushOnLeave";
import { CollabDebug } from "@/app/components/canvas/CollabDebug";
import { suggestNextSteps, type NextStepCandidate } from "@/app/lib/diagram/nextSteps";
import { sizeOf, placeInline, placeGatewayBranch, placeBoundaryEvent, planBoundaryFollowOn, followOnParentId, findFreeSlot, HALF_TASK_W, HALF_TASK_H } from "@/app/lib/diagram/assistPlacement";
import { planWrapInSubprocess, planUnwrapSubprocess, planWrapInContainer } from "@/app/lib/diagram/subprocessWrap";
import { matchIntent, matchAssistRules, type IntentRow } from "@/app/lib/diagram/intentMatch";
import { canConnect } from "@/app/lib/diagram/canConnect";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { resolveRef, resolveSelectionRefs, isSelectionRef, nearestRefs, ID_REF_PREFIX, spokenNumbersAsDigits } from "@/app/lib/assist/resolveRef";
import { isPointerElementRef } from "@/app/lib/assist/pointerRef";
import { nextContainerLabels } from "@/app/lib/diagram/containerNames";
import { isAnyLane, laneKindWord, sameKindAs } from "@/app/lib/diagram/laneKind";
import { convertMatches, matchesForType } from "@/app/lib/assist/convertPhrase";
import { subtypeFingerprint } from "@/app/lib/diagram/elementSubtypes";
import { planLabelFill } from "@/app/lib/assist/fillSelection";
import { findRiskCatalogItem } from "@/app/lib/assist/riskCatalogRef";
import { parseGhostPick, resolveGhostPick } from "@/app/lib/assist/ghostPick";
import { looksLikeElementId, notUnderstoodMessage, humaniseIds } from "@/app/lib/assist/refMentions";
import { isMicStopWord, isFlowEndWord } from "@/app/lib/assist/stopWords";
import { isIncompleteCommand } from "@/app/lib/assist/incompleteCommand";
import { leadingSpokenNumber } from "@/app/lib/assist/spokenNumber";
import { capitaliseFirstWord, needsCapital } from "@/app/lib/diagram/nameCase";
import { batchFlashes, isGoldFlashOn, setGoldFlash, goldFlashSummary, flashTargets, type FlashBox } from "@/app/lib/assist/goldFlash";
import { touchedFor, type TouchBox, type CommandVerdict } from "@/app/lib/assist/commandLog";
import { FRAGMENT_SILENCE_MS, FRAGMENT_CONTINUE_MS, FRAGMENT_MAX_WAITS } from "@/app/lib/assist/fragmentBuffer";
import { isVoiceDebugOn, setVoiceDebug } from "@/app/lib/assist/voiceDebug";
import { captureCanvasPng } from "@/app/lib/diagram/canvasSnapshot";
import { buildDebugSessionFile, debugSessionFilename, serialiseDebugSession, type DebugSnapshot } from "@/app/lib/assist/debugSessionFile";
import { planMovePool, planSwapPools, selectedPools, poolsInOrder } from "@/app/lib/diagram/poolOrder";
import { isContainerType, getAllDescendantIds } from "@/app/hooks/useDiagram";
import { collectMessageTargets, parseMessageAnswer, resolveMessageAnswer, type MessagePick } from "@/app/lib/assist/messageTargets";
import { validateOps, type AssistOp } from "@/app/lib/assist/ops";
import { applyAssistOps as applyAssistOpsTo, type RenameFlow } from "@/app/lib/assist/applyAssistOps";
import { boundaryRect } from "@/app/lib/assist/poolBoundaryPhrase";
import { syntheticElement, withAdded, withDeleted, withLabel } from "@/app/lib/assist/workingSet";
import { needsConfirmation, parseConfirmation } from "@/app/lib/assist/confirm";
import { collectRenameTargets, type RenameType, type RenameTarget } from "@/app/lib/assist/renameTargets";
import { buildPickFlow, parsePickAnswer, substituteRef, type PickFlow } from "@/app/lib/assist/disambiguate";
import { cardsOf, numberTemplates, templatesToOffer, canAttachInline, hiddenTemplatesNote, templateWindowSummary, parseTemplateAnswer, type TemplateCard, type TemplateSection } from "@/app/lib/assist/templatePick";
import { TEMPLATE_BEFORE_REFUSAL } from "@/app/lib/assist/templatePhrase";
import { planTemplateAttach, checkTemplateAttach, planTemplateShow, whyTemplateCantFollow, anchorNameOf } from "@/app/lib/diagram/templateAttach";
import type { TemplateIds } from "@/app/lib/diagram/templatePreview";
import { TemplatePickerWindow } from "@/app/components/canvas/TemplatePickerWindow";
import { diagramKeyterms } from "@/app/lib/dictation/diagramKeyterms";
import { VoiceAssistBar, type CommandLogEntry } from "@/app/components/canvas/VoiceAssistBar";
import { startDictation, type DictationHandle } from "@/app/lib/dictation";
import { PropertiesPanel } from "@/app/components/canvas/PropertiesPanel";
import { captureTemplate, instantiateTemplate } from "@/app/lib/diagram/templates";
import { resolvePackageNameLink } from "@/app/lib/diagram/packageLink";
import { ImpersonationBanner } from "@/app/components/ImpersonationBanner";
import { SimulatorOverlay } from "@/app/components/simulation/SimulatorOverlay";
import { AnimateOverlay } from "@/app/components/canvas/AnimateOverlay";
import type { RiskCatalogItem } from "@/app/components/canvas/RiskControlSection";
import { getRiskControl, riskControlPatch } from "@/app/lib/diagram/riskControl";
import { simPatch } from "@/app/lib/diagram/simParams";
import { autofillSimulation } from "@/app/lib/simulation/autofill";
import { clearSimData } from "@/app/lib/simulation/clearSimData";
import { useFeatureColors } from "@/app/lib/theme/useFeatureColors";
import { featureVars, tonesFor } from "@/app/lib/theme/featureColors";
import { NUMBERABLE_TYPES } from "@/app/lib/numbering/renumber";
import { useOrgPolicy, useSharePointAvailable } from "@/app/lib/auth/useOrgPolicy";
import { setNoObstacleAvoidance } from "@/app/lib/diagram/routing";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { formatNameList } from "@/app/lib/formatNames";
import { TranslateToBpmnDialog } from "@/app/components/TranslateToBpmnDialog";
import { EpcToBpmnDialog } from "@/app/components/EpcToBpmnDialog";
import { InfoDialog } from "@/app/components/InfoDialog";
import { DiagramTypeBadge } from "@/app/components/DiagramTypeBadge";
import { useDiagramTypeStyles } from "@/app/hooks/useDiagramTypeStyles";
import { useSuperAdminChrome, viewModeEntitlements } from "@/app/hooks/useSuperAdminChrome";
import { useFeatureState } from "@/app/components/FeatureGate";
import { atLeastTier } from "@/app/lib/features/tierRank";
import { lightenHex } from "@/app/lib/diagram/diagramTypeStyles";
import { AiPanel } from "./AiPanel";
import { AiComparisonModal, type AiComparison } from "@/app/components/AiComparisonModal";
import { toSuggestions, type ProjectEntityStructure, type EntityListDTO, type EntityNodeLevel } from "@/app/lib/entityLists/types";
import { computeEntityDrift } from "@/app/lib/entityLists/entityDrift";
import { PlanPanel } from "./PlanPanel";
import { AiGenerateScreen } from "./ai-generate/AiGenerateScreen";
import { useReopenFromGuide } from "@/app/hooks/useReopenFromGuide";
import { SendForReviewDialog } from "./SendForReviewDialog";
import { PublishVersionDialog } from "./PublishVersionDialog";
import { PublishBundleDialog } from "./PublishBundleDialog";
import { SupportRequestDialog } from "./SupportRequestDialog";
import { FeedbackPanel } from "./FeedbackPanel";
import { AlertDialog } from "@/app/components/AlertDialog";
import { buildPromptFromDiagram } from "@/app/lib/diagram/prompt-from-diagram";
import { SharePointPicker } from "@/app/components/SharePointPicker";
import { SharePointPreview } from "@/app/components/SharePointPreview";
import { SafeBoundary } from "@/app/components/SafeBoundary";
import { DiagramatixThrobber } from "@/app/components/DiagramatixThrobber";
import { checkDiagram, rulesMetadata, type Violation } from "@/app/lib/diagram/checks/diagramChecks";
import { HistoryPanel } from "./HistoryPanel";
import { ProcessDiffDialog } from "./ProcessDiffDialog";
import { FilePreviewDialog, type PreviewPayload } from "@/app/components/preview/FilePreviewDialog";
import { diagramFreshness } from "@/app/lib/valueChain/staleness";

interface VisioImportResult {
  // Which importer produced this result — drives the result modal's wording
  // (Visio talks about "masters/shapes on page"; BPMN about processes). Absent
  // = Visio (the original consumer of this modal).
  kind?: "visio" | "bpmn";
  // `data` is the parsed DiagramData payload — present only on overwrite
  // responses so the in-editor flow can push the new content into the
  // reducer without a page reload. On a fresh-create import we don't
  // need it (the user navigates to the new diagram via "Open Diagram"
  // and the standard page-load path fetches the data).
  diagram: { id: string; data?: DiagramData };
  warnings: string[];
  stats: {
    totalShapesOnPage: number;
    elementsCreated: number;
    connectorsCreated: number;
    shapesSkipped: number;
    connectorsSkipped: number;
    implicitPools: number;
    masters: { masterId: string; nameU: string; count: number; classifiedAs: string }[];
  };
}

// Review Comment default creation size (2/3 W × 1/2 H of the old 340×288).
const REVIEW_COMMENT_W = 227;
const REVIEW_COMMENT_H = 144;
// Bold, non-editable header stamp on a review comment: "Name · dd/mm/yy hh:mm am/pm".
function fmtReviewStamp(d: Date): string {
  return d.toLocaleString("en-AU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true });
}
// Initial width wide enough for the bold header (name + timestamp). A long name
// pushes past the cap, in which case the renderer drops the timestamp to line 2.
function reviewCommentWidth(name: string, stamp: string): number {
  const header = stamp ? `${name} · ${stamp}` : name;
  const est = Math.ceil(header.length * 6.6) + 24; // ~char width @ 11px + padding
  return Math.min(360, Math.max(REVIEW_COMMENT_W, est));
}

interface Props {
  diagramId: string;
  /** The saved SuperAdmin model-comparison matrix for this diagram (or {} if
   *  none). Drives the "AI Comparison Results" button on load. */
  initialAiComparison?: unknown;
  diagramName: string;
  diagramType: DiagramType;
  initialData: DiagramData;
  projectId: string | null;
  initialDiagramColorConfig?: SymbolColorConfig;
  initialDisplayMode?: DisplayMode;
  userEmail?: string;
  createdAt?: string;
  updatedAt?: string;
  readOnly?: boolean;
  /** A VIEW-only project share. Read-only for the shared diagram, but the
   *  recipient may drop pink Review markers and Send Feedback (item 6). */
  canGiveFeedback?: boolean;
  viewingAsName?: string;
  viewingAsEmail?: string;
  impersonationMode?: "view" | "edit";
  version?: number;
  /** Co-authoring optimistic-concurrency token (Diagram.version). Sent on every
   *  data save; the server 409s a stale write. Distinct from `version` (the app
   *  build/commit count used only for the header version badge). */
  dataVersion?: number;
  /** Current user's display name, for presence attribution. */
  currentUserName?: string;
  /** Phase 2: real-time cursors available (server has LIVEBLOCKS_SECRET_KEY). */
  collabRealtime?: boolean;
  /** Subscription per-diagram element cap for THIS diagram's type.
   *  null when the tier is unlimited or the user is a superuser. The
   *  client-side ADD gate compares (current node count + 1) against
   *  this value and shows a toast when blocked. */
  elementCountLimit?: number | null;
  /** Current Diagram Owner (hard FK to a registered user). The project
   *  owner by default; reassignable per-diagram by the project owner.
   *  Null for legacy diagrams whose backfill didn't catch them and for
   *  legacy orphan diagrams with no project. */
  initialDiagramOwner?: { id: string; name: string | null; email: string } | null;
  /** Pool of users the Diagram Owner picker offers. Project owner plus
   *  every user the project is shared with. Empty for legacy orphans. */
  diagramOwnerCandidates?: { id: string; name: string | null; email: string }[];
  /** Whether the picker is editable. True only when the caller is the
   *  project owner. Server still re-checks every PUT regardless. */
  canEditDiagramOwner?: boolean;
  /** True when this diagram's project is an adopted example — such projects
   *  can't be shared or published, so the Publish dropdown is hidden. */
  isExampleProject?: boolean;
  /** Current user's id, for the "am I the diagram owner?" check that
   *  gates the publish button. */
  currentUserId?: string;
  /** Optional back-link override (from `?from=`). When set, the header's
   *  back button returns here instead of the project/dashboard derived
   *  from `projectId`. Used so diagrams opened from the dashboard's
   *  Published / Unorganised sections return to the dashboard. */
  backFromHref?: string | null;
  /** When true (from `?feedback=1`, e.g. a feedback-received notification),
   *  the FeedbackPanel opens automatically on load. */
  openFeedbackPanel?: boolean;
  /** Persisted lifecycle state — drives the header pill and the
   *  visibility of the publish-version button. */
  initialLifecycle?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  /** Latest non-superseded PublishedVersion, if any. Drives the
   *  "Published v3 · 2026-12-10" pill. */
  initialCurrentPublishedVersion?: { versionNumber: number; publishedAt: string } | null;
  /** Pre-fills the PublishVersionDialog's "next review" cadence input. */
  initialReviewCadenceMonths?: number | null;
  /** Pre-fills the PublishVersionDialog's "next review" date input
   *  (ISO yyyy-mm-dd, or null). */
  initialNextReviewDate?: string | null;
}

/** Co-authoring conflict surfaced by the version guard: another editor saved
 *  since this client loaded, so our data save was rejected (409). We three-way
 *  merge our edits onto theirs; `merged` is the result and `conflicts` lists any
 *  true overlaps (same element/connector changed by both — resolved to theirs). */
export interface SaveConflict {
  serverData: DiagramData;
  merged: DiagramData;
  conflicts: MergeConflict[];
  currentVersion: number;
  lastEditor: string | null;
}

/** A template the window has put on the diagram to be looked at (templatePreview.ts). */
type TemplateShowing = {
  card: TemplateCard;
  /** applyTemplate's stamp — asked of templateStillShowing before any swap or cancel. */
  stamp: number;
  /** The diagram it was applied to: what a swap restores while it is still showing. */
  base: { elements: DiagramElement[]; connectors: Connector[] };
  ids: TemplateIds;
};

/**
 * The "add template" window (Paul, 2026-09-24), and where its picks go — after
 * an element ("add template after X", 2026-09-25), at the pointer, or at the
 * middle of the screen.
 */
type TemplateFlow = {
  /** A new window is a new id: a pick still loading for an old one is dropped. */
  openId: string;
  sections: TemplateSection[];
  cards: TemplateCard[];
  provisional: TemplateShowing | null;
  hiddenInitial: number;
  hiddenContainer: number;
  anchorId?: string;
  anchorName?: string;
  at?: Point;
  /** What was selected when the window opened. Once a number is picked the
   *  preview IS the selection, and "after selected" still means this. */
  selectionAtOpen: string[];
  /** Why the last pick was refused; the window stays open. */
  notice?: string | null;
};

/** How a template pick reports: one log line, written in the same tick as the change it describes. */
type TemplateReport = (r: { ok: boolean; summary: string }) => void;

async function fetchTemplateData(id: string): Promise<TemplateData | null> {
  try {
    const res = await fetch(`/api/templates/${id}`);
    if (!res.ok) return null;
    return ((await res.json()).data as TemplateData | undefined) ?? null;
  } catch {
    return null;
  }
}

function useAutoSave(
  diagramId: string,
  data: DiagramData,
  delay = 1500,
  disabled = false,
  initialVersion = 0,
  // Co-authoring: when others are present we go MANUAL — the debounced auto-save
  // is off and the user presses Sync (push + pull + 3-way merge) on each end.
  // A ref (not a value) so it can be computed after presence, below the call.
  manualSyncRef?: { current: boolean },
) {
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [conflict, setConflict] = useState<SaveConflict | null>(null);
  // The last COMMITTED (synced) document — the baseline for ghosts + the merge base.
  const [syncedData, setSyncedData] = useState<DiagramData>(data);
  // The committed version we're on — broadcast so idle peers auto-align when it advances.
  const [committedVersion, setCommittedVersion] = useState<number>(initialVersion);
  const lastSaved = useRef<string>(JSON.stringify(data));
  // Optimistic-concurrency token: the diagram version this client last saw.
  const versionRef = useRef<number>(initialVersion);

  // Track unsaved changes (no auto-save timer). Runs even in manual mode so the
  // Sync button can show there's something to push.
  useEffect(() => {
    if (disabled) return;
    const current = JSON.stringify(data);
    if (current !== lastSaved.current) {
      setSaveStatus("unsaved");
    }
  }, [data, disabled]);

  const saveNow = useCallback(async () => {
    const current = JSON.stringify(data);
    if (current === lastSaved.current) return;
    if (conflict) return; // paused until the user resolves the conflict
    setSaveStatus("saving");
    try {
      const res = await fetch(`/api/diagrams/${diagramId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, version: versionRef.current }),
      });
      if (res.status === 409) {
        // Someone saved under us — three-way merge our edits onto theirs.
        const payload = await res.json().catch(() => ({}));
        const theirs = payload.data as DiagramData;
        let base: DiagramData | null = null;
        try { base = JSON.parse(lastSaved.current) as DiagramData; } catch { base = null; }
        const { merged, conflicts } = base
          ? mergeDiagram(base, data, theirs)
          : { merged: theirs, conflicts: [] as MergeConflict[] };
        setConflict({
          serverData: theirs,
          merged,
          conflicts,
          currentVersion: typeof payload.currentVersion === "number" ? payload.currentVersion : versionRef.current,
          lastEditor: payload.lastEditor ?? null,
        });
        setSaveStatus("unsaved");
        return;
      }
      if (!res.ok) { setSaveStatus("unsaved"); return; }
      const updated = await res.json().catch(() => null);
      if (updated && typeof updated.version === "number") versionRef.current = updated.version;
      lastSaved.current = current;
      setSyncedData(data);
      setCommittedVersion(versionRef.current);
      setLastSavedAt(new Date().toISOString());
      setSaveStatus("saved");
    } catch {
      setSaveStatus("unsaved");
    }
  }, [data, diagramId, conflict]);

  /** Co-authoring Sync — PULL everyone's committed changes and PUSH ours, in one
   *  3-way merge, even when we have no local edits. Returns the merged document
   *  for the editor to apply locally (setData). Any party can call it. */
  const syncNow = useCallback(async (): Promise<DiagramData | null> => {
    setSaveStatus("saving");
    try {
      // PULL current server state.
      const getRes = await fetch(`/api/diagrams/${diagramId}`, { cache: "no-store" });
      if (!getRes.ok) { setSaveStatus("unsaved"); return null; }
      const server = await getRes.json().catch(() => null);
      const theirs = (server?.data ?? { elements: [], connectors: [] }) as DiagramData;
      let base: DiagramData | null = null;
      try { base = JSON.parse(lastSaved.current) as DiagramData; } catch { base = null; }
      let merged = base ? mergeDiagram(base, data, theirs).merged : theirs;
      let version = typeof server?.version === "number" ? server.version : versionRef.current;
      // PUSH the merged doc (compare-and-swap); if someone slipped in, re-merge + retry.
      for (let attempt = 0; attempt < 4; attempt++) {
        const putRes = await fetch(`/api/diagrams/${diagramId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: merged, version }),
        });
        if (putRes.status === 409) {
          const p = await putRes.json().catch(() => ({}));
          const t2 = p.data as DiagramData;
          merged = base ? mergeDiagram(base, merged, t2).merged : t2;
          version = typeof p.currentVersion === "number" ? p.currentVersion : version;
          continue;
        }
        if (!putRes.ok) { setSaveStatus("unsaved"); return null; }
        const updated = await putRes.json().catch(() => null);
        version = updated && typeof updated.version === "number" ? updated.version : version + 1;
        versionRef.current = version;
        lastSaved.current = JSON.stringify(merged);
        setSyncedData(merged);
        setCommittedVersion(version);
        setLastSavedAt(new Date().toISOString());
        setSaveStatus("saved");
        return merged;
      }
      setSaveStatus("unsaved");
      return null;
    } catch {
      setSaveStatus("unsaved");
      return null;
    }
  }, [data, diagramId]);

  /** Auto-align: another participant advanced the committed version, so PULL their
   *  committed doc and 3-way-merge it into ours (keeping our un-synced edits) —
   *  but DON'T push, so a Sync by one person aligns the whole group without a
   *  cascade. Returns the merged doc to apply, or null if nothing new. */
  const pullMerge = useCallback(async (): Promise<DiagramData | null> => {
    try {
      const getRes = await fetch(`/api/diagrams/${diagramId}`, { cache: "no-store" });
      if (!getRes.ok) return null;
      const server = await getRes.json().catch(() => null);
      const theirVersion = typeof server?.version === "number" ? server.version : versionRef.current;
      if (theirVersion <= versionRef.current) return null; // nothing newer
      const theirs = (server?.data ?? { elements: [], connectors: [] }) as DiagramData;
      let base: DiagramData | null = null;
      try { base = JSON.parse(lastSaved.current) as DiagramData; } catch { base = null; }
      const merged = base ? mergeDiagram(base, data, theirs).merged : theirs;
      versionRef.current = theirVersion;
      lastSaved.current = JSON.stringify(theirs);   // baseline = their committed
      setSyncedData(theirs);
      setCommittedVersion(theirVersion);
      setSaveStatus(JSON.stringify(merged) === JSON.stringify(theirs) ? "saved" : "unsaved");
      return merged;
    } catch {
      return null;
    }
  }, [data, diagramId]);

  /** Adopt the server's version as the new base after the caller has applied the
   *  merged document to the reducer. Set lastSaved to the SERVER's data so the
   *  merged (which includes our edits) still differs and the next debounce
   *  persists it at the new version. */
  const acceptMerge = useCallback(() => {
    if (!conflict) return;
    versionRef.current = conflict.currentVersion;
    lastSaved.current = JSON.stringify(conflict.serverData);
    setConflict(null);
    setSaveStatus("unsaved");
  }, [conflict]);

  // Debounced auto-save. Without this the diagram only persists when a
  // navigation hook explicitly calls saveNow(); a change followed by leaving
  // via any other path (e.g. setting a chevron's linked-diagram id, then
  // browsing away) was silently lost. Force-saves on navigation still win;
  // this timer no-ops when there's nothing new to write.
  useEffect(() => {
    if (disabled || conflict || manualSyncRef?.current) return; // manual: Sync only, no auto-save
    if (JSON.stringify(data) === lastSaved.current) return;
    const t = setTimeout(() => { void saveNow(); }, delay);
    return () => clearTimeout(t);
  }, [data, disabled, delay, saveNow, conflict, manualSyncRef]);

  /** Discard my un-synced local edits and load the last COMMITTED diagram fresh
   *  (safeguard: bail out of a dirty/stale local session). Returns the server doc
   *  for the caller to setData. */
  const revertToSaved = useCallback(async (): Promise<DiagramData | null> => {
    setSaveStatus("saving");
    try {
      const getRes = await fetch(`/api/diagrams/${diagramId}`, { cache: "no-store" });
      if (!getRes.ok) { setSaveStatus("unsaved"); return null; }
      const server = await getRes.json().catch(() => null);
      const theirs = (server?.data ?? { elements: [], connectors: [] }) as DiagramData;
      const theirVersion = typeof server?.version === "number" ? server.version : versionRef.current;
      versionRef.current = theirVersion;
      lastSaved.current = JSON.stringify(theirs);
      setSyncedData(theirs);
      setCommittedVersion(theirVersion);
      setLastSavedAt(new Date().toISOString());
      setSaveStatus("saved");
      return theirs;
    } catch { setSaveStatus("unsaved"); return null; }
  }, [diagramId]);

  return { saveStatus, lastSavedAt, saveNow, syncNow, pullMerge, revertToSaved, conflict, acceptMerge, syncedData, committedVersion };
}

function exportSvg(svgEl: SVGSVGElement, name: string, output: "save" | "string" = "save"): string | void {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute("tabindex");
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(clone);
  if (output === "string") return svgStr;
  const blob = new Blob([svgStr], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getDiagramBounds(data: DiagramData, padding = 20) {
  if (data.elements.length === 0) {
    return { x: 0, y: 0, width: 200, height: 200 };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const el of data.elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }

  for (const conn of data.connectors) {
    for (const wp of conn.waypoints) {
      minX = Math.min(minX, wp.x);
      minY = Math.min(minY, wp.y);
      maxX = Math.max(maxX, wp.x);
      maxY = Math.max(maxY, wp.y);
    }
  }

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

// isIncompleteCommand — "did Deepgram split this at a pause?" — lives in
// app/lib/assist/incompleteCommand.ts (pure, tested) since 2026-09-15.

async function exportPdf(svgEl: SVGSVGElement, name: string, data: DiagramData, scale = 1, output: "save" | "blob" = "save"): Promise<Blob | void> {
  const { jsPDF } = await import("jspdf");
  await import("svg2pdf.js");

  const bounds = getDiagramBounds(data);

  // Reserve space for the title header above the diagram
  const tfs = data.titleFontSize ?? 14;
  const lineH = Math.round(tfs * 1.15);
  const title = data.title;
  const hasVersion = !!title?.version;
  const hasAuthors = !!title?.authors;
  const subLineCount = (hasVersion || hasAuthors ? 1 : 0) + 1; // status line always, version/authors optional
  const titleH = (1 + subLineCount) * lineH + 16;
  const titlePad = 30; // extra padding above the title text
  // Expand bounds upward to include the title + padding
  bounds.y -= (titleH + titlePad);
  bounds.height += (titleH + titlePad);

  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute("tabindex");
  clone.removeAttribute("class");
  clone.removeAttribute("data-canvas");
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  // Set viewBox to content bounds, stripping pan/zoom
  clone.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
  clone.setAttribute("width", String(bounds.width));
  clone.setAttribute("height", String(bounds.height));

  // Strip unsupported SVG filters — svg2pdf.js silently skips groups with
  // feTurbulence/feDisplacementMap, so remove all filter refs and the sketchy defs
  clone.querySelectorAll("[filter]").forEach((el) => el.removeAttribute("filter"));
  const sketchyDefs = clone.querySelector("#sketchy");
  if (sketchyDefs) sketchyDefs.closest("defs")?.remove();

  // Hoist nested <defs> (connector markers) to SVG root so refs resolve after transform removal
  const topGroup = clone.querySelector(":scope > g[transform]");
  if (topGroup) {
    topGroup.querySelectorAll("defs").forEach((d) => {
      clone.insertBefore(d, topGroup);
    });
    topGroup.removeAttribute("transform");
  }

  // Remove interactive-only elements (selection handles, drag lines, etc.)
  clone.querySelectorAll("[data-interactive]").forEach((el) => el.remove());

  // Inject PDF title at the top of the diagram (always shown in PDF)
  {
    const origBounds = getDiagramBounds(data);
    const els = data.elements;
    let minX2 = Infinity, maxX2 = -Infinity;
    for (const el of els) { if (el.x < minX2) minX2 = el.x; if (el.x + el.width > maxX2) maxX2 = el.x + el.width; }
    const cx = els.length > 0 ? (minX2 + maxX2) / 2 : bounds.x + bounds.width / 2;
    const titleTopY = origBounds.y - titleH - 20 + 8;
    const subFs = Math.round(tfs * 0.79);
    const statusLabel = (title?.status ?? "draft").charAt(0).toUpperCase() + (title?.status ?? "draft").slice(1);

    const ns = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(ns, "g");
    g.setAttribute("data-pdf-title", "true");

    // Line 1: Diagram name (bold)
    const t1 = document.createElementNS(ns, "text");
    t1.setAttribute("text-anchor", "middle");
    t1.setAttribute("x", String(cx));
    t1.setAttribute("y", String(titleTopY + lineH * 0.85));
    t1.setAttribute("font-size", String(tfs));
    t1.setAttribute("font-weight", "bold");
    t1.setAttribute("fill", "#1f2937");
    t1.textContent = name || "Untitled";
    g.appendChild(t1);

    // Line 2: Version + Authors (if any)
    let lineIdx = 1;
    const line2Parts: string[] = [];
    if (title?.version) line2Parts.push(`Version ${title.version}`);
    if (title?.authors) line2Parts.push(`Author/s: ${title.authors}`);
    if (line2Parts.length > 0) {
      const t2 = document.createElementNS(ns, "text");
      t2.setAttribute("text-anchor", "middle");
      t2.setAttribute("x", String(cx));
      t2.setAttribute("y", String(titleTopY + lineIdx * lineH + lineH * 0.85));
      t2.setAttribute("font-size", String(subFs));
      t2.setAttribute("fill", "#6b7280");
      t2.textContent = line2Parts.join("    ");
      g.appendChild(t2);
      lineIdx++;
    }

    // Line 3: Status
    const t3 = document.createElementNS(ns, "text");
    t3.setAttribute("text-anchor", "middle");
    t3.setAttribute("x", String(cx));
    t3.setAttribute("y", String(titleTopY + lineIdx * lineH + lineH * 0.85));
    t3.setAttribute("font-size", String(subFs));
    t3.setAttribute("fill", "#6b7280");
    t3.textContent = `Status: ${statusLabel}`;
    g.appendChild(t3);

    // Remove any existing canvas title from clone to avoid duplication
    clone.querySelectorAll("[data-title-block]").forEach((el) => el.remove());
    clone.appendChild(g);
  }

  // Insert clone off-screen so svg2pdf.js can compute styles via getComputedStyle/getBBox
  clone.style.position = "absolute";
  clone.style.left = "-9999px";
  clone.style.top = "-9999px";
  document.body.appendChild(clone);

  const scaledW = bounds.width * scale;
  const scaledH = bounds.height * scale;
  const landscape = scaledW > scaledH;
  const doc = new jsPDF({
    orientation: landscape ? "landscape" : "portrait",
    unit: "pt",
    format: [scaledW, scaledH],
  });

  try {
    await doc.svg(clone, { x: 0, y: 0, width: scaledW, height: scaledH });
    if (output === "blob") return doc.output("blob");
    doc.save(`${name}.pdf`);
  } finally {
    document.body.removeChild(clone);
  }
}

/**
 * One export format row in the File ▸ Export menu that opens a small flyout
 * (on hover) offering two explicit actions: 👁 Preview (the in-app pop-up) and
 * ⬇ Download (the real export). Replaces the easily-missed inline eye icon so
 * every export makes both actions discoverable. The flyout opens to the LEFT
 * (the File menu sits near the right edge, so its submenus cascade leftward).
 */
function ExportLeaf({ label, title, tone, onPreview, onDownload }: {
  label: string;
  title?: string;
  tone?: "default" | "admin";
  onPreview: () => void;
  onDownload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const base = tone === "admin" ? "text-red-700" : "text-gray-700";
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button title={title}
        className={`flex w-full items-center justify-between px-3 py-2 text-xs ${open ? "bg-blue-50 text-blue-700 font-medium" : `${base} hover:bg-gray-50`}`}>
        <span>{label}</span><span className="text-gray-400">◂</span>
      </button>
      {open && (
        <div className="absolute bg-white border border-gray-200 rounded shadow-lg py-1 z-[10002]" style={{ top: -1, right: "100%", minWidth: 132 }}>
          <button onClick={onPreview} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50" title="Preview in a pop-up (no download)">
            <span>👁</span><span>Preview</span>
          </button>
          <button onClick={onDownload} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50" title="Download the file (export as usual)">
            <span>⬇</span><span>Download</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function DiagramEditor({
  diagramId,
  initialAiComparison,
  diagramName,
  diagramType,
  initialData,
  projectId,
  initialDiagramColorConfig,
  initialDisplayMode,
  userEmail,
  createdAt,
  updatedAt,
  readOnly: readOnlyProp,
  canGiveFeedback,
  viewingAsName,
  viewingAsEmail,
  impersonationMode,
  version,
  dataVersion = 0,
  currentUserName,
  collabRealtime,
  elementCountLimit,
  initialDiagramOwner,
  diagramOwnerCandidates = [],
  canEditDiagramOwner = false,
  isExampleProject = false,
  currentUserId,
  backFromHref = null,
  openFeedbackPanel = false,
  initialLifecycle = "DRAFT",
  initialCurrentPublishedVersion = null,
  initialReviewCadenceMonths = null,
  initialNextReviewDate = null,
}: Props) {
  const router = useRouter();

  // --- Subprocess drill-down navigation stack (sessionStorage) ---
  const STACK_KEY = "dgx_drill_stack";

  function getDrillStack(): { id: string; name: string }[] {
    try {
      const raw = sessionStorage.getItem(STACK_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  // Current Diagram Owner. Held client-side so a successful PATCH
  // updates the PropertiesPanel display immediately, no reload. Server
  // is the source of truth — re-pulled if a fetch goes stale (e.g. the
  // user is removed from the project and the field gets cleared).
  const [diagramOwner, setDiagramOwnerState] = useState<
    { id: string; name: string | null; email: string } | null
  >(initialDiagramOwner ?? null);
  // Optimistic save: replace state, PATCH, roll back if the server
  // rejects. The PUT route on /api/diagrams/[id] enforces the project-
  // owner-only rule itself (Slice 3) — we never trust canEditDiagramOwner
  // alone, but it does decide whether the picker is rendered at all.
  const [diagramOwnerError, setDiagramOwnerError] = useState<string | null>(null);
  const setDiagramOwner = useCallback(async (userId: string | null) => {
    if (!canEditDiagramOwner) return;
    const target = userId
      ? diagramOwnerCandidates.find(c => c.id === userId) ?? null
      : null;
    const previous = diagramOwner;
    setDiagramOwnerState(target);
    setDiagramOwnerError(null);
    try {
      const res = await fetch(`/api/diagrams/${diagramId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagramOwnerId: userId }),
      });
      if (!res.ok) throw new Error((await res.text()) || res.statusText);
    } catch (err) {
      setDiagramOwnerState(previous);
      setDiagramOwnerError(err instanceof Error ? err.message : String(err));
    }
  }, [diagramId, canEditDiagramOwner, diagramOwnerCandidates, diagramOwner]);

  // The parent diagram (top of stack) — if we got here via drill-down
  const [parentDiagram, setParentDiagram] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    const stack = getDrillStack();
    const top = stack.length > 0 ? stack[stack.length - 1] : null;
    setParentDiagram(top);
  }, []);

  // Publish the open diagram's name to the global screen-capture tool (which
  // lives in the root layout, above this component in the tree).
  useEffect(() => {
    setCurrentDiagramName(diagramName);
    return () => setCurrentDiagramName(null);
  }, [diagramName]);

  // Sibling diagrams in the same project (for subprocess linking AND for
  // the prev/next folder-mate navigation buttons in the top bar).
  const [siblingDiagrams, setSiblingDiagrams] = useState<{ id: string; name: string; type: string }[]>([]);
  // Project folder structure — used to scope the prev/next buttons to the
  // CURRENT folder, not the whole project. Shape mirrors the FolderTree
  // type used in ProjectDetailClient.
  const [folderTree, setFolderTree] = useState<{
    folders?: { id: string; name: string; parentId: string | null }[];
    diagramFolderMap?: Record<string, string>;
    diagramOrder?: Record<string, string[]>;
  } | null>(null);
  // Project-level "Show non-APQC" toggle — rings non-APQC activities on the canvas.
  const [showNonApqc, setShowNonApqc] = useState(false);
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.diagrams) {
          setSiblingDiagrams(
            (data.diagrams as { id: string; name: string; type: string }[])
              .filter(d => d.id !== diagramId)
          );
        }
        if (data?.folderTree) setFolderTree(data.folderTree);
        setShowNonApqc(!!(data?.numberingConfig as { showNonApqc?: boolean } | undefined)?.showNonApqc);
      })
      .catch(() => {});
  }, [projectId, diagramId]);

  // Project entity structure (External Participants, IT Systems, Org Structure)
  // — drives pool/lane naming autocomplete. Mirrors the siblingDiagrams fetch.
  const [entityStructure, setEntityStructure] = useState<ProjectEntityStructure | null>(null);
  const loadEntityStructure = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/entity-lists`);
      if (!res.ok) return;
      const { lists } = (await res.json()) as { lists: EntityListDTO[] };
      const pick = (kind: EntityListDTO["kind"]) => lists.find(l => l.kind === kind);
      const p = pick("Participant"), s = pick("System"), o = pick("OrgStructure"), d = pick("Document"), ds = pick("DataStore");
      setEntityStructure({
        participants: p ? toSuggestions(p.nodes) : [],
        systems: s ? toSuggestions(s.nodes) : [],
        orgStructure: o ? toSuggestions(o.nodes) : [],
        documents: d ? toSuggestions(d.nodes) : [],
        dataStores: ds ? toSuggestions(ds.nodes) : [],
        listIds: {
          ...(p ? { Participant: p.id } : {}), ...(s ? { System: s.id } : {}), ...(o ? { OrgStructure: o.id } : {}),
          ...(d ? { Document: d.id } : {}), ...(ds ? { DataStore: ds.id } : {}),
        },
      });
    } catch { /* ignore */ }
  }, [projectId]);
  useEffect(() => { loadEntityStructure(); }, [loadEntityStructure]);

  // Project Risk & Control catalog — items available to attach to a step.
  const [riskCatalog, setRiskCatalog] = useState<RiskCatalogItem[]>([]);
  // Whether the "Risk & Controls" Properties-Panel section is expanded — drives
  // the red/green canvas highlight. STICKY across diagrams within a project:
  // persisted in sessionStorage keyed by the project id, so paging through a
  // project's diagrams (prev/next) keeps the panel open and every diagram shows
  // its risk/control rings on load. A different project starts closed by default.
  const RC_OPEN_KEY = "dgx_rc_panel_open_project";
  const [rcSectionOpen, setRcSectionOpen] = useState<boolean>(() => {
    if (typeof window === "undefined" || !projectId) return false;
    return window.sessionStorage.getItem(RC_OPEN_KEY) === projectId;
  });
  const toggleRcSection = useCallback((open: boolean) => {
    setRcSectionOpen(open);
    if (typeof window === "undefined") return;
    if (open && projectId) window.sessionStorage.setItem(RC_OPEN_KEY, projectId);
    else window.sessionStorage.removeItem(RC_OPEN_KEY);
  }, [projectId]);
  const [riskLibraryId, setRiskLibraryId] = useState<string | null>(null);
  const refreshRiskCatalog = useCallback(async () => {
    if (!projectId) return;
    try {
      const r = await fetch(`/api/projects/${projectId}/risk-controls`);
      const j = r.ok ? await r.json() : { library: null };
      setRiskLibraryId(j.library?.id ?? null);
      setRiskCatalog((j.library?.items ?? []).map((it: RiskCatalogItem) => ({ id: it.id, code: it.code, name: it.name, kind: it.kind })));
    } catch { /* ignore */ }
  }, [projectId]);
  useEffect(() => { void refreshRiskCatalog(); }, [refreshRiskCatalog]);
  // SOPs generated for THIS diagram — lets the Properties panel offer "Open SOP" for
  // the selected Lane/Pool and the whole Diagram, each flagged stale ("regeneration
  // required") when the diagram changed after the SOP was generated.
  const [diagramSops, setDiagramSops] = useState<{ id: string; scope: string; scopeElementId: string | null; stale: boolean; title: string }[]>([]);
  const refreshDiagramSops = useCallback(async () => {
    if (!projectId) return;
    try {
      const r = await fetch(`/api/projects/${projectId}/sop`);
      const j = r.ok ? await r.json() : { documents: [] };
      setDiagramSops((j.documents ?? [])
        .filter((d: { diagramId: string }) => d.diagramId === diagramId)
        .map((d: { id: string; scope: string; scopeElementId: string | null; stale?: boolean; title: string }) =>
          ({ id: d.id, scope: d.scope, scopeElementId: d.scopeElementId ?? null, stale: !!d.stale, title: d.title })));
    } catch { /* ignore */ }
  }, [projectId, diagramId]);
  useEffect(() => { void refreshDiagramSops(); }, [refreshDiagramSops]);
  // Create a brand-new catalog Risk/Control straight from the diagram (owner-gated
  // by the API), then refresh the catalog so it can be attached to the step.
  const onCreateRiskItem = useCallback(async (kind: "Risk" | "Control", name: string): Promise<RiskCatalogItem | null> => {
    if (!projectId || !riskLibraryId || !name.trim()) return null;
    try {
      const res = await fetch(`/api/projects/${projectId}/risk-controls/${riskLibraryId}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, name: name.trim() }),
      });
      if (!res.ok) return null;
      const j = await res.json();
      await refreshRiskCatalog();
      return j.item ? { id: j.item.id, code: j.item.code, name: j.item.name, kind: j.item.kind } : null;
    } catch { return null; }
  }, [projectId, riskLibraryId, refreshRiskCatalog]);

  // Persist a brand-new pool/lane name into the project structure, then
  // refresh local suggestions. Returns true on success.
  const addEntityNode = useCallback(async (
    listId: string, input: { name: string; level: EntityNodeLevel; parentId: string | null },
  ): Promise<boolean> => {
    if (!projectId) return false;
    try {
      const res = await fetch(`/api/projects/${projectId}/entity-lists/${listId}/nodes`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      if (!res.ok) return false;
      await loadEntityStructure();
      return true;
    } catch { return false; }
  }, [projectId, loadEntityStructure]);

  // Compute prev / next diagram in the SAME folder. Folder identification:
  //   - diagramFolderMap[currentId] → folderId. Missing → project root.
  //   - diagramOrder[folderId] gives the canonical UI order. Fallback when
  //     the array is missing or doesn't include the current diagram: use
  //     the FILTERED sibling list ordered by name, with the current
  //     diagram itself inserted in place.
  const folderMates = (() => {
    if (!projectId) return null;
    const allInProject = (() => {
      const list: { id: string; name: string }[] = siblingDiagrams.map(d => ({ id: d.id, name: d.name }));
      return list;
    })();
    const folderId = folderTree?.diagramFolderMap?.[diagramId] ?? null;
    // Diagrams in the same folder as the current one (or all at root if
    // the current is at root).
    const sameFolderIds = new Set<string>();
    if (folderTree?.diagramFolderMap) {
      for (const [id, fId] of Object.entries(folderTree.diagramFolderMap)) {
        if ((folderId === null && !fId) || fId === folderId) sameFolderIds.add(id);
      }
    }
    // Anything in the project not present in diagramFolderMap is at root.
    if (folderId === null) {
      for (const s of allInProject) {
        if (!folderTree?.diagramFolderMap || folderTree.diagramFolderMap[s.id] === undefined) {
          sameFolderIds.add(s.id);
        }
      }
      if (!folderTree?.diagramFolderMap || folderTree.diagramFolderMap[diagramId] === undefined) {
        sameFolderIds.add(diagramId);
      }
    }

    // Canonical order from diagramOrder if it covers this folder; else
    // alphabetical by name including the current diagram.
    const canonicalOrder = (folderId !== null
      ? folderTree?.diagramOrder?.[folderId]
      : folderTree?.diagramOrder?.root) ?? [];
    let ordered: string[];
    if (canonicalOrder.length > 0 && canonicalOrder.includes(diagramId)) {
      ordered = canonicalOrder.filter((id) => sameFolderIds.has(id));
      // Append any folder-mates missing from the canonical order (defensive).
      for (const id of sameFolderIds) if (!ordered.includes(id)) ordered.push(id);
    } else {
      // Include the current diagram with its REAL name so the alphabetical
      // sort places it correctly relative to its folder-mates. (Earlier
      // versions used a placeholder name like "(current)" which sorted to
      // index 0 and disabled the previous button on every navigation.)
      const withSelf = [
        ...siblingDiagrams.filter(d => sameFolderIds.has(d.id)).map(d => ({ id: d.id, name: d.name })),
        { id: diagramId, name: (diagramName ?? "").trim() },
      ];
      withSelf.sort((a, b) => a.name.localeCompare(b.name));
      ordered = withSelf.map(d => d.id);
    }

    const idx = ordered.indexOf(diagramId);
    if (idx === -1) return null;
    const prevId = idx > 0 ? ordered[idx - 1] : null;
    const nextId = idx < ordered.length - 1 ? ordered[idx + 1] : null;
    const nameOf = (id: string) =>
      siblingDiagrams.find(d => d.id === id)?.name ?? "(diagram)";
    return {
      prevId,
      nextId,
      prevName: prevId ? nameOf(prevId) : null,
      nextName: nextId ? nameOf(nextId) : null,
      position: idx + 1,
      total: ordered.length,
    };
  })();

  // Ref to saveNow so navigation callbacks can call it without stale closures
  const saveNowRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Ref for save status — populated after useAutoSave runs (below)
  const saveStatusRef = useRef<"saved" | "saving" | "unsaved">("saved");

  // Diagramatix-styled unsaved-changes dialog. Three outcomes: save+leave,
  // discard+leave, cancel (stay). Opened via showUnsavedDialog, resolved
  // when the user clicks a button. Replaces the window.confirm pattern that
  // never actually saved reliably.
  const [unsavedDialog, setUnsavedDialog] = useState<null | { resolve: (choice: "save" | "discard" | "cancel") => void }>(null);

  // BPMN lifecycle (Phase 1 of the publish plan). Mirrors the persisted
  // Diagram.lifecycle + currentPublishedVersion. Local state so the
  // header pill updates immediately after a successful publish without a
  // full router refresh. `isDiagramOwner` gates the publish button —
  // even project owners can't publish unless they're also the diagram
  // owner (CPS 230 accountability rule, server-enforced too).
  const isDiagramOwner = !!(currentUserId && initialDiagramOwner?.id === currentUserId);
  const [lifecycle, setLifecycle] = useState<"DRAFT" | "PUBLISHED" | "ARCHIVED">(initialLifecycle);
  const [currentPublishedVersion, setCurrentPublishedVersion] = useState<
    { versionNumber: number; publishedAt: string } | null
  >(initialCurrentPublishedVersion);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showPublishBundleDialog, setShowPublishBundleDialog] = useState(false);
  const [showSupportDialog, setShowSupportDialog] = useState(false);
  const [supportSentToast, setSupportSentToast] = useState(false);
  // Feedback panel (owner-only) — lists business-user feedback on this
  // published diagram and lets the owner triage it. Opens automatically
  // when arrived via a feedback-received notification (?feedback=1).
  const [showFeedbackPanel, setShowFeedbackPanel] = useState(openFeedbackPanel);

  // Save As dialog — clone the current diagram (data + colour/display config)
  // into the same project under a new name, then navigate to it.
  const [showSaveAs, setShowSaveAs] = useState(false);
  // Flowchart → BPMN translation (one-way; flowchart diagrams only).
  const [showTranslate, setShowTranslate] = useState(false);
  const [showEpcToBpmn, setShowEpcToBpmn] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  const [saveAsBusy, setSaveAsBusy] = useState(false);
  const [saveAsError, setSaveAsError] = useState<string | null>(null);
  async function handleSaveAs() {
    if (!saveAsName.trim() || saveAsBusy) return;
    setSaveAsBusy(true);
    setSaveAsError(null);
    try {
      const res = await fetch("/api/diagrams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveAsName.trim(),
          type: diagramType,
          projectId: projectId ?? undefined,
          data,
          colorConfig: diagramColorConfig,
          displayMode,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        setSaveAsError(err.error ?? "Save As failed");
        return;
      }
      const created = await res.json();
      setShowSaveAs(false);
      router.push(`/diagram/${created.id}`);
    } catch (err) {
      setSaveAsError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaveAsBusy(false);
    }
  }
  async function confirmSaveBeforeLeave(): Promise<"proceed" | "cancel"> {
    if (saveStatusRef.current !== "unsaved") return "proceed";
    const choice = await new Promise<"save" | "discard" | "cancel">(resolve => {
      setUnsavedDialog({ resolve });
    });
    setUnsavedDialog(null);
    if (choice === "cancel") return "cancel";
    if (choice === "save") await saveNowRef.current();
    return "proceed";
  }

  const handleDrillIntoSubprocess = useCallback(async (linkedDiagramId: string) => {
    if ((await confirmSaveBeforeLeave()) === "cancel") return;
    const stack = getDrillStack();
    stack.push({ id: diagramId, name: diagramName });
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack));
    // Invalidate the client Router Cache before leaving. Without this, a link
    // just set on THIS diagram (e.g. an ArchiMate Business Process → BPMN
    // link) is saved to the DB but the stale cached RSC payload is re-served
    // when the user drills back — the link/green marker appears to vanish.
    router.refresh();
    router.push(`/diagram/${linkedDiagramId}`);
  }, [router, diagramId, diagramName]);

  const handleDrillBack = useCallback(async () => {
    if ((await confirmSaveBeforeLeave()) === "cancel") return;
    const stack = getDrillStack();
    stack.pop();
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack));
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(projectId ? `/dashboard/projects/${projectId}` : "/dashboard");
    }
  }, [router, projectId]);

  // Back-link target + label. `?from=` (backFromHref) wins when present —
  // that's how a diagram opened from the dashboard's Published / Unorganised
  // sections returns to the dashboard rather than to the project it lives
  // in. Otherwise: project if the diagram has one, else dashboard.
  const backHref = backFromHref ?? (projectId ? `/dashboard/projects/${projectId}` : "/dashboard");
  const backLabel = backHref.includes("mining=")
    ? "MINER"                                              // returned from a Process Mining console
    : backHref.includes("api-harness")
      ? "Test Harness"                                     // opened from the Process API harness
    : backHref.includes("partner-api")
      ? "API Usage"                                        // opened from the Process API traffic screen
    : backHref.includes("diff-runs")
      ? "Diff Process Runs"                                // opened from an Admin Diff Process Runs screen
    : backHref.startsWith("/notifications") || backHref.includes("notifications=1")
      ? "Notifications"
      : backHref.startsWith("/dashboard/projects")
        ? "Project"
        : backHref.startsWith("/dashboard")
          ? "Dashboard"
          : "Back";

  const handleBackToProject = useCallback(async () => {
    if ((await confirmSaveBeforeLeave()) === "cancel") return;
    sessionStorage.removeItem(STACK_KEY);
    // Navigate to the resolved back target. `?from=` overrides the
    // project/dashboard default so dashboard-opened diagrams return to
    // the dashboard. Previously this fell through to router.back() which
    // walked browser history one diagram at a time — when the user had
    // clicked through several diagrams via the prev/next folder traversal,
    // "Back" would step through each visited diagram instead of jumping
    // straight to the target screen.
    router.push(backHref);
  }, [router, backHref]);

  const {
    data,
    addElement,
    moveElement,
    resizeElement,
    resizeElementEnd,
    updateLabel,
    beginLabelEdit,
    updateLabelLive,
    cancelLabelEdit,
    updateProperties,
    updatePropertiesBatch,
    setEventBoundary,
    deleteElement,
    addConnector,
    deleteConnector,
    updateConnectorDirection,
    updateConnectorType,
    reverseConnector,
    updateConnectorEndpoint,
    updateConnectorWaypoints,
    updateCurveHandles,
    connectorWaypointDragEnd,
    nudgeConnector,
    nudgeConnectorEndpoint,
    updateConnectorLabel,
    updateConnectorFields,
    updateDiagramTitle,
    setFontSize,
    setConnectorFontSize,
    setTitleFontSize,
    setPoolFontSize,
    setLaneFontSize,
    setProcessFontSize,
    setValueChainFontSize,
    setDescriptionFontSize,
    setDatabase,
    setDiagramPurpose,
    setDiagramDescription,
    toggleReviewCollapse,
    setAllReviewCollapsed,
    bringReviewToFront,
    setRelaxedLayout,
    setShowPainPoints,
    setShowPainPointDescriptions,
    setShowIssues,
    setShowIssueDescriptions,
    setShowReviewComments,
    rerouteAll,
    setProcessOwner,
    setProcedureDoc,
    setPcf,
    setAiFeedback,
    elementMoveEnd,
    flipForkJoin,
    convertTaskSubprocess,
    convertProcessCollapsed,
    convertEpToSubprocess,
    collapsePackage,
    convertEventType,
    addSelfTransition,
    splitConnector,
    applyTemplate,
    templateStillShowing,
    removeTemplate,
    alignElements,
    setData,
    clearDiagram,
    clearDiagramExcept,
    correctAllConnectors,
    insertSpace,
    removeSpace,
    addLane,
    addSublane,
    splitPoolEven,
    splitLaneEven,
    wrapInPool,
    movePoolTo,
    swapPools,
    dragTravellingIds,
    wrapInSubprocess,
    wrapInContainer,
    unwrapSubprocess,
    addPool,
    addLaneAt,
    compressPool,
    extendPools,
    reorderLane,
    moveLaneBoundary,
    moveVSwimlaneBoundary,
    laneBoundaryMoveEnd,
    moveElements,
    elementsMoveEnd,
    beginHistoryGroup,
    endHistoryGroup,
    swapLane,
    moveLane,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useDiagram(initialData);

  // Subscription element-count gate. addElementGated wraps the reducer's
  // addElement: when the user's tier sets a finite cap and the current
  // node count is at or above it, we show a brief toast banner and
  // refuse the add. Artifacts (data-object / data-store / text-
  // annotation) don't count toward the cap, so we let them through.
  const ARTIFACT_TYPES_GATED = new Set(["data-object", "data-store", "text-annotation"]);
  const [elementLimitToast, setElementLimitToast] = useState<string | null>(null);
  useEffect(() => {
    if (!elementLimitToast) return;
    const t = setTimeout(() => setElementLimitToast(null), 4000);
    return () => clearTimeout(t);
  }, [elementLimitToast]);
  const addElementGated: typeof addElement = (symbolType, position, taskType, eventType, id, initial) => {
    if (typeof elementCountLimit === "number" && !ARTIFACT_TYPES_GATED.has(symbolType)) {
      const nodes = data.elements.filter(e => !ARTIFACT_TYPES_GATED.has(e.type)).length;
      if (nodes >= elementCountLimit) {
        setElementLimitToast(
          `Element limit reached (${nodes}/${elementCountLimit}). Upgrade your subscription to add more.`,
        );
        return;
      }
    }
    addElement(symbolType, position, taskType, eventType, id, initial);
  };

  // Template edit state
  const [templateEditState, setTemplateEditState] = useState<{
    templateId: string;
    templateName: string;
    originalData: DiagramData;
  } | null>(null);

  // "Open view-only" from the co-authoring join prompt: a session-local override
  // that makes the editor behave read-only (no saves, no soft-locks) without the
  // page having been opened read-only. Derive `readOnly` from the prop OR this,
  // so every existing `readOnly` check downstream honours the choice unchanged.
  const [sessionViewOnly, setSessionViewOnly] = useState(false);
  const readOnly = readOnlyProp || sessionViewOnly;

  // UI-02: gates the autosave timer while previewing a history snapshot;
  // prePreviewDataRef holds the real diagram so a discard reverts the canvas.
  const [historyPreviewActive, setHistoryPreviewActive] = useState(false);
  const prePreviewDataRef = useRef<DiagramData | null>(null);
  // Manual-Sync (co-authoring) is decided below once presence is known; the ref
  // lets useAutoSave read it without a hook-ordering problem.
  const manualSyncRef = useRef(false);
  const { saveStatus, lastSavedAt, saveNow, syncNow, pullMerge, revertToSaved, conflict, acceptMerge, syncedData, committedVersion } = useAutoSave(diagramId, data, 1500, templateEditState !== null || !!readOnly || historyPreviewActive, dataVersion, manualSyncRef);
  // Sync button: pull everyone's committed changes, merge in ours, apply locally.
  const handleSync = useCallback(async () => {
    const merged = await syncNow();
    if (merged) setData(merged);
  }, [syncNow, setData]);
  const didFreshLoad = useRef(false);
  // Auto-align: a peer advanced the committed version → pull+merge (no push), so
  // one person's Sync brings the whole group into alignment.
  const handleAlign = useCallback(async () => {
    const merged = await pullMerge();
    if (merged) setData(merged);
  }, [pullMerge, setData]);
  // Auto-merge on conflict (Phase 1d): apply the three-way merge to the canvas
  // and resume — silently when there were no true overlaps, or with a dismissible
  // note listing how many elements you both changed (theirs kept).
  const [mergeNote, setMergeNote] = useState<{ count: number; editor: string | null } | null>(null);
  useEffect(() => {
    if (!conflict) return;
    setData(conflict.merged);
    acceptMerge();
    setMergeNote(conflict.conflicts.length > 0
      ? { count: conflict.conflicts.length, editor: conflict.lastEditor }
      : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflict]);
  saveNowRef.current = saveNow;
  saveStatusRef.current = saveStatus;
  const effectiveUpdatedAt = lastSavedAt ?? updatedAt;

  // Warn user about unsaved changes when leaving the page
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (saveStatus === "unsaved") {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveStatus]);

  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      // Tier-1 assist: Tab accepts the primary next-step ghost.
      if (e.key === "Tab" && !e.shiftKey && nextStepRef.current.candidates.length > 0) {
        e.preventDefault();
        nextStepRef.current.accept(nextStepRef.current.candidates[0]);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        // UI-01: this effect's deps are [undo, redo] (both stable), so it runs
        // once on mount and would capture the FIRST-render saveNow — which closes
        // over the original initialData and overwrites edits. Use the ref, which
        // always points at the latest saveNow.
        void saveNowRef.current?.();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  const [pdfScale, setPdfScale] = useState(100);
  const [selectedElementIds, setSelectedElementIds] = useState<Set<string>>(new Set());
  // The selection as the command interpreter sees it ("delete these", "rename
  // the selected pool to Customer") — a ref, so the mic callback and an
  // in-flight AI call read the selection at the moment they apply.
  const selectedIdsRef = useRef<string[]>([]);
  selectedIdsRef.current = [...selectedElementIds];
  // Always-fresh element list, for callbacks that must not rebuild on every
  // edit — the mic opener reads it to build V1's keyterms at OPEN time.
  const elementsRef = useRef(data.elements);
  elementsRef.current = data.elements;
  // Likewise the connectors — the message rule reads which way an event with
  // no Flow Type already faces from them.
  const connectorsRef = useRef(data.connectors);
  connectorsRef.current = data.connectors;
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  // The selected connector as the command interpreter sees it ("label selected Yes").
  const selectedConnectorIdRef = useRef<string | null>(null);
  selectedConnectorIdRef.current = selectedConnectorId;

  // ── Co-authoring presence (Phase 1b/1c) ──
  // Selected element(s) double as an advisory soft-lock signal for other editors.
  const presenceSelection = useMemo(() => [...selectedElementIds], [selectedElementIds]);
  const collabEnabled = !!currentUserId && templateEditState === null && !historyPreviewActive;
  // Phase 2: live cursors only when the server has Liveblocks configured.
  const liveCursors = !!collabRealtime && collabEnabled;
  // Opt-in diagnostic overlay (SuperAdmin, `localStorage.collab-debug = "1"`).
  const [collabDebug, setCollabDebug] = useState(false);
  useEffect(() => {
    try { setCollabDebug(localStorage.getItem("collab-debug") === "1"); } catch { /* ignore */ }
  }, []);
  // Active (broadcasts my cursor + live edits) vs Viewer (watch only). Auto-swaps
  // by window focus so two sessions on ONE machine hand the cursor back and forth
  // automatically — the focused window is active, the others become viewers. The
  // toggle below is a manual override until the next focus change.
  const [collabActive, setCollabActive] = useState(true);
  useEffect(() => {
    if (!liveCursors) return;
    const update = () => setCollabActive(typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus());
    update();
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [liveCursors]);
  const { roster: presenceRoster, locks: presenceLocks } = usePresence(diagramId, {
    enabled: collabEnabled,
    userName: currentUserName,
    selection: presenceSelection,
    // A view-only session broadcasts presence (so others see you're here) but
    // holds no soft-locks — you're not editing anything.
    editingElementIds: readOnly ? [] : presenceSelection,
  });
  // Others present → MANUAL Sync mode (autosave off, push+pull on the button).
  const othersPresent = presenceRoster.some((m) => !m.isSelf);
  manualSyncRef.current = collabEnabled && othersPresent;

  // ── "Someone's already editing" prompt ──
  // On arrival, if others are ALREADY editing, ask whether to join the live
  // session or open view-only. Decided exactly once, on the first presence poll
  // that includes us (later arrivals are handled by the PresenceBar, not a
  // modal). Skipped when the page was opened read-only anyway.
  const [showJoinPrompt, setShowJoinPrompt] = useState(false);
  const joinPromptDecidedRef = useRef(false);
  useEffect(() => {
    if (joinPromptDecidedRef.current || !collabEnabled || readOnlyProp) return;
    if (!presenceRoster.some((m) => m.isSelf)) return; // wait for the first poll to land
    joinPromptDecidedRef.current = true;
    if (presenceRoster.some((m) => !m.isSelf)) setShowJoinPrompt(true);
  }, [collabEnabled, readOnlyProp, presenceRoster]);
  const otherEditorNames = useMemo(
    () => presenceRoster.filter((m) => !m.isSelf).map((m) => m.userName || "Someone"),
    [presenceRoster],
  );

  // Reload-fresh on entry: once co-authoring is live, re-fetch the committed
  // diagram so a session never starts from stale / un-synced local state.
  useEffect(() => {
    if (!collabEnabled || readOnly || didFreshLoad.current) return;
    didFreshLoad.current = true;
    void (async () => { const s = await revertToSaved(); if (s) setData(s); })();
  }, [collabEnabled, readOnly, revertToSaved, setData]);

  // Soft lock: an element another editor is holding is not editable by us.
  const isCoLocked = useCallback((id: string) => !!presenceLocks[id], [presenceLocks]);
  const [pendingDragSymbol, setPendingDragSymbol] = useState<SymbolType | null>(null);
  const [pendingArchimateShapeKey, setPendingArchimateShapeKey] = useState<string | null>(null);
  const [pendingArchimateIconOnly, setPendingArchimateIconOnly] = useState<boolean>(false);
  const [projectColorConfig, setProjectColorConfig] = useState<SymbolColorConfig | undefined>(undefined);
  const [diagramColorConfig, setDiagramColorConfig] = useState<SymbolColorConfig>(initialDiagramColorConfig ?? {});
  const [displayMode, setDisplayMode] = useState<DisplayMode>(initialDisplayMode ?? "normal");
  // Domain UML connector routing is now permanently STICKY (settled default) —
  // the experimental A/B toggle was removed.
  const [showDiagramMaintenance, setShowDiagramMaintenance] = useState(false);
  // Deterministic "Process description" — a structured plain-text walk of the current
  // diagram (buildPromptFromDiagram). Always available, no AI, so AI-off tenants still
  // get a readable narrative. Holds the generated text while the modal is open.
  const [processDescription, setProcessDescription] = useState<string | null>(null);
  const [descriptionCopied, setDescriptionCopied] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  // SuperAdmin model-comparison matrix for this diagram — seeded from the saved
  // column on load, updated after a fresh "Compare all models". Drives the
  // "AI Comparison Results" button + modal.
  const [aiComparison, setAiComparison] = useState<unknown>(
    initialAiComparison && typeof initialAiComparison === "object"
      && (initialAiComparison as { models?: unknown }).models
      ? initialAiComparison : null,
  );
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [confirmClearComparison, setConfirmClearComparison] = useState(false);
  // Clear the stored AI comparison so its toolbar button + modal go away.
  const clearComparison = useCallback(async () => {
    setConfirmClearComparison(false);
    try {
      const res = await fetch(`/api/ai/generate-bpmn/compare?diagramId=${encodeURIComponent(diagramId)}`, { method: "DELETE" });
      if (res.ok) { setAiComparison(null); setShowComparisonModal(false); }
    } catch { /* leave the results in place on failure */ }
  }, [diagramId]);
  const [aiPanelGenerating, setAiPanelGenerating] = useState(false);
  const [aiPanelNarrativeGenerating, setAiPanelNarrativeGenerating] = useState(false);
  const [showPlanPanel, setShowPlanPanel] = useState(false);
  /**
   * The NEW AI Generate console — the same feature on a full screen instead of
   * in the 384px sidebar. It runs BESIDE the sidebar panel, not instead of it,
   * so the two can be compared on the same diagram while the replacement is
   * judged. BPMN only for now (see `ai-generate/AiGenerateScreen.tsx`).
   */
  const [showAiGenerateScreen, setShowAiGenerateScreen] = useState(false);
  // Tier-1 assist (ghost next-step suggestions) is OPT-IN — off until the user
  // turns it on. Remembered per-diagram in localStorage.
  const [assistEnabled, setAssistEnabled] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [showAnimate, setShowAnimate] = useState(false);
  // SuperAdmin: wipe every simulation annotation on this diagram, for repeat
  // testing of Fill-missing / seeding from a clean slate.
  const [confirmClearSim, setConfirmClearSim] = useState(false);
  const [clearSimMsg, setClearSimMsg] = useState<string | null>(null);
  // BPMN and Standard Flowchart both use the 2-phase Plan panel (plan → edit →
  // apply deterministic layout). Other types use the legacy one-shot AI panel.
  // Registry, not a chain of ||: see app/lib/ai/planTypes.ts.
  const usesPlanPanel = usesPlanFlow(diagramType);
  // Coming back from the User Guide: re-open the console the reader left, so
  // "return" means the screen AND the state they invoked from, not just the
  // page with the console shut (Paul, 2026-09-13).
  useReopenFromGuide("ai-generate", () => setShowAiGenerateScreen(true));
  useReopenFromGuide("simulator", () => setShowSimulator(true));
  // Regenerate prefill: when the user hits "Regenerate" in Diagram Properties we
  // open the AI/Plan panel with the linked prompt's CURRENT text + a chosen model.
  /**
   * Has the prompt this diagram came from moved on since?
   *
   * Asked once per diagram, of the server, because the answer lives in the
   * Process Repository rather than in the diagram — the diagram only knows when
   * IT was made. Failing quietly is right: a missing warning is a smaller harm
   * than an editor that will not open.
   */
  const [promptFacts, setPromptFacts] = useState<{
    promptRegeneratedAt: string | null; currentTemplateVersion: number | null;
    checkedPromptId: string | null; checkedPromptHasPlan: boolean;
    promptModel: string | null; processCode: string | null;
  } | null>(null);
  useEffect(() => {
    if (!data.aiGeneration) { setPromptFacts(null); return; }
    let live = true;
    void (async () => {
      try {
        const res = await fetch(`/api/diagrams/${diagramId}/freshness`, { cache: "no-store" });
        if (!res.ok) return;
        const j = await res.json();
        if (live) setPromptFacts(j);
      } catch { /* a warning we could not fetch is not worth an error */ }
    })();
    return () => { live = false; };
    // Only the library's side is fetched, so this need not re-run on every edit.
  }, [diagramId, data.aiGeneration?.promptId]);

  /**
   * Paul, 2026-09-06: "This does not go away after diagram is regenerated, it
   * does go away after leaving and re-entering the diagram. Clear it immediately
   * on regeneration."
   *
   * It was computed entirely on the server, which reads the diagram from the
   * DATABASE — and after an in-editor regeneration the new timestamp is in local
   * state, not yet auto-saved. So the server truthfully answered a question
   * about the previous version, and kept doing so until the save landed.
   *
   * Split by who knows what: the server supplies the library's side (when the
   * prompt was last regenerated, which version is current), and the diagram's
   * own side is read from LIVE state. Regenerating then clears it on the same
   * render, with no round trip at all.
   */
  const aiFreshness = useMemo(() => {
    const gen = data.aiGeneration;
    if (!gen || !promptFacts) return [];
    return diagramFreshness({
      diagramGeneratedAt: gen.generatedAt,
      promptRegeneratedAt: promptFacts.promptRegeneratedAt,
      templateVersionAtGeneration: gen.source?.templateVersion ?? null,
      currentTemplateVersion: promptFacts.currentTemplateVersion,
      // A plan on the diagram is the answer. Failing that, one on the linked
      // Prompt still counts — that is where the editor used to put it, so most
      // existing diagrams have it there and nothing is wrong with them. Only
      // trusted while the diagram still points at the prompt the server checked.
      hasPlan: !!gen.plan
        || (promptFacts.checkedPromptHasPlan && promptFacts.checkedPromptId === gen.promptId),
    });
  }, [data.aiGeneration, promptFacts]);

  const [aiPrefill, setAiPrefill] = useState<{ prompt: string; model: string } | null>(null);
  // Armed by applyAiResult after a generation; the next canvas click dismisses the AI panel.
  const aiJustGeneratedRef = useRef(false);

  // Link/auto-save the Prompt that generated this diagram, returning its id+name.
  // Rules (Paul, 2026-07-26 — "auto-save a Prompt every time"):
  //   • generated from an UNCHANGED saved Prompt → link to it, never overwrite;
  //   • else reuse this diagram's own auto-created Prompt (update its text) or
  //     create one (auto-named from the diagram title). One linked prompt per diagram.
  const ensureLinkedPrompt = useCallback(async (
    meta: AiApplyMeta,
  ): Promise<{ id: string; name: string; autoNamed: boolean } | null> => {
    try {
      if (meta.selectedPromptId && meta.selectedPromptUnchanged) {
        return { id: meta.selectedPromptId, name: meta.selectedPromptName ?? "Saved prompt", autoNamed: false };
      }
      const prev = data.aiGeneration;
      const autoName = `${(diagramName || "Untitled").trim()} — AI prompt`;
      // Auto-persist the generated plan (when the generator supplied one) onto
      // the linked Prompt so the diagram retains its plan for re-layout /
      // inspection without re-calling the model. Only auto-named prompts are
      // (over)written — a user's own saved Prompt is never modified.
      const planField = meta.planJson ? { planJson: meta.planJson } : {};
      if (prev?.promptId && prev.autoNamed) {
        await fetch(`/api/prompts/${prev.promptId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: meta.promptText, ...planField }),
        });
        return { id: prev.promptId, name: prev.promptName, autoNamed: true };
      }
      const res = await fetch(`/api/prompts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: autoName, text: meta.promptText, diagramType, ...planField,
          // Whatever the panel knew. Omitted fields stay NULL rather than
          // defaulting to "typed" — an auto-created prompt whose provenance
          // nobody reported is genuinely unknown.
          ...(meta.promptSource ? { source: meta.promptSource } : {}),
          ...(meta.promptFromImage ? { fromImage: true } : {}),
          ...(meta.promptRefined ? { refined: true } : {}),
        }),
      });
      if (!res.ok) return null;
      const created = await res.json();
      return { id: created.id as string, name: (created.name as string) ?? autoName, autoNamed: true };
    } catch { return null; }
  }, [data.aiGeneration, diagramName, diagramType]);

  // Apply an AI-generated result — shared by AiPanel + PlanPanel. Replaces the
  // diagram, and (when generation metadata is present) links the Prompt and
  // (over)writes the left-of-centre "AI Prompt: … Generated on: …" annotation.
  const applyAiResult = useCallback(async (aiData: DiagramData, meta?: AiApplyMeta) => {
    let aiGeneration = data.aiGeneration;
    if (meta) {
      const linked = await ensureLinkedPrompt(meta);
      if (linked) {
        // Every generable type funnels through here, from both the one-shot
        // panel and the two-phase one — so this is the only place usage has to
        // be recorded. Fire-and-forget: the diagram is already on screen, and
        // losing a count must never cost somebody their work.
        void fetch(`/api/prompts/${linked.id}/used`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: meta.model }),
        }).catch(() => {});
        aiGeneration = {
          promptId: linked.id, promptName: linked.name, promptText: meta.promptText,
          model: meta.model, generatedAt: new Date().toISOString(), autoNamed: linked.autoNamed,
          // Keep the plan ON THE DIAGRAM. It was only ever written to the linked
          // Prompt, so regenerating in the editor silently dropped the diagram's
          // own copy — and the Properties panel then said, correctly by its own
          // reading and uselessly to anyone looking at it, that the diagram it
          // had just regenerated had no plan.
          ...(meta.planJson ? { plan: meta.planJson } : {}),
          // A regeneration does not change WHICH repository prompt this diagram
          // came from. Dropping the stamp lost the template-version warning for
          // good the first time anyone regenerated.
          ...(data.aiGeneration?.source ? { source: data.aiGeneration.source } : {}),
        };
      }
    }
    const prevAnnotation = data.elements.find((e) => e.id === AI_PROMPT_ANNOTATION_ID) ?? null;
    let elements = stripPromptAnnotations(aiData.elements);
    // The on-canvas prompt annotation is OFF by default now — only add it when the
    // user has explicitly ticked "Show original generation prompt".
    if (aiGeneration && meta && data.showAiPromptAnnotation === true) {
      elements = [buildPromptAnnotation(
        { name: aiGeneration.promptName, text: aiGeneration.promptText, generatedAt: aiGeneration.generatedAt },
        contentBBox(elements),
        prevAnnotation,
      ), ...elements];
    }
    setData({
      ...data,
      elements,
      // Drop the legacy R56 association that linked the old "AI Generated" note
      // to the start event — its note element is stripped above, so the line
      // would otherwise dangle.
      connectors: stripPromptAnnotationConnectors(aiData.connectors),
      viewport: aiData.viewport ?? data.viewport,
      relaxedLayout: aiData.relaxedLayout,
      aiGeneration,
    });
    // Arm the "first canvas click dismisses the AI panel" behaviour (only for a real
    // generation, i.e. when meta is present).
    if (meta) aiJustGeneratedRef.current = true;
    requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("dgx:fitToContent")));
  }, [data, setData, ensureLinkedPrompt]);

  // After an AI generation, the FIRST click on the canvas (select an element,
  // click a connector, or click empty space) closes the still-open AI/Plan panel —
  // revealing the Diagram Properties (and Element Properties if an element was
  // clicked). Wraps the Canvas selection callbacks below.
  const dismissAiPanelOnCanvasClick = useCallback(() => {
    if (!aiJustGeneratedRef.current) return;
    aiJustGeneratedRef.current = false;
    setShowAiPanel(false);
    setShowPlanPanel(false);
    setAiPrefill(null);
  }, []);

  // Show/hide the on-canvas AI-Prompt annotation (any diagram type). Hiding removes
  // the element; showing rebuilds it from aiGeneration, left-of-centre.
  const toggleAiPromptAnnotation = useCallback((show: boolean) => {
    const gen = data.aiGeneration;
    // Where the note is NOW, before it is stripped. Rebuilding from the content
    // box would move it back to the left margin and reset its width, discarding
    // wherever the user dragged it to.
    const prev = data.elements.find((e) => e.id === AI_PROMPT_ANNOTATION_ID) ?? null;
    let elements = stripPromptAnnotations(data.elements);
    if (show && gen) {
      elements = [buildPromptAnnotation(
        { name: gen.promptName, text: gen.promptText, generatedAt: gen.generatedAt },
        contentBBox(elements),
        prev,
      ), ...elements];
    }
    setData({ ...data, elements, showAiPromptAnnotation: show });
  }, [data, setData]);
  const featureScheme = useFeatureColors();
  const orgPolicy = useOrgPolicy(); // enterprise governance — hide AI when the org disables it
  const sharePointAvailable = useSharePointAvailable(); // grey SharePoint menus when unconfigured / org-disabled
  // The Simulator (Matrix-style process simulation) is offered for BPMN.
  const supportsSimulator = diagramType === "bpmn";
  const [showSendReview, setShowSendReview] = useState(false);
  const [showProcessDiff, setShowProcessDiff] = useState(false);
  // File-preview pop-up (for demonstrating exports on camera during a screencast).
  const [previewPayload, setPreviewPayload] = useState<PreviewPayload | null>(null);
  const [reviewSentMsg, setReviewSentMsg] = useState<string | null>(null);

  // Review Mode — active when the diagram was opened from a Received-for-
  // Review tile (?review=<reviewId>). Surfaces the review-comment symbol,
  // a context banner, and Submit/Decline.
  const searchParams = useSearchParams();
  const reviewIdParam = searchParams.get("review");
  // Deep-link from the Risk & Control screen: focus a step (?rcElement=…) and,
  // if present, offer a "← Risk & Controls" return to that project's console
  // (?rcReturn=<projectId>).
  const rcElementParam = searchParams.get("rcElement");
  const rcReturnParam = searchParams.get("rcReturn");
  const [reviewCtx, setReviewCtx] = useState<{
    reviewId: string; diagramId: string; objective: string; dueDate: string; status: string;
    requesterName: string; requesterEmail: string; isRequester: boolean;
    myStatus: string | null; myUserId: string; myName: string | null; myEmail: string | null;
  } | null>(null);
  const [reviewActionMsg, setReviewActionMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!reviewIdParam) { setReviewCtx(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/reviews/${reviewIdParam}`);
        if (!res.ok) return;
        const ctx = await res.json();
        if (!cancelled) setReviewCtx(ctx);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [reviewIdParam]);

  // On arrival from the R&C screen, once the target step exists in the loaded
  // diagram: select it, open the (sticky) Risk & Controls panel so the rings
  // show, and centre the canvas on it. Runs once per rcElement.
  const rcFocusedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!rcElementParam || rcFocusedRef.current === rcElementParam) return;
    if (!data.elements.some((el) => el.id === rcElementParam)) return;
    rcFocusedRef.current = rcElementParam;
    setSelectedElementIds(new Set([rcElementParam]));
    toggleRcSection(true);
    // Defer the centre so the canvas has mounted + measured its viewport.
    const t = setTimeout(() => window.dispatchEvent(new CustomEvent("dgx:centerElement", { detail: { id: rcElementParam } })), 120);
    return () => clearTimeout(t);
  }, [rcElementParam, data.elements, toggleRcSection]);

  const reviewMode = !!reviewCtx && !reviewCtx.isRequester;

  // Feedback mode — a VIEW-only project share. The shared diagram stays
  // read-only, but the recipient may drop pink Review markers, tether them to
  // elements, and Send Feedback (each note → a DiagramFeedback row for the
  // owner). The markers live only in local state (autosave is off in readOnly),
  // so they never alter the shared diagram (item 6).
  const feedbackMode = !!readOnly && !!canGiveFeedback;
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  useEffect(() => {
    if (!feedbackToast) return;
    const t = setTimeout(() => setFeedbackToast(null), 6000);
    return () => clearTimeout(t);
  }, [feedbackToast]);
  const isFeedbackNote = useCallback(
    (id: string) => data.elements.find((e) => e.id === id)?.type === "review-comment",
    [data.elements]
  );
  // Drop a blank pink note (tethered to the element under the drop, if any).
  const handleAddFeedbackComment = useCallback(
    (worldPos: { x: number; y: number }, targetElementId: string | null) => {
      const commentId = nanoid();
      const authorName = currentUserName ?? userEmail ?? "";
      const stamp = fmtReviewStamp(new Date());
      addElement("review-comment", worldPos, undefined, undefined, commentId, {
        label: "",
        width: reviewCommentWidth(authorName, stamp),
        height: REVIEW_COMMENT_H,
        properties: { feedbackAuthor: authorName, authorName, createdStamp: stamp },
      });
      if (targetElementId) {
        addConnector(commentId, targetElementId, "review-comment-link", "directed", "direct", "left", "right", undefined, undefined, true);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addElement, addConnector, currentUserName, userEmail]
  );
  // Author drops a Review Comment from the palette — stamp the bold header
  // (name + timestamp, item 10) and auto-tether it to the element under the drop.
  const handleAddAuthorReviewComment = useCallback(
    (worldPos: { x: number; y: number }, targetElementId: string | null) => {
      const commentId = nanoid();
      const authorName = currentUserName ?? userEmail ?? "";
      const stamp = fmtReviewStamp(new Date());
      addElementGated("review-comment", worldPos, undefined, undefined, commentId, {
        label: "",
        width: reviewCommentWidth(authorName, stamp),
        height: REVIEW_COMMENT_H,
        properties: { authorName, createdStamp: stamp },
      });
      if (targetElementId) {
        addConnector(commentId, targetElementId, "review-comment-link", "directed", "direct", "left", "right", undefined, undefined, true);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addConnector, currentUserName, userEmail]
  );
  // Post every non-empty pink note as feedback (body = note text, anchored to
  // its tethered element), then clear the sent notes from the local canvas.
  const handleSendFeedback = useCallback(async () => {
    const withText = data.elements.filter((e) => e.type === "review-comment" && (e.label ?? "").trim().length > 0);
    if (withText.length === 0) { setFeedbackToast("Add a note first — drop a pink marker, type your comment, then Send."); return; }
    setSendingFeedback(true);
    let ok = 0; let unpublished = false;
    for (const note of withText) {
      const link = data.connectors.find((c) => c.type === "review-comment-link" && (c.sourceId === note.id || c.targetId === note.id));
      const attachedElementId = link ? (link.sourceId === note.id ? link.targetId : link.sourceId) : null;
      try {
        const res = await fetch(`/api/diagrams/${diagramId}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: note.label, attachedElementId }),
        });
        if (res.ok) ok++;
        else if (res.status === 409) unpublished = true;
      } catch { /* keep going, report the tally */ }
    }
    setSendingFeedback(false);
    if (ok === 0 && unpublished) { setFeedbackToast("This diagram has no published version yet — ask the owner to publish it before sending feedback."); return; }
    if (ok > 0) {
      for (const note of withText) deleteElement(note.id);
      setFeedbackToast(`Sent ${ok} feedback note${ok === 1 ? "" : "s"} to the owner. Thank you!`);
    } else {
      setFeedbackToast("Could not send feedback — please try again.");
    }
  }, [data.elements, data.connectors, diagramId, deleteElement]);

  async function reviewStatusAction(action: "submit" | "decline" | "approve") {
    if (!reviewCtx) return;
    try {
      const res = await fetch(`/api/reviews/${reviewCtx.reviewId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) return;
      const d = await res.json();
      setReviewCtx((prev) => (prev ? { ...prev, myStatus: d.status } : prev));
      setReviewActionMsg(
        action === "decline" ? "You declined this review."
        : action === "approve" ? "Approved — thank you!"
        : "Comments submitted — thank you!",
      );
    } catch { /* ignore */ }
  }

  // Owner-side reviewer filter — show all / none / a single reviewer's
  // review-comments on the canvas. Distinct commenters are derived from
  // the review-comment elements already on the diagram.
  const [reviewFilter, setReviewFilter] = useState<string>("all");
  const reviewCommenters = useMemo(() => {
    const seen = new Map<string, string>();
    for (const el of data.elements) {
      if (el.type !== "review-comment") continue;
      const id = (el.properties?.reviewerId as string | undefined) ?? "";
      if (!id || seen.has(id)) continue;
      seen.set(id, (el.properties?.reviewerName as string | undefined) ?? "Reviewer");
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [data.elements]);

  // What the canvas actually renders. When a filter is active we drop the
  // hidden review-comment elements AND their review-comment-link
  // connectors — never any real diagram content, and never the saved
  // `data` (autosave/export keep the full set).
  const displayData = useMemo(() => {
    if (reviewFilter === "all") return data;
    const hiddenIds = new Set(
      data.elements
        .filter((el) => el.type === "review-comment" &&
          (reviewFilter === "none" || (el.properties?.reviewerId as string | undefined) !== reviewFilter))
        .map((el) => el.id),
    );
    if (hiddenIds.size === 0) return data;
    return {
      ...data,
      elements: data.elements.filter((el) => !hiddenIds.has(el.id)),
      connectors: data.connectors.filter((c) =>
        c.type !== "review-comment-link" || (!hiddenIds.has(c.sourceId) && !hiddenIds.has(c.targetId))),
    };
  }, [data, reviewFilter]);
  // Mirror of PlanPanel's `busy` state so we can overlay a centred
  // wait indicator on the canvas while Sonnet plans. Sidebar banner
  // alone is easy to miss when the user's eyes are on the diagram.
  const [aiBusy, setAiBusy] = useState<"plan" | "apply" | "save" | "load" | "narrative" | "compare" | "refine" | null>(null);
  // Audio / transcript acquisition phase (from either AI panel) — drives the
  // same big canvas throbber overlay as plan generation, so the wait cue is
  // just as visible while a recording / file is transcribed or tidied.
  const [audioPhase, setAudioPhase] = useState<null | "transcribing" | "reading" | "tidying">(null);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  // SuperAdmin experiment (item 7): route ALL connectors as plain rectilinear,
  // no obstacle avoidance. The routing flag is a module global, so we set it
  // from this diagram's stored value on mount (below) and on every toggle.
  const [noObstacleAvoidance, setNoObstacleAvoidanceState] = useState(false);
  // Value Display and Bottleneck Display are ON by default. The user can
  // turn them off, in which case the explicit "false" value is read back
  // from localStorage on subsequent loads. Absence of the key keeps the
  // default ON.
  const [showValueDisplay, setShowValueDisplay] = useState(true);
  const [showBottleneck, setShowBottleneck] = useState(true);
  // Process-Context "Highlight" focus mode: when ON (default), selecting an
  // element dims everything except it + what it connects to. Toggled by the
  // top-panel Highlight button; persisted per diagram.
  const [highlightEnabled, setHighlightEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try { const v = localStorage.getItem(`pcHighlight-${diagramId}`); return v === null ? true : v === "true"; }
    catch { return true; }
  });
  const toggleHighlight = () => setHighlightEnabled((v) => {
    const nv = !v;
    try { localStorage.setItem(`pcHighlight-${diagramId}`, String(nv)); } catch { /* ignore */ }
    return nv;
  });
  useEffect(() => {
    if (localStorage.getItem(`debug-${projectId}`) === "true") setDebugMode(true);
    // Sync the routing module flag to THIS diagram's stored experiment value
    // (explicitly both ways, so a leftover from another diagram is cleared).
    // Fall back to the diagram's persisted `noObstacles` flag (set when an
    // ArchiMate diagram is generated) when there's no per-diagram localStorage.
    const storedNoObs = localStorage.getItem(`noObstacles-${diagramId}`);
    const noObs = storedNoObs != null ? storedNoObs === "true" : data.noObstacles === true;
    setNoObstacleAvoidanceState(noObs);
    setNoObstacleAvoidance(noObs);
    if (localStorage.getItem(`valueDisplay-${diagramId}`) === "false") setShowValueDisplay(false);
    if (localStorage.getItem(`bottleneck-${diagramId}`) === "false") setShowBottleneck(false);
    // Assist is opt-in: on only if the user previously turned it on here.
    setAssistEnabled(localStorage.getItem(`assist-${diagramId}`) === "true");
  }, [projectId, diagramId]);

  // Template state (BPMN only)
  const isAdmin = userEmail?.toLowerCase() === "paul@nashcc.com.au";
  // SuperAdmin "presentation mode" — double-click the logo to cycle view modes
  // (superadmin → orgadmin → expert → professional → introductory). No-op for non-SuperAdmins.
  const { mode: adminViewMode, hidden: superAdminHidden, toggle: toggleSuperAdminChrome } = useSuperAdminChrome(isAdmin);
  // In a SuperAdmin tier-preview view, hide the tier's excluded features (Simulator
  // / Risk & Controls) from the diagram's menus + panel. null → real access unchanged.
  const viewEnt = viewModeEntitlements(adminViewMode);
  const rcAllowed = viewEnt ? viewEnt.riskControl : true;
  const simAllowed = viewEnt ? viewEnt.simulator : true;
  // Enterprise policy binds everyone EXCEPT an active (non-presenting) SuperAdmin.
  // So a SuperAdmin keeps AI; "Hide SuperAdmin" makes the org policy take effect
  // live (updates as the toggle flips — handy for demoing Org Settings).
  const policyBindsMe = !isAdmin || superAdminHidden;
  const aiAllowedHere = orgPolicy.allowAi || !policyBindsMe;
  // "Effectively a SuperAdmin right now" — a real SuperAdmin who has NOT toggled
  // the logo down to a lower (OrgAdmin / Normal) view mode. Gate SuperAdmin-only
  // menu options on this so they vanish when a SuperAdmin drops into a lower view.
  const isActingAdmin = isAdmin && !superAdminHidden;
  // Voice Assist is available to Expert subscriptions and above (Paul,
  // 2026-09-17), not SuperAdmin-only as it was while it settled down. The
  // `voice-assist` key has been in the feature registry and seeded expert +
  // enterprise since Phase 1 — nothing had ever read it. This is the first
  // reader; the route gate on /api/ai/command is the half that actually
  // enforces it, since anything here is only a matter of which buttons show.
  //
  // The second clause is for a SuperAdmin previewing a customer tier: the
  // server hands an admin every feature, so without it the wand would stay put
  // while pretending to be an Introductory user, which defeats the preview.
  const voiceAssistFeature = useFeatureState("voice-assist");
  const voiceAssistAllowed =
    voiceAssistFeature === "available" &&
    (!isAdmin || atLeastTier(adminViewMode, "expert"));
  // Generate models the current user may pick (cost-gated; SA-in-mode = all).
  const { models: aiModels, current: currentAiModel } = useAllowedModels(isActingAdmin);
  // "Regenerate" from Diagram Properties: pull the linked prompt's CURRENT text and
  // open the AI/Plan panel prefilled with it + the chosen model.
  const handleRegenerate = useCallback(async (model: string) => {
    const gen = data.aiGeneration;
    if (!gen) return;
    let promptText = gen.promptText;
    try {
      const res = await fetch(`/api/prompts/${gen.promptId}`);
      if (res.ok) { const p = await res.json(); if (typeof p.text === "string" && p.text.trim()) promptText = p.text; }
    } catch { /* fall back to the snapshot text */ }
    setAiPrefill({ prompt: promptText, model });
    if (usesPlanPanel) { setShowPlanPanel(true); setShowAiPanel(false); }
    else { setShowAiPanel(true); setShowPlanPanel(false); }
  }, [data.aiGeneration, usesPlanPanel]);
  type TemplateRow = { id: string; name: string; group: string | null; description?: string | null; thumbnailSvg?: string | null; hasContainer?: boolean; hasWhiteBoxPool?: boolean };
  const [userTemplates, setUserTemplates] = useState<TemplateRow[]>([]);
  const [builtInTemplates, setBuiltInTemplates] = useState<TemplateRow[]>([]);
  // Per-user collapse state, keyed `<scope>:<group-name>` (scope = "user"
  // or "builtin"). true = collapsed. Loaded from /api/templates/group-prefs
  // on mount and updated optimistically on every toggle.
  const [templateGroupCollapsed, setTemplateGroupCollapsed] = useState<Record<string, boolean>>({});
  // The row the mouse is resting on in the template menu. Paul, 2026-09-24:
  // "when the user hovers over the small icon in the drop down list display a
  // larger version to the right to allow the user to see the template in more
  // detail before choosing it." The list icon is 64×48 — enough to tell a
  // gateway from a loop, not enough to tell two loops apart.
  const [templateHover, setTemplateHover] = useState<TemplateRow | null>(null);
  // Which template (if any) is showing a "Move to group..." submenu, and
  // whether it's in the typed-new-group mode.
  const [templateMoveMenu, setTemplateMoveMenu] = useState<{
    templateId: string;
    scope: "user" | "builtin";
    currentGroup: string | null;
    typing: boolean;
    typedName: string;
  } | null>(null);
  const [templateMode, setTemplateMode] = useState<"idle" | "capturing" | "capturing-builtin" | "editing">("idle");
  const [deletingTemplateIds, setDeletingTemplateIds] = useState<Set<string>>(new Set());
  const [templateImportInfo, setTemplateImportInfo] = useState<
    { title: string; lines: string[] } | null
  >(null);
  const [templateDeleteConfirm, setTemplateDeleteConfirm] = useState<
    { id: string; name: string; isBuiltIn: boolean } | null
  >(null);
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
  // builtInDropdownOpen removed — merged into single Templates dropdown
  const [showTemplateNameModal, setShowTemplateNameModal] = useState(false);
  const [pendingTemplateData, setPendingTemplateData] = useState<TemplateData | null>(null);
  const getViewportCenterRef = useRef<(() => Point) | null>(null);
  // Imperative handle for the "Space" toolbar button — Canvas populates
  // this with startInsert / startRemove (places the markers at the
  // viewport centre). See Canvas spaceActionRef.
  const spaceActionRef = useRef<{ startInsert: () => void; startRemove: () => void } | null>(null);
  const templateDropdownRef = useRef<HTMLDivElement>(null);

  // Alignment dropdown state
  const [alignDropdownOpen, setAlignDropdownOpen] = useState(false);
  const alignDropdownRef = useRef<HTMLDivElement>(null);
  // Resize dropdown state
  const [resizeDropdownOpen, setResizeDropdownOpen] = useState(false);
  const resizeDropdownRef = useRef<HTMLDivElement>(null);
  // Publish dropdown state — consolidates lifecycle status + Publish
  // version + Publish bundle under one B&W trigger.
  // Space dropdown state — Insert Space / Remove Space (BPMN + state-machine).
  const [spaceDropdownOpen, setSpaceDropdownOpen] = useState(false);
  const [showSopDialog, setShowSopDialog] = useState(false);
  const [sopInitial, setSopInitial] = useState<{ scope?: "lane" | "pool"; elementId?: string }>({});
  const spaceDropdownRef = useRef<HTMLDivElement>(null);

  // File menu state (Export, Import, PDF scale popover)
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  // Which submenu (Export ▶ / Import ▶) is currently expanded.
  const [fileSubmenu, setFileSubmenu] = useState<"export" | "import" | null>(null);
  const [pendingPdfScale, setPendingPdfScale] = useState(100);
  // Export annotation options (items M): which of Review Comments / Pain Points
  // / Issues to INCLUDE (default none), the pending dialog format, and a
  // transient hide-override applied to the canvas during SVG/PDF DOM capture.
  const [exportDlg, setExportDlg] = useState<null | "svg" | "pdf" | "json">(null);
  const [exportInc, setExportInc] = useState<AnnotationInclude>(NO_ANNOTATIONS);
  const [exportHide, setExportHide] = useState<{ reviewComments?: boolean; painPoints?: boolean; issues?: boolean } | null>(null);
  // SuperAdmin "Diagram Bundle" export result/error message (AlertDialog).
  const [bundleMsg, setBundleMsg] = useState<string | null>(null);
  const importJsonInputRef = useRef<HTMLInputElement>(null);
  const importXmlInputRef = useRef<HTMLInputElement>(null);
  const importTemplatesInputRef = useRef<HTMLInputElement>(null);
  const importVisioInputRef = useRef<HTMLInputElement>(null);
  const importBpmnInputRef = useRef<HTMLInputElement>(null);
  const importAmlInputRef = useRef<HTMLInputElement>(null);
  // SharePoint save/open: the picker (null = closed), a busy flag while
  // uploading/downloading, and a result message shown via AlertDialog.
  // Import-from-SharePoint: which format the user chose (filters the picker).
  const [spOpenFmt, setSpOpenFmt] = useState<null | "json" | "xml" | "visio" | "bpmn">(null);
  // Which diagram format is being saved to SharePoint (drives the folder picker).
  const [spSaveFormat, setSpSaveFormat] = useState<null | "pdf" | "svg" | "json" | "xml" | "visio">(null);
  // File-menu navigation: chosen destination (Local/SharePoint) under Export/Import.
  const [menuDest, setMenuDest] = useState<null | "local" | "sharepoint">(null);
  const [spBusy, setSpBusy] = useState(false);
  const [spMessage, setSpMessage] = useState<{ title: string; body: string; tone: "info" | "error" } | null>(null);
  // Linking a SharePoint file to a Data Object / Store: the element being
  // linked (picker opens in file mode), and the file currently being previewed.
  const [spLinkElId, setSpLinkElId] = useState<string | null>(null);
  const [spPreview, setSpPreview] = useState<{ driveId: string; itemId: string; name: string; webUrl?: string } | null>(null);
  // Reset the Export destination choice whenever the Export submenu closes, so
  // it always reopens at the Local/SharePoint step.
  useEffect(() => { if (fileSubmenu === null) setMenuDest(null); }, [fileSubmenu]);
  // Esc steps back one level (format → Local/SharePoint → Export/Import → close).
  useEffect(() => {
    if (!fileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); e.stopPropagation();
      if (menuDest) setMenuDest(null);
      else if (fileSubmenu) setFileSubmenu(null);
      else setFileMenuOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [fileMenuOpen, fileSubmenu, menuDest]);
  // Close the whole File menu and reset its navigation.
  const closeFm = () => { setFileMenuOpen(false); setFileSubmenu(null); setMenuDest(null); };
  // Admin-only: prompt the admin to pick the destination list when
  // exporting or importing templates. Non-admins skip the prompt.
  const [templateExportPrompt, setTemplateExportPrompt] = useState(false);
  const [templateImportFile, setTemplateImportFile] = useState<File | null>(null);
  const [visioImportStatus, setVisioImportStatus] = useState<VisioImportResult | null>(null);
  // Pending Visio import awaiting the user's overwrite-vs-create decision.
  // Set when the chosen .vsdx file's basename matches the current
  // diagram's name; cleared by the ConfirmDialog's Cancel / OK handlers
  // (which kick off the right runner for the file kind). The same state
  // covers both Visio (.vsdx) and BPMN (.bpmn) imports — the dialog
  // branches on `kind`.
  const [pendingVisioImport, setPendingVisioImport] = useState<
    { file: File; baseName: string; kind?: "visio" | "bpmn" } | null
  >(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState<null | "all" | "unselected">(null);
  // Pending import confirmation: holds the parsed-first-diagram payload
  // and the message to show. The dialog's Confirm handler applies it.
  // Replaces a pair of native window.confirm() prompts that the user
  // found jarring next to the rest of the Diagramatix-styled dialogs.
  const [pendingImport, setPendingImport] = useState<null | {
    message: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apply: () => void;
  }>(null);
  const [clearMenuOpen, setClearMenuOpen] = useState(false);
  const clearMenuRef = useRef<HTMLDivElement>(null);
  // Per-diagram "Scan for Issues" (BPMN only) — runs the shared rule registry
  // on the live diagram client-side; null = modal closed.
  const [diagramScan, setDiagramScan] = useState<Violation[] | null>(null);
  // Position + drag state for the Diagram Issues popup. The popup is
  // draggable so the user can move it aside to inspect canvas elements
  // sitting behind it while reading the violation list — a hard
  // requirement from 2026-06-07 testing. Position is in viewport
  // coordinates (window.innerWidth / window.innerHeight space).
  const [diagramScanPos, setDiagramScanPos] = useState<{ x: number; y: number } | null>(null);
  const [diagramScanDrag, setDiagramScanDrag] = useState<{ ox: number; oy: number } | null>(null);
  // Collapsible state for the Errors / Warnings sections inside the dialog.
  const [scanErrorsOpen, setScanErrorsOpen] = useState(true);
  const [scanWarningsOpen, setScanWarningsOpen] = useState(true);
  // Review Mode — after the user closes the scan dialog they step through
  // the flagged elements one by one. `accepted` is the set of indices into
  // `violations` the user has dismissed in this session; running a new scan
  // resets it. Outlines persist until the user clicks Exit (no timer).
  const [reviewIssues, setReviewIssues] = useState<{
    violations: Violation[];
    accepted: Set<number>;
    cursor: number;
  } | null>(null);

  const activeIssues = useMemo(() => {
    if (!reviewIssues) return null;
    return reviewIssues.violations
      .map((v, i) => ({ v, i }))
      .filter(({ i }) => !reviewIssues.accepted.has(i));
  }, [reviewIssues]);

  const currentIssue = activeIssues && activeIssues.length > 0
    ? activeIssues[Math.min(reviewIssues!.cursor, activeIssues.length - 1)]
    : null;

  // Tint every (non-accepted) flagged element while review is active. Worst-
  // severity wins when one element is hit by both an error and a warning.
  const scanHighlight = useMemo<Map<string, "error" | "warning"> | null>(() => {
    if (!activeIssues || activeIssues.length === 0) return null;
    const elIds = new Set(data.elements.map((e) => e.id));
    const m = new Map<string, "error" | "warning">();
    for (const { v } of activeIssues) {
      for (const id of v.ids) {
        if (!elIds.has(id)) continue; // skip connector ids / dangling refs
        if (v.severity === "error" || !m.has(id)) m.set(id, v.severity);
      }
    }
    return m.size > 0 ? m : null;
  }, [activeIssues, data.elements]);

  // Risk & Control highlight — active only while a step's "Risk & Controls"
  // Properties-Panel section is expanded: red = carries a Risk, green = a
  // Control, both = both. Non-destructive canvas overlay.
  const riskHighlight = useMemo<Map<string, "risk" | "control" | "both"> | null>(() => {
    if (!rcSectionOpen) return null;
    const m = new Map<string, "risk" | "control" | "both">();
    for (const el of data.elements) {
      const rc = getRiskControl(el);
      const hasR = !!rc.riskRefs?.length, hasC = !!rc.controlRefs?.length;
      if (hasR && hasC) m.set(el.id, "both");
      else if (hasR) m.set(el.id, "risk");
      else if (hasC) m.set(el.id, "control");
    }
    return m.size > 0 ? m : null;
  }, [rcSectionOpen, data.elements]);

  // "Show non-APQC" — ring non-APQC activities (numberable elements with no PCF ref).
  const nonApqcHighlightIds = useMemo<Set<string> | undefined>(() => {
    if (!showNonApqc) return undefined;
    const s = new Set<string>();
    for (const el of data.elements) {
      if (!NUMBERABLE_TYPES.has(el.type)) continue;
      const p = el.properties as Record<string, unknown> | undefined;
      const isApqc = !!p && (p.pcfHierarchyId != null || p.pcfId != null);
      if (!isApqc) s.add(el.id);
    }
    return s.size > 0 ? s : undefined;
  }, [showNonApqc, data.elements]);

  // "Highlight Entity List Changes" (drift): flag elements whose NAME isn't in the
  // project's adopted Entity Structure. pool/lane/sublane → Org Hierarchy (or a
  // black-box pool → External Participants / IT Systems), data-object → Documents,
  // data-store → Data Stores. Purely a highlight — nothing on the diagram changes.
  const [entityDriftEnabled, setEntityDriftEnabled] = useState(false);
  // Only offer/compute drift when the project has ADOPTED a structure with actual
  // entries — otherwise there's nothing to check against (and empty lists would
  // otherwise ring everything).
  const entityHasNames = !!entityStructure && (
    entityStructure.orgStructure.length + entityStructure.participants.length +
    entityStructure.systems.length + entityStructure.documents.length + entityStructure.dataStores.length
  ) > 0;
  const entityDrift = useMemo<Map<string, "drift"> | null>(() => {
    if (!entityDriftEnabled || !entityStructure) return null;
    const m = computeEntityDrift(data.elements, entityStructure);
    return m.size > 0 ? m : null;
  }, [entityDriftEnabled, entityStructure, data.elements]);

  // Parallel highlight map for connectors — same severity-wins rule but keyed
  // by connector id. Drives the orange overlay path drawn in Canvas.
  const scanConnectorHighlight = useMemo<Map<string, "error" | "warning"> | null>(() => {
    if (!activeIssues || activeIssues.length === 0) return null;
    const connIds = new Set(data.connectors.map((c) => c.id));
    const m = new Map<string, "error" | "warning">();
    for (const { v } of activeIssues) {
      for (const id of v.ids) {
        if (!connIds.has(id)) continue;
        if (v.severity === "error" || !m.has(id)) m.set(id, v.severity);
      }
    }
    return m.size > 0 ? m : null;
  }, [activeIssues, data.connectors]);

  /** Ids that belong to the issue the cursor is currently sitting on.
   *  Canvas uses this to render full-strength tint on these and fade
   *  every other flagged element/connector so the user can see at a
   *  glance which issue they're on while keeping the wider scan
   *  context visible. */
  const currentIssueIds = useMemo<Set<string>>(() => {
    if (!currentIssue) return new Set();
    return new Set(currentIssue.v.ids);
  }, [currentIssue]);

  const closeDiagramScan = useCallback(() => {
    if (diagramScan && diagramScan.length > 0) {
      setReviewIssues({ violations: diagramScan, accepted: new Set(), cursor: 0 });
    }
    setDiagramScan(null);
    setDiagramScanPos(null); // re-centre next time the popup opens
  }, [diagramScan]);

  // Position the Diagram Issues popup near the top-left of the canvas
  // when it first opens. Top-aligned (not centred) so it doesn't cover
  // the elements the user is investigating — and from there it's
  // freely draggable via the header. Cleared by closeDiagramScan.
  useEffect(() => {
    if (diagramScan !== null && diagramScanPos === null) {
      const POPUP_WIDTH = 576; // matches max-w-xl
      const x = Math.max(16, window.innerWidth / 2 - POPUP_WIDTH / 2);
      const y = 80; // below the editor's top toolbar
      setDiagramScanPos({ x, y });
    }
  }, [diagramScan, diagramScanPos]);

  // Global mousemove / mouseup listeners while a drag is active. The
  // drag-start handler lives on the popup header in the JSX below;
  // these effects own the movement + release.
  useEffect(() => {
    if (!diagramScanDrag || !diagramScanPos) return;
    const POPUP_WIDTH = 576;
    const HEADER_VISIBLE_MIN = 80; // always leave at least this much header visible on-screen
    const onMove = (e: MouseEvent) => {
      const rawX = e.clientX - diagramScanDrag.ox;
      const rawY = e.clientY - diagramScanDrag.oy;
      const x = Math.max(
        -(POPUP_WIDTH - HEADER_VISIBLE_MIN),
        Math.min(window.innerWidth - HEADER_VISIBLE_MIN, rawX),
      );
      const y = Math.max(0, Math.min(window.innerHeight - HEADER_VISIBLE_MIN, rawY));
      setDiagramScanPos({ x, y });
    };
    const onUp = () => setDiagramScanDrag(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [diagramScanDrag, diagramScanPos]);

  const reviewNext = useCallback(() => {
    setReviewIssues((r) => {
      if (!r) return r;
      const active = r.violations.map((v, i) => ({ v, i })).filter(({ i }) => !r.accepted.has(i));
      if (active.length === 0) return null;
      return { ...r, cursor: Math.min(r.cursor + 1, active.length - 1) };
    });
  }, []);
  const reviewPrev = useCallback(() => {
    setReviewIssues((r) => (r ? { ...r, cursor: Math.max(0, r.cursor - 1) } : r));
  }, []);
  const reviewAcceptCurrent = useCallback(() => {
    setReviewIssues((r) => {
      if (!r) return r;
      const active = r.violations.map((v, i) => ({ v, i })).filter(({ i }) => !r.accepted.has(i));
      const idx = active.length > 0 ? active[Math.min(r.cursor, active.length - 1)].i : -1;
      if (idx < 0) return null;
      const accepted = new Set(r.accepted);
      accepted.add(idx);
      const newActive = r.violations.map((v, i) => ({ v, i })).filter(({ i }) => !accepted.has(i));
      if (newActive.length === 0) return null;
      return { ...r, accepted, cursor: Math.min(r.cursor, newActive.length - 1) };
    });
  }, []);
  const reviewExit = useCallback(() => setReviewIssues(null), []);

  // When the cursor lands on an issue, select the flagged target on the
  // canvas. Prefer the LAST id in violation.ids (heuristic: child for
  // containment) and route element ids to setSelectedElementIds, connector
  // ids to setSelectedConnectorId.
  useEffect(() => {
    if (!currentIssue) return;
    const elIds = new Set(data.elements.map((e) => e.id));
    const connIds = new Set(data.connectors.map((c) => c.id));
    for (const id of [...currentIssue.v.ids].reverse()) {
      if (elIds.has(id)) {
        setSelectedElementIds(new Set([id]));
        setSelectedConnectorId(null);
        return;
      }
      if (connIds.has(id)) {
        setSelectedConnectorId(id);
        setSelectedElementIds(new Set());
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIssue?.i]);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((p) => { if (p?.colorConfig) setProjectColorConfig(p.colorConfig as SymbolColorConfig); })
      .catch(() => {/* fall back to defaults */});
  }, [projectId]);

  useEffect(() => {
    fetch(`/api/diagrams/${diagramId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.colorConfig && typeof d.colorConfig === "object" && !Array.isArray(d.colorConfig)) {
          setDiagramColorConfig(d.colorConfig as SymbolColorConfig);
        }
        if (d?.displayMode) {
          setDisplayMode(d.displayMode as DisplayMode);
        }
      })
      .catch(() => {/* keep initial value */});
  }, [diagramId]);

  // Fetch templates on mount (BPMN only) — sequential to avoid overwhelming PGlite
  useEffect(() => {
    if (diagramType !== "bpmn") return;
    (async () => {
      try {
        const r1 = await fetch("/api/templates?type=user");
        if (r1.ok) {
          const list = await r1.json() as { id: string; name: string; diagramType: string; group: string | null; description?: string | null; thumbnailSvg?: string | null; hasContainer?: boolean; hasWhiteBoxPool?: boolean }[];
          setUserTemplates(
            list
              .filter((t) => t.diagramType === "bpmn")
              .map((t) => ({ id: t.id, name: t.name, group: t.group ?? null, description: t.description ?? null, thumbnailSvg: t.thumbnailSvg ?? null, hasContainer: !!t.hasContainer, hasWhiteBoxPool: !!t.hasWhiteBoxPool })),
          );
        }
      } catch {}
      try {
        const r2 = await fetch("/api/templates?type=builtin");
        if (r2.ok) {
          const list = await r2.json() as { id: string; name: string; diagramType: string; group: string | null; description?: string | null; thumbnailSvg?: string | null; hasContainer?: boolean; hasWhiteBoxPool?: boolean }[];
          setBuiltInTemplates(
            list
              .filter((t) => t.diagramType === "bpmn")
              .map((t) => ({ id: t.id, name: t.name, group: t.group ?? null, description: t.description ?? null, thumbnailSvg: t.thumbnailSvg ?? null, hasContainer: !!t.hasContainer, hasWhiteBoxPool: !!t.hasWhiteBoxPool })),
          );
        }
      } catch {}
      // Restore group-collapse state for this user. Failure is non-fatal —
      // all groups default to expanded.
      try {
        const rp = await fetch("/api/templates/group-prefs");
        if (rp.ok) {
          const { prefs } = await rp.json() as { prefs: Record<string, boolean> };
          if (prefs && typeof prefs === "object") setTemplateGroupCollapsed(prefs);
        }
      } catch {}
    })();
  }, [diagramType]);

  // Close template dropdowns on outside click
  useEffect(() => {
    if (!templateDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (templateDropdownRef.current && !templateDropdownRef.current.contains(e.target as Node)) {
        setTemplateDropdownOpen(false);
        setTemplateMoveMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [templateDropdownOpen]);

  // Close alignment dropdown on outside click
  useEffect(() => {
    if (!alignDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (alignDropdownRef.current && !alignDropdownRef.current.contains(e.target as Node)) {
        setAlignDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [alignDropdownOpen]);

  // Close space dropdown on outside click
  useEffect(() => {
    if (!spaceDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (spaceDropdownRef.current && !spaceDropdownRef.current.contains(e.target as Node)) {
        setSpaceDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [spaceDropdownOpen]);

  // Close resize dropdown on outside click
  useEffect(() => {
    if (!resizeDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (resizeDropdownRef.current && !resizeDropdownRef.current.contains(e.target as Node)) {
        setResizeDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [resizeDropdownOpen]);

  // Close File menu on outside click
  useEffect(() => {
    if (!fileMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setFileMenuOpen(false);
        setFileSubmenu(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [fileMenuOpen]);

  // Close Clear menu on outside click
  useEffect(() => {
    if (!clearMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (clearMenuRef.current && !clearMenuRef.current.contains(e.target as Node)) {
        setClearMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [clearMenuOpen]);

  const effectiveColorConfig: SymbolColorConfig = displayMode === "hand-drawn"
    ? BW_SYMBOL_COLORS
    : { ...projectColorConfig, ...diagramColorConfig };

  const selectedElement = selectedElementIds.size === 1
    ? data.elements.find((el) => selectedElementIds.has(el.id)) ?? null
    : null;
  const selectedConnector = data.connectors.find((c) => c.id === selectedConnectorId) ?? null;

  // ── Tier-1 assist: next-step ghost suggestions ──
  // Inline-only templates (no pools/lanes) — the pool candidates for the
  // "Template" ghost + the attach picker.
  const inlineTemplates = useMemo(
    () => [...builtInTemplates, ...userTemplates].filter(canAttachInline),
    [builtInTemplates, userTemplates],
  );
  // Which element (if any) the template-attach picker is anchored on, and why
  // the last template picked could not be attached there.
  const [templatePicker, setTemplatePicker] = useState<{ sourceId: string; category: string | null; error?: string } | null>(null);

  // Editable intent→template keyword catalog (assist semantic suggestion).
  const [intentCatalog, setIntentCatalog] = useState<IntentRow[]>([]);
  useEffect(() => {
    if (diagramType !== "bpmn") return;
    let alive = true;
    fetch("/api/admin/intent-keywords")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.rows) setIntentCatalog(j.rows as IntentRow[]); })
      .catch(() => {});
    return () => { alive = false; };
  }, [diagramType]);

  const nextStepCandidates = useMemo(() => {
    if (!(assistEnabled && selectedElement && !readOnly)) return [];
    const base = suggestNextSteps(selectedElement, data, diagramType);
    // Both template ghosts attach a template after the selection, so both ask
    // the attach's own question first: after an End, inside an expanded
    // subprocess or after a data object, the picker could only refuse.
    // Semantic suggestion: if the element's name implies an intent, surface it
    // first (attaches the mapped template / opens the picker at its category).
    if (inlineTemplates.length > 0 && !whyTemplateCantFollow(selectedElement, data.elements)) {
      const hit = matchIntent(selectedElement.label, intentCatalog);
      if (hit) {
        base.unshift({
          kind: "intent", symbolType: "task", connectorType: "sequence",
          label: hit.label, reason: `suggested from the name — ${hit.templateName ?? hit.category}`,
          intentLabel: hit.label, intentCategory: hit.category ?? undefined, intentTemplateName: hit.templateName ?? undefined,
        });
      }
      // Always offer the generic "Template" ghost too.
      base.push({ kind: "template", symbolType: "task", connectorType: "sequence", label: "Template", reason: "insert a template fragment" });
    }
    // Data-object suggestions (green rules G2/G3): if the element's name implies
    // using instructions or producing a document, offer a ghost Data Object.
    const inRule = matchAssistRules(selectedElement.label, diagramType, intentCatalog, "add-input-data-object")[0];
    if (inRule) base.push({ kind: "dataobject", dataDirection: "in", symbolType: "data-object", connectorType: "associationBPMN", label: inRule.defaultLabel || "Instructions", reason: "input the process uses" });
    const outRule = matchAssistRules(selectedElement.label, diagramType, intentCatalog, "add-output-data-object")[0];
    if (outRule) base.push({ kind: "dataobject", dataDirection: "out", symbolType: "data-object", connectorType: "associationBPMN", label: outRule.defaultLabel || "Output Doc", reason: "document it produces" });
    return base;
  }, [assistEnabled, selectedElement, data, diagramType, readOnly, inlineTemplates, intentCatalog]);

  // Attach a template's fragment after a source element — the placement and
  // the join are templateAttach.ts's, shared with "add template after X" by
  // voice. One applyTemplate draws the join too, so the attach is ONE undo
  // entry: it used to be applyTemplate then addConnector in the same tick,
  // two entries holding the same stale snapshot, the second a phantom undo.
  // A template that cannot be attached there is refused with the reason, in
  // the picker, instead of being placed unjoined.
  const attachTemplate = useCallback(async (templateId: string, sourceId: string) => {
    const refuse = (error: string) => setTemplatePicker((p) => ({ sourceId, category: p?.category ?? null, error }));
    const tmplData = await fetchTemplateData(templateId);
    if (!tmplData) { refuse("couldn't load that template"); return; }
    const base = { elements: elementsRef.current, connectors: connectorsRef.current };
    const plan = planTemplateAttach(tmplData, sourceId, base);
    const src = base.elements.find((e) => e.id === sourceId);
    const name = [...builtInTemplates, ...userTemplates].find((t) => t.id === templateId)?.name ?? "That template";
    const cantFollow = (why: string) => `“${name}” can’t follow “${src ? anchorNameOf(src) : "it"}” — ${why}`;
    if ("error" in plan) { refuse(plan.blame === "anchor" ? plan.error : cantFollow(plan.error)); return; }
    const checked = checkTemplateAttach({ ...data, ...base }, plan);
    if ("error" in checked) { refuse(cantFollow(checked.error)); return; }
    applyTemplate(plan.elements, plan.connectors, { join: plan.join });
    setSelectedElementIds(new Set(plan.newIds));
    setTemplatePicker(null);
  }, [data, builtInTemplates, userTemplates, applyTemplate]);

  const acceptNextStep = useCallback((c: NextStepCandidate) => {
    if (!selectedElement) return;
    const src = selectedElement;

    // Intent (rule 6): if the catalog names a template we have, attach it
    // directly; otherwise fall through to the picker at its category.
    if (c.kind === "intent" && c.intentTemplateName) {
      const t = inlineTemplates.find((x) => x.name.toLowerCase() === c.intentTemplateName!.toLowerCase());
      if (t) { void attachTemplate(t.id, src.id); return; }
    }
    // Template (rule 5): open the inline-template picker anchored on the source.
    if (c.kind === "template" || c.kind === "intent") {
      setTemplatePicker({ sourceId: src.id, category: c.intentCategory ?? null });
      return;
    }

    // Data Object (green rules G2/G3): place a data object above (input) or below
    // (output) the source and connect it with a directed association — data → task
    // for an input, task → data for an output.
    if (c.kind === "dataobject") {
      const { w, h } = sizeOf("data-object");
      const others = data.elements
        .filter((e) => e.type !== "pool" && e.type !== "lane" && e.type !== "sublane")
        .map((e) => ({ x: e.x, y: e.y, width: e.width, height: e.height }));
      const wanted = c.dataDirection === "in"
        ? { x: src.x + src.width / 2, y: src.y - (h / 2 + HALF_TASK_W) }
        : { x: src.x + src.width / 2, y: src.y + src.height + h / 2 + HALF_TASK_W };
      const center = findFreeSlot(wanted, w, h, others);
      const newId = nanoid();
      addElementGated("data-object", center, undefined, undefined, newId);
      if (c.label) updateLabel(newId, c.label);
      if (c.dataDirection === "in") addConnector(newId, src.id, "associationBPMN");
      else addConnector(src.id, newId, "associationBPMN");
      setSelectedElementIds(new Set([newId]));
      return;
    }

    // Boundary Event (rule 3): mount a trigger-less intermediate event on the
    // source's edge; no connector is drawn.
    if (c.kind === "boundary") {
      const existing = data.elements.filter((e) => e.boundaryHostId === src.id);
      const spot = placeBoundaryEvent(src, existing);
      if (!spot) return; // no room — give up
      const newId = nanoid();
      addElementGated("intermediate-event", spot, undefined, undefined, newId);
      setEventBoundary(newId, src.id); // stamp boundaryHostId deterministically
      setSelectedElementIds(new Set([newId]));
      return;
    }

    // Element (rules 1, 2, 4, R7): inline; a gateway branch that fans out; or —
    // when the source is a boundary event — bottom/top-right of the event with
    // the connector exiting the event's outer face (R7).
    const { w, h } = sizeOf(c.symbolType);
    const others = data.elements
      .filter((e) => e.id !== src.id && e.type !== "pool" && e.type !== "lane" && e.type !== "sublane")
      .map((e) => ({ x: e.x, y: e.y, width: e.width, height: e.height }));

    let srcSide: Side | undefined;
    const isGw = src.type === "gateway";
    // After a boundary event the step goes where the flow leaves it and stays
    // in the host's lane — the same plan voice "add … after" uses. No side is
    // passed to addConnector for it: R7.02 is the reducer's to apply.
    const followOn = src.boundaryHostId ? planBoundaryFollowOn(src, data.elements, w, h, others) : null;
    // Gateway branches sit ½ Task height apart — match the clearance so the
    // fan-out isn't blown apart by the default 51px (#5).
    const center = followOn ? followOn.center
      : findFreeSlot(isGw ? placeGatewayBranch(src, data.connectors.filter((cn) => cn.sourceId === src.id).length, w, h) : placeInline(src, w, h),
        w, h, others, isGw ? HALF_TASK_H : HALF_TASK_W);
    // #5: gateway branch exits by position — above→top, same row→right, below→bottom.
    if (isGw) {
      srcSide = center.y + h / 2 <= src.y ? "top"
        : center.y - h / 2 >= src.y + src.height ? "bottom"
        : "right";
    }

    const newId = nanoid();
    // A ghost-added task also joins the white-box pool (anchor's lane/pool, else
    // the white-box pool's first lane/pool) so it never lands outside. After a
    // boundary event that is the HOST's container, never the host.
    let parentId: string | undefined = followOnParentId(src, data.elements);
    if (!parentId) {
      const wb = data.elements.find((e) => e.type === "pool" && (((e.properties?.poolType as string | undefined) ?? "white-box") === "white-box"));
      if (wb) {
        const firstLane = data.elements.filter((e) => e.type === "lane" && e.parentId === wb.id).sort((a, b) => a.y - b.y)[0];
        parentId = firstLane?.id ?? wb.id;
      }
    }
    addElementGated(c.symbolType, center, undefined, c.eventType, newId,
      parentId ? { parentId, ...(followOn?.laneId ? { keepInLane: true } : {}) } : undefined);
    if (c.gatewayType) updateProperties(newId, { gatewayType: c.gatewayType });
    if (c.flowType) updateProperties(newId, { flowType: c.flowType });
    if (srcSide) addConnector(src.id, newId, c.connectorType, "directed", "rectilinear", srcSide, "left");
    else addConnector(src.id, newId, c.connectorType);
    // Auto-extend all pools to the same width if the new element overflows.
    const addRight = center.x + w / 2;
    if (parentId && data.elements.some((e) => e.type === "pool" && e.x + e.width < addRight + 40)) extendPools();
    setSelectedElementIds(new Set([newId])); // chain: select the new step
  }, [selectedElement, data.elements, data.connectors, addElementGated, updateProperties, addConnector, setEventBoundary, inlineTemplates, attachTemplate, extendPools]);
  // Stable ref so the global Tab handler always sees the latest candidates.
  const nextStepRef = useRef<{ candidates: NextStepCandidate[]; accept: (c: NextStepCandidate) => void }>({ candidates: [], accept: () => {} });
  nextStepRef.current = { candidates: nextStepCandidates, accept: acceptNextStep };

  // ── Voice Assist: live voice/typed command editing ──
  const [voiceAssistOn, setVoiceAssistOn] = useState(false);
  const [voiceLog, setVoiceLog] = useState<CommandLogEntry[]>([]);
  const [voiceListening, setVoiceListening] = useState(false);
  const [abraEngine, setAbraEngine] = useState<"deepgram" | "browser" | null>(null);
  // Mic pressed but the recogniser not yet live (token + permission + socket):
  // the bar says "connecting…" so nobody talks into the gap.
  const [abraConnecting, setAbraConnecting] = useState(false);
  const [voiceInterim, setVoiceInterim] = useState("");
  const [voiceBusy, setVoiceBusy] = useState(false);
  /**
   * B4. `voiceBusy` is React state, so it is not true until the next render —
   * far too late to stop the NEXT utterance, which arrives from the mic
   * whenever the speaker stops for breath. The ref flips synchronously, and
   * anything spoken while a call is in flight waits its turn in the queue
   * instead of racing it.
   *
   * Without this, two sentences spoken over one AI call both applied against
   * the state from BEFORE the call, and their log lines interleaved. The text
   * box has been gated since b00e3c7b; the voice path never was.
   */
  const voiceBusyRef = useRef(false);
  const voiceQueueRef = useRef<string[]>([]);
  const voiceLastId = useRef<string | null>(null);
  // M5 — where the mouse last was on the canvas, in world coordinates. A REF,
  // not state: it is written on every pointer move and must never cause a
  // render. Null until the pointer has been over the canvas at all, which is
  // what lets "put a task here" refuse with a reason rather than guess (0,0).
  const pointerWorld = useRef<{ x: number; y: number } | null>(null);
  // stopAbraListening is defined after the command runner (it needs the buffer
  // flush); the runner reaches it through this ref.
  const stopAbraListeningRef = useRef<() => void>(() => {});
  // Remembers the last real command so "again" can repeat it (e.g. nudge again).
  const lastAbraOpsRef = useRef<AssistOp[]>([]);
  // Gold flashing. `goldFlashBeforeRef` holds the pre-command snapshot while the
  // reducer and React catch up; the effect below turns it into a set of boxes to
  // outline once the new elements have actually rendered. `runId` is what the
  // overlay watches — a number, so an unrelated re-render cannot re-trigger it.
  const goldFlashBeforeRef = useRef<FlashBox[] | null>(null);
  const [goldFlash, setGoldFlashState] = useState<{ runId: number; targets: FlashBox[] }>({ runId: 0, targets: [] });
  // DEBUG RECORDING (Paul, 2026-09-24). A second before-snapshot, armed on every
  // command rather than only the ones that flash: the evidence wants to know
  // what a rename or a delete did just as much as what a move did. Costs one
  // boolean read when the toggle is off, the same discipline as gestureTrace.
  const [voiceDebugRecording, setVoiceDebugRecording] = useState(false);
  const debugBeforeRef = useRef<TouchBox[] | null>(null);
  const [debugSnapshots, setDebugSnapshots] = useState<DebugSnapshot[]>([]);
  useEffect(() => { setVoiceDebugRecording(isVoiceDebugOn()); }, []);
  // A destructive command waiting for "yes" (confirm.ts): the ops, what they
  // would do in words, and whether the AI interpreted them (for the log badge).
  const pendingConfirmRef = useRef<{ ops: AssistOp[]; what: string; viaAi: boolean } | null>(null);
  // "Cost so far": the session starts when the bar opens; the microphone's open
  // stretch is added live because its usage row is only written when it stops.
  const voiceSessionStart = useRef<Date>(new Date());
  const voiceMicOpenedAt = useRef<number | null>(null);
  useEffect(() => { if (voiceAssistOn) voiceSessionStart.current = new Date(); }, [voiceAssistOn]);
  const fetchAbraCost = useCallback(async () => {
    const live = voiceListening && voiceMicOpenedAt.current ? Math.round((Date.now() - voiceMicOpenedAt.current) / 1000) : 0;
    const q = new URLSearchParams({ since: voiceSessionStart.current.toISOString(), live: String(live) });
    const res = await fetch(`/api/ai/command/usage?${q}`);
    if (!res.ok) return null;
    return (await res.json()) as import("@/app/lib/assist/usageCost").CostReport;
  }, [voiceAssistOn, voiceListening]);
  const voiceDictRef = useRef<DictationHandle | null>(null);

  // ── Guided "rename by number" flow (voice) ──
  //   pick: green number badges shown; user says a number.
  //   name: an item is selected/editing; user dictates the new name.
  // (RenameFlow is defined beside the apply layer, which opens it.)
  const [renameFlow, setRenameFlowState] = useState<RenameFlow | null>(null);
  const renameFlowRef = useRef<RenameFlow | null>(null);
  const setRenameFlow = useCallback((f: RenameFlow | null) => { renameFlowRef.current = f; setRenameFlowState(f); }, []);
  // ── Guided "message by number" flow (messageTargets.ts): badges on the
  //    candidates; the user says "n to m labelled X" or "to/from n labelled X".
  const [messageFlow, setMessageFlowState] = useState<MessagePick | null>(null);
  const messageFlowRef = useRef<MessagePick | null>(null);
  const setMessageFlow = useCallback((f: MessagePick | null) => { messageFlowRef.current = f; setMessageFlowState(f); }, []);
  // ── R2: the disambiguation picker. Same numbered-badge mechanism as the
  //    rename and message flows — the point of R2 was never new UI, it was that
  //    a mechanism the product already had was not reached from the one place
  //    that most needed it.
  // "Add template" (Paul, 2026-09-24): the numbered window, and the template
  // currently sitting on the diagram waiting to be kept. The pick is applied
  // for real so it can be SEEN in place; another number replaces it (the
  // diagram it was applied to goes back, then the next goes on — one undo
  // entry however many are tried); only "yes" keeps it.
  const [templateFlow, setTemplateFlowState] = useState<TemplateFlow | null>(null);
  const templateFlowRef = useRef<TemplateFlow | null>(null);
  const setTemplateFlow = useCallback((f: TemplateFlow | null) => { templateFlowRef.current = f; setTemplateFlowState(f); }, []);
  // Every pick (and every close) takes a new number; a pick whose template
  // arrives after a newer one began — a double click, voice and mouse at once,
  // or Esc while it loaded — is dropped rather than stacked.
  const templatePickSeqRef = useRef(0);
  // Defined with the template window below; reached through refs from the
  // voice runner and the Esc handler, which are defined before them.
  const closeTemplateFlowRef = useRef<(keep: boolean) => string>(() => "");
  const pickTemplateCardRef = useRef<(card: TemplateCard, report: TemplateReport) => Promise<void>>(async () => {});
  const reanchorTemplateRef = useRef<(ref: string, report: TemplateReport) => Promise<void>>(async () => {});
  const [pickFlow, setPickFlowState] = useState<PickFlow | null>(null);
  const pickFlowRef = useRef<PickFlow | null>(null);
  const setPickFlow = useCallback((f: PickFlow | null) => { pickFlowRef.current = f; setPickFlowState(f); }, []);
  const voiceStopRequested = useRef(false);
  // Stable ref to the JSON export (a plain function redefined each render) so
  // the memoised apply layer can call it without churning its deps.
  const exportJsonRef = useRef<(() => void) | null>(null);
  // Voice Assist is always OFF when you open (or switch) a diagram — a live mic
  // should never be silently on when you arrive. Reset + stop on diagram change.
  useEffect(() => {
    setVoiceAssistOn(false);
    voiceDictRef.current?.stop();
    voiceDictRef.current = null;
    setVoiceListening(false);
    pendingConfirmRef.current = null; // a parked "clear the diagram?" never outlives the diagram it was asked on
    pickFlowRef.current = null;       // nor a parked "which one?" — its candidates are on the old diagram
    setPickFlowState(null);
  }, [diagramId]);


  /**
   * Arm the gold flash: remember where everything was and what it was called,
   * so the effect below can diff once React has re-rendered and outline what
   * changed. A no-op unless the user has flashing switched on.
   *
   * Two callers — the op batch and the guided rename flow — because the rename
   * flow writes labels through its own path and never touches applyAssistOps.
   * That is why renaming flashed nothing at all (Paul, 2026-09-18).
   */
  const armGoldFlash = useCallback((elements: DiagramElement[]) => {
    if (!isGoldFlashOn()) return;
    goldFlashBeforeRef.current = elements.map((e) => ({
      id: e.id, x: e.x, y: e.y, width: e.width, height: e.height, parentId: e.parentId, label: e.label,
      marks: subtypeFingerprint(e as unknown as Record<string, unknown>),
    }));
  }, []);
  /** The debug recording's before-snapshot — the op batch and the template
   *  window's picks both change the diagram, and both are evidence. */
  const armDebugBefore = useCallback((elements: DiagramElement[]) => {
    if (voiceDebugRecording) {
      debugBeforeRef.current = elements.map((e) => ({
        id: e.id, type: e.type, x: e.x, y: e.y, width: e.width, height: e.height,
        parentId: e.parentId, label: e.label,
        marks: subtypeFingerprint(e as unknown as Record<string, unknown>),
      }));
    }
  }, [voiceDebugRecording]);
  // Apply interpreted ops. The work is in app/lib/assist/applyAssistOps.ts, so the
  // test harness can run the SAME code against a headless diagram (L4); what
  // stays here is editor memory ("again") and the display snapshots taken around it.
  const applyAssistOps = useCallback((incoming: AssistOp[]): { ok: boolean; summary: string } => {
    // "again" repeats the last real command (a nudge, a move, an add…).
    let ops = incoming;
    if (ops.length === 1 && ops[0].op === "again") {
      if (!lastAbraOpsRef.current.length) return { ok: false, summary: "nothing to repeat yet" };
      ops = lastAbraOpsRef.current;
    } else if (ops.length && !ops.every((o) => o.op === "undo" || o.op === "again" || o.op === "export")) {
      lastAbraOpsRef.current = ops; // remember for "again" (but not undo/again/export)
    }
    // Gold flashing: remember where everything was, so that once React has
    // re-rendered we can diff and outline whatever this command touched. Taken
    // here rather than asking each of the thirty-odd op handlers to report what
    // it changed — handlers drift, and a new op would silently stop flashing.
    if (batchFlashes(ops)) armGoldFlash(data.elements);
    // The same trick again, for the debug log. Armed UNCONDITIONALLY while
    // recording — `batchFlashes` deliberately skips the ops that change nothing
    // worth outlining, and those are exactly the ones whose effect a person
    // cannot see by looking, so they are the ones the evidence needs most.
    armDebugBefore(data.elements);
    return applyAssistOpsTo(ops, {
      elements: data.elements, connectors: data.connectors, riskCatalog,
      actions: {
        addElementGated, updateProperties, updateLabel, addConnector, deleteConnector, updateConnectorLabel,
        deleteElement, undo, clearDiagram, setEventBoundary, splitPoolEven, splitLaneEven, wrapInPool,
        wrapInSubprocess, wrapInContainer, unwrapSubprocess, addPool, addLaneAt, compressPool, extendPools,
        swapLane, moveLane, moveElements, elementsMoveEnd, removeSpace, updateConnectorEndpoint, movePoolTo,
        swapPools, resizeElement, resizeElementEnd, alignElements,
      },
      ui: { setSelectedElementIds, setSelectedConnectorId, setPickFlow, setRenameFlow, setMessageFlow, setGoldFlash },
      refs: { voiceLastId, pointerWorld, selectedIdsRef, selectedConnectorIdRef, nextStepRef, openTemplateWindowRef, exportJsonRef },
    });
  }, [data.elements, data.connectors, riskCatalog, armDebugBefore, armGoldFlash, addElementGated, updateProperties, updateLabel, addConnector, deleteConnector, updateConnectorLabel, deleteElement, undo, clearDiagram, setEventBoundary, splitPoolEven, splitLaneEven, wrapInPool, wrapInSubprocess, wrapInContainer, unwrapSubprocess, addPool, addLaneAt, compressPool, extendPools, swapLane, moveLane, moveElements, elementsMoveEnd, removeSpace, updateConnectorEndpoint, movePoolTo, swapPools, resizeElement, resizeElementEnd, alignElements, setRenameFlow, setMessageFlow, setPickFlow]);

  // Gold flashing, part two: the command has run, React has re-rendered, and
  // `data.elements` is now the after picture. Diff it against the snapshot taken
  // when the batch was armed and hand the result to the overlay.
  //
  // This runs on every element change, but does nothing at all unless a batch
  // armed it — the ref is the gate, and it is cleared immediately so one command
  // flashes once however many times the canvas re-renders afterwards.
  useEffect(() => {
    const snapshot = goldFlashBeforeRef.current;
    if (!snapshot) return;
    goldFlashBeforeRef.current = null;
    const targets = flashTargets(
      snapshot,
      data.elements.map((e) => ({
        id: e.id, x: e.x, y: e.y, width: e.width, height: e.height, parentId: e.parentId, label: e.label,
      marks: subtypeFingerprint(e as unknown as Record<string, unknown>),
      })),
    );
    if (targets.length === 0) return;
    setGoldFlashState((prev) => ({ runId: prev.runId + 1, targets }));
  }, [data.elements]);

  // The debug half of the same diff. Attaches to the LAST log entry, which is
  // the one the command just wrote: `applyGrouped` is followed immediately by a
  // single `log(...)` call, so by the time React has re-rendered with the new
  // elements, the entry to annotate is the one on the end.
  useEffect(() => {
    const before = debugBeforeRef.current;
    if (!before) return;
    debugBeforeRef.current = null;
    const touched = touchedFor(
      before,
      data.elements.map((e) => ({
        id: e.id, type: e.type, x: e.x, y: e.y, width: e.width, height: e.height,
        parentId: e.parentId, label: e.label,
        marks: subtypeFingerprint(e as unknown as Record<string, unknown>),
      })),
    );
    if (touched.length === 0) return;
    setVoiceLog((prev) => (prev.length === 0
      ? prev
      : prev.map((e, i) => (i === prev.length - 1 ? { ...e, touched } : e))));
  }, [data.elements]);

  /** Record what Paul thought of one command. */
  const annotateCommand = useCallback((id: string, patch: { note?: string; verdict?: CommandVerdict }) => {
    setVoiceLog((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  /**
   * Take a picture of the canvas, and keep the diagram behind it.
   *
   * Both halves, because they answer different questions: the PNG says what
   * Paul was looking at, the JSON lets the situation be reloaded and replayed.
   * A failed capture still stores the JSON — evidence with no picture beats no
   * evidence, and the picture is the half most likely to fail.
   */
  const takeDebugSnapshot = useCallback(async (entryId: string | null) => {
    const shot = await captureCanvasPng(data.elements);
    const id = nanoid();
    setDebugSnapshots((prev) => [...prev, {
      id,
      entryId,
      takenAt: Date.now(),
      ...(shot ? { png: shot.png, width: shot.width, height: shot.height } : {}),
      diagramJson: { elements: data.elements, connectors: data.connectors },
      elementCount: data.elements.length,
      connectorCount: data.connectors.length,
    }]);
    if (entryId) setVoiceLog((prev) => prev.map((e) => (e.id === entryId ? { ...e, snapshotId: id } : e)));
  }, [data.elements, data.connectors]);

  /**
   * The session, built once and used for both destinations.
   *
   * Save-to-disk and save-to-database take THE SAME PAYLOAD — the POST route
   * accepts exactly what the download writes — so a downloaded file can be
   * posted back and the two shapes cannot drift apart.
   */
  const buildDebugSession = useCallback((savedAt: number) =>
    buildDebugSessionFile({
      title: `Voice Assist — ${diagramName || "diagram"}`,
      diagramId,
      diagramName,
      entries: voiceLog,
      snapshots: debugSnapshots,
      savedAt,
      appVersion: PRODUCT_VERSION,
    }), [voiceLog, debugSnapshots, diagramName, diagramId]);

  const [debugSaveState, setDebugSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveDebugSession = useCallback(async () => {
    setDebugSaveState("saving");
    try {
      const res = await fetch("/api/admin/voice-debug/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildDebugSession(Date.now())),
      });
      setDebugSaveState(res.ok ? "saved" : "error");
    } catch {
      setDebugSaveState("error");
    }
    // Back to "Save" after a moment, so a second save later in the session is
    // obviously available rather than looking already done.
    setTimeout(() => setDebugSaveState("idle"), 4000);
  }, [buildDebugSession]);

  /** The whole session as one file: commands, verdicts, comments, snapshots. */
  const downloadDebugSession = useCallback(() => {
    const savedAt = Date.now();
    const blob = new Blob([serialiseDebugSession(buildDebugSession(savedAt))], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = debugSessionFilename(diagramName, new Date(savedAt).toISOString());
    a.click();
    URL.revokeObjectURL(url);
  }, [buildDebugSession, diagramName]);

  // Cancel the guided rename flow and clear any badge/edit state.
  const cancelRenameFlow = useCallback((reason?: string) => {
    setRenameFlow(null);
    cancelLabelEdit();
    if (reason) setVoiceLog((prev) => [...prev, { id: nanoid(), heard: "", summary: reason, ok: true }]);
  }, [setRenameFlow, cancelLabelEdit]);

  // Apply a dictated name to the picked element/connector, then STAY in the loop
  // (#3): re-number the same type so the user can keep renaming until "stop"/Esc.
  const applyRenameName = useCallback((target: { id: string; kind: "element" | "connector" }, name: string, itemType: RenameType, single = false) => {
    // Item names start with a capital (Paul, 2026-09-17). Dictation returns a
    // lower-case sentence fragment, which then sits on the diagram looking like
    // a typo beside every name that was typed. First word only — a process step
    // is a phrase, and title case would give "Send To Customer For Approval".
    const clean = capitaliseFirstWord(name.trim().replace(/[.,!?;:]+$/g, ""));
    if (!clean) { cancelRenameFlow("rename cancelled (empty name)"); return; }
    // The guided flow writes the label itself, so it has to arm the flash
    // itself too — applyAssistOps is never involved.
    armGoldFlash(data.elements);
    if (target.kind === "element") updateLabel(target.id, clean);
    else updateConnectorLabel(target.id, clean);
    cancelLabelEdit();
    // Selection protocol (Paul, 2026-09-15): a rename by voice does not leave
    // the item selected — the badges are the cue, not a highlight.
    setSelectedElementIds(new Set());
    setSelectedConnectorId(null);
    if (single) {
      // "label selected": one item, no pick loop afterwards.
      setRenameFlow(null);
      setVoiceLog((prev) => [...prev, { id: nanoid(), heard: clean, summary: `labelled the connector “${clean}”`, ok: true }]);
      return;
    }
    const targets = collectRenameTargets(data.elements, data.connectors, itemType);
    if (targets.length > 0) setRenameFlow({ phase: "pick", itemType, targets });
    else setRenameFlow(null);
    setVoiceLog((prev) => [...prev, { id: nanoid(), heard: clean, summary: `renamed to “${clean}” — pick another or say “done”`, ok: true }]);
  }, [updateLabel, updateConnectorLabel, cancelLabelEdit, setRenameFlow, cancelRenameFlow, data.elements, data.connectors]);

  // Handle one utterance while the guided rename flow is active.
  const handleRenameUtterance = useCallback((text: string) => {
    const flow = renameFlowRef.current;
    if (!flow) return;
    const t = text.trim();
    const low = t.toLowerCase().replace(/[.,!?;:]+$/g, "").trim();
    // "done"/"cancel"/Esc-words end the rename loop (mic stays on); a bare
    // "stop" never reaches here — it stops the mic (stopWords.ts).
    if (isFlowEndWord(low)) { cancelRenameFlow("rename finished"); return; }
    // "Undo" inside a numbered pick meant "get me out of this", and it was
    // answered with "say the number of the item to rename" — three times in a
    // row, in Paul's log (2026-09-21), which is the feature arguing with
    // someone trying to leave. It now does BOTH: drop the pick, then undo.
    if (/^undo\b/.test(low)) {
      cancelRenameFlow("rename cancelled");
      undo();
      setVoiceLog((prev) => [...prev, { id: nanoid(), heard: t, summary: "undid the last change", ok: true }]);
      return;
    }
    if (flow.phase === "pick") {
      // Leading number (digit, number-word, or a known mishearing of one)
      // selects a badge; trailing text is the name. `leadingSpokenNumber`
      // absorbs the recogniser substituting "lane" for "one" — a bias we
      // create ourselves by boosting `lane` (spokenNumber.ts).
      const picked = leadingSpokenNumber(t);
      if (!picked) { setVoiceLog((prev) => [...prev, { id: nanoid(), heard: t, summary: "say the number of the item to rename", ok: false }]); return; }
      const n = picked.n;
      const target = flow.targets.find((x) => x.n === n);
      if (!target) { setVoiceLog((prev) => [...prev, { id: nanoid(), heard: t, summary: `there’s no number ${n}`, ok: false }]); return; }
      // Select + enter edit mode (+ zoom for elements) so the change is visible.
      if (target.kind === "element") { setSelectedConnectorId(null); setSelectedElementIds(new Set([target.id])); beginLabelEdit(target.id); }
      else { setSelectedElementIds(new Set()); setSelectedConnectorId(target.id); }
      const trailing = picked.rest;
      if (trailing) { applyRenameName(target, trailing, flow.itemType); }         // "14 Approve Invoice" in one breath
      else { setRenameFlow({ phase: "name", itemType: flow.itemType, targetId: target.id, kind: target.kind }); } // wait for the name
      return;
    }
    // phase "name" — the whole utterance is the new name.
    applyRenameName({ id: flow.targetId, kind: flow.kind }, t, flow.itemType, flow.single === true);
  }, [applyRenameName, cancelRenameFlow, setRenameFlow, beginLabelEdit]);
  const handleRenameUtteranceRef = useRef(handleRenameUtterance);
  handleRenameUtteranceRef.current = handleRenameUtterance;

  // One spoken command = ONE undo entry, however many reducer helpers it fans
  // out into (historyGroup.ts). "Undo that" used to revert only the last of them.
  const applyGrouped = useCallback((ops: AssistOp[]) => {
    beginHistoryGroup();
    try { return applyAssistOps(ops); } finally { endHistoryGroup(); }
  }, [applyAssistOps, beginHistoryGroup, endHistoryGroup]);

  // The answer to a numbered message pick: "3 to 7 labelled Order Placed" /
  // "to 2 labelled X" / "from 2 labelled X" — or "done" to walk away.
  const handleMessageUtterance = useCallback((text: string) => {
    const flow = messageFlowRef.current;
    if (!flow) return;
    const t = text.trim();
    const log = (summary: string, ok: boolean) => setVoiceLog((prev) => [...prev, { id: nanoid(), heard: t, summary, ok }]);
    if (isFlowEndWord(t)) { setMessageFlow(null); log("message cancelled", true); return; }
    const a = parseMessageAnswer(t, flow.mode);
    if (!a) {
      // Offer only the forms that can work — a receive-only anchor never "to".
      const forms = flow.mode === "pair" ? ["“<n> to <m> labelled <text>”"]
        : [flow.dirs.to ? "“to <n> labelled <text>”" : "", flow.dirs.from ? "“from <n> labelled <text>”" : ""].filter(Boolean);
      log(`say ${forms.join(" or ")} — or “done”`, false);
      return;
    }
    // A refused answer (no such badge, or said backwards — "12 to 1" where 12
    // only receives) keeps the numbers up so it can simply be said again.
    const ends = resolveMessageAnswer(flow, a, elementsRef.current, connectorsRef.current);
    if ("error" in ends) { log(ends.error, false); return; }
    const { fromId, toId } = ends;
    setMessageFlow(null);
    const r = applyGrouped([{ op: "addMessage", fromRef: ID_REF_PREFIX + fromId, toRef: ID_REF_PREFIX + toId, ...(a.label ? { label: a.label } : {}) }]);
    log(r.summary, r.ok);
  }, [applyGrouped, setMessageFlow]);
  const handleMessageUtteranceRef = useRef(handleMessageUtterance);
  handleMessageUtteranceRef.current = handleMessageUtterance;

  // Interpret a raw command (deterministic first; AI fallback added in Stage 4).
  const runVoiceCommand = useCallback(async (text: string) => {
    const heard = text.trim();
    if (!heard) return;
    // `at` is stamped on every entry, recording or not: a session saved later
    // cannot be read without it, and a timestamp costs nothing.
    const log = (entry: Omit<CommandLogEntry, "id">) => setVoiceLog((prev) => [...prev, { id: nanoid(), at: Date.now(), ...entry }]);
    // A typed "stop" means the same as a spoken one: the mic, and anything parked, ends.
    if (isMicStopWord(heard)) {
      // "stop" is the brake — it must never queue behind an in-flight call,
      // and it throws away anything already parked. Paul made the word
      // unambiguous for exactly this reason (49b13eb1).
      voiceQueueRef.current = [];
      stopAbraListeningRef.current();
      log({ heard, summary: "stopped listening", ok: true });
      return;
    }
    // Everything else queues rather than races, so commands apply in the order
    // they were spoken, each against the state the one before it left behind.
    if (voiceBusyRef.current) {
      voiceQueueRef.current.push(heard);
      log({ heard, summary: "waiting for the previous command…", ok: true });
      return;
    }
    // While a guided pick is active, every utterance feeds it (a number, a
    // name, or "done") — never the general command parser.
    //
    // One exception: switching gold flashing on or off. It edits nothing, so it
    // cannot disturb the pick, and the pick is exactly where you notice you
    // wanted it on (Paul, 2026-09-18). Without this the words are taken as the
    // new name for whichever item you had picked.
    if (renameFlowRef.current || messageFlowRef.current) {
      const toggle = parseCommand(heard);
      if (toggle && toggle.length === 1 && toggle[0].op === "goldFlash") {
        const r = applyGrouped(toggle);
        log({ heard, summary: r.summary, ok: r.ok });
        return;
      }
    }
    if (templateFlowRef.current) {
      const flow = templateFlowRef.current;
      const answer = parseTemplateAnswer(heard, flow.cards, !!flow.provisional);
      if (!answer) { log({ heard, summary: "say a number, “yes” to keep it, or “cancel”", ok: false }); return; }
      if (answer.kind === "cancel" || answer.kind === "confirm") {
        log({ heard, summary: closeTemplateFlowRef.current(answer.kind === "confirm"), ok: true });
        return;
      }
      if (answer.kind === "before") { log({ heard, summary: TEMPLATE_BEFORE_REFUSAL, ok: false }); return; }
      // A number shows that one instead of whatever is showing now; "after X"
      // moves the window (and what is showing) to X. Each reports in the same
      // tick as its change, so the debug recording's "touched" lands on it.
      const report: TemplateReport = (r) => log({ heard, summary: r.summary, ok: r.ok });
      if (answer.kind === "anchor") await reanchorTemplateRef.current(answer.ref, report);
      else await pickTemplateCardRef.current(answer.card, report);
      return;
    }
    if (pickFlowRef.current) {
      const flow = pickFlowRef.current;
      if (isFlowEndWord(heard)) {
        setPickFlow(null);
        log({ heard, summary: "cancelled", ok: true });
        return;
      }
      const chosen = parsePickAnswer(heard, flow);
      if (!chosen) { log({ heard, summary: flow.prompt, ok: false }); return; }
      setPickFlow(null);
      // Re-run the PARKED command with the choice substituted as an #id:
      // reference, so it goes back through the ordinary path rather than a
      // second one that could behave differently.
      const r = applyGrouped(substituteRef(flow.ops, flow.ref, chosen.id));
      log({ heard, summary: `${chosen.n} → ${r.summary}`, ok: r.ok });
      return;
    }
    if (renameFlowRef.current) { handleRenameUtteranceRef.current(heard); return; }
    if (messageFlowRef.current) { handleMessageUtteranceRef.current(heard); return; }

    // A destructive command parked by the previous utterance — this one answers it.
    if (pendingConfirmRef.current) {
      const pending = pendingConfirmRef.current;
      pendingConfirmRef.current = null;
      const answer = parseConfirmation(heard);
      if (answer === "yes") {
        const r = applyGrouped(pending.ops);
        log({ heard, summary: `confirmed → ${r.summary}`, ok: r.ok, viaAi: pending.viaAi });
        return;
      }
      log({ heard, summary: `cancelled — did not ${pending.what}`, ok: true, viaAi: pending.viaAi });
      if (answer === "no") return;
      // Anything else is a new command: fall through with the old one dropped.
    }

    // Apply now — or, when the command would remove more than one thing, park
    // it and ask (confirm.ts). Undo would recover a mis-heard "clear the
    // diagram", but nobody should have to know that.
    const applyOrAsk = (rawOps: AssistOp[], viaAi: boolean, prefix = "") => {
      // A SURROUND ALWAYS MAKES A NEW POOL (Paul, 2026-09-19). The deterministic
      // grammar already does; the AI does not, and keeps canonicalising a
      // surround it did not quite hear — "Selected with a pool" — into "put a
      // pool around everything", which grows an existing pool and re-homes the
      // diagram instead. When the words the user actually said name the
      // selection, the whole-diagram wrap is not what they asked for, whatever
      // the model returned.
      const ops = rawOps.map((op) =>
        op.op === "wrapInPool" && /\b(?:selected|selection|these|those|highlighted)\b/i.test(heard)
          ? { op: "wrapInContainer", container: "pool" as const, ...(op.label ? { label: op.label } : {}) } as AssistOp
          : op,
      );
      const ask = needsConfirmation(ops, data.elements, voiceLastId.current, selectedIdsRef.current);
      if (ask) {
        // PIN THE ANSWER TO WHAT WAS ASKED. The question names one element; the
        // "yes" arrives an utterance later, by which time "selected" or "one"
        // may resolve to something else or to nothing at all — five lines of
        // Paul's log, 2026-09-23, are `Yes.` → `confirmed → which sub-lane?`.
        // Substituting the id is the same trick the picker uses (R2), so the
        // re-run goes back through the ordinary path.
        const pinned = ask.targetId && ask.ref ? substituteRef(ops, ask.ref, ask.targetId) : ops;
        pendingConfirmRef.current = { ops: pinned, what: ask.what, viaAi };
        log({ heard, summary: `${prefix}${ask.what}? — say “yes” to confirm`, ok: true, viaAi });
        return;
      }
      const r = applyGrouped(ops);
      log({ heard, summary: `${prefix}${r.summary}`, ok: r.ok, viaAi });
    };

    const ops = parseCommand(heard);
    if (ops) { applyOrAsk(ops, false); return; }
    // Deterministic parser didn't recognise it → AI fallback (metered).
    voiceBusyRef.current = true;
    setVoiceBusy(true);
    try {
      const res = await fetch("/api/ai/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: heard, state: { elements: data.elements, connectors: data.connectors }, selectedIds: selectedIdsRef.current }),
      });
      if (!res.ok) { log({ heard, summary: "didn’t understand that", ok: false, viaAi: true }); return; }
      const j = await res.json();
      // Prefer the AI's CANONICAL rewrite re-parsed deterministically (fixes
      // mis-hears + guarantees a valid, documented command); fall back to ops.
      const canonical = typeof j.canonical === "string" ? j.canonical.trim() : "";
      const canonicalOps = canonical ? parseCommand(canonical) : null;
      // The canonical is SHOWN to the user, so it has to be in their
      // vocabulary. The model answers with ids because we gave it ids, and the
      // log printed them verbatim — "connect qruut4v9 to ksjm25kj" (Paul,
      // 2026-09-21). The command was right; the sentence describing it was not.
      if (canonicalOps) { applyOrAsk(canonicalOps, true, `“${humaniseIds(canonical, data.elements)}” → `); return; }
      const aiOps = validateOps(j.ops);
      if (aiOps.length === 0) {
        // The command was often understood perfectly — it named something that
        // is not there. "Add a task before review", with no Review on the
        // diagram, sent the user off to rephrase a sentence that was fine
        // (Paul, 2026-09-21). Name the missing thing instead, when we can.
        log({ heard, summary: notUnderstoodMessage(heard, data.elements), ok: false, viaAi: true });
        return;
      }
      applyOrAsk(aiOps, true);
    } catch {
      log({ heard, summary: "command service unavailable", ok: false, viaAi: true });
    } finally {
      voiceBusyRef.current = false;
      setVoiceBusy(false);
      // Drain through the REF, not this closure: the render that follows the
      // call rebuilds runVoiceCommand over the NEW diagram, and the queued
      // command must see that, not the diagram as it was when it was spoken.
      const next = voiceQueueRef.current.shift();
      if (next !== undefined) void runAbraCommandRef.current(next);
    }
  }, [applyGrouped, data.elements, data.connectors]);
  // Keep a stable ref so the mic's onText callback always calls the latest.
  const runAbraCommandRef = useRef(runVoiceCommand);
  runAbraCommandRef.current = runVoiceCommand;
  exportJsonRef.current = () => { void handleExportJson(); };

  // Voice comes in as fragments (Deepgram finalises on every pause), so ONE
  // spoken command arrives as several onText calls. Buffer the fragments and
  // interpret the whole sentence after a short silence, so "rename the pool …
  // to … My Company" is treated as a single command.
  const voiceBuffer = useRef("");
  const voiceFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceWaits = useRef(0);           // how many times we've held an incomplete command
  // The numbers live in `assist/fragmentBuffer.ts` (2026-09-24) so the live
  // path and a replayed clip cannot disagree about how long to wait.
  const ABRA_SILENCE_MS = FRAGMENT_SILENCE_MS;
  const ABRA_CONTINUE_MS = FRAGMENT_CONTINUE_MS;
  const ABRA_MAX_WAITS = FRAGMENT_MAX_WAITS;
  // Auto-close after 2 min of no voice — an open Deepgram stream is billed by
  // duration, so an idle mic keeps costing money. Reset on every voice fragment.
  const voiceIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ABRA_IDLE_MS = 120000;
  const flushVoiceBuffer = useCallback((force = false) => {
    if (voiceFlushTimer.current) { clearTimeout(voiceFlushTimer.current); voiceFlushTimer.current = null; }
    const cmd = voiceBuffer.current.trim();
    // A split command ("rename Task 8 to" … pause … "Approve") — keep the buffer
    // and wait a bit longer for the continuation rather than running the half.
    if (!force && cmd && isIncompleteCommand(cmd) && voiceWaits.current < ABRA_MAX_WAITS) {
      voiceWaits.current += 1;
      voiceFlushTimer.current = setTimeout(() => flushVoiceBuffer(), ABRA_CONTINUE_MS);
      return;
    }
    voiceWaits.current = 0;
    voiceBuffer.current = "";
    setVoiceInterim("");
    if (cmd) void runAbraCommandRef.current(cmd);
  }, []);

  const stopAbraListening = useCallback(() => {
    voiceStopRequested.current = true;
    if (voiceIdleTimer.current) { clearTimeout(voiceIdleTimer.current); voiceIdleTimer.current = null; }
    voiceDictRef.current?.stop();
    voiceDictRef.current = null;
    setVoiceListening(false);
    setAbraConnecting(false);
    // "stop" ends everything: a numbered pick or a parked confirmation dies with the mic.
    setRenameFlow(null);
    setMessageFlow(null);
    pendingConfirmRef.current = null;
    flushVoiceBuffer(true); // apply anything still buffered (force — no more is coming)
  }, [flushVoiceBuffer, setRenameFlow, setMessageFlow]);
  stopAbraListeningRef.current = stopAbraListening;

  // (Re)arm the 2-minute idle auto-close; called on every voice fragment.
  const bumpAbraIdle = useCallback(() => {
    if (voiceIdleTimer.current) clearTimeout(voiceIdleTimer.current);
    voiceIdleTimer.current = setTimeout(() => {
      setVoiceLog((prev) => [...prev, { id: nanoid(), heard: "", summary: "Voice Assist closed — 2 minutes idle", ok: true }]);
      stopAbraListening();
    }, ABRA_IDLE_MS);
  }, [stopAbraListening]);

  const toggleAbraListening = useCallback(async () => {
    if (voiceListening || voiceDictRef.current) { stopAbraListening(); return; }
    voiceStopRequested.current = false;
    voiceBuffer.current = "";
    voiceMicOpenedAt.current = Date.now(); // the open session has no usage row yet — Cost adds its seconds live
    setVoiceListening(true);
    setAbraConnecting(true);
    const handle = await startDictation({
      // V1: bias the recogniser toward the names on THIS diagram. Computed at
      // OPEN because Deepgram fixes its keyword list when the socket opens —
      // which is also why the number-word elevation cannot live here and sits
      // in the pick handler instead.
      keyterms: diagramKeyterms(elementsRef.current.map((e) => e.label)),
      onEngine: (e) => setAbraEngine(e),
      onReady: () => setAbraConnecting(false),
      // Show the command building: buffered fragments + the in-progress words.
      onInterim: (t) => { bumpAbraIdle(); setVoiceInterim((voiceBuffer.current ? voiceBuffer.current + " " : "") + t); },
      onText: (t) => {
        bumpAbraIdle();
        const txt = t.trim();
        if (!txt) return;
        // Spoken "stop" ALWAYS ends the session (stopWords.ts) — a numbered pick
        // ends with "done", so the two can no longer be confused.
        if (isMicStopWord(txt)) {
          voiceBuffer.current = "";
          stopAbraListening();
          return;
        }
        // A RELIABLE WAY OUT, WITHOUT STOPPING THE MICROPHONE.
        //
        // Paul, 2026-09-25: "I can't reliably exit the command after it
        // mis-hears. It keeps adding words like 'stop', 'done', 'cancel' and
        // 'exit'. The only way out is to stop and restart."
        //
        // Exactly so, and here is the mechanism. A mis-hear leaves a half
        // command in the buffer — "rename Task 8 to" — which `isIncompleteCommand`
        // then HOLDS, waiting up to three times 3.2s for the rest of the
        // sentence. Every word said during that hold is appended, including the
        // one meant to escape: "rename Task 8 to" + "cancel" becomes a complete
        // command that renames the element to "Cancel". The escape word was
        // being eaten by the thing it was trying to escape.
        //
        // `isMicStopWord` was already checked HERE, at the fragment, before the
        // buffer can swallow it — which is why "stop" worked and nothing else
        // did. A flow-end word now gets the same treatment: the buffer is
        // dropped unexamined, the pending flush is cancelled, and the word goes
        // on to close whatever is open.
        if (isFlowEndWord(txt)) {
          voiceBuffer.current = "";
          voiceWaits.current = 0;
          if (voiceFlushTimer.current) { clearTimeout(voiceFlushTimer.current); voiceFlushTimer.current = null; }
          setVoiceInterim("");
          const anythingOpen = !!(renameFlowRef.current || messageFlowRef.current
            || templateFlowRef.current || pickFlowRef.current || pendingConfirmRef.current);
          if (anythingOpen) {
            // Let the runner close it properly — each flow has its own tidy-up.
            void runAbraCommandRef.current(txt);
          } else {
            // Nothing open: the half-command is already gone, which IS the
            // reset. Say so rather than sending a bare "cancel" to the AI,
            // which would cost a metered call to accomplish nothing.
            setVoiceLog((prev) => [...prev, {
              id: nanoid(), at: Date.now(), heard: txt,
              summary: "cleared — listening for the next command", ok: true,
            }]);
          }
          return;
        }
        // Accumulate this fragment and restart the silence timer. A fresh
        // fragment may complete a held command, so re-evaluate from scratch.
        voiceBuffer.current = (voiceBuffer.current ? voiceBuffer.current + " " : "") + txt;
        voiceWaits.current = 0;
        setVoiceInterim(voiceBuffer.current);
        const buf = voiceBuffer.current.trim();
        // #5 Instant: show badges the moment a "rename <type>" is heard, and pick
        // a number the moment it's spoken — skip the silence wait entirely.
        const flow = renameFlowRef.current;
        if (flow?.phase === "pick" && /(?:^|\s)(?:\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)(?:\s|$)/i.test(buf)) { flushVoiceBuffer(true); return; }
        if (!flow) { const p = parseCommand(buf); if (p && p.length === 1 && p[0].op === "renameByType") { flushVoiceBuffer(true); return; } }
        if (voiceFlushTimer.current) clearTimeout(voiceFlushTimer.current);
        voiceFlushTimer.current = setTimeout(() => flushVoiceBuffer(), ABRA_SILENCE_MS);
      },
      onError: (msg) => setVoiceLog((prev) => [...prev, { id: nanoid(), heard: "", summary: msg, ok: false }]),
      onEnd: () => { voiceDictRef.current = null; setVoiceListening(false); flushVoiceBuffer(true); },
    });
    if (!handle || voiceStopRequested.current) { handle?.stop(); voiceDictRef.current = null; setVoiceListening(false); return; }
    voiceDictRef.current = handle;
    bumpAbraIdle(); // start the idle clock even if no voice ever arrives
  }, [voiceListening, stopAbraListening, flushVoiceBuffer, bumpAbraIdle]);

  // Escape cancels a guided pick (rename or message) at any phase.
  useEffect(() => {
    if (!renameFlow && !messageFlow && !pickFlow && !templateFlow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (renameFlow) cancelRenameFlow("rename cancelled");
      if (messageFlow) { setMessageFlow(null); setVoiceLog((prev) => [...prev, { id: nanoid(), heard: "", summary: "message cancelled", ok: true }]); }
      if (pickFlow) { setPickFlow(null); setVoiceLog((prev) => [...prev, { id: nanoid(), heard: "", summary: "cancelled", ok: true }]); }
      // Esc takes the provisional template back off with it — the window is
      // shut either way, and leaving a half-chosen template behind would be
      // the one outcome nobody asked for.
      if (templateFlow) {
        const summary = closeTemplateFlowRef.current(false);
        setVoiceLog((prev) => [...prev, { id: nanoid(), heard: "", summary, ok: true }]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [renameFlow, messageFlow, pickFlow, templateFlow, cancelRenameFlow, setMessageFlow, setPickFlow]);

  // Stop the mic when the mode is turned off or the editor unmounts.
  useEffect(() => {
    if (!voiceAssistOn && voiceDictRef.current) stopAbraListening();
  }, [voiceAssistOn, stopAbraListening]);
  useEffect(() => () => { voiceDictRef.current?.stop(); }, []);

  const isContext = diagramType === "context" || diagramType === "basic";
  const defaultDirectionType: DirectionType =
    isContext                            ? "open-directed" :
    diagramType === "process-context" ? "non-directed" :
    diagramType === "state-machine"   ? "open-directed" :
    diagramType === "value-chain"     ? "directed" :
    "directed";

  const defaultRoutingType: RoutingType =
    isContext                            ? "curvilinear" :
    diagramType === "process-context" ? "direct" :
    diagramType === "state-machine"   ? "curvilinear" :
    diagramType === "value-chain"     ? "rectilinear" :
    "rectilinear";

  const poolHasContent = selectedElement?.type === "pool"
    ? data.elements.some((e) => e.parentId === selectedElement.id)
    : false;

  const laneHasContent = selectedElement?.type === "lane"
    ? data.elements.some((e) => e.parentId === selectedElement.id)
    : false;

  const parentName = selectedElement?.parentId
    ? data.elements.find((e) => e.id === selectedElement.parentId)?.label || undefined
    : undefined;

  const EVENT_TYPES_SET = new Set(["start-event", "intermediate-event", "end-event"]);
  const hasMessageBpmnConnection =
    selectedElement !== null &&
    EVENT_TYPES_SET.has(selectedElement.type) &&
    data.connectors.some(
      (c) => c.type === "messageBPMN" &&
        (c.sourceId === selectedElement.id || c.targetId === selectedElement.id)
    );

  const hasSystemBoundary = data.elements.some((e) => e.type === "system-boundary");
  const disabledSymbols: SymbolType[] = hasSystemBoundary ? ["system-boundary"] : [];

  const handleAddConnector = useCallback(
    (
      sourceId: string,
      targetId: string,
      type: ConnectorType,
      directionType: DirectionType,
      routingType: RoutingType,
      sourceSide: Side,
      targetSide: Side,
      sourceOffsetAlong?: number,
      targetOffsetAlong?: number,
      force?: boolean,
      initialLabel?: string
    ) => {
      addConnector(sourceId, targetId, type, directionType, routingType, sourceSide, targetSide, sourceOffsetAlong, targetOffsetAlong, force, initialLabel);
    },
    [addConnector]
  );

  // Review Mode: place a pink note (pre-filled with the reviewer's name +
  // email) and, when dropped over an element, a review-comment-link to it.
  const handleAddReviewComment = useCallback(
    (worldPos: { x: number; y: number }, targetElementId: string | null) => {
      if (!reviewCtx) return;
      const commentId = nanoid();
      const authorName = reviewCtx.myName ?? "Reviewer";
      const stamp = fmtReviewStamp(new Date());
      addElementGated("review-comment", worldPos, undefined, undefined, commentId, {
        label: "",
        width: reviewCommentWidth(authorName, stamp),
        height: REVIEW_COMMENT_H,
        properties: {
          reviewId: reviewCtx.reviewId,
          reviewerId: reviewCtx.myUserId,
          reviewerName: reviewCtx.myName,
          reviewerEmail: reviewCtx.myEmail,
          authorName,
          createdStamp: stamp,
        },
      });
      if (targetElementId) {
        addConnector(commentId, targetElementId, "review-comment-link", "directed", "direct", "left", "right", undefined, undefined, true);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reviewCtx, addConnector]
  );

  function handleToggleDisplayMode(mode?: DisplayMode) {
    const newMode: DisplayMode = mode ?? (displayMode === "hand-drawn" ? "normal" : "hand-drawn");
    setDisplayMode(newMode);
    fetch(`/api/diagrams/${diagramId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayMode: newMode }),
    }).catch(() => {/* best-effort persist */});
  }

  // SVG/PDF capture the LIVE canvas DOM, so to exclude annotations we flip the
  // show* toggles (via exportHide) with flushSync, capture, then restore — no
  // data mutation, no flicker the user commits.
  function withExportHidden<T>(inc: AnnotationInclude, run: () => T): T {
    const hide = { reviewComments: !inc.reviewComments, painPoints: !inc.painPoints, issues: !inc.issues };
    const needHide = hide.reviewComments || hide.painPoints || hide.issues;
    if (needHide) flushSync(() => setExportHide(hide));
    try { return run(); }
    finally { if (needHide) setExportHide(null); }
  }

  function handleExport(inc: AnnotationInclude = NO_ANNOTATIONS) {
    withExportHidden(inc, () => {
      const svgEl = document.querySelector<SVGSVGElement>("svg[data-canvas]");
      if (svgEl) exportSvg(svgEl, diagramName);
    });
  }

  async function handleExportPdf(inc: AnnotationInclude = NO_ANNOTATIONS) {
    const svgEl = document.querySelector<SVGSVGElement>("svg[data-canvas]");
    if (!svgEl) return;
    const hide = { reviewComments: !inc.reviewComments, painPoints: !inc.painPoints, issues: !inc.issues };
    const needHide = hide.reviewComments || hide.painPoints || hide.issues;
    if (needHide) flushSync(() => setExportHide(hide));
    try {
      // Bounds come from the filtered data so hidden annotations don't pad the page.
      await exportPdf(svgEl, diagramName, filterAnnotations(data, inc), pdfScale / 100);
    } finally {
      if (needHide) setExportHide(null);
    }
  }

  // Open the export-options dialog (PDF always needs it for scale; SVG/JSON only
  // when the diagram actually has annotations to offer excluding).
  function openExport(format: "svg" | "pdf" | "json") {
    // JSON is a full-fidelity envelope — it ALWAYS carries everything (Review
    // Comments, Pain Points, Issues, bottleneck, all properties + simulation
    // params), so it never shows the include/exclude dialog. Only the visual
    // exports (SVG/PDF) offer hiding annotations.
    if (format === "json") { void handleExportJson(); return; }
    if (format !== "pdf" && !hasAnnotations(data)) {
      handleExport(NO_ANNOTATIONS);
      return;
    }
    setExportInc(NO_ANNOTATIONS);
    if (format === "pdf") setPendingPdfScale(pdfScale);
    setExportDlg(format);
  }

  // Export the current diagram's data as a JSON file (single-diagram envelope
  // matching the project export format so it round-trips through Import JSON).
  // Build the single-diagram JSON envelope string (shared by export + preview).
  async function buildDiagramJsonString(): Promise<string> {
    // Full fidelity: JSON export/import must ALWAYS include annotations.
    const { SCHEMA_VERSION, PRODUCT_VERSION } = await import("@/app/lib/diagram/types");
    let appVersion = PRODUCT_VERSION;
    try {
      const resp = await fetch("/api/schema");
      if (resp.ok) {
        const xsdText = await resp.text();
        const m = xsdText.match(/Generated by Diagramatix ([\d.]+)/);
        if (m) appVersion = m[1];
      }
    } catch { /* best-effort */ }
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      appVersion,
      exportedAt: new Date().toISOString(),
      project: { name: "(single diagram)", description: "", ownerName: "", colorConfig: {} },
      diagrams: [{ originalId: diagramId, name: diagramName, type: diagramType, data, colorConfig: diagramColorConfig, displayMode }],
    };
    return JSON.stringify(payload, null, 2);
  }

  async function handleExportJson() {
    const blob = new Blob([await buildDiagramJsonString()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${diagramName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Build an export in-memory and show it in the preview pop-up instead of
  // downloading — so it can be demonstrated on camera during a screencast.
  async function handlePreview(format: "pdf" | "svg" | "json" | "xml" | "bpmn" | "visio" | "xsd") {
    closeFm();
    try {
      if (format === "xsd") {
        // The export XSD, rendered live by /api/schema (version placeholders resolved).
        const res = await fetch("/api/schema", { cache: "no-store" });
        if (!res.ok) return;
        const xsd = await res.text();
        setPreviewPayload({ kind: "xml", title: `XSD (schema v${SCHEMA_VERSION})`, text: xsd, downloadName: `diagramatix-export-schema-v${SCHEMA_VERSION}.xsd`, downloadMime: "application/xml", cancelLabel: "Cancel", exportLabel: "Export" });
        return;
      }
      if (format === "visio") {
        // Fake-Visio window: the live canvas SVG shown as if open in Visio.
        const svgEl = document.querySelector<SVGSVGElement>("svg[data-canvas]");
        if (!svgEl) return;
        const svg = exportSvg(svgEl, diagramName, "string") as string;
        setPreviewPayload({ kind: "vsdx", title: `${diagramName}.vsdx`, text: svg });
        return;
      }
      if (format === "svg" || format === "pdf") {
        const svgEl = document.querySelector<SVGSVGElement>("svg[data-canvas]");
        if (!svgEl) return;
        if (format === "svg") {
          const svg = exportSvg(svgEl, diagramName, "string") as string;
          setPreviewPayload({ kind: "svg", title: `${diagramName}.svg`, text: svg, downloadName: `${diagramName}.svg`, downloadMime: "image/svg+xml" });
        } else {
          const blob = (await exportPdf(svgEl, diagramName, data, pdfScale / 100, "blob")) as Blob;
          if (blob) setPreviewPayload({ kind: "pdf", title: `${diagramName}.pdf`, blob, downloadName: `${diagramName}.pdf` });
        }
        return;
      }
      if (format === "json") {
        setPreviewPayload({ kind: "json", title: `${diagramName}.json`, text: await buildDiagramJsonString(), downloadName: `${diagramName}.json`, downloadMime: "application/json" });
        return;
      }
      if (format === "xml") {
        const { buildSingleDiagramXml } = await import("@/app/lib/diagram/xmlExport");
        const { SCHEMA_VERSION, PRODUCT_VERSION } = await import("@/app/lib/diagram/types");
        const xml = buildSingleDiagramXml({ schemaVersion: SCHEMA_VERSION, appVersion: PRODUCT_VERSION, diagramName, diagramType, diagramData: filterAnnotations(data, NO_ANNOTATIONS), diagramId, displayMode, diagramColorConfig });
        setPreviewPayload({ kind: "xml", title: `${diagramName}.xml`, text: xml, downloadName: `${diagramName}.xml`, downloadMime: "application/xml" });
        return;
      }
      if (format === "bpmn") {
        // Carries the simulation model too (embedded BPSim), so the .bpmn is a
        // complete picture of the process rather than structure alone.
        const { buildBpmnXmlWithSim } = await import("@/app/lib/simulation/bpsim/exportBpmnWithSim");
        setPreviewPayload({ kind: "bpmn", title: `${diagramName}.bpmn`, text: buildBpmnXmlWithSim(data, diagramName), downloadName: `${diagramName}.bpmn`, downloadMime: "application/xml" });
      }
    } catch { /* preview is best-effort */ }
  }

  // SuperAdmin: export the full diagram BUNDLE — the diagram plus its linked AI
  // prompt (incl. the 2-phase plan), its comparison matrix, and the per-model
  // comparison diagrams — as one file. Re-imported via a project's "Import
  // Diagram Bundle". Assembled server-side (client lacks aiComparison/planJson).
  async function handleExportBundle() {
    try {
      const res = await fetch(`/api/admin/diagram-bundle/${diagramId}`);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `Bundle export failed (${res.status})`);
      }
      const bundle = await res.json();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${diagramName}.bundle.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setBundleMsg(e instanceof Error ? e.message : "Bundle export failed");
    }
  }

  // Import a JSON or XML file, take its FIRST diagram, and replace the
  // current diagram's contents. Auto-save will persist the new content.
  async function handleImportFile(file: File, format: "json" | "xml") {
    try {
      const text = await file.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let parsed: any;
      if (format === "xml") {
        const { parseDiagramatixXml } = await import("@/app/lib/diagram/xmlExport");
        parsed = parseDiagramatixXml(text);
      } else {
        parsed = JSON.parse(text);
      }
      if (!parsed || !Array.isArray(parsed.diagrams) || parsed.diagrams.length === 0) {
        alert("Invalid file: contains no diagrams");
        return;
      }
      const first = parsed.diagrams[0];
      if (!first || typeof first.data !== "object") {
        alert("Invalid file: first diagram has no data");
        return;
      }
      // Schema version check (structural XSD integer, tolerant of legacy "1.NN")
      const { checkSchemaCompatibility } = await import("@/app/lib/diagram/types");
      const schemaVer: string = parsed.schemaVersion ?? parsed.version ?? "";
      if (schemaVer) {
        const compat = checkSchemaCompatibility(schemaVer);
        if (!compat.ok) { alert(compat.message); return; }
        if (compat.message) alert(compat.message);
      }
      const diagCount = parsed.diagrams.length;
      const message = diagCount > 1
        ? `This file contains ${diagCount} diagrams. Only the first one ("${first.name ?? "(unnamed)"}") will be imported into the current diagram, replacing its contents. Continue?`
        : `Replace the current diagram contents with the imported diagram "${first.name ?? "(unnamed)"}"? This cannot be undone.`;
      setPendingImport({
        message,
        apply: () => {
          setData(first.data);
          if (first.colorConfig && typeof first.colorConfig === "object") {
            setDiagramColorConfig(first.colorConfig as SymbolColorConfig);
          }
          if (typeof first.displayMode === "string") {
            setDisplayMode(first.displayMode as DisplayMode);
          }
        },
      });
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Export the current diagram as XML alongside the latest XSD schema.
  // Two files are downloaded: <diagramName>.xml and diagramatix-export-v*.xsd.
  async function handleExportXml() {
    const { buildSingleDiagramXml, downloadMatchingXsd } = await import("@/app/lib/diagram/xmlExport");
    const { SCHEMA_VERSION, PRODUCT_VERSION } = await import("@/app/lib/diagram/types");

    // XML carries schemaVersion (the XSD integer) + appVersion (the product version).
    // Resolve the product version from /api/schema so it matches the deployed build;
    // fall back to the compiled-in PRODUCT_VERSION.
    let appVersion = PRODUCT_VERSION;
    try {
      const resp = await fetch("/api/schema");
      if (resp.ok) {
        const xsdText = await resp.text();
        const m = xsdText.match(/Generated by Diagramatix ([\d.]+)/);
        if (m) appVersion = m[1];
      }
    } catch { /* keep compiled product version */ }

    const xml = buildSingleDiagramXml({
      schemaVersion: SCHEMA_VERSION,
      appVersion,
      diagramName,
      diagramType,
      diagramData: filterAnnotations(data, NO_ANNOTATIONS), // XML never carries annotations (item O)
      diagramId,
      displayMode,
      diagramColorConfig: diagramColorConfig,
    });

    // Trigger XML download
    const xmlBlob = new Blob([xml], { type: "application/xml" });
    const xmlUrl = URL.createObjectURL(xmlBlob);
    const a1 = document.createElement("a");
    a1.href = xmlUrl;
    a1.download = `${diagramName}.xml`;
    document.body.appendChild(a1);
    a1.click();
    document.body.removeChild(a1);
    setTimeout(() => URL.revokeObjectURL(xmlUrl), 1000);

    // Always download the matching XSD alongside (best-effort, no-op on failure)
    await downloadMatchingXsd(SCHEMA_VERSION);
  }

  // Export standard OMG BPMN 2.0 XML (.bpmn) — opens in Camunda / bpmn.io / etc.
  async function handleExportBpmn() {
    const { buildBpmnXmlWithSim } = await import("@/app/lib/simulation/bpsim/exportBpmnWithSim");
    const xml = buildBpmnXmlWithSim(data, diagramName);
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${diagramName}.bpmn`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── SharePoint: Save the diagram's data files into a chosen folder ──
  // Uploads XML + matching XSD + JSON (and the Visio .vsdx for BPMN) — the
  // same artefacts the local Export menu produces, written straight to
  // SharePoint / OneDrive via the binary-safe upload route.
  // Save ONE chosen export format into the picked SharePoint / OneDrive folder.
  // Mirrors the Local export formats — the user picks the format first, then
  // the destination folder.
  async function saveFormatToSharePoint(
    format: "pdf" | "svg" | "json" | "xml" | "visio",
    sel: { driveId: string; itemId: string | null; name: string },
  ) {
    setSpBusy(true);
    try {
      const safe = (diagramName || "diagram").replace(/[\\/:*?"<>|]/g, "_");
      async function uploadOne(filename: string, contentType: string, body: Blob | string) {
        const fd = new FormData();
        fd.append("driveId", sel.driveId);
        if (sel.itemId) fd.append("folderItemId", sel.itemId);
        fd.append("filename", filename);
        fd.append("contentType", contentType);
        const blob = body instanceof Blob ? body : new Blob([body], { type: contentType });
        fd.append("file", blob, filename);
        const r = await fetch("/api/sharepoint/upload", { method: "POST", body: fd });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Upload of ${filename} failed`);
      }
      // Resolve the runtime app/schema version (for JSON + XML/XSD).
      async function resolveVersion(): Promise<{ appVersion: string; xsdText: string }> {
        const { PRODUCT_VERSION } = await import("@/app/lib/diagram/types");
        let appVersion = PRODUCT_VERSION; let xsdText = "";
        try {
          const resp = await fetch("/api/schema");
          if (resp.ok) { xsdText = await resp.text(); const m = xsdText.match(/Generated by Diagramatix ([\d.]+)/); if (m) appVersion = m[1]; }
        } catch { /* best-effort */ }
        return { appVersion, xsdText };
      }

      let saved = "";
      if (format === "json") {
        const { SCHEMA_VERSION } = await import("@/app/lib/diagram/types");
        const { appVersion } = await resolveVersion();
        const payload = {
          schemaVersion: SCHEMA_VERSION, appVersion, exportedAt: new Date().toISOString(),
          project: { name: "(single diagram)", description: "", ownerName: "", colorConfig: {} },
          diagrams: [{ originalId: diagramId, name: diagramName, type: diagramType, data, colorConfig: diagramColorConfig, displayMode }],
          ...(dataHasPcf(data) ? { pcfAttribution: APQC_ATTRIBUTION } : {}),
        };
        await uploadOne(`${safe}.json`, "application/json", JSON.stringify(payload, null, 2));
        saved = `${safe}.json`;
      } else if (format === "xml") {
        const { buildSingleDiagramXml } = await import("@/app/lib/diagram/xmlExport");
        const { SCHEMA_VERSION } = await import("@/app/lib/diagram/types");
        const { appVersion, xsdText } = await resolveVersion();
        const xml = buildSingleDiagramXml({
          schemaVersion: SCHEMA_VERSION, appVersion, diagramName, diagramType,
          diagramData: data, diagramId, displayMode, diagramColorConfig,
          pcfAttribution: dataHasPcf(data) ? APQC_ATTRIBUTION : undefined,
        });
        await uploadOne(`${safe}.xml`, "application/xml", xml);
        if (xsdText) await uploadOne(`diagramatix-export-v${appVersion}.xsd`, "application/xml", xsdText);
        saved = `${safe}.xml${xsdText ? " + .xsd" : ""}`;
      } else if (format === "svg") {
        const svgEl = document.querySelector<SVGSVGElement>("svg[data-canvas]");
        if (!svgEl) throw new Error("Canvas not found");
        const clone = svgEl.cloneNode(true) as SVGSVGElement;
        clone.removeAttribute("tabindex");
        await uploadOne(`${safe}.svg`, "image/svg+xml", new XMLSerializer().serializeToString(clone));
        saved = `${safe}.svg`;
      } else if (format === "pdf") {
        const svgEl = document.querySelector<SVGSVGElement>("svg[data-canvas]");
        if (!svgEl) throw new Error("Canvas not found");
        const blob = (await exportPdf(svgEl, diagramName, data, pdfScale / 100, "blob")) as Blob;
        await uploadOne(`${safe}.pdf`, "application/pdf", blob);
        saved = `${safe}.pdf`;
      } else if (format === "visio") {
        const vr = await fetch(`/api/export/visio-v3?diagramId=${diagramId}&profile=v1.6`);
        if (!vr.ok) throw new Error("Visio export failed");
        await uploadOne(`${safe}.vsdx`, "application/vnd.ms-visio.drawing", await vr.blob());
        saved = `${safe}.vsdx`;
      }
      setSpMessage({ title: "Saved to SharePoint", body: `Saved ${saved} to "${sel.name}".`, tone: "info" });
    } catch (err) {
      setSpMessage({ title: "Save failed", body: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setSpBusy(false);
    }
  }

  // ── SharePoint: Open (import) a chosen file ──
  // Downloads the picked file and routes it into the existing import pipeline
  // by extension: .json/.xml → replace current diagram; .vsdx → Visio import;
  // .bpmn → OMG BPMN import (both create a new diagram).
  async function handleOpenFromSharePoint(sel: { driveId: string; itemId: string | null; name: string }) {
    if (!sel.itemId) return;
    setSpBusy(true);
    try {
      const r = await fetch(`/api/sharepoint/download?driveId=${encodeURIComponent(sel.driveId)}&itemId=${encodeURIComponent(sel.itemId)}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Download failed");
      const blob = await r.blob();
      const file = new File([blob], sel.name);
      const lower = sel.name.toLowerCase();
      if (lower.endsWith(".json")) await handleImportFile(file, "json");
      else if (lower.endsWith(".xml")) await handleImportFile(file, "xml");
      else if (lower.endsWith(".vsdx")) await handleImportVisioFile(file);
      else if (lower.endsWith(".bpmn")) await handleImportBpmnFile(file);
      else setSpMessage({ title: "Unsupported file", body: `"${sel.name}" isn't a Diagramatix import format (.json, .xml, .vsdx, .bpmn).`, tone: "error" });
    } catch (err) {
      setSpMessage({ title: "Open failed", body: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setSpBusy(false);
    }
  }

  // Export every template of the given scope as a `.diag_tems` JSON file.
  async function handleExportTemplates(scope: "user" | "builtin") {
    try {
      const resp = await fetch(`/api/templates/export?type=${scope}`);
      if (!resp.ok) {
        const txt = await resp.text();
        alert(`Template export failed: ${txt || resp.statusText}`);
        return;
      }
      // Use the server-supplied filename if present.
      const cd = resp.headers.get("Content-Disposition") ?? "";
      const m = cd.match(/filename="([^"]+)"/);
      const fallback = `diagramatix-templates-${scope}-${new Date().toISOString().slice(0, 10)}.diag_tems`;
      const filename = m?.[1] ?? fallback;
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      alert(`Template export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Import a Visio (.vsdx) file from the in-editor menu.
  //
  // Two phases:
  //   1. handleImportVisioFile — entry point from the file input. If the
  //      .vsdx basename matches the current diagram's name, opens the
  //      overwrite-confirm dialog (Diagramatix's native ConfirmDialog,
  //      NOT window.confirm) and stashes the file for the dialog's
  //      onConfirm / onCancel handlers. Otherwise proceeds directly to
  //      the create path.
  //   2. runVisioImport — does the actual API call once the user has
  //      made a decision (or there was no name conflict). Called with
  //      `overwrite=true` from the dialog's OK handler, `false` from
  //      its Cancel handler or directly when no prompt is needed.
  async function handleImportVisioFile(file: File) {
    const baseName = file.name.replace(/\.vsdx$/i, "").trim() || "Imported Visio Diagram";
    if (baseName === diagramName) {
      setPendingVisioImport({ file, baseName, kind: "visio" });
      return;
    }
    await runVisioImport(file, baseName, false);
  }

  async function runVisioImport(file: File, baseName: string, overwrite: boolean) {
    try {
      const form = new FormData();
      form.append("file", file);
      if (projectId) form.append("projectId", projectId);
      form.append("name", baseName);
      if (overwrite) form.append("overwriteDiagramId", diagramId);
      const resp = await fetch("/api/import/visio-v3", { method: "POST", body: form });
      if (!resp.ok) {
        const txt = await resp.text();
        alert(`Visio import failed: ${txt || resp.statusText}`);
        return;
      }
      const result = await resp.json() as VisioImportResult & { overwrote?: boolean };
      if (result.overwrote && result.diagram?.data) {
        // Replace the in-memory reducer state with the imported parse
        // result. The auto-save's lastSaved ref still holds the OLD JSON
        // string, so it'll consider the diagram "unsaved" briefly until
        // the next user action — harmless visual nuance; the server has
        // the imported data committed.
        setData(result.diagram.data);
      }
      setVisioImportStatus(result);
    } catch (err) {
      alert(`Visio import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── BPMN file import (.bpmn — OMG BPMN 2.0 XML) ─────────────────────
  // Mirrors the Visio flow: name-conflict prompt → create-or-overwrite,
  // then surfaces the existing status modal. The single-file BPMN
  // endpoint accepts the same overwriteDiagramId field as the Visio
  // route. Stats reshaped into VisioImportResult so the modal renders.
  /**
   * ARIS AML import. Every eEPC in the export becomes its own diagram; the
   * editor navigates to the first and the status modal lists the rest.
   *
   * The warnings are the interesting half. A real ARIS repository is full of
   * objects an EPC does not draw, and connection codes this importer has never
   * seen — those are reported rather than dropped in silence, and this is where
   * a person reads them.
   */
  async function handleImportAmlFile(file: File) {
    const baseName = file.name.replace(/\.(aml|xml)$/i, "").trim() || "Imported EPC";
    /** Reuse the import status modal — the warnings are the point of an AML
     *  import, and this is where a person reads them. Its stats block is
     *  Visio-shaped; the fields that have no meaning here stay at zero rather
     *  than being given a number that would read as a finding. */
    const show = (diagram: { id: string }, warnings: string[], elements = 0, connectors = 0) =>
      setVisioImportStatus({
        kind: "bpmn",
        diagram,
        warnings,
        stats: {
          totalShapesOnPage: elements,
          elementsCreated: elements,
          connectorsCreated: connectors,
          shapesSkipped: 0,
          connectorsSkipped: 0,
          implicitPools: 0,
          masters: [],
        },
      });

    try {
      const form = new FormData();
      form.append("file", file);
      if (projectId) form.append("projectId", projectId);
      const resp = await fetch("/api/import/aml", { method: "POST", body: form });
      const body = await resp.json().catch(() => null);
      if (!resp.ok) {
        show({ id: "" }, [body?.error ?? `ARIS import failed (${resp.status}).`, ...(body?.warnings ?? [])]);
        return;
      }
      show(
        body.diagram ?? { id: "" },
        body.warnings ?? [],
        body.stats?.elementsCreated ?? 0,
        body.stats?.connectorsCreated ?? 0,
      );
    } catch (err) {
      show({ id: "" }, [`ARIS import failed: ${err instanceof Error ? err.message : String(err)}`]);
    }
  }

  async function handleImportBpmnFile(file: File) {
    const baseName = file.name.replace(/\.bpmn$/i, "").replace(/\.xml$/i, "").trim() || "Imported BPMN Diagram";
    if (baseName === diagramName) {
      setPendingVisioImport({ file, baseName, kind: "bpmn" });
      return;
    }
    await runBpmnImport(file, baseName, false);
  }

  async function runBpmnImport(file: File, baseName: string, overwrite: boolean) {
    try {
      const form = new FormData();
      form.append("file", file);
      if (projectId) form.append("projectId", projectId);
      form.append("name", baseName);
      if (overwrite) form.append("overwriteDiagramId", diagramId);
      const resp = await fetch("/api/import/bpmn", { method: "POST", body: form });
      if (!resp.ok) {
        const txt = await resp.text();
        alert(`BPMN import failed: ${txt || resp.statusText}`);
        return;
      }
      const result = await resp.json() as {
        diagram: { id: string; data?: DiagramData };
        warnings: string[];
        stats: {
          processCount: number;
          participantCount: number;
          elementsCreated: number;
          connectorsCreated: number;
          shapesDropped: number;
          flowsDropped: number;
        };
        overwrote?: boolean;
        // Present when the .bpmn carried BPSim simulation parameters.
        bpsim?: { applied: boolean; scenario?: string | null; elements?: number; study?: { study: string; teams: number } };
      };
      if (result.overwrote && result.diagram?.data) {
        setData(result.diagram.data);
      }
      // Reshape into the existing single-import status modal shape.
      const reshaped: VisioImportResult & { overwrote?: boolean } = {
        kind: "bpmn",
        diagram: result.diagram,
        warnings: [
          `Imported BPMN file (processes: ${result.stats.processCount}, participants: ${result.stats.participantCount}).`,
          // A BPSim file arrives as .bpmn; report the simulation half of the
          // import so the annotations aren't a silent side effect.
          ...(result.bpsim?.applied
            ? [
                `◈ BPSim simulation data applied to ${result.bpsim.elements ?? 0} element(s)` +
                  (result.bpsim.scenario ? ` from scenario "${result.bpsim.scenario}"` : "") + ".",
                ...(result.bpsim.study
                  ? [result.bpsim.study.teams > 0
                      ? `◈ Study "${result.bpsim.study.study}" created with ${result.bpsim.study.teams} team(s) — open the Simulator to Run it.`
                      : `◈ Study "${result.bpsim.study.study}" created. The file names no resources, so it has no teams yet — use ⚙ Fill missing simulation data in the Simulator.`]
                  : []),
              ]
            : []),
          ...result.warnings,
        ],
        stats: {
          totalShapesOnPage: result.stats.elementsCreated + result.stats.shapesDropped,
          elementsCreated: result.stats.elementsCreated,
          connectorsCreated: result.stats.connectorsCreated,
          shapesSkipped: result.stats.shapesDropped,
          connectorsSkipped: result.stats.flowsDropped,
          implicitPools: 0,
          masters: [],
        },
        overwrote: result.overwrote,
      };
      setVisioImportStatus(reshaped);
    } catch (err) {
      alert(`BPMN import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleImportTemplatesFile(file: File, dest: "user" | "builtin") {
    try {
      const text = await file.text();
      let payload: unknown;
      try { payload = JSON.parse(text); }
      catch {
        setTemplateImportInfo({ title: "Template Import Failed", lines: ["The selected file is not valid JSON."] });
        return;
      }
      // Forward the parsed payload — the server validates shape and skips
      // duplicates by (name + diagramType).
      const resp = await fetch(`/api/templates/import?type=${dest}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        setTemplateImportInfo({
          title: "Template Import Failed",
          lines: [txt || resp.statusText],
        });
        return;
      }
      const summary = await resp.json() as { created: number; skipped: number; skippedNames: string[]; createdNames?: string[] };
      // Refresh the in-memory list so newly imported templates show up
      // without a page reload.
      try {
        const which = dest === "builtin" ? "builtin" : "user";
        const refresh = await fetch(`/api/templates?type=${which}`);
        if (refresh.ok) {
          const list = await refresh.json() as { id: string; name: string; diagramType: string; group: string | null }[];
          const bpmnOnly: TemplateRow[] = list
            .filter((t) => t.diagramType === "bpmn")
            .map((t) => ({ id: t.id, name: t.name, group: t.group ?? null }));
          if (dest === "builtin") setBuiltInTemplates(bpmnOnly);
          else setUserTemplates(bpmnOnly);
        }
      } catch { /* non-fatal — modal still shows results */ }
      const destLabel = dest === "builtin" ? "Built-In" : "User";
      const lines: string[] = [];
      lines.push(
        `Imported ${summary.created} template${summary.created === 1 ? "" : "s"} into the ${destLabel} list.`,
      );
      if (summary.skipped > 0) {
        const head = summary.skippedNames.slice(0, 8).join(", ");
        const tail = summary.skippedNames.length > 8 ? ", …" : "";
        lines.push(
          `Skipped ${summary.skipped} duplicate${summary.skipped === 1 ? "" : "s"}: ${head}${tail}`,
        );
      }
      setTemplateImportInfo({ title: "Template Import Complete", lines });
    } catch (err) {
      setTemplateImportInfo({
        title: "Template Import Failed",
        lines: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  function handleSaveAsTemplate() {
    const captured = captureTemplate(data.elements, data.connectors, selectedElementIds);
    if (captured.elements.length === 0) return;
    setPendingTemplateData(captured);
    setShowTemplateNameModal(true);
  }

  async function handleConfirmTemplateName(name: string, group: string | null) {
    if (!pendingTemplateData) return;
    const isBuiltIn = templateMode === "capturing-builtin";
    try {
      const body: Record<string, unknown> = { name, diagramType: "bpmn", data: pendingTemplateData, group };
      if (isBuiltIn) {
        body.templateType = "builtin";
        // No adminPassword payload — server gates by session (isSuperuser)
        // or by ADMIN_PASSWORD env var on the elevation path. Hardcoded
        // password string removed (was a leak in the client bundle).
      }
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("Failed to save template:", res.status, text);
        if (res.status === 403) { alert("Invalid admin password"); return; }
      } else {
        const created = await res.json();
        const createdRow: TemplateRow = {
          id: created.id,
          name: created.name,
          group: created.group ?? null,
        };
        if (isBuiltIn) {
          setBuiltInTemplates((prev) => [createdRow, ...prev]);
        } else {
          setUserTemplates((prev) => [createdRow, ...prev]);
        }
      }
    } catch (err) {
      console.error("Failed to save template:", err);
    }
    setPendingTemplateData(null);
    setShowTemplateNameModal(false);
    setTemplateMode("idle");
    setSelectedElementIds(new Set());
    setSelectedConnectorId(null);
  }

  /**
   * Put a template on the diagram to be LOOKED at — synchronously, once its
   * data has arrived, so the caller can log in the same tick.
   *
   * It is planned on and applied to the diagram WITHOUT whatever was showing
   * (templatePreview.ts `previewBase`): restored when the old preview is still
   * exactly as it was left, stripped by its ids when something else has
   * changed the diagram since, and the plain diagram when Ctrl+Z already took
   * it off. The swap pushes no second undo entry.
   *
   * After an element, the placement is templateAttach.ts's and the reducer
   * judges it first (a dry run): a template that would hang outside its lane,
   * land in another pool or not be joined is refused with that reason, and the
   * window stays open for another number with the old one still showing.
   */
  const showTemplate = useCallback((flow: TemplateFlow, card: TemplateCard, tdata: TemplateData): { ok: boolean; summary: string } => {
    const now = { ...data, elements: elementsRef.current, connectors: connectorsRef.current };
    const prov = flow.provisional;
    const plan = planTemplateShow(tdata, {
      data: now,
      provisional: prov,
      showing: !!prov && templateStillShowing(prov.stamp),
      ...(flow.anchorId ? { anchorId: flow.anchorId } : {}),
      at: flow.at ?? getViewportCenterRef.current?.() ?? { x: 200, y: 200 },
    });
    if ("refused" in plan) {
      const summary = plan.blame === "anchor" ? plan.refused
        : `“${card.name}” can’t follow “${flow.anchorName}” — ${plan.refused}; say another number`;
      const current = templateFlowRef.current;
      if (current) setTemplateFlow({ ...current, notice: summary });
      return { ok: false, summary };
    }
    armGoldFlash(now.elements);
    armDebugBefore(now.elements);
    const stamp = applyTemplate(plan.elements, plan.connectors, {
      ...(plan.join ? { join: plan.join } : {}),
      ...(plan.over ? { over: plan.over } : {}),
    });
    setSelectedElementIds(plan.newIds);
    setSelectedConnectorId(null);
    setTemplateFlow({
      ...flow,
      notice: null,
      provisional: {
        card, stamp, base: plan.base,
        ids: { elements: [...plan.newIds], connectors: plan.connectors.map((c) => c.id) },
      },
    });
    return { ok: true, summary: `${card.n} → “${card.name}”${flow.anchorName ? ` after “${flow.anchorName}”` : ""} — say “yes” to keep it` };
  }, [data, templateStillShowing, setTemplateFlow, armGoldFlash, armDebugBefore, applyTemplate]);
  const showTemplateRef = useRef(showTemplate);
  showTemplateRef.current = showTemplate;

  /** A number (or a click): fetch that template, then show it — unless a newer pick or a close came first. */
  const pickTemplateCard = useCallback(async (card: TemplateCard, report: TemplateReport) => {
    const flow = templateFlowRef.current;
    if (!flow) return;
    const seq = ++templatePickSeqRef.current;
    const tdata = await fetchTemplateData(card.id);
    const current = templateFlowRef.current;
    if (seq !== templatePickSeqRef.current || !current || current.openId !== flow.openId) return;
    if (!tdata) { report({ ok: false, summary: `couldn't load “${card.name}”` }); return; }
    report(showTemplateRef.current(current, card, tdata));
  }, []);

  /**
   * Close the window. Kept: nothing to do, it is already on the diagram.
   * Cancelled: one undo takes it off when it is still exactly as it was
   * shown; when something else has changed the diagram since, it is taken off
   * by its ids instead, so the other change survives; when Ctrl+Z already took
   * it off there is nothing left to do. Voice, Esc and the window's own
   * buttons all come here.
   */
  const closeTemplateFlow = useCallback((keep: boolean): string => {
    const flow = templateFlowRef.current;
    templatePickSeqRef.current++;
    setTemplateFlow(null);
    const prov = flow?.provisional;
    if (keep && prov) return `added template “${prov.card.name}”${flow?.anchorName ? ` after “${flow.anchorName}”` : ""}`;
    if (prov) {
      if (templateStillShowing(prov.stamp)) undo();
      else removeTemplate(prov.ids);
    }
    return "cancelled — no template added";
  }, [setTemplateFlow, templateStillShowing, undo, removeTemplate]);

  /** The window's numbered offer, for a plain window or one whose picks go after `anchor`. */
  const buildTemplateFlow = useCallback((anchor?: DiagramElement, at?: Point): TemplateFlow => {
    const hasWhiteBoxPool = elementsRef.current.some(
      (e) => e.type === "pool" && (e.properties?.poolType ?? "white-box") === "white-box",
    );
    const opts = { hasWhiteBoxPool, attaching: !!anchor };
    const b = templatesToOffer(builtInTemplates, opts);
    const u = templatesToOffer(userTemplates, opts);
    const sections = numberTemplates(b.offered, u.offered);
    return {
      openId: nanoid(),
      sections,
      cards: cardsOf(sections),
      provisional: null,
      hiddenInitial: b.hiddenInitial + u.hiddenInitial,
      hiddenContainer: b.hiddenContainer + u.hiddenContainer,
      ...(anchor ? { anchorId: anchor.id, anchorName: anchorNameOf(anchor) } : {}),
      ...(at ? { at } : {}),
      selectionAtOpen: [...selectedIdsRef.current],
      notice: null,
    };
  }, [builtInTemplates, userTemplates]);

  /** Open the window: every template this diagram may sensibly take, numbered. */
  const openTemplateWindowRef = useRef<(opts?: { anchorId?: string; at?: Point }) => string>(() => "");
  const openTemplateWindow = useCallback((opts: { anchorId?: string; at?: Point } = {}): string => {
    const anchor = opts.anchorId ? elementsRef.current.find((e) => e.id === opts.anchorId) : undefined;
    const flow = buildTemplateFlow(anchor, opts.at);
    if (!flow.cards.length) return anchor ? `no templates can follow “${anchorNameOf(anchor)}”` : "no templates to offer for this diagram";
    setTemplateFlow(flow);
    return templateWindowSummary(flow.cards.length, flow.hiddenInitial, flow.hiddenContainer, flow.anchorName);
  }, [buildTemplateFlow, setTemplateFlow]);

  /**
   * "After X", said once the window is open — "Add template." … "After
   * selected." with a pause between. The picks go after X from now on, and a
   * template already showing moves there (refused, it stays where it was).
   * An ambiguous name is refused BY NAME: the window covers the canvas, so
   * numbered badges could not be seen.
   */
  const reanchorTemplate = useCallback(async (ref: string, report: TemplateReport) => {
    const flow = templateFlowRef.current;
    if (!flow) return;
    const mine = new Set(flow.provisional?.ids.elements ?? []);
    const els = elementsRef.current.filter((e) => !mine.has(e.id));
    // A picked preview is selected, so it can be seen; "after selected" means
    // what was selected before it — never the template being moved.
    const live = selectedIdsRef.current.filter((id) => !mine.has(id));
    const selection = live.length ? live : flow.selectionAtOpen;
    const r = resolveRef(ref, els, voiceLastId.current, selection, { strict: true, pointer: pointerWorld.current });
    if (!r) {
      report({ ok: false, summary: isSelectionRef(ref) && !selection.length ? "nothing is selected" : `couldn't find “${ref}” — say its name` });
      return;
    }
    if ("ambiguous" in r) {
      const names = r.ambiguous.map((id) => els.find((e) => e.id === id)).filter((e): e is DiagramElement => !!e).map((e) => `“${anchorNameOf(e)}”`);
      report({ ok: false, summary: `which “${ref}”? ${names.length} match: ${names.slice(0, 4).join(", ")} — say the name` });
      return;
    }
    const anchor = els.find((e) => e.id === r.id)!;
    const why = whyTemplateCantFollow(anchor, els);
    if (why) { report({ ok: false, summary: why }); return; }
    const next = buildTemplateFlow(anchor);
    const showing = flow.provisional;
    if (!showing) {
      templatePickSeqRef.current++;
      setTemplateFlow({ ...next, openId: flow.openId, selectionAtOpen: flow.selectionAtOpen });
      report({ ok: true, summary: templateWindowSummary(next.cards.length, next.hiddenInitial, next.hiddenContainer, next.anchorName) });
      return;
    }
    const card = next.cards.find((c) => c.id === showing.card.id);
    if (!card) {
      report({ ok: false, summary: `“${showing.card.name}” brings a pool or lane of its own — it can’t follow “${anchorNameOf(anchor)}”` });
      return;
    }
    const seq = ++templatePickSeqRef.current;
    const tdata = await fetchTemplateData(card.id);
    const current = templateFlowRef.current;
    if (seq !== templatePickSeqRef.current || !current || current.openId !== flow.openId) return;
    if (!tdata) { report({ ok: false, summary: `couldn't load “${card.name}”` }); return; }
    report(showTemplateRef.current({ ...next, openId: current.openId, provisional: current.provisional, selectionAtOpen: current.selectionAtOpen }, card, tdata));
  }, [buildTemplateFlow, setTemplateFlow]);

  openTemplateWindowRef.current = openTemplateWindow;
  closeTemplateFlowRef.current = closeTemplateFlow;
  pickTemplateCardRef.current = pickTemplateCard;
  reanchorTemplateRef.current = reanchorTemplate;

  async function handleApplyTemplate(templateId: string) {
    setTemplateDropdownOpen(false);
    setTemplateHover(null);
    try {
      const res = await fetch(`/api/templates/${templateId}`);
      if (!res.ok) { console.error("Failed to fetch template:", res.status); return; }
      const tmpl = await res.json();
      const templateData = tmpl.data as TemplateData;
      const center = getViewportCenterRef.current?.() ?? { x: 200, y: 200 };
      const { elements, connectors, newIds } = instantiateTemplate(templateData, center.x, center.y);
      applyTemplate(elements, connectors);
      setSelectedElementIds(newIds);
      setSelectedConnectorId(null);
    } catch (err) {
      console.error("Failed to apply template:", err);
    }
  }

  // Collapse an Expanded Subprocess (EP) into a collapsed Subprocess whose
  // interior is moved into a NEW linked BPMN diagram (drill-down). Boundary
  // Start/End events on the EP edge are dropped, boundary Intermediate ones
  // kept; EP markers are preserved; crossing connectors re-attach to the box.
  // (See the CONVERT_EP_TO_SUBPROCESS reducer for the canvas-side surgery.)
  const [epCollapseBusyId, setEpCollapseBusyId] = useState<string | null>(null);
  const [epCollapseMsg, setEpCollapseMsg] = useState<string | null>(null);
  // EP held pending the "create a new diagram?" confirmation.
  const [epCollapseConfirmId, setEpCollapseConfirmId] = useState<string | null>(null);

  // Right-click action target: gate on a confirm dialog before doing the
  // collapse (which creates a brand-new linked diagram on the server).
  function requestCollapseEpToSubprocess(epId: string) {
    if (epCollapseBusyId) return;
    const ep = data.elements.find((e) => e.id === epId);
    if (!ep || ep.type !== "subprocess-expanded") return;
    setEpCollapseConfirmId(epId);
  }

  async function doCollapseEpToSubprocess(epId: string) {
    if (epCollapseBusyId) return;
    const ep = data.elements.find((e) => e.id === epId);
    if (!ep || ep.type !== "subprocess-expanded") return;

    // Mirror the reducer's partition so the sub-diagram payload matches what
    // the canvas removes: everything under the EP EXCEPT boundary
    // Intermediate events (which stay on the collapsed box).
    const desc = new Set<string>();
    {
      const queue = [epId];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const e of data.elements) {
          if ((e.parentId === cur || e.boundaryHostId === cur) && !desc.has(e.id)) {
            desc.add(e.id);
            queue.push(e.id);
          }
        }
      }
    }
    const byId = new Map(data.elements.map((e) => [e.id, e]));
    const moved = new Set<string>(
      [...desc].filter((d) => {
        const e = byId.get(d);
        return !(e && e.boundaryHostId === epId && e.type === "intermediate-event");
      }),
    );

    setEpCollapseBusyId(epId);
    try {
      let linkedId: string | null = null;
      if (moved.size > 0) {
        // Capture the moved interior as a self-contained, origin-normalised
        // diagram payload (same helper the template feature uses).
        const captured = captureTemplate(data.elements, data.connectors, moved);
        const subData = {
          ...data,
          elements: captured.elements,
          connectors: captured.connectors,
          viewport: { x: 0, y: 0, zoom: 1 },
        };
        const name = (ep.label && ep.label.trim()) || "Subprocess";
        const res = await fetch("/api/diagrams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            type: "bpmn",
            projectId: projectId ?? undefined,
            data: subData,
            colorConfig: diagramColorConfig,
            displayMode,
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          setEpCollapseMsg(`Could not create the linked sub-diagram (${res.status}). ${txt}`.trim());
          return;
        }
        const created = await res.json();
        linkedId = created?.id ?? null;
      }
      convertEpToSubprocess(epId, linkedId);
    } catch (err) {
      setEpCollapseMsg(`Collapse failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setEpCollapseBusyId(null);
    }
  }

  // Collapse a uml-package (Data Model) into a compact folder whose interior
  // classes/enums/notes/sub-packages move into a NEW linked Domain diagram
  // (drill-down). Crossing connectors re-attach to the package. Mirrors the
  // EP-collapse flow above; see the CONVERT_PACKAGE_COLLAPSED reducer.
  const [pkgCollapseConfirmId, setPkgCollapseConfirmId] = useState<string | null>(null);

  function requestCollapsePackage(pkgId: string) {
    if (epCollapseBusyId) return;
    const pkg = data.elements.find((e) => e.id === pkgId);
    if (!pkg || pkg.type !== "uml-package") return;
    const hasChildren = data.elements.some((e) => e.parentId === pkgId);
    if (!hasChildren) {
      setEpCollapseMsg("This package is empty — add classes to it before collapsing.");
      return;
    }
    setPkgCollapseConfirmId(pkgId);
  }

  async function doCollapsePackage(pkgId: string) {
    if (epCollapseBusyId) return;
    const pkg = data.elements.find((e) => e.id === pkgId);
    if (!pkg || pkg.type !== "uml-package") return;

    // Everything nested under the package (classes/enums/notes/sub-packages).
    const moved = new Set<string>();
    {
      const queue = [pkgId];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const e of data.elements) {
          if (e.parentId === cur && !moved.has(e.id)) {
            moved.add(e.id);
            queue.push(e.id);
          }
        }
      }
    }
    if (moved.size === 0) return;

    setEpCollapseBusyId(pkgId);
    try {
      const captured = captureTemplate(data.elements, data.connectors, moved);
      const subData = {
        ...data,
        elements: captured.elements,
        connectors: captured.connectors,
        viewport: { x: 0, y: 0, zoom: 1 },
        // Show THIS diagram as the child's parent immediately (scan-links later
        // reconciles it authoritatively from the package's linkedDiagramId).
        parentDiagramIds: [diagramId],
      };
      const name = (pkg.label && pkg.label.trim()) || "Package";
      const res = await fetch("/api/diagrams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type: "domain",
          projectId: projectId ?? undefined,
          data: subData,
          colorConfig: diagramColorConfig,
          displayMode,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        setEpCollapseMsg(`Could not create the linked package diagram (${res.status}). ${txt}`.trim());
        return;
      }
      const created = await res.json();
      collapsePackage(pkgId, created?.id ?? null);
    } catch (err) {
      setEpCollapseMsg(`Collapse failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setEpCollapseBusyId(null);
    }
  }

  // Package ↔ same-named diagram linking on rename. Offer to link a package to a
  // domain diagram that shares its name; unlink a NAME-DERIVED link when the
  // name changes (a manual link to a differently-named diagram is left alone).
  const [pkgLinkOffer, setPkgLinkOffer] = useState<{ pkgId: string; diagramId: string; name: string } | null>(null);
  const handleUpdateLabel = useCallback((id: string, label: string) => {
    const el = data.elements.find((e) => e.id === id);
    updateLabel(id, label);
    // A review-comment's header timestamp reflects the LAST edit — refresh it
    // whenever the body text actually changes (item F).
    if (el && el.type === "review-comment" && label !== (el.label ?? "")) {
      updateProperties(id, { createdStamp: fmtReviewStamp(new Date()) });
    }
    if (!el || el.type !== "uml-package") return;
    const linkedId = el.properties.linkedDiagramId as string | undefined;
    const { unlink, offer } = resolvePackageNameLink(el.label ?? "", label, linkedId, siblingDiagrams);
    if (unlink) updateProperties(id, { linkedDiagramId: null });
    if (offer) setPkgLinkOffer({ pkgId: id, diagramId: offer.diagramId, name: offer.name });
  }, [data.elements, siblingDiagrams, updateLabel, updateProperties]);

  async function handleDeleteTemplate(templateId: string, isBuiltIn = false) {
    // Immediately show as pending delete
    setDeletingTemplateIds(prev => { const next = new Set(prev); next.add(templateId); return next; });
    try {
      const res = await fetch(`/api/templates/${templateId}`, { method: "DELETE" });
      if (res.ok) {
        if (isBuiltIn) {
          setBuiltInTemplates((prev) => prev.filter((t) => t.id !== templateId));
        } else {
          setUserTemplates((prev) => prev.filter((t) => t.id !== templateId));
        }
      } else {
        console.error("Failed to delete template:", res.status);
      }
    } catch (err) {
      console.error("Failed to delete template:", err);
    }
    setDeletingTemplateIds(prev => { const next = new Set(prev); next.delete(templateId); return next; });
  }

  async function handleEditTemplate(templateId: string, templateName: string) {
    setTemplateDropdownOpen(false);
    try {
      const res = await fetch(`/api/templates/${templateId}`);
      if (!res.ok) { console.error("Failed to fetch template:", res.status); return; }
      const tmpl = await res.json();
      const templateData = tmpl.data as TemplateData;

      // Stash the current diagram so we can restore it later
      const originalData: DiagramData = {
        elements: [...data.elements],
        connectors: [...data.connectors],
        viewport: { ...data.viewport },
      };

      setTemplateEditState({ templateId, templateName, originalData });
      setSelectedElementIds(new Set());
      setSelectedConnectorId(null);

      // Replace diagram with just the template elements
      const center = getViewportCenterRef.current?.() ?? { x: 400, y: 300 };
      const { elements, connectors } = instantiateTemplate(templateData, center.x, center.y);
      setData({ elements, connectors, viewport: data.viewport });
      setTemplateMode("editing");
    } catch (err) {
      console.error("Failed to start template edit:", err);
    }
  }

  async function handleUpdateTemplate(newName: string, newGroup: string | null) {
    if (!templateEditState) return;

    const captured = captureTemplate(data.elements, data.connectors, selectedElementIds);
    if (captured.elements.length === 0) return;

    try {
      const res = await fetch(`/api/templates/${templateEditState.templateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, data: captured, group: newGroup }),
      });
      if (!res.ok) {
        console.error("Failed to update template:", res.status, await res.text());
      } else {
        const updater = (prev: TemplateRow[]) =>
          prev.map((t) => t.id === templateEditState.templateId
            ? { ...t, name: newName, group: newGroup }
            : t);
        setUserTemplates(updater);
        setBuiltInTemplates(updater);
      }
    } catch (err) {
      console.error("Failed to update template:", err);
    }

    handleCancelTemplateEdit();
  }

  function handleCancelTemplateEdit() {
    if (!templateEditState) return;
    setData(templateEditState.originalData);
    setTemplateEditState(null);
    setTemplateMode("idle");
    setSelectedElementIds(new Set());
    setSelectedConnectorId(null);
    setShowTemplateNameModal(false);
  }

  /** Optimistic toggle of a template-group header's collapsed state.
   *  Persists to the user's row via /api/templates/group-prefs in the
   *  background — failure is silent (next reload re-reads server state). */
  function toggleTemplateGroupCollapse(scope: "user" | "builtin", group: string) {
    const key = `${scope}:${group}`;
    const next = !templateGroupCollapsed[key];
    setTemplateGroupCollapsed((p) => ({ ...p, [key]: next }));
    void fetch("/api/templates/group-prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, collapsed: next }),
    });
  }

  /** Move a template into a group (or out — newGroup = null). Updates the
   *  in-memory list and PATCHes the server. Closes the move-submenu. */
  async function moveTemplateToGroup(
    templateId: string,
    scope: "user" | "builtin",
    newGroup: string | null,
  ) {
    const trimmed = newGroup ? newGroup.trim() : null;
    const finalGroup = trimmed && trimmed.length > 0 ? trimmed : null;
    const setter = scope === "user" ? setUserTemplates : setBuiltInTemplates;
    setter((prev) => prev.map((t) => t.id === templateId ? { ...t, group: finalGroup } : t));
    setTemplateMoveMenu(null);
    try {
      await fetch(`/api/templates/${templateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group: finalGroup }),
      });
    } catch (err) {
      console.error("Failed to move template:", err);
    }
  }

  // The banner must render whenever an admin is impersonating, regardless
  // of view vs edit mode. Earlier this was gated on `readOnly`, which is
  // false in Edit Mode — so the admin saw no banner and no way to return
  // to their own account from inside a diagram.
  const isImpersonating = !!impersonationMode;

  // Diagram-type colour (audit-adjacent feature): tint the top bar with a
  // lighter shade of the type's colour, and highlight the type pill. The
  // impersonation orange always wins over the tint.
  const typeStyle = useDiagramTypeStyles()(diagramType);
  const headerTint = isImpersonating ? undefined : lightenHex(typeStyle.bgColor, 0.55);

  return (
    <CollabRoom diagramId={diagramId} enabled={liveCursors}>
    {liveCursors && <CollabSyncSignal version={committedVersion} onRemoteAdvance={handleAlign} />}
    {liveCursors && <CollabFlushOnLeave diagramId={diagramId} />}
    {liveCursors && collabDebug && <CollabDebug localConnectors={data.connectors} />}
    <div
      className={`flex flex-col h-screen ${isImpersonating ? "bg-orange-50" : "bg-white"}`}
      onContextMenu={(e) => {
        // Suppress the native browser context menu across the editor wherever
        // Diagramatix defines no right-click action. Carefully preserve it where
        // normal operations need it: editable fields (copy/paste), links and
        // images (open / copy / save), and any active text selection (copy).
        const t = e.target as Element | null;
        if (t?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false']), a[href], img")) return;
        if (window.getSelection?.()?.toString()) return;
        e.preventDefault();
      }}
    >
      {isImpersonating && viewingAsName !== undefined && viewingAsEmail !== undefined && (
        <ImpersonationBanner viewingAsName={viewingAsName ?? ""} viewingAsEmail={viewingAsEmail ?? ""} mode={impersonationMode} currentDiagramId={diagramId} />
      )}
      {rcReturnParam && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-1.5 text-xs text-blue-800 flex items-center justify-between">
          <span>Viewing a step linked from the Risk &amp; Control screen.</span>
          <button
            onClick={() => router.push(`/dashboard/projects/${rcReturnParam}?rcm=1`)}
            className="font-medium text-blue-700 hover:text-blue-900 underline"
          >
            ← Back to Risk &amp; Controls
          </button>
        </div>
      )}
      {elementLimitToast && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-800 flex items-center justify-between">
          <span>{elementLimitToast}</span>
          <button
            onClick={() => setElementLimitToast(null)}
            className="text-red-700 hover:text-red-900 font-medium"
          >
            ✕
          </button>
        </div>
      )}
      {/* Co-authoring auto-merge note: shown only when a concurrent save
          overlapped the SAME element(s) — non-overlapping edits merge silently. */}
      {mergeNote && (
        <div className="bg-amber-50 border-b border-amber-300 px-4 py-2 text-xs text-amber-900 flex items-center justify-between gap-3">
          <span>
            Merged with <span className="font-semibold">{mergeNote.editor ?? "another editor"}</span>’s changes.{" "}
            {mergeNote.count} element{mergeNote.count === 1 ? "" : "s"} you both edited kept their version — review if needed.
          </span>
          <button
            onClick={() => setMergeNote(null)}
            className="text-amber-700 hover:text-amber-900 font-medium shrink-0"
          >✕</button>
        </div>
      )}
      {/* Top bar */}
      <header
        className={`h-9 border-b border-gray-200 flex items-center px-2 gap-2 flex-shrink-0 ${isImpersonating ? "bg-orange-50" : ""}`}
        style={headerTint ? { backgroundColor: headerTint } : undefined}
      >
        <button
          onClick={handleBackToProject}
          className="text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1"
        >
          <span style={{ fontSize: "1.75em", lineHeight: 1 }}>{"\u2190"}</span>
          <span className="underline">{backLabel}</span>
        </button>
        {/* Brand icon: sits just right of the back link as a permanent
            "you're inside Diagramatix" cue. h-5 keeps it inside the h-9 bar. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/diagramatix-icon.svg" alt="Diagramatix" className="w-5 h-5 select-none" onDoubleClick={toggleSuperAdminChrome} draggable={false} />

        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-gray-900 text-xs">{diagramName}</span>
          <DiagramTypeBadge type={diagramType} showLabel showCode={false} />
          <span className="text-[10px] text-gray-900" title="Diagramatix product version — major.minor.build">v{PRODUCT_VERSION}.{version ?? 0}</span>
        </div>

        {/* New Diagram — mirrors the Project screen's blue primary button. Opens the
            project's New Diagram dialog (via ?new=1), honouring unsaved changes first. */}
        {projectId && !readOnly && (
          <button
            onClick={async () => {
              if ((await confirmSaveBeforeLeave()) === "cancel") return;
              // Default the New Diagram dialog to THIS diagram's type.
              router.push(`/dashboard/projects/${projectId}?new=1&type=${encodeURIComponent(diagramType)}`);
            }}
            className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs font-medium"
            title="Create a new diagram in this project"
          >
            + New Diagram
          </button>
        )}

        <div className="flex-1" />

        {/* SuperAdmin shortcut — leftmost item in the header menu cluster,
            SuperAdmin-only. `?from=` lets the SuperAdmin page return the
            user to this diagram on Back. Mirrors the Dashboard / Project
            placement. */}
        {isAdmin && !superAdminHidden && (
          <button
            type="button"
            onClick={async () => {
              const from = typeof window !== "undefined"
                ? window.location.pathname + window.location.search
                : `/dashboard/diagram/${diagramId}`;
              if ((await confirmSaveBeforeLeave()) === "cancel") return;
              router.push(`/dashboard/admin?from=${encodeURIComponent(from)}`);
            }}
            className="text-[11px] text-red-700 hover:text-red-800 font-medium border border-red-300 rounded px-2 py-0.5 hover:bg-red-50"
            title="Open the SuperAdmin dashboard"
          >
            SuperAdmin
          </button>
        )}

        {/* Lifecycle status pill — shown to anyone who is NOT the diagram
            owner (read-only viewers, editors, non-owner project members).
            They can't publish, but should still see the diagram's state.
            Owners get the full Publish dropdown below instead. */}
        {(readOnly || !isDiagramOwner) && (
          <>
            {lifecycle === "PUBLISHED" && currentPublishedVersion && (
              <span
                className="text-[11px] text-blue-700 border border-blue-300 bg-blue-50 rounded px-2 py-0.5 font-medium"
                title={`Last published ${new Date(currentPublishedVersion.publishedAt).toLocaleString()}`}
              >
                Published v{currentPublishedVersion.versionNumber}
                <span className="text-blue-500/70 ml-1 font-normal">
                  · {new Date(currentPublishedVersion.publishedAt).toLocaleDateString()}
                </span>
              </span>
            )}
            {lifecycle === "DRAFT" && (
              <span className="text-[11px] text-gray-600 border border-gray-300 bg-gray-50 rounded px-2 py-0.5 font-medium" title="Never published">
                Draft
              </span>
            )}
            {lifecycle === "ARCHIVED" && (
              <span className="text-[11px] text-gray-500 border border-gray-300 bg-gray-100 rounded px-2 py-0.5 font-medium" title="Archived — hidden from business users">
                Archived
              </span>
            )}
          </>
        )}


        {/* Feedback button — owner-only, once published. Opens the
            FeedbackPanel listing business-user feedback on this diagram. */}
        {!readOnly && isDiagramOwner && lifecycle === "PUBLISHED" && (
          <button
            onClick={() => setShowFeedbackPanel(prev => !prev)}
            title="View business-user feedback on this published diagram"
            className="px-2 py-0.5 text-[11px] font-medium text-gray-800 border border-gray-400 rounded hover:bg-gray-50"
          >
            Feedback
          </button>
        )}

        {/* Co-authoring presence — who else is in this diagram right now. */}
        {collabEnabled && <PresenceBar members={presenceRoster} />}

        {/* Co-authoring Sync — PULL everyone's committed changes and PUSH ours in
            one 3-way merge. Shown whenever others are present (autosave is OFF in
            that mode); always clickable so you can pull even with no local edits. */}
        {collabEnabled && othersPresent && !readOnly && (
          <button
            onClick={handleSync}
            disabled={saveStatus === "saving"}
            title="Sync — pull everyone's changes and push yours (merge). Autosave is off while others are here."
            className={`px-2 py-0.5 text-[11px] rounded border inline-flex items-center gap-1 ${
              saveStatus === "unsaved"
                ? "text-white bg-blue-600 border-blue-700 hover:bg-blue-700"
                : "text-blue-700 border-blue-300 bg-blue-50 hover:bg-blue-100"
            }`}
          >
            <span aria-hidden>{saveStatus === "saving" ? "⟳" : "⇄"}</span>
            {saveStatus === "saving" ? "Syncing…" : saveStatus === "unsaved" ? "Sync" : "Sync"}
          </button>
        )}

        {/* Active vs Viewer — claim the live cursor (others become viewers to me)
            or step back to watching. Only meaningful when someone else is here,
            so it shows only with 2+ co-authors (like Sync). */}
        {liveCursors && othersPresent && (
          <button
            onClick={() => setCollabActive((v) => !v)}
            title={collabActive
              ? "You're the ACTIVE editor — your cursor and live edits are broadcast. Click to just watch."
              : "You're a VIEWER — watching only. Click to become the active editor (claim the cursor)."}
            className={`px-2 py-0.5 text-[11px] rounded border inline-flex items-center gap-1 ${
              collabActive
                ? "text-emerald-700 border-emerald-400 bg-emerald-50"
                : "text-gray-600 border-gray-300 bg-gray-50 hover:bg-gray-100"
            }`}
          >
            <span aria-hidden>{collabActive ? "🖱" : "👁"}</span>
            {collabActive ? "Active" : "Viewer"}
          </button>
        )}

        {!readOnly && (
          <>
            <button
              onClick={saveNow}
              disabled={saveStatus !== "unsaved"}
              title={saveStatus === "unsaved" ? "Unsaved changes — click to save (Ctrl+S)" : "Save (Ctrl+S)"}
              className={`w-24 text-center px-2 py-0.5 text-[11px] font-medium rounded border ${
                saveStatus === "unsaved"
                  ? "bg-orange-500 text-white border-orange-500 hover:bg-orange-600"
                  : saveStatus === "saving"
                    ? "bg-yellow-50 text-yellow-700 border-yellow-300"
                    : "bg-green-50 text-green-700 border-green-300"
              }`}
            >
              {saveStatus === "saving" ? "Saving\u2026" : saveStatus === "saved" ? "\u2713 Saved" : "\u25CF Unsaved"}
            </button>

            {/* Prev / next folder-mate navigation. Roughly 2x the size of
                the other top-bar controls so they're easy to hit. Hidden
                when the folder has only this one diagram. */}
            {folderMates && (folderMates.total > 1) && (
              <div className="flex items-center gap-1 ml-1">
                <button
                  onClick={async () => {
                    if (!folderMates.prevId) return;
                    await saveNowRef.current();
                    router.push(`/diagram/${folderMates.prevId}`);
                  }}
                  disabled={!folderMates.prevId}
                  title={folderMates.prevName ? `Previous in folder: ${folderMates.prevName}` : "First diagram in this folder"}
                  className="w-8 h-8 flex items-center justify-center text-xl text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                >
                  {"«"}
                </button>
                <span className="text-[10px] text-gray-500 tabular-nums" title="Position in folder">
                  {folderMates.position}/{folderMates.total}
                </span>
                <button
                  onClick={async () => {
                    if (!folderMates.nextId) return;
                    await saveNowRef.current();
                    router.push(`/diagram/${folderMates.nextId}`);
                  }}
                  disabled={!folderMates.nextId}
                  title={folderMates.nextName ? `Next in folder: ${folderMates.nextName}` : "Last diagram in this folder"}
                  className="w-8 h-8 flex items-center justify-center text-xl text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                >
                  {"»"}
                </button>
              </div>
            )}

            <div className="flex items-center gap-0.5">
              <button
                onClick={undo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
                className="p-1 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg width={12} height={12} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 5h6a4 4 0 0 1 0 8H5" />
                  <path d="M2 5L5 2M2 5l3 3" />
                </svg>
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                title="Redo (Ctrl+Shift+Z)"
                className="p-1 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg width={12} height={12} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5H6a4 4 0 0 0 0 8h3" />
                  <path d="M12 5L9 2m3 3-3 3" />
                </svg>
              </button>
            </div>

            {/* Space tools — BPMN, state-machine + ArchiMate. Insert Space drops
                one green marker at the viewport centre (then Shift+drag to
                push elements apart); Remove Space drops the two red markers
                (reposition, then Enter to collapse the highlighted band).
                Escape exits the gesture. */}
            {(diagramType === "bpmn" || diagramType === "state-machine" || diagramType === "archimate") && (
              <div className="relative" ref={spaceDropdownRef}>
                <button
                  onClick={() => setSpaceDropdownOpen(prev => !prev)}
                  className="px-2 py-0.5 text-[11px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
                  title="Insert or remove space on the canvas"
                >
                  Space ▾
                </button>
                {spaceDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded shadow-lg z-50">
                    <button
                      onClick={() => { setSpaceDropdownOpen(false); spaceActionRef.current?.startInsert(); }}
                      className="w-full text-left px-3 py-2 text-xs text-green-700 hover:bg-green-50 font-medium"
                    >
                      Insert Space
                      <span className="block text-[10px] text-gray-500 font-normal mt-0.5">
                        Move the green marker, then Shift+drag to insert.
                      </span>
                    </button>
                    <div className="border-t border-gray-100" />
                    <button
                      onClick={() => { setSpaceDropdownOpen(false); spaceActionRef.current?.startRemove(); }}
                      className="w-full text-left px-3 py-2 text-xs text-red-700 hover:bg-red-50 font-medium"
                    >
                      Remove Space
                      <span className="block text-[10px] text-gray-500 font-normal mt-0.5">
                        Move the red markers, then Enter to remove. Esc cancels.
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {selectedElementIds.size > 1 && templateMode !== "editing" && (
          <div className="relative" ref={alignDropdownRef}>
            <button
              onClick={() => setAlignDropdownOpen((prev) => !prev)}
              className="px-2 py-0.5 text-[11px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Alignment ▾
            </button>
            {alignDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded shadow-lg z-50">
                <button
                  onClick={() => { alignElements([...selectedElementIds], "center"); setAlignDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Align Centres Horizontally
                </button>
                <button
                  onClick={() => { alignElements([...selectedElementIds], "vcenter"); setAlignDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Align Centres Vertically
                </button>
                <div className="border-t border-gray-100" />
                <button
                  onClick={() => { alignElements([...selectedElementIds], "smart"); setAlignDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 font-medium"
                >
                  Align Smart!
                </button>
              </div>
            )}
          </div>
        )}

        {selectedElementIds.size > 1 && templateMode !== "editing" && (
          <div className="relative" ref={resizeDropdownRef}>
            <button
              onClick={() => setResizeDropdownOpen((prev) => !prev)}
              className="px-2 py-0.5 text-[11px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Resize ▾
            </button>
            {resizeDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded shadow-lg z-50">
                {([
                  { mode: "tallest", label: "Resize to Tallest" },
                  { mode: "shortest", label: "Resize to Shortest" },
                  { mode: "widest", label: "Resize to Widest" },
                  { mode: "thinnest", label: "Resize to Thinnest" },
                ] as const).map(({ mode, label }) => (
                  <button key={mode}
                    onClick={() => {
                      const ids = [...selectedElementIds];
                      const selected = data.elements.filter(e => ids.includes(e.id));
                      if (selected.length < 2) return;
                      let targetVal: number;
                      switch (mode) {
                        case "tallest":  targetVal = Math.max(...selected.map(e => e.height)); break;
                        case "shortest": targetVal = Math.min(...selected.map(e => e.height)); break;
                        case "widest":   targetVal = Math.max(...selected.map(e => e.width)); break;
                        case "thinnest": targetVal = Math.min(...selected.map(e => e.width)); break;
                      }
                      for (const el of selected) {
                        const newW = (mode === "widest" || mode === "thinnest") ? targetVal : el.width;
                        const newH = (mode === "tallest" || mode === "shortest") ? targetVal : el.height;
                        resizeElement(el.id, el.x, el.y, newW, newH);
                      }
                      setResizeDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {diagramType === "bpmn" && templateMode === "idle" && (
          <div className="relative" ref={templateDropdownRef}>
            <button
              onClick={() => setTemplateDropdownOpen((prev) => !prev)}
              className="px-2 py-0.5 text-[11px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Templates {"\u25BE"}
            </button>
            {templateDropdownOpen && templateHover && (
              // A LARGER LOOK BEFORE CHOOSING (Paul, 2026-09-24). Beside the
              // menu rather than to its right: the menu is anchored to the
              // right-hand edge of the window, so a panel on that side would
              // be off-screen. Pointer-transparent, so it can never sit
              // between the mouse and the row it is describing.
              <div
                // CLEAR OF THE MENU, ALWAYS. Paul, 2026-09-24: "The hover large
                // template image appears under the drop down template menu.
                // This image must always be clear of the drop-down menu itself.
                // Further to the left is fine."
                //
                // `right-full` was not enough: the menu is 20rem wide and
                // anchored to the RIGHT of this wrapper, so it reaches far to
                // the left of the wrapper itself and the preview landed behind
                // it. The offset is measured from the same right edge the menu
                // is measured from — the menu's own width plus a gap — so the
                // two cannot overlap however wide the wrapper is. A higher
                // z-index as well, so it is never painted under.
                style={{ right: "calc(20rem + 0.75rem)" }}
                className="absolute top-full mt-1 w-[22rem] bg-white border border-gray-200 rounded shadow-lg z-[60] p-3 pointer-events-none"
                data-template-preview="large"
              >
                <div className="flex items-center justify-center h-[220px] overflow-hidden">
                  <TemplateThumbnail templateId={templateHover.id} svg={templateHover.thumbnailSvg} width={330} height={215} />
                </div>
                <p className="mt-2 text-xs font-medium text-gray-800">{templateHover.name}</p>
                {templateHover.group && <p className="text-[11px] text-gray-400">{templateHover.group}</p>}
                {templateHover.description && <p className="mt-1 text-[11px] text-gray-600">{templateHover.description}</p>}
              </div>
            )}
            {templateDropdownOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded shadow-lg z-50 max-h-96 overflow-y-auto"
                onMouseLeave={() => setTemplateHover(null)}
              >
                {/* Create actions */}
                <button
                  onClick={() => { setTemplateMode("capturing"); setTemplateDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 font-medium"
                >
                  + Create User Template
                </button>
                {isAdmin && (
                  <button
                    onClick={() => {
                      setTemplateDropdownOpen(false);
                      setTemplateMode("capturing-builtin");
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-orange-600 hover:bg-orange-50 font-medium"
                  >
                    + Create Built-In Template
                  </button>
                )}

                {/* Built-In + User template lists. Each list shows ungrouped
                    templates first (no header), then each named group as a
                    collapsible row. Per-template "move to group" submenu lets
                    the user re-organise via existing groups or a typed-in new
                    group. Collapse state is per-user (server-persisted). */}
                {(["builtin", "user"] as const).map((scope) => {
                  const list = scope === "builtin" ? builtInTemplates : userTemplates;
                  if (list.length === 0) return null;
                  const scopeLabel = scope === "builtin" ? "Built-In" : "User";
                  const canEdit = scope === "user" || isAdmin;
                  const ungrouped: TemplateRow[] = [];
                  const grouped = new Map<string, TemplateRow[]>();
                  for (const t of list) {
                    if (!t.group) ungrouped.push(t);
                    else {
                      const arr = grouped.get(t.group);
                      if (arr) arr.push(t); else grouped.set(t.group, [t]);
                    }
                  }
                  const groupNames = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
                  const renderItem = (t: TemplateRow, indent: boolean) => {
                    const isDeleting = deletingTemplateIds.has(t.id);
                    const showingMove = templateMoveMenu?.templateId === t.id;
                    return (
                      <div key={t.id}>
                        <div
                          className={`flex items-center ${isDeleting ? "opacity-50" : "hover:bg-gray-50"}`}
                          onMouseEnter={() => setTemplateHover(t)}
                        >
                          <button
                            onClick={() => !isDeleting && handleApplyTemplate(t.id)}
                            disabled={isDeleting}
                            className={`flex items-center gap-2 flex-1 min-w-0 text-left ${indent ? "pl-6 pr-2" : "px-2"} py-1.5 text-xs text-gray-700 ${isDeleting ? "line-through text-gray-400" : ""}`}
                            title={t.description ? `${t.name} \u2014 ${t.description}` : `Apply template: ${t.name}`}
                          >
                            <TemplateThumbnail templateId={t.id} svg={t.thumbnailSvg} />
                            <span className="flex-1 min-w-0 flex flex-col">
                              <span className="truncate">{t.name}{isDeleting ? " (deleting\u2026)" : ""}</span>
                              {t.description && <span className="truncate text-[10px] text-gray-400">{t.description}</span>}
                            </span>
                          </button>
                          {canEdit && !isDeleting && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTemplateMoveMenu(showingMove ? null : {
                                    templateId: t.id,
                                    scope,
                                    currentGroup: t.group,
                                    typing: false,
                                    typedName: "",
                                  });
                                }}
                                className="px-1.5 py-1.5 text-gray-400 hover:text-blue-500"
                                title="Move to group"
                              >
                                <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h8M2 6h8M2 8h5" /></svg>
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handleEditTemplate(t.id, t.name); }}
                                className="px-1.5 py-1.5 text-gray-400 hover:text-blue-500" title="Edit">
                                <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M7 2l3 3-7 7H0V9z" /></svg>
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setTemplateDeleteConfirm({ id: t.id, name: t.name, isBuiltIn: scope === "builtin" }); }}
                                className="px-1.5 py-1.5 text-gray-400 hover:text-red-500" title="Delete">
                                <svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M2 3h8M4.5 3V2h3v1M3 3v7a1 1 0 001 1h4a1 1 0 001-1V3" /></svg>
                              </button>
                            </>
                          )}
                        </div>
                        {showingMove && templateMoveMenu && (
                          <div className="bg-blue-50 border-y border-blue-100 px-3 py-1.5 text-[10px] space-y-1">
                            {templateMoveMenu.typing ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  autoFocus
                                  placeholder="Group name"
                                  value={templateMoveMenu.typedName}
                                  onChange={(e) => setTemplateMoveMenu({ ...templateMoveMenu, typedName: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      const name = templateMoveMenu.typedName.trim();
                                      if (name) void moveTemplateToGroup(t.id, scope, name);
                                    } else if (e.key === "Escape") setTemplateMoveMenu(null);
                                  }}
                                  className="flex-1 px-1.5 py-0.5 text-[10px] border border-blue-200 rounded outline-none focus:border-blue-400"
                                />
                                <button
                                  onClick={() => {
                                    const name = templateMoveMenu.typedName.trim();
                                    if (name) void moveTemplateToGroup(t.id, scope, name);
                                  }}
                                  className="px-1.5 py-0.5 text-[10px] text-white bg-blue-600 rounded hover:bg-blue-700"
                                >Save</button>
                                <button onClick={() => setTemplateMoveMenu(null)}
                                  className="px-1.5 py-0.5 text-[10px] text-gray-600">{"\u2715"}</button>
                              </div>
                            ) : (
                              <>
                                <p className="text-gray-500 uppercase tracking-wide text-[9px]">Move to group</p>
                                <button
                                  onClick={() => void moveTemplateToGroup(t.id, scope, null)}
                                  className={`block w-full text-left px-1.5 py-0.5 rounded ${t.group === null ? "bg-blue-100 text-blue-700" : "hover:bg-blue-100"}`}
                                >(Ungrouped)</button>
                                {groupNames.map((g) => (
                                  <button
                                    key={g}
                                    onClick={() => void moveTemplateToGroup(t.id, scope, g)}
                                    className={`block w-full text-left px-1.5 py-0.5 rounded ${t.group === g ? "bg-blue-100 text-blue-700" : "hover:bg-blue-100"}`}
                                  >{g}</button>
                                ))}
                                <button
                                  onClick={() => setTemplateMoveMenu({ ...templateMoveMenu, typing: true })}
                                  className="block w-full text-left px-1.5 py-0.5 rounded text-blue-600 hover:bg-blue-100"
                                >+ New group{"\u2026"}</button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  };
                  return (
                    <div key={scope}>
                      <div className="border-t border-gray-100" />
                      <div className="flex items-center gap-2 px-3 py-1.5">
                        <p className="flex-1 text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{scopeLabel}</p>
                        {groupNames.length > 0 && (() => {
                          // Paul, 2026-09-24: "a 'collapse all' option on the
                          // BUILT-IN and USER lines is required." It toggles:
                          // once everything is shut, the same control opens it
                          // again, which is the only thing to want next.
                          const allShut = groupNames.every((g) => templateGroupCollapsed[`${scope}:${g}`]);
                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                for (const g of groupNames) {
                                  if (!!templateGroupCollapsed[`${scope}:${g}`] === allShut) toggleTemplateGroupCollapse(scope, g);
                                }
                              }}
                              className="text-[10px] text-gray-400 hover:text-blue-600"
                              title={allShut ? `Expand every ${scopeLabel} group` : `Collapse every ${scopeLabel} group`}
                            >
                              {allShut ? "expand all" : "collapse all"}
                            </button>
                          );
                        })()}
                      </div>
                      {ungrouped.map((t) => renderItem(t, false))}
                      {groupNames.map((g) => {
                        const collapsed = !!templateGroupCollapsed[`${scope}:${g}`];
                        const groupItems = grouped.get(g)!;
                        return (
                          <div key={g}>
                            <button
                              onClick={() => toggleTemplateGroupCollapse(scope, g)}
                              className="flex items-center w-full text-left px-3 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
                            >
                              <span className="inline-block w-3 mr-1 text-gray-400">{collapsed ? "\u25b6" : "\u25bc"}</span>
                              <span className="flex-1 truncate font-medium">{g}</span>
                              <span className="text-gray-400 text-[10px]">{groupItems.length}</span>
                            </button>
                            {!collapsed && groupItems.map((t) => renderItem(t, true))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {diagramType === "bpmn" && (templateMode === "capturing" || templateMode === "capturing-builtin") && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-blue-600">
              Select elements for {templateMode === "capturing-builtin" ? "built-in" : "user"} template
            </span>
            <button
              onClick={handleSaveAsTemplate}
              disabled={selectedElementIds.size === 0}
              className="px-2 py-0.5 text-[11px] text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save as Template
            </button>
            <button
              onClick={() => setTemplateMode("idle")}
              className="px-2 py-0.5 text-[11px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        )}
        {diagramType === "bpmn" && templateMode === "editing" && templateEditState && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-600 font-medium">
              Editing template: {templateEditState.templateName}
            </span>
            <button
              onClick={() => {
                const captured = captureTemplate(data.elements, data.connectors, selectedElementIds);
                if (captured.elements.length === 0) return;
                setPendingTemplateData(captured);
                setShowTemplateNameModal(true);
              }}
              disabled={selectedElementIds.size === 0}
              className="px-2 py-0.5 text-[11px] text-white bg-amber-600 rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Update Template
            </button>
            <button
              onClick={handleCancelTemplateEdit}
              className="px-2 py-0.5 text-[11px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        )}

        {templateMode !== "editing" && (
          <>
        {/* The Diagram Config, History, and Clear options live inside the
            unified "Diagram ▾" dropdown further along the toolbar — those
            standalone buttons were removed in favour of a single menu. */}

        {/* AI Generate, Simulator, Animate!, Send for Review and Get help were
            moved into the unified "Diagram ▾" menu further along the toolbar
            (2026-07-07) to declutter the top bar. */}
        {isAdmin && !superAdminHidden && aiComparison ? (
          <button
            onClick={() => setShowComparisonModal(true)}
            className="px-2 py-0.5 text-[11px] rounded border border-red-400 text-red-700 hover:bg-red-50"
            title="SuperAdmin: view the multi-model AI comparison for this diagram"
          >
            AI Comparison Results
          </button>
        ) : null}
        {/* Process-Context focus highlight — on/off toggle. When on, selecting an
            element dims everything except it and what it connects to. */}
        {diagramType === "process-context" && (
          <button
            onClick={toggleHighlight}
            className={`px-2 py-0.5 text-[11px] rounded border ${
              highlightEnabled
                ? "border-green-500 bg-green-50 text-green-700"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
            title="Highlight: when ON, selecting a process or entity dims everything except it and what it connects to"
          >
            Highlight{highlightEnabled ? " ✓" : ""}
          </button>
        )}
        {/* Highlight Entity List Changes — rings any element whose name isn't in
            the project's adopted Entity Structure. Only when a structure with
            entries has been adopted into this project. */}
        {/* BPMN only (Paul, 2026-09-14: "Only show Entity Drift on BPMN Diagram
            Screen"). Entity Drift rings pool / lane, participant, IT system,
            document and data-store names against the project's adopted Entity
            Structure — the vocabulary of a BPMN diagram. It was previously every
            type except EPC, on the reasoning that an EPC has none of those names;
            the same reasoning applies to the rest, and offering the check on a
            diagram that cannot contain the vocabulary answers "no drift" every
            time, which reads as a pass. */}
        {entityHasNames && diagramType === "bpmn" && (
          <button
            onClick={() => setEntityDriftEnabled((v) => !v)}
            className={`px-2 py-0.5 text-[11px] rounded border ${
              entityDriftEnabled
                ? "border-amber-500 bg-amber-50 text-amber-700"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
            title="Highlight Entity List Changes: rings any pool/lane, participant, IT system, document or data-store name that isn't in this project's adopted Entity Structure"
          >
            Entity Drift{entityDriftEnabled ? " ✓" : ""}
          </button>
        )}
        {/* Review-comment filter — appears once a diagram carries review
            comments, letting the owner focus on one reviewer at a time. */}
        {reviewCommenters.length > 0 && (
          <label className="flex items-center gap-1 text-[11px] text-pink-700">
            Comments:
            <select
              value={reviewFilter}
              onChange={(e) => setReviewFilter(e.target.value)}
              className="text-[11px] border border-pink-300 rounded px-1 py-0.5 bg-white text-gray-700"
              title="Show review comments from all reviewers, none, or one reviewer"
            >
              <option value="all">All reviewers</option>
              <option value="none">None</option>
              {reviewCommenters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
        {/* History was previously a standalone button — now in the
            unified Diagram ▾ menu further along the toolbar. */}

        {/* Hidden file inputs reused by the File menu */}
        <input
          ref={importJsonInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleImportFile(f, "json");
            e.target.value = "";
          }}
        />
        <input
          ref={importXmlInputRef}
          type="file"
          accept=".xml"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleImportFile(f, "xml");
            e.target.value = "";
          }}
        />
        <input
          ref={importTemplatesInputRef}
          type="file"
          accept=".diag_tems,application/json"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            // Admin: prompt for destination list (User vs Built-In).
            // Non-admin: import directly into User templates.
            if (isAdmin) {
              setTemplateImportFile(f);
            } else {
              handleImportTemplatesFile(f, "user");
            }
          }}
        />
        <input
          ref={importVisioInputRef}
          type="file"
          accept=".vsdx"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) handleImportVisioFile(f);
          }}
        />
        <input
          ref={importAmlInputRef}
          type="file"
          accept=".aml,.xml"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) handleImportAmlFile(f);
          }}
        />
        <input
          ref={importBpmnInputRef}
          type="file"
          accept=".bpmn,.xml"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) handleImportBpmnFile(f);
          }}
        />

        <div className="relative" ref={fileMenuRef}>
          <button
            onClick={() => {
              setFileMenuOpen((prev) => !prev);
              setFileSubmenu(null);
            }}
            className="px-2 py-0.5 text-[11px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
          >
            File ▾
          </button>
          {fileMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded shadow-lg z-50">
              {/* Save As — clone current diagram into the same project under a new name */}
              <button
                onClick={() => {
                  setFileMenuOpen(false);
                  setFileSubmenu(null);
                  setSaveAsName(`${diagramName} (copy)`);
                  setShowSaveAs(true);
                }}
                onMouseEnter={() => setFileSubmenu(null)}
                className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                title="Save a copy of this diagram in the same project under a new name"
              >
                Save As&hellip;
              </button>
              {diagramType === "flowchart" && (
                <button
                  onClick={() => {
                    setFileMenuOpen(false);
                    setFileSubmenu(null);
                    setShowTranslate(true);
                  }}
                  onMouseEnter={() => setFileSubmenu(null)}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                  title="Create a new BPMN diagram from this flowchart (one-way)"
                >
                  Translate to BPMN&hellip;
                </button>
              )}
              {diagramType === "epc" && (
                <button
                  onClick={() => {
                    setFileMenuOpen(false);
                    setFileSubmenu(null);
                    setShowEpcToBpmn(true);
                  }}
                  onMouseEnter={() => setFileSubmenu(null)}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                  title="Create a new BPMN diagram from this EPC (one-way)"
                >
                  Convert to BPMN&hellip;
                </button>
              )}
              <div className="border-t border-gray-100" />

              {(["export", "import"] as const).map((sect) => (
                <div key={sect} className="relative">
                  <button
                    onClick={() => { const nx = fileSubmenu === sect ? null : sect; setFileSubmenu(nx); setMenuDest(null); }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-xs ${fileSubmenu === sect ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                  >
                    <span>{sect === "export" ? "Export" : "Import"}</span>
                    <span className="text-gray-400">▸</span>
                  </button>
                  {fileSubmenu === sect && (
                    <div className="absolute bg-white border border-gray-200 rounded shadow-lg py-1 z-[10001]" style={{ top: "100%", left: -100, minWidth: 150 }}>
                      {/* Local */}
                      <div className="relative">
                        <button
                          onClick={() => setMenuDest(menuDest === "local" ? null : "local")}
                          className={`flex w-full items-center justify-between px-3 py-2 text-xs ${menuDest === "local" ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                        >
                          <span>Local</span><span className="text-gray-400">▸</span>
                        </button>
                        {menuDest === "local" && (
                          <div className="absolute bg-white border border-gray-200 rounded shadow-lg py-1 z-[10001]" style={{ top: "100%", left: -100, minWidth: 160 }}>
                            {sect === "export" ? (
                              <>
                                <ExportLeaf label="PDF" title="Export as PDF (Preview, or Download to choose scale + annotations)"
                                  onPreview={() => void handlePreview("pdf")}
                                  onDownload={() => { closeFm(); openExport("pdf"); }} />
                                <ExportLeaf label="SVG" title="Export as SVG"
                                  onPreview={() => void handlePreview("svg")}
                                  onDownload={() => { closeFm(); openExport("svg"); }} />
                                <ExportLeaf label="JSON" title="Diagram as a single-diagram JSON file"
                                  onPreview={() => void handlePreview("json")}
                                  onDownload={() => { closeFm(); openExport("json"); }} />
                                {isActingAdmin && (
                                  <button onClick={() => { closeFm(); void handleExportBundle(); }} className="block w-full text-left px-3 py-2 text-xs text-red-700 hover:bg-red-50" title="SuperAdmin only — export the diagram together with its AI prompt, plan, comparison matrix & per-model diagrams as ONE bundle. Re-import via a project's 'Import Diagram Bundle'.">Diagram Bundle (AI)</button>
                                )}
                                {diagramType === "bpmn" && (
                                  <ExportLeaf label="XML (Diagramatix)" title="Diagram XML (the matching XSD downloads alongside it)"
                                    onPreview={() => void handlePreview("xml")}
                                    onDownload={() => { handleExportXml(); closeFm(); }} />
                                )}
                                {diagramType === "bpmn" && (
                                  <ExportLeaf label={`XSD (schema v${SCHEMA_VERSION})`} title="The export XSD schema (bundled with the XML download)"
                                    onPreview={() => void handlePreview("xsd")}
                                    onDownload={() => { closeFm(); const a = document.createElement("a"); a.href = "/api/schema"; a.download = `diagramatix-export-schema-v${SCHEMA_VERSION}.xsd`; a.click(); }} />
                                )}
                                {diagramType === "bpmn" && (
                                  <ExportLeaf label="BPMN 2.0 XML" title="Standard OMG BPMN 2.0 XML (.bpmn) — opens in Camunda, bpmn.io, Signavio, etc."
                                    onPreview={() => void handlePreview("bpmn")}
                                    onDownload={() => { void handleExportBpmn(); closeFm(); }} />
                                )}
                                {diagramType === "bpmn" && (
                                  <>
                                    <ExportLeaf label="Visio (for stencil v1.6)" title="Export using the Diagramatix v1.6 stencil — recipient needs the v1.6 stencil installed in Visio."
                                      onPreview={() => void handlePreview("visio")}
                                      onDownload={() => { closeFm(); const a = document.createElement("a"); a.href = `/api/export/visio-v3?diagramId=${diagramId}&profile=v1.6`; a.rel = "noopener"; a.click(); }} />
                                    {isActingAdmin && (
                                      <button onClick={() => { closeFm(); const a = document.createElement("a"); a.href = `/api/export/visio-v3?diagramId=${diagramId}&profile=bpmn-m`; a.rel = "noopener"; a.click(); }} className="block w-full text-left px-3 py-2 text-xs text-red-700 hover:bg-red-50" title="SuperAdmin only — BPMN_M export needs further work before general release.">Visio (for stencil BPMN_M)</button>
                                    )}
                                    <a href="/BPMN%20Diagramatix%20Shapes%20v1.6.vssx" download onClick={closeFm} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50" title="Download the BPMN Diagramatix v1.6 stencil (.vssx) to use in Visio">Visio Stencil</a>
                                  </>
                                )}
                                {diagramType === "domain" && isActingAdmin && (
                                  <button onClick={() => { closeFm(); const a = document.createElement("a"); a.href = `/api/export/visio-v3?diagramId=${diagramId}`; a.rel = "noopener"; a.click(); }} className="block w-full text-left px-3 py-2 text-xs text-red-700 hover:bg-red-50" title="SuperAdmin only — UML domain Visio export needs further work before general release.">Visio (UML)</button>
                                )}
                                {(diagramType === "bpmn" || diagramType === "archimate") && (
                                  <button disabled={diagramType === "archimate"} onClick={() => { if (isAdmin) { setTemplateExportPrompt(true); } else { handleExportTemplates("user"); closeFm(); } }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent" title={diagramType === "archimate" ? "ArchiMate templates aren't available yet" : "Export your templates as a .diag_tems file"}>Templates</button>
                                )}
                              </>
                            ) : (
                              <>
                                <button onClick={() => { closeFm(); importJsonInputRef.current?.click(); }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50" title="Replace the current diagram contents with the first diagram in a JSON file">JSON</button>
                                {diagramType === "bpmn" && (
                                  <button onClick={() => { closeFm(); importXmlInputRef.current?.click(); }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50" title="Replace the current diagram contents with the first diagram in an XML file">XML</button>
                                )}
                                {(diagramType === "bpmn" || diagramType === "archimate") && (
                                  <button disabled={diagramType === "archimate"} onClick={() => { closeFm(); importTemplatesInputRef.current?.click(); }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent" title={diagramType === "archimate" ? "ArchiMate templates aren't available yet" : "Import templates from a .diag_tems file"}>Templates</button>
                                )}
                                {diagramType === "bpmn" && (
                                  <>
                                    <button onClick={() => { closeFm(); importVisioInputRef.current?.click(); }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50" title="Import a Visio BPMN .vsdx file as a new diagram">Visio</button>
                                    <button onClick={() => { closeFm(); importBpmnInputRef.current?.click(); }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50" title="Import an OMG BPMN 2.0 .bpmn file as a new diagram">BPMN</button>
                                  </>
                                )}
                                {diagramType === "epc" && (
                                  <button onClick={() => { closeFm(); importAmlInputRef.current?.click(); }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50" title="Import an ARIS AML export — every EPC in the file becomes a diagram">ARIS (AML)</button>
                                )}
                                {diagramType === "domain" && isAdmin && (
                                  <button onClick={() => { closeFm(); importVisioInputRef.current?.click(); }} className="block w-full text-left px-3 py-2 text-xs text-red-700 hover:bg-red-50" title="Admin only — import a Visio UML .vsdx as a new domain diagram (still maturing).">Visio (UML)</button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      {/* SharePoint */}
                      <div className="relative">
                        <button
                          onClick={() => setMenuDest(menuDest === "sharepoint" ? null : "sharepoint")}
                          disabled={!sharePointAvailable}
                          title={sharePointAvailable ? undefined : "SharePoint isn't available — Microsoft/Azure isn't configured for this deployment, or your organisation has SharePoint turned off."}
                          className={`flex w-full items-center justify-between px-3 py-2 text-xs disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent ${menuDest === "sharepoint" ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                        >
                          <span>SharePoint</span><span className="text-gray-400">▸</span>
                        </button>
                        {menuDest === "sharepoint" && (
                          <div className="absolute bg-white border border-gray-200 rounded shadow-lg py-1 z-[10001]" style={{ top: "100%", left: -100, minWidth: 160 }}>
                            {sect === "export" ? (
                              <>
                                <button onClick={() => { closeFm(); setSpSaveFormat("pdf"); }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">PDF</button>
                                <button onClick={() => { closeFm(); setSpSaveFormat("svg"); }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">SVG</button>
                                <button onClick={() => { closeFm(); setSpSaveFormat("json"); }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">JSON</button>
                                {diagramType === "bpmn" && (
                                  <button onClick={() => { closeFm(); setSpSaveFormat("xml"); }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">XML</button>
                                )}
                                {diagramType === "bpmn" && (
                                  <button onClick={() => { closeFm(); setSpSaveFormat("visio"); }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50" title="Save a Visio .vsdx (v1.6 stencil) into SharePoint">Visio (.vsdx)</button>
                                )}
                              </>
                            ) : (
                              <>
                                <button onClick={() => { closeFm(); setSpOpenFmt("json"); }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">JSON</button>
                                {diagramType === "bpmn" && (
                                  <button onClick={() => { closeFm(); setSpOpenFmt("xml"); }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">XML</button>
                                )}
                                {diagramType === "bpmn" && (
                                  <>
                                    <button onClick={() => { closeFm(); setSpOpenFmt("visio"); }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">Visio</button>
                                    <button onClick={() => { closeFm(); setSpOpenFmt("bpmn"); }} className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">BPMN</button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
          </>
        )}

        {/* AI Generate — restored to the toolbar (in the AI feature colour). For
            BPMN/flowchart this opens the 2-phase Plan panel; other types open the
            legacy one-shot AI panel. Hidden when the org's policy disables AI
            (a non-presenting SuperAdmin is exempt). */}
        {!readOnly && diagramType !== "basic" && aiAllowedHere && (
          <button
            onClick={() => {
              const active = usesPlanPanel ? showPlanPanel : showAiPanel;
              if (active) {
                // Deactivate → remove the AI panel; the Diagram (Properties) panel
                // re-expands via forceCollapseTitle going false.
                setShowPlanPanel(false);
                setShowAiPanel(false);
              } else {
                setShowHistoryPanel(false);
                if (usesPlanPanel) { setShowPlanPanel(true); setShowAiPanel(false); }
                else { setShowAiPanel(true); setShowPlanPanel(false); }
              }
            }}
            style={(usesPlanPanel ? showPlanPanel : showAiPanel) ? featureVars(featureScheme, "ai") : undefined}
            className={`px-2 py-0.5 text-[11px] rounded border ${(usesPlanPanel ? showPlanPanel : showAiPanel)
              ? "feature-tile-active"
              : "text-gray-700 border-gray-300 hover:bg-gray-50"}`}
            title={usesPlanPanel ? "Two-phase AI generation: plan first, then apply layout" : "Generate a diagram from a natural-language description"}
          >
            ✨ AI Generate
          </button>
        )}

        {/* Tier-1 Assist toggle (BPMN only) — OPT-IN. When on, selecting a single
            element shows translucent ghost next-step suggestions (Tab / click to
            accept). Remembered per-diagram. */}
        {!readOnly && diagramType === "bpmn" && (
          <button
            onClick={() => {
              setAssistEnabled((prev) => {
                const nv = !prev;
                try { localStorage.setItem(`assist-${diagramId}`, String(nv)); } catch { /* ignore */ }
                return nv;
              });
            }}
            className={`px-2 py-0.5 text-[11px] rounded border ${
              assistEnabled
                ? "text-purple-700 border-purple-400 bg-purple-50"
                : "text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
            title={assistEnabled
              ? "Assist ON — select an element to see ghost next-step suggestions (Tab or click to accept). Click to turn off."
              : "Assist OFF — turn on ghost next-step suggestions while you draw"}
          >
            👻 Assist{assistEnabled ? " ●" : ""}
          </button>
        )}
        {/* Voice Assist — live voice/typed command editing (BPMN only).
            Expert subscriptions and above. */}
        {!readOnly && diagramType === "bpmn" && voiceAssistAllowed && (
          <button
            onClick={() => {
              setVoiceAssistOn((prev) => {
                const nv = !prev;
                try { localStorage.setItem(`voice-assist-${diagramId}`, String(nv)); } catch { /* ignore */ }
                return nv;
              });
            }}
            className={`px-2 py-0.5 text-[11px] rounded border ${
              voiceAssistOn
                ? "text-fuchsia-700 border-fuchsia-400 bg-fuchsia-50"
                : "text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
            title="Voice Assist — speak or type commands and the diagram edits itself live"
          >
            🪄 Voice Assist{voiceAssistOn ? " ●" : ""}
          </button>
        )}
        {!readOnly && (
          <div className="relative" ref={clearMenuRef}>
            <button
              onClick={() => setClearMenuOpen(prev => !prev)}
              className={`px-2 py-0.5 text-[11px] rounded border ${
                showHistoryPanel
                  ? "text-blue-700 border-blue-400 bg-blue-50"
                  : "text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
              title="Diagram actions — simulate, animate, review, help + configuration"
            >
              Diagram ▾
            </button>
            {clearMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded shadow-lg z-50">
                {/* Generating and publishing, moved in from the toolbar (Paul,
                    2026-09-19). They were three separate controls competing for
                    space along the top; none of them is something you reach for
                    mid-edit, which is what the toolbar is for. */}
                {/* NEW AI Generate — the full-screen console. Lives in this menu now
                    rather than the toolbar; still SuperAdmin-only while the
                    replacement is being judged against the original. */}
                {!readOnly && diagramType === "bpmn" && aiAllowedHere && isActingAdmin && (
                  <button
                    onClick={() => {
                      setClearMenuOpen(false);
                      setShowAiGenerateScreen(true);
                      setShowPlanPanel(false);
                      setShowAiPanel(false);
                      setShowHistoryPanel(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-fuchsia-700 hover:bg-fuchsia-50 font-medium"
                    title="The new full-screen AI Generate console — same two-phase generation, given a screen instead of a sidebar"
                  >
                    ✨ NEW AI Generate
                  </button>
                )}
                {diagramType === "bpmn" && projectId && (
                  <button
                    onClick={() => { setClearMenuOpen(false); setSopInitial({}); setShowSopDialog(true); }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    title="Generate a Standard Operating Procedure from this diagram (whole, or a single lane/pool/subprocess)"
                  >
                    Generate SOP
                  </button>
                )}

                {/* Publishing. The old dropdown's status line is kept — it is the
                    only place the current version number is shown, and burying it
                    without it would lose that. */}
                {!readOnly && isDiagramOwner && isExampleProject && (
                  <div className="px-3 py-2 border-t border-gray-100 text-[11px] text-gray-400 italic" title="Adopted example projects can't be published — rename the project to make it your own first.">
                    Example — not publishable
                  </div>
                )}
                {!readOnly && isDiagramOwner && !isExampleProject && (
                  <>
                    <div className="px-3 py-2 border-t border-gray-100 text-[11px]">
                      {lifecycle === "PUBLISHED" && currentPublishedVersion ? (
                        <span className="text-blue-700 font-medium">
                          Published v{currentPublishedVersion.versionNumber}
                          <span className="text-blue-500/70 font-normal ml-1">
                            · {new Date(currentPublishedVersion.publishedAt).toLocaleDateString()}
                          </span>
                        </span>
                      ) : lifecycle === "ARCHIVED" ? (
                        <span className="text-gray-500 font-medium">Archived</span>
                      ) : (
                        <span className="text-gray-600 font-medium">Draft — not yet published</span>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        setClearMenuOpen(false);
                        if (saveStatus === "unsaved") {
                          await saveNowRef.current();
                        }
                        setShowPublishDialog(true);
                      }}
                      title={
                        saveStatus === "unsaved"
                          ? "Saves first, then captures the saved snapshot"
                          : "Publish a new immutable version of this diagram"
                      }
                      className="w-full text-left px-3 py-2 text-xs text-blue-700 hover:bg-blue-50 font-medium"
                    >
                      Publish v{(currentPublishedVersion?.versionNumber ?? 0) + 1}…
                    </button>
                    <button
                      onClick={() => {
                        if (lifecycle !== "PUBLISHED" || !projectId) return;
                        setClearMenuOpen(false);
                        setShowPublishBundleDialog(true);
                      }}
                      disabled={lifecycle !== "PUBLISHED" || !projectId}
                      title={
                        lifecycle !== "PUBLISHED"
                          ? "Publish a version first before bundling to business users"
                          : !projectId
                            ? "Move this diagram into a project before bundling"
                            : "Publish this diagram (and its linked descendants) to business users"
                      }
                      className={`w-full text-left px-3 py-2 text-xs font-medium ${
                        lifecycle === "PUBLISHED" && projectId
                          ? "text-purple-700 hover:bg-purple-50"
                          : "text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      Publish bundle…
                    </button>
                  </>
                )}

                {supportsSimulator && simAllowed && (
                  <button
                    onClick={() => { setClearMenuOpen(false); setShowSimulator(true); }}
                    className="w-full text-left px-3 py-2 text-xs text-green-700 hover:bg-green-50 font-mono tracking-wider"
                    title="Enter the Diagramatix Simulator — event-based process simulation"
                  >
                    ◈ Simulator
                  </button>
                )}
                {supportsSimulator && isActingAdmin && (
                  <button
                    onClick={() => { setClearMenuOpen(false); setConfirmClearSim(true); }}
                    className="w-full text-left px-3 py-2 text-xs text-red-700 hover:bg-red-50"
                    title="SuperAdmin only — delete every simulation annotation on this diagram (cycle times, teams, arrivals, branch %s) so it can be re-tested from a clean slate"
                  >
                    🗑 Clear simulation data
                  </button>
                )}
                {data.elements.length > 0 && (
                  <button
                    onClick={() => { setClearMenuOpen(false); setShowAnimate(true); }}
                    className="w-full text-left px-3 py-2 text-xs text-blue-700 hover:bg-blue-50"
                    title="Animate! — gradually draw the diagram (Breadth- or Depth-first), with a movable speed/traversal control"
                  >
                    ▸ Animate!
                  </button>
                )}
                <button
                  onClick={() => { setClearMenuOpen(false); setShowSendReview(true); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                  title="Send this diagram to a Collaboration Group for review"
                >
                  Send for Review
                </button>
                <button
                  onClick={() => { setClearMenuOpen(false); setShowSupportDialog(true); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                  title="Send this diagram to support with a question"
                >
                  Get help
                </button>
                {diagramType === "bpmn" && (
                  <button
                    onClick={() => { setClearMenuOpen(false); setShowProcessDiff(true); }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    title="Compare this process with another version — who does what, which systems, and what is done"
                  >
                    Diff Processes
                  </button>
                )}
                <div className="border-t border-gray-100" />
                <button
                  onClick={() => { setClearMenuOpen(false); setClearConfirmOpen("all"); }}
                  disabled={data.elements.length === 0 && data.connectors.length === 0}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Remove every element and connector from this diagram"
                >
                  Clear Diagram
                </button>
                <button
                  onClick={() => { setClearMenuOpen(false); setClearConfirmOpen("unselected"); }}
                  disabled={selectedElementIds.size === 0}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={selectedElementIds.size === 0 ? "Select one or more elements first" : "Keep the selection (and connectors between selected elements); clear everything else"}
                >
                  Clear All but Selected
                  {selectedElementIds.size > 0 && (
                    <span className="text-gray-400 ml-1">({selectedElementIds.size})</span>
                  )}
                </button>
                <div className="border-t border-gray-100" />
                <button
                  onClick={() => {
                    setClearMenuOpen(false);
                    setShowHistoryPanel(prev => !prev);
                    if (!showHistoryPanel) { setShowAiPanel(false); setShowPlanPanel(false); }
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                  title="View and restore previous versions"
                >
                  History
                  {showHistoryPanel && <span className="text-blue-600 ml-1">·</span>}
                </button>
                <button
                  onClick={() => { setClearMenuOpen(false); setShowDiagramMaintenance(true); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                  title="Open the diagram configuration modal"
                >
                  Configuration
                </button>
                {data.elements.length > 0 && (
                  <button
                    onClick={() => {
                      setClearMenuOpen(false);
                      setDescriptionCopied(false);
                      setProcessDescription(
                        buildPromptFromDiagram(data.elements, data.connectors, diagramType as DiagramType)
                          || "This diagram is empty — nothing to describe yet.",
                      );
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    title="A structured plain-language description of this diagram, computed deterministically (no AI)"
                  >
                    Process description
                  </button>
                )}
                {(diagramType === "bpmn" || diagramType === "state-machine") && (
                  <>
                    <div className="border-t border-gray-100" />
                    <button
                      onClick={() => { setClearMenuOpen(false); setReviewIssues(null); setDiagramScan(checkDiagram(data)); }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      title="Check this diagram against the structural rules (the same rules the project-level scan uses)."
                    >
                      Scan Diagram for Issues
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <a
          href="/help"
          target="_blank"
          rel="noopener"
          className="text-[11px] text-gray-600 border border-gray-300 rounded px-2 py-0.5 hover:bg-gray-50 hover:text-blue-600"
          title="Open the User Guide in a new tab"
        >
          User Guide
        </a>

      </header>

      {/* Feedback banner — a VIEW-only recipient can comment without editing the
          shared diagram; each pink note is sent as feedback to the owner (item 6). */}
      {feedbackMode && (
        <div className="bg-pink-50 border-b border-pink-200 px-4 py-1.5 flex items-center gap-3 text-xs">
          <span className="font-semibold text-pink-800">Feedback</span>
          <span className="text-[11px] text-pink-700">View-only — drag a Review note onto an element, type your comment, then Send Feedback. Your notes don't change the shared diagram.</span>
          <div className="ml-auto flex items-center gap-2">
            {feedbackToast && <span className="text-[11px] text-pink-800 bg-white border border-pink-200 rounded px-2 py-0.5">{feedbackToast}</span>}
            <button
              onClick={handleSendFeedback}
              disabled={sendingFeedback}
              className="text-[11px] text-white bg-pink-600 hover:bg-pink-700 disabled:opacity-60 rounded px-2 py-0.5"
              title="Send your review notes to the diagram owner"
            >
              {sendingFeedback ? "Sending…" : "Send Feedback"}
            </button>
          </div>
        </div>
      )}

      {/* Main editor area */}
      {reviewMode && reviewCtx && (
        <div className="bg-pink-50 border-b border-pink-200 px-4 py-1.5 flex items-center gap-3 text-xs">
          <span className="text-pink-700 font-semibold uppercase tracking-wide text-[10px]">Review Mode</span>
          <span className="text-gray-700 truncate flex-1">
            <strong>{reviewCtx.requesterName}</strong> · {reviewCtx.objective}
            <span className="text-gray-400"> · due {new Date(reviewCtx.dueDate).toLocaleDateString()}</span>
          </span>
          <span className="text-[10px] text-pink-700">Drag a Review Comment onto an element to comment.</span>
          {(reviewCtx.myStatus === "pending" || reviewCtx.myStatus === "in-progress") ? (
            <>
              <button
                onClick={() => reviewStatusAction("approve")}
                className="text-[11px] text-white bg-yellow-600 hover:bg-yellow-700 rounded px-2 py-0.5"
                title="Sign off — the diagram is good to go"
              >
                Approve
              </button>
              <button
                onClick={() => reviewStatusAction("submit")}
                className="text-[11px] text-white bg-green-600 hover:bg-green-700 rounded px-2 py-0.5"
                title="Submit your comments for the owner to address"
              >
                Submit comments
              </button>
              <button
                onClick={() => reviewStatusAction("decline")}
                className="text-[11px] text-gray-700 border border-gray-300 rounded px-2 py-0.5 hover:bg-gray-50"
              >
                Decline
              </button>
            </>
          ) : (
            <span className="text-[10px] uppercase tracking-wide bg-white border border-pink-200 text-pink-700 rounded px-1.5 py-0.5">
              {(reviewCtx.myStatus ?? "").replace(/-/g, " ")}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {!readOnly && (
          <Palette
            diagramType={diagramType}
            onDragStart={(type, extras) => {
              setPendingDragSymbol(type);
              setPendingArchimateShapeKey(extras?.shapeKey ?? null);
              setPendingArchimateIconOnly(!!extras?.iconOnly);
            }}
            disabledSymbols={disabledSymbols}
            colorConfig={effectiveColorConfig}
            extraSymbols={reviewMode ? ["review-comment"] : []}
            forceCollapsed={voiceAssistOn}
          />
        )}

        {/* Feedback rail — a VIEW-only recipient's single tool: a draggable pink
            Review note. Everything else stays locked (item 6). */}
        {feedbackMode && (
          <div className="w-40 shrink-0 border-r border-gray-200 bg-pink-50/60 p-2 overflow-y-auto">
            <div className="text-[10px] font-semibold text-pink-700 mb-1">Give Feedback</div>
            <div
              draggable
              onDragStart={() => { setPendingDragSymbol("review-comment"); setPendingArchimateShapeKey(null); setPendingArchimateIconOnly(false); }}
              className="cursor-grab active:cursor-grabbing rounded border border-pink-300 bg-white px-2 py-2 flex items-center gap-2 hover:bg-pink-50 select-none"
              title="Drag onto an element (or empty space) to add a review note"
            >
              <svg width={22} height={16} viewBox="0 0 22 16" aria-hidden>
                <path d="M1 1 L16 1 L21 6 L21 15 L1 15 Z" fill="#fce7f3" stroke="#ec4899" strokeWidth={1.2} strokeLinejoin="round" />
                <rect x={1} y={1} width={2.5} height={14} fill="#ec4899" />
              </svg>
              <span className="text-[10px] text-gray-700 leading-tight">Review note</span>
            </div>
            <p className="text-[9px] text-gray-500 mt-2 leading-snug">Drop a note on an element to attach it, type your comment, then click <strong>Send Feedback</strong>.</p>
          </div>
        )}

        <Canvas
          data={displayData}
          diagramType={diagramType}
          renameBadges={renameFlow?.phase === "pick" ? renameFlow.targets : (messageFlow?.targets ?? pickFlow?.targets)}
          goldFlash={goldFlash}
          liftedIds={dragTravellingIds}
          onAddElement={addElementGated}
          onMoveElement={(id, x, y, uc) => { if (feedbackMode && !isFeedbackNote(id)) return; if (!isCoLocked(id)) moveElement(id, x, y, uc); }}
          onResizeElement={(id, x, y, w, h) => { if (feedbackMode && !isFeedbackNote(id)) return; if (!isCoLocked(id)) resizeElement(id, x, y, w, h); }}
          onUpdateLabel={(id, label) => { if (feedbackMode && !isFeedbackNote(id)) return; if (!isCoLocked(id)) handleUpdateLabel(id, label); }}
          entityStructure={entityStructure}
          onAddEntityNode={addEntityNode}
          onBeginLabelEdit={beginLabelEdit}
          onUpdateLabelLive={updateLabelLive}
          onCancelLabelEdit={cancelLabelEdit}
          onDeleteElement={(id) => {
            if (feedbackMode && !isFeedbackNote(id)) return; // feedback: notes only
            if (isCoLocked(id)) return; // another editor is holding this element
            deleteElement(id);
            setSelectedElementIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
          }}
          onAddConnector={(sourceId, targetId, type, directionType, routingType, sourceSide, targetSide, sourceOffsetAlong, targetOffsetAlong, force, initialLabel) => {
            // In feedback mode only a review tether (one end a pink note) is allowed.
            if (feedbackMode && !isFeedbackNote(sourceId) && !isFeedbackNote(targetId)) return;
            handleAddConnector(sourceId, targetId, type, directionType, routingType, sourceSide, targetSide, sourceOffsetAlong, targetOffsetAlong, force, initialLabel);
          }}
          onAddReviewComment={reviewMode ? handleAddReviewComment : feedbackMode ? handleAddFeedbackComment : !readOnly ? handleAddAuthorReviewComment : undefined}
          onToggleReviewCollapse={readOnly && !feedbackMode ? undefined : toggleReviewCollapse}
          onBringReviewToFront={readOnly && !feedbackMode ? undefined : bringReviewToFront}
          onDeleteConnector={(id) => {
            // Feedback mode: only a review tether may be removed, never a real connector.
            if (feedbackMode && data.connectors.find((c) => c.id === id)?.type !== "review-comment-link") return;
            deleteConnector(id);
            setSelectedConnectorId(null);
          }}
          onUpdateConnectorEndpoint={updateConnectorEndpoint}
          selectedElementIds={selectedElementIds}
          selectedConnectorId={selectedConnectorId}
          coEditLocks={presenceLocks}
          collabCursors={liveCursors}
          collabBroadcast={collabActive}
          collabBaseline={syncedData}
          exportHide={exportHide}
          nextStep={selectedElement && nextStepCandidates.length > 0 ? { source: selectedElement, candidates: nextStepCandidates } : undefined}
          onAcceptNextStep={acceptNextStep}
          pcHighlightEnabled={highlightEnabled}
          scanHighlightById={scanHighlight ?? undefined}
          riskHighlightById={riskHighlight ?? undefined}
          nonApqcHighlightIds={nonApqcHighlightIds}
          nonApqcColor={tonesFor(featureScheme, "apqc").text}
          entityDriftById={entityDrift ?? undefined}
          driftColor={tonesFor(featureScheme, "entityLists").text}
          scanHighlightConnectorById={scanConnectorHighlight ?? undefined}
          currentIssueIds={currentIssueIds.size > 0 ? currentIssueIds : undefined}
          onSetSelectedElements={(ids) => { dismissAiPanelOnCanvasClick(); setSelectedElementIds(ids); }}
          onSelectConnector={(id) => { dismissAiPanelOnCanvasClick(); setSelectedConnectorId(id); }}
          onMoveElements={moveElements}
          onElementsMoveEnd={elementsMoveEnd}
          onSwapLane={swapLane}
          pendingDragSymbol={pendingDragSymbol}
          pendingArchimateShapeKey={pendingArchimateShapeKey}
          pendingArchimateIconOnly={pendingArchimateIconOnly}
          defaultDirectionType={defaultDirectionType}
          defaultRoutingType={defaultRoutingType}
          onUpdateProperties={updateProperties}
          onUpdatePropertiesBatch={updatePropertiesBatch}
          onCollapseEpToSubprocess={requestCollapseEpToSubprocess}
          onCollapsePackage={requestCollapsePackage}
          onUpdateConnectorWaypoints={updateConnectorWaypoints}
          onUpdateConnectorLabel={updateConnectorLabel}
          onSplitConnector={splitConnector}
          onElementMoveEnd={elementMoveEnd}
          onMoveLaneBoundary={moveLaneBoundary}
          onMoveVSwimlaneBoundary={moveVSwimlaneBoundary}
          onResizeElementEnd={resizeElementEnd}
          onLaneBoundaryMoveEnd={laneBoundaryMoveEnd}
          onConnectorWaypointDragEnd={connectorWaypointDragEnd}
          onNudgeConnector={nudgeConnector}
          onNudgeConnectorEndpoint={nudgeConnectorEndpoint}
          onUpdateCurveHandles={updateCurveHandles}
          onUpdateConnectorFields={updateConnectorFields}
          colorConfig={effectiveColorConfig}
          displayMode={displayMode}
          debugMode={debugMode}
          getViewportCenterRef={getViewportCenterRef}
          spaceActionRef={spaceActionRef}
          diagramName={diagramName}
          createdAt={createdAt}
          updatedAt={effectiveUpdatedAt}
          readOnly={readOnly && !feedbackMode}
          onDrillIntoSubprocess={handleDrillIntoSubprocess}
          onDrillBack={parentDiagram ? handleDrillBack : undefined}
          parentDiagramName={parentDiagram?.name}
          showValueDisplay={showValueDisplay}
          showBottleneck={showBottleneck}
          onPointerWorld={(p) => { pointerWorld.current = p; }}
          onGenerateSopForElement={(diagramType === "bpmn" && projectId) ? ((scope, elementId) => { setSopInitial({ scope, elementId }); setShowSopDialog(true); }) : undefined}
          onInsertSpace={(diagramType === "bpmn" || diagramType === "state-machine" || diagramType === "archimate") ? insertSpace : undefined}
          onRemoveSpace={(diagramType === "bpmn" || diagramType === "state-machine" || diagramType === "archimate") ? removeSpace : undefined}
          onAddSelfTransition={diagramType === "state-machine" ? addSelfTransition : undefined}
        />

        {/* Voice Assist command bar — voice/typed live editing.
            Same gate as the wand that opens it, plus the BPMN check the wand
            had and this did not: a diagram-type switch used to leave the bar
            up on a diagram whose commands could not apply to it. */}
        {voiceAssistOn && !readOnly && diagramType === "bpmn" && voiceAssistAllowed && (
          <VoiceAssistBar
            listening={voiceListening}
            connecting={abraConnecting}
            engine={abraEngine}
            interim={voiceInterim}
            busy={voiceBusy}
            log={voiceLog}
            onSubmitText={(t) => { void runVoiceCommand(t); }}
            onToggleListen={() => { void toggleAbraListening(); }}
            onClear={() => setVoiceLog([])}
            onClose={() => { stopAbraListening(); setVoiceAssistOn(false); try { localStorage.setItem(`voice-assist-${diagramId}`, "false"); } catch {} }}
            onCost={fetchAbraCost}
            isSuperAdmin={isActingAdmin}
            debugOn={voiceDebugRecording}
            onToggleDebug={(on) => { setVoiceDebug(on); setVoiceDebugRecording(on); }}
            onAnnotate={annotateCommand}
            onSnapshot={(entryId) => { void takeDebugSnapshot(entryId); }}
            onDownloadSession={downloadDebugSession}
            onSaveSession={() => { void saveDebugSession(); }}
            saveState={debugSaveState}
            snapshotCount={debugSnapshots.length}
          />
        )}

        {/* Template-attach picker (assist "Template" ghost). Category → template
            cascade over inline-only templates; on pick, attach to the source. */}
        {templatePicker && (() => {
          const cats = Array.from(new Set(inlineTemplates.map((t) => t.group ?? "Ungrouped"))).sort((a, b) => a.localeCompare(b));
          const cat = templatePicker.category;
          const shown = cat ? inlineTemplates.filter((t) => (t.group ?? "Ungrouped") === cat) : [];
          return (
            <div className="fixed inset-0 z-50 flex items-start justify-center pt-24" onMouseDown={() => setTemplatePicker(null)}>
              <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-[420px] max-h-[70vh] flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                  <div className="flex items-center gap-2 min-w-0">
                    {cat && (
                      <button onClick={() => setTemplatePicker({ ...templatePicker, category: null, error: undefined })} className="text-gray-400 hover:text-gray-700 text-sm" title="Back to categories">←</button>
                    )}
                    <h3 className="text-sm font-semibold text-purple-800 truncate">{cat ? `Templates · ${cat}` : "Insert a template"}</h3>
                  </div>
                  <button onClick={() => setTemplatePicker(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
                </div>
                {templatePicker.error && (
                  <p className="px-4 py-2 text-xs text-red-600 border-b border-gray-100">{templatePicker.error}</p>
                )}
                <div className="overflow-y-auto p-2">
                  {!cat ? (
                    cats.length === 0 ? (
                      <p className="text-xs text-gray-400 px-2 py-3">No inline templates available.</p>
                    ) : cats.map((cName) => {
                      const n = inlineTemplates.filter((t) => (t.group ?? "Ungrouped") === cName).length;
                      return (
                        <button key={cName} onClick={() => setTemplatePicker({ ...templatePicker, category: cName })}
                          className="w-full flex items-center justify-between px-3 py-2 text-left text-sm text-gray-700 rounded hover:bg-purple-50">
                          <span className="truncate">{cName}</span>
                          <span className="text-[10px] text-gray-400 ml-2 shrink-0">{n}</span>
                        </button>
                      );
                    })
                  ) : (
                    shown.map((t) => (
                      <button key={t.id} onClick={() => attachTemplate(t.id, templatePicker.sourceId)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-left rounded hover:bg-purple-50"
                        title={t.description ? `${t.name} — ${t.description}` : t.name}>
                        <TemplateThumbnail templateId={t.id} svg={t.thumbnailSvg} width={56} height={42} />
                        <span className="flex-1 min-w-0 flex flex-col">
                          <span className="text-xs text-gray-800 truncate">{t.name}</span>
                          {t.description && <span className="text-[10px] text-gray-400 truncate">{t.description}</span>}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {!readOnly && (
          <PropertiesPanel
            element={selectedElement}
            connector={selectedConnector}
            diagramType={diagramType}
            diagramId={diagramId}
            multiSelectionCount={selectedElementIds.size}
            onUpdateLabel={handleUpdateLabel}
            onUpdateProperties={updateProperties}
            riskCatalog={riskCatalog}
            showRiskControls={rcAllowed}
            showSimulation={simAllowed}
            onCreateRiskItem={riskLibraryId ? onCreateRiskItem : undefined}
            rcSectionOpen={rcSectionOpen}
            onRcSectionToggle={toggleRcSection}
            onLinkSharePointFile={(id) => setSpLinkElId(id)}
            onPreviewSharePointFile={(link) => setSpPreview(link)}
            onSetEventBoundary={(id, hostId) => {
              setEventBoundary(id, hostId);
              // After detaching, clear the selection so the next click
              // on the (now-nudged) event isn't read as a connection-
              // creation gesture on a still-selected element.
              if (hostId === null) setSelectedElementIds(new Set());
            }}
            onUpdateConnectorDirection={updateConnectorDirection}
            onUpdateConnectorType={updateConnectorType}
            onReverseConnector={reverseConnector}
            onUpdateConnectorLabel={(id, label) => updateConnectorLabel(id, label)}
            onUpdateConnectorFields={updateConnectorFields}
            onDeleteElement={(id) => {
              deleteElement(id);
              setSelectedElementIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
            }}
            onDeleteConnector={(id) => {
              deleteConnector(id);
              setSelectedConnectorId(null);
            }}
            onAddLane={addLane}
            onAddSublane={addSublane}
            onReorderLane={reorderLane}
            parentName={parentName}
            poolHasContent={poolHasContent}
            laneHasContent={laneHasContent}
            hasMessageBpmnConnection={hasMessageBpmnConnection}
            allConnectors={data.connectors}
            allElements={data.elements}
            debugMode={debugMode}
            diagramName={diagramName}
            diagramTitle={data.title}
            database={data.database}
            onSetDatabase={diagramType === "domain" && isAdmin && !superAdminHidden ? setDatabase : undefined}
            showModelCost={isActingAdmin}
            purpose={data.purpose}
            description={data.description}
            onSetPurpose={setDiagramPurpose}
            onSetDescription={setDiagramDescription}
            relaxedLayout={data.relaxedLayout}
            onSetRelaxedLayout={diagramType === "bpmn" ? setRelaxedLayout : undefined}
            painPoints={data.elements.filter(e => e.type === "uml-pain-point")}
            showPainPoints={data.showPainPoints}
            onSetShowPainPoints={setShowPainPoints}
            showPainPointDescriptions={data.showPainPointDescriptions}
            onSetShowPainPointDescriptions={setShowPainPointDescriptions}
            issues={data.elements.filter(e => e.type === "uml-issue")}
            showIssues={data.showIssues}
            onSetShowIssues={setShowIssues}
            showIssueDescriptions={data.showIssueDescriptions}
            onSetShowIssueDescriptions={setShowIssueDescriptions}
            reviewComments={data.elements.filter(e => e.type === "review-comment")}
            showReviewComments={data.showReviewComments}
            onSetShowReviewComments={setShowReviewComments}
            onSetAllReviewCollapsed={setAllReviewCollapsed}
            onUpdateDiagramTitle={updateDiagramTitle}
            processOwner={data.processOwner}
            onSetProcessOwner={diagramType === "bpmn" ? setProcessOwner : undefined}
            procedureDoc={data.procedureDoc}
            onSetProcedureDoc={diagramType === "bpmn" ? setProcedureDoc : undefined}
            sops={diagramSops}
            onOpenSop={projectId ? ((sopId) => router.push(`/dashboard/projects/${projectId}/sop/${sopId}?from=${encodeURIComponent(`/diagram/${diagramId}`)}`)) : undefined}
            projectId={projectId ?? undefined}
            pcf={data.pcf}
            onSetPcf={diagramType === "bpmn" ? setPcf : undefined}
            diagramOwner={diagramOwner}
            diagramOwnerCandidates={diagramOwnerCandidates}
            canEditDiagramOwner={canEditDiagramOwner}
            diagramOwnerError={diagramOwnerError}
            onSetDiagramOwner={setDiagramOwner}
            isAdmin={isAdmin}
            createdAt={createdAt}
            updatedAt={effectiveUpdatedAt}
            siblingDiagrams={siblingDiagrams}
            currentDiagramId={diagramId}
            parentDiagramIds={data.parentDiagramIds}
            sessionParentId={parentDiagram?.id}
            onNavigateToDiagram={handleDrillIntoSubprocess}
            aiGeneration={data.aiGeneration}
            aiFreshness={aiFreshness}
            aiPromptModel={promptFacts?.processCode ? promptFacts.promptModel ?? "unknown" : undefined}
            aiModels={aiModels}
            currentAiModelId={currentAiModel?.id}
            onRegenerate={handleRegenerate}
            showAiPromptAnnotation={data.showAiPromptAnnotation}
            onToggleAiPromptAnnotation={toggleAiPromptAnnotation}
            onFlipForkJoin={flipForkJoin}
            onConvertTaskSubprocess={convertTaskSubprocess}
            onConvertProcessCollapsed={convertProcessCollapsed}
            onConvertEventType={convertEventType}
            forceCollapseTitle={showAiPanel || showPlanPanel || showHistoryPanel}
            forceCollapsePanel={voiceAssistOn}
          />
        )}

        {showAiPanel && (
          <AiPanel
            diagramType={diagramType}
            pcf={data.pcf}
            onApplyDiagram={(aiData: DiagramData, meta?: AiApplyMeta) => { void applyAiResult(aiData, meta); }}
            initialPrompt={aiPrefill?.prompt}
            initialModel={aiPrefill?.model}
            onPrefillConsumed={() => setAiPrefill(null)}
            aiModels={aiModels}
            currentAiModelId={currentAiModel?.id}
            noObstacleAvoidance={noObstacleAvoidance}
            onNoObstacleAvoidanceChange={(on) => {
              setNoObstacleAvoidanceState(on);
              setNoObstacleAvoidance(on);
              if (typeof window !== "undefined") localStorage.setItem(`noObstacles-${diagramId}`, on ? "true" : "false");
              rerouteAll();
            }}
            onClose={() => { setShowAiPanel(false); setAiPrefill(null); if (data.aiFeedback) setAiFeedback(undefined); }}
            onGeneratingChange={setAiPanelGenerating}
            isAdmin={isAdmin}
            currentElements={data.elements}
            currentConnectors={data.connectors}
            onNarrativeGeneratingChange={setAiPanelNarrativeGenerating}
            onAudioPhaseChange={setAudioPhase}
            aiFeedback={data.aiFeedback}
            onAiFeedback={setAiFeedback}
            diagramId={diagramId}
            onComparison={setAiComparison}
          />
        )}

        {isAdmin && !superAdminHidden && showComparisonModal && aiComparison ? (
          <AiComparisonModal
            comparison={aiComparison as AiComparison}
            currentDiagramId={diagramId}
            onClose={() => setShowComparisonModal(false)}
            onClear={() => { setShowComparisonModal(false); setConfirmClearComparison(true); }}
          />
        ) : null}

        {confirmClearComparison && (
          <ConfirmDialog
            title="Remove comparison results?"
            message="This clears the saved AI comparison for this diagram. The per-model diagrams saved earlier are not affected — delete those separately if you want. You can re-run a comparison any time."
            confirmLabel="Remove"
            onConfirm={clearComparison}
            onCancel={() => setConfirmClearComparison(false)}
          />
        )}

        {showAnimate && (
          <AnimateOverlay data={data} diagramName={diagramName} onClose={() => setShowAnimate(false)} />
        )}

        {showSimulator && (
          <SimulatorOverlay
            data={data}
            colorConfig={diagramColorConfig}
            diagramId={diagramId}
            projectId={projectId}
            isAdmin={isAdmin}
            diagramName={diagramName}
            onClose={() => setShowSimulator(false)}
            onFillTestData={() => {
              const { data: filled, filled: count } = autofillSimulation(data);
              setData(filled);
              return count;
            }}
            onApplyData={(next) => setData(next)}
          />
        )}

        {confirmClearSim && (
          <ConfirmDialog
            title="Clear all simulation data?"
            message={
              `This deletes EVERY simulation annotation on "${diagramName}" — cycle times, arrival rates, ` +
              `team assignments, timer delays, boundary triggers and gateway branch %s.\n\n` +
              `The diagram itself (shapes, flows, labels) is untouched, but this CANNOT be undone ` +
              `— it also resets the undo history.`
            }
            confirmLabel="Clear simulation data"
            cancelLabel="Cancel"
            destructive
            onConfirm={() => {
              const { data: cleared, cleared: n } = clearSimData(data);
              setData(cleared);
              setConfirmClearSim(false);
              setClearSimMsg(n > 0
                ? `Cleared ${n} simulation item(s) from "${diagramName}".`
                : "This diagram had no simulation data to clear.");
            }}
            onCancel={() => setConfirmClearSim(false)}
          />
        )}

        {clearSimMsg && (
          <AlertDialog
            title="Simulation data"
            message={clearSimMsg}
            tone="info"
            onClose={() => setClearSimMsg(null)}
          />
        )}

        {showPlanPanel && (
          <PlanPanel
            diagramType={diagramType}
            pcf={data.pcf}
            isAdmin={isAdmin}
            currentElements={data.elements}
            currentConnectors={data.connectors}
            onApplyDiagram={(aiData: DiagramData, meta?: AiApplyMeta) => { void applyAiResult(aiData, meta); }}
            initialPrompt={aiPrefill?.prompt}
            initialModel={aiPrefill?.model}
            onPrefillConsumed={() => setAiPrefill(null)}
            aiModels={aiModels}
            currentAiModelId={currentAiModel?.id}
            onClose={() => { setShowPlanPanel(false); setAiPrefill(null); if (data.aiFeedback) setAiFeedback(undefined); }}
            onBusyChange={setAiBusy}
            onAudioPhaseChange={setAudioPhase}
            aiFeedback={data.aiFeedback}
            onAiFeedback={setAiFeedback}
            diagramId={diagramId}
            onComparison={setAiComparison}
          />
        )}

        {showAiGenerateScreen && (
          <AiGenerateScreen
            diagramType={diagramType}
            diagramName={diagramName}
            pcf={data.pcf}
            isAdmin={isAdmin}
            currentElements={data.elements}
            currentConnectors={data.connectors}
            onApplyDiagram={(aiData: DiagramData, meta?: AiApplyMeta) => { void applyAiResult(aiData, meta); }}
            initialPrompt={aiPrefill?.prompt}
            initialModel={aiPrefill?.model}
            onPrefillConsumed={() => setAiPrefill(null)}
            aiModels={aiModels}
            currentAiModelId={currentAiModel?.id}
            onClose={() => { setShowAiGenerateScreen(false); setAiPrefill(null); if (data.aiFeedback) setAiFeedback(undefined); }}
            onBusyChange={setAiBusy}
            onAudioPhaseChange={setAudioPhase}
            aiFeedback={data.aiFeedback}
            onAiFeedback={setAiFeedback}
            diagramId={diagramId}
            onComparison={setAiComparison}
          />
        )}

        {previewPayload && (
          <FilePreviewDialog payload={previewPayload} onClose={() => setPreviewPayload(null)} />
        )}

        {showProcessDiff && (
          <ProcessDiffDialog
            currentId={diagramId}
            currentName={diagramName}
            currentData={data}
            currentProjectId={projectId}
            canMerge={isActingAdmin}
            siblings={siblingDiagrams.filter((s) => s.type === "bpmn" && s.id !== diagramId).map((s) => ({ id: s.id, name: s.name }))}
            onClose={() => setShowProcessDiff(false)}
          />
        )}

        {showSendReview && (
          <SendForReviewDialog
            diagramId={diagramId}
            diagramName={diagramName}
            currentUserEmail={userEmail}
            onClose={() => setShowSendReview(false)}
            onSent={({ reviews, reviewers }) => {
              setShowSendReview(false);
              setReviewSentMsg(
                `Sent for review to ${reviewers} reviewer${reviewers === 1 ? "" : "s"} ` +
                `across ${reviews} group${reviews === 1 ? "" : "s"}.`,
              );
            }}
          />
        )}

        {reviewSentMsg && (
          <AlertDialog
            title="Sent for review"
            message={reviewSentMsg}
            tone="info"
            onClose={() => setReviewSentMsg(null)}
          />
        )}

        {reviewActionMsg && (
          <AlertDialog
            title="Review"
            message={reviewActionMsg}
            tone="info"
            onClose={() => setReviewActionMsg(null)}
          />
        )}

        {bundleMsg && (
          <AlertDialog
            title="Diagram Bundle"
            message={bundleMsg}
            tone="error"
            onClose={() => setBundleMsg(null)}
          />
        )}

        {/* Co-authoring: someone is already editing this diagram on open. */}
        {showJoinPrompt && (
          <ConfirmDialog
            title="Someone's already editing"
            message={
              `${formatNameList(otherEditorNames)} ${otherEditorNames.length > 1 ? "are" : "is"} editing ` +
              `this diagram right now.\n\nJoin the session to edit together — your changes merge live — ` +
              `or open it view-only to look without making any changes.`
            }
            confirmLabel="Join & co-edit"
            cancelLabel="Open view-only"
            destructive={false}
            onConfirm={() => setShowJoinPrompt(false)}
            onCancel={() => { setSessionViewOnly(true); setShowJoinPrompt(false); }}
          />
        )}

        {epCollapseConfirmId && (
          <ConfirmDialog
            title="Collapse to Subprocess"
            message={"The contents of this Expanded Subprocess will be moved into a new linked diagram.\n\nDo you want to continue and create a new diagram?"}
            confirmLabel="Continue"
            cancelLabel="Cancel"
            destructive={false}
            onConfirm={() => {
              const id = epCollapseConfirmId;
              setEpCollapseConfirmId(null);
              if (id) void doCollapseEpToSubprocess(id);
            }}
            onCancel={() => setEpCollapseConfirmId(null)}
          />
        )}

        {pkgCollapseConfirmId && (
          <ConfirmDialog
            title="Collapse Package"
            message={"The classes inside this package will be moved into a new linked Domain diagram, and the package will show collapsed with its crossing relationships.\n\nDo you want to continue and create a new diagram?"}
            confirmLabel="Continue"
            cancelLabel="Cancel"
            destructive={false}
            onConfirm={() => {
              const id = pkgCollapseConfirmId;
              setPkgCollapseConfirmId(null);
              if (id) void doCollapsePackage(id);
            }}
            onCancel={() => setPkgCollapseConfirmId(null)}
          />
        )}

        {pkgLinkOffer && (
          <ConfirmDialog
            title="Link to existing diagram?"
            message={`A Domain diagram named "${pkgLinkOffer.name}" already exists in this project.\n\nLink this package to it, so double-clicking drills into that diagram?`}
            confirmLabel="Link"
            cancelLabel="Don't link"
            destructive={false}
            onConfirm={() => {
              const offer = pkgLinkOffer;
              setPkgLinkOffer(null);
              if (offer) updateProperties(offer.pkgId, { linkedDiagramId: offer.diagramId });
            }}
            onCancel={() => setPkgLinkOffer(null)}
          />
        )}

        {epCollapseMsg && (
          <AlertDialog
            title="Collapse Subprocess"
            message={epCollapseMsg}
            tone="error"
            onClose={() => setEpCollapseMsg(null)}
          />
        )}

        {/* "Add template" — the numbered window, answered by voice or mouse. */}
        {templateFlow && (
          <TemplatePickerWindow
            sections={templateFlow.sections}
            provisionalId={templateFlow.provisional?.card.id ?? null}
            hiddenNote={hiddenTemplatesNote(templateFlow.hiddenInitial, templateFlow.hiddenContainer)}
            anchorName={templateFlow.anchorName}
            notice={templateFlow.notice}
            onPick={(card) => {
              void pickTemplateCardRef.current(card, (r) =>
                setVoiceLog((prev) => [...prev, { id: nanoid(), at: Date.now(), heard: "", summary: r.summary, ok: r.ok }]));
            }}
            onConfirm={() => {
              const summary = closeTemplateFlowRef.current(true);
              setVoiceLog((prev) => [...prev, { id: nanoid(), at: Date.now(), heard: "", summary, ok: true }]);
            }}
            onCancel={() => {
              const summary = closeTemplateFlowRef.current(false);
              setVoiceLog((prev) => [...prev, { id: nanoid(), at: Date.now(), heard: "", summary, ok: true }]);
            }}
          />
        )}

        {/* SharePoint Save (one format → folder) / Open (file → import) picker */}
        {(spOpenFmt || spSaveFormat) && (() => {
          const ext: Record<"json" | "xml" | "visio" | "bpmn", string> = { json: ".json", xml: ".xml", visio: ".vsdx", bpmn: ".bpmn" };
          return (
            <SafeBoundary what="The SharePoint window" onClose={() => { setSpOpenFmt(null); setSpSaveFormat(null); }}>
            <SharePointPicker
              mode={spSaveFormat ? "folder" : "file"}
              title={spSaveFormat ? `Save ${spSaveFormat.toUpperCase()} to SharePoint` : `Open a ${spOpenFmt?.toUpperCase()} file from SharePoint`}
              confirmLabel={spSaveFormat ? "Save here" : "Open"}
              fileExtensions={spOpenFmt ? [ext[spOpenFmt]] : undefined}
              onCancel={() => { setSpOpenFmt(null); setSpSaveFormat(null); }}
              onPick={(sel) => {
                const fmt = spSaveFormat;
                const open = spOpenFmt;
                setSpOpenFmt(null);
                setSpSaveFormat(null);
                if (fmt) void saveFormatToSharePoint(fmt, sel);
                else if (open) void handleOpenFromSharePoint(sel);
              }}
            />
            </SafeBoundary>
          );
        })()}

        {/* SharePoint file-link picker (Data Object / Store) */}
        {spLinkElId && (
          <SafeBoundary what="The SharePoint window" onClose={() => setSpLinkElId(null)}>
            <SharePointPicker
              mode="file"
              title="Link a SharePoint file"
              confirmLabel="Link"
              onCancel={() => setSpLinkElId(null)}
              onPick={(sel) => {
                const elId = spLinkElId;
                setSpLinkElId(null);
                if (!elId || !sel.itemId) return;
                const link = { driveId: sel.driveId, itemId: sel.itemId, name: sel.name, webUrl: sel.webUrl };
                updateProperties(elId, { sharepointLink: link });
                setSpPreview(link);
              }}
            />
          </SafeBoundary>
        )}

        {/* Embedded preview of a linked SharePoint file */}
        {spPreview && (
          <SafeBoundary what="The SharePoint preview" onClose={() => setSpPreview(null)}>
            <SharePointPreview
              driveId={spPreview.driveId}
              itemId={spPreview.itemId}
              name={spPreview.name}
              webUrl={spPreview.webUrl}
              onClose={() => setSpPreview(null)}
            />
          </SafeBoundary>
        )}
        {spBusy && (
          <div className="fixed inset-0 bg-black/10 flex items-center justify-center z-[60]">
            <div className="bg-white rounded-lg shadow-xl px-5 py-4 text-xs text-gray-700">Working with SharePoint…</div>
          </div>
        )}
        {spMessage && (
          <AlertDialog
            title={spMessage.title}
            message={spMessage.body}
            tone={spMessage.tone}
            onClose={() => setSpMessage(null)}
          />
        )}

        {/* Canvas overlay — large branded throbber while Sonnet plans
            or the layout engine runs. Centred on the viewport so the
            user staring at the canvas sees something happening, not
            just a tiny sidebar banner they might miss. Pointer events
            pass through (style.pointerEvents = "none") so the user can
            still pan / zoom underneath if they want. */}
        {/* Fails CLOSED: the overlay needs a mounted AI panel behind it. Every busy
            state originates in one, and a panel that unmounts mid-work can leave
            its last report behind — the NEW AI Generate console did exactly that
            on Apply Layout (Paul, 2026-09-13: the spinning logo and "Running the
            layout engine" that never went away). The console now clears on
            unmount; this is the guard for the next panel that forgets to. */}
        {(showPlanPanel || showAiPanel || showAiGenerateScreen)
          && (aiBusy === "plan" || aiBusy === "apply" || aiBusy === "narrative" || aiBusy === "compare" || aiPanelGenerating || aiPanelNarrativeGenerating || audioPhase) && (
          <div
            className="fixed inset-0 z-40 flex flex-col items-center justify-center"
            style={{ pointerEvents: "none" }}
          >
            {/* Dramatic vignette dim — only while Claude Sonnet is thinking
                (not the fast, local layout "apply"). pointer-events:none is
                inherited, so the user can still pan/zoom underneath. */}
            {aiBusy !== "apply" && (
              <div
                className="dgx-ai-dim absolute inset-0"
                style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.64) 100%)" }}
              />
            )}
            <DiagramatixThrobber size={120} auraRadius={110} tone={aiBusy === "compare" ? "red" : "blue"} />
            <p className={`mt-3 text-sm font-medium ${aiBusy === "compare" ? "text-red-800" : "text-blue-800"} bg-white/85 backdrop-blur-sm px-4 py-2 rounded-lg shadow-md`}>
              {aiBusy === "compare"
                ? "Comparing the selected models — this can take a few minutes…"
                : audioPhase === "transcribing"
                ? "Transcribing your recording — this can take a little while…"
                : audioPhase === "reading"
                  ? "Reading the meeting transcript…"
                  : audioPhase === "tidying"
                    ? "Tidying the discussion into an ordered process…"
                    : aiBusy === "apply"
                      ? "Running the layout engine…"
                      : (aiBusy === "narrative" || aiPanelNarrativeGenerating)
                        ? "Generating the staff narrative — this usually takes 15–30 seconds…"
                        : "Generating your diagram — this usually takes 15–30 seconds…"}
            </p>
          </div>
        )}

        {/* (Domain connector-routing A/B switch moved into the Diagram
            Properties panel — issue #3.) */}

        {/* Review Mode — footer banner that steps through the flagged elements
            one at a time. Outlines + selection persist until Exit. Accepting
            an issue dismisses it for THIS session only; running the scan again
            re-surfaces every issue (including previously accepted ones). */}
        {reviewIssues && currentIssue && activeIssues && (() => {
          const titles = new Map(rulesMetadata().map((r) => [r.id, r.title]));
          const v = currentIssue.v;
          return (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40">
              <div className="bg-white border border-gray-300 rounded-lg shadow-xl px-3 py-2 flex items-center gap-3 max-w-3xl">
                <span className="text-[11px] text-gray-500 shrink-0">
                  Issue <strong className="text-gray-900">{reviewIssues.cursor + 1}</strong> of {activeIssues.length}
                  {reviewIssues.accepted.size > 0 && (
                    <span className="text-gray-400"> · {reviewIssues.accepted.size} accepted</span>
                  )}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${v.severity === "warning" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}>
                  {v.severity}
                </span>
                <span className="text-xs font-medium text-gray-900 shrink-0">{titles.get(v.rule) ?? v.rule}</span>
                <span className="text-[11px] text-gray-600 truncate min-w-0" title={v.message}>{v.message}</span>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    onClick={reviewPrev}
                    disabled={reviewIssues.cursor === 0}
                    className="px-2 py-1 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Previous issue"
                  >‹ Prev</button>
                  <button
                    onClick={reviewAcceptCurrent}
                    className="px-2 py-1 text-xs text-gray-700 border border-gray-300 rounded hover:bg-green-50 hover:border-green-300"
                    title="Accept this issue for this session (it will reappear on the next scan)"
                  >Accept</button>
                  <button
                    onClick={reviewNext}
                    disabled={reviewIssues.cursor >= activeIssues.length - 1}
                    className="px-2 py-1 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Next issue"
                  >Next ›</button>
                  <button
                    onClick={reviewExit}
                    className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 ml-1"
                    title="Exit review (clears the outlines)"
                  >✕</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Per-diagram "Scan for Issues" results (BPMN only). Runs the shared
            rule registry on the live diagram — same rules as the project scan
            and the test harness. */}
        {diagramScan !== null && (() => {
          const titles = new Map(rulesMetadata().map((r) => [r.id, r.title]));
          const errors = diagramScan.filter((v) => v.severity === "error");
          const warnings = diagramScan.filter((v) => v.severity === "warning");
          const renderList = (list: Violation[]) => (
            <ul className="space-y-1.5">
              {list.map((v, i) => (
                <li key={`${v.rule}:${i}`} className="border border-gray-100 rounded px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${v.severity === "warning" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}>
                      {v.severity}
                    </span>
                    <span className="text-xs font-medium text-gray-900">{titles.get(v.rule) ?? v.rule}</span>
                  </div>
                  <p className="text-[11px] text-gray-600 mt-1">{v.message}</p>
                </li>
              ))}
            </ul>
          );
          return (
            <div
              className="fixed bg-white rounded-lg shadow-xl flex flex-col z-50 border border-gray-200"
              style={{
                left: diagramScanPos?.x ?? 0,
                top: diagramScanPos?.y ?? 0,
                width: 576,
                maxHeight: "80vh",
                // Hide the popup until the position effect runs so it
                // doesn't flash at (0,0) on the very first open.
                visibility: diagramScanPos ? "visible" : "hidden",
              }}
            >
                {/* Pinned header — Close is always visible while the list
                    scrolls. Also acts as the DRAG HANDLE: mousedown
                    anywhere on the header (except on a button) starts a
                    drag that lets the user slide the popup aside to
                    inspect canvas elements behind it. */}
                <div
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).closest("button")) return;
                    if (!diagramScanPos) return;
                    e.preventDefault();
                    setDiagramScanDrag({
                      ox: e.clientX - diagramScanPos.x,
                      oy: e.clientY - diagramScanPos.y,
                    });
                  }}
                  className="px-6 py-4 border-b border-gray-200 flex items-start justify-between shrink-0 cursor-move select-none"
                  title="Drag to move — click Close to dismiss"
                >
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Diagram Issues</h2>
                    {diagramScan.length > 0 ? (
                      <div className="flex items-center gap-3 mt-1 text-xs">
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block w-2 h-2 rounded-full bg-red-600" />
                          <span className="text-gray-700"><strong>{errors.length}</strong> error{errors.length === 1 ? "" : "s"}</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                          <span className="text-gray-700"><strong>{warnings.length}</strong> warning{warnings.length === 1 ? "" : "s"}</span>
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 mt-1">No issues found.</p>
                    )}
                  </div>
                  <button
                    onClick={closeDiagramScan}
                    className="px-3 py-1 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 shrink-0"
                    title="Close — when there are issues you'll step through them in Review Mode"
                  >
                    Close
                  </button>
                </div>
                {/* Scrolling body */}
                <div className="overflow-y-auto px-6 py-4 flex-1 space-y-3">
                  {diagramScan.length === 0 ? (
                    <p className="text-sm text-gray-600">Nothing to report — this diagram passes every rule.</p>
                  ) : (
                    <>
                      {errors.length > 0 && (
                        <div className="border border-gray-200 rounded">
                          <button
                            onClick={() => setScanErrorsOpen((v) => !v)}
                            className="w-full flex items-center gap-2 px-3 py-2 bg-red-50 hover:bg-red-100 text-left rounded-t"
                          >
                            <span className="text-xs text-gray-500">{scanErrorsOpen ? "▼" : "▶"}</span>
                            <span className="text-[11px] uppercase tracking-wide font-semibold text-red-700">Errors</span>
                            <span className="text-[10px] text-gray-600">({errors.length})</span>
                          </button>
                          {scanErrorsOpen && <div className="px-3 py-2">{renderList(errors)}</div>}
                        </div>
                      )}
                      {warnings.length > 0 && (
                        <div className="border border-gray-200 rounded">
                          <button
                            onClick={() => setScanWarningsOpen((v) => !v)}
                            className="w-full flex items-center gap-2 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-left rounded-t"
                          >
                            <span className="text-xs text-gray-500">{scanWarningsOpen ? "▼" : "▶"}</span>
                            <span className="text-[11px] uppercase tracking-wide font-semibold text-amber-700">Warnings</span>
                            <span className="text-[10px] text-gray-600">({warnings.length})</span>
                          </button>
                          {scanWarningsOpen && <div className="px-3 py-2">{renderList(warnings)}</div>}
                        </div>
                      )}
                    </>
                  )}
                </div>
            </div>
          );
        })()}

        {showHistoryPanel && (
          <HistoryPanel
            diagramId={diagramId}
            hasUnsavedChanges={saveStatus === "unsaved"}
            onPreview={(previewData) => {
              // Load the snapshot into the canvas but do NOT save — user can save/discard.
              // UI-02: remember the real diagram on entering preview, and pause
              // autosave, so the previewed snapshot can't be silently persisted.
              if (!historyPreviewActive) prePreviewDataRef.current = data;
              setHistoryPreviewActive(true);
              setData({
                ...data,
                elements: previewData.elements,
                connectors: previewData.connectors,
                viewport: previewData.viewport ?? data.viewport,
                fontSize: previewData.fontSize ?? data.fontSize,
                connectorFontSize: previewData.connectorFontSize ?? data.connectorFontSize,
                titleFontSize: previewData.titleFontSize ?? data.titleFontSize,
                title: previewData.title ?? data.title,
                database: previewData.database ?? data.database,
              });
            }}
            onRestored={async () => {
              // Reload diagram from server (restore replaced it in DB)
              try {
                const res = await fetch(`/api/diagrams/${diagramId}`);
                if (res.ok) {
                  const fresh = await res.json();
                  setData(fresh.data);
                }
              } catch { /* ignore */ }
              // UI-02: server applied the restore — preview is over, resume autosave.
              setHistoryPreviewActive(false);
              prePreviewDataRef.current = null;
              setShowHistoryPanel(false);
            }}
            onClose={() => {
              // UI-02: discard — revert the canvas to the real diagram we stashed
              // on entering preview, then resume autosave. Without this the
              // previewed snapshot would linger and get saved on the next edit/nav.
              if (historyPreviewActive && prePreviewDataRef.current) {
                setData(prePreviewDataRef.current);
              }
              setHistoryPreviewActive(false);
              prePreviewDataRef.current = null;
              setShowHistoryPanel(false);
            }}
          />
        )}
      </div>

      {showTemplateNameModal && (() => {
        // Suggest groups from whichever list we're saving into. For an edit,
        // figure out scope from which list contains the template.
        let scopeList: TemplateRow[] = userTemplates;
        let initialGroup: string | null = null;
        if (templateEditState) {
          const inBuiltin = builtInTemplates.find((t) => t.id === templateEditState.templateId);
          if (inBuiltin) { scopeList = builtInTemplates; initialGroup = inBuiltin.group; }
          else {
            const inUser = userTemplates.find((t) => t.id === templateEditState.templateId);
            if (inUser) initialGroup = inUser.group;
          }
        } else if (templateMode === "capturing-builtin") {
          scopeList = builtInTemplates;
        }
        const knownGroups = scopeList
          .map((t) => t.group)
          .filter((g): g is string => !!g);
        return (
          <TemplateNameModal
            onSave={templateEditState
              ? handleUpdateTemplate
              : (name: string, group: string | null) => handleConfirmTemplateName(name, group)}
            onClose={() => { setShowTemplateNameModal(false); setPendingTemplateData(null); setTemplateMode("idle"); }}
            initialName={templateEditState?.templateName}
            initialGroup={initialGroup}
            knownGroups={knownGroups}
            title={templateEditState ? "Update Template" : templateMode === "capturing-builtin" ? "Save Built-In Template" : "Save User Template"}
          />
        );
      })()}

      {templateImportInfo && (
        <InfoDialog
          title={templateImportInfo.title}
          lines={templateImportInfo.lines}
          onClose={() => setTemplateImportInfo(null)}
        />
      )}

      {templateDeleteConfirm && (
        <ConfirmDialog
          title="Delete Template"
          message={`Are you sure you want to delete the template "${templateDeleteConfirm.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            const { id, isBuiltIn } = templateDeleteConfirm;
            setTemplateDeleteConfirm(null);
            void handleDeleteTemplate(id, isBuiltIn);
          }}
          onCancel={() => setTemplateDeleteConfirm(null)}
        />
      )}

      {clearConfirmOpen === "all" && (() => {
        const elCount = data.elements.length;
        const conCount = data.connectors.length;
        return (
          <ConfirmDialog
            title="Clear Diagram"
            message={`This will remove ${elCount} element${elCount === 1 ? "" : "s"} and ${conCount} connector${conCount === 1 ? "" : "s"}. You can Ctrl+Z to undo.`}
            confirmLabel="Clear"
            onConfirm={() => { clearDiagram(); setClearConfirmOpen(null); }}
            onCancel={() => setClearConfirmOpen(null)}
          />
        );
      })()}

      {clearConfirmOpen === "unselected" && (() => {
        // Expand the selection the same way the reducer does so the
        // confirmation counts match what will actually be kept.
        const byId = new Map(data.elements.map(e => [e.id, e]));
        const keep = new Set<string>(selectedElementIds);
        for (const id of selectedElementIds) {
          let cur = byId.get(id);
          while (cur?.parentId) {
            if (keep.has(cur.parentId)) break;
            keep.add(cur.parentId);
            cur = byId.get(cur.parentId);
          }
        }
        for (const id of selectedElementIds) {
          const el = byId.get(id);
          if (el?.boundaryHostId) keep.add(el.boundaryHostId);
        }
        for (const el of data.elements) {
          if (el.boundaryHostId && keep.has(el.boundaryHostId)) keep.add(el.id);
        }
        const removeEl = data.elements.length - keep.size;
        const removeConn = data.connectors.filter(c =>
          !(keep.has(c.sourceId) && keep.has(c.targetId))
        ).length;
        return (
          <ConfirmDialog
            title="Clear All but Selected"
            message={`This will keep ${keep.size} element${keep.size === 1 ? "" : "s"} (selection plus their pools/lanes/hosts) and the connectors between them, and remove ${removeEl} other element${removeEl === 1 ? "" : "s"} plus ${removeConn} connector${removeConn === 1 ? "" : "s"}. You can Ctrl+Z to undo.`}
            confirmLabel="Clear others"
            onConfirm={() => { clearDiagramExcept(selectedElementIds); setClearConfirmOpen(null); }}
            onCancel={() => setClearConfirmOpen(null)}
          />
        );
      })()}

      {pendingImport && (
        <ConfirmDialog
          title="Import diagram?"
          message={pendingImport.message}
          confirmLabel="Import"
          cancelLabel="Cancel"
          destructive
          onCancel={() => setPendingImport(null)}
          onConfirm={() => {
            const apply = pendingImport.apply;
            setPendingImport(null);
            apply();
          }}
        />
      )}

      {showPublishDialog && (
        <PublishVersionDialog
          diagramId={diagramId}
          nextVersionNumber={(currentPublishedVersion?.versionNumber ?? 0) + 1}
          initialReviewCadenceMonths={initialReviewCadenceMonths}
          initialNextReviewDate={initialNextReviewDate}
          onClose={() => setShowPublishDialog(false)}
          onPublished={({ versionNumber, publishedAt }) => {
            setLifecycle("PUBLISHED");
            setCurrentPublishedVersion({ versionNumber, publishedAt });
            setShowPublishDialog(false);
          }}
        />
      )}

      {showPublishBundleDialog && projectId && (
        <PublishBundleDialog
          diagramId={diagramId}
          diagramName={diagramName}
          projectId={projectId}
          onClose={() => setShowPublishBundleDialog(false)}
          onPublished={() => {
            setShowPublishBundleDialog(false);
          }}
        />
      )}

      {showSupportDialog && (
        <SupportRequestDialog
          diagramId={diagramId}
          diagramName={diagramName}
          getSvgEl={() => document.querySelector<SVGSVGElement>("svg[data-canvas]")}
          onClose={() => setShowSupportDialog(false)}
          onSent={() => {
            setShowSupportDialog(false);
            setSupportSentToast(true);
            setTimeout(() => setSupportSentToast(false), 4000);
          }}
        />
      )}

      {supportSentToast && (
        <div className="fixed bottom-6 right-6 bg-green-600 text-white text-sm font-medium rounded shadow-lg px-4 py-2 z-50">
          Sent to support — they&apos;ll reply by email.
        </div>
      )}

      {showFeedbackPanel && (
        <FeedbackPanel
          diagramId={diagramId}
          onFocusElement={(elementId) => {
            // Select the pinned element so it highlights on the canvas.
            setSelectedElementIds(new Set([elementId]));
          }}
          onClose={() => setShowFeedbackPanel(false)}
        />
      )}

      {showSaveAs && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="px-5 pt-4 pb-2">
              <h2 className="text-base font-semibold text-gray-900">Save As</h2>
              <p className="mt-1 text-sm text-gray-600">
                Clones this diagram into the same project under a new name.
                The current diagram is not modified.
              </p>
            </div>
            <div className="px-5 py-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">New diagram name</label>
              <input
                autoFocus
                type="text"
                value={saveAsName}
                onChange={(e) => setSaveAsName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveAs();
                  if (e.key === "Escape") { setShowSaveAs(false); setSaveAsError(null); }
                }}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {saveAsError && <p className="mt-2 text-xs text-red-600">{saveAsError}</p>}
            </div>
            <div className="px-5 pb-4 pt-2 flex gap-2 justify-end">
              <button
                onClick={() => { setShowSaveAs(false); setSaveAsError(null); }}
                className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAs}
                disabled={!saveAsName.trim() || saveAsBusy}
                className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saveAsBusy ? "Saving\u2026" : "Save As"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEpcToBpmn && (
        <EpcToBpmnDialog
          source={data}
          sourceName={diagramName}
          projectId={projectId}
          onClose={() => setShowEpcToBpmn(false)}
          onCreated={(created) => {
            setShowEpcToBpmn(false);
            router.push(`/diagram/${created.id}`);
          }}
        />
      )}

      {showTranslate && (
        <TranslateToBpmnDialog
          source={data}
          sourceName={diagramName}
          projectId={projectId}
          onClose={() => setShowTranslate(false)}
          onCreated={(created) => {
            setShowTranslate(false);
            router.push(`/diagram/${created.id}`);
          }}
        />
      )}

      {/* Admin: pick the source list to EXPORT (User vs Built-In). */}
      {templateExportPrompt && isAdmin && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="px-5 pt-4 pb-2">
              <h2 className="text-base font-semibold text-gray-900">Export Templates</h2>
              <p className="mt-1 text-sm text-gray-600">
                Pick which template list to export as a <code>.diag_tems</code> file.
              </p>
            </div>
            <div className="px-5 pb-4 pt-2 flex gap-2 justify-end">
              <button
                onClick={() => setTemplateExportPrompt(false)}
                className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setTemplateExportPrompt(false);
                  setFileMenuOpen(false);
                  setFileSubmenu(null);
                  handleExportTemplates("user");
                }}
                className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                User templates
              </button>
              <button
                onClick={() => {
                  setTemplateExportPrompt(false);
                  setFileMenuOpen(false);
                  setFileSubmenu(null);
                  handleExportTemplates("builtin");
                }}
                className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
              >
                Built-In templates
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin: pick the destination list to IMPORT into. */}
      {templateImportFile && isAdmin && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="px-5 pt-4 pb-2">
              <h2 className="text-base font-semibold text-gray-900">Import Templates</h2>
              <p className="mt-1 text-sm text-gray-600">
                Importing <span className="font-mono">{templateImportFile.name}</span>.
                Pick the destination list. Duplicates (by name) are skipped.
              </p>
            </div>
            <div className="px-5 pb-4 pt-2 flex gap-2 justify-end">
              <button
                onClick={() => setTemplateImportFile(null)}
                className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const f = templateImportFile;
                  setTemplateImportFile(null);
                  if (f) await handleImportTemplatesFile(f, "user");
                }}
                className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                User templates
              </button>
              <button
                onClick={async () => {
                  const f = templateImportFile;
                  setTemplateImportFile(null);
                  if (f) await handleImportTemplatesFile(f, "builtin");
                }}
                className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
              >
                Built-In templates
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visio import status — shows the per-master breakdown, stats, and
          full warnings list from the most recent Import → Visio. Always
          shown after an import (clean or noisy) so the user can verify
          what came through and what didn't. Stays open until the user
          explicitly clicks Close or Open Diagram (z-[60] beats the
          unsaved-changes dialog and other z-50 overlays; backdrop click
          is swallowed). */}
      {/* Overwrite-or-create confirm — shown when the chosen .vsdx
          file's basename matches the current diagram's name.
          OK ⇒ overwrite this diagram. Cancel ⇒ create a new diagram
          (the API will append a dd-mm-yy hh:mm timestamp to the name
          if a same-named diagram already exists in the project). */}
      {pendingVisioImport && (
        <ConfirmDialog
          title={`Overwrite "${pendingVisioImport.baseName}"?`}
          message={
            (pendingVisioImport.kind === "bpmn"
              ? `The BPMN file's name matches this diagram. `
              : `The Visio file's name matches this diagram. `) +
            `Overwrite the current diagram with the imported content?\n\n` +
            `Cancel will instead create a new diagram with the same name; if a ` +
            `same-named diagram already exists in this project, a dd-mm-yy hh:mm ` +
            `timestamp will be appended automatically to keep both visible.`
          }
          confirmLabel="Overwrite"
          cancelLabel="Create new"
          destructive={false}
          onConfirm={async () => {
            const p = pendingVisioImport;
            setPendingVisioImport(null);
            if (p.kind === "bpmn") await runBpmnImport(p.file, p.baseName, true);
            else await runVisioImport(p.file, p.baseName, true);
          }}
          onCancel={async () => {
            const p = pendingVisioImport;
            setPendingVisioImport(null);
            if (p.kind === "bpmn") await runBpmnImport(p.file, p.baseName, false);
            else await runVisioImport(p.file, p.baseName, false);
          }}
        />
      )}

      {/* Export options (items M) — annotation inclusion (default OFF) + PDF scale. */}
      {exportDlg && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[70]" onMouseDown={() => setExportDlg(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-xs mx-4" onMouseDown={(e) => e.stopPropagation()}>
            <div className="px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Export as {exportDlg.toUpperCase()}</h3>
              {exportDlg === "pdf" && (
                <div className="mb-3">
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Scale</div>
                  <div className="flex gap-3">
                    {[100, 75, 50, 25].map((val) => (
                      <label key={val} className="flex items-center gap-1 text-xs text-gray-700 cursor-pointer">
                        <input type="radio" name="pdfScaleDlg" checked={pendingPdfScale === val} onChange={() => setPendingPdfScale(val)} className="accent-blue-600" />
                        {val}%
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {hasAnnotations(data) ? (
                <>
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Include annotations</div>
                  {([
                    ["reviewComments", "Review Comments"],
                    ["painPoints", "Pain Points"],
                    ["issues", "Issues"],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 py-0.5 text-xs text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={exportInc[key]}
                        onChange={(e) => setExportInc((prev) => ({ ...prev, [key]: e.target.checked }))}
                        className="accent-blue-600" />
                      {label}
                    </label>
                  ))}
                  <p className="text-[10px] text-gray-400 mt-1">Unchecked = excluded from the export.</p>
                </>
              ) : (
                <p className="text-xs text-gray-500">This diagram has no annotations to exclude.</p>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
              <button onClick={() => setExportDlg(null)} className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
              <button
                onClick={() => {
                  const fmt = exportDlg; const inc = exportInc;
                  setExportDlg(null);
                  if (fmt === "pdf") { setPdfScale(pendingPdfScale); void handleExportPdf(inc); }
                  else handleExport(inc); // svg (JSON no longer routes through this dialog)
                }}
                className="px-3 py-1.5 text-xs font-medium text-white rounded bg-blue-600 hover:bg-blue-700"
              >Export</button>
            </div>
          </div>
        </div>
      )}

      {visioImportStatus && (
        <div
          className="fixed inset-0 bg-black/20 flex items-center justify-center z-[60]"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-4 pb-2 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">{visioImportStatus.kind === "bpmn" ? "BPMN Import — Results" : "Visio Import — Results"}</h2>
              <p className="mt-1 text-xs text-gray-600">
                {visioImportStatus.kind === "bpmn"
                  ? "Element/connector totals and any warnings from this BPMN 2.0 import. Open the new diagram to see the result on canvas, or close to retry with a different file."
                  : "Page totals, per-master breakdown, and any warnings from this import. Open the new diagram to see the result on canvas, or close to retry with a different file."}
              </p>
            </div>
            <div className="px-5 py-3 border-b border-gray-200">
              <div className="grid grid-cols-3 gap-3 text-xs text-gray-700">
                <div><span className="font-semibold">{visioImportStatus.kind === "bpmn" ? "Total elements:" : "Total shapes on page:"}</span> {visioImportStatus.stats.totalShapesOnPage}</div>
                <div><span className="font-semibold">Elements created:</span> {visioImportStatus.stats.elementsCreated}</div>
                <div><span className="font-semibold">Connectors created:</span> {visioImportStatus.stats.connectorsCreated}</div>
                <div><span className="font-semibold">{visioImportStatus.kind === "bpmn" ? "Elements skipped:" : "Shapes skipped:"}</span> {visioImportStatus.stats.shapesSkipped}</div>
                <div><span className="font-semibold">Connectors skipped:</span> {visioImportStatus.stats.connectorsSkipped}</div>
                {visioImportStatus.kind !== "bpmn" && (
                  <div><span className="font-semibold">Implicit pools:</span> {visioImportStatus.stats.implicitPools}</div>
                )}
              </div>
            </div>
            <div className="overflow-y-auto px-5 py-3 flex-1 min-h-0">
              {visioImportStatus.kind !== "bpmn" && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Master breakdown</h3>
                <div className="border border-gray-300 rounded text-[13px] text-gray-900">
                  <table className="w-full">
                    <thead className="bg-gray-100 text-gray-900 border-b border-gray-300">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold">Master ID</th>
                        <th className="text-left px-3 py-2 font-semibold">NameU</th>
                        <th className="text-right px-3 py-2 font-semibold">Count</th>
                        <th className="text-left px-3 py-2 font-semibold">Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visioImportStatus.stats.masters.length === 0 && (
                        <tr><td colSpan={4} className="px-3 py-2 text-gray-700">(no masters used)</td></tr>
                      )}
                      {visioImportStatus.stats.masters.map((m, i) => (
                        <tr key={i} className={
                          "border-t border-gray-200 " + (
                            m.classifiedAs === "skipped" ? "bg-red-100" :
                            m.classifiedAs.includes("implicit") || m.classifiedAs.includes("heuristic") || m.classifiedAs.includes("black-box") ? "bg-yellow-100" :
                            i % 2 === 0 ? "bg-white" : "bg-gray-50"
                          )
                        }>
                          <td className="px-3 py-1.5 font-mono">{m.masterId}</td>
                          <td className="px-3 py-1.5">{m.nameU || <span className="text-gray-500 italic">(empty)</span>}</td>
                          <td className="px-3 py-1.5 text-right">{m.count}</td>
                          <td className="px-3 py-1.5">{m.classifiedAs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              )}
              {visioImportStatus.warnings.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-800 mb-1">
                    Warnings ({visioImportStatus.warnings.length})
                  </h3>
                  <pre className="text-[11px] font-mono whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-2 text-gray-700">
{visioImportStatus.warnings.join("\n")}
                  </pre>
                </div>
              )}
            </div>
            <div className="px-5 py-3 flex gap-2 justify-end border-t border-gray-200">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(
                    [
                      `Total: ${visioImportStatus.stats.totalShapesOnPage} shapes, ${visioImportStatus.stats.elementsCreated} elements, ${visioImportStatus.stats.connectorsCreated} connectors`,
                      `Skipped: ${visioImportStatus.stats.shapesSkipped} shapes, ${visioImportStatus.stats.connectorsSkipped} connectors. Implicit pools: ${visioImportStatus.stats.implicitPools}`,
                      "",
                      "Master breakdown:",
                      ...visioImportStatus.stats.masters.map(
                        (m) => `  ${m.masterId.padStart(4)}  ${m.count.toString().padStart(3)}×  ${m.classifiedAs.padEnd(28)}  ${m.nameU || "(empty)"}`,
                      ),
                      "",
                      `Warnings (${visioImportStatus.warnings.length}):`,
                      ...visioImportStatus.warnings,
                    ].join("\n"),
                  );
                }}
                className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                Copy to clipboard
              </button>
              <button
                onClick={() => setVisioImportStatus(null)}
                className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const id = visioImportStatus.diagram.id;
                  setVisioImportStatus(null);
                  router.push(`/diagram/${id}`);
                }}
                className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-700"
              >
                Open Diagram
              </button>
            </div>
          </div>
        </div>
      )}

      {unsavedDialog && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="px-5 pt-4 pb-2">
              <h2 className="text-base font-semibold text-gray-900">Unsaved changes</h2>
              <p className="mt-1 text-sm text-gray-600">
                This diagram has unsaved edits. Save them before leaving?
              </p>
            </div>
            <div className="px-5 pb-4 pt-2 flex gap-2 justify-end">
              <button
                onClick={() => unsavedDialog.resolve("cancel")}
                className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => unsavedDialog.resolve("discard")}
                className="px-3 py-1.5 text-sm text-red-700 border border-red-300 rounded hover:bg-red-50"
                title="Leave without saving — your changes will be lost"
              >
                Discard &amp; Leave
              </button>
              <button
                onClick={() => unsavedDialog.resolve("save")}
                className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
                autoFocus
              >
                Save &amp; Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Access Required modal removed — was dead code (never opened)
          and the hardcoded password literal "!Aardwolf2026" inside its
          client-side compare ended up in the bundled JS served to every
          browser. Built-in template creation is gated by the isAdmin
          check on the "+ Create Built-In Template" menu item; the server
          re-checks via SUPERUSER_EMAILS on save. */}

      {/* Process description — deterministic, structured plain-text walk of the
          current diagram. No AI; available even when the org disables AI. */}
      {processDescription !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setProcessDescription(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Process description</h2>
                <p className="text-[11px] text-gray-500">Generated deterministically from this diagram — no AI.</p>
              </div>
              <button onClick={() => setProcessDescription(null)} className="text-gray-400 hover:text-gray-700 text-lg leading-none" title="Close">×</button>
            </div>
            <pre className="flex-1 overflow-auto px-4 py-3 text-xs text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">{processDescription}</pre>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200">
              <button
                onClick={() => { navigator.clipboard?.writeText(processDescription).then(() => { setDescriptionCopied(true); }, () => {}); }}
                className="text-xs rounded border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50"
              >
                {descriptionCopied ? "Copied ✓" : "Copy"}
              </button>
              <button onClick={() => setProcessDescription(null)} className="text-xs rounded bg-gray-800 px-3 py-1.5 text-white hover:bg-gray-700">Close</button>
            </div>
          </div>
        </div>
      )}

      {showDiagramMaintenance && (
        <DiagramColorModal
          diagramId={diagramId}
          diagramType={diagramType}
          projectColors={{ ...DEFAULT_SYMBOL_COLORS, ...projectColorConfig }}
          initialColorConfig={diagramColorConfig}
          displayMode={displayMode}
          onDisplayModeChange={handleToggleDisplayMode}
          debugMode={debugMode}
          isAdmin={isActingAdmin}
          onDebugModeChange={(on) => {
            setDebugMode(on);
            if (typeof window !== "undefined") {
              localStorage.setItem(`debug-${projectId}`, on ? "true" : "false");
            }
          }}
          showValueDisplay={showValueDisplay}
          onShowValueDisplayChange={(on) => {
            setShowValueDisplay(on);
            localStorage.setItem(`valueDisplay-${diagramId}`, on ? "true" : "false");
          }}
          showBottleneck={showBottleneck}
          onShowBottleneckChange={(on) => {
            setShowBottleneck(on);
            localStorage.setItem(`bottleneck-${diagramId}`, on ? "true" : "false");
          }}
          fontSize={data.fontSize}
          onFontSizeChange={setFontSize}
          connectorFontSize={data.connectorFontSize}
          onConnectorFontSizeChange={setConnectorFontSize}
          titleFontSize={data.titleFontSize}
          onTitleFontSizeChange={setTitleFontSize}
          poolFontSize={data.poolFontSize}
          onPoolFontSizeChange={setPoolFontSize}
          laneFontSize={data.laneFontSize}
          onLaneFontSizeChange={setLaneFontSize}
          processFontSize={data.processFontSize}
          onProcessFontSizeChange={setProcessFontSize}
          valueChainFontSize={data.valueChainFontSize}
          onValueChainFontSizeChange={setValueChainFontSize}
          descriptionFontSize={data.descriptionFontSize}
          onDescriptionFontSizeChange={setDescriptionFontSize}
          onClose={() => setShowDiagramMaintenance(false)}
          onSaved={(config) => {
            setDiagramColorConfig(config);
            setShowDiagramMaintenance(false);
          }}
        />
      )}
      {showSopDialog && projectId && (
        <SopGenerateDialog
          projectId={projectId}
          diagramId={diagramId}
          data={data}
          initialScope={sopInitial.scope}
          initialElementId={sopInitial.elementId}
          onClose={() => { setShowSopDialog(false); void refreshDiagramSops(); }}
        />
      )}
    </div>
    </CollabRoom>
  );
}
