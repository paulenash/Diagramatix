"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@/app/components/AlertDialog";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
// Entity Type surface removed 2026-06-08 — Org schema still carries the
// field for forward-compat but it's no longer presented in the UI.
import { ORG_ROLE_LABELS } from "@/app/lib/auth/orgRoleLabels";
import type { OrgEntityType } from "@/app/generated/prisma/enums";

// ── Public types (shared with page.tsx) ───────────────────────────────────

export interface OrgDetail {
  id: string;
  name: string;
  entityType: OrgEntityType;
  allowCrossOrgSharing: boolean;
  createdAt: string;
  memberCount: number;
  projectCount: number;
  diagramCount: number;
}

export interface OrgListItem {
  id: string;
  name: string;
  entityType: OrgEntityType;
  memberCount: number;
}

export interface OrgAdminRow {
  id: string;
  userId: string;
  role: "Owner" | "Admin";
  createdAt: string;
  user: { id: string; name: string | null; email: string };
}

interface Candidate {
  id: string;
  name: string | null;
  email: string;
}

interface Props {
  isSuperAdmin: boolean;
  org: OrgDetail;
  admins: OrgAdminRow[];
  /** Full Org list for the SuperAdmin picker. null for OrgAdmin. */
  orgList: OrgListItem[] | null;
  /** Used to spot the caller in the admins list so we can warn before
   *  they demote themselves. */
  callerUserId: string;
  /** Count of members in this Org still on a paid tier. Drives the
   *  Danger Zone "Delete Org" button — only enabled when this is zero
   *  so a paid Org can't be accidentally nuked while users are still
   *  billed. Server independently re-checks. */
  nonFreeMemberCount: number;
}

/**
 * Org Settings — single component, two role-modes.
 *
 * SuperAdmin: Org picker at top + every card + Danger Zone + "+ New Org".
 * OrgAdmin: locked to active Org, Org Info read-only, no Danger Zone.
 *
 * Visual rule: every role-elevated action chip/button uses the orange
 * styling (`text-orange-600 / border-orange-300 / hover:text-orange-800`)
 * per the role-elevated-orange feedback memory. Destructive actions
 * stay red.
 */
