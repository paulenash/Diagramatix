"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

interface Issue {
  id: string; route: string; diagramId: string | null; schemaVersion: string | null;
  path: string; message: string; count: number; firstSeen: string; lastSeen: string;
}

export function SchemaValidationClient() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/schema-validation");
      const j = await r.json().catch(() => ({ issues: [], total: 0 }));
      setIssues(j.issues ?? []); setTotal(j.total ?? 0);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(body: object) {
    setBusy(true);
    try { await fetch("/api/admin/schema-validation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); await load(); }
    finally { setBusy(false); }
  }
  const fmt = (s: string) => { try { return new Date(s).toLocaleString(); } catch { return s; } };

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/admin" className="text-sm text-red-600 hover:text-red-800">‹ SuperAdmin</Link>
          <h1 className="text-lg font-semibold text-gray-900">Schema Validation</h1>
          {total > 0 && <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">{total} open</span>}
        </div>
        {issues.length > 0 && (
          <button onClick={() => setConfirmClear(true)} disabled={busy} className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40">Clear all</button>
        )}
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <p className="text-xs text-gray-500 mb-4">
          Findings from the parallel Zod validator on the persisted Diagram JSON (log-only — nothing is blocked).
          Deduped by problem; the count rises each time it recurs. Fixing the root cause and clearing the row makes it stay gone.
        </p>
        {loading ? <p className="text-sm text-gray-500">Loading…</p> : issues.length === 0 ? (
          <p className="text-sm text-green-600">No open schema-validation issues. 🎉</p>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="p-2">Route</th><th className="p-2">Path</th><th className="p-2">Message</th>
                  <th className="p-2 text-right">Count</th><th className="p-2">Last seen</th><th className="p-2">Diagram</th><th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {issues.map((i) => (
                  <tr key={i.id} className="border-t border-gray-100 align-top">
                    <td className="p-2 font-mono text-gray-700 whitespace-nowrap">{i.route}</td>
                    <td className="p-2 font-mono text-gray-500">{i.path}</td>
                    <td className="p-2 text-gray-800">{i.message}</td>
                    <td className="p-2 text-right font-semibold text-amber-700">{i.count}</td>
                    <td className="p-2 text-gray-500 whitespace-nowrap">{fmt(i.lastSeen)}</td>
                    <td className="p-2 font-mono text-gray-400">{i.diagramId ? (
                      <Link href={`/diagram/${i.diagramId}`} target="_blank" className="text-blue-600 hover:underline">{i.diagramId.slice(-6)}</Link>
                    ) : "—"}</td>
                    <td className="p-2"><button onClick={() => act({ action: "resolve", id: i.id })} disabled={busy} className="text-blue-500 hover:text-blue-700 disabled:opacity-40">Resolve</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmClear && (
        <ConfirmDialog title="Clear all issues" message={`Mark all ${total} open issue(s) resolved? They'll reappear if the underlying problem recurs.`}
          confirmLabel="Clear all" onConfirm={() => { setConfirmClear(false); void act({ action: "clear" }); }} onCancel={() => setConfirmClear(false)} />
      )}
    </div>
  );
}
