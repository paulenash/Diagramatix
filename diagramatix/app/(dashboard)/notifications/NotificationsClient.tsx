"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  typeLabel,
  categoryLabel,
  ALL_CATEGORIES,
  daysAgo,
  diagramHrefForNotification,
} from "@/app/lib/notificationDisplay";

interface NotifRow {
  id: string;
  type: string;
  createdAt: string;
  readAt: string | null;
  recipient: { id: string; name: string | null; email: string };
  sender: { id: string; name: string | null; email: string } | null;
  diagram: { id: string; name: string } | null;
  reviewId: string | null;
  groupName: string | null;
  bundleName: string | null;
}

interface AudienceUser {
  id: string;
  name: string | null;
  email: string;
  orgId: string | null;
  orgName: string | null;
}

interface Props {
  currentUserId: string;
  currentUserName: string | null;
  currentUserEmail: string;
  initialAsUserId: string;
  adminScope: "all" | "org" | null;
  backHref: string;
  visitedDiagramId: string | null;
}

export function NotificationsClient({
  currentUserId,
  initialAsUserId,
  adminScope,
  backHref,
  visitedDiagramId,
}: Props) {
  const router = useRouter();

  const [asUserId, setAsUserId] = useState(initialAsUserId);
  const [rows, setRows] = useState<NotifRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Admin pickers
  const [audience, setAudience] = useState<AudienceUser[]>([]);
  const [orgFilter, setOrgFilter] = useState<string>(""); // SuperAdmin org narrowing

  // Content filters
  const [categoryFilter, setCategoryFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [emailFilter, setEmailFilter] = useState("");
  const [diagramFilter, setDiagramFilter] = useState("");

  const loadRows = useCallback(async (uid: string) => {
    setRows(null);
    setError(null);
    try {
      const res = await fetch(`/api/notifications/list?asUserId=${encodeURIComponent(uid)}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: res.statusText }));
        setError(e.error ?? `Failed (${res.status})`);
        setRows([]);
        return;
      }
      const j = await res.json();
      setRows(j.rows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setRows([]);
    }
  }, []);

  useEffect(() => { loadRows(asUserId); }, [asUserId, loadRows]);

  // Load the admin audience once (if the caller is an admin).
  useEffect(() => {
    if (!adminScope) return;
    fetch("/api/notifications/audience")
      .then(r => r.ok ? r.json() : { users: [] })
      .then(j => setAudience(j.users ?? []))
      .catch(() => { /* silent */ });
  }, [adminScope]);

  async function markRead(id: string) {
    setRows(prev => prev?.map(r => r.id === id ? { ...r, readAt: r.readAt ?? new Date().toISOString() } : r) ?? prev);
    try { await fetch(`/api/notifications/${id}/read`, { method: "POST" }); } catch { /* best-effort */ }
  }
  async function markAllRead() {
    if (asUserId !== currentUserId) return; // only your own feed
    setRows(prev => prev?.map(r => ({ ...r, readAt: r.readAt ?? new Date().toISOString() })) ?? prev);
    try { await fetch(`/api/notifications/mark-all-read`, { method: "POST" }); } catch { /* best-effort */ }
  }

  // The back href a diagram link should carry so "← Notifications" returns
  // here with the row highlighted (and the same admin target preserved).
  function notificationsBackHref(diagramId: string): string {
    const params = new URLSearchParams();
    params.set("visited", diagramId);
    if (asUserId !== currentUserId) params.set("asUserId", asUserId);
    return `/notifications?${params.toString()}`;
  }

  // Distinct orgs for the SuperAdmin org dropdown.
  const orgs = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of audience) if (u.orgId && u.orgName) m.set(u.orgId, u.orgName);
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [audience]);

  const audienceForPicker = useMemo(
    () => orgFilter ? audience.filter(u => u.orgId === orgFilter) : audience,
    [audience, orgFilter],
  );

  const filtered = useMemo(() => {
    if (!rows) return [];
    const n = nameFilter.trim().toLowerCase();
    const e = emailFilter.trim().toLowerCase();
    const d = diagramFilter.trim().toLowerCase();
    return rows.filter(r => {
      if (categoryFilter && categoryLabel(r.type) !== categoryFilter) return false;
      if (n) {
        const hay = `${r.sender?.name ?? ""} ${r.recipient.name ?? ""}`.toLowerCase();
        if (!hay.includes(n)) return false;
      }
      if (e) {
        const hay = `${r.sender?.email ?? ""} ${r.recipient.email}`.toLowerCase();
        if (!hay.includes(e)) return false;
      }
      if (d) {
        if (!(r.diagram?.name ?? "").toLowerCase().includes(d)) return false;
      }
      return true;
    });
  }, [rows, categoryFilter, nameFilter, emailFilter, diagramFilter]);

  const viewingOther = asUserId !== currentUserId;
  const viewedUser = audience.find(u => u.id === asUserId);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 shrink-0 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Notifications &amp; Feedback</h2>
            <p className="text-xs text-gray-600 mt-0.5">
              {viewingOther && viewedUser
                ? `Viewing ${viewedUser.name ?? viewedUser.email}'s notifications`
                : "Your notifications, newest first"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {asUserId === currentUserId && (
              <button
                onClick={markAllRead}
                className="text-xs text-blue-600 hover:underline"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={() => router.push(backHref)}
              className="px-3 py-1.5 text-xs font-medium text-white rounded bg-blue-600 hover:bg-blue-700"
            >
              Continue
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-gray-100 shrink-0 flex flex-wrap items-center gap-2">
          {/* Admin: org + user pickers */}
          {adminScope === "all" && (
            <select
              value={orgFilter}
              onChange={e => { setOrgFilter(e.target.value); }}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-800"
              title="Filter by Org"
            >
              <option value="">All Orgs</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          {adminScope && (
            <select
              value={asUserId}
              onChange={e => setAsUserId(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-800 max-w-[16rem]"
              title="View a user's notifications"
            >
              <option value={currentUserId}>My notifications</option>
              {audienceForPicker.map(u => (
                <option key={u.id} value={u.id}>
                  {(u.name ?? u.email)} ({u.email})
                </option>
              ))}
            </select>
          )}

          {/* Content filters */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-800"
            title="Filter by type"
          >
            <option value="">All types</option>
            {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
            placeholder="Name…"
            className="text-xs border border-gray-300 rounded px-2 py-1 w-28"
          />
          <input
            value={emailFilter}
            onChange={e => setEmailFilter(e.target.value)}
            placeholder="Email…"
            className="text-xs border border-gray-300 rounded px-2 py-1 w-36"
          />
          <input
            value={diagramFilter}
            onChange={e => setDiagramFilter(e.target.value)}
            placeholder="Diagram…"
            className="text-xs border border-gray-300 rounded px-2 py-1 w-32"
          />
          {(categoryFilter || nameFilter || emailFilter || diagramFilter) && (
            <button
              onClick={() => { setCategoryFilter(""); setNameFilter(""); setEmailFilter(""); setDiagramFilter(""); }}
              className="text-[11px] text-gray-500 hover:text-gray-800 underline"
            >
              Clear
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {rows === null && !error && (
            <p className="p-6 text-xs text-gray-400 italic">Loading…</p>
          )}
          {error && <p className="p-6 text-xs text-red-700">{error}</p>}
          {rows && filtered.length === 0 && !error && (
            <p className="p-6 text-xs text-gray-400 italic">No notifications match the current filters.</p>
          )}
          {filtered.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {filtered.map(r => {
                const dgHref = r.diagram
                  ? diagramHrefForNotification(r.type, r.diagram.id, r.reviewId, notificationsBackHref(r.diagram.id))
                  : null;
                const isVisited = !!visitedDiagramId && r.diagram?.id === visitedDiagramId;
                return (
                  <li
                    key={r.id}
                    className={`px-6 py-3 ${isVisited ? "bg-blue-50" : r.readAt ? "" : "bg-blue-50/30"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-700 rounded px-1.5 py-0.5 font-medium">
                            {categoryLabel(r.type)}
                          </span>
                          <span className="text-xs font-medium text-gray-900">{typeLabel(r.type)}</span>
                          {!r.readAt && (
                            <span className="text-[9px] uppercase tracking-wide bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">new</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-700 mt-1">
                          {r.sender && (
                            <>
                              From <span className="font-medium">{r.sender.name ?? r.sender.email}</span>
                              <span className="text-gray-500"> &lt;{r.sender.email}&gt;</span>
                            </>
                          )}
                          {r.groupName && <span className="text-gray-500"> · {r.groupName}</span>}
                          {r.bundleName && <span className="text-gray-500"> · {r.bundleName}</span>}
                        </div>
                        {r.diagram && (
                          <div className="text-xs mt-1">
                            Diagram:{" "}
                            {dgHref ? (
                              <button
                                onClick={() => { markRead(r.id); router.push(dgHref); }}
                                className="text-blue-700 hover:underline font-medium"
                              >
                                {r.diagram.name}
                              </button>
                            ) : (
                              <span className="text-gray-800 font-medium">{r.diagram.name}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[11px] text-gray-700">{new Date(r.createdAt).toLocaleString()}</div>
                        <div className="text-[10px] text-gray-400">{daysAgo(r.createdAt)}</div>
                        {asUserId === currentUserId && !r.readAt && (
                          <button
                            onClick={() => markRead(r.id)}
                            className="text-[10px] text-blue-600 hover:underline mt-1"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 shrink-0 flex items-center justify-between">
          <span className="text-[11px] text-gray-500">
            {rows ? `${filtered.length} of ${rows.length} shown` : ""}
          </span>
          <button
            onClick={() => router.push(backHref)}
            className="px-3 py-1.5 text-xs font-medium text-white rounded bg-blue-600 hover:bg-blue-700"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
