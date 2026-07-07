"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { AlertDialog } from "@/app/components/AlertDialog";
import { UsagePopover } from "@/app/components/UsagePopover";
import { displayOrgRole } from "@/app/lib/auth/orgRoleLabels";
import { SCHEMA_VERSION } from "@/app/lib/diagram/types";
import { safeInternalPath } from "@/app/lib/safeRedirect";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  currentDiagramId: string | null;
  currentDiagramName: string | null;
  _count: { projects: number; diagrams: number };
  /** Display label for the Subscription column — "SuperAdmin" for
   *  SUPERUSER_EMAILS users, otherwise the EFFECTIVE tier name (comp
   *  wins when active). */
  subscriptionLabel: string;
  /** When the effective tier comes from a comp grant overriding a
   *  different underlying tier, this is the underlying name (shown
   *  struck-through before the effective name to signal the override).
   *  Null when there's no comp or the comp tier matches underlying. */
  underlyingLabel: string | null;
  /** ISO timestamp when the active comp lapses. Null when no comp. */
  compExpiresAt: string | null;
  /** Whole days remaining on the effective tier's trial window
   *  (mostly Free, which is seeded with 30 days). Null when no trial
   *  applies or it's already expired. Rendered in purple beside the
   *  tier label. */
  trialDaysLeft: number | null;
  isAdmin: boolean;
  /** Primary OrgMember row (oldest membership) — the row the OrgRole
   *  column edits. Null only if the user has no Org membership at all
   *  (impossible after Phase 0 backfill but tolerated by the UI). */
  primaryOrg: { orgId: string; role: string; orgName: string } | null;
}

interface Props {
  users: UserRow[];
  currentUserId: string;
  /** Build commit count baked in via NEXT_PUBLIC_COMMIT_COUNT. Shown
   *  in the page header as `v{SCHEMA_VERSION}.{commitCount}`. */
  commitCount: number;
  /** True when the caller is a SuperAdmin (SUPERUSER_EMAILS). False
   *  for an OrgAdmin viewing the scoped Org-only list. Drives:
   *  the SuperAdmin nav links cluster, the Delete user button, and
   *  the header title ("Registered Users" vs "Registered Users —
   *  Acme"). */
  isSuperAdmin: boolean;
  /** OrgAdmin only — display name of their active Org, appended to
   *  the page title so the scope is obvious. Null for SuperAdmin. */
  activeOrgName: string | null;
}

// Users with activity in the last 5 minutes are treated as "online" — the
// jwt callback updates lastSeenAt once a minute, so anything fresher than
// that is almost certainly an active session.
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function presence(lastSeenAt: string | null, isYou: boolean): { online: boolean; label: string } {
  if (isYou) return { online: true, label: "Online now" };
  if (!lastSeenAt) return { online: false, label: "Never signed in" };
  const seen = new Date(lastSeenAt).getTime();
  const delta = Date.now() - seen;
  if (delta < ONLINE_WINDOW_MS) return { online: true, label: "Online now" };
  if (delta < 60 * 60 * 1000) {
    const mins = Math.max(1, Math.round(delta / 60_000));
    return { online: false, label: `${mins} min ago` };
  }
  if (delta < 24 * 60 * 60 * 1000) {
    const hrs = Math.round(delta / (60 * 60_000));
    return { online: false, label: `${hrs} h ago` };
  }
  const days = Math.round(delta / (24 * 60 * 60_000));
  return { online: false, label: `${days} d ago` };
}