export function OrgSettingsClient({ isSuperAdmin, org, admins, orgList, callerUserId, nonFreeMemberCount }: Props) {
  const router = useRouter();

  // Org Info card edit state. Initialised from props; reset whenever
  // the parent fetches a different Org (page navigation). Entity Type
  // surface removed 2026-06-08; the field still exists in the schema
  // (default "Other") for forward-compat with any future use case.
  const [name, setName] = useState(org.name);
  const [allowCrossOrg, setAllowCrossOrg] = useState(org.allowCrossOrgSharing);
  useEffect(() => {
    setName(org.name);
    setAllowCrossOrg(org.allowCrossOrgSharing);
  }, [org.id, org.name, org.allowCrossOrgSharing]);

  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  // OrgAdmins list — managed client-side so add/remove updates feel
  // instant. Server is the source of truth on the next router.refresh().
  const [adminList, setAdminList] = useState(admins);
  useEffect(() => { setAdminList(admins); }, [admins]);

  // Add-OrgAdmin search state.
  const [adminQuery, setAdminQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  // Confirms.
  const [confirmDemote, setConfirmDemote] = useState<OrgAdminRow | null>(null);
  const [showNewOrgModal, setShowNewOrgModal] = useState(false);
  const [confirmDeleteOrg, setConfirmDeleteOrg] = useState(false);

  // ── Switch Org (SuperAdmin only) ────────────────────────────────────
  function switchOrg(targetId: string) {
    if (!isSuperAdmin || targetId === org.id) return;
    router.push(`/dashboard/admin/org-settings?orgId=${encodeURIComponent(targetId)}`);
  }

  // ── PUT settings field ──────────────────────────────────────────────
  // Generic field-save helper. Cross-org toggle is editable for both
  // SuperAdmin and OrgAdmin; name/entityType are SuperAdmin-only (the
  // server re-checks).
  const saveField = useCallback(
    async (patch: Partial<{ name: string; entityType: OrgEntityType; allowCrossOrgSharing: boolean }>) => {
      setSaving(true);
      setSavedMessage(null);
      try {
        const res = await fetch(`/api/orgs/${org.id}/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error((await res.text()) || res.statusText);
        setSavedMessage("Saved.");
      } catch (err) {
        setAlert({ title: "Could not save", message: err instanceof Error ? err.message : String(err) });
        // Roll back UI by re-pulling from server.
        router.refresh();
      } finally {
        setSaving(false);
      }
    },
    [org.id, router],
  );

  // ── Candidate search ────────────────────────────────────────────────
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setSearching(true);
      try {
        const res = await fetch(
          `/api/orgs/${org.id}/admin-candidates?q=${encodeURIComponent(adminQuery)}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) throw new Error((await res.text()) || res.statusText);
        const rows = (await res.json()) as Candidate[];
        if (!ctrl.signal.aborted) setCandidates(rows);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Silent on routine search failures.
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [org.id, adminQuery]);

  // ── Promote / demote ────────────────────────────────────────────────
  const promote = useCallback(async (c: Candidate) => {
    setBusyUserId(c.id);
    try {
      const res = await fetch(`/api/orgs/${org.id}/admins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIdOrEmail: c.id }),
      });
      if (!res.ok) throw new Error((await res.text()) || res.statusText);
      const row = (await res.json()) as OrgAdminRow;
      setAdminList((prev) => [...prev.filter((a) => a.userId !== row.userId), row]);
      setCandidates((prev) => prev.filter((cc) => cc.id !== c.id));
    } catch (err) {
      setAlert({ title: "Could not add OrgAdmin", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusyUserId(null);
    }
  }, [org.id]);

  const demote = useCallback(async (a: OrgAdminRow) => {
    setConfirmDemote(null);
    setBusyUserId(a.userId);
    const snapshot = adminList;
    setAdminList((prev) => prev.filter((x) => x.userId !== a.userId));
    try {
      const res = await fetch(`/api/orgs/${org.id}/admins/${a.userId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.text()) || res.statusText);
    } catch (err) {
      setAdminList(snapshot);
      setAlert({ title: "Could not demote", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusyUserId(null);
    }
  }, [org.id, adminList]);

  // ── Delete Org ──────────────────────────────────────────────────────
  const deleteOrg = useCallback(async () => {
    setConfirmDeleteOrg(false);
    setBusyUserId("__delete-org__");
    try {
      const res = await fetch(`/api/orgs/${org.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.text()) || res.statusText);
      // Land back at the SuperAdmin index; router will pick a new
      // active Org for the picker.
      router.push("/dashboard/admin/org-settings");
      router.refresh();
    } catch (err) {
      setAlert({ title: "Could not delete Org", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusyUserId(null);
    }
  }, [org.id, router]);

  // ── Render ──────────────────────────────────────────────────────────

  const backHref = isSuperAdmin ? "/dashboard/admin" : "/dashboard";
  const backLabel = isSuperAdmin ? "SuperAdmin" : "Dashboard";
  const sharedAdminIds = new Set(adminList.map((a) => a.userId));

  return (
    <>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <a href={backHref} className="text-sm text-blue-600 hover:underline">
              &larr; {backLabel}
            </a>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/diagramatix-icon.svg" alt="Diagramatix" className="w-7 h-7" />
            <h1 className="text-lg font-semibold text-gray-900">Org Settings</h1>
            {isSuperAdmin && orgList && (
              <select
                value={org.id}
                onChange={(e) => switchOrg(e.target.value)}
                className="text-sm border border-orange-300 rounded px-2 py-1 bg-white text-orange-700"
                title="Switch which Org you're configuring"
              >
                {orgList.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            )}
            {!isSuperAdmin && (
              <span className="text-xs text-gray-500 truncate" title={org.name}>{org.name}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {savedMessage && !saving && (
              <span className="text-xs text-green-700">{savedMessage}</span>
            )}
            {saving && <span className="text-xs text-gray-500">Saving…</span>}
            {isSuperAdmin && (
              <button
                onClick={() => setShowNewOrgModal(true)}
                className="text-xs text-orange-600 hover:text-orange-800 font-medium border border-orange-300 rounded px-2 py-1 hover:bg-orange-50"
                title="Create a new Org"
              >
                + New Org
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 space-y-5 max-w-3xl">

          {/* ── Org Info ────────────────────────────────────────────── */}
          <div className="bg-white rounded-md border border-gray-200">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-800">Org Info</h2>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-700">Name</p>
                  {isSuperAdmin ? (
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={() => { if (name.trim() && name !== org.name) saveField({ name: name.trim() }); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1"
                    />
                  ) : (
                    <p className="text-sm text-gray-800 mt-1">{org.name}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-xs text-gray-600 pt-2 border-t border-gray-100">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Members</p>
                  <p className="text-sm font-medium text-gray-800">{org.memberCount}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Projects</p>
                  <p className="text-sm font-medium text-gray-800">{org.projectCount}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Diagrams</p>
                  <p className="text-sm font-medium text-gray-800">{org.diagramCount}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Cross-Org Sharing ──────────────────────────────────── */}
          <div className="bg-white rounded-md border border-gray-200">
            <div className="flex items-start justify-between gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800">
                  Allow sharing projects with users outside this org
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  When ON, project owners in {org.name} can share their
                  projects with registered users from other orgs. When
                  OFF, share recipients must be members of this org.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={allowCrossOrg}
                disabled={saving}
                onClick={() => {
                  const next = !allowCrossOrg;
                  setAllowCrossOrg(next);
                  saveField({ allowCrossOrgSharing: next });
                }}
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

          {/* ── OrgAdmins ──────────────────────────────────────────── */}
          <div className="bg-white rounded-md border border-gray-200">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">
                OrgAdmins
                <span className="ml-2 text-xs font-normal text-gray-500">{adminList.length}</span>
              </h2>
              <span className="text-[10px] text-orange-700 border border-orange-300 rounded px-1.5 py-0.5">
                Elevated role
              </span>
            </div>
            <div className="px-5 py-4 space-y-3">
              {adminList.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No OrgAdmins yet.</p>
              ) : (
                <ul className="border border-gray-200 rounded divide-y divide-gray-100">
                  {adminList.map((a) => {
                    const isMe = a.userId === callerUserId;
                    return (
                      <li key={a.id} className="px-3 py-2 flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate" title={a.user.email}>
                            {(a.user.name ?? "").trim() || a.user.email}
                            {isMe && (
                              <span className="ml-2 text-[10px] text-gray-500">(you)</span>
                            )}
                          </p>
                          <p className="text-[10px] text-gray-500 truncate">{a.user.email}</p>
                        </div>
                        <span className="text-[10px] text-orange-700 border border-orange-300 rounded px-1.5 py-0.5">
                          {ORG_ROLE_LABELS[a.role]}
                        </span>
                        <button
                          onClick={() => setConfirmDemote(a)}
                          disabled={busyUserId === a.userId}
                          className="text-gray-400 hover:text-red-600 disabled:opacity-50 text-xs px-1"
                          title={isMe ? "Demote yourself" : "Demote to Viewer"}
                        >
                          {"✕"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Add OrgAdmin */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-1">Add OrgAdmin</p>
                <input
                  type="text"
                  value={adminQuery}
                  onChange={(e) => setAdminQuery(e.target.value)}
                  placeholder={isSuperAdmin
                    ? "Search any registered user by name or email"
                    : "Search existing Org members by name or email"}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <div className="border border-gray-200 rounded mt-1 max-h-40 overflow-y-auto">
                  {searching && (
                    <p className="text-[11px] text-gray-400 italic px-3 py-2">Searching…</p>
                  )}
                  {!searching && candidates.filter((c) => !sharedAdminIds.has(c.id)).length === 0 && (
                    <p className="text-[11px] text-gray-400 italic px-3 py-2">
                      {adminQuery.trim() ? "No matches." : "Start typing to find users."}
                    </p>
                  )}
                  {!searching && candidates
                    .filter((c) => !sharedAdminIds.has(c.id))
                    .map((c) => (
                      <button
                        key={c.id}
                        onClick={() => promote(c)}
                        disabled={busyUserId === c.id}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-orange-50 disabled:opacity-50 flex items-center justify-between gap-2 border-b border-gray-100 last:border-b-0"
                      >
                        <span className="flex-1 min-w-0">
                          <span className="font-medium text-gray-800 truncate block">
                            {(c.name ?? "").trim() || c.email}
                          </span>
                          <span className="text-[10px] text-gray-500 truncate block">{c.email}</span>
                        </span>
                        <span className="text-[10px] text-orange-600 shrink-0">+ OrgAdmin</span>
                      </button>
                    ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Danger Zone (SuperAdmin only) ──────────────────────── */}
          {isSuperAdmin && (
            <div className="bg-white rounded-md border border-red-200">
              <div className="px-5 py-3 border-b border-red-100">
                <h2 className="text-sm font-semibold text-red-700">Danger Zone</h2>
              </div>
              <div className="px-5 py-4 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800">Delete this Org</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Permanently removes <strong>{org.name}</strong>, all
                    {" "}{org.memberCount} members,{" "}{org.projectCount} projects, and
                    {" "}{org.diagramCount} diagrams. Cannot be undone.
                  </p>
                  {nonFreeMemberCount > 0 && (
                    <p className="text-xs text-red-700 mt-2 font-medium">
                      Blocked: {nonFreeMemberCount} member{nonFreeMemberCount === 1 ? "" : "s"} still on a paid tier. Move them to Free before deleting this Org.
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setConfirmDeleteOrg(true)}
                  disabled={nonFreeMemberCount > 0}
                  className="text-xs font-medium px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  title={
                    nonFreeMemberCount > 0
                      ? `Cannot delete: ${nonFreeMemberCount} member${nonFreeMemberCount === 1 ? "" : "s"} on a paid tier.`
                      : "Permanently delete this Org and all its data"
                  }
                >
                  Delete Org
                </button>
              </div>
            </div>
          )}
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

      {confirmDemote && (
        <ConfirmDialog
          title="Demote this OrgAdmin?"
          message={`${(confirmDemote.user.name ?? "").trim() || confirmDemote.user.email} will become a Viewer in ${org.name}. You can re-promote them later from this page.`}
          confirmLabel="Demote"
          destructive
          onConfirm={() => demote(confirmDemote)}
          onCancel={() => setConfirmDemote(null)}
        />
      )}

      {confirmDeleteOrg && (
        <ConfirmDialog
          title={`Delete ${org.name}?`}
          message={`This permanently removes the Org and cascades to ${org.memberCount} members, ${org.projectCount} projects, and ${org.diagramCount} diagrams. Cannot be undone.`}
          confirmLabel="Delete Org"
          destructive
          onConfirm={() => deleteOrg()}
          onCancel={() => setConfirmDeleteOrg(false)}
        />
      )}

      {showNewOrgModal && (
        <NewOrgModal
          onCancel={() => setShowNewOrgModal(false)}
          onCreated={(newId) => {
            setShowNewOrgModal(false);
            router.push(`/dashboard/admin/org-settings?orgId=${encodeURIComponent(newId)}`);
            router.refresh();
          }}
          onError={(message) => setAlert({ title: "Could not create Org", message })}
        />
      )}
    </>
  );
}

// ── New Org modal ─────────────────────────────────────────────────────────

function NewOrgModal({
  onCancel,
  onCreated,
  onError,
}: {
  onCancel: () => void;
  onCreated: (newId: string) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [initialOwnerEmail, setInitialOwnerEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim() || !initialOwnerEmail.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          // entityType defaults to "Other" server-side — surface
          // removed from the UI per Paul's 2026-06-08 simplification.
          entityType: "Other",
          initialOwnerEmail: initialOwnerEmail.trim(),
        }),
      });
      if (!res.ok) throw new Error((await res.text()) || res.statusText);
      const row = (await res.json()) as { id: string };
      onCreated(row.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">New Org</h3>
          <p className="text-xs text-gray-500 mt-1">
            Creates the Org and makes the email below its initial Owner.
            The user must already be registered.
          </p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Insurance"
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Initial Owner Email</label>
            <input
              type="email"
              value={initialOwnerEmail}
              onChange={(e) => setInitialOwnerEmail(e.target.value)}
              placeholder="owner@example.com"
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !name.trim() || !initialOwnerEmail.trim()}
            className="px-3 py-1.5 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create Org"}
          </button>
        </div>
      </div>
    </div>
  );
}
