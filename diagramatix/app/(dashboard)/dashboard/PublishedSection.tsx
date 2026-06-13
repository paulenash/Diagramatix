"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { CollapsibleSection } from "./CollapsibleSection";
import { DiagramTypeBadge } from "@/app/components/DiagramTypeBadge";
import { useDiagramTypeStyles } from "@/app/hooks/useDiagramTypeStyles";
import { lightenHex } from "@/app/lib/diagram/diagramTypeStyles";

/**
 * Dashboard "Published by me" surface. Two collections:
 *   • Diagrams you've published a version of.
 *   • Bundles you've published to business users.
 *
 * Renders nothing if both are empty (typical for users who haven't
 * touched the publish flow yet). Pinned above Projects on the dashboard.
 */

interface PublishedDiagram {
  id: string;
  name: string;
  type: string;
  projectId: string | null;
  projectName: string | null;
  currentVersion: {
    versionNumber: number;
    publishedAt: string; // ISO
    releaseNotes: string | null;
  } | null;
  nextReviewDate: string | null; // ISO
  bundleCount: number;
}

interface BundleRoot {
  id: string;
  name: string;
  type: string;
  versionNumber: number | null;
  publishedAt: string | null;
}

interface BundleSummary {
  id: string;
  name: string;
  projectId: string;
  publishedAt: string; // ISO
  supersededAt: string | null;
  nextReviewDate: string | null;
  _count: { diagrams: number; audience: number };
}

type ReceivedBundle = BundleSummary & { addedAt: string; roots: BundleRoot[] };

interface BundlesPayload {
  created: BundleSummary[];
  received: ReceivedBundle[];
}

function dateLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function reviewDueClass(iso: string | null): string {
  if (!iso) return "text-gray-500";
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "text-red-600 font-semibold";
  if (days <= 14) return "text-orange-600";
  return "text-gray-500";
}

