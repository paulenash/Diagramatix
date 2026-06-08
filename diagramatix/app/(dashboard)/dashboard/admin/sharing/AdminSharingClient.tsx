"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProjectShareDialog } from "@/app/(dashboard)/dashboard/ProjectShareDialog";

export interface SharedProjectRow {
  id: string;
  name: string;
  updatedAt: string;
  orgId: string;
  orgName: string;
  owner: { id: string; name: string | null; email: string } | null;
  diagramCount: number;
  shareCount: number;
  shares: Array<{
    role: "VIEW" | "EDIT";
    user: { id: string; name: string | null; email: string };
  }>;
}

export interface OrgOption {
  id: string;
  name: string;
}

interface Props {
  rows: SharedProjectRow[];
  isSuperAdmin: boolean;
  /** Caller's active Org. Used by the back-link logic + as the
   *  selected value when no ?orgId filter is set (for OrgAdmins). */
  activeOrgId: string;
  /** Every Org in the system — populated only for SuperAdmin so they
   *  can filter via the dropdown. Empty for OrgAdmin. */
  orgOptions: OrgOption[];
  /** The Org currently filtering the list. null means "all orgs" —
   *  only meaningful for SuperAdmin. */
  currentOrgFilter: string | null;
}

/**
 * Project Sharing oversight table.
 *
 * Visual chrome matches the other /dashboard/admin/* sub-pages:
 * back-link + brand icon + h1, light-gray body, white card with a
 * table. Per-row actions reuse the same `ProjectShareDialog` the
 * project owners use on the regular dashboard — consistency is the
 * whole point of "mirror the Project Owner view".
 *
 * Silent membership is automatic: the dialog's POST/PUT/DELETE calls
 * land at `/api/projects/[id]/shares*` which gate on
 * `requireProjectAccess(..., 'owner')`. Slice 7c's silent elevation
 * makes those guards pass for SuperAdmin/OrgAdmin without writing a
 * ProjectShare row for them. The Open Project link relies on the
 * same elevation to grant view + edit access downstream.
 */
