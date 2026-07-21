"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface AuditRow {
  id: string;
  at: string;
  actorEmail: string | null;
  effectiveUserId: string | null;
  orgId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: string; // JSON string
  ip: string | null;
}

/** Compact, readable summary of the meta JSON string (ids/counts/modes only). */
function metaSummary(meta: string): string {
  try {
    const o = JSON.parse(meta) as Record<string, unknown>;
    const parts = Object.entries(o).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
    return parts.join("  ");
  } catch { return meta; }
}

const ACTION_TONE: Record<string, string> = {
  "impersonate.start": "text-purple-700 bg-purple-50 border-purple-200",
  "impersonate.stop": "text-purple-600 bg-purple-50 border-purple-200",
  "export.full-backup": "text-red-700 bg-red-50 border-red-200",
  "restore.wipe": "text-red-800 bg-red-100 border-red-300",
  "export.org-backup": "text-amber-700 bg-amber-50 border-amber-200",
  "user.delete": "text-red-700 bg-red-50 border-red-200",
  "org.settings.update": "text-blue-700 bg-blue-50 border-blue-200",
  "share.create": "text-emerald-700 bg-emerald-50 border-emerald-200",
  "share.revoke": "text-gray-700 bg-gray-50 border-gray-200",
};

export function AuditLogClient({ entries }: { entries: AuditRow[] }) {
  const [q, setQ] = useState("");
  const [action, setAction] = useState<string>("");

  const actions = useMemo(() => Array.from(new Set(entries.map((e) => e.action))).sort(), [entries]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (action && e.action !== action) return false;
      if (!needle) return true;
      return [e.actorEmail, e.action, e.targetType, e.targetId, e.orgId, e.ip, e.meta]
        .some((f) => f && f.toLowerCase().includes(needle));
    });
  }, [entries, q, action]);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <Link href="/dashboard/admin" className="text-sm text-gray-500 hover:text-gray-700">← SuperAdmin</Link>
      <h1 className="text-lg font-semibold text-gray-900 mt-2">Audit Log</h1>
      <p className="text-sm text-gray-600 mt-1">
        Append-only record of privileged / sensitive actions — impersonation, exports &amp; backups,
        wipe restores, user deletes, and org policy changes. Newest first (last 500).
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by actor, target, org, IP…"
          className="flex-1 min-w-[220px] text-sm border border-gray-300 rounded px-2.5 py-1.5"
        />
        <select value={action} onChange={(e) => setAction(e.target.value)}
          className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-700">
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="text-xs text-gray-400">{filtered.length} / {entries.length}</span>
      </div>

      <div className="mt-4 overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide text-[10px]">
            <tr>
              <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">When (UTC)</th>
              <th className="text-left font-semibold px-3 py-2">Actor</th>
              <th className="text-left font-semibold px-3 py-2">Action</th>
              <th className="text-left font-semibold px-3 py-2">Target</th>
              <th className="text-left font-semibold px-3 py-2">Detail</th>
              <th className="text-left font-semibold px-3 py-2">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400 italic">No matching audit entries.</td></tr>
            )}
            {filtered.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50 align-top">
                <td className="px-3 py-2 whitespace-nowrap font-mono text-gray-500">{e.at.replace("T", " ").replace(/\.\d+Z$/, "")}</td>
                <td className="px-3 py-2 text-gray-800">
                  {e.actorEmail ?? "—"}
                  {e.effectiveUserId && <span className="block text-[10px] text-purple-600">as {e.effectiveUserId}</span>}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-medium ${ACTION_TONE[e.action] ?? "text-gray-700 bg-gray-50 border-gray-200"}`}>{e.action}</span>
                </td>
                <td className="px-3 py-2 text-gray-600">
                  {e.targetType ? <span>{e.targetType}{e.targetId ? `:${e.targetId.slice(0, 10)}…` : ""}</span> : "—"}
                  {e.orgId && <span className="block text-[10px] text-gray-400">org {e.orgId.slice(0, 10)}…</span>}
                </td>
                <td className="px-3 py-2 text-gray-500 font-mono break-all max-w-[26rem]">{metaSummary(e.meta)}</td>
                <td className="px-3 py-2 text-gray-400 font-mono whitespace-nowrap">{e.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
