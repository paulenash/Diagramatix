"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Canvas } from "@/app/components/canvas/Canvas";
import type { DiagramData, DiagramType } from "@/app/lib/diagram/types";
import { APQC_ATTRIBUTION, dataHasPcf } from "@/app/lib/pcf/attribution";
import type { SymbolColorConfig } from "@/app/lib/diagram/colors";
import type { DisplayMode } from "@/app/lib/diagram/displayMode";
import { FeedbackDialog } from "./FeedbackDialog";

// View-stack key — deliberately separate from the editor's
// `dgx_drill_stack` so the two stacks can't pollute each other if a
// single user has both an editor session and a viewer session open.
const VIEW_STACK_KEY = "dgx_view_stack";

interface VersionSummary {
  versionNumber: number;
  publishedAt: string;
  releaseNotes: string | null;
  // Null when the publishing account has since been deleted (author FK is
  // SetNull — audit DATA-01).
  publishedBy: { id: string; name: string | null; email: string } | null;
}

interface OwnerSummary {
  id: string;
  name: string | null;
  email: string;
}

interface Props {
  diagramId: string;
  diagramName: string;
  diagramType: DiagramType;
  data: DiagramData;
  colorConfig: SymbolColorConfig;
  displayMode: DisplayMode;
  version: VersionSummary;
  diagramOwner: OwnerSummary | null;
  processOwnerLabel: { name?: string; email?: string } | null;
  /** Bundle scoping the view-stack and the "Back to bundle" affordance.
   *  Null when the user reached the viewer directly (no bundle ancestor),
   *  e.g. an owner previewing their own published diagram. */
  bundleId: string | null;
}

/**
 * Read-only viewer for a published diagram. Reuses the editor's Canvas
 * with readOnly=true and every mutation handler stubbed to a no-op —
 * the visual rendering matches the editor exactly, but the viewer
 * exposes no editing affordances of its own.
 *
 * Link traversal: clicking a subprocess / chevron-collapsed element with
 * a linkedDiagramId pushes the current diagram onto sessionStorage and
 * navigates to /processes/[targetId]. Back pops and returns.
 */
