"use client";

import { useMemo, useState } from "react";

export interface PollingRow {
  id: string;
  name: string;
  kind: string;
  autoRefresh: boolean;
  eventCount: number;
  lastIngestAt: string | null;
  lastRefreshAt: string | null;
  projectId: string;
  projectName: string;
  orgName: string | null;
  ownerEmail: string | null;
}

const KIND_LABEL: Record<string, string> = { webhook: "Webhook (push)", "azure-blob": "Azure Blob (folder)", sharepoint: "SharePoint (folder)" };

/**
 * SuperAdmin / OrgAdmin console listing every live source (per project) with an
 * automatic-polling on/off toggle + a manual "Refresh now". Toggles write via the
 * existing project-scoped route so authorization (owner / OrgAdmin / SuperAdmin) is
 * enforced server-side.
 */
export function MiningPollingClient({ rows, isSuperAdmin, scopeName }: { rows: PollingRow[]; isSuperAdmin: boolean; scopeName: string | null }) {
  const [state, setState] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map((r) => [r.id, r.autoRefresh])));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.projectName.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) ||
      (r.ownerEmail ?? "").toLowerCase().includes(q) || (r.orgName ?? "").toLowerCase().includes(q),
    );
  }, [rows, filter]);

  const onCount = useMemo(() => rows.filter((r) => state[r.id]).length, [rows, state]);

  async function toggle(r: PollingRow) {
    const next = !state[r.id];
    setBusy(r.id); setMsg(null);
    try {
      const res = await fetch(`/api/projects/${r.projectId}/mining/sources/${r.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoRefresh: next }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Update failed");
      setState((s) => ({ ...s, [r.id]: next }));
      setMsg(`${r.name}: polling ${next ? "on" : "off"} ✓`);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Update failed"); }
    finally { setBusy(null); }
  }

  async function refresh(r: PollingRow) {
    setBusy(r.id + "r"); setMsg(null);
    try {
      const res = await fetch(`/api/projects/${r.projectId}/mining/sources/${r.id}/refresh`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Refresh failed");
      setMsg(`${r.name}: refreshed ✓`);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Refresh failed"); }
    finally { setBusy(null); }
  }

  return (
    <div className="p-6 max-w-6xl">
      <a href="/dashboard/admin" className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 mb-1">
        <span>&larr;</span><span className="underline">SuperAdmin</span>
      </a>
      <h1 className="text-xl font-semibold text-gray-900">Live-source Polling</h1>
      <p className="text-xs text-gray-500 mt-0.5">
        {isSuperAdmin ? "All projects with a DiagramatixMINER live source." : `Live sources in ${scopeName ?? "your organisation"}.`}
        {" "}Turn automatic polling on/off per source. {onCount}/{rows.length} on.
      </p>

      <div className="flex items-center justify-between gap-3 mt-3 mb-2 flex-wrap">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by project, source, owner or org…"
          className="text-sm border border-gray-300 rounded px-3 py-1.5 w-80 max-w-full focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {msg && <span className={`text-xs ${msg.includes("✓") ? "text-green-600" : "text-red-600"}`}>{msg}</span>}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 mt-6">No live sources found{isSuperAdmin ? "" : " in this organisation"}.</p>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="text-xs min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left font-medium text-gray-600 px-3 py-2">Project</th>
                <th className="text-left font-medium text-gray-600 px-3 py-2">Source</th>
                {isSuperAdmin && <th className="text-left font-medium text-gray-600 px-3 py-2">Org</th>}
                <th className="text-left font-medium text-gray-600 px-3 py-2">Owner</th>
                <th className="text-right font-medium text-gray-600 px-3 py-2">Events</th>
                <th className="text-left font-medium text-gray-600 px-3 py-2">Last refresh</th>
                <th className="text-center font-medium text-gray-600 px-3 py-2">Polling</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const on = state[r.id];
                const sp = r.kind === "sharepoint";
                return (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                    <td className="px-3 py-1.5 text-gray-800">{r.projectName}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.name}<span className="ml-1.5 text-[10px] text-gray-400">{KIND_LABEL[r.kind] ?? r.kind}</span></td>
                    {isSuperAdmin && <td className="px-3 py-1.5 text-gray-500">{r.orgName ?? "—"}</td>}
                    <td className="px-3 py-1.5 text-gray-500">{r.ownerEmail ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{r.eventCount}</td>
                    <td className="px-3 py-1.5 text-gray-500">{r.lastRefreshAt ? new Date(r.lastRefreshAt).toLocaleString() : "never"}</td>
                    <td className="px-3 py-1.5 text-center">
                      {sp ? (
                        <span className="text-gray-400" title="SharePoint sources refresh manually only">manual only</span>
                      ) : (
                        <button onClick={() => toggle(r)} disabled={busy === r.id}
                          className={`px-2 py-0.5 rounded border text-[11px] disabled:opacity-50 ${on ? "border-green-300 bg-green-50 text-green-700" : "border-gray-300 bg-gray-50 text-gray-500"}`}>
                          {busy === r.id ? "…" : on ? "● On" : "○ Off"}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button onClick={() => refresh(r)} disabled={busy === r.id + "r"}
                        className="text-blue-600 hover:text-blue-800 disabled:opacity-50">Refresh now</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
