"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

/**
 * Editable feature row. Mirrors the Feature Prisma model with date
 * columns serialised to ISO strings (page.tsx handles that).
 */
export interface FeatureRow {
  id: string;
  name: string;
  summary: string;
  details: string;
  hidden: boolean;
  sortOrder: number;
  publishedName: string | null;
  publishedSummary: string | null;
  publishedDetails: string | null;
  publishedHidden: boolean | null;
  publishedSortOrder: number | null;
  publishedAt: string | null;
}

/** New rows start with this client-side temp id; the server replaces it
 *  with a real cuid on save. */
const TEMP_ID_PREFIX = "temp-";

function makeTempId(): string {
  return TEMP_ID_PREFIX + Math.random().toString(36).slice(2);
}

function isDirty(f: FeatureRow): boolean {
  if (f.publishedAt === null) return true;        // never published
  if (f.id.startsWith(TEMP_ID_PREFIX)) return true; // new row
  return (
    f.name !== f.publishedName ||
    f.summary !== f.publishedSummary ||
    f.details !== f.publishedDetails ||
    f.hidden !== (f.publishedHidden ?? false) ||
    f.sortOrder !== f.publishedSortOrder
  );
}

export function FeaturesEditor({ initial }: { initial: FeatureRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<FeatureRow[]>(initial);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirtyCount = useMemo(() => rows.filter(isDirty).length, [rows]);
  const lastPublishedAt = useMemo(() => {
    const dates = rows
      .map((r) => r.publishedAt)
      .filter((d): d is string => d !== null)
      .map((d) => new Date(d).getTime());
    if (dates.length === 0) return null;
    return new Date(Math.max(...dates));
  }, [rows]);

  function patch(id: string, updates: Partial<FeatureRow>) {
    setStatus(null);
    setError(null);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  }

  function addRow() {
    setStatus(null);
    setError(null);
    const maxOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder), 0);
    setRows((prev) => [
      ...prev,
      {
        id: makeTempId(),
        name: "New feature",
        summary: "",
        details: "",
        hidden: false,
        sortOrder: maxOrder + 10,
        publishedName: null,
        publishedSummary: null,
        publishedDetails: null,
        publishedHidden: null,
        publishedSortOrder: null,
        publishedAt: null,
      },
    ]);
  }

  function deleteRow(id: string) {
    setStatus(null);
    setError(null);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function move(id: string, direction: -1 | 1) {
    setStatus(null);
    setError(null);
    setRows((prev) => {
      const sorted = [...prev].sort((a, b) => a.sortOrder - b.sortOrder);
      const idx = sorted.findIndex((r) => r.id === id);
      const swap = idx + direction;
      if (idx < 0 || swap < 0 || swap >= sorted.length) return prev;
      const a = sorted[idx];
      const b = sorted[swap];
      return prev.map((r) =>
        r.id === a.id ? { ...r, sortOrder: b.sortOrder }
        : r.id === b.id ? { ...r, sortOrder: a.sortOrder }
        : r,
      );
    });
  }

  async function save(): Promise<boolean> {
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const payload = {
        features: rows.map((r) => ({
          id: r.id.startsWith(TEMP_ID_PREFIX) ? undefined : r.id,
          name: r.name,
          summary: r.summary,
          details: r.details,
          hidden: r.hidden,
          sortOrder: r.sortOrder,
        })),
      };
      const res = await fetch("/api/admin/features", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Save failed (${res.status})`);
        return false;
      }
      const data = await res.json();
      setRows(data.features.map((r: FeatureRow) => ({
        ...r,
        publishedAt: r.publishedAt ?? null,
      })));
      setStatus("Saved drafts.");
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    // Save drafts first, then publish.
    const saved = await save();
    if (!saved) return;
    setPublishing(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/features/publish", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Publish failed (${res.status})`);
        return;
      }
      const data = await res.json();
      setStatus(`Published ${data.count} feature(s).`);
      // Reload server-side so the mirror columns refresh.
      router.refresh();
      // Also refetch locally so the dirty indicator clears immediately.
      const reload = await fetch("/api/admin/features");
      if (reload.ok) {
        const j = await reload.json();
        setRows(j.features.map((r: FeatureRow) => ({
          ...r,
          publishedAt: r.publishedAt ?? null,
        })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  const sortedRows = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  const busy = saving || publishing;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <a href="/dashboard/admin" className="text-sm text-blue-600 hover:underline">
            &larr; Admin
          </a>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/diagramatix-icon.svg" alt="Diagramatix" className="w-7 h-7" />
          <h1 className="text-lg font-semibold text-gray-900">Features Catalog</h1>
          {dirtyCount > 0 && (
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
              {dirtyCount} unpublished change{dirtyCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {status && <span className="text-xs text-green-700">{status}</span>}
          {error && <span className="text-xs text-red-700">{error}</span>}
          <button
            onClick={save}
            disabled={busy}
            className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save drafts"}
          </button>
          <button
            onClick={publish}
            disabled={busy || dirtyCount === 0}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
            title="Save then copy drafts → published snapshot. The public /features page reads only the published snapshot."
          >
            {publishing ? "Publishing…" : "Publish all"}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs text-gray-500 mb-4">
            Draft edits stay local until you click <strong>Publish all</strong>.
            The public <a href="/features" target="_blank" className="text-blue-600 hover:underline">/features</a> page
            and the in-dashboard Features modal only show the published snapshot.
            {lastPublishedAt && (
              <>
                {" "}Last published: <strong>{lastPublishedAt.toLocaleString()}</strong>.
              </>
            )}
          </p>

          <div className="space-y-3">
            {sortedRows.map((r, i) => {
              const dirty = isDirty(r);
              const neverPublished = r.publishedAt === null && !r.id.startsWith(TEMP_ID_PREFIX);
              return (
                <div
                  key={r.id}
                  className={`bg-white border rounded-lg shadow-sm p-4 ${
                    dirty ? "border-amber-300" : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2 gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono text-gray-400 w-6 text-right">
                        {i + 1}.
                      </span>
                      <input
                        type="text"
                        value={r.name}
                        onChange={(e) => patch(r.id, { name: e.target.value })}
                        placeholder="Feature name"
                        className="text-base font-semibold text-gray-900 px-2 py-1 border border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none rounded w-[28rem] max-w-full"
                      />
                      {dirty && (
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                          unpublished
                        </span>
                      )}
                      {neverPublished && (
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                          draft only
                        </span>
                      )}
                      {r.hidden && (
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-700 text-white font-medium">
                          hidden
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => move(r.id, -1)}
                        disabled={i === 0 || busy}
                        title="Move up"
                        className="p-1 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => move(r.id, +1)}
                        disabled={i === sortedRows.length - 1 || busy}
                        title="Move down"
                        className="p-1 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <label className="text-xs text-gray-700 flex items-center gap-1 ml-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={r.hidden}
                          onChange={(e) => patch(r.id, { hidden: e.target.checked })}
                          className="h-3.5 w-3.5"
                        />
                        Hide
                      </label>
                      <button
                        onClick={() => setDeleteConfirm({ id: r.id, name: r.name })}
                        disabled={busy}
                        title="Delete"
                        className="p-1 text-red-600 hover:bg-red-50 rounded text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Summary (1 line)</label>
                      <input
                        type="text"
                        value={r.summary}
                        onChange={(e) => patch(r.id, { summary: e.target.value })}
                        placeholder="Benefit-oriented headline"
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Details (markdown, typically bullets)</label>
                      <textarea
                        value={r.details}
                        onChange={(e) => patch(r.id, { details: e.target.value })}
                        rows={Math.max(4, r.details.split("\n").length)}
                        placeholder="- Bullet 1&#10;- Bullet 2"
                        className="w-full px-2 py-1 text-xs font-mono border border-gray-300 rounded focus:border-blue-400 focus:outline-none resize-y"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <button
              onClick={addRow}
              disabled={busy}
              className="px-3 py-1.5 border border-dashed border-gray-300 text-gray-600 text-xs rounded hover:bg-gray-50"
            >
              + Add feature
            </button>
          </div>
        </div>
      </main>

      {deleteConfirm && (
        <ConfirmDialog
          title={`Delete "${deleteConfirm.name || "feature"}"?`}
          message="This removes the draft row. If the feature has been published, it stays live until you publish again."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          destructive
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={() => {
            const { id } = deleteConfirm;
            setDeleteConfirm(null);
            deleteRow(id);
          }}
        />
      )}
    </div>
  );
}
