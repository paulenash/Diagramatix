"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sanitizeRichText } from "@/app/lib/diagram/richText";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import type { SymbolColorConfig } from "@/app/lib/diagram/colors";
import { MobileDiagramView } from "@/app/components/mobile/MobileDiagramView";
import { MobileReviewLayer } from "@/app/components/mobile/MobileReviewLayer";
import { MobileCommentSheet } from "@/app/components/mobile/MobileCommentSheet";
import { thumbnailTransform } from "@/app/lib/diagram/templateThumbnail";
import { buildReviewComment } from "@/app/lib/diagram/reviewComment";
import { collapseAllReviewComments } from "@/app/lib/diagram/reviewCollapse";
import { isMobileSupportedType, MOBILE_SUPPORTED_LABEL } from "@/app/lib/diagram/mobileSupport";

interface Loaded {
  name: string; type: string; data: DiagramData; projectId: string | null;
  version: number; canReview: boolean; viewer: { id: string; name: string };
  colorConfig?: SymbolColorConfig;
}

const isContainer = (e: DiagramElement) => e.type === "pool" || e.type === "lane" || e.type === "sublane";
const stripHtml = (s: string) => s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
function elementLabel(e: DiagramElement): string {
  const l = stripHtml(e.label ?? "");
  return l || e.type.replace(/-/g, " ");
}

/**
 * Mobile diagram screen: read-only pan/zoom viewer + (for owners/editors/assigned
 * reviewers) the ability to attach Review Comments to elements — typed or dictated —
 * and Save. Review comments are ALWAYS collapsed on save. Everything else is view-only.
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

  useEffect(() => {
    let on = true;
    fetch(`/api/diagrams/${diagramId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load diagram"))))
      .then((j) => { if (on) setD({
        name: j.name,
        type: j.type ?? "",
        data: (j.data ?? { elements: [], connectors: [] }) as DiagramData,
        projectId: j.projectId ?? null,
        version: j.version ?? 0,
        canReview: !!j.canReview,
        viewer: j.viewer ?? { id: "", name: "" },
        colorConfig: j.colorConfig ?? undefined,
      }); })
      .catch((e) => { if (on) setErr(e.message); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [diagramId]);

  const empty = !!d && (d.data.elements?.length ?? 0) === 0;
  const unsupported = !!d && !isMobileSupportedType(d.type);

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
    const tr = thumbnailTransform(backdrop.elements as never);
    return { backdrop, comments, annotations, tx: tr.tx, ty: tr.ty };
  }, [d]);

  function onPick(svgX: number, svgY: number) {
    setPicking(false);
    if (!d) return;
    const dx = svgX - tx, dy = svgY - ty;   // → diagram coordinates
    // Topmost (last-drawn) non-review element under the point.
    const hit = [...d.data.elements].reverse().find(
      (e) => e.type !== "review-comment" && dx >= e.x && dx <= e.x + e.width && dy >= e.y && dy <= e.y + e.height,
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
      (e) => e.type !== "review-comment" && e.type !== "text-annotation" && dx >= e.x && dx <= e.x + e.width && dy >= e.y && dy <= e.y + e.height,
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
        <span className="flex-1 text-sm font-medium text-gray-900 truncate text-center">{d?.name ?? "Diagram"}</span>
        {d && !empty && !unsupported && (d.data.parentDiagramIds?.length ?? 0) > 0 && (
          <button onClick={() => setShowParents(true)} className="text-blue-600 text-lg leading-none px-1" title="Linked from (parent diagrams)">↩</button>
        )}
        {d && !empty && !unsupported && (
          <button onClick={toggleFullscreen} className="text-gray-600 text-lg leading-none px-1" title={fullscreen ? "Exit full screen" : "Full screen (landscape)"}>{fullscreen ? "⤢" : "⛶"}</button>
        )}
        {d?.canReview && !empty && !unsupported ? (
          <button onClick={saveDiagram} disabled={saving || !dirty}
            className="text-sm font-medium text-blue-600 disabled:text-gray-300">{saving ? "Saving…" : "Save"}</button>
        ) : <span className="w-8" />}
      </div>

      {saveMsg && (
        <div className={`shrink-0 px-3 py-1.5 text-xs ${saveMsg.ok ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>{saveMsg.text}</div>
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
            <p className="text-sm text-gray-400">This diagram is empty. Generating from a prompt is coming in the next update.</p>
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

        {/* Add-comment FAB (owners/editors/reviewers only) */}
        {d?.canReview && !empty && !picking && (
          <button onClick={() => { setPicking(true); setSaveMsg(null); }}
            className="absolute bottom-3 left-3 h-12 pl-3 pr-4 rounded-full bg-pink-600 text-white shadow-lg flex items-center gap-1.5 active:bg-pink-700">
            <span className="text-lg leading-none">＋</span><span className="text-sm font-medium">Comment</span>
          </button>
        )}
      </div>

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
