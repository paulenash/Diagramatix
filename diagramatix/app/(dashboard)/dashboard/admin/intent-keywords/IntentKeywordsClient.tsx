"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Editable rows for the assist "semantic template suggestion" catalog. When a
// selected element's NAME contains any keyword, the ghost surfaces this intent
// and attaches the named template (or opens the picker at its category).
interface Row {
  id?: string;
  label: string;
  keywordsText: string;      // comma/space separated in the editor
  targetCategory: string;
  targetTemplateName: string;
  sortOrder: number;
}

const blank = (sortOrder: number): Row => ({ label: "", keywordsText: "", targetCategory: "", targetTemplateName: "", sortOrder });

export function IntentKeywordsClient() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/intent-keywords")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.rows) {
          setRows(j.rows.map((r: { id: string; label: string; keywords: string[]; targetCategory: string | null; targetTemplateName: string | null; sortOrder: number }) => ({
            id: r.id, label: r.label, keywordsText: (r.keywords ?? []).join(", "),
            targetCategory: r.targetCategory ?? "", targetTemplateName: r.targetTemplateName ?? "", sortOrder: r.sortOrder,
          })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function remove(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  function add() {
    setRows((prev) => [...prev, blank((prev.at(-1)?.sortOrder ?? 0) + 10)]);
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    const payload = {
      rows: rows.map((r, i) => ({
        label: r.label.trim(),
        keywords: r.keywordsText.split(/[,\n]/).map((k) => k.trim()).filter(Boolean),
        targetCategory: r.targetCategory.trim() || null,
        targetTemplateName: r.targetTemplateName.trim() || null,
        sortOrder: Number.isFinite(r.sortOrder) ? r.sortOrder : i * 10,
      })),
    };
    try {
      const res = await fetch("/api/admin/intent-keywords", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) { setStatus(`Error: ${j?.error ?? res.statusText}`); return; }
      setStatus(`Saved ${j.rows.length} intent${j.rows.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  const input = "border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400";

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard/admin")} className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1">
            <span style={{ fontSize: "1.5em", lineHeight: 1 }}>←</span><span className="underline">SuperAdmin</span>
          </button>
          <h1 className="font-semibold text-gray-900">Intent Keywords</h1>
        </div>
        <div className="flex items-center gap-2">
          {status && <span className={`text-xs ${status.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>{status}</span>}
          <button onClick={add} className="text-xs text-purple-700 border border-purple-300 hover:bg-purple-50 rounded px-2.5 py-1">+ Add</button>
          <button onClick={save} disabled={saving} className="text-xs text-white bg-purple-600 hover:bg-purple-700 rounded px-3 py-1 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      <div className="p-6 max-w-4xl">
        <p className="text-xs text-gray-500 mb-4">
          When a selected BPMN element&rsquo;s <strong>name</strong> contains any keyword (whole-word, case-insensitive),
          the assist ghost suggests this intent — attaching the named template directly, or opening the template picker
          at the given category. Set a <strong>category</strong> (a template group) and/or an exact <strong>template name</strong>.
        </p>

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-500">
                  <th className="px-2 py-2 w-28">Label</th>
                  <th className="px-2 py-2">Keywords (comma-separated)</th>
                  <th className="px-2 py-2 w-32">Category</th>
                  <th className="px-2 py-2 w-40">Template name</th>
                  <th className="px-2 py-2 w-12">Sort</th>
                  <th className="px-2 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="px-2 py-4 text-gray-400">No intents yet — click <strong>+ Add</strong>.</td></tr>
                )}
                {rows.map((r, i) => (
                  <tr key={r.id ?? `new-${i}`} className="hover:bg-gray-50">
                    <td className="px-2 py-1.5"><input className={`${input} w-full`} value={r.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Approval" /></td>
                    <td className="px-2 py-1.5"><input className={`${input} w-full`} value={r.keywordsText} onChange={(e) => update(i, { keywordsText: e.target.value })} placeholder="approve, sign-off, authorise" /></td>
                    <td className="px-2 py-1.5"><input className={`${input} w-full`} value={r.targetCategory} onChange={(e) => update(i, { targetCategory: e.target.value })} placeholder="Approvals" /></td>
                    <td className="px-2 py-1.5"><input className={`${input} w-full`} value={r.targetTemplateName} onChange={(e) => update(i, { targetTemplateName: e.target.value })} placeholder="(optional exact name)" /></td>
                    <td className="px-2 py-1.5"><input className={`${input} w-full`} type="number" value={r.sortOrder} onChange={(e) => update(i, { sortOrder: Number(e.target.value) })} /></td>
                    <td className="px-2 py-1.5 text-center"><button onClick={() => remove(i)} className="text-gray-400 hover:text-red-600" title="Remove">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