export function AdminSharingClient({
  rows,
  isSuperAdmin,
  orgOptions,
  currentOrgFilter,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Currently-open share dialog. We render exactly one at a time so
  // the optimistic-state churn stays scoped.
  const [dialogRow, setDialogRow] = useState<SharedProjectRow | null>(null);

  // ?from=<url> overrides the default back destination so the user
  // returns to where they came from.
  const fromParam = searchParams.get("from");
  const safeFrom = fromParam && fromParam.startsWith("/") ? fromParam : null;
  const backHref = safeFrom
    ?? (isSuperAdmin ? "/dashboard/admin" : "/dashboard/org-admin");
  const backLabel = backHref === "/dashboard/admin"
    ? "SuperAdmin"
    : backHref === "/dashboard/org-admin"
      ? "OrgAdmin"
      : backHref === "/dashboard"
        ? "Dashboard"
        : "Back";

  // Change the ?orgId filter — SuperAdmin only. Triggers a server
  // round-trip via router.push so the list reflects the new scope.
  function setOrgFilter(value: string) {
    const params = new URLSearchParams();
    if (value) params.set("orgId", value);
    const qs = params.toString();
    router.push(qs ? `/dashboard/admin/sharing?${qs}` : `/dashboard/admin/sharing`);
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <a href={backHref} className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
              <span>&larr;</span>
              <span className="underline">{backLabel}</span>
            </a>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/diagramatix-icon.svg" alt="Diagramatix" className="w-7 h-7" />
            <h1 className="text-lg font-semibold text-gray-900">Project Sharing</h1>
          </div>
          {/* Org filter — SuperAdmin only. OrgAdmins are scoped to
              their active Org, no filter needed. */}
          {isSuperAdmin && orgOptions.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Org:</label>
              <select
                value={currentOrgFilter ?? ""}
                onChange={(e) => setOrgFilter(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
              >
                <option value="">All Orgs</option>
                {orgOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          )}
        </header>

        <main className="flex-1 overflow-auto p-6">
          <p className="text-xs text-gray-500 mb-4 max-w-3xl">
            Every project in scope that has at least one share. You
            silently act as the project owner for any of these — your
            edits to share lists land normally, but no ProjectShare row
            is written for you and you don&apos;t appear in any list.
            Open Project drops you straight into the project as a full
            editor.
          </p>

          {rows.length === 0 ? (
            <div className="bg-white rounded-md border border-gray-200 border-dashed py-12 text-center">
              <p className="text-sm text-gray-500">
                {currentOrgFilter
                  ? "No shared projects in this Org."
                  : isSuperAdmin
                    ? "No shared projects across any Org yet."
                    : "No shared projects in this Org yet."}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3" style={{ width: "22%" }}>Project</th>
                    {isSuperAdmin && (
                      <th className="px-4 py-3" style={{ width: "13%" }}>Org</th>
                    )}
                    <th className="px-4 py-3" style={{ width: "18%" }}>Owner</th>
                    <th className="px-4 py-3 text-center" style={{ width: "9%" }}>Diagrams</th>
                    <th className="px-4 py-3 text-center" style={{ width: "9%" }}>Shared with</th>
                    <th className="px-4 py-3" style={{ width: isSuperAdmin ? "19%" : "26%" }}>Recipients</th>
                    <th className="px-4 py-3 text-right" style={{ width: "10%" }}></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium truncate" title={r.name}>
                        {r.name}
                      </td>
                      {isSuperAdmin && (
                        <td className="px-4 py-3 text-xs text-gray-600 truncate" title={r.orgName}>
                          {r.orgName}
                        </td>
                      )}
                      <td className="px-4 py-3 text-xs text-gray-700 truncate" title={r.owner?.email ?? ""}>
                        {r.owner ? (
                          <>
                            <p className="font-medium text-gray-800 truncate">
                              {(r.owner.name ?? "").trim() || r.owner.email}
                            </p>
                            <p className="text-[10px] text-gray-500 truncate">{r.owner.email}</p>
                          </>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-center">{r.diagramCount}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-center">{r.shareCount}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {/* Compact recipient list — up to three names,
                            then "+N more". Editors marked with a small
                            blue "·E" suffix; viewers stay plain. */}
                        {r.shares.length === 0 ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <span className="truncate block">
                            {r.shares.slice(0, 3).map((s, i) => (
                              <span key={s.user.id} title={s.user.email}>
                                {(s.user.name ?? "").trim() || s.user.email}
                                {s.role === "EDIT" && (
                                  <span className="text-[9px] text-blue-600 ml-0.5">·E</span>
                                )}
                                {i < Math.min(2, r.shares.length - 1) && ", "}
                              </span>
                            ))}
                            {r.shares.length > 3 && (
                              <span className="text-gray-500"> +{r.shares.length - 3} more</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <button
                            onClick={() => setDialogRow(r)}
                            className="text-xs text-orange-600 hover:text-orange-800 font-medium border border-orange-300 rounded px-2 py-1 hover:bg-orange-50"
                            title="Edit this project's share list"
                          >
                            Manage
                          </button>
                          <a
                            href={`/dashboard/projects/${r.id}`}
                            className="text-xs text-orange-600 hover:text-orange-800 font-medium border border-orange-300 rounded px-2 py-1 hover:bg-orange-50"
                            title="Open as a silent member with full edit access"
                          >
                            Open
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {rows.length >= 200 && (
            <p className="text-[10px] text-gray-400 mt-3">
              Showing the first 200 shared projects. Narrow with the
              Org filter to see the rest.
            </p>
          )}
        </main>
      </div>

      {/* Share-management dialog — same component the project owner
          uses on the regular dashboard. Server-side permission gates
          all run as normal; silent elevation makes them pass. When
          the dialog closes, refresh the page so the row counts +
          recipient list update without a stale snapshot. */}
      {dialogRow && (
        <ProjectShareDialog
          projectId={dialogRow.id}
          projectName={dialogRow.name}
          ownerUserId={dialogRow.owner?.id ?? null}
          onClose={() => {
            setDialogRow(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
