"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  typeLabel,
  categoryLabel,
  categoryChipStyle,
  ALL_CATEGORIES,
  daysAgo,
  diagramHrefForNotification,
} from "@/app/lib/notificationDisplay";

const ALL = "__all__";

interface NotifRow {
  id: string;
  type: string;
  createdAt: string;
  readAt: string | null;
  recipient: { id: string; name: string | null; email: string };
  recipientOrg: { id: string; name: string } | null;
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
  /** true → render as a modal overlay (bg-black/20) over the page behind
   *  it (the dashboard); false → render as a standalone light page (the
   *  /notifications route, which has nothing behind it). Default true. */
  overlay?: boolean;
  /** When provided (modal mode), Continue calls this instead of navigating. */
  onContinue?: () => void;
  /** Path that re-opens THIS view, used to build a diagram link's `?from=`
   *  so the back-link returns here. e.g. "/dashboard" for the dashboard
   *  modal, "/notifications" for the route. */
  selfPath?: string;
  /** Extra query param appended to selfPath to re-open the view (e.g.
   *  "notifications=1" for the dashboard modal). */
  selfExtraParam?: string;
}

export function NotificationsClient({
  currentUserId,
  initialAsUserId,
  adminScope,
  backHref,
  visitedDiagramId,
  overlay = true,
  onContinue,
  selfPath = "/notifications",
  selfExtraParam,
}: Props) {
  const router = useRouter();

  const [asUserId, setAsUserId] = useState(initialAsUserId);
  const [rows, setRows] = useState<NotifRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [audience, setAudience] = useState<AudienceUser[]>([]);
  const [orgFilter, setOrgFilter] = useState<string>("");

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

  useEffect(() => {
    if (!adminScope) return;
    fetch("/api/notifications/audience")
      .then(r => r.ok ? r.json() : { users: [] })
      .then(j => setAudience(j.users ?? []))
      .catch(() => { /* silent */ });
  }, [adminScope]);

  const isOwnFeed = asUserId === currentUserId;
  const viewingAll = asUserId === ALL;
  // Recipient + Org columns are only useful when the rows span more than
  // the caller themselves.
  const showRecipientCols = !isOwnFeed;

  async function markRead(id: string) {
    setRows(prev => prev?.map(r => r.id === id ? { ...r, readAt: r.readAt ?? new Date().toISOString() } : r) ?? prev);
    try { await fetch(`/api/notifications/${id}/read`, { method: "POST" }); } catch { /* best-effort */ }
  }
  async function markAllRead() {
    if (!isOwnFeed) return;
    setRows(prev => prev?.map(r => ({ ...r, readAt: r.readAt ?? new Date().toISOString() })) ?? prev);
    try { await fetch(`/api/notifications/mark-all-read`, { method: "POST" }); } catch { /* best-effort */ }
  }

  function notificationsBackHref(diagramId: string): string {
    const params = new URLSearchParams();
    if (selfExtraParam) {
      const [k, v] = selfExtraParam.split("=");
      params.set(k, v ?? "1");
    }
    params.set("visited", diagramId);
    if (!isOwnFeed) params.set("asUserId", asUserId);
    return `${selfPath}?${params.toString()}`;
  }

  const continueAction = () => { if (onContinue) onContinue(); else router.push(backHref); };

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
      // Org filter applies to the rows when viewing multiple users.
      if (orgFilter && r.recipientOrg?.id !== orgFilter) return false;
      if (n && !(r.sender?.name ?? "").toLowerCase().includes(n)) return false;
      if (e && !(r.sender?.email ?? "").toLowerCase().includes(e)) return false;
      if (d && !(r.diagram?.name ?? "").toLowerCase().includes(d)) return false;
      return true;
    });
  }, [rows, categoryFilter, orgFilter, nameFilter, emailFilter, diagramFilter]);

  const unreadCount = (rows ?? []).filter(r => !r.readAt).length;
  const viewedUser = audience.find(u => u.id === asUserId);
  const anyFilter = !!(categoryFilter || nameFilter || emailFilter || diagramFilter);
  const colCount = showRecipientCols ? 7 : 5;

  const headerSubtitle = isOwnFeed
    ? "Your notifications, newest first"
    : viewingAll
      ? (adminScope === "all" ? "All users' notifications" : "Your Org's notifications")
      : viewedUser
        ? `Viewing ${viewedUser.name ?? viewedUser.email}'s notifications`
        : "Notifications";

  return (
    <div className={
      overlay
        ? "fixed inset-0 bg-black/20 flex items-start justify-center z-50 p-4"
        : "min-h-screen dgx-dashboard-bg flex items-start justify-center p-4"
    }>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 shrink-0 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Notifications &amp; Feedback</h2>
            <p className="text-xs text-gray-600 mt-0.5">{headerSubtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            {isOwnFeed && unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline">
                Mark all {unreadCount} read
              </button>
            )}
            <button
              onClick={continueAction}
              className="px-3 py-1.5 text-xs font-medium text-white rounded bg-blue-600 hover:bg-blue-700"
            >
              Continue
            </button>
          </div>
        </div>

        {/* Admin pickers */}
        {adminScope && (
          <div className="px-6 py-2 border-b border-gray-100 shrink-0 flex flex-wrap items-center gap-2 bg-gray-50">
            <span className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">View</span>
            {adminScope === "all" && (
              <select
                value={orgFilter}
                onChange={e => setOrgFilter(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-800"
                title="Filter by Org"
              >
                <option value="">All Orgs</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            )}
            <select
              value={asUserId}
              onChange={e => setAsUserId(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-800 max-w-[22rem]"
              title="Whose notifications to load"
            >
              <option value={currentUserId}>My notifications</option>
              <option value={ALL}>{adminScope === "all" ? "All users" : "All Org members"}</option>
              <optgroup label="Specific user">
                {audienceForPicker.map(u => (
                  <option key={u.id} value={u.id}>{(u.name ?? u.email)} ({u.email})</option>
                ))}
              </optgroup>
            </select>
            {orgFilter && (
              <span className="text-[10px] text-gray-500">
                showing Org: {orgs.find(o => o.id === orgFilter)?.name}
              </span>
            )}
          </div>
        )}

        {/* Body — columnar table; filters in the header row align above
            the column each one filters. */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <table className="w-full table-fixed text-xs">
            <colgroup>
              <col style={{ width: showRecipientCols ? "20%" : "24%" }} />
              {showRecipientCols && <col style={{ width: "14%" }} />}
              {showRecipientCols && <col style={{ width: "12%" }} />}
              <col style={{ width: showRecipientCols ? "14%" : "17%" }} />
              {!showRecipientCols && <col style={{ width: "22%" }} />}
              <col style={{ width: showRecipientCols ? "20%" : "21%" }} />
              <col style={{ width: showRecipientCols ? "20%" : "16%" }} />
            </colgroup>
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="px-3 pt-2">Type</th>
                {showRecipientCols && <th className="px-3 pt-2">Recipient</th>}
                {showRecipientCols && <th className="px-3 pt-2">Org</th>}
                <th className="px-3 pt-2">Sender Name</th>
                {!showRecipientCols && <th className="px-3 pt-2">Sender Email</th>}
                <th className="px-3 pt-2">Diagram</th>
                <th className="px-3 pt-2 text-right">When</th>
              </tr>
              <tr className="border-b border-gray-200">
                <th className="px-3 pb-2 pt-1 font-normal">
                  <select
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded px-1.5 py-1 bg-white text-gray-800"
                  >
                    <option value="">All types</option>
                    {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </th>
                {showRecipientCols && <th className="px-3 pb-2 pt-1" />}
                {showRecipientCols && <th className="px-3 pb-2 pt-1" />}
                <th className="px-3 pb-2 pt-1 font-normal">
                  <input value={nameFilter} onChange={e => setNameFilter(e.target.value)} placeholder="Filter…"
                    className="w-full text-xs border border-gray-300 rounded px-1.5 py-1" />
                </th>
                {!showRecipientCols && (
                  <th className="px-3 pb-2 pt-1 font-normal">
                    <input value={emailFilter} onChange={e => setEmailFilter(e.target.value)} placeholder="Filter…"
                      className="w-full text-xs border border-gray-300 rounded px-1.5 py-1" />
                  </th>
                )}
                <th className="px-3 pb-2 pt-1 font-normal">
                  <input value={diagramFilter} onChange={e => setDiagramFilter(e.target.value)} placeholder="Filter…"
                    className="w-full text-xs border border-gray-300 rounded px-1.5 py-1" />
                </th>
                <th className="px-3 pb-2 pt-1 text-right font-normal">
                  {anyFilter && (
                    <button
                      onClick={() => { setCategoryFilter(""); setNameFilter(""); setEmailFilter(""); setDiagramFilter(""); }}
                      className="text-[11px] text-gray-500 hover:text-gray-800 underline"
                    >
                      Clear
                    </button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows === null && !error && (
                <tr><td colSpan={colCount} className="px-6 py-6 text-gray-400 italic">Loading…</td></tr>
              )}
              {error && (
                <tr><td colSpan={colCount} className="px-6 py-6 text-red-700">{error}</td></tr>
              )}
              {rows && filtered.length === 0 && !error && (
                <tr><td colSpan={colCount} className="px-6 py-6 text-gray-400 italic">No notifications match the current filters.</td></tr>
              )}
              {filtered.map(r => {
                const dgHref = r.diagram
                  ? diagramHrefForNotification(r.type, r.diagram.id, r.reviewId, notificationsBackHref(r.diagram.id))
                  : null;
                const isVisited = !!visitedDiagramId && r.diagram?.id === visitedDiagramId;
                const unread = !r.readAt;
                return (
                  <tr key={r.id} className={isVisited ? "bg-blue-100" : unread ? "bg-blue-50" : "hover:bg-gray-50"}>
                    {/* Type */}
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {unread && <span className="text-[8px] uppercase tracking-wide bg-blue-600 text-white rounded px-1 py-0.5 font-semibold">new</span>}
                        <span className={`text-[9px] uppercase tracking-wide rounded px-1 py-0.5 font-medium ${categoryChipStyle(r.type)}`}>
                          {categoryLabel(r.type)}
                        </span>
                      </div>
                      <div className="text-gray-900 font-medium mt-1">{typeLabel(r.type)}</div>
                      {(r.groupName || r.bundleName) && (
                        <div className="text-[10px] text-gray-500 mt-0.5 truncate">{r.groupName ?? r.bundleName}</div>
                      )}
                    </td>
                    {/* Recipient (admin) */}
                    {showRecipientCols && (
                      <td className="px-3 py-2 align-top text-gray-800 truncate" title={r.recipient.email}>
                        {r.recipient.name ?? r.recipient.email}
                        <div className="text-[10px] text-gray-400 truncate">{r.recipient.email}</div>
                      </td>
                    )}
                    {/* Org (admin) */}
                    {showRecipientCols && (
                      <td className="px-3 py-2 align-top text-gray-700 truncate" title={r.recipientOrg?.name ?? ""}>
                        {r.recipientOrg?.name ?? <span className="text-gray-400">—</span>}
                      </td>
                    )}
                    {/* Sender Name */}
                    <td className="px-3 py-2 align-top text-gray-800 truncate" title={r.sender?.email ?? ""}>
                      {r.sender?.name ?? r.sender?.email ?? <span className="text-gray-400">—</span>}
                    </td>
                    {/* Sender Email (personal view only) */}
                    {!showRecipientCols && (
                      <td className="px-3 py-2 align-top text-gray-700 truncate" title={r.sender?.email ?? ""}>
                        {r.sender?.email ?? <span className="text-gray-400">—</span>}
                      </td>
                    )}
                    {/* Diagram */}
                    <td className="px-3 py-2 align-top truncate">
                      {r.diagram ? (
                        dgHref ? (
                          <button
                            onClick={() => { markRead(r.id); router.push(dgHref); }}
                            className="text-blue-700 hover:underline font-medium truncate max-w-full text-left"
                            title={r.diagram.name}
                          >
                            {r.diagram.name}
                          </button>
                        ) : (
                          <span className="text-gray-800 font-medium">{r.diagram.name}</span>
                        )
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    {/* When */}
                    <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                      <div className="text-[11px] text-gray-700">{new Date(r.createdAt).toLocaleString()}</div>
                      <div className="text-[10px] text-gray-400">{daysAgo(r.createdAt)}</div>
                      {isOwnFeed && unread && (
                        <button onClick={() => markRead(r.id)} className="text-[10px] text-blue-600 hover:underline mt-0.5">
                          Mark read
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer — count only. */}
        <div className="px-6 py-2.5 border-t border-gray-200 shrink-0">
          <span className="text-[11px] text-gray-500">
            {rows ? `${filtered.length} of ${rows.length} shown${unreadCount > 0 && isOwnFeed ? ` · ${unreadCount} unread` : ""}` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
