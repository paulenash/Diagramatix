"use client";

import { useState } from "react";
import { AlertDialog } from "@/app/components/AlertDialog";

interface Props {
  orgId: string;
  orgName: string;
  initialAllowCrossOrgSharing: boolean;
  /** When true, the caller is a SuperAdmin and the back-link points
   *  to /dashboard/admin. Otherwise it's an OrgOwner/OrgAdmin reaching
   *  this page from /dashboard. */
  isSuperAdmin: boolean;
}

/**
 * Single-card Org Settings UI. Matches the chrome of the other
 * /dashboard/admin/* sub-pages: white header with back-link + brand
 * icon + h1, light-gray body with a single bordered card.
 *
 * Right now the card carries one toggle (Allow cross-org sharing).
 * Adding more settings later is a matter of dropping more rows into
 * the same card — keep the visual rhythm consistent.
 */
export function OrgSettingsClient({
  orgId,
  orgName,
  initialAllowCrossOrgSharing,
  isSuperAdmin,
}: Props) {
  const [allowCrossOrg, setAllowCrossOrg] = useState(initialAllowCrossOrgSharing);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  // Optimistic save: flip local state, PUT, roll back on failure with
  // a Diagramatix-native AlertDialog (per the no-browser-dialogs rule).
  async function setAllowCrossOrgSharing(next: boolean) {
    if (saving) return;
    const previous = allowCrossOrg;
    setAllowCrossOrg(next);
    setSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowCrossOrgSharing: next }),
      });
      if (!res.ok) throw new Error((await res.text()) || res.statusText);
      setStatusMessage("Saved.");
    } catch (err) {
      setAllowCrossOrg(previous);
      setAlert({
        title: "Could not save org settings",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  const backHref = isSuperAdmin ? "/dashboard/admin" : "/dashboard";
  const backLabel = isSuperAdmin ? "SuperAdmin" : "Dashboard";

  return (
    <>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <a href={backHref} className="text-sm text-blue-600 hover:underline">
              &larr; {backLabel}
            </a>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/diagramatix-icon.svg" alt="Diagramatix" className="w-7 h-7" />
            <h1 className="text-lg font-semibold text-gray-900">Org Settings</h1>
            <span className="text-xs text-gray-500 truncate" title={orgName}>{orgName}</span>
          </div>
          <div className="flex items-center gap-3">
            {statusMessage && !saving && (
              <span className="text-xs text-green-700">{statusMessage}</span>
            )}
            {saving && (
              <span className="text-xs text-gray-500">Saving…</span>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <p className="text-xs text-gray-500 mb-4 max-w-3xl">
            Org-level toggles. Apply to every project and diagram in
            {" "}<strong>{orgName}</strong>. Changes save the moment a
            switch is flipped — there&apos;s no separate Save button.
          </p>

          <div className="bg-white rounded-md border border-gray-200 max-w-3xl">
            {/* Cross-org sharing row. Visually a single padded row
                with the label/description on the left and the toggle
                pushed to the right. Future settings drop in as more
                rows of the same shape. */}
            <div className="flex items-start justify-between gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800">
                  Allow sharing projects with users outside this org
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  When ON, project owners in {orgName} can share their
                  projects with registered users who belong to other
                  orgs. When OFF, share recipients must be members of
                  this org.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={allowCrossOrg}
                disabled={saving}
                onClick={() => setAllowCrossOrgSharing(!allowCrossOrg)}
                className={`shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                  allowCrossOrg ? "bg-blue-600" : "bg-gray-300"
                }`}
                title={allowCrossOrg ? "ON" : "OFF"}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    allowCrossOrg ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </div>
        </main>
      </div>

      {alert && (
        <AlertDialog
          title={alert.title}
          message={alert.message}
          tone="error"
          onClose={() => setAlert(null)}
        />
      )}
    </>
  );
}
