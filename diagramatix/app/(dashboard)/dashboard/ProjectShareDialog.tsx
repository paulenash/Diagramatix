"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertDialog } from "@/app/components/AlertDialog";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

/**
 * Project share-management dialog.
 *
 * Owner-only — gated by the "Manage Sharing" button on the sidebar and
 * re-checked server-side on every action. Visual conventions match the
 * existing Diagramatix dialogs (LinkScanDialog, RemoveSpaceDialog,
 * import dialogs): black/40 overlay → white rounded card → gray header
 * → space-y body → border-top footer with secondary/primary buttons.
 *
 * Three panes:
 *   • A debounced search box that calls /api/projects/[id]/share-candidates
 *     and lists up to 20 matching users. Click to share at the currently
 *     selected role (VIEW by default).
 *   • The current shares list — one row per recipient, with an inline
 *     VIEW/EDIT toggle (calls PUT) and a remove button (calls DELETE).
 *   • Inline error/info dialogs reuse the global AlertDialog component —
 *     never window.alert, per [[no-browser-dialogs]].
 *
 * Optimistic UI throughout: every mutation updates local state first
 * then rolls back on failure (showing an AlertDialog with the error).
 */

interface CandidateUser {
  id: string;
  name: string | null;
  email: string;
}

interface ShareRow {
  id: string;
  role: "VIEW" | "EDIT";
  createdAt: string;
  user: { id: string; name: string | null; email: string };
}

interface Props {
  projectId: string;
  projectName: string;
  /** Used to filter the owner out of the visible shares list — server
   *  already excludes them, but defence-in-depth costs nothing here. */
  ownerUserId: string | null;
  onClose: () => void;
}

