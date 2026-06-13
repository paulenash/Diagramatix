"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { PromptDialog } from "@/app/components/PromptDialog";
import { AlertDialog } from "@/app/components/AlertDialog";

/**
 * Collaboration Groups dashboard.
 *
 * Layout:
 *   Header (Back to Dashboard, + New Group button)
 *   Left rail: list of groups the user owns or is in.
 *   Right pane: detail of selected group — members, invite UI,
 *   ownership transfer, pending transfers awaiting current user.
 */

interface GroupRow {
  id: string;
  name: string;
  isOrgGroup: boolean;
  ownerId: string;
  ownerName: string | null;
  ownerEmail: string;
  role: "owner" | "invited" | "member";
  myStatus: string;
  memberCount: number;
  invitedCount: number;
}

interface GroupDetail {
  group: {
    id: string;
    name: string;
    isOrgGroup: boolean;
    ownerId: string;
    ownerName: string | null;
    ownerEmail: string;
  };
  isOwner: boolean;
  myStatus: string | null;
  members: Array<{
    id: string;
    userId: string;
    name: string | null;
    email: string;
    status: string;
    invitedAt: string;
    joinedAt: string | null;
    invitedByName: string | null;
    invitedByEmail: string | null;
  }>;
  pendingTransfers: Array<{
    id: string;
    fromUserId: string;
    fromName: string | null;
    fromEmail: string;
    toUserId: string;
    toName: string | null;
    toEmail: string;
    createdAt: string;
  }>;
}

interface UserSearchResult {
  id: string;
  name: string | null;
  email: string;
}

const STATUS_STYLE: Record<string, string> = {
  invited:  "bg-yellow-100 text-yellow-800",
  accepted: "bg-green-100 text-green-800",
  declined: "bg-gray-100 text-gray-500",
  left:     "bg-gray-100 text-gray-500",
  removed:  "bg-red-100 text-red-700",
};

