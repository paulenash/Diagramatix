"use client";

import { useEffect, useState } from "react";
import type { UsageSnapshot } from "@/app/lib/subscription";

/**
 * Subscription usage popover. Two modes:
 *
 *  - "admin": admin is inspecting another user. Loads the snapshot from
 *    `/api/admin/users/[id]/usage` on open. "Change Tier" buttons fire
 *    a PATCH to `/api/admin/users/[id]/subscription` and refetch.
 *
 *  - "self": the signed-in user is viewing their own usage. Initial
 *    snapshot is passed in (SSR'd by the dashboard page). No tier
 *    change UI; an "Upgrade" placeholder appears for paid pathways
 *    once self-serve billing ships.
 */

export type UsagePopoverMode =
  | { kind: "admin"; userId: string; userEmail: string; userName: string | null }
  | { kind: "self"; initial: UsageSnapshot };

const TIER_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "free", label: "Free" },
  { id: "introductory", label: "Introductory" },
  { id: "professional", label: "Professional" },
  { id: "expert", label: "Expert" },
];

export function UsagePopover({
  mode,
  onClose,
  onTierChanged,
}: {
  mode: UsagePopoverMode;
  onClose: () => void;
  /** Fired after a successful admin tier change. The page using the
   *  popover can use this to refresh whatever list it's showing. */
  onTierChanged?: () => void;
}) {
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(
    mode.kind === "self" ? mode.initial : null,
  );
  const [loading, setLoading] = useState(mode.kind === "admin");
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  // Admin mode: fetch the snapshot on mount.
  useEffect(() => {
    if (mode.kind !== "admin") return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/users/${mode.userId}/usage`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Failed to load usage (${r.status})`);
        return r.json();
      })
      .then((data: UsageSnapshot) => {
        if (cancelled) return;
        setSnapshot(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  async function changeTier(tierId: string) {
    if (mode.kind !== "admin") return;
    setChanging(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${mode.userId}/subscription`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tierId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Tier change failed (${res.status})`);
      }
      // Refetch the snapshot so the popover reflects the new tier
      // immediately, then notify the parent.
      const refetch = await fetch(`/api/admin/users/${mode.userId}/usage`);
      if (refetch.ok) {
        const fresh: UsageSnapshot = await refetch.json();
        setSnapshot(fresh);
      }
      onTierChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tier change failed");
    } finally {
      setChanging(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <div>
              {mode.kind === "admin" ? (
                <>
                  <h3 className="text-sm font-semibold text-gray-900">
                    {mode.userName ?? mode.userEmail}
                  </h3>
                  <p className="text-xs text-gray-500">{mode.userEmail}</p>
                </>
              ) : (
                <h3 className="text-sm font-semibold text-gray-900">Your subscription</h3>
              )}
            </div>
            {snapshot && (
              <div className="text-right">
                <p className="text-xs text-gray-500">Current tier</p>
                <p className="text-sm font-semibold text-gray-900">{snapshot.tier.name}</p>
                {snapshot.trial.daysRemaining !== null && !snapshot.isAdmin && (
                  <p className={`text-[10px] ${snapshot.trial.expired ? "text-red-600" : "text-gray-500"}`}>
                    {snapshot.trial.expired
                      ? "Trial expired"
                      : `Trial: ${snapshot.trial.daysRemaining} day(s) remaining`}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {loading && <p className="text-xs text-gray-500">Loading…</p>}
          {error && <p className="text-xs text-red-700">{error}</p>}
          {snapshot && (
            <table className="w-full text-xs">
              <thead className="border-b border-gray-200">
                <tr className="text-left text-gray-600">
                  <th className="py-2 font-medium">Metric</th>
                  <th className="py-2 font-medium text-right">Current</th>
                  <th className="py-2 font-medium text-right">Limit</th>
                  <th className="py-2 font-medium pl-4">Period</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.metrics.map((row) => (
                  <tr
                    key={row.metric}
                    className={`border-b border-gray-50 last:border-b-0 ${row.overLimit ? "text-red-700" : "text-gray-800"}`}
                  >
                    <td className="py-1.5">{row.label}</td>
                    <td className="py-1.5 text-right tabular-nums">{row.current}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {row.limit === null ? (snapshot.isAdmin ? "—" : "Unlimited") : row.limit}
                    </td>
                    <td className="py-1.5 pl-4 text-gray-500">{row.periodLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {mode.kind === "admin" && snapshot && !snapshot.isAdmin && (
              <>
                <span className="text-xs text-gray-600">Change tier:</span>
                {TIER_OPTIONS.map((opt) => {
                  const isCurrent = snapshot.tier.id === opt.id;
                  return (
                    <button
                      key={opt.id}
                      disabled={changing || isCurrent}
                      onClick={() => changeTier(opt.id)}
                      className={`px-2 py-1 text-xs rounded border ${
                        isCurrent
                          ? "bg-blue-100 border-blue-300 text-blue-700 cursor-default"
                          : "border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </>
            )}
            {mode.kind === "self" && (
              <button
                disabled
                title="Self-serve upgrade coming soon"
                className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white opacity-50 cursor-not-allowed"
              >
                Upgrade (coming soon)
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
