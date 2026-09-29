/**
 * What a person is TOLD when the subscription stops them — one place for the
 * words, so a limit reads the same wherever it is hit and always says what it
 * is, what to do, and when it resets.
 *
 * (Before 2026-09-30 the same cap was worded three different ways, none of them
 * said whether a monthly limit resets or a lifetime one never does, and the
 * server's 403 offered no way forward. Several screens swallowed it entirely.)
 *
 * Pure and client-safe: the API builds a notice with it and puts it in the 403
 * body; the browser can rebuild one from an older-shaped body.
 */

export type NoticeKind = "limit" | "feature" | "trial" | "policy";

export interface GateNotice {
  kind: NoticeKind;
  /** A short heading: "Projects limit reached". */
  title: string;
  /** The sentence(s) that say what happened and what to do. */
  detail: string;
  /** Where the way forward is; null when there is none (an organisation's policy, say). */
  upgradeHref: string | null;
  upgradeLabel: string | null;
  /** The limit metric or feature key behind it, for callers that branch. */
  metric?: string;
  feature?: string;
}

const PLANS = "/pricing";

/** "2026-10-15" → "15 Oct 2026". Tolerates a full ISO string; returns the input when it is not a date. */
export function friendlyDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export interface LimitInput {
  metric: string;
  /** "Projects", "AI Generate attempts" … */
  label: string;
  tierName: string;
  current: number;
  limit: number;
  /** lifetime: never resets; monthly: resets on `resetsOn`; count: a standing cap (remove something or upgrade). */
  resetKind: "lifetime" | "monthly" | "count";
  resetsOn?: string | null;
}

export function limitNotice(o: LimitInput): GateNotice {
  const isElements = o.metric === "bpmnElementsPerDiagram" || o.metric === "nonBpmnElementsPerDiagram";
  const title = isElements ? "This diagram is over your plan’s size limit" : `${o.label} limit reached`;
  let detail: string;
  if (isElements) {
    detail = `The ${o.tierName} plan allows ${o.limit} elements in a diagram; this one has ${o.current}. Remove some, or upgrade for larger diagrams.`;
  } else if (o.resetKind === "monthly") {
    detail = `You’ve used ${o.current} of ${o.limit} on the ${o.tierName} plan.${o.resetsOn ? ` It resets on ${friendlyDate(o.resetsOn)}.` : ""} Upgrade to raise it now.`;
  } else if (o.resetKind === "lifetime") {
    detail = `You’ve used ${o.current} of the ${o.limit} included in the ${o.tierName} plan. This is a lifetime allowance — it doesn’t reset. Upgrade to continue.`;
  } else {
    detail = `The ${o.tierName} plan allows ${o.limit}, and you have ${o.current}. Remove one, or upgrade for more.`;
  }
  return { kind: "limit", title, detail, upgradeHref: PLANS, upgradeLabel: "See plans", metric: o.metric };
}

export interface FeatureInput {
  feature: string;
  featureLabel: string;
  /** The resolved state: "hidden" (not in the plan) or "disabled" (switched off). */
  state: "hidden" | "disabled" | "available";
  /** A prerequisite that is holding it back (its label), when that is the reason. */
  blockedByLabel?: string | null;
  /** The lowest plan that includes it, when known. */
  requiredTierName?: string | null;
}

export function featureNotice(o: FeatureInput): GateNotice {
  const base = { kind: "feature" as const, upgradeHref: PLANS, upgradeLabel: "See plans", feature: o.feature, metric: "feature" };
  if (o.blockedByLabel) {
    return { ...base, title: `${o.featureLabel} needs ${o.blockedByLabel}`, detail: `${o.featureLabel} needs ${o.blockedByLabel}, which isn’t included in your plan. Upgrade to a plan that includes both.` };
  }
  if (o.state === "disabled") {
    return { ...base, title: `${o.featureLabel} is switched off for your plan`, detail: `${o.featureLabel} is visible on your plan but can’t be used yet.${o.requiredTierName ? ` It’s available on ${o.requiredTierName}.` : ""}` };
  }
  return {
    ...base,
    title: `${o.featureLabel} isn’t in your plan`,
    detail: o.requiredTierName
      ? `${o.featureLabel} is included from the ${o.requiredTierName} plan. Upgrade to use it.`
      : `${o.featureLabel} isn’t included in your plan. Upgrade to use it.`,
  };
}

export function trialNotice(tierName: string): GateNotice {
  return {
    kind: "trial",
    title: `Your ${tierName} trial has ended`,
    detail: "Creating, generating, exporting and importing are paused until you upgrade. You can still open and edit what you have.",
    upgradeHref: PLANS, upgradeLabel: "See plans", metric: "trial",
  };
}

/** An organisation policy, or any other refusal with words but no way forward. */
export function policyNotice(message: string): GateNotice {
  return { kind: "policy", title: "Not allowed", detail: message, upgradeHref: null, upgradeLabel: null };
}

/**
 * The notice a 403 body means — the structured \`notice\` the server now sends, else one rebuilt from the
 * older shape ({ error, metric, current, limit, feature }) — or null when the body is not a gate at all.
 */
export function noticeFromBody(body: unknown): GateNotice | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const n = b.notice as Partial<GateNotice> | undefined;
  if (n && typeof n === "object" && typeof n.title === "string" && typeof n.detail === "string") {
    return {
      kind: (n.kind as NoticeKind) ?? "limit", title: n.title, detail: n.detail,
      upgradeHref: n.upgradeHref ?? null, upgradeLabel: n.upgradeLabel ?? null,
      metric: n.metric, feature: n.feature,
    };
  }
  const error = typeof b.error === "string" ? b.error : "";
  if (b.metric === "feature") {
    return featureNotice({ feature: String(b.feature ?? ""), featureLabel: String(b.feature ?? "This feature"), state: "hidden" });
  }
  if (b.metric === "trial") return { ...trialNotice("trial"), detail: error || trialNotice("trial").detail };
  if (typeof b.metric === "string") {
    return { kind: "limit", title: "Limit reached", detail: error || "You’ve reached a limit on your plan.", upgradeHref: PLANS, upgradeLabel: "See plans", metric: b.metric };
  }
  return error ? policyNotice(error) : null;
}