export function AdminClient({ users: initialUsers, currentUserId, commitCount, isSuperAdmin, activeOrgName }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // `?from=<url>` lets the SuperAdmin page return the user to wherever
  // they were when they clicked the SuperAdmin chip (dashboard, a
  // project, or a specific diagram). Falls back to /dashboard when
  // the param is absent or unsafe.
  const rawFrom = searchParams.get("from");
  const backHref = safeInternalPath(rawFrom) ?? "/dashboard";  // SEC-15
  const backLabel = backHref === "/dashboard"
    ? "Dashboard"
    : backHref === "/dashboard/org-admin"
      ? "OrgAdmin"
      : backHref.startsWith("/dashboard/projects")
        ? "Project"
        : backHref.startsWith("/dashboard/diagram") || backHref.startsWith("/diagram")
          ? "Diagram"
          : "Back";
  // Org Role is display-only in this table (Paul's 2026-06-08 rule);
  // role changes happen on the Org Settings page via the OrgAdmins
  // roster. The user list is owned via state so future row-level edits
  // (impersonation, comp grants etc.) can update in-place.
  const users = initialUsers;

  // Sort + filter (Paul's item 3 — added 2026-06-08).
  // Sortable columns: name, email, status (by last-seen recency),
  // subscription (alpha by label), registered (by createdAt).
  // Filter columns mirror the sortable ones — substring match against
  // the rendered label (case-insensitive) for everything; status uses
  // the same "p.label" text so typing "online" finds online users.
  // Registered Users table is a tile on the SuperAdmin landing — hidden
  // until the tile is clicked. OrgAdmins (scoped list) always see it.
  const [showUsers, setShowUsers] = useState(!isSuperAdmin);
  type SortKey = "name" | "email" | "status" | "subscription" | "registered";
  const [sortBy, setSortBy] = useState<SortKey | null>("registered");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filters, setFilters] = useState({
    name: "", email: "", status: "", subscription: "", registered: "",
  });
  function toggleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortDir(key === "registered" ? "desc" : "asc");
    }
  }
  // Pre-compute sortable + filterable strings per user so the sort &
  // filter logic stays cheap on every keystroke.
  const enriched = users.map(u => {
    const p = presence(u.lastSeenAt, u.id === currentUserId);
    const lastSeenMs = u.id === currentUserId
      ? Date.now()
      : u.lastSeenAt ? new Date(u.lastSeenAt).getTime() : 0;
    return { u, p, lastSeenMs };
  });
  const filteredSorted = enriched
    .filter(({ u, p }) => {
      const f = filters;
      if (f.name && !(u.name ?? "").toLowerCase().includes(f.name.toLowerCase())) return false;
      if (f.email && !u.email.toLowerCase().includes(f.email.toLowerCase())) return false;
      if (f.status && !p.label.toLowerCase().includes(f.status.toLowerCase())) return false;
      if (f.subscription && !u.subscriptionLabel.toLowerCase().includes(f.subscription.toLowerCase())) return false;
      if (f.registered && !new Date(u.createdAt).toLocaleDateString().toLowerCase().includes(f.registered.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (!sortBy) return 0;
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortBy) {
        case "name":
          return ((a.u.name ?? "").toLowerCase().localeCompare((b.u.name ?? "").toLowerCase())) * dir;
        case "email":
          return a.u.email.toLowerCase().localeCompare(b.u.email.toLowerCase()) * dir;
        case "status":
          // More recent first when asc=desc → desc=most recent. Stick to
          // "asc=oldest signin first" so the user gets the intuitive flip.
          return (a.lastSeenMs - b.lastSeenMs) * dir;
        case "subscription":
          return a.u.subscriptionLabel.localeCompare(b.u.subscriptionLabel) * dir;
        case "registered":
          return (new Date(a.u.createdAt).getTime() - new Date(b.u.createdAt).getTime()) * dir;
        default:
          return 0;
      }
    });
  function sortIcon(key: SortKey): string {
    if (sortBy !== key) return "↕";
    return sortDir === "asc" ? "▲" : "▼";
  }
  // Pending Edit confirmation. When the admin clicks "Edit" on a row
  // we surface a Diagramatix-styled ConfirmDialog rather than the
  // browser's native confirm() (which the user found jarring).
  const [editConfirm, setEditConfirm] = useState<{
    userId: string;
    email: string;
    target?: string;
  } | null>(null);

  // UsagePopover target — null when closed. Opening the popover fetches
  // fresh usage data from /api/admin/users/[id]/usage so the admin sees
  // up-to-the-moment counts.
  const [usagePopover, setUsagePopover] = useState<{
    userId: string;
    userEmail: string;
    userName: string | null;
  } | null>(null);

  // Two-stage delete confirmation. Stage 1: confirm the destructive
  // action with a project/diagram count summary. Stage 2: require the
  // admin to type the target email exactly. The server re-validates
  // confirmEmail too, so a forged client can't skip stage 2.
  const [deleteStage1, setDeleteStage1] = useState<{
    userId: string;
    email: string;
    name: string | null;
    projects: number;
    diagrams: number;
  } | null>(null);
  const [deleteStage2, setDeleteStage2] = useState<typeof deleteStage1>(null);
  const [deleteTypedEmail, setDeleteTypedEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function performDelete() {
    if (!deleteStage2) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/users/${deleteStage2.userId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: deleteTypedEmail }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDeleteError(body.error ?? `Delete failed (${res.status})`);
        return;
      }
      setDeleteStage2(null);
      setDeleteTypedEmail("");
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function handleViewAs(userId: string, mode: "view" | "edit", target?: string) {
    await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, mode }),
    });
    // Hard navigation so the server sees the new impersonation cookies.
    // Jump directly to the user's open diagram when we have one, otherwise
    // land on their dashboard.
    window.location.href = target ?? "/dashboard";
  }

  return (
    <div className="h-screen dgx-dashboard-bg flex flex-col overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              // SuperAdmin viewing Registered Users backs out to the
              // SuperAdmin tile grid (its own screen); else to the referrer.
              if (isSuperAdmin && showUsers) setShowUsers(false);
              else router.push(backHref);
            }}
            className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
            title={isSuperAdmin && showUsers ? "Return to SuperAdmin" : `Return to ${backHref}`}
          >
            <span style={{ fontSize: "1.75em", lineHeight: 1 }}>{"\u2190"}</span>
            <span className="underline">{isSuperAdmin && showUsers ? "SuperAdmin" : backLabel}</span>
          </button>
          {/* Brand icon: sits just right of the back link as a permanent
              "you're inside Diagramatix" cue. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/diagramatix-icon.svg" alt="Diagramatix" className="w-7 h-7" />
          <h1 className="font-semibold text-gray-900">
            {isSuperAdmin
              ? (showUsers ? "Registered Users" : "SuperAdmin")
              : `Registered Users — ${activeOrgName ?? "Your Org"}`}
          </h1>
          <span className="text-[10px] text-gray-400">v{SCHEMA_VERSION}.{commitCount}</span>
        </div>
        <div className="flex items-center gap-2" />
      </header>

      {/* Widened container (was max-w-4xl) so the Name / Status / Working
          on columns have room to breathe. Per-column min-widths declared
          on the <th> stops the smaller numeric / date columns from
          starving the text-heavy ones. */}
      <div className="flex-1 min-h-0 overflow-y-auto max-w-screen-2xl mx-auto px-6 py-8">
        {isSuperAdmin && !showUsers && <SuperAdminToolsGrid onShowUsers={() => setShowUsers(true)} />}
        {showUsers && (
        <table className="w-full bg-white rounded-lg border border-gray-200 overflow-hidden table-fixed">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="px-3 py-3" style={{ width: "11%" }}>
                <button onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 hover:text-gray-700">
                  Name <span className="text-[9px] text-gray-400">{sortIcon("name")}</span>
                </button>
              </th>
              <th className="px-3 py-3" style={{ width: "16%" }}>
                <button onClick={() => toggleSort("email")} className="inline-flex items-center gap-1 hover:text-gray-700">
                  Email Address <span className="text-[9px] text-gray-400">{sortIcon("email")}</span>
                </button>
              </th>
              <th className="px-3 py-3" style={{ width: "9%" }}>
                <button onClick={() => toggleSort("status")} className="inline-flex items-center gap-1 hover:text-gray-700">
                  Status <span className="text-[9px] text-gray-400">{sortIcon("status")}</span>
                </button>
              </th>
              <th className="px-3 py-3" style={{ width: "8%" }}>Working on</th>
              <th className="px-3 py-3" style={{ width: "14%" }}>
                <button onClick={() => toggleSort("subscription")} className="inline-flex items-center gap-1 hover:text-gray-700">
                  Subscription <span className="text-[9px] text-gray-400">{sortIcon("subscription")}</span>
                </button>
              </th>
              <th className="px-3 py-3" style={{ width: "8%" }} title="OrgRole inside the user's primary Org">Org Role</th>
              <th className="px-3 py-3 text-center" style={{ width: "7%" }}>Projects</th>
              <th className="px-3 py-3 text-center" style={{ width: "7%" }}>Diagrams</th>
              <th className="px-3 py-3" style={{ width: "8%" }}>
                <button onClick={() => toggleSort("registered")} className="inline-flex items-center gap-1 hover:text-gray-700">
                  Registered <span className="text-[9px] text-gray-400">{sortIcon("registered")}</span>
                </button>
              </th>
              <th className="px-3 py-3" style={{ width: "12%" }}></th>
            </tr>
            {/* Filter row — substring match per filterable column. */}
            <tr className="bg-gray-50 border-t border-gray-200">
              <th className="px-2 pb-2 pt-0">
                <input
                  type="text" value={filters.name}
                  onChange={(e) => setFilters(f => ({ ...f, name: e.target.value }))}
                  placeholder="Filter…"
                  className="w-full text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white"
                />
              </th>
              <th className="px-2 pb-2 pt-0">
                <input
                  type="text" value={filters.email}
                  onChange={(e) => setFilters(f => ({ ...f, email: e.target.value }))}
                  placeholder="Filter…"
                  className="w-full text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white"
                />
              </th>
              <th className="px-2 pb-2 pt-0">
                <input
                  type="text" value={filters.status}
                  onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
                  placeholder="Filter…"
                  className="w-full text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white"
                />
              </th>
              <th />
              <th className="px-2 pb-2 pt-0">
                <input
                  type="text" value={filters.subscription}
                  onChange={(e) => setFilters(f => ({ ...f, subscription: e.target.value }))}
                  placeholder="Filter…"
                  className="w-full text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white"
                />
              </th>
              <th /><th /><th />
              <th className="px-2 pb-2 pt-0">
                <input
                  type="text" value={filters.registered}
                  onChange={(e) => setFilters(f => ({ ...f, registered: e.target.value }))}
                  placeholder="Filter…"
                  className="w-full text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white"
                />
              </th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredSorted.map(({ u, p }) => {
              const isYou = u.id === currentUserId;
              // Only surface "Working on" when the user is currently online
              // — currentDiagramId can otherwise linger from a previous session.
              const workingOn = p.online && u.currentDiagramId && u.currentDiagramName
                ? { id: u.currentDiagramId, name: u.currentDiagramName }
                : null;
              const diagramHref = workingOn ? `/diagram/${workingOn.id}` : undefined;
              return (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                    {u.name || <span className="text-gray-400 italic">No name</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${p.online ? "bg-green-500" : "bg-gray-300"}`}
                        title={u.lastSeenAt ? `Last seen ${new Date(u.lastSeenAt).toLocaleString()}` : "Never signed in"}
                      />
                      <span className={p.online ? "text-green-700 font-medium" : "text-gray-500"}>
                        {p.label}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {workingOn ? (
                      <span className="text-gray-700 truncate block w-full" title={workingOn.name}>
                        {workingOn.name}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <button
                      onClick={() => setUsagePopover({ userId: u.id, userEmail: u.email, userName: u.name })}
                      className={`inline-flex items-center gap-1 text-left font-medium border rounded px-2 py-0.5 hover:bg-blue-50 ${
                        u.isAdmin
                          ? "text-orange-600 border-orange-300"
                          : "text-blue-700 border-blue-300"
                      }`}
                      title={
                        u.isAdmin
                          ? "SuperAdmin — bypasses all limits"
                          : u.compExpiresAt
                            ? `Comp grant active until ${new Date(u.compExpiresAt).toLocaleDateString()}`
                            : "View usage and change tier"
                      }
                    >
                      {u.underlyingLabel && (
                        <>
                          <span className="opacity-60 line-through">{u.underlyingLabel}</span>
                          <span className="opacity-60">{"→"}</span>
                        </>
                      )}
                      <span>{u.subscriptionLabel}</span>
                      {u.trialDaysLeft !== null && (
                        <span
                          className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded bg-purple-100 text-purple-700 font-medium"
                          title="Days remaining on this tier's trial window"
                        >
                          {u.trialDaysLeft}d
                        </span>
                      )}
                      {u.compExpiresAt && (
                        <span className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded bg-purple-200 text-purple-800 font-medium">
                          comp{" "}
                          {Math.max(
                            0,
                            Math.ceil(
                              (new Date(u.compExpiresAt).getTime() - Date.now()) /
                                86_400_000,
                            ),
                          )}
                          d
                        </span>
                      )}
                    </button>
                  </td>
                  {/* OrgRole cell — display only (Paul's 2026-06-08
                      rule). Role changes happen on the Org Settings
                      page via the OrgAdmins roster, not here. */}
                  <td className="px-3 py-3 text-xs text-gray-700">
                    {u.primaryOrg ? (
                      <span title={`Primary Org: ${u.primaryOrg.orgName}`}>
                        {displayOrgRole(u.primaryOrg.role)}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 text-center">{u._count.projects}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 text-center">{u._count.diagrams}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isYou ? (
                      <span className="text-xs text-gray-400">You</span>
                    ) : (
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => handleViewAs(u.id, "view", diagramHref)}
                          className="text-xs text-red-700 hover:text-red-800 font-medium border border-red-300 rounded px-2 py-1 hover:bg-red-50 hover:bg-orange-50"
                          title={workingOn ? `View "${workingOn.name}" (read-only)` : "View this user's dashboard (read-only)"}
                        >
                          View
                        </button>
                        <button
                          onClick={() => setEditConfirm({ userId: u.id, email: u.email, target: diagramHref })}
                          className="text-xs text-red-600 hover:text-red-800 font-medium border border-red-300 rounded px-2 py-1 hover:bg-red-50"
                          title={workingOn ? `Edit "${workingOn.name}" as ${u.email}` : `Edit ${u.email}'s data for support purposes`}
                        >
                          Edit
                        </button>
                        {/* Delete is SuperAdmin only. OrgAdmin gets View
                            + Edit but cannot purge users — that's a
                            platform-level action. */}
                        {isSuperAdmin && !u.isAdmin && (
                          <button
                            onClick={() => setDeleteStage1({
                              userId: u.id,
                              email: u.email,
                              name: u.name,
                              projects: u._count.projects,
                              diagrams: u._count.diagrams,
                            })}
                            className="text-xs text-white font-medium border border-red-600 bg-red-600 hover:bg-red-700 rounded px-2 py-1"
                            title={`Permanently delete ${u.email} and all their data`}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        )}
        {showUsers && (
        <p className="text-xs text-gray-400 mt-4">
          {filteredSorted.length === users.length
            ? `${users.length} registered user(s)`
            : `${filteredSorted.length} of ${users.length} registered user(s) match the filters`}
          {" — "}
          {users.filter(u => presence(u.lastSeenAt, u.id === currentUserId).online).length} online
        </p>
        )}
      </div>

      {editConfirm && (
        <ConfirmDialog
          title="Open in Edit Mode?"
          message={`You are about to open ${editConfirm.email}'s session in EDIT mode. Any changes you make will save to their account.\n\nUse Edit Mode for support and repair only — the user will see your edits when they next sign in.`}
          confirmLabel="Open in Edit Mode"
          cancelLabel="Cancel"
          destructive
          onCancel={() => setEditConfirm(null)}
          onConfirm={() => {
            const c = editConfirm;
            setEditConfirm(null);
            if (c) handleViewAs(c.userId, "edit", c.target);
          }}
        />
      )}

      {usagePopover && (
        <UsagePopover
          mode={{
            kind: "admin",
            userId: usagePopover.userId,
            userEmail: usagePopover.userEmail,
            userName: usagePopover.userName,
          }}
          onClose={() => setUsagePopover(null)}
          onTierChanged={() => router.refresh()}
        />
      )}

      {/* Delete user — stage 1: count summary + warning, click-to-continue */}
      {deleteStage1 && (
        <ConfirmDialog
          title="Delete user permanently?"
          message={
            `This will permanently delete ${deleteStage1.email} (${deleteStage1.name ?? "no name"}) and all of their data:\n\n` +
            `  • ${deleteStage1.projects} project(s)\n` +
            `  • ${deleteStage1.diagrams} diagram(s)\n` +
            `  • All AI / export / import usage history\n` +
            `  • Org memberships, templates, prompts, and rules\n\n` +
            `This cannot be undone. The Org row itself is NOT deleted — it persists as an empty container even if this was its only member.\n\n` +
            `Click Continue to confirm by typing the email.`
          }
          confirmLabel="Continue"
          cancelLabel="Cancel"
          destructive
          onCancel={() => setDeleteStage1(null)}
          onConfirm={() => {
            const s = deleteStage1;
            setDeleteStage1(null);
            setDeleteTypedEmail("");
            setDeleteError(null);
            setDeleteStage2(s);
          }}
        />
      )}

      {/* Delete user — stage 2: type-email confirm */}
      {deleteStage2 && (
        <div
          className="fixed inset-0 bg-black/20 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) setDeleteStage2(null);
          }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                Confirm by typing the email
              </h3>
              <p className="text-xs text-gray-600 mb-3">
                To delete this account, type <strong>{deleteStage2.email}</strong> below.
                This is irreversible.
              </p>
              <input
                type="text"
                autoFocus
                value={deleteTypedEmail}
                onChange={(e) => {
                  setDeleteTypedEmail(e.target.value);
                  setDeleteError(null);
                }}
                placeholder={deleteStage2.email}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:border-red-400 focus:outline-none"
              />
              {deleteError && (
                <p className="mt-2 text-xs text-red-700">{deleteError}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
              <button
                disabled={deleting}
                onClick={() => {
                  setDeleteStage2(null);
                  setDeleteTypedEmail("");
                  setDeleteError(null);
                }}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={
                  deleting ||
                  deleteTypedEmail.trim().toLowerCase() !==
                    deleteStage2.email.trim().toLowerCase()
                }
                onClick={performDelete}
                className="px-3 py-1.5 text-xs font-medium text-white rounded bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GenerateDdlButton() {
  const [open, setOpen] = useState(false);
  const [dbType, setDbType] = useState("postgres");
  const [generating, setGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const { generateDiagramatixDDL } = await import("@/app/lib/diagram/ddlGenerate");
      const ddl = generateDiagramatixDDL(dbType);
      const dbLabel = { postgres: "PostgreSQL", mysql: "MySQL", mssql: "SQLServer" }[dbType] ?? dbType;
      const blob = new Blob([ddl], { type: "text/sql" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `diagramatix-logical-ddl-${dbLabel}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setOpen(false);
    } catch (err) {
      setErrorMessage("Failed to generate logical DDL: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="text-xs text-red-700 hover:text-red-800 font-medium border border-red-300 rounded px-2 py-1 hover:bg-red-50">
        Generate Logical DDL
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded shadow-lg z-50 p-3 space-y-2">
          <p className="text-xs font-medium text-gray-700">Database Type</p>
          <select value={dbType} onChange={e => setDbType(e.target.value)}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white">
            <option value="postgres">PostgreSQL</option>
            <option value="mysql">MySQL</option>
            <option value="mssql">SQL Server</option>
          </select>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setOpen(false)}
              className="px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
            <button onClick={handleGenerate} disabled={generating}
              className="px-2 py-1 text-xs text-white bg-orange-600 rounded hover:bg-orange-700 disabled:opacity-50">
              {generating ? "Generating…" : "Download"}
            </button>
          </div>
        </div>
      )}
      {errorMessage && (
        <AlertDialog
          title="Logical DDL generation failed"
          message={errorMessage}
          tone="error"
          onClose={() => setErrorMessage(null)}
        />
      )}
    </div>
  );
}

// ── SuperAdmin tools tile grid ──────────────────────────────────────────
// Card layout mirroring the OrgAdmin landing menu, but red-themed and
// drag-reorderable. The chosen order persists per-browser in localStorage
// so each SuperAdmin can arrange the tiles to taste.

interface AdminTile {
  id: string;
  title: string;
  description: string;
  href?: string;     // navigation tiles
  ddl?: boolean;     // the special "Generate DDL" tile renders GenerateDdlButton
  users?: boolean;   // the "Registered Users" tile reveals the user table
}

const ADMIN_TILES: AdminTile[] = [
  { id: "users", title: "Registered Users", description: "Every registered user — status, subscription, current diagram.", users: true },
  { id: "ai-rules", title: "AI Rules & Preferences", description: "Geometric + style rules that steer AI BPMN generation.", href: "/dashboard/rules" },
  { id: "ai-model", title: "AI Generate Model", description: "Choose the Claude model AI diagram generation uses (default Haiku 4.5).", href: "/dashboard/admin/ai-model" },
  { id: "database", title: "Database Access", description: "Inspect the live database and run maintenance queries.", href: "/dashboard/admin/database" },
  { id: "ddl", title: "Logical DDL Generation", description: "Download the Diagramatix logical data model as PostgreSQL / MySQL / SQL Server DDL.", ddl: true },
  { id: "archive", title: "System Archive", description: "Archived projects and diagrams across the system.", href: "/dashboard/admin/archive" },
  { id: "subscriptions", title: "Subscription Prices & Limits", description: "Tier pricing and per-tier feature limits.", href: "/dashboard/admin/subscriptions" },
  { id: "features", title: "Features Catalog", description: "Edit the public feature catalog (draft / publish).", href: "/dashboard/admin/features" },
  { id: "simulator-examples", title: "Simulator Examples", description: "Curate the simulation sample processes users can adopt — capture a study, edit metadata, publish / unpublish.", href: "/dashboard/admin/simulator-examples" },
  { id: "mining-examples", title: "Process Mining Examples", description: "Curate the process-mining samples users can adopt — capture a run, edit metadata, publish / unpublish.", href: "/dashboard/admin/mining-examples" },
  { id: "risk-control-examples", title: "Risk & Control Examples", description: "Curate the GRC examples users can adopt — process + risks/controls + mining effectiveness; edit metadata, publish / unpublish.", href: "/dashboard/admin/risk-control-examples" },
  { id: "groups", title: "Collaboration Groups", description: "Every Collaboration Group in the system.", href: "/dashboard/admin/groups" },
  { id: "ai-plan", title: "AI Plan Formats", description: "Saved AI two-phase plan format templates.", href: "/dashboard/admin/ai-plan-format" },
  { id: "org-settings", title: "Org Settings", description: "Manage Orgs, OrgAdmins, and cross-Org sharing.", href: "/dashboard/admin/org-settings" },
  { id: "entity-lists", title: "Entity Lists", description: "Org structures, external participants and IT systems for BPMN pool/lane naming.", href: "/dashboard/admin/entity-lists" },
  { id: "risk-controls", title: "Risk & Control Catalog", description: "Master library of Risks and Controls; projects adopt a copy, attach them to steps and export a Risk-Control Matrix.", href: "/dashboard/admin/risk-controls" },
  { id: "compliance", title: "Compliance Monitoring", description: "Org-wide control operating-effectiveness over time — trends + alerts from DiagramatixMINER runs across every project.", href: "/dashboard/compliance?from=/dashboard/admin" },
  { id: "sharing", title: "Project Sharing", description: "Every shared project plus its editors / viewers.", href: "/dashboard/admin/sharing" },
  { id: "scanner-rules", title: "BPMN Scanner Rules", description: "Rules used by the diagram issue scanner.", href: "/dashboard/admin/scanner-rules" },
  { id: "bubble-help", title: "Bubble Help", description: "The contextual help-cloud topics shown in the editor.", href: "/dashboard/admin/bubble-help" },
  { id: "user-guide", title: "Document Editor", description: "Edit the in-app User Guide and the SuperAdmin Technical Design Notes — WYSIWYG with tables & symbols; export any document to .docx.", href: "/dashboard/admin/user-guide" },
  { id: "tech-design-notes", title: "Technical Design Notes", description: "SuperAdmin-only low-level design notes (Simulator / Miner / RCM) + import/export standards. Edit in the Document Editor.", href: "/dashboard/admin/user-guide?collection=tech-design" },
  { id: "tech-design-notes-read", title: "Read Technical Design Notes", description: "Read-only view of the Technical Design Notes (no editor chrome).", href: "/tech-notes" },
  { id: "diagram-types", title: "Diagram Types", description: "The 2-character codes and pastel colours shown per diagram type.", href: "/dashboard/admin/diagram-types?from=/dashboard/admin" },
  { id: "diagram-type-sort", title: "Diagram Type Sort Order", description: "The order diagram types are listed across the app and in the project Diagram Type sort.", href: "/dashboard/diagram-type-sort-order?from=/dashboard/admin" },
  { id: "prompts", title: "AI Prompt Maintenance", description: "Maintain your own saved AI generation prompts.", href: "/dashboard/prompts?from=/dashboard/admin" },
  { id: "notifications", title: "Notifications & Feedback", description: "Inspect any user's notification feed — filter by Org & User.", href: "/notifications?from=/dashboard/admin" },
];

const TILE_ORDER_KEY = "dgx.superadmin.tileOrder";

function SuperAdminToolsGrid({ onShowUsers }: { onShowUsers: () => void }) {
  const router = useRouter();
  const [order, setOrder] = useState<string[]>(ADMIN_TILES.map(t => t.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Load the saved order on mount; merge so newly-added tiles always
  // appear (appended) and removed ids are dropped.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TILE_ORDER_KEY);
      const saved: string[] = raw ? JSON.parse(raw) : [];
      const known = new Set(ADMIN_TILES.map(t => t.id));
      const merged = saved.filter(id => known.has(id));
      for (const t of ADMIN_TILES) if (!merged.includes(t.id)) merged.push(t.id);
      setOrder(merged);
    } catch { /* default order */ }
  }, []);

  function persist(next: string[]) {
    setOrder(next);
    try { localStorage.setItem(TILE_ORDER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  function onDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) { setDraggingId(null); return; }
    const next = order.filter(id => id !== draggingId);
    const idx = next.indexOf(targetId);
    next.splice(idx, 0, draggingId);
    persist(next);
    setDraggingId(null);
  }

  const tileById = new Map(ADMIN_TILES.map(t => [t.id, t]));
  const tiles = order.map(id => tileById.get(id)).filter((t): t is AdminTile => !!t);

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900">SuperAdmin Tools</h2>
        <span className="text-[11px] text-gray-400">Drag tiles to reorder</span>
      </div>
      <div className="pr-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {tiles.map(t => (
            <div
              key={t.id}
              draggable
              onDragStart={() => setDraggingId(t.id)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => onDrop(t.id)}
              onClick={() => { if (t.users) onShowUsers(); else if (t.href) router.push(t.href); }}
              className={`relative bg-white border border-red-300 rounded-md p-4 transition-colors ${
                t.href || t.users ? "cursor-pointer hover:bg-red-50 hover:border-red-400" : ""
              } ${draggingId === t.id ? "opacity-50" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-red-700">{t.title}</h3>
                <span className="text-gray-300 select-none cursor-grab" title="Drag to reorder">⠿</span>
              </div>
              <p className="text-xs text-gray-600 mt-1.5 leading-snug">{t.description}</p>
              {t.ddl && (
                <div className="mt-2" onClick={e => e.stopPropagation()}>
                  <GenerateDdlButton />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
