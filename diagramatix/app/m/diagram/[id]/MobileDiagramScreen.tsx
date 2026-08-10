"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import type { SymbolColorConfig } from "@/app/lib/diagram/colors";
import { MobileDiagramView } from "@/app/components/mobile/MobileDiagramView";
import { MobileReviewLayer } from "@/app/components/mobile/MobileReviewLayer";
import { MobileCommentSheet } from "@/app/components/mobile/MobileCommentSheet";
import { thumbnailTransform } from "@/app/lib/diagram/templateThumbnail";
import { buildReviewComment } from "@/app/lib/diagram/reviewComment";
import { collapseAllReviewComments } from "@/app/lib/diagram/reviewCollapse";

interface Loaded {
  name: string; data: DiagramData; projectId: string | null;
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
  const [d, setD] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [picking, setPicking] = useState(false);
  const [addTarget, setAddTarget] = useState<DiagramElement | null>(null);
  const [reading, setReading] = useState<DiagramElement | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let on = true;
    fetch(`/api/diagrams/${diagramId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load diagram"))))
      .then((j) => { if (on) setD({
        name: j.name,
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
    <div className="h-full flex flex-col">
      <div className="shrink-0 flex items-center gap-2 px-3 h-11 border-b border-gray-200 bg-white">
        <button onClick={() => router.push(d?.projectId ? `/m/project/${d.projectId}` : "/m")}
          className="text-blue-600 text-sm">‹ Back</button>
        <span className="flex-1 text-sm font-medium text-gray-900 truncate text-center">{d?.name ?? "Diagram"}</span>
        {d?.canReview && !empty ? (
          <button onClick={saveDiagram} disabled={saving || !dirty}
            className="text-sm font-medium text-blue-600 disabled:text-gray-300">{saving ? "Saving…" : "Save"}</button>
        ) : <span className="w-10" />}
      </div>

      {saveMsg && (
        <div className={`shrink-0 px-3 py-1.5 text-xs ${saveMsg.ok ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>{saveMsg.text}</div>
      )}

      <div className="flex-1 relative">
        {loading && <p className="text-sm text-gray-500 p-4">Loading…</p>}
        {err && <p className="text-sm text-red-600 p-4">{err}</p>}
        {d && empty && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <p className="text-sm text-gray-400">This diagram is empty. Generating from a prompt is coming in the next update.</p>
          </div>
        )}
        {d && !empty && (
          <MobileDiagramView
            data={backdrop}
            colorConfig={d.colorConfig}
            pickMode={picking}
            onPick={onPick}
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
          authorLine={reading.type === "text-annotation" ? undefined : readerAuthor(reading)}
          onClose={() => setReading(null)} />
      )}
    </div>
  );
}
