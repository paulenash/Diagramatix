"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { AlertDialog } from "@/app/components/AlertDialog";
import { UsagePopover } from "@/app/components/UsagePopover";
import { AdminNotificationsButton } from "@/app/components/AdminNotificationsButton";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  currentDiagramId: string | null;
  currentDiagramName: string | null;
  _count: { projects: number; diagrams: number };
  /** Display label for the Subscription column — "Administration" for
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
  isAdmin: boolean;
}

interface Props {
  users: UserRow[];
  currentUserId: string;
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

export function AdminClient({ users, currentUserId }: Props) {
  const router = useRouter();
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1"
          >
            <span style={{ fontSize: "1.75em", lineHeight: 1 }}>{"\u2190"}</span>
            Dashboard
          </button>
          {/* Brand icon: sits just right of the back link as a permanent
              "you're inside Diagramatix" cue. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/diagramatix-icon.svg" alt="Diagramatix" className="w-7 h-7" />
          <h1 className="font-semibold text-gray-900">Admin — Registered Users</h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/dashboard/rules"
            className="text-xs text-orange-600 hover:text-orange-800 font-medium border border-orange-300 rounded px-2 py-1"
          >
            AI Rules &amp; Preferences
          </a>
          <a
            href="/dashboard/admin/database"
            className="text-xs text-orange-600 hover:text-orange-800 font-medium border border-orange-300 rounded px-2 py-1"
          >
            Database Access
          </a>
          <GenerateDdlButton />
          <a
            href="/dashboard/admin/archive"
            className="text-xs text-orange-600 hover:text-orange-800 font-medium border border-orange-300 rounded px-2 py-1"
          >
            System Archive
          </a>
          <a
            href="/dashboard/admin/subscriptions"
            className="text-xs text-orange-600 hover:text-orange-800 font-medium border border-orange-300 rounded px-2 py-1"
          >
            Subscription Prices and Limits
          </a>
          <a
            href="/dashboard/admin/features"
            className="text-xs text-orange-600 hover:text-orange-800 font-medium border border-orange-300 rounded px-2 py-1"
          >
            Features Catalog
          </a>
          <a
            href="/dashboard/admin/groups"
            className="text-xs text-orange-600 hover:text-orange-800 font-medium border border-orange-300 rounded px-2 py-1"
          >
            Groups
          </a>
          <a
            href="/dashboard/admin/ai-plan-format"
            className="text-xs text-orange-600 hover:text-orange-800 font-medium border border-orange-300 rounded px-2 py-1"
          >
            AI Plan Format
          </a>
          <a
            href="/dashboard/admin/scanner-rules"
            className="text-xs text-orange-600 hover:text-orange-800 font-medium border border-orange-300 rounded px-2 py-1"
          >
            Scanner Issues Rules
          </a>
          <AdminNotificationsButton />
        </div>
      </header>

      {/* Widened container (was max-w-4xl) so the Name / Status / Working
          on columns have room to breathe. Per-column min-widths declared
          on the <th> stops the smaller numeric / date columns from
          starving the text-heavy ones. */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <table className="w-full bg-white rounded-lg border border-gray-200 overflow-hidden table-fixed">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3" style={{ width: "15%" }}>Name</th>
              <th className="px-4 py-3" style={{ width: "17%" }}>Email</th>
              <th className="px-4 py-3" style={{ width: "11%" }}>Status</th>
              <th className="px-4 py-3" style={{ width: "18%" }}>Working on</th>
              <th className="px-4 py-3" style={{ width: "11%" }}>Subscription</th>
              <th className="px-4 py-3 text-center" style={{ width: "6%" }}>Projects</th>
              <th className="px-4 py-3 text-center" style={{ width: "6%" }}>Diagrams</th>
              <th className="px-4 py-3" style={{ width: "8%" }}>Registered</th>
              <th className="px-4 py-3" style={{ width: "8%" }}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => {
              const isYou = u.id === currentUserId;
              const p = presence(u.lastSeenAt, isYou);
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
                          ? "Administrator — bypasses all limits"
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
                          className="text-xs text-orange-600 hover:text-orange-800 font-medium border border-orange-300 rounded px-2 py-1 hover:bg-orange-50"
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
                        {!u.isAdmin && (
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
        <p className="text-xs text-gray-400 mt-4">
          {users.length} registered user(s) — {users.filter(u => presence(u.lastSeenAt, u.id === currentUserId).online).length} online
        </p>
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
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
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
      const ext = dbType === "mssql" ? "sql" : "sql";
      const dbLabel = { postgres: "PostgreSQL", mysql: "MySQL", mssql: "SQLServer" }[dbType] ?? dbType;
      const blob = new Blob([ddl], { type: "text/sql" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `diagramatix-schema-${dbLabel}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setOpen(false);
    } catch (err) {
      setErrorMessage("Failed to generate DDL: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="text-xs text-orange-600 hover:text-orange-800 font-medium border border-orange-300 rounded px-2 py-1">
        Generate Diagramatix DDL
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
          title="DDL generation failed"
          message={errorMessage}
          tone="error"
          onClose={() => setErrorMessage(null)}
        />
      )}
    </div>
  );
}
