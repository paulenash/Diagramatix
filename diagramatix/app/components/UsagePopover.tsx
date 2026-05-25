"use client";

import { useEffect, useState } from "react";
import type { UsageSnapshot } from "@/app/lib/subscription";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";

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
      await refetchSnapshot();
      onTierChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tier change failed");
    } finally {
      setChanging(false);
    }
  }

  async function refetchSnapshot() {
    if (mode.kind !== "admin") return;
    const refetch = await fetch(`/api/admin/users/${mode.userId}/usage`);
    if (refetch.ok) {
      const fresh: UsageSnapshot = await refetch.json();
      setSnapshot(fresh);
    }
  }

  // Comp modal state.
  const [showCompModal, setShowCompModal] = useState(false);
  const [compTierId, setCompTierId] = useState<"introductory" | "professional" | "expert">("expert");
  const [compDurationDays, setCompDurationDays] = useState<number>(30);

  async function grantComp() {
    if (mode.kind !== "admin") return;
    setChanging(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${mode.userId}/comp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tierId: compTierId, durationDays: compDurationDays }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Comp grant failed (${res.status})`);
      }
      setShowCompModal(false);
      await refetchSnapshot();
      onTierChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comp grant failed");
    } finally {
      setChanging(false);
    }
  }

  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);

  function requestRevokeComp() {
    if (mode.kind !== "admin") return;
    setShowRevokeConfirm(true);
  }

  async function performRevokeComp() {
    if (mode.kind !== "admin") return;
    setShowRevokeConfirm(false);
    setChanging(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${mode.userId}/comp`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Comp revoke failed (${res.status})`);
      }
      await refetchSnapshot();
      onTierChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comp revoke failed");
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
                <p className="text-sm font-semibold text-gray-900">
                  {snapshot.tier.name}
                  {snapshot.comp && (
                    <span className="ml-1.5 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-medium align-middle">
                      comp
                    </span>
                  )}
                </p>
                {snapshot.comp && (
                  <p className="text-[10px] text-purple-700">
                    Expires {new Date(snapshot.comp.expiresAt).toLocaleDateString()}
                    {" · "}
                    {Math.max(0, Math.ceil((new Date(snapshot.comp.expiresAt).getTime() - Date.now()) / 86400000))} day(s) left
                  </p>
                )}
                {snapshot.trial.daysRemaining !== null && !snapshot.isAdmin && !snapshot.comp && (
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
                <span className="ml-3 text-xs text-gray-300">|</span>
                {snapshot.comp ? (
                  <button
                    disabled={changing}
                    onClick={requestRevokeComp}
                    className="px-2 py-1 text-xs rounded border border-purple-300 text-purple-700 hover:bg-purple-50 disabled:opacity-50"
                    title="Cancel the active comp grant now; user reverts to underlying tier."
                  >
                    Revoke comp
                  </button>
                ) : (
                  <button
                    disabled={changing}
                    onClick={() => setShowCompModal(true)}
                    className="px-2 py-1 text-xs rounded border border-purple-300 text-purple-700 hover:bg-purple-50 disabled:opacity-50"
                    title="Grant a higher tier temporarily without touching the user's underlying Stripe subscription."
                  >
                    Grant comp
                  </button>
                )}
              </>
            )}
            {mode.kind === "self" && snapshot && !snapshot.isAdmin && (
              <>
                <SelfUpgradeButtons
                  currentTierId={snapshot.tier.id}
                  disabled={changing}
                  onStart={() => { setChanging(true); setError(null); }}
                  onError={(msg) => { setError(msg); setChanging(false); }}
                />
                {snapshot.tier.id !== "free" && (
                  <ManageSubscriptionButton
                    disabled={changing}
                    onStart={() => { setChanging(true); setError(null); }}
                    onError={(msg) => { setError(msg); setChanging(false); }}
                  />
                )}
              </>
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

      {/* Grant comp modal — admin picks a tier + duration. Rendered
          INSIDE the popover root so its z-index sits above the
          popover backdrop. Clicking the modal backdrop closes it
          without affecting the popover behind. */}
      {showCompModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCompModal(false); }}
        >
          <div className="bg-white rounded-lg shadow-xl p-5 w-full max-w-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Grant comp tier</h3>
            <p className="text-[11px] text-gray-500 mb-4">
              Temporarily grant a higher tier without touching the user&apos;s
              underlying Stripe subscription. Monthly usage counters reset to
              zero so they get a fresh quota at the new tier.
            </p>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tier</label>
            <div className="flex gap-2 mb-4">
              {(["introductory", "professional", "expert"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setCompTierId(t)}
                  className={`flex-1 px-2 py-1 text-xs rounded border ${
                    compTierId === t
                      ? "bg-purple-100 border-purple-400 text-purple-800 font-medium"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Duration (days)</label>
            <div className="flex gap-2 mb-2">
              {[7, 30, 90, 365].map((d) => (
                <button
                  key={d}
                  onClick={() => setCompDurationDays(d)}
                  className={`flex-1 px-2 py-1 text-xs rounded border ${
                    compDurationDays === d
                      ? "bg-purple-100 border-purple-400 text-purple-800 font-medium"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={1}
              max={365 * 3}
              value={compDurationDays}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n) && n > 0) setCompDurationDays(n);
              }}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded mb-4"
              placeholder="Custom number of days"
            />
            <p className="text-[10px] text-gray-500 mb-4">
              Expires {new Date(Date.now() + compDurationDays * 86400000).toLocaleDateString()}.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCompModal(false)}
                disabled={changing}
                className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={grantComp}
                disabled={changing}
                className="px-3 py-1.5 text-xs text-white bg-purple-600 rounded hover:bg-purple-700 disabled:opacity-50"
              >
                {changing ? "Granting…" : "Grant"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRevokeConfirm && (
        <ConfirmDialog
          title="Revoke comp grant?"
          message="The user reverts to their underlying subscription tier on next page load. Their monthly usage counters are not reset."
          confirmLabel="Revoke comp"
          cancelLabel="Cancel"
          destructive
          onCancel={() => setShowRevokeConfirm(false)}
          onConfirm={performRevokeComp}
        />
      )}
    </div>
  );
}

/**
 * Renders one button per paid tier above the user's current tier. Click
 * → POST /api/stripe/checkout → redirect to Stripe Checkout. The
 * webhook (Stage 3) will set the new tier when payment completes;
 * Stripe's success_url returns the user to /dashboard?checkout=success.
 */
function SelfUpgradeButtons({
  currentTierId,
  disabled,
  onStart,
  onError,
}: {
  currentTierId: string;
  disabled: boolean;
  onStart: () => void;
  onError: (msg: string) => void;
}) {
  const TIER_ORDER = ["free", "introductory", "professional", "expert"];
  const PAID = [
    { id: "introductory", label: "Introductory" },
    { id: "professional", label: "Professional" },
    { id: "expert", label: "Expert" },
  ];
  const currentRank = TIER_ORDER.indexOf(currentTierId);
  const upgradeOptions = PAID.filter(
    (p) => TIER_ORDER.indexOf(p.id) > currentRank,
  );
  if (upgradeOptions.length === 0) return null;

  async function startCheckout(tierId: string) {
    onStart();
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tierId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Checkout failed (${res.status})`);
      }
      const { url } = (await res.json()) as { url?: string };
      if (!url) throw new Error("Checkout returned no URL");
      window.location.href = url;
    } catch (err) {
      onError(err instanceof Error ? err.message : "Checkout failed");
    }
  }

  return (
    <>
      {upgradeOptions.map((opt) => (
        <button
          key={opt.id}
          onClick={() => startCheckout(opt.id)}
          disabled={disabled}
          className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Upgrade to {opt.label}
        </button>
      ))}
    </>
  );
}

/**
 * Opens the Stripe Billing Portal for the signed-in user — where they
 * update card details, view invoices, and cancel their subscription.
 * Cancellation handled there flows back via the
 * customer.subscription.deleted webhook.
 */
function ManageSubscriptionButton({
  disabled,
  onStart,
  onError,
}: {
  disabled: boolean;
  onStart: () => void;
  onError: (msg: string) => void;
}) {
  async function openPortal() {
    onStart();
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Portal failed (${res.status})`);
      }
      const { url } = (await res.json()) as { url?: string };
      if (!url) throw new Error("Portal returned no URL");
      window.location.href = url;
    } catch (err) {
      onError(err instanceof Error ? err.message : "Portal failed");
    }
  }

  return (
    <button
      onClick={openPortal}
      disabled={disabled}
      className="px-3 py-1.5 text-xs font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      Manage Subscription
    </button>
  );
}
