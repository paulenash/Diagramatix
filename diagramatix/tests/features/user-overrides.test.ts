/**
 * Slice 10 (plan 2026-09-30, Paul's addendum): a SuperAdmin customises ONE person's
 * limits, settings and features without changing their plan — and reverts them.
 * Rulings: a note is required; an optional expiry reverts by itself; an override
 * survives a plan change UNLESS the new plan already covers it.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";

const db = vi.hoisted(() => {
  const levels: Record<string, Record<string, unknown>> = {
    free: { id: "free", name: "Free", sortOrder: 1, maxProjects: 1, trialDays: 30, aiAttemptsResetMonthly: false, individualExportsResetMonthly: false, individualImportsResetMonthly: false, maxAiAttempts: 5, maxBpmnElementsPerDiagram: 20, maxNonBpmnElementsPerDiagram: 15 },
    expert: { id: "expert", name: "Expert", sortOrder: 4, maxProjects: null, trialDays: null, aiAttemptsResetMonthly: true, individualExportsResetMonthly: true, individualImportsResetMonthly: true, maxAiAttempts: 500, maxBpmnElementsPerDiagram: null, maxNonBpmnElementsPerDiagram: null },
  };
  return {
    levels, user: null as null | Record<string, unknown>, actAs: null as string | null, projects: 0,
    matrix: [] as { levelId: string; featureKey: string; state: string }[],
  };
});
vi.mock("@/app/lib/features/actAs", async (orig) => ({ ...(await orig<typeof import("@/app/lib/features/actAs")>()), currentActAsLevel: async () => db.actAs }));
vi.mock("@/app/lib/db", () => ({
  prisma: {
    user: { findUnique: async () => db.user && ({ ...db.user, subscriptionLevel: db.levels[(db.user.subscriptionLevelId as string) ?? "free"] ?? null }) },
    orgMember: { findMany: async () => [] },
    subscriptionLevel: { findMany: async () => Object.values(db.levels), findUnique: async (a: { where: { id: string } }) => db.levels[a.where.id] ?? null },
    featureAvailability: { findMany: async (a: { where: { levelId: string } }) => db.matrix.filter((r) => r.levelId === a.where.levelId) },
    project: { count: async () => db.projects },
    diagram: { count: async () => 0, groupBy: async () => [], findMany: async () => [] },
    aiDiagramGeneration: { count: async () => 0 },
    usageCounter: { upsert: async () => {}, findUnique: async () => null, findFirst: async () => null, findMany: async () => [] },
  },
}));

import {
  applyFeatureOverrides, applyLimitOverrides, coerceLimitValue, describeFeatures, describeLimits, featureRow, hasAnyOverride,
  limitRow, LIMIT_FIELDS, overrideValue, overridesExpired,
} from "@/app/lib/features/userOverrides";
import { getFeatureStates } from "@/app/lib/features/availability";
import { checkLimit, getUsageSnapshot } from "@/app/lib/subscription";
import { elementCountLimitFor } from "@/app/lib/diagram/elementLimitServer";
import { clearLevelOrders } from "@/app/lib/features/effectiveLevel";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const F = (k: string) => LIMIT_FIELDS.find((f) => f.key === k)!;
const past = new Date(Date.now() - 86400000);
const future = new Date(Date.now() + 30 * 86400000);

describe("T5140 — the rule: what an override does", () => {
  it("a GRANT (raises access above the plan it was set on) applies while the plan gives less", () => {
    const r = limitRow(F("maxProjects"), 1, { v: 20, base: 1 }, false);
    expect(r).toMatchObject({ plan: 1, override: 20, effective: 20, custom: true, covered: false });
  });

  it("…and steps aside once the plan gives at least as much (an upgrade covers it): kept on file, doing nothing", () => {
    expect(limitRow(F("maxProjects"), 25, { v: 20, base: 1 }, false)).toMatchObject({ effective: 25, covered: true, custom: true });
    expect(limitRow(F("maxProjects"), 20, { v: 20, base: 1 }, false)).toMatchObject({ effective: 20, covered: true });
    expect(limitRow(F("maxProjects"), null, { v: 20, base: 1 }, false), "unlimited plan").toMatchObject({ effective: null, covered: true });
  });

  it("a RESTRICTION (lowers access) always applies — even after an upgrade: it was deliberate", () => {
    expect(limitRow(F("maxAiAttempts"), 500, { v: 10, base: 500 }, false)).toMatchObject({ effective: 10, covered: false });
    expect(limitRow(F("maxAiAttempts"), 5000, { v: 10, base: 500 }, false)).toMatchObject({ effective: 10 });
    expect(limitRow(F("maxProjects"), null, { v: 3, base: null }, false), "capping an unlimited plan").toMatchObject({ effective: 3 });
  });

  it("unlimited (null) counts as the largest: a grant to unlimited is covered only by an unlimited plan", () => {
    expect(limitRow(F("maxProjects"), 5, { v: null, base: 5 }, false)).toMatchObject({ effective: null, covered: false });
    expect(limitRow(F("maxProjects"), null, { v: null, base: 5 }, false)).toMatchObject({ effective: null, covered: true });
  });

  it("the switches (reset monthly) always apply; no override means the plan", () => {
    expect(limitRow(F("aiAttemptsResetMonthly"), false, { v: true, base: false }, false)).toMatchObject({ effective: true, covered: false });
    expect(limitRow(F("maxProjects"), 7, undefined, false)).toMatchObject({ effective: 7, custom: false, override: undefined });
  });

  it("everything stops at the expiry (it reverts by itself, like a comp)", () => {
    expect(overridesExpired(past)).toBe(true);
    expect(overridesExpired(future)).toBe(false);
    expect(overridesExpired(null)).toBe(false);
    expect(limitRow(F("maxProjects"), 1, { v: 20, base: 1 }, true)).toMatchObject({ effective: 1, custom: true });
    const plan = { maxProjects: 1, maxAiAttempts: 5 };
    expect(applyLimitOverrides(plan, { maxProjects: { v: 20, base: 1 } }, past)).toBe(plan);
    expect(applyLimitOverrides(plan, { maxProjects: { v: 20, base: 1 } }, future)).toEqual({ maxProjects: 20, maxAiAttempts: 5 });
  });

  it("applyLimitOverrides ignores unknown keys, returns the same row when nothing changes, and never mutates", () => {
    const plan = { maxProjects: 1 };
    expect(applyLimitOverrides(plan, { notAField: { v: 9, base: 1 } })).toBe(plan);
    expect(applyLimitOverrides(plan, null)).toBe(plan);
    const out = applyLimitOverrides(plan, { maxProjects: { v: 9, base: 1 } });
    expect(out).toEqual({ maxProjects: 9 });
    expect(plan).toEqual({ maxProjects: 1 });
  });

  it("features: a grant applies, and is covered once the plan gives it; a restriction stays; a bare string (the older form) always applies", () => {
    expect(featureRow("sharing", "hidden", { s: "available", base: "hidden" }, false)).toMatchObject({ effective: "available", covered: false });
    expect(featureRow("sharing", "available", { s: "available", base: "hidden" }, false)).toMatchObject({ effective: "available", covered: true });
    expect(featureRow("sharing", "hidden", { s: "disabled", base: "hidden" }, false).effective).toBe("disabled");
    expect(featureRow("sharing", "available", { s: "disabled", base: "hidden" }, false), "a middle-state grant the plan now beats").toMatchObject({ effective: "available", covered: true });
    expect(featureRow("sharing", "available", { s: "hidden", base: "available" }, false), "a restriction").toMatchObject({ effective: "hidden", covered: false });
    expect(featureRow("sharing", "hidden", "available", false), "older bare-string form").toMatchObject({ effective: "available", covered: false });
    expect(featureRow("sharing", "available", { s: "hidden", base: "available" }, true).effective, "expired").toBe("available");
    expect(overrideValue({ s: "available", base: "hidden" })).toBe("available");
    expect(overrideValue("hidden")).toBe("hidden");
    expect(overrideValue("nonsense")).toBeUndefined();
  });

  it("applyFeatureOverrides only touches known keys; describe rows show plan / override / effective", () => {
    const map = { a: "hidden", b: "available" };
    expect(applyFeatureOverrides(map, { a: { s: "available", base: "hidden" }, ghost: "available" })).toEqual({ a: "available", b: "available" });
    const rows = describeFeatures(map, { a: { s: "available", base: "hidden" } }, ["a", "b"]);
    expect(rows[0]).toMatchObject({ key: "a", plan: "hidden", override: "available", effective: "available", custom: true });
    expect(rows[1]).toMatchObject({ key: "b", custom: false });
    const lim = describeLimits({ maxProjects: 1 }, { maxProjects: { v: 20, base: 1 } });
    expect(lim.find((r) => r.key === "maxProjects")).toMatchObject({ plan: 1, override: 20, effective: 20 });
    expect(lim).toHaveLength(LIMIT_FIELDS.length);
  });

  it("values from the panel: whole numbers, blank = unlimited, booleans for switches, nothing else", () => {
    expect(coerceLimitValue("maxProjects", "25")).toEqual({ ok: true, value: 25 });
    expect(coerceLimitValue("maxProjects", null)).toEqual({ ok: true, value: null });
    expect(coerceLimitValue("maxProjects", "-1").ok).toBe(false);
    expect(coerceLimitValue("maxProjects", "2.5").ok).toBe(false);
    expect(coerceLimitValue("maxProjects", "").ok).toBe(false);
    expect(coerceLimitValue("aiAttemptsResetMonthly", true)).toEqual({ ok: true, value: true });
    expect(coerceLimitValue("aiAttemptsResetMonthly", "yes").ok).toBe(false);
    expect(coerceLimitValue("nope", 1).ok).toBe(false);
    expect(hasAnyOverride({}, null)).toBe(false);
    expect(hasAnyOverride({ maxProjects: { v: 1, base: 1 } }, null)).toBe(true);
    expect(hasAnyOverride({}, { sharing: "available" })).toBe(true);
  });
});

describe("T5141 — the resolvers honour it (and only for that person)", () => {
  function asUser(o: Record<string, unknown> = {}, level = "free") {
    db.user = { id: "u1", email: "someone@example.com", createdAt: new Date("2026-01-01"), subscriptionAssignedAt: new Date("2026-09-01"), subscriptionEndsAt: null, subscriptionLevelId: level, compTierLevelId: null, compTierExpiresAt: null, compTierGrantedAt: null, featureOverrides: null, limitOverrides: {}, overrideNote: null, overridesExpireAt: null, stripeSubscriptionStatus: null, ...o };
  }
  beforeEach(() => { db.user = null; db.actAs = null; db.projects = 0; db.matrix = []; clearLevelOrders(); });

  it("a raised project cap lets a Free person create more; the plan (and anyone else on it) is untouched", async () => {
    db.projects = 1;
    asUser();
    expect((await checkLimit("u1", "projects")).ok, "Free: 1 project, has 1").toBe(false);
    asUser({ limitOverrides: { maxProjects: { v: 20, base: 1 } } });
    expect((await checkLimit("u1", "projects")).ok).toBe(true);
    expect(db.levels.free.maxProjects, "the plan row itself is never changed").toBe(1);
  });

  it("upgrading to a plan that already covers it: the override steps aside (Expert is unlimited)", async () => {
    db.projects = 500;
    asUser({ limitOverrides: { maxProjects: { v: 20, base: 1 } } }, "expert");
    expect((await checkLimit("u1", "projects")).ok, "Expert: unlimited, not capped at the old 20").toBe(true);
  });

  it("a restriction survives an upgrade: an unlimited plan capped for this person", async () => {
    db.projects = 3;
    asUser({ limitOverrides: { maxProjects: { v: 3, base: null } } }, "expert");
    expect((await checkLimit("u1", "projects")).ok).toBe(false);
  });

  it("an expired override no longer applies", async () => {
    db.projects = 1;
    asUser({ limitOverrides: { maxProjects: { v: 20, base: 1 } }, overridesExpireAt: past });
    expect((await checkLimit("u1", "projects")).ok).toBe(false);
  });

  it("the usage snapshot shows the effective limit and says the account is customised; the editor's element cap follows it", async () => {
    asUser({ limitOverrides: { maxProjects: { v: 20, base: 1 }, maxBpmnElementsPerDiagram: { v: 200, base: 20 } } });
    const snap = (await getUsageSnapshot("u1"))!;
    expect(snap.customised).toBe(true);
    expect(snap.metrics.find((m) => m.metric === "projects")?.limit).toBe(20);
    expect(await elementCountLimitFor("u1", "bpmn")).toBe(200);
    expect(await elementCountLimitFor("u1", "state-machine"), "not overridden: the plan's").toBe(15);
    asUser();
    expect((await getUsageSnapshot("u1"))!.customised).toBe(false);
  });

  it("a SuperAdmin acting as a level sees the level as itself — their own overrides are ignored", async () => {
    db.projects = 1;
    asUser({ email: "paul@nashcc.com.au", limitOverrides: { maxProjects: { v: 20, base: 1 } } }, "expert");
    db.actAs = "free";
    expect((await checkLimit("u1", "projects")).ok, "Free's cap of 1 bites").toBe(false);
    expect((await getUsageSnapshot("u1"))!.customised).toBe(false);
    expect(await elementCountLimitFor("u1", "bpmn")).toBe(20);
  });

  it("feature overrides: a grant applies, expires, and a restriction holds; the prerequisite rule still applies after", async () => {
    db.matrix = [{ levelId: "free", featureKey: "sharing", state: "hidden" }, { levelId: "free", featureKey: "voice-assist", state: "hidden" }];
    asUser({ featureOverrides: { sharing: { s: "available", base: "hidden" } } });
    expect((await getFeatureStates("u1")).sharing).toBe("available");
    asUser({ featureOverrides: { sharing: { s: "available", base: "hidden" } }, overridesExpireAt: past });
    expect((await getFeatureStates("u1")).sharing).toBe("hidden");
    asUser({ featureOverrides: { mobile: { s: "available", base: "hidden" } } });
    expect((await getFeatureStates("u1")).mobile, "cannot lift a feature above what it needs").toBe("hidden");
    db.matrix = [];
    asUser({ featureOverrides: { simulator: { s: "hidden", base: "available" } } });
    expect((await getFeatureStates("u1")).simulator).toBe("hidden");
  });
});

describe("T5142 — the API, the panel and the rulings", () => {
  const api = read("app/api/admin/users/[id]/overrides/route.ts");

  it("SuperAdmin only, blocked during read-only impersonation, every change audited", () => {
    expect(api.split('!isSuperuser(session)').length - 1).toBe(3);
    expect(api.split("blockReadOnlyImpersonation(session)").length - 1).toBe(2);
    expect(api).toContain("AUDIT.UserOverridesUpdate");
    expect(api).toContain("AUDIT.UserOverridesRevert");
  });

  it("a NOTE is required whenever anything is customised; the expiry must be in the future and is optional", () => {
    expect(api).toContain("A note is required: say why this person is customised.");
    expect(api).toContain("The expiry must be a date in the future.");
    expect(api).toContain("body.expiresAt === null");
  });

  it("each override records what the plan gave WHEN IT WAS SET (the reference for 'the upgrade now covers it')", () => {
    expect(api).toContain("limits[k] = { v: c.value, base: (plan.row[k] as LimitValue) ?? null };");
    expect(api).toContain("features[k] = { s: raw as FState, base: (plan.matrix[k] ?? \"available\") as FState };");
  });

  it("'inherit' reverts one key; DELETE reverts everything and clears the note and expiry; the plan row is never written", () => {
    expect(api).toContain('raw === "inherit"');
    expect(api).toContain("\"limitOverrides\" = \\'{}\\'::jsonb, \"featureOverrides\" = NULL, \"overrideNote\" = NULL, \"overridesExpireAt\" = NULL");
    expect(api).not.toMatch(/subscriptionLevel\.(update|upsert|create)/);
  });

  it("the panel shows plan / this person / in effect with a Revert per row, Revert all with an on-page confirmation (no browser dialog), a note and an expiry — and says the comp stays separate", () => {
    const ui = read("app/components/UserOverridesPanel.tsx");
    expect(ui).toContain('aria-label="Limits and settings"');
    expect(ui).toContain('aria-label="Features"');
    expect(ui).toContain("Revert all to the plan");
    expect(ui).toContain("Yes, revert");
    expect(ui).not.toMatch(/\b(confirm|alert)\(/);
    expect(ui).toContain("Note (required");
    expect(ui).toContain("Grant comp / Revoke comp (the free upgrade) is separate and unchanged.");
    expect(ui).toContain("(the plan now covers this)");
  });

  it("the Registered Users table has a Customise button with a 'custom' badge (replacing Features); the customer's popover says allowances were set by support", () => {
    const admin = read("app/(dashboard)/dashboard/admin/AdminClient.tsx");
    expect(admin).toContain("UserOverridesPanel");
    expect(admin).toContain("Customise{u.customised");
    expect(read("app/(dashboard)/dashboard/admin/page.tsx")).toContain("customised: hasAnyOverride(u.limitOverrides, u.featureOverrides),");
    expect(read("app/components/UsagePopover.tsx")).toContain("Some allowances on your account were set by support");
  });

  it("the schema has the three new columns (limitOverrides is Json, never Json?)", () => {
    const s = read("prisma/schema.prisma");
    expect(s).toContain('limitOverrides                Json                        @default("{}")');
    expect(s).toContain("overrideNote                  String?");
    expect(s).toContain("overridesExpireAt             DateTime?");
  });

  it("the Text to Speech tile and the speech gate understand both forms of an override entry", () => {
    expect(read("app/api/admin/text-to-speech/route.ts")).toContain("COALESCE(\"featureOverrides\"->$2::text->>'s', \"featureOverrides\"->>$2)");
    expect(read("app/lib/voice/speechAccess.ts")).toContain("overrideValue((user.featureOverrides");
  });
});
