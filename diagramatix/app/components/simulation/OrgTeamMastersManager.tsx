"use client";

/**
 * OrgAdmin surface for the organisation's MASTER simulation teams — the
 * standing resource pools (capacity, cost/hour, efficiency) that projects adopt
 * as their own copies from the Simulator's Team Library.
 *
 * Dashboard-styled (not Matrix): this lives under OrgAdmin alongside SOP
 * Templates and Entity Structures, not inside the Simulator console.
 *
 * Editing a master never rewrites copies a project has already adopted — the
 * copy is independent by design, so the panel says so rather than implying a
 * live link.
 */

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

interface OrgTeam {
  id: string;
  name: string;
  capacity: number;
  costPerHour: number | null;
  efficiency: number;
  _count?: { clones: number };
}

const numOrNull = (v: string): number | null => {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export function OrgTeamMastersManager({ orgId }: { orgId: string }) {
  const [teams, setTeams] = useState<OrgTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<OrgTeam | null>(null);

  const [newName, setNewName] = useState("");
  const [newCap, setNewCap] = useState("1");
  const [newCost, setNewCost] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/simulation-teams`);
      if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Failed to load"); return; }
      setTeams((await res.json()).teams ?? []);
      setErr(null);
    } finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  async function add() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/simulation-teams`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          capacity: Math.max(1, parseInt(newCap, 10) || 1),
          costPerHour: numOrNull(newCost),
        }),
      });
      if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Failed to add"); return; }
      setNewName(""); setNewCap("1"); setNewCost("");
      await load();
    } finally { setBusy(false); }
  }

  async function patch(id: string, data: Record<string, unknown>) {
    // Optimistic: the row is a plain scalar edit, and a failure reloads truth.
    setTeams((ts) => ts.map((t) => (t.id === id ? { ...t, ...data } as OrgTeam : t)));
    const res = await fetch(`/api/orgs/${orgId}/simulation-teams/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error ?? "Failed to save");
      await load();
    } else { setErr(null); }
  }

  async function remove(team: OrgTeam) {
    setBusy(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/simulation-teams/${team.id}`, { method: "DELETE" });
      if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Failed to delete"); return; }
      await load();
    } finally { setBusy(false); setConfirmDelete(null); }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-4">
      {err && <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-4 py-2">Team</th>
              <th className="text-left font-medium px-4 py-2 w-24">Capacity</th>
              <th className="text-left font-medium px-4 py-2 w-28">Cost/hour</th>
              <th className="text-left font-medium px-4 py-2 w-28">Efficiency</th>
              <th className="text-left font-medium px-4 py-2 w-24">Adopted</th>
              <th className="px-4 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>
            )}
            {!loading && teams.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                No organisation teams yet — add one below.
              </td></tr>
            )}
            {teams.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <input
                    type="text" defaultValue={t.name}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.name) patch(t.id, { name: v }); }}
                    className="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-2 py-1 text-gray-900"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number" min={1} value={t.capacity}
                    onChange={(e) => patch(t.id, { capacity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                    className="w-20 border border-gray-300 rounded px-2 py-1 text-gray-900"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number" step="0.01" defaultValue={t.costPerHour ?? ""} placeholder="—"
                    onBlur={(e) => patch(t.id, { costPerHour: numOrNull(e.target.value) })}
                    className="w-24 border border-gray-300 rounded px-2 py-1 text-gray-900"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number" step="0.05" min={0.05} defaultValue={t.efficiency}
                    onBlur={(e) => { const n = Number(e.target.value); if (n > 0) patch(t.id, { efficiency: n }); }}
                    className="w-20 border border-gray-300 rounded px-2 py-1 text-gray-900"
                  />
                </td>
                <td className="px-4 py-2 text-gray-500">
                  {t._count?.clones ? `${t._count.clones} project${t._count.clones === 1 ? "" : "s"}` : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => setConfirmDelete(t)}
                    className="text-red-600 hover:text-red-800 px-1"
                    title="Delete this master (project copies are kept)"
                  >✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex items-end gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3">
          <label className="flex-1">
            <span className="block text-xs text-gray-500 mb-1">New team</span>
            <input
              type="text" value={newName} placeholder="e.g. Assessors"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-gray-900"
            />
          </label>
          <label className="w-24">
            <span className="block text-xs text-gray-500 mb-1">Capacity</span>
            <input
              type="number" min={1} value={newCap}
              onChange={(e) => setNewCap(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-gray-900"
            />
          </label>
          <label className="w-28">
            <span className="block text-xs text-gray-500 mb-1">Cost/hour</span>
            <input
              type="number" step="0.01" value={newCost} placeholder="—"
              onChange={(e) => setNewCost(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-gray-900"
            />
          </label>
          <button
            onClick={add}
            disabled={busy || !newName.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm rounded px-4 py-1.5"
          >Add</button>
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-500">
        A project adopts these from the Simulator&rsquo;s <strong>Teams</strong> panel and gets its own independent copy.
        Editing a master here never changes a copy a project has already adopted.
      </p>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete organisation team"
          message={
            confirmDelete._count?.clones
              ? `Delete "${confirmDelete.name}"? ${confirmDelete._count.clones} project cop${confirmDelete._count.clones === 1 ? "y" : "ies"} already adopted it and will be kept as-is.`
              : `Delete "${confirmDelete.name}"?`
          }
          confirmLabel="Delete"
          onConfirm={() => remove(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
