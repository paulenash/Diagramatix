"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Send-for-Review dialog (Phase 2). The diagram owner picks one or more
 * Collaboration Groups they belong to, optionally trims the reviewer
 * list per group, writes an objective, and sets a due date. On send it
 * POSTs to /api/reviews (one DiagramReview per group). Diagramatix-native
 * — no browser dialogs.
 */

interface GroupRow {
  id: string;
  name: string;
  isOrgGroup: boolean;
  role: "owner" | "invited" | "member";
  myStatus: string;
  memberCount: number;
}

interface MemberRow {
  userId: string;
  name: string | null;
  email: string;
  status: string;
}

interface GroupPick {
  loaded: boolean;
  members: MemberRow[];          // accepted members (excl. self)
  selected: Set<string>;         // chosen reviewer userIds
}

function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10); // yyyy-mm-dd for <input type=date>
}

export function SendForReviewDialog({
  diagramId,
  diagramName,
  currentUserEmail,
  onClose,
  onSent,
}: {
  diagramId: string;
  diagramName: string;
  /** Used to drop the sender from the reviewer list; the API also
   *  excludes the requester server-side regardless. */
  currentUserEmail?: string;
  onClose: () => void;
  onSent: (summary: { reviews: number; reviewers: number }) => void;
}) {
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [picks, setPicks] = useState<Record<string, GroupPick>>({});
  const [objective, setObjective] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/groups");
        if (!res.ok) throw new Error(`Failed to load groups (${res.status})`);
        const data = await res.json();
        // Only groups the user can actually send to: owner or accepted.
        const usable = (data.groups ?? []).filter(
          (g: GroupRow) => g.role === "owner" || g.myStatus === "accepted",
        );
        setGroups(usable);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load groups");
      }
    })();
  }, []);

  const loadGroupMembers = useCallback(async (groupId: string) => {
    try {
      const res = await fetch(`/api/groups/${groupId}`);
      if (!res.ok) throw new Error(`Failed to load members (${res.status})`);
      const data = await res.json();
      const members: MemberRow[] = (data.members ?? [])
        .filter((m: MemberRow) => m.status === "accepted" && m.email !== currentUserEmail);
      setPicks((prev) => ({
        ...prev,
        [groupId]: { loaded: true, members, selected: new Set(members.map((m) => m.userId)) },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    }
  }, [currentUserEmail]);

  function toggleGroup(groupId: string) {
    setPicks((prev) => {
      const next = { ...prev };
      if (next[groupId]) {
        delete next[groupId];
      } else {
        next[groupId] = { loaded: false, members: [], selected: new Set() };
        loadGroupMembers(groupId);
      }
      return next;
    });
  }

  function toggleReviewer(groupId: string, userId: string) {
    setPicks((prev) => {
      const pick = prev[groupId];
      if (!pick) return prev;
      const selected = new Set(pick.selected);
      if (selected.has(userId)) selected.delete(userId); else selected.add(userId);
      return { ...prev, [groupId]: { ...pick, selected } };
    });
  }

  const chosenGroupIds = Object.keys(picks);
  const totalReviewers = chosenGroupIds.reduce((sum, gid) => sum + (picks[gid]?.selected.size ?? 0), 0);
  const canSend = !sending && objective.trim().length > 0 && !!dueDate && totalReviewers > 0;

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const body = {
        diagramId,
        objective: objective.trim(),
        dueDate: new Date(dueDate + "T12:00:00").toISOString(),
        groups: chosenGroupIds
          .map((groupId) => ({ groupId, reviewerUserIds: [...(picks[groupId]?.selected ?? [])] }))
          .filter((g) => g.reviewerUserIds.length > 0),
      };
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `Send failed (${res.status})`);
      }
      const data = await res.json();
      onSent({ reviews: data.reviews ?? 0, reviewers: data.reviewers ?? 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Send for Review</h3>
          <p className="text-[11px] text-gray-500 truncate">{diagramName}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1">Objective</label>
            <textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={2}
              placeholder="What should reviewers check? e.g. Verify the approval flow is complete."
              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1">Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1">Groups &amp; reviewers</label>
            {groups === null ? (
              <p className="text-xs text-gray-400 italic">Loading groups…</p>
            ) : groups.length === 0 ? (
              <p className="text-xs text-gray-400 italic">You&apos;re not in any groups you can send to.</p>
            ) : (
              <ul className="border border-gray-200 rounded divide-y divide-gray-100">
                {groups.map((g) => {
                  const pick = picks[g.id];
                  const checked = !!pick;
                  return (
                    <li key={g.id} className="px-2.5 py-1.5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={checked} onChange={() => toggleGroup(g.id)} />
                        <span className="text-xs text-gray-900 flex-1 truncate">{g.name}</span>
                        {g.isOrgGroup && (
                          <span className="text-[9px] uppercase tracking-wide bg-purple-100 text-purple-700 rounded px-1.5 py-0.5">Org</span>
                        )}
                      </label>
                      {checked && (
                        <div className="mt-1 ml-6">
                          {!pick.loaded ? (
                            <p className="text-[10px] text-gray-400 italic">Loading members…</p>
                          ) : pick.members.length === 0 ? (
                            <p className="text-[10px] text-gray-400 italic">No other accepted members to review.</p>
                          ) : (
                            <div className="space-y-0.5">
                              {pick.members.map((m) => (
                                <label key={m.userId} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={pick.selected.has(m.userId)}
                                    onChange={() => toggleReviewer(g.id, m.userId)}
                                  />
                                  <span className="text-[11px] text-gray-700 truncate">
                                    {m.name ?? m.email}
                                    <span className="text-gray-400"> · {m.email}</span>
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {error && <p className="text-xs text-red-700">{error}</p>}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
          <span className="text-[10px] text-gray-500">
            {totalReviewers > 0
              ? `${totalReviewers} reviewer${totalReviewers === 1 ? "" : "s"} across ${chosenGroupIds.length} group${chosenGroupIds.length === 1 ? "" : "s"}`
              : "Pick at least one reviewer"}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={send}
              disabled={!canSend}
              className="px-3 py-1.5 text-xs font-medium text-white rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? "Sending…" : "Send for Review"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
