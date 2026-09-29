/**
 * The warnings a person should see BEFORE something stops working: a limit
 * nearly used, a trial about to end, a payment that failed, a subscription
 * about to lapse, a complimentary upgrade about to expire.
 *
 * Until 2026-09-30 none of these existed: the only warning was the limit already
 * hit, `past_due` was stored and never shown, and a comp or a cancelled
 * subscription simply ran out one day. Pure, so the rules can be tested.
 */
import { friendlyDate } from "./messages";

export type WarnSeverity = "info" | "warn" | "danger";

export interface SubWarning {
  /** Stable per condition, so a dismissal sticks for the day. */
  id: string;
  severity: WarnSeverity;
  text: string;
  cta?: { label: string; href?: string; action?: "billing" };
}

export interface WarnInput {
  tierName: string;
  /** A SuperAdmin who bypasses limits (not one acting as a level). */
  isAdmin: boolean;
  trial: { daysRemaining: number | null; expired: boolean };
  comp: { expiresAt: string } | null;
  billing: { status: string | null; endsAt: string | null };
  metrics: { metric: string; label: string; current: number; limit: number | null; periodEndsAt: string | null }[];
}

/** Standing counts whose "worst case" numbers are not a plain usage figure — no percentage warning for these. */
const NO_PERCENT = new Set(["bpmnElementsPerDiagram", "nonBpmnElementsPerDiagram", "diagramsPerTypePerProject"]);

const DAY = 24 * 60 * 60 * 1000;
const rank: Record<WarnSeverity, number> = { danger: 0, warn: 1, info: 2 };

export function subscriptionWarnings(s: WarnInput, now: Date = new Date()): SubWarning[] {
  if (s.isAdmin) return [];
  const out: SubWarning[] = [];

  // Payment failed — the one that costs the most when missed.
  if (s.billing.status === "past_due" || s.billing.status === "unpaid") {
    out.push({
      id: "payment-failed", severity: "danger",
      text: "Your last payment didn’t go through. Update your payment method to keep your plan.",
      cta: { label: "Update payment", action: "billing" },
    });
  }

  // About to lapse (cancelled, running to the end of the paid period).
  if (s.billing.endsAt) {
    const ends = new Date(s.billing.endsAt);
    const days = Math.ceil((ends.getTime() - now.getTime()) / DAY);
    if (days > 0 && days <= 30) {
      out.push({
        id: "sub-ending", severity: days <= 7 ? "warn" : "info",
        text: `Your ${s.tierName} subscription ends on ${friendlyDate(s.billing.endsAt)}, after which you’ll move to the Free plan.`,
        cta: { label: "Manage billing", action: "billing" },
      });
    }
  }

  // Trial.
  if (s.trial.expired) {
    out.push({
      id: "trial-expired", severity: "danger",
      text: `Your ${s.tierName} trial has ended — creating, generating, exporting and importing are paused.`,
      cta: { label: "See plans", href: "/pricing" },
    });
  } else if (s.trial.daysRemaining !== null && s.trial.daysRemaining <= 7 && !s.comp) {
    const d = s.trial.daysRemaining;
    out.push({
      id: "trial-ending", severity: d <= 1 ? "danger" : d <= 3 ? "warn" : "info",
      text: d <= 0 ? "Your trial ends today." : `Your trial ends in ${d} day${d === 1 ? "" : "s"}.`,
      cta: { label: "See plans", href: "/pricing" },
    });
  }

  // A complimentary upgrade about to run out.
  if (s.comp) {
    const days = Math.ceil((new Date(s.comp.expiresAt).getTime() - now.getTime()) / DAY);
    if (days > 0 && days <= 7) {
      out.push({
        id: "comp-ending", severity: "info",
        text: `Your complimentary ${s.tierName} access ends on ${friendlyDate(s.comp.expiresAt)}.`,
        cta: { label: "See plans", href: "/pricing" },
      });
    }
  }

  // Limits: 100% is a block; 80% is the warning that lets someone act first.
  for (const m of s.metrics) {
    if (m.limit === null || m.limit <= 0 || NO_PERCENT.has(m.metric)) continue;
    const ratio = m.current / m.limit;
    const resets = m.periodEndsAt ? ` It resets on ${friendlyDate(m.periodEndsAt)}.` : "";
    if (ratio >= 1) {
      out.push({ id: `limit-${m.metric}-full`, severity: "danger", text: `${m.label}: you’ve used all ${m.limit}.${resets}`, cta: { label: "See plans", href: "/pricing" } });
    } else if (ratio >= 0.8) {
      out.push({ id: `limit-${m.metric}-80`, severity: "warn", text: `${m.label}: you’ve used ${m.current} of ${m.limit}.${resets}`, cta: { label: "See plans", href: "/pricing" } });
    }
  }

  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
