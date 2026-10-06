"use client";

import { useEffect, useState } from "react";
import type { UsageSnapshot } from "@/app/lib/subscription";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { changeNote, changeOptions, formatPlanDate, SUBSCRIBE_NOTE, type ChangeKind } from "@/app/lib/stripe/planChange";

/**
 * The plan section of the "Your subscription" window (Paul, 2026-10-06):
 *   Free     → "Upgrade to …" for each paid plan (Stripe Checkout; billing starts now);
 *   paid     → the current plan, then "Downgrade to …" for each paid plan below and "Upgrade to …" for each above,
 *              each with its terms, confirmed before anything happens (POST /api/stripe/change-plan).
 * A downgrade already asked for is shown with a way to cancel it.
 */
interface PlanRow { id: string; name: string; priceMonthly: number }

const price = (c: number) => `$${(c / 100).toFixed(0)}/month`;

export function PlanChanger({ snapshot, onBusy, onError }: {
  snapshot: UsageSnapshot;
  onBusy: (busy: boolean) => void;
  onError: (msg: string | null) => void;
}) {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [confirm, setConfirm] = useState<{ kind: ChangeKind; tier: PlanRow } | null>(null);
  useEffect(() => {
    let on = true;
    fetch("/api/plans").then((r) => (r.ok ? r.json() : null)).then((j) => { if (on && j) setPlans(j.plans ?? []); }).catch(() => {});
    return () => { on = false; };
  }, []);

  const current = snapshot.tier.id;
  const paid = current !== "free";
  const periodEnd = snapshot.billing.periodEnd ? new Date(snapshot.billing.periodEnd) : null;
  const { downgrades, upgrades } = changeOptions(current);
  const row = (id: string): PlanRow => plans.find((p) => p.id === id) ?? { id, name: id.charAt(0).toUpperCase() + id.slice(1), priceMonthly: 0 };
  const pending = snapshot.billing.pendingChange;

  async function checkout(tierId: string) {
    onBusy(true); onError(null);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tierId }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Checkout failed (${res.status})`);
      if (!body.url) throw new Error("Checkout returned no URL");
      window.location.href = body.url;
    } catch (e) { onError(e instanceof Error ? e.message : "Checkout failed"); onBusy(false); }
  }

  async function change(tierId: string) {
    onBusy(true); onError(null); setConfirm(null);
    try {
      const res = await fetch("/api/stripe/change-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tierId }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `The change failed (${res.status})`);
      window.location.reload();
    } catch (e) { onError(e instanceof Error ? e.message : "The change failed"); onBusy(false); }
  }

  async function cancelPending() {
    onBusy(true); onError(null);
    try {
      const res = await fetch("/api/stripe/change-plan", { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Could not cancel (${res.status})`);
      window.location.reload();
    } catch (e) { onError(e instanceof Error ? e.message : "Could not cancel"); onBusy(false); }
  }

  const btn = "px-3 py-1.5 text-xs font-medium rounded disabled:opacity-50 w-48 text-left";
  return (
    <div className="mb-4 rounded-lg border border-gray-200 px-4 py-3" aria-label="Plan">
      <p className="text-[11px] text-gray-500">Your plan</p>
      <p className="text-sm font-semibold text-gray-900">
        {snapshot.tier.name}
        {paid && <span className="ml-2 text-xs font-normal text-gray-500">{price(row(current).priceMonthly)}</span>}
      </p>
      {paid && periodEnd && (
        <p className="text-[11px] text-gray-500 mt-0.5">
          Renews each month on the anniversary of the day you subscribed — next on {formatPlanDate(periodEnd)}.
        </p>
      )}

      {pending && (
        <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" aria-label="Scheduled change">
          Scheduled: you move to <strong>{pending.tierName}</strong> on {formatPlanDate(new Date(pending.effectiveAt))}.
          <button onClick={cancelPending} className="ml-2 underline hover:text-amber-700">Cancel this change</button>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {!paid && upgrades.map((t) => (
          <div key={t} className="flex items-center gap-3">
            <button onClick={() => checkout(t)} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>Upgrade to {row(t).name}</button>
            <span className="text-[11px] text-gray-500">{price(row(t).priceMonthly)}</span>
          </div>
        ))}
        {!paid && <p className="text-[11px] text-gray-500">{SUBSCRIBE_NOTE}</p>}

        {paid && downgrades.map((t) => (
          <div key={t} className="flex items-center gap-3">
            <button onClick={() => setConfirm({ kind: "downgrade", tier: row(t) })} disabled={!!pending}
              className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-50`}>Downgrade to {row(t).name}</button>
            <span className="text-[11px] text-gray-500">{price(row(t).priceMonthly)} · from the end of this month</span>
          </div>
        ))}
        {paid && upgrades.map((t) => (
          <div key={t} className="flex items-center gap-3">
            <button onClick={() => setConfirm({ kind: "upgrade", tier: row(t) })}
              className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>Upgrade to {row(t).name}</button>
            <span className="text-[11px] text-gray-500">{price(row(t).priceMonthly)} · effective immediately</span>
          </div>
        ))}
        {paid && pending && downgrades.length > 0 && <p className="text-[11px] text-gray-500">Cancel the scheduled change above to choose another downgrade.</p>}
      </div>

      {confirm && (
        <ConfirmDialog
          title={`${confirm.kind === "downgrade" ? "Downgrade" : "Upgrade"} to ${confirm.tier.name}?`}
          message={`${confirm.tier.name} is ${price(confirm.tier.priceMonthly)}. ${changeNote(confirm.kind, periodEnd)}`}
          confirmLabel={confirm.kind === "downgrade" ? "Schedule downgrade" : "Upgrade now"}
          cancelLabel="Cancel"
          onCancel={() => setConfirm(null)}
          onConfirm={() => change(confirm.tier.id)}
        />
      )}
    </div>
  );
}