export function PublishedSection() {
  const router = useRouter();
  const getTypeStyle = useDiagramTypeStyles();
  const [diagrams, setDiagrams] = useState<PublishedDiagram[] | null>(null);
  const [bundles, setBundles] = useState<BundlesPayload | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<BundleSummary | null>(null);
  const [archiving, setArchiving] = useState(false);

  const refresh = useCallback(async () => {
    const [dRes, bRes] = await Promise.all([
      fetch("/api/diagrams/published-by-me"),
      fetch("/api/bundles"),
    ]);
    if (dRes.ok) {
      const j = await dRes.json();
      setDiagrams(j.diagrams ?? []);
    }
    if (bRes.ok) {
      const j = await bRes.json();
      setBundles(j);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // While loading, render nothing — keeps the dashboard's first paint
  // clean; the section fades in once data is back.
  if (diagrams === null || bundles === null) return null;
  const createdBundles = bundles.created;
  const receivedBundles = bundles.received;

  // Deduped root processes across all received bundles — the entry-point
  // diagrams shared with me. First bundle containing a given root wins for
  // the navigation context (?bundle=).
  const sharedRoots: (BundleRoot & { bundleId: string })[] = [];
  const seenRoot = new Set<string>();
  for (const b of receivedBundles) {
    for (const r of b.roots ?? []) {
      if (seenRoot.has(r.id)) continue;
      seenRoot.add(r.id);
      sharedRoots.push({ ...r, bundleId: b.id });
    }
  }

  // If you've published nothing and you're not in any audience either,
  // skip the section entirely so the dashboard doesn't carry empty
  // chrome for users who haven't touched the publish flow yet.
  if (diagrams.length === 0 && createdBundles.length === 0 && receivedBundles.length === 0) {
    return null;
  }

  async function archiveBundle() {
    if (!archiveTarget || archiving) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/bundles/${archiveTarget.id}/archive`, { method: "POST" });
      if (res.ok) {
        await refresh();
        setArchiveTarget(null);
      }
    } finally {
      setArchiving(false);
    }
  }

  return (
    <>
    {(diagrams.length > 0 || createdBundles.length > 0) && (
    <CollapsibleSection title="Published by me" count={diagrams.length + createdBundles.length}>

      {/* Diagrams */}
      {diagrams.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
            Diagrams ({diagrams.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {diagrams.map(d => (
              <button
                key={d.id}
                onClick={() => router.push(`/diagram/${d.id}?from=/dashboard`)}
                style={{ backgroundColor: lightenHex(getTypeStyle(d.type).bgColor, 0.5) }}
                className="text-left border border-gray-200 rounded-lg p-3 hover:border-blue-400 hover:shadow transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{d.name}</div>
                    {d.projectName && (
                      <div className="text-[10px] text-gray-500 truncate mt-0.5">
                        in {d.projectName}
                      </div>
                    )}
                  </div>
                  <DiagramTypeBadge type={d.type} showLabel showCode={false} className="shrink-0" />
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {d.currentVersion && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border text-blue-700 border-blue-300 bg-blue-50 font-medium">
                      v{d.currentVersion.versionNumber}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-500">
                    Published {dateLabel(d.currentVersion?.publishedAt ?? null)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 flex-wrap text-[10px]">
                  <span className={reviewDueClass(d.nextReviewDate)}>
                    Next review: {dateLabel(d.nextReviewDate)}
                  </span>
                  {d.bundleCount > 0 && (
                    <span className="text-gray-500">
                      · in {d.bundleCount} bundle{d.bundleCount === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bundles I created */}
      {createdBundles.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
            Bundles I&apos;ve published ({createdBundles.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {createdBundles.map(b => (
              <div
                key={b.id}
                className={`bg-white border rounded-lg p-3 ${
                  b.supersededAt ? "border-gray-200 opacity-60" : "border-purple-200"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium text-gray-900 truncate flex-1">{b.name}</div>
                  {b.supersededAt && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0">
                      Archived
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-600">
                  <span>{b._count.diagrams} diagram{b._count.diagrams === 1 ? "" : "s"}</span>
                  <span>{b._count.audience} user{b._count.audience === 1 ? "" : "s"}</span>
                </div>
                <div className="mt-1 text-[10px] text-gray-500">
                  Published {dateLabel(b.publishedAt)}
                </div>
                {b.nextReviewDate && !b.supersededAt && (
                  <div className={`mt-1 text-[10px] ${reviewDueClass(b.nextReviewDate)}`}>
                    Next review: {dateLabel(b.nextReviewDate)}
                  </div>
                )}
                {!b.supersededAt && (
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => setArchiveTarget(b)}
                      className="text-[11px] text-gray-500 hover:text-red-600"
                      title="Archive — revokes access for the audience"
                    >
                      Archive
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </CollapsibleSection>
    )}

    {/* Published to me — bundles + root processes I'm in the audience of */}
    {receivedBundles.length > 0 && (
      <CollapsibleSection title="Published to me" count={receivedBundles.length + sharedRoots.length}>

        {/* Bundles shared with me */}
        <div className="mb-4">
          <div className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
            Bundles shared with me ({receivedBundles.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {receivedBundles.map(b => (
              <button
                key={b.id}
                onClick={() => router.push(`/processes/bundle/${b.id}`)}
                className="text-left bg-white border border-blue-200 rounded-lg p-3 hover:border-blue-400 hover:shadow transition"
              >
                <div className="text-sm font-medium text-gray-900 truncate">{b.name}</div>
                <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-700">
                  <span>{b._count.diagrams} diagram{b._count.diagrams === 1 ? "" : "s"}</span>
                </div>
                <div className="mt-1 text-[10px] text-gray-700">
                  Added {dateLabel(b.addedAt)}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Diagrams (root processes) shared with me */}
        {sharedRoots.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
              Diagrams shared with me ({sharedRoots.length})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sharedRoots.map(r => (
                <button
                  key={r.id}
                  onClick={() => router.push(`/processes/${r.id}?bundle=${r.bundleId}`)}
                  style={{ backgroundColor: lightenHex(getTypeStyle(r.type).bgColor, 0.5) }}
                  className="text-left border border-blue-200 rounded-lg p-3 hover:border-blue-400 hover:shadow transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium text-gray-900 truncate flex-1">{r.name}</div>
                    <DiagramTypeBadge type={r.type} showLabel showCode={false} className="shrink-0" />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {r.versionNumber != null && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border text-blue-700 border-blue-300 bg-blue-50 font-medium">
                        v{r.versionNumber}
                      </span>
                    )}
                    {r.publishedAt && (
                      <span className="text-[10px] text-gray-500">Published {dateLabel(r.publishedAt)}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </CollapsibleSection>
    )}

      {archiveTarget && (
        <ConfirmDialog
          title="Archive bundle?"
          message={`Archiving "${archiveTarget.name}" revokes access for all ${archiveTarget._count.audience} audience members. The bundle's history stays in the database; you can publish a new bundle later if needed.`}
          confirmLabel={archiving ? "Archiving…" : "Archive"}
          cancelLabel="Cancel"
          destructive
          onConfirm={archiveBundle}
          onCancel={() => setArchiveTarget(null)}
        />
      )}
    </>
  );
}
