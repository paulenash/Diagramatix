"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Admin-only notifications inspector. Bell-icon button in the admin
 * header; click opens a modal listing every Notification in the system
 * newest first. The admin can filter by recipient and dismiss the list
 * with Continue. View-only — no actions.
 */

interface AdminNotifRow {
  id: string;
  type: string;
  createdAt: string;
  readAt: string | null;
  recipient: { id: string; name: string | null; email: string };
  sender: { id: string; name: string | null; email: string } | null;
  groupId: string | null;
  groupName: string | null;
}

interface RecipientOption {
  id: string;
  name: string | null;
  email: string;
}

const TYPE_LABEL: Record<string, string> = {
  "group-invite": "Group invite",
  "group-invite-accepted": "Group invite accepted",
  "group-invite-declined": "Group invite declined",
  "group-removed": "Removed from group",
  "ownership-transfer": "Ownership transfer offered",
  "ownership-transfer-accepted": "Ownership transfer accepted",
  "ownership-transfer-declined": "Ownership transfer declined",
};

function displayName(u: { name: string | null; email: string } | null): string {
  if (!u) return "—";
  return u.name ?? u.email;
}

export function AdminNotificationsButton() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AdminNotifRow[] | null>(null);
  const [recipients, setRecipients] = useState<RecipientOption[]>([]);
  const [filterRecipientId, setFilterRecipientId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setRows(null);
    try {
      const url = filterRecipientId
        ? `/api/admin/notifications?recipientUserId=${encodeURIComponent(filterRecipientId)}`
        : `/api/admin/notifications`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = await res.json();
      setRows(Array.isArray(data.rows) ? data.rows : []);
      // Recipients list only meaningful on the unfiltered fetch.
      if (!filterRecipientId && Array.isArray(data.recipients)) {
        setRecipients(data.recipients);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    }
  }, [filterRecipientId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="View all system notifications (admin)"
        aria-label="Admin notifications"
        className="relative flex items-center justify-center w-8 h-8 text-orange-600 border border-orange-300 hover:bg-orange-50 rounded"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">All notifications</h3>
                <p className="text-[10px] text-gray-500">
                  Newest first. View-only — admin can inspect but not act on them.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-gray-500">Filter by recipient</label>
                <select
                  value={filterRecipientId}
                  onChange={(e) => setFilterRecipientId(e.target.value)}
                  className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                >
                  <option value="">All users</option>
                  {recipients.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name ?? u.email} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {rows === null && !error ? (
                <p className="p-4 text-xs text-gray-400 italic">Loading…</p>
              ) : error ? (
                <p className="p-4 text-xs text-red-700">{error}</p>
              ) : rows && rows.length === 0 ? (
                <p className="p-4 text-xs text-gray-400 italic">No notifications match the current filter.</p>
              ) : (
                <table className="w-full text-xs table-fixed">
                  <thead className="sticky top-0 bg-gray-50 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2" style={{ width: "16%" }}>When</th>
                      <th className="px-3 py-2" style={{ width: "22%" }}>Type</th>
                      <th className="px-3 py-2" style={{ width: "20%" }}>Sender</th>
                      <th className="px-3 py-2" style={{ width: "20%" }}>Recipient</th>
                      <th className="px-3 py-2" style={{ width: "16%" }}>Group</th>
                      <th className="px-3 py-2 text-center" style={{ width: "6%" }}>Read</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows!.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-gray-800">
                          {TYPE_LABEL[r.type] ?? r.type}
                        </td>
                        <td className="px-3 py-2 text-gray-700 truncate" title={r.sender?.email ?? ""}>
                          {r.sender ? (
                            <>
                              {displayName(r.sender)}
                              <div className="text-[10px] text-gray-400 truncate">{r.sender.email}</div>
                            </>
                          ) : (
                            <span className="text-gray-400 italic">system</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-700 truncate" title={r.recipient.email}>
                          {displayName(r.recipient)}
                          <div className="text-[10px] text-gray-400 truncate">{r.recipient.email}</div>
                        </td>
                        <td className="px-3 py-2 text-gray-600 truncate">
                          {r.groupName ?? <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.readAt ? (
                            <span className="text-[9px] uppercase tracking-wide bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">read</span>
                          ) : (
                            <span className="text-[9px] uppercase tracking-wide bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">new</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
              <span className="text-[10px] text-gray-500">
                {rows ? `${rows.length} notification(s) shown` : ""}
              </span>
              <button
                onClick={() => setOpen(false)}
                autoFocus
                className="px-3 py-1.5 text-xs font-medium text-white rounded bg-blue-600 hover:bg-blue-700"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
