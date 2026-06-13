"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { AlertDialog } from "@/app/components/AlertDialog";

interface MemberRow {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  status: string;
  invitedAt: string;
  joinedAt: string | null;
}

interface GroupRow {
  id: string;
  name: string;
  isOrgGroup: boolean;
  orgName: string | null;
  ownerId: string;
  ownerName: string | null;
  ownerEmail: string;
  createdAt: string;
  updatedAt: string;
  members: MemberRow[];
}

const STATUS_STYLE: Record<string, string> = {
  invited:  "bg-yellow-100 text-yellow-800",
  accepted: "bg-green-100 text-green-800",
  declined: "bg-gray-100 text-gray-500",
  left:     "bg-gray-100 text-gray-500",
  removed:  "bg-red-100 text-red-700",
};

export function AdminGroupsClient() {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<GroupRow | null>(null);
  const [alertState, setAlertState] = useState<{ title?: string; message: string; tone?: "info" | "error" } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/groups");
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = await res.json();
      setGroups(data.groups ?? []);
    } catch (err) {
      setAlertState({ tone: "error", message: err instanceof Error ? err.message : "Failed to load groups" });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function performDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    try {
      const res = await fetch(`/api/admin/groups/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Delete failed (${res.status})`);
      }
      await load();
    } catch (err) {
      setAlertState({ tone: "error", message: err instanceof Error ? err.message : "Delete failed" });
    }
  }

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard/admin")} className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
            <span style={{ fontSize: "1.5em", lineHeight: 1 }}>{"←"}</span>
            <span className="underline">SuperAdmin</span>
          </button>
          <h1 className="font-semibold text-gray-900">SuperAdmin — Collaboration Groups</h1>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {groups === null ? (
          <p className="text-xs text-gray-400 italic">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No groups in the system yet.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded">
            <table className="w-full table-fixed">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2" style={{ width: "26%" }}>Name</th>
                  <th className="px-3 py-2" style={{ width: "22%" }}>Owner</th>
                  <th className="px-3 py-2 text-center" style={{ width: "9%" }}>Members</th>
                  <th className="px-3 py-2" style={{ width: "10%" }}>Type</th>
                  <th className="px-3 py-2" style={{ width: "13%" }}>Created</th>
                  <th className="px-3 py-2 text-right" style={{ width: "20%" }}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {groups.map(g => {
                  const isOpen = expanded.has(g.id);
                  const activeMembers = g.members.filter(m => m.status === "invited" || m.status === "accepted");
                  return (
                    <FragmentRow key={g.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm text-gray-900 font-medium truncate">
                          <button onClick={() => toggleExpanded(g.id)} className="text-left flex items-center gap-1 hover:underline">
                            <span className="text-gray-400 inline-block w-3">{isOpen ? "▾" : "▸"}</span>
                            <span className="truncate">{g.name}</span>
                          </button>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700 truncate" title={g.ownerEmail}>
                          {g.ownerName ?? <em className="text-gray-400">No name</em>}
                          <div className="text-[10px] text-gray-500 truncate">{g.ownerEmail}</div>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700 text-center">{activeMembers.length}</td>
                        <td className="px-3 py-2 text-[10px]">
                          {g.isOrgGroup ? (
                            <span className="uppercase tracking-wide bg-purple-100 text-purple-700 rounded px-1.5 py-0.5">Org seeded</span>
                          ) : (
                            <span className="uppercase tracking-wide bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">User</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {new Date(g.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => setPendingDelete(g)}
                            className="text-xs text-white bg-red-600 hover:bg-red-700 rounded px-2 py-1"
                            title={g.isOrgGroup ? "Delete this Org seeded group" : "Delete this group"}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-gray-50/50">
                          <td colSpan={6} className="px-6 py-3">
                            <h4 className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Members</h4>
                            {g.members.length === 0 ? (
                              <p className="text-xs text-gray-400 italic">No members.</p>
                            ) : (
                              <ul className="divide-y divide-gray-100 border border-gray-200 rounded bg-white">
                                {g.members.map(m => (
                                  <li key={m.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                                    <div className="flex-1 min-w-0">
                                      <span className="text-gray-900">{m.name ?? <em className="text-gray-400">No name</em>}</span>
                                      {m.userId === g.ownerId && (
                                        <span className="ml-1.5 text-[9px] uppercase tracking-wide bg-blue-100 text-blue-800 rounded px-1 py-0.5">Owner</span>
                                      )}
                                      <span className="ml-1.5 text-gray-400">{m.email}</span>
                                    </div>
                                    <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${STATUS_STYLE[m.status] ?? "bg-gray-100 text-gray-700"}`}>
                                      {m.status}
                                    </span>
                                    <span className="text-[10px] text-gray-400 shrink-0">
                                      {new Date(m.invitedAt).toLocaleDateString()}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </FragmentRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {groups && (
          <p className="text-xs text-gray-400 mt-4">
            {groups.length} group(s) — {groups.filter(g => g.isOrgGroup).length} Org seeded.
          </p>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title={pendingDelete.isOrgGroup ? "Delete Org seeded group?" : "Delete group?"}
          message={
            `Delete "${pendingDelete.name}" — owned by ${pendingDelete.ownerName ?? pendingDelete.ownerEmail} ` +
            `(${pendingDelete.ownerEmail}) — and remove ${pendingDelete.members.length} member row(s)? ` +
            `\n\nThis cannot be undone.` +
            (pendingDelete.isOrgGroup
              ? "\n\nNote: this group was seeded from the user's Org. Deleting it will NOT remove the Org itself."
              : "")
          }
          confirmLabel="Delete"
          destructive
          onConfirm={performDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {alertState && (
        <AlertDialog
          title={alertState.title}
          message={alertState.message}
          tone={alertState.tone}
          onClose={() => setAlertState(null)}
        />
      )}
    </div>
  );
}

// Tiny passthrough so the parent table receives a single React child per
// row even when we conditionally render the expanded detail tr.
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
