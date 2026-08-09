"use client";

/**
 * Account-settings control for the per-user "bring-your-own SharePoint"
 * connection. Reads GET /api/microsoft/status (booleans + UPN only — never a
 * token) and offers Connect (→ the standalone OAuth flow) or Disconnect. This is
 * the canonical connect surface; the SharePoint picker's empty state is the
 * reactive entry point when a browse hits 403.
 */
import { useCallback, useEffect, useState } from "react";

interface Status { connected: boolean; accountUpn?: string; accountName?: string }

export function MicrosoftConnectionSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/microsoft/status");
      if (r.ok) setStatus(await r.json());
    } catch { /* leave prior status */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const connect = () => {
    window.location.href = "/api/microsoft/connect?returnTo=" + encodeURIComponent(window.location.href);
  };
  const disconnect = async () => {
    setBusy(true);
    try { await fetch("/api/microsoft/disconnect", { method: "POST" }); await load(); }
    finally { setBusy(false); }
  };

  return (
    <div className="border-t border-gray-100 pt-3">
      <p className="text-xs font-medium text-gray-700 mb-2">SharePoint / Microsoft 365</p>
      {status?.connected ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-gray-600 truncate">
            Connected as <span className="font-medium text-gray-800">{status.accountUpn}</span>
          </p>
          <button onClick={disconnect} disabled={busy}
            className="shrink-0 px-2.5 py-1 text-[11px] font-medium text-red-700 border border-red-300 rounded hover:bg-red-50 disabled:opacity-50">
            {busy ? "…" : "Disconnect"}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-gray-500">Connect your own Microsoft 365 to save &amp; open files in SharePoint / OneDrive.</p>
          <button onClick={connect}
            className="shrink-0 px-2.5 py-1 text-[11px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700">
            Connect
          </button>
        </div>
      )}
    </div>
  );
}