export function ProjectShareDialog({ projectId, projectName, ownerUserId, onClose }: Props) {
  const [shares, setShares] = useState<ShareRow[] | null>(null);
  const [candidates, setCandidates] = useState<CandidateUser[]>([]);
  const [query, setQuery] = useState("");
  // Role applied when picking a candidate from the search list. Toggle
  // before clicking — matches the mental model "I want to give these
  // people view access".
  const [newRole, setNewRole] = useState<"VIEW" | "EDIT">("VIEW");
  const [loadingShares, setLoadingShares] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<ShareRow | null>(null);
  // Confirm for the bulk Stop Sharing action. Separate state slot from
  // confirmRemove so the two confirms never collide.
  const [confirmStopSharing, setConfirmStopSharing] = useState(false);
  const [stopSharingBusy, setStopSharingBusy] = useState(false);

  // ── Initial shares fetch ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingShares(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/shares`);
        if (!res.ok) throw new Error((await res.text()) || res.statusText);
        const rows = (await res.json()) as ShareRow[];
        if (!cancelled) setShares(rows.filter(s => s.user.id !== ownerUserId));
      } catch (err) {
        if (!cancelled) {
          setShares([]);
          setAlert({ title: "Failed to load shares", message: err instanceof Error ? err.message : String(err) });
        }
      } finally {
        if (!cancelled) setLoadingShares(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, ownerUserId]);

  // ── Debounced candidate search ────────────────────────────────────
  // 250 ms after the user stops typing, fetch matching candidates.
  // Aborts in-flight previous requests so a slow earlier query can't
  // overwrite a fast later one.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setSearching(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/share-candidates?q=${encodeURIComponent(query)}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) throw new Error((await res.text()) || res.statusText);
        const rows = (await res.json()) as CandidateUser[];
        if (!ctrl.signal.aborted) setCandidates(rows);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Don't pop an AlertDialog for routine search failures — leave
        // the existing list visible and silently ignore. Network blips
        // shouldn't interrupt the share workflow.
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [projectId, query]);

  // ── Mutations ─────────────────────────────────────────────────────

  /** Share with a brand-new user. Optimistic insert + rollback on failure. */
  const addShare = useCallback(async (user: CandidateUser) => {
    setBusyUserId(user.id);
    // Optimistic insert. We don't have id/createdAt yet, so synthesise a
    // tombstone — the refetch on close replaces it with the real row.
    const optimistic: ShareRow = {
      id: `optimistic-${user.id}`,
      role: newRole,
      createdAt: new Date().toISOString(),
      user,
    };
    setShares(prev => prev ? [...prev, optimistic] : [optimistic]);
    // Remove from the candidate list so the user can't double-click.
    setCandidates(prev => prev.filter(c => c.id !== user.id));
    try {
      const res = await fetch(`/api/projects/${projectId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIdOrEmail: user.id, role: newRole }),
      });
      if (!res.ok) throw new Error((await res.text()) || res.statusText);
      const real = (await res.json()) as ShareRow;
      setShares(prev => prev ? prev.map(s => s.id === optimistic.id ? real : s) : [real]);
    } catch (err) {
      // Roll back the optimistic insert and put the candidate back.
      setShares(prev => prev ? prev.filter(s => s.id !== optimistic.id) : prev);
      setCandidates(prev => [user, ...prev]);
      setAlert({ title: "Could not share project", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusyUserId(null);
    }
  }, [projectId, newRole]);

  /** Change an existing share's role. Optimistic swap + rollback on failure. */
  const changeRole = useCallback(async (share: ShareRow, role: "VIEW" | "EDIT") => {
    if (share.role === role) return;
    setBusyUserId(share.user.id);
    const previous = share.role;
    setShares(prev => prev ? prev.map(s => s.id === share.id ? { ...s, role } : s) : prev);
    try {
      const res = await fetch(`/api/projects/${projectId}/shares/${share.user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error((await res.text()) || res.statusText);
    } catch (err) {
      setShares(prev => prev ? prev.map(s => s.id === share.id ? { ...s, role: previous } : s) : prev);
      setAlert({ title: "Could not change role", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusyUserId(null);
    }
  }, [projectId]);

  /** Remove a share. Optimistic removal + rollback on failure. */
  const removeShare = useCallback(async (share: ShareRow) => {
    setConfirmRemove(null);
    setBusyUserId(share.user.id);
    const snapshot = shares;
    setShares(prev => prev ? prev.filter(s => s.id !== share.id) : prev);
    try {
      const res = await fetch(`/api/projects/${projectId}/shares/${share.user.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.text()) || res.statusText);
    } catch (err) {
      // Rollback — restore the entire shares snapshot. Cheaper than
      // tracking the index of the removed row.
      setShares(snapshot);
      setAlert({ title: "Could not remove share", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusyUserId(null);
    }
  }, [projectId, shares]);

  /** Bulk-remove every share at once. Optimistic — empty the list,
   *  call the bulk DELETE endpoint, restore on failure. */
  const stopSharing = useCallback(async () => {
    setConfirmStopSharing(false);
    setStopSharingBusy(true);
    const snapshot = shares;
    setShares([]);
    try {
      const res = await fetch(`/api/projects/${projectId}/shares`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.text()) || res.statusText);
    } catch (err) {
      setShares(snapshot);
      setAlert({ title: "Could not stop sharing", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setStopSharingBusy(false);
    }
  }, [projectId, shares]);

  // ── Render ────────────────────────────────────────────────────────

  // IDs already shared — used to hide duplicates from the candidate list
  // (the server already excludes them, but the client's search list can
  // race ahead of an optimistic insert).
  const sharedIds = new Set(shares?.map(s => s.user.id) ?? []);

  return (
    <>
      <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">

          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 shrink-0">
            <h2 className="text-lg font-semibold text-gray-900">Share Project</h2>
            <p className="text-xs text-gray-500 mt-1 truncate" title={projectName}>
              {projectName}
            </p>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 min-h-0">

            {/* Add-people pane */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Add people
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search by name or email"
                  className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value as "VIEW" | "EDIT")}
                  className="px-2 py-1.5 text-xs border border-gray-300 rounded bg-white"
                  title="Role applied when you pick a person"
                >
                  <option value="VIEW">View</option>
                  <option value="EDIT">Edit</option>
                </select>
              </div>
              <div className="border border-gray-200 rounded max-h-40 overflow-y-auto">
                {searching && (
                  <p className="text-[11px] text-gray-400 italic px-3 py-2">Searching…</p>
                )}
                {!searching && candidates.filter(c => !sharedIds.has(c.id)).length === 0 && (
                  <p className="text-[11px] text-gray-400 italic px-3 py-2">
                    {query.trim() ? "No matches." : "Start typing to find users."}
                  </p>
                )}
                {!searching && candidates
                  .filter(c => !sharedIds.has(c.id))
                  .map(c => (
                    <button
                      key={c.id}
                      onClick={() => addShare(c)}
                      disabled={busyUserId === c.id}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50 flex items-center justify-between gap-2 border-b border-gray-100 last:border-b-0"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="font-medium text-gray-800 truncate block">
                          {(c.name ?? "").trim() || c.email}
                        </span>
                        <span className="text-[10px] text-gray-500 truncate block">{c.email}</span>
                      </span>
                      <span className="text-[10px] text-blue-600 shrink-0">
                        + {newRole === "EDIT" ? "Edit" : "View"}
                      </span>
                    </button>
                  ))}
              </div>
            </div>

            {/* Current shares pane */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Shared with {shares?.length ?? 0}
              </label>
              {loadingShares ? (
                <p className="text-[11px] text-gray-400 italic">Loading…</p>
              ) : !shares || shares.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic px-1">Not shared with anyone yet.</p>
              ) : (
                <ul className="border border-gray-200 rounded divide-y divide-gray-100">
                  {shares.map(s => (
                    <li
                      key={s.id}
                      className="px-3 py-2 flex items-center gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate" title={s.user.email}>
                          {(s.user.name ?? "").trim() || s.user.email}
                        </p>
                        <p className="text-[10px] text-gray-500 truncate">{s.user.email}</p>
                      </div>
                      <select
                        value={s.role}
                        onChange={e => changeRole(s, e.target.value as "VIEW" | "EDIT")}
                        disabled={busyUserId === s.user.id}
                        className="text-[11px] border border-gray-300 rounded px-1.5 py-0.5 bg-white disabled:opacity-50"
                      >
                        <option value="VIEW">View</option>
                        <option value="EDIT">Edit</option>
                      </select>
                      <button
                        onClick={() => setConfirmRemove(s)}
                        disabled={busyUserId === s.user.id}
                        className="text-gray-400 hover:text-red-600 disabled:opacity-50 text-xs px-1"
                        title="Remove this share"
                      >
                        {"✕"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between gap-2 px-6 py-3 border-t border-gray-100 shrink-0">
            {/* Left side: Stop Sharing — destructive, removes every
                share row in one call. Hidden when there's nothing to
                stop (no share rows). */}
            {shares && shares.length > 0 ? (
              <button
                onClick={() => setConfirmStopSharing(true)}
                disabled={stopSharingBusy}
                className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded disabled:opacity-50"
                title="Remove every share on this project"
              >
                Stop Sharing
              </button>
            ) : (
              <span />
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {confirmRemove && (
        <ConfirmDialog
          title="Remove share"
          message={`Remove ${(confirmRemove.user.name ?? "").trim() || confirmRemove.user.email} from this project? They will lose access immediately.`}
          confirmLabel="Remove"
          destructive
          onConfirm={() => removeShare(confirmRemove)}
          onCancel={() => setConfirmRemove(null)}
        />
      )}

      {confirmStopSharing && (
        <ConfirmDialog
          title="Stop sharing this project?"
          message={`Remove every share on "${projectName}" (${shares?.length ?? 0} recipient${(shares?.length ?? 0) === 1 ? "" : "s"}). Everyone will lose access immediately. You can re-share later if needed.`}
          confirmLabel="Stop Sharing"
          destructive
          onConfirm={() => stopSharing()}
          onCancel={() => setConfirmStopSharing(false)}
        />
      )}

      {alert && (
        <AlertDialog
          title={alert.title}
          message={alert.message}
          onClose={() => setAlert(null)}
        />
      )}
    </>
  );
}