export function ProcessView({
  diagramId,
  diagramName,
  diagramType,
  data,
  colorConfig,
  displayMode,
  version,
  diagramOwner,
  processOwnerLabel,
  bundleId,
}: Props) {
  const router = useRouter();

  const [stackDepth, setStackDepth] = useState(0);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(VIEW_STACK_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      setStackDepth(Array.isArray(arr) ? arr.length : 0);
    } catch {
      setStackDepth(0);
    }
  }, [diagramId]);

  // Drill-in: business user clicked an element's link icon. Push the
  // current viewer page onto the stack and navigate to the target. We
  // verify access by letting the target page run its own getDiagramAccess
  // — if the user lacks a grant on the target diagram, that page will
  // bounce them back to the dashboard with no extra noise here.
  const handleDrillIntoSubprocess = useCallback(
    (targetDiagramId: string) => {
      try {
        const raw = sessionStorage.getItem(VIEW_STACK_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        const next = Array.isArray(arr) ? arr.slice() : [];
        next.push({ id: diagramId, name: diagramName, bundleId });
        sessionStorage.setItem(VIEW_STACK_KEY, JSON.stringify(next));
      } catch { /* swallow — link still works without the stack */ }
      const bundleParam = bundleId ? `?bundle=${encodeURIComponent(bundleId)}` : "";
      router.push(`/processes/${targetDiagramId}${bundleParam}`);
    },
    [diagramId, diagramName, bundleId, router],
  );

  // Drill-back: pop the stack and navigate. When the stack is empty AND
  // we have a bundle context, go to the bundle index instead so the
  // user lands somewhere meaningful rather than the dashboard.
  const handleDrillBack = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(VIEW_STACK_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr) && arr.length > 0) {
        const prev = arr[arr.length - 1];
        const next = arr.slice(0, -1);
        sessionStorage.setItem(VIEW_STACK_KEY, JSON.stringify(next));
        const bundleParam = prev?.bundleId ? `?bundle=${encodeURIComponent(prev.bundleId)}` : "";
        router.push(`/processes/${prev.id}${bundleParam}`);
        return;
      }
    } catch { /* fall through to bundle / dashboard */ }
    if (bundleId) {
      router.push(`/processes/bundle/${bundleId}`);
    } else {
      router.push("/dashboard");
    }
  }, [bundleId, router]);

  const ownerLabel = diagramOwner
    ? diagramOwner.name ?? diagramOwner.email
    : "—";
  const processOwnerDisplay = processOwnerLabel?.name ?? processOwnerLabel?.email ?? null;

  // ── Feedback flow ─────────────────────────────────────────────────
  // `feedbackOpen` shows the dialog. `pickMode` arms the canvas overlay
  // and hides the dialog so the user can click an element; the picked
  // element comes back via onPickElement and the dialog reopens.
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [attachedElement, setAttachedElement] = useState<{ id: string; label: string } | null>(null);
  const [feedbackBody, setFeedbackBody] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSentToast, setFeedbackSentToast] = useState(false);

  // The user's own previously-submitted feedback on this diagram, shown
  // in a collapsible list on the right. Clicking an item highlights the
  // attached element on the canvas.
  type MyFeedback = { id: string; body: string; attachedElementId: string | null; createdAt: string };
  const [myFeedback, setMyFeedback] = useState<MyFeedback[]>([]);
  const [feedbackListOpen, setFeedbackListOpen] = useState(true);
  // Highlight on the canvas — set when the user clicks a feedback item
  // with a pinned element. Drives the Canvas selectedElementIds.
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());

  const fetchMyFeedback = useCallback(async () => {
    try {
      const res = await fetch(`/api/diagrams/${diagramId}/feedback?mine=1`);
      if (res.ok) {
        const j = await res.json();
        setMyFeedback(j.feedback ?? []);
      }
    } catch { /* silent — the list just stays as-is */ }
  }, [diagramId]);

  useEffect(() => { fetchMyFeedback(); }, [fetchMyFeedback]);

  // Map element id → label for the feedback list (the API stores the id;
  // the label is resolved from the published version's data we already have).
  const elementLabelById = new Map(data.elements.map(el => [el.id, el.label ?? ""]));

  const handlePickElement = useCallback((elementId: string, label: string) => {
    setAttachedElement({ id: elementId, label });
    setPickMode(false);
    setFeedbackOpen(true);
  }, []);

  async function submitFeedback() {
    if (feedbackSubmitting || !feedbackBody.trim()) return;
    setFeedbackSubmitting(true);
    setFeedbackError(null);
    try {
      const res = await fetch(`/api/diagrams/${diagramId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: feedbackBody.trim(),
          attachedElementId: attachedElement?.id ?? null,
          bundleId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        setFeedbackError(err.error ?? `Failed (${res.status})`);
        return;
      }
      setFeedbackOpen(false);
      setFeedbackBody("");
      setAttachedElement(null);
      setFeedbackSentToast(true);
      setFeedbackListOpen(true);
      fetchMyFeedback();
      setTimeout(() => setFeedbackSentToast(false), 4000);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : "Network error");
    } finally {
      setFeedbackSubmitting(false);
    }
  }

  // Canvas was built for the editor — it needs a forest of mutation
  // handlers. In the viewer they're all no-ops; readOnly=true on the
  // Canvas already disables interaction via pointer-events:none, but we
  // pass the handlers anyway to keep TypeScript happy.
  const noop = () => {};
  // Canvas's getViewportCenterRef expects a () => Point; the editor
  // hooks it to "where would a newly-added element land?", but the
  // viewer never adds anything. Return a sentinel zero — it's never
  // read because the add path is gated by readOnly.
  const viewportCenterStub = () => ({ x: 0, y: 0 });

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Title bar — slim, no editor chrome. */}
      <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 text-xs flex-shrink-0">
        {(stackDepth > 0 || bundleId) && (
          <button
            onClick={handleDrillBack}
            className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
            title={stackDepth > 0 ? "Back to previous process" : "Back to bundle"}
          >
            ← Back
          </button>
        )}
        <Link
          href="/dashboard"
          className="text-blue-600 hover:text-blue-800"
        >
          Dashboard
        </Link>
        <div className="h-4 border-l border-gray-300" />
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <h1 className="text-sm font-semibold text-gray-900 truncate">{diagramName}</h1>
          <span
            className="text-[11px] px-1.5 py-0.5 rounded border text-blue-700 border-blue-300 bg-blue-50 font-medium shrink-0"
            title={`Published ${new Date(version.publishedAt).toLocaleString()}${version.publishedBy ? ` by ${version.publishedBy.name ?? version.publishedBy.email}` : ""}`}
          >
            v{version.versionNumber}
            <span className="text-blue-500/80 font-normal ml-1">
              · {new Date(version.publishedAt).toLocaleDateString()}
            </span>
          </span>
          {processOwnerDisplay && (
            <span className="text-[11px] text-gray-700 truncate" title="Process Owner (label)">
              <span className="text-gray-500">Process Owner:</span> {processOwnerDisplay}
            </span>
          )}
          <span className="text-[11px] text-gray-700 truncate" title="Diagram Owner (accountable user)">
            <span className="text-gray-500">Diagram Owner:</span> {ownerLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={() => { setFeedbackError(null); setFeedbackOpen(true); }}
          className="text-[11px] text-blue-700 border border-blue-300 rounded px-2 py-0.5 hover:bg-blue-50 font-medium"
          title="Send feedback to the diagram owner"
        >
          Feedback
        </button>
      </header>

      {/* Pick-mode banner — shown while the user is choosing an element
          to attach feedback to. */}
      {pickMode && (
        <div className="bg-blue-600 text-white text-xs px-4 py-1.5 flex items-center justify-between flex-shrink-0">
          <span>Click an element on the canvas to attach your feedback to it.</span>
          <button
            onClick={() => { setPickMode(false); setFeedbackOpen(true); }}
            className="underline hover:no-underline"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Canvas — readOnly + drill traversal. All mutation handlers are
          no-ops. The Canvas's own pan+zoom logic stays active so the
          user can scroll and zoom freely. */}
      <main className="flex flex-1 overflow-hidden min-h-0">
        <Canvas
          data={data}
          diagramType={diagramType}
          readOnly
          colorConfig={colorConfig}
          displayMode={displayMode}
          diagramName={diagramName}
          onDrillIntoSubprocess={handleDrillIntoSubprocess}
          onDrillBack={stackDepth > 0 || bundleId ? handleDrillBack : undefined}
          parentDiagramName={undefined}
          onAddElement={noop}
          onMoveElement={noop}
          onResizeElement={noop}
          onUpdateLabel={noop}
          onDeleteElement={noop}
          onAddConnector={noop}
          onDeleteConnector={noop}
          onUpdateConnectorEndpoint={noop}
          selectedElementIds={highlightedIds}
          selectedConnectorId={null}
          onSetSelectedElements={noop}
          onSelectConnector={noop}
          pendingDragSymbol={null}
          defaultDirectionType="directed"
          defaultRoutingType="rectilinear"
          getViewportCenterRef={{ current: viewportCenterStub }}
          pickElementMode={pickMode}
          onPickElement={handlePickElement}
        />

        {/* My-feedback list — collapsible column on the right. Shows the
            feedback this user has filed on this diagram; clicking an item
            highlights its pinned element on the canvas. Only rendered once
            the user has at least one piece of feedback. */}
        {myFeedback.length > 0 && (
          feedbackListOpen ? (
            <aside className="w-72 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-900">
                  My feedback ({myFeedback.length})
                </span>
                <button
                  onClick={() => setFeedbackListOpen(false)}
                  className="text-gray-500 hover:text-gray-800 text-xs"
                  title="Collapse"
                >
                  ›
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {myFeedback.map(f => {
                  const label = f.attachedElementId ? (elementLabelById.get(f.attachedElementId) ?? "") : "";
                  const isHighlighted = !!f.attachedElementId && highlightedIds.has(f.attachedElementId);
                  return (
                    <button
                      key={f.id}
                      onClick={() => {
                        if (f.attachedElementId) {
                          setHighlightedIds(new Set([f.attachedElementId]));
                        } else {
                          setHighlightedIds(new Set());
                        }
                      }}
                      className={`block w-full text-left border rounded p-2 transition-colors ${
                        isHighlighted ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {f.attachedElementId ? (
                        <span className="text-[10px] font-medium text-blue-700 block truncate mb-0.5">
                          ▸ {label || "(unnamed element)"}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400 block mb-0.5">No element attached</span>
                      )}
                      <span className="text-xs text-gray-800 block whitespace-pre-wrap break-words">{f.body}</span>
                    </button>
                  );
                })}
              </div>
            </aside>
          ) : (
            <button
              onClick={() => setFeedbackListOpen(true)}
              className="w-8 flex-shrink-0 border-l border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center"
              title={`Show my feedback (${myFeedback.length})`}
            >
              <span className="text-[10px] text-gray-600 [writing-mode:vertical-rl] rotate-180 tracking-wide">
                Feedback ({myFeedback.length})
              </span>
            </button>
          )
        )}
      </main>

      {/* APQC PCF attribution — required on any public view carrying PCF content. */}
      {dataHasPcf(data) && (
        <footer className="shrink-0 border-t border-gray-100 bg-gray-50 px-4 py-1 text-[9px] leading-tight text-gray-400">
          {APQC_ATTRIBUTION}
        </footer>
      )}

      {feedbackOpen && !pickMode && (
        <FeedbackDialog
          diagramId={diagramId}
          diagramName={diagramName}
          bundleId={bundleId}
          attachedElement={attachedElement}
          body={feedbackBody}
          onBodyChange={setFeedbackBody}
          submitting={feedbackSubmitting}
          error={feedbackError}
          onStartPick={() => { setFeedbackOpen(false); setPickMode(true); }}
          onClearAttached={() => setAttachedElement(null)}
          onSubmit={submitFeedback}
          onClose={() => setFeedbackOpen(false)}
        />
      )}

      {feedbackSentToast && (
        <div className="fixed bottom-6 right-6 bg-green-600 text-white text-sm font-medium rounded shadow-lg px-4 py-2 z-50">
          Feedback sent — thank you.
        </div>
      )}
    </div>
  );
}
