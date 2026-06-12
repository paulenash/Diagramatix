"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * In-app notification bell. Polls /api/notifications?unread=1 on a
 * 60-second interval for the unread count and renders a bell button with
 * a badge. Clicking calls `onOpen` — the dashboard opens the full
 * "Notifications & Feedback" panel as a modal over itself (so the
 * dashboard shows behind it, shaded). The bell always opens the user's
 * OWN feed; the all-Org / all-users views live behind the admin menus.
 */
const POLL_INTERVAL_MS = 60_000;

export function NotificationsBell({
  onOpen,
}: {
  onOpen: () => void;
}) {
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?unread=1&limit=1`);
      if (!res.ok) return;
      const data = await res.json();
      setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
    } catch { /* offline — silent */ }
  }, []);

  useEffect(() => {
    fetchUnread();
    const iv = setInterval(fetchUnread, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [fetchUnread]);

  return (
    <button
      onClick={onOpen}
      className="relative flex items-center justify-center w-8 h-8 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded"
      title={unreadCount === 0 ? "Notifications" : `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
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
  );
}
