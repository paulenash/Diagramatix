"use client";

import { useState } from "react";

interface Props {
  viewingAsName: string;
  viewingAsEmail: string;
  mode?: "view" | "edit";
  /** When set, the banner shows a "Copy to my account" button in Edit
   *  Mode that support-clones this diagram into a fresh project under
   *  the admin's own account. */
  currentDiagramId?: string;
}

export function ImpersonationBanner({ viewingAsName, viewingAsEmail, mode = "view", currentDiagramId }: Props) {
  const [copying, setCopying] = useState(false);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  async function handleReturn() {
    await fetch("/api/admin/impersonate", { method: "DELETE" });
    // Hard navigation ensures the server sees the cleared cookie.
    // Return straight to the Admin → Registered Users screen so the
    // admin can pick another target or end the session cleanly,
    // instead of being dropped onto their own dashboard.
    window.location.href = "/dashboard/admin";
  }

  async function handleCopyToMyAccount() {
    if (!currentDiagramId || copying) return;
    setCopying(true);
    setCopyMsg(null);
    try {
      const res = await fetch("/api/admin/support-clone-diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagramId: currentDiagramId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Copy failed" }));
        setCopyMsg(err.error ?? "Copy failed");
        return;
      }
      const out = await res.json();
      setCopyMsg(`Copied to project "${out.project?.name ?? "(new)"}" in your account.`);
    } catch {
      setCopyMsg("Network error");
    } finally {
      setCopying(false);
    }
  }

  const displayName = viewingAsName || viewingAsEmail || "another user";
  const isEdit = mode === "edit";
  // Same orange banner for both View and Edit modes per user request —
  // only the trailing label and verb change. The "Return to my account"
  // button is identical in both. In Edit Mode + on a diagram page,
  // a "Copy to my account" button also appears so the admin can take a
  // private copy for further work without continuing to mutate the
  // target user's data.

  return (
    <div className="bg-orange-400 text-white px-4 py-2 flex items-center justify-between text-sm font-medium gap-3">
      <span className="flex-1 min-w-0">
        {isEdit ? "Editing as " : "Viewing as "}
        <strong>{displayName}</strong>
        {viewingAsEmail && viewingAsName ? ` (${viewingAsEmail})` : ""}
        {isEdit ? " — Edit Mode (changes will save to their account)" : " — Read Only"}
        {copyMsg && (
          <span className="ml-2 text-orange-50 text-xs">— {copyMsg}</span>
        )}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        {isEdit && currentDiagramId && (
          <button
            onClick={handleCopyToMyAccount}
            disabled={copying}
            className="bg-white text-orange-700 px-3 py-1 rounded text-xs font-semibold hover:bg-orange-50 disabled:opacity-60 disabled:cursor-not-allowed"
            title="Clone this diagram into a new project under your own account, named after the user you're editing."
          >
            {copying ? "Copying…" : "Copy to my account"}
          </button>
        )}
        <button
          onClick={handleReturn}
          className="bg-white text-orange-700 px-3 py-1 rounded text-xs font-semibold hover:bg-orange-50"
        >
          Return to my account
        </button>
      </div>
    </div>
  );
}
