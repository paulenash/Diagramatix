"use client";

/**
 * SuperAdmin catalog manager for Simulator Examples. Edit metadata, toggle
 * publish, duplicate (copy → extend), and delete. The bundle content itself is
 * authored by CAPTURING a project's study (the "Save as example" button in the
 * Simulator console) or by the seed — this screen curates + publishes.
 */

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

interface Row {
  id: string;
  slug: string;
  title: string;
  concept: string;
  description: string;
  difficulty: string;
  published: boolean;
  sortOrder: number;
}

const DIFFS = ["intro", "core", "advanced"];

export function ExampleCatalogManager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/simulation-examples");
      if (res.ok) setRows((await res.json()).examples ?? []);
      else setErr((await res.json()).error ?? "Failed to load");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id); setErr(null);
    try {
      const res = await fetch(`/api/admin/simulation-examples/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) { setErr((await res.json()).error ?? "Update failed"); return; }
      await load();
    } finally { setBusy(null); }
  }
  async function act(url: string, method: string) {
    setBusy(url); setErr(null);
    try {
      const res = await fetch(url, { method });
      if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Action failed"); return; }
      await load();
    } finally { setBusy(null); }
  }

  const update = (id: string, k: keyof Row, v: unknown) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [k]: v } : r)));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold text-gray-900">Simulator Example Catalog</h1>
        <a href="/dashboard/simulator-examples" className="text-sm text-gray-500 hover:text-gray-700">View gallery →</a>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Curate the example simulations. Author new ones by capturing a study in the Simulator console
        (<span className="font-mono">◈ Simulator → Save as example</span>), or duplicate an existing one to extend it.
      </p>

      {err && <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {loading && <p className="text-gray-400">Loading…</p>}
      {!loading && rows.length === 0 && <p className="text-gray-400">No examples yet. Capture one from a project, or run the seed.</p>}

      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-2">
              <input
                value={r.title} onChange={(e) => update(r.id, "title", e.target.value)} onBlur={() => patch(r.id, { title: r.title })}
                className="flex-1 text-base font-semibold text-gray-900 border-b border-transparent focus:border-gray-300 outline-none"
              />
              <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${r.published ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {r.published ? "published" : "draft"}
              </span>
            </div>
            <input
              value={r.concept} placeholder="One-line concept" onChange={(e) => update(r.id, "concept", e.target.value)} onBlur={() => patch(r.id, { concept: r.concept })}
              className="w-full text-sm text-gray-600 border-b border-transparent focus:border-gray-300 outline-none mb-2"
            />
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <select value={r.difficulty} onChange={(e) => { update(r.id, "difficulty", e.target.value); patch(r.id, { difficulty: e.target.value }); }} className="border border-gray-300 rounded px-2 py-1 text-xs">
                {DIFFS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <button onClick={() => patch(r.id, { published: !r.published })} disabled={busy !== null} className="text-xs rounded bg-gray-900 text-white px-2.5 py-1 hover:bg-gray-700 disabled:opacity-50">
                {r.published ? "Unpublish" : "Publish"}
              </button>
              <button onClick={() => act(`/api/admin/simulation-examples/${r.id}/duplicate`, "POST")} disabled={busy !== null} className="text-xs rounded border border-gray-300 px-2.5 py-1 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Duplicate
              </button>
              <button onClick={() => setConfirmDelete(r)} disabled={busy !== null} className="text-xs rounded border border-red-200 px-2.5 py-1 text-red-600 hover:bg-red-50 disabled:opacity-50">
                Delete
              </button>
              <span className="text-xs text-gray-400 font-mono ml-auto">{r.slug}</span>
            </div>
          </div>
        ))}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete example"
          message={`Delete "${confirmDelete.title}"? This removes it from the catalog. Projects already adopted from it are unaffected.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => { const r = confirmDelete; setConfirmDelete(null); act(`/api/admin/simulation-examples/${r.id}`, "DELETE"); }}
        />
      )}
    </div>
  );
}
