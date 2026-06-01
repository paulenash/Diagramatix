"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * In-app notification bell. Polls /api/notifications?unread=1 on a
 * 60-second interval and renders a popover with the most recent
 * notifications. Each row dispatches to a renderer based on
 * `notification.type` and routes to the right destination.
 *
 * Phase 1 supports group-invite + ownership-transfer flows. New
 * notification types can be added by extending the `renderRow` switch.
 */

interface NotificationRow {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

const POLL_INTERVAL_MS = 60_000;

export function NotificationsBell({
  onNavigateToGroups,
}: {
  onNavigateToGroups: (groupId?: string) => void;
}) {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const fetchNotifications = useCallback(async (limit = 20) => {
    try {
      const res = await fetch(`/api/notifications?limit=${limit}`);
      if (!res.ok) return;
      const data = await res.json();
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
    } catch { /* offline — silent */ }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const iv = setInterval(() => fetchNotifications(), POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [fetchNotifications]);

  // Close popover on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!popoverRef.current) return;
      if (!popoverRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  async function markRead(id: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, readAt: new Date().toISOString() } : r));
    setUnreadCount(c => Math.max(0, c - 1));
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    } catch { /* will reconcile on next poll */ }
  }

  async function markAllRead() {
    setRows(prev => prev.map(r => r.readAt ? r : { ...r, readAt: new Date().toISOString() }));
    setUnreadCount(0);
    try {
      await fetch("/api/notifications/mark-all-read", { method: "POST" });
    } catch { /* ignore */ }
  }

  function renderRow(r: NotificationRow): { label: string; sublabel?: string; onClick?: () => void } {
    const p = r.payload as Record<string, string | undefined>;
    const groupName = p.groupName ?? "(group)";
    const fromName = p.fromUserName ?? p.fromUserEmail ?? "Someone";
    switch (r.type) {
      case "group-invite":
        return {
          label: `${fromName} invited you to "${groupName}"`,
          sublabel: "Click to view and accept / decline",
          onClick: () => { onNavigateToGroups(p.groupId); markRead(r.id); setOpen(false); },
        };
      case "group-invite-accepted":
        return {
          label: `${fromName} accepted your invite to "${groupName}"`,
          onClick: () => { onNavigateToGroups(p.groupId); markRead(r.id); setOpen(false); },
        };
      case "group-invite-declined":
        return {
          label: `${fromName} declined your invite to "${groupName}"`,
          onClick: () => { onNavigateToGroups(p.groupId); markRead(r.id); setOpen(false); },
        };
      case "group-removed":
        return {
          label: `${fromName} removed you from "${groupName}"`,
          onClick: () => { markRead(r.id); setOpen(false); },
        };
      case "ownership-transfer":
        return {
          label: `${fromName} offered you ownership of "${groupName}"`,
          sublabel: "Click to accept / decline",
          onClick: () => { onNavigateToGroups(p.groupId); markRead(r.id); setOpen(false); },
        };
      case "ownership-transfer-accepted":
        return {
          label: `${fromName} accepted ownership of "${groupName}"`,
          onClick: () => { onNavigateToGroups(p.groupId); markRead(r.id); setOpen(false); },
        };
      case "ownership-transfer-declined":
        return {
          label: `${fromName} declined ownership of "${groupName}"`,
          onClick: () => { onNavigateToGroups(p.groupId); markRead(r.id); setOpen(false); },
        };
      // Phase 2 — Send for Review. Clicking opens the diagram.
      case "diagram-review-requested": {
        const diagramName = p.diagramName ?? "a diagram";
        return {
          label: `${fromName} asked you to review "${diagramName}"`,
          sublabel: "Click to open in Review Mode",
          onClick: () => {
            markRead(r.id); setOpen(false);
            if (p.diagramId) {
              window.location.href = p.reviewId
                ? `/diagram/${p.diagramId}?review=${p.reviewId}`
                : `/diagram/${p.diagramId}`;
            }
          },
        };
      }
      case "diagram-review-submitted":
      case "diagram-review-approved":
      case "diagram-review-declined": {
        const diagramName = p.diagramName ?? "a diagram";
        const verb = r.type === "diagram-review-submitted" ? "submitted their review of"
          : r.type === "diagram-review-approved" ? "approved"
          : "declined to review";
        return {
          label: `${fromName} ${verb} "${diagramName}"`,
          onClick: () => { markRead(r.id); setOpen(false); if (p.diagramId) window.location.href = `/diagram/${p.diagramId}`; },
        };
      }
      default:
        return { label: r.type };
    }
  }

  function timeAgo(iso: string): string {
    const d = new Date(iso).getTime();
    const delta = Math.max(0, Date.now() - d);
    const s = Math.floor(delta / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const days = Math.floor(h / 24);
    return `${days}d`;
  }

  return (
    <div ref={popoverRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center justify-center w-8 h-8 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded"
        title={unreadCount === 0 ? "No new notifications" : `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
        aria-label="Notifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-semibold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-[480px] bg-white border border-gray-200 rounded shadow-lg z-50">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <span className="text-xs font-semibold text-gray-700">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-[10px] text-blue-600 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {rows.length === 0 ? (
              <p className="text-xs text-gray-400 italic p-3">No notifications yet.</p>
            ) : (
              rows.map(r => {
                const view = renderRow(r);
                const unread = r.readAt == null;
                return (
                  <button
                    key={r.id}
                    onClick={view.onClick ?? (() => markRead(r.id))}
                    className={`w-full text-left px-3 py-2 border-b border-gray-100 hover:bg-gray-50 flex items-start gap-2 ${unread ? "bg-blue-50/50" : ""}`}
                  >
                    <span className={`mt-1 inline-block w-2 h-2 rounded-full shrink-0 ${unread ? "bg-blue-500" : "bg-transparent"}`} />
                    <div className="flex-1 min-w-0">
                      {/* Two-line layout: label on top, optional sublabel below.
                          Each line is clamp-2 so an unusually long label still
                          stays bounded but every relevant word is visible. */}
                      <p className="text-xs text-gray-800 line-clamp-2 break-words">{view.label}</p>
                      {view.sublabel && (
                        <p className="text-[10px] text-gray-500 line-clamp-2 break-words mt-0.5">
                          {view.sublabel}
                        </p>
                      )}
                    </div>
                    <span className="text-[9px] text-gray-400 shrink-0">{timeAgo(r.createdAt)}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
