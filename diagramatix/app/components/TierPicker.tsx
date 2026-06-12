"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Welcome tier picker — appears on the dashboard for any account that
 * hasn't yet chosen (or explicitly skipped) a tier.
 *
 * Loads the canonical four tiers + their headline limits from
 * /api/admin/subscriptions (public-read GET would be nicer but the
 * existing route is admin-gated, so we hit a slim read endpoint
 * below). Each tier card surfaces just the headline numbers — the
 * Subscription button on the dashboard exposes the full popover.
 *
 * Clicking Select on a tier PATCHes /api/me/subscription { tierId },
 * which flips hasChosenTier=true and restamps the trial clock.
 * Clicking "Stay on Free for now" POSTs { action: "skip" } — the user
 * remains on Free with their existing 30-day trial intact.
 */

export interface TierCard {
  id: string;
  name: string;
  priceMonthly: number;                 // AUD cents
  maxProjects: number | null;
  maxDiagramsPerTypePerProject: number | null;
  maxArchimateDiagramsTotal: number | null;
  maxAiAttempts: number | null;
  maxIndividualExports: number | null;
  maxBulkExports: number | null;
  trialDays: number | null;
}

const ORDER = ["free", "introductory", "professional", "expert"];

function fmt(n: number | null): string {
  return n === null ? "Unlimited" : String(n);
}

export function TierPicker({
  tiers,
  onDismiss,
}: {
  tiers: TierCard[];
  /** Called after either a Select or Skip succeeds — the dashboard
   *  refreshes server data so SSR'd snapshot reflects the new tier. */
  onDismiss: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sorted = [...tiers].sort(
    (a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id),
  );

  async function selectTier(tierId: string) {
    setSubmitting(tierId);
    setError(null);
    try {
      // Free tier doesn't go through Stripe — just flip
      // hasChosenTier via the existing PATCH path. Paid tiers go
      // through Stripe Checkout; the webhook will set the tier on
      // payment success.
      if (tierId === "free") {
        const res = await fetch("/api/me/subscription", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tierId }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Selection failed (${res.status})`);
        }
        router.refresh();
        onDismiss();
        return;
      }

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
      setError(err instanceof Error ? err.message : "Selection failed");
      setSubmitting(null);
    }
    // NOTE: don't clear submitting in the success path — we're about
    // to navigate away. Clearing would briefly show all buttons re-
    // enabled before the redirect lands.
  }

  async function skip() {
    setSubmitting("__skip__");
    setError(null);
    try {
      const res = await fetch("/api/me/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "skip" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Skip failed (${res.status})`);
      }
      router.refresh();
      onDismiss();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Skip failed");
    } finally {
      setSubmitting(null);
    }
  }

  // Trap-focus: Escape closes (treat as Skip in this phase).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) skip();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting]);

  return (
    <div className="fixed inset-0 bg-black/20 flex items-start justify-center z-50 overflow-auto p-6">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl my-auto">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            Choose your subscription tier
          </h2>
          <p className="text-xs text-gray-600 mt-1">
            Pick the plan that fits how much you'll use Diagramatix. You
            can change tiers later from your dashboard&apos;s Subscription
            button.{" "}
            <span className="text-gray-400">
              No payment is collected during this testing phase.
            </span>
          </p>
        </div>

        <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {sorted.map((tier) => {
            const isFree = tier.id === "free";
            return (
              <div
                key={tier.id}
                className={`border rounded-lg p-4 flex flex-col ${
                  isFree ? "border-gray-300" : "border-blue-300"
                }`}
              >
                <div className="mb-3">
                  <h3 className="text-base font-semibold text-gray-900">{tier.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {tier.priceMonthly === 0
                      ? "Free"
                      : `$${(tier.priceMonthly / 100).toFixed(0)} / month`}
                    {tier.trialDays !== null && (
                      <span className="ml-1 text-gray-400">
                        ({tier.trialDays}-day trial)
                      </span>
                    )}
                  </p>
                </div>
                <ul className="text-xs text-gray-700 space-y-1.5 flex-1 mb-4">
                  <li>
                    <span className="text-gray-500">Projects:</span>{" "}
                    <strong>{fmt(tier.maxProjects)}</strong>
                  </li>
                  <li>
                    <span className="text-gray-500">Diagrams / type / project:</span>{" "}
                    <strong>{fmt(tier.maxDiagramsPerTypePerProject)}</strong>
                  </li>
                  <li>
                    <span className="text-gray-500">Archimate (total):</span>{" "}
                    <strong>{fmt(tier.maxArchimateDiagramsTotal)}</strong>
                  </li>
                  <li>
                    <span className="text-gray-500">AI attempts:</span>{" "}
                    <strong>{fmt(tier.maxAiAttempts)}</strong>
                  </li>
                  <li>
                    <span className="text-gray-500">Individual exports:</span>{" "}
                    <strong>{fmt(tier.maxIndividualExports)}</strong>
                  </li>
                  <li>
                    <span className="text-gray-500">Bulk exports:</span>{" "}
                    <strong>{fmt(tier.maxBulkExports)}</strong>
                  </li>
                </ul>
                <button
                  disabled={submitting !== null}
                  onClick={() => selectTier(tier.id)}
                  className={`w-full py-2 text-xs font-medium rounded ${
                    isFree
                      ? "bg-gray-700 text-white hover:bg-gray-800"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {submitting === tier.id ? "Selecting…" : `Choose ${tier.name}`}
                </button>
              </div>
            );
          })}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-red-700">{error ?? ""}</span>
          <button
            disabled={submitting !== null}
            onClick={skip}
            className="text-xs text-gray-600 hover:text-gray-900 disabled:opacity-50"
          >
            {submitting === "__skip__" ? "Saving…" : "Stay on Free for now"}
          </button>
        </div>
      </div>
    </div>
  );
}
