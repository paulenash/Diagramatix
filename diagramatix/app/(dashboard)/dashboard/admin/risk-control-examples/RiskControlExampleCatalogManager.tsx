"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

interface Row {
  id: string; slug: string; title: string; concept: string; description: string; difficulty: string; sortOrder: number; published: boolean;
}
const DIFFS = ["intro", "core", "advanced"];

export function RiskControlExampleCatalogManager() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ id: string; title: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/risk-control-examples");
    if (res.ok) setRows((await res.json()).examples ?? []);
    else setErr((await res.json().catch(() => ({}))).error ?? "Load failed");
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/risk-control-examples/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Update failed"); return; }
    load();
  }
  async function del(id: string) { await fetch(`/api/admin/risk-control-examples/${id}`, { method: "DELETE" }); load(); }

  const inp = "border border-gray-300 rounded px-1.5 py-0.5 text-xs";

  return (
    <div className="max-w-4xl mx-auto p-6">
      <button onClick={() => router.push("/dashboard/admin")} className="text-xs text-gray-500 hover:text-gray-800">← Back</button>
      <h1 className="text-xl font-semibold text-gray-900">Risk &amp; Control Example Catalog</h1>
      <p className="text-sm text-gray-500 mb-4">Seeded examples are published automatically. Toggle visibility, edit the copy, or remove entries.</p>
      {err && <p className="text-xs text-red-500 mb-2">{err}</p>}
      {loading ? <p className="text-sm text-gray-400">Loading…</p> : rows.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No examples yet — the Order-to-Cash example seeds on deploy.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="border border-teal-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <input defaultValue={r.title} onBlur={(e) => e.target.value.trim() !== r.title && patch(r.id, { title: e.target.value })} className={`${inp} flex-1 font-medium`} />
                <span className="text-[10px] font-mono text-gray-400">{r.slug}</span>
                <label className="flex items-center gap-1 text-[11px] text-gray-600">
                  <input type="checkbox" checked={r.published} onChange={(e) => patch(r.id, { published: e.target.checked })} />
                  {r.published ? <span className="text-teal-700">published</span> : "draft"}
                </label>
                <button onClick={() => setConfirmDel({ id: r.id, title: r.title })} className="text-[11px] text-red-500 hover:text-red-700">delete</button>
              </div>
              <div className="flex flex-wrap gap-1.5 items-center text-[11px]">
                <input defaultValue={r.concept} placeholder="concept (tagline)" onBlur={(e) => e.target.value !== r.concept && patch(r.id, { concept: e.target.value })} className={`${inp} flex-1 min-w-[240px]`} />
                <select defaultValue={r.difficulty} onChange={(e) => patch(r.id, { difficulty: e.target.value })} className={inp}>
                  {DIFFS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <label className="flex items-center gap-1 text-gray-500">sort
                  <input type="number" defaultValue={r.sortOrder} onBlur={(e) => Number(e.target.value) !== r.sortOrder && patch(r.id, { sortOrder: Number(e.target.value) })} className={`${inp} w-16`} />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
      {confirmDel && (
        <ConfirmDialog title="Delete example" message={`Delete "${confirmDel.title}" from the catalog? Adopted projects are unaffected.`} destructive
          onConfirm={() => { del(confirmDel.id); setConfirmDel(null); }} onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  );
}
