/**
 * Feature Availability slice 5 (plan 2026-09-30): what people are TOLD — one
 * message builder, a notice instead of a silent failure, and warnings before
 * something stops working.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  check: { ok: false } as Record<string, unknown>,
  states: {} as Record<string, string>,
  required: null as string | null,
}));
vi.mock("@/app/lib/subscription", () => ({
  checkLimit: async () => mocks.check,
  isFeatureAvailable: async () => true,
  recordUsage: async () => {},
}));
vi.mock("@/app/lib/features/availability", () => ({
  getFeatureStates: async () => mocks.states,
  requiredLevelNameFor: async () => mocks.required,
}));

import { featureNotice, friendlyDate, limitNotice, noticeFromBody, policyNotice, trialNotice } from "@/app/lib/subscription/messages";
import { subscriptionWarnings, type WarnInput } from "@/app/lib/subscription/warnings";
import { announceNotice, downloadWithNotice, GATE_NOTICE_EVENT, showGateNotice } from "@/app/lib/subscription/gateNotice";
import { gateFeature, gateLimit } from "@/app/lib/subscription-route";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

describe("T5122 — the words: one message builder", () => {
  it("a monthly limit says how much, on which plan, and WHEN IT RESETS", () => {
    const n = limitNotice({ metric: "aiAttempts", label: "AI Generate attempts", tierName: "Introductory", current: 50, limit: 50, resetKind: "monthly", resetsOn: "2026-10-15" });
    expect(n.title).toBe("AI Generate attempts limit reached");
    expect(n.detail).toBe("You’ve used 50 of 50 on the Introductory plan. It resets on 15 Oct 2026. Upgrade to raise it now.");
    expect(n).toMatchObject({ kind: "limit", upgradeHref: "/pricing", upgradeLabel: "See plans", metric: "aiAttempts" });
  });

  it("a lifetime allowance says it never resets", () => {
    const n = limitNotice({ metric: "aiAttempts", label: "AI Generate attempts", tierName: "Free", current: 5, limit: 5, resetKind: "lifetime" });
    expect(n.detail).toContain("lifetime allowance");
    expect(n.detail).toContain("doesn’t reset");
  });

  it("a standing count (projects) says remove one or upgrade; a diagram-size cap says the diagram is over", () => {
    expect(limitNotice({ metric: "projects", label: "Projects", tierName: "Free", current: 1, limit: 1, resetKind: "count" }).detail)
      .toBe("The Free plan allows 1, and you have 1. Remove one, or upgrade for more.");
    const el = limitNotice({ metric: "bpmnElementsPerDiagram", label: "Elements per BPMN diagram", tierName: "Free", current: 25, limit: 20, resetKind: "count" });
    expect(el.title).toBe("This diagram is over your plan’s size limit");
    expect(el.detail).toContain("allows 20 elements");
    expect(el.detail).toContain("this one has 25");
  });

  it("a feature not in the plan names the plan that has it; switched off says so; a prerequisite says which", () => {
    expect(featureNotice({ feature: "simulator", featureLabel: "Simulator", state: "hidden", requiredTierName: "Expert" }).detail)
      .toBe("Simulator is included from the Expert plan. Upgrade to use it.");
    expect(featureNotice({ feature: "simulator", featureLabel: "Simulator", state: "hidden" }).detail).toBe("Simulator isn’t included in your plan. Upgrade to use it.");
    expect(featureNotice({ feature: "simulator", featureLabel: "Simulator", state: "disabled", requiredTierName: "Expert" }).title).toBe("Simulator is switched off for your plan");
    const dep = featureNotice({ feature: "mobile", featureLabel: "Mobile Diagramatix", state: "hidden", blockedByLabel: "Voice Assist" });
    expect(dep.title).toBe("Mobile Diagramatix needs Voice Assist");
    expect(dep.feature).toBe("mobile");
  });

  it("trial ended, and a policy refusal with no way forward", () => {
    expect(trialNotice("Free").title).toBe("Your Free trial has ended");
    expect(trialNotice("Free").detail).toContain("You can still open and edit what you have.");
    expect(policyNotice("AI features are turned off by your organisation's policy.")).toMatchObject({ kind: "policy", upgradeHref: null, upgradeLabel: null });
  });

  it("dates read as people say them", () => {
    expect(friendlyDate("2026-10-15")).toBe("15 Oct 2026");
    expect(friendlyDate("2026-10-15T00:00:00.000Z")).toBe("15 Oct 2026");
    expect(friendlyDate("")).toBe("");
    expect(friendlyDate("not a date")).toBe("not a date");
  });

  it("a 403 body means a notice: the structured one, or one rebuilt from the old shape; anything else is not a gate", () => {
    const made = limitNotice({ metric: "projects", label: "Projects", tierName: "Free", current: 1, limit: 1, resetKind: "count" });
    expect(noticeFromBody({ error: "x", notice: made })).toEqual(made);
    expect(noticeFromBody({ error: "Projects limit reached on the Free tier (1 of 1).", metric: "projects", current: 1, limit: 1 })).toMatchObject({ kind: "limit", detail: "Projects limit reached on the Free tier (1 of 1)." });
    expect(noticeFromBody({ metric: "feature", feature: "sharepoint" })).toMatchObject({ kind: "feature", feature: "sharepoint" });
    expect(noticeFromBody({ metric: "trial", error: "Your Free trial has expired. Upgrade to continue." })).toMatchObject({ kind: "trial" });
    expect(noticeFromBody({ error: "AI features are turned off by your organisation's policy." })).toMatchObject({ kind: "policy" });
    expect(noticeFromBody({})).toBeNull();
    expect(noticeFromBody(null)).toBeNull();
    expect(noticeFromBody("nope")).toBeNull();
  });
});

describe("T5123 — the server's 403 carries the notice (and keeps the old fields)", () => {
  beforeEach(() => { mocks.states = {}; mocks.required = null; });

  it("a limit block: error and metric as before, plus message and a structured notice with the reset date", async () => {
    mocks.check = { ok: false, reason: "AI Generate attempts limit reached on the Introductory tier (50 of 50).", metric: "aiAttempts", current: 50, limit: 50, label: "AI Generate attempts", tierName: "Introductory", resetKind: "monthly", resetsOn: "2026-10-15" };
    const res = (await gateLimit("u1", "aiAttempts"))!;
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ error: "AI Generate attempts limit reached on the Introductory tier (50 of 50).", metric: "aiAttempts", current: 50, limit: 50 });
    expect(body.message).toContain("It resets on 15 Oct 2026.");
    expect(body.notice).toMatchObject({ kind: "limit", upgradeHref: "/pricing" });
  });

  it("a trial block", async () => {
    mocks.check = { ok: false, reason: "Your Free trial has expired. Upgrade to continue.", metric: "trial", current: 0, limit: 0, tierName: "Free" };
    const body = await (await gateLimit("u1", "projects"))!.json();
    expect(body.notice.kind).toBe("trial");
    expect(body.metric).toBe("trial");
  });

  it("an allowed check returns null", async () => {
    mocks.check = { ok: true };
    expect(await gateLimit("u1", "projects")).toBeNull();
  });

  it("a feature block names the plan that has it; a prerequisite is named; an available feature passes", async () => {
    mocks.states = { simulator: "hidden" };
    mocks.required = "Expert";
    const body = await (await gateFeature("u1", "simulator"))!.json();
    expect(body).toMatchObject({ metric: "feature", feature: "simulator", error: "Simulator is not available on your subscription." });
    expect(body.notice.detail).toBe("Simulator is included from the Expert plan. Upgrade to use it.");

    mocks.states = { mobile: "hidden", "process-review": "available", "voice-assist": "hidden" };
    const dep = await (await gateFeature("u1", "mobile"))!.json();
    expect(dep.notice.title).toBe("Mobile Diagramatix needs Voice Assist");

    mocks.states = { simulator: "available" };
    expect(await gateFeature("u1", "simulator")).toBeNull();
  });
});

describe("T5124 — warnings BEFORE something stops working", () => {
  const base: WarnInput = {
    tierName: "Introductory", isAdmin: false, trial: { daysRemaining: null, expired: false }, comp: null,
    billing: { status: "active", endsAt: null }, metrics: [],
  };
  const now = new Date("2026-10-10T00:00:00Z");
  const w = (o: Partial<WarnInput>) => subscriptionWarnings({ ...base, ...o }, now);

  it("nothing wrong, nothing said; a SuperAdmin who bypasses limits is never warned", () => {
    expect(w({})).toEqual([]);
    expect(w({ isAdmin: true, trial: { daysRemaining: 1, expired: false }, billing: { status: "past_due", endsAt: null } })).toEqual([]);
  });

  it("a failed payment is the loudest, with a way to fix it", () => {
    const r = w({ billing: { status: "past_due", endsAt: null } });
    expect(r[0]).toMatchObject({ id: "payment-failed", severity: "danger", cta: { action: "billing" } });
    expect(w({ billing: { status: "unpaid", endsAt: null } })[0].id).toBe("payment-failed");
  });

  it("a subscription running out says when and what happens; none for a date in the past or far away", () => {
    const r = w({ billing: { status: "active", endsAt: "2026-10-20T00:00:00Z" } });
    expect(r[0].id).toBe("sub-ending");
    expect(r[0].text).toBe("Your Introductory subscription ends on 20 Oct 2026, after which you’ll move to the Free plan.");
    expect(w({ billing: { status: "active", endsAt: "2026-09-01T00:00:00Z" } })).toEqual([]);
    expect(w({ billing: { status: "active", endsAt: "2027-06-01T00:00:00Z" } })).toEqual([]);
  });

  it("a trial: quiet until a week out, then louder as it nears; ended says what is paused", () => {
    expect(w({ trial: { daysRemaining: 20, expired: false } })).toEqual([]);
    expect(w({ trial: { daysRemaining: 7, expired: false } })[0]).toMatchObject({ id: "trial-ending", severity: "info", text: "Your trial ends in 7 days." });
    expect(w({ trial: { daysRemaining: 3, expired: false } })[0].severity).toBe("warn");
    expect(w({ trial: { daysRemaining: 1, expired: false } })[0]).toMatchObject({ severity: "danger", text: "Your trial ends in 1 day." });
    expect(w({ trial: { daysRemaining: 0, expired: false } })[0].text).toBe("Your trial ends today.");
    const over = w({ trial: { daysRemaining: null, expired: true } })[0];
    expect(over).toMatchObject({ id: "trial-expired", severity: "danger" });
    expect(over.text).toContain("paused");
  });

  it("a complimentary upgrade about to end (within a week)", () => {
    expect(w({ comp: { expiresAt: "2026-10-14T00:00:00Z" } })[0]).toMatchObject({ id: "comp-ending", text: "Your complimentary Introductory access ends on 14 Oct 2026." });
    expect(w({ comp: { expiresAt: "2026-12-01T00:00:00Z" } })).toEqual([]);
  });

  it("a limit: a warning at 80% (with the reset date), a stronger one when it is all used; unlimited and worst-case rows are left alone", () => {
    const m = (metric: string, current: number, limit: number | null, periodEndsAt: string | null = null) => ({ metric, label: metric === "aiAttempts" ? "AI Generate attempts" : "Projects", current, limit, periodEndsAt });
    expect(w({ metrics: [m("aiAttempts", 39, 50)] })).toEqual([]);
    const at80 = w({ metrics: [m("aiAttempts", 40, 50, "2026-10-14")] })[0];
    expect(at80).toMatchObject({ id: "limit-aiAttempts-80", severity: "warn", text: "AI Generate attempts: you’ve used 40 of 50. It resets on 14 Oct 2026." });
    expect(w({ metrics: [m("projects", 5, 5)] })[0]).toMatchObject({ id: "limit-projects-full", severity: "danger", text: "Projects: you’ve used all 5." });
    expect(w({ metrics: [m("aiAttempts", 999, null)] })).toEqual([]);
    expect(w({ metrics: [m("bpmnElementsPerDiagram", 20, 20), m("diagramsPerTypePerProject", 3, 3)] })).toEqual([]);
  });

  it("several at once come most urgent first", () => {
    const r = w({
      billing: { status: "past_due", endsAt: null },
      trial: { daysRemaining: 5, expired: false },
      metrics: [{ metric: "aiAttempts", label: "AI Generate attempts", current: 45, limit: 50, periodEndsAt: null }],
    });
    expect(r.map((x) => x.severity)).toEqual(["danger", "warn", "info"]);
  });
});

describe("T5125 — the browser turns a refusal into a notice, never a silent return", () => {
  let events: unknown[] = [];
  beforeEach(() => {
    events = [];
    vi.stubGlobal("window", { dispatchEvent: (e: CustomEvent) => { events.push(e.detail); return true; } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("a gate 403 is shown (and its body is still readable by the caller); a 403 with no words, a 200 and a 500 are not", async () => {
    const res = new Response(JSON.stringify({ error: "Projects limit reached on the Free tier (1 of 1).", metric: "projects" }), { status: 403 });
    expect(await showGateNotice(res)).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "limit" });
    expect((await res.json()).metric).toBe("projects");
    expect(await showGateNotice(new Response("{}", { status: 403 }))).toBe(false);
    expect(await showGateNotice(new Response("{}", { status: 200 }))).toBe(false);
    expect(await showGateNotice(new Response(JSON.stringify({ error: "boom", metric: "projects" }), { status: 500 }))).toBe(false);
    expect(await showGateNotice(new Response("not json", { status: 403 }))).toBe(false);
    expect(events).toHaveLength(1);
  });

  it("a download that is refused shows the notice instead of navigating to JSON; one that fails otherwise says so", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Bulk exports limit reached on the Free tier (0 of 0).", metric: "bulkExports" }), { status: 403 })));
    expect(await downloadWithNotice("/api/export/visio-v3/bulk?projectId=p", "x.vsdx")).toBe(false);
    expect(events[0]).toMatchObject({ kind: "limit" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("kaboom", { status: 500 })));
    expect(await downloadWithNotice("/api/x", "x.vsdx")).toBe(false);
    expect(events[1]).toMatchObject({ title: "Download failed", detail: "kaboom" });
  });

  it("announceNotice raises the event the host listens for", () => {
    announceNotice(policyNotice("no"));
    expect(events).toEqual([policyNotice("no")]);
    expect(GATE_NOTICE_EVENT).toBe("dgx:gate-notice");
  });
});

describe("T5126 — wired: the silent failures now speak, and the strip and the host are on the page", () => {
  it("the notice host is mounted once, in the root layout; the modal is a real dialog, not a browser one", () => {
    expect(read("app/layout.tsx")).toContain("<GateNoticeHost />");
    const host = read("app/components/GateNoticeHost.tsx");
    expect(host).toContain('role="alertdialog"');
    expect(host).toContain('e.key === "Escape"');
    expect(host).not.toMatch(/\balert\(/);
  });

  it("project create, diagram create (dashboard and project), copy diagram, DDL import, SharePoint export and the imports use the notice", () => {
    const d = read("app/(dashboard)/dashboard/DashboardClient.tsx");
    expect(d).toContain("if (!res.ok) { await showGateNotice(res); return; }");
    expect(d).toContain('if (!(await showGateNotice(res))) setError("Failed to create diagram");');
    expect(d.split("await showGateNotice(projRes);").length - 1).toBeGreaterThanOrEqual(1);
    expect(d.split("await showGateNotice(diagRes);").length - 1).toBeGreaterThanOrEqual(1);
    const p = read("app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx");
    expect(p).toContain('if (!(await showGateNotice(res))) setError("Failed to create diagram");');
    expect(p).toContain("if (!res.ok) { await showGateNotice(res); return; }");
    expect(p).toContain('if (!vr.ok) { await showGateNotice(vr); throw new Error("Visio export failed"); }');
    expect(p.split("if (await showGateNotice(resp)) return;").length - 1).toBe(2);
    const e = read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    expect(e).toContain('if (!vr.ok) { await showGateNotice(vr); throw new Error("Visio export failed"); }');
    expect(e).toContain("if (await showGateNotice(resp)) return;");
  });

  it("the Visio downloads that were plain links go through downloadWithNotice (a refusal used to land on a page of JSON)", () => {
    expect(read("app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx")).toContain("void downloadWithNotice(`/api/export/visio-v3/bulk?projectId=");
    expect(read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx")).toContain("void downloadWithNotice(`/api/export/visio-v3?diagramId=${diagramId}&profile=v1.6`");
  });

  it("the warning strip is on the dashboard, fed by the usage snapshot's billing state; dismissal holds for the day", () => {
    const d = read("app/(dashboard)/dashboard/DashboardClient.tsx");
    expect(d).toContain("<SubscriptionBanner");
    expect(d).toContain("billing: usageSnapshot.billing,");
    const b = read("app/components/SubscriptionBanner.tsx");
    expect(b).toContain("const key = JSON.stringify(input);");
    expect(b).toContain('aria-label="Dismiss for today"');
    expect(read("app/lib/subscription.ts")).toContain("status: user.stripeSubscriptionStatus,");
  });
});
