"use client";

import { useEffect, useMemo, useState } from "react";
import { subscriptionWarnings, type SubWarning, type WarnInput } from "@/app/lib/subscription/warnings";

/**
 * The warning strip on the dashboard: a payment that failed, a subscription
 * about to end, a trial about to run out or already over, a complimentary
 * upgrade about to expire, a limit nearly (or fully) used. One line — the most
 * urgent — with its way forward, and a Dismiss that holds for the day.
 *
 * The rules are in app/lib/subscription/warnings.ts (pure, tested); this only
 * draws the first warning that has not been dismissed today.
 */
const KEY = (id: string) => `diagramatix.subWarning.dismissed.${id}`;
const today = () => new Date().toISOString().slice(0, 10);

const STYLE: Record<SubWarning["severity"], string> = {
  danger: "bg-red-50 border-red-200 text-red-800",
  warn: "bg-amber-50 border-amber-200 text-amber-900",
  info: "bg-blue-50 border-blue-200 text-blue-900",
};

export function SubscriptionBanner({ input }: { input: WarnInput }) {
  const key = JSON.stringify(input);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const warnings = useMemo(() => subscriptionWarnings(input), [key]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const gone = new Set<string>();
    try { for (const w of warnings) if (localStorage.getItem(KEY(w.id)) === today()) gone.add(w.id); } catch { /* storage blocked: show it */ }
    setDismissed(gone);
  }, [warnings]);

  const w = warnings.find((x) => !dismissed.has(x.id));
  if (!w) return null;

  async function openBilling() {
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.url) { window.location.href = j.url; return; }
    } finally { setBusy(false); }
    window.location.href = "/pricing";
  }
  function dismiss() {
    try { localStorage.setItem(KEY(w!.id), today()); } catch { /* not kept */ }
    setDismissed((d) => new Set(d).add(w!.id));
  }

  return (
    <div role="status" aria-label="Subscription notice" className={`flex items-center gap-3 border-b px-4 py-2 text-sm ${STYLE[w.severity]}`}>
      <span className="flex-1">{w.text}</span>
      {w.cta?.action === "billing" && (
        <button onClick={() => void openBilling()} disabled={busy} className="px-2.5 py-1 text-xs font-medium rounded border border-current hover:bg-white/50 disabled:opacity-50">{w.cta.label}</button>
      )}
      {w.cta?.href && (
        <a href={w.cta.href} className="px-2.5 py-1 text-xs font-medium rounded border border-current hover:bg-white/50">{w.cta.label}</a>
      )}
      <button onClick={dismiss} className="text-xs opacity-70 hover:opacity-100" aria-label="Dismiss for today">Dismiss</button>
    </div>
  );
}
