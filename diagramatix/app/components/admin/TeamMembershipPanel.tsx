"use client";

/**
 * Admin panel — assign an org's members to Org-Structure teams/roles. Drives the
 * Process Portal's "Involving me" view. Used by OrgAdmins (own org) and
 * SuperAdmins (any org). All reads/writes go through /api/orgs/[id]/member-teams.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toSuggestions, type EntityNodeDTO } from "@/app/lib/entityLists/types";

interface Member { userId: string; name: string | null; email: string }
interface Node { id: string; name: string; parentId: string | null; level: string; sortOrder: number; listName: string }
interface Membership { userId: string; entityNodeId: string }
interface Payload { members: Member[]; nodes: Node[]; memberships: Membership[] }

export function TeamMembershipPanel({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/orgs/${orgId}/member-teams`);
    if (!res.ok) { setError("Failed to load."); return; }
    const j: Payload = await res.json();
    setData(j);
    setSelectedUserId((prev) => prev || j.members[0]?.userId || "");
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const tree = useMemo(
    () => (data ? toSuggestions(data.nodes.map((n) => ({ ...n, listId: "" })) as EntityNodeDTO[]) : []),
    [data],
  );
  const assigned = useMemo(
    () => new Set((data?.memberships ?? []).filter((m) => m.userId === selectedUserId).map((m) => m.entityNodeId)),
    [data, selectedUserId],
  );

  async function toggle(nodeId: string, on: boolean) {
    if (!selectedUserId) return;
    setBusy(nodeId); setError(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/member-teams`, {
        method: on ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, entityNodeId: nodeId }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? "Save failed."); return; }
      // Optimistic local update.
      setData((d) => d && {
        ...d,
        memberships: on
          ? [...d.memberships, { userId: selectedUserId, entityNodeId: nodeId }]
          : d.memberships.filter((m) => !(m.userId === selectedUserId && m.entityNodeId === nodeId)),
      });
    } finally { setBusy(null); }
  }

  if (!data) return <p className="text-sm text-gray-500">Loading…</p>;

  if (data.nodes.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        {orgName} has no <span className="font-medium">Org-Structure</span> Entity List yet. Create one (Teams / Roles) in
        Entity Lists, then assign members here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">Member</label>
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
        >
          {data.members.map((m) => (
            <option key={m.userId} value={m.userId}>{m.name ? `${m.name} (${m.email})` : m.email}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">{assigned.size} team{assigned.size === 1 ? "" : "s"} assigned</span>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
        {tree.map((n) => (
          <label
            key={n.id}
            className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm"
            style={{ paddingLeft: `${12 + n.depth * 18}px` }}
          >
            <input
              type="checkbox"
              checked={assigned.has(n.id)}
              disabled={busy === n.id || !selectedUserId}
              onChange={(e) => toggle(n.id, e.target.checked)}
            />
            <span className="text-gray-800">{n.name}</span>
            <span className="text-[10px] text-gray-400 uppercase tracking-wide">{n.level}</span>
          </label>
        ))}
      </div>
      <p className="text-[11px] text-gray-400">
        Assigning a member to a team also covers every role beneath it — the Portal&apos;s “Involving me” view shows any
        process that references their team or its child roles.
      </p>
    </div>
  );
}