export function GroupsClient({ currentUserId }: { currentUserId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialGroupId = searchParams.get("group");

  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialGroupId);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/groups");
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = await res.json();
      setGroups(data.groups ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load groups");
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/groups/${id}`);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = await res.json();
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load group");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);
  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  // Auto-select first group if none selected yet.
  useEffect(() => {
    if (!selectedId && groups && groups.length > 0) {
      setSelectedId(groups[0].id);
    }
  }, [groups, selectedId]);

  // Dialog state (Diagramatix-native — no browser dialogs allowed in
  // this project; see feedback_no_browser_dialogs memory).
  const [showCreatePrompt, setShowCreatePrompt] = useState(false);
  const [pendingMemberAction, setPendingMemberAction] = useState<
    | { kind: "remove"; userId: string; userLabel: string }
    | { kind: "leave" }
    | null
  >(null);
  const [showDeletePrompt, setShowDeletePrompt] = useState(false);
  const [pendingTransfer, setPendingTransfer] = useState<{ toUserId: string; userLabel: string } | null>(null);
  const [alertState, setAlertState] = useState<{ title?: string; message: string; tone?: "info" | "error" } | null>(null);

  function showError(message: string) {
    setAlertState({ message, tone: "error" });
  }

  async function performCreateGroup(name: string) {
    setShowCreatePrompt(false);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Create failed (${res.status})`);
      }
      const data = await res.json();
      await loadGroups();
      setSelectedId(data.group.id);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function performMemberAction(userId: string, action: "accept" | "decline" | "leave" | "remove") {
    if (!selectedId) return;
    setPendingMemberAction(null);
    try {
      const res = await fetch(`/api/groups/${selectedId}/members/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Action failed (${res.status})`);
      }
      await Promise.all([loadGroups(), loadDetail(selectedId)]);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Action failed");
    }
  }

  function memberAction(userId: string, action: "accept" | "decline" | "leave" | "remove") {
    if (!selectedId) return;
    // accept / decline fire immediately (no confirmation). remove and
    // leave route through a native ConfirmDialog.
    if (action === "remove") {
      const target = detail?.members.find(m => m.userId === userId);
      const userLabel = target?.name ?? target?.email ?? "this member";
      setPendingMemberAction({ kind: "remove", userId, userLabel });
      return;
    }
    if (action === "leave") {
      setPendingMemberAction({ kind: "leave" });
      return;
    }
    performMemberAction(userId, action);
  }

  async function performDeleteGroup() {
    if (!selectedId || !detail) return;
    setShowDeletePrompt(false);
    try {
      const res = await fetch(`/api/groups/${selectedId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Delete failed (${res.status})`);
      }
      await loadGroups();
      setSelectedId(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function deleteGroup() {
    if (!selectedId || !detail) return;
    setShowDeletePrompt(true);
  }

  async function performTransfer(toUserId: string) {
    if (!selectedId || !detail) return;
    setPendingTransfer(null);
    try {
      const res = await fetch(`/api/groups/${selectedId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Transfer failed (${res.status})`);
      }
      await loadDetail(selectedId);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Transfer failed");
    }
  }

  function startTransfer(toUserId: string) {
    if (!selectedId || !detail) return;
    const target = detail.members.find(m => m.userId === toUserId);
    if (!target) return;
    setPendingTransfer({ toUserId, userLabel: target.name ?? target.email });
  }

  async function transferAction(transferId: string, action: "accept" | "decline" | "cancel") {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/groups/${selectedId}/transfer/${transferId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Action failed (${res.status})`);
      }
      await Promise.all([loadGroups(), loadDetail(selectedId)]);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Action failed");
    }
  }

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")} className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
            <span style={{ fontSize: "1.5em", lineHeight: 1 }}>{"←"}</span>
            <span className="underline">Dashboard</span>
          </button>
          <h1 className="font-semibold text-gray-900">Collaboration Groups</h1>
        </div>
        <button onClick={() => setShowCreatePrompt(true)} className="text-xs bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700">
          + New Group
        </button>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-12 gap-4">
        {/* Left rail */}
        <aside className="col-span-4 bg-white border border-gray-200 rounded">
          {groups === null ? (
            <p className="p-3 text-xs text-gray-400 italic">Loading…</p>
          ) : groups.length === 0 ? (
            <p className="p-3 text-xs text-gray-400 italic">You're not in any groups yet.</p>
          ) : (
            <ul>
              {groups.map(g => (
                <li key={g.id}>
                  <button
                    onClick={() => setSelectedId(g.id)}
                    className={`w-full text-left px-3 py-2 border-b border-gray-100 hover:bg-gray-50 ${selectedId === g.id ? "bg-blue-50" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate flex-1">{g.name}</span>
                      {g.isOrgGroup && (
                        <span className="text-[9px] uppercase tracking-wide bg-purple-100 text-purple-700 rounded px-1.5 py-0.5">Org</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
                      <span className={`rounded px-1.5 py-0.5 font-medium ${g.role === "owner" ? "bg-blue-100 text-blue-800" : g.role === "invited" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-700"}`}>
                        {g.role === "owner" ? "Owner" : g.role === "invited" ? "Invited" : "Member"}
                      </span>
                      <span>{g.memberCount} accepted{g.invitedCount > 0 ? `, ${g.invitedCount} invited` : ""}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Right pane */}
        <section className="col-span-8 bg-white border border-gray-200 rounded p-4">
          {!selectedId ? (
            <p className="text-xs text-gray-400 italic">Select a group on the left.</p>
          ) : loadingDetail || !detail ? (
            <p className="text-xs text-gray-400 italic">Loading…</p>
          ) : (
            <GroupDetailPanel
              detail={detail}
              currentUserId={currentUserId}
              onMemberAction={memberAction}
              onDeleteGroup={deleteGroup}
              onStartTransfer={startTransfer}
              onTransferAction={transferAction}
              onAfterInvite={async () => { if (selectedId) await Promise.all([loadGroups(), loadDetail(selectedId)]); }}
            />
          )}
        </section>
      </main>

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-600 text-white text-xs px-3 py-2 rounded shadow">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {showCreatePrompt && (
        <PromptDialog
          title="New Collaboration Group"
          message="Pick a name for your group. You'll be the Owner."
          placeholder="e.g. Risk Reviewers"
          confirmLabel="Create"
          validate={(v) => v.length === 0 ? "Name required" : v.length > 80 ? "Name too long (max 80)" : null}
          onConfirm={performCreateGroup}
          onCancel={() => setShowCreatePrompt(false)}
        />
      )}

      {pendingMemberAction?.kind === "remove" && (
        <ConfirmDialog
          title="Remove member?"
          message={`Remove ${pendingMemberAction.userLabel} from the group?`}
          confirmLabel="Remove"
          destructive
          onConfirm={() => performMemberAction(pendingMemberAction.userId, "remove")}
          onCancel={() => setPendingMemberAction(null)}
        />
      )}

      {pendingMemberAction?.kind === "leave" && (
        <ConfirmDialog
          title="Leave group?"
          message="You can only rejoin if the Owner re-invites you."
          confirmLabel="Leave"
          destructive
          onConfirm={() => performMemberAction(currentUserId, "leave")}
          onCancel={() => setPendingMemberAction(null)}
        />
      )}

      {showDeletePrompt && detail && (
        <ConfirmDialog
          title="Delete group?"
          message={`Delete "${detail.group.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          destructive
          onConfirm={performDeleteGroup}
          onCancel={() => setShowDeletePrompt(false)}
        />
      )}

      {pendingTransfer && detail && (
        <ConfirmDialog
          title="Transfer ownership?"
          message={`Transfer ownership of "${detail.group.name}" to ${pendingTransfer.userLabel}? They must accept before the transfer completes.`}
          confirmLabel="Transfer"
          destructive={false}
          onConfirm={() => performTransfer(pendingTransfer.toUserId)}
          onCancel={() => setPendingTransfer(null)}
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

function GroupDetailPanel(props: {
  detail: GroupDetail;
  currentUserId: string;
  onMemberAction: (userId: string, action: "accept" | "decline" | "leave" | "remove") => void;
  onDeleteGroup: () => void;
  onStartTransfer: (toUserId: string) => void;
  onTransferAction: (transferId: string, action: "accept" | "decline" | "cancel") => void;
  onAfterInvite: () => Promise<void>;
}) {
  const { detail, currentUserId, onMemberAction, onDeleteGroup, onStartTransfer, onTransferAction, onAfterInvite } = props;
  const { group, isOwner, myStatus, members, pendingTransfers } = detail;
  const visibleMembers = members.filter(m => m.status === "invited" || m.status === "accepted");
  const incomingTransfer = pendingTransfers.find(t => t.toUserId === currentUserId);
  const outgoingTransfer = isOwner ? pendingTransfers.find(t => t.fromUserId === currentUserId) : undefined;
  // Only allow Delete when the Owner is the sole occupant — no other
  // users in invited or accepted state.
  const ownerIsAlone = visibleMembers.every(m => m.userId === group.ownerId);
  const canDeleteGroup = isOwner && !group.isOrgGroup && ownerIsAlone;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            {group.name}
            {group.isOrgGroup && (
              <span className="text-[9px] uppercase tracking-wide bg-purple-100 text-purple-700 rounded px-1.5 py-0.5">Org</span>
            )}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Owner: {group.ownerName ?? group.ownerEmail} <span className="text-gray-400">({group.ownerEmail})</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {!isOwner && myStatus === "accepted" && (
            <button onClick={() => onMemberAction(currentUserId, "leave")} className="text-xs text-red-600 border border-red-300 rounded px-2 py-1 hover:bg-red-50">
              Leave group
            </button>
          )}
          {!isOwner && myStatus === "invited" && (
            <>
              <button onClick={() => onMemberAction(currentUserId, "accept")} className="text-xs text-white bg-green-600 hover:bg-green-700 rounded px-2 py-1">
                Accept invite
              </button>
              <button onClick={() => onMemberAction(currentUserId, "decline")} className="text-xs text-gray-700 border border-gray-300 rounded px-2 py-1 hover:bg-gray-50">
                Decline
              </button>
            </>
          )}
          {canDeleteGroup && (
            <button
              onClick={onDeleteGroup}
              title="Only available when you are the sole member"
              className="text-xs text-red-600 border border-red-300 rounded px-2 py-1 hover:bg-red-50"
            >
              Delete group
            </button>
          )}
        </div>
      </div>

      {incomingTransfer && (
        <div className="border border-yellow-300 bg-yellow-50 rounded p-3">
          <p className="text-xs text-gray-800">
            <strong>{incomingTransfer.fromName ?? incomingTransfer.fromEmail}</strong> is offering you ownership of this group.
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <button onClick={() => onTransferAction(incomingTransfer.id, "accept")} className="text-xs text-white bg-blue-600 hover:bg-blue-700 rounded px-2 py-1">
              Accept ownership
            </button>
            <button onClick={() => onTransferAction(incomingTransfer.id, "decline")} className="text-xs text-gray-700 border border-gray-300 rounded px-2 py-1 hover:bg-gray-50">
              Decline
            </button>
          </div>
        </div>
      )}

      {outgoingTransfer && (
        <div className="border border-blue-300 bg-blue-50 rounded p-3 flex items-center justify-between">
          <p className="text-xs text-gray-800">
            Awaiting response from <strong>{outgoingTransfer.toName ?? outgoingTransfer.toEmail}</strong> for ownership transfer.
          </p>
          <button onClick={() => onTransferAction(outgoingTransfer.id, "cancel")} className="text-xs text-gray-700 border border-gray-300 rounded px-2 py-1 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      )}

      {isOwner && !group.isOrgGroup && (
        <InvitePanel groupId={group.id} onAfterInvite={onAfterInvite} />
      )}

      <div>
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Members</h3>
        <ul className="border border-gray-200 rounded divide-y divide-gray-100">
          {visibleMembers.map(m => (
            <li key={m.id} className="flex items-center gap-2 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 truncate">
                  {m.name ?? <em className="text-gray-400">No name</em>}
                  {m.userId === group.ownerId && <span className="ml-2 text-[10px] uppercase tracking-wide bg-blue-100 text-blue-800 rounded px-1.5 py-0.5">Owner</span>}
                </p>
                <p className="text-[10px] text-gray-500 truncate">{m.email}</p>
              </div>
              <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${STATUS_STYLE[m.status] ?? "bg-gray-100 text-gray-700"}`}>
                {m.status}
              </span>
              {isOwner && m.userId !== group.ownerId && !group.isOrgGroup && (
                <>
                  {m.status === "accepted" && (
                    <button onClick={() => onStartTransfer(m.userId)} title="Transfer ownership to this member" className="text-[10px] text-blue-600 hover:underline">
                      Transfer
                    </button>
                  )}
                  <button onClick={() => onMemberAction(m.userId, "remove")} className="text-[10px] text-red-600 hover:underline">
                    Remove
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function InvitePanel({ groupId, onAfterInvite }: { groupId: string; onAfterInvite: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [selected, setSelected] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) { setResults([]); return; }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}&excludeGroupId=${groupId}`);
        if (!res.ok) return;
        const data = await res.json();
        setResults(Array.isArray(data.users) ? data.users : []);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, groupId]);

  function addUser(u: UserSearchResult) {
    if (selected.some(s => s.id === u.id)) return;
    setSelected(prev => [...prev, u]);
    setQuery("");
    setResults([]);
  }
  function removeUser(id: string) {
    setSelected(prev => prev.filter(s => s.id !== id));
  }

  async function sendInvites() {
    if (selected.length === 0) return;
    setSending(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selected.map(s => s.id) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Invite failed (${res.status})`);
      }
      const data = await res.json();
      setMessage(`Invited ${data.invited} user(s)`);
      setSelected([]);
      await onAfterInvite();
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded p-3">
      <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Invite users</h3>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Type a name or email to invite…"
          className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
        />
        {results.length > 0 && (
          <ul className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded shadow z-10">
            {results.map(u => (
              <li key={u.id}>
                <button onClick={() => addUser(u)} className="w-full text-left px-2 py-1.5 hover:bg-blue-50 text-xs">
                  <div className="font-medium text-gray-900">{u.name ?? <em className="text-gray-400">No name</em>}</div>
                  <div className="text-[10px] text-gray-500">{u.email}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {searching && results.length === 0 && query.trim().length > 0 && (
          <p className="text-[10px] text-gray-400 italic mt-1">Searching…</p>
        )}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 mt-2">
          {selected.map(u => (
            <span key={u.id} className="text-[11px] bg-blue-100 text-blue-800 rounded-full px-2 py-0.5 inline-flex items-center gap-1">
              {u.name ?? u.email}
              <button onClick={() => removeUser(u.id)} className="hover:text-blue-900">{"✕"}</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={sendInvites}
          disabled={sending || selected.length === 0}
          className="text-xs text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded px-2.5 py-1"
        >
          {sending ? "Sending…" : `Send invite${selected.length === 1 ? "" : "s"}${selected.length > 0 ? ` (${selected.length})` : ""}`}
        </button>
        {message && <span className="text-[11px] text-gray-600">{message}</span>}
      </div>
    </div>
  );
}
