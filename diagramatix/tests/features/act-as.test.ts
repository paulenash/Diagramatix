/**
 * Feature Availability slice 2 (plan 2026-09-30): a SuperAdmin can ACT AS a
 * customer level and the server evaluates as that level — features, limits,
 * usage snapshot, element cap — with the bypass off; and the test tools that
 * put a user where a limit can be hit in seconds.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";

const db = vi.hoisted(() => {
  const levels: Record<string, Record<string, unknown>> = {
    free: { id: "free", name: "Free", sortOrder: 1, maxProjects: 1, trialDays: 30, aiAttemptsResetMonthly: false, individualExportsResetMonthly: false, individualImportsResetMonthly: false, maxAiAttempts: 5, maxBpmnElementsPerDiagram: 20, maxNonBpmnElementsPerDiagram: 15 },
    expert: { id: "expert", name: "Expert", sortOrder: 4, maxProjects: null, trialDays: null, aiAttemptsResetMonthly: true, individualExportsResetMonthly: true, individualImportsResetMonthly: true, maxAiAttempts: 500, maxBpmnElementsPerDiagram: null, maxNonBpmnElementsPerDiagram: null },
  };
  return {
    levels,
    user: null as null | Record<string, unknown>,
    actAs: null as string | null,
    matrix: [] as { levelId: string; featureKey: string; state: string }[],
    projects: 1,
    upserts: [] as unknown[],
    deletes: [] as unknown[],
    userUpdates: [] as unknown[],
  };
});

vi.mock("@/app/lib/features/actAs", async (orig) => ({ ...(await orig<typeof import("@/app/lib/features/actAs")>()), currentActAsLevel: async () => db.actAs }));
vi.mock("@/app/lib/db", () => ({
  prisma: {
    user: {
      findUnique: async () => db.user && ({ ...db.user, subscriptionLevel: db.levels[(db.user.subscriptionLevelId as string) ?? "free"] ?? null }),
      update: async (a: unknown) => { db.userUpdates.push(a); },
    },
    orgMember: { findMany: async () => [] },
    subscriptionLevel: {
      findMany: async () => Object.values(db.levels),
      findUnique: async (a: { where: { id: string } }) => db.levels[a.where.id] ?? null,
    },
    featureAvailability: { findMany: async (a: { where: { levelId: string } }) => db.matrix.filter((r) => r.levelId === a.where.levelId) },
    project: { count: async () => db.projects },
    diagram: { count: async () => 0, groupBy: async () => [], findMany: async () => [] },
    aiDiagramGeneration: { count: async () => 0 },
    usageCounter: {
      upsert: async (a: unknown) => { db.upserts.push(a); },
      deleteMany: async (a: unknown) => { db.deletes.push(a); return { count: 3 }; },
      findUnique: async () => null,
      findFirst: async () => null,
      findMany: async () => [],
    },
  },
}));

import { actAsLevelFromMode, ACT_AS_LEVELS } from "@/app/lib/features/actAs";
import { getFeatureStates } from "@/app/lib/features/availability";
import { checkLimit, getUsageSnapshot, resetUsageCounters, setTrialDaysLeft, setUsageCounter } from "@/app/lib/subscription";
import { elementCountLimitFor } from "@/app/lib/diagram/elementLimitServer";
import { clearLevelOrders } from "@/app/lib/features/effectiveLevel";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const ADMIN = "paul@nashcc.com.au";

function asUser(email: string, level = "expert") {
  db.user = { id: "u1", email, createdAt: new Date("2026-01-01"), subscriptionAssignedAt: new Date("2026-09-01"), subscriptionEndsAt: null, subscriptionLevelId: level, compTierLevelId: null, compTierExpiresAt: null, compTierGrantedAt: null, featureOverrides: null };
}
beforeEach(() => {
  db.user = null; db.actAs = null; db.projects = 1; db.upserts = []; db.deletes = []; db.userUpdates = [];
  db.matrix = [
    { levelId: "free", featureKey: "mobile", state: "hidden" }, { levelId: "free", featureKey: "simulator", state: "hidden" },
    { levelId: "expert", featureKey: "mobile", state: "available" }, { levelId: "expert", featureKey: "simulator", state: "available" },
  ];
  clearLevelOrders();
});

describe("T5109 — acting as a level: the cookie, and who it is honoured for", () => {
  it("a tier name means 'act as that level'; anything else does not", () => {
    for (const l of ACT_AS_LEVELS) expect(actAsLevelFromMode(l)).toBe(l);
    for (const m of ["superadmin", "orgadmin", "", null, undefined, "Free ", "admin"]) expect(actAsLevelFromMode(m as string)).toBeNull();
    expect(ACT_AS_LEVELS).toEqual(["free", "introductory", "professional", "expert", "enterprise"]);
  });

  it("a SuperAdmin with no tier view gets everything; acting as Free gets Free's matrix — hidden stays hidden", async () => {
    asUser(ADMIN);
    expect((await getFeatureStates("u1")).mobile).toBe("available");
    db.actAs = "free";
    const s = await getFeatureStates("u1");
    expect(s.mobile).toBe("hidden");
    expect(s.simulator).toBe("hidden");
  });

  it("the cookie is ignored for anyone who is not a SuperAdmin — it cannot lift or lower an ordinary user", async () => {
    asUser("someone@example.com", "free");
    db.actAs = "expert";
    expect((await getFeatureStates("u1")).simulator).toBe("hidden");   // still Free's row
    asUser("someone@example.com", "expert");
    db.actAs = "free";
    expect((await getFeatureStates("u1")).simulator).toBe("available"); // still Expert's row
  });

  it("dependencies apply while acting (Mobile needs Voice Assist and Process Review)", async () => {
    asUser(ADMIN);
    db.actAs = "expert";
    db.matrix.push({ levelId: "expert", featureKey: "voice-assist", state: "hidden" });
    expect((await getFeatureStates("u1")).mobile, "own cell available, prerequisite hidden").toBe("hidden");
  });
});

describe("T5110 — acting as a level: limits, snapshot and the element cap are the level's", () => {
  it("a SuperAdmin passes every limit — until acting as Free, when Free's project cap bites", async () => {
    asUser(ADMIN);
    db.projects = 1;
    expect((await checkLimit("u1", "projects")).ok).toBe(true);
    db.actAs = "free";
    const r = await checkLimit("u1", "projects");
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ metric: "projects", current: 1, limit: 1 });
  });

  it("an ordinary user is judged by their own level whatever the cookie says", async () => {
    asUser("someone@example.com", "expert");
    db.actAs = "free";
    db.projects = 50;
    expect((await checkLimit("u1", "projects")).ok, "Expert: unlimited").toBe(true);
  });

  it("the usage snapshot says who is being acted as, shows the level's limits and is no longer 'admin'", async () => {
    asUser(ADMIN);
    expect(await getUsageSnapshot("u1")).toMatchObject({ isAdmin: true, actingAs: null, tier: { id: "superadmin" } });
    db.actAs = "free";
    const snap = (await getUsageSnapshot("u1"))!;
    expect(snap.isAdmin).toBe(false);
    expect(snap.actingAs).toEqual({ id: "free", name: "Free" });
    expect(snap.tier).toEqual({ id: "free", name: "Free" });
    expect(snap.metrics.find((m) => m.metric === "projects")?.limit).toBe(1);
  });

  it("the editor's element cap: none for a SuperAdmin; Free's when acting as Free", async () => {
    asUser(ADMIN);
    expect(await elementCountLimitFor("u1", "bpmn")).toBeNull();
    db.actAs = "free";
    expect(await elementCountLimitFor("u1", "bpmn")).toBe(20);
    expect(await elementCountLimitFor("u1", "state-machine")).toBe(15);
    expect(await elementCountLimitFor("u1", "bpmn", true), "an assigned reviewer is never capped").toBeNull();
  });
});

describe("T5111 — the test tools: set a counter, reset counters, move the trial clock", () => {
  it("sets THIS period's counter for a metric to exactly the number (never negative, whole)", async () => {
    asUser("someone@example.com", "free");
    expect(await setUsageCounter("u1", "aiAttempts", 4.9)).toBe(true);
    expect(db.upserts[0]).toMatchObject({
      where: { userId_periodKey_metric: { userId: "u1", periodKey: "all-time", metric: expect.any(String) } },
      create: { count: 4 }, update: { count: 4 },
    });
    await setUsageCounter("u1", "aiAttempts", -3);
    expect((db.upserts[1] as { update: { count: number } }).update.count).toBe(0);
  });

  it("resets every counter the user has", async () => {
    expect(await resetUsageCounters("u1")).toBe(3);
    expect(db.deletes[0]).toEqual({ where: { userId: "u1" } });
  });

  it("moves the trial clock so N days remain; a tier with no trial says so", async () => {
    asUser("someone@example.com", "free");     // 30-day trial
    const now = new Date("2026-10-10T00:00:00Z");
    expect(await setTrialDaysLeft("u1", 1, now)).toBe(true);
    const at = (db.userUpdates[0] as { data: { subscriptionAssignedAt: Date } }).data.subscriptionAssignedAt;
    expect(Math.round((now.getTime() - at.getTime()) / 86400000)).toBe(29);   // 29 of 30 days used
    asUser("someone@example.com", "expert");   // no trial
    expect(await setTrialDaysLeft("u1", 1, now)).toBe(false);
  });
});

describe("T5112 — the switch, the banner and the tools are wired", () => {
  it("the view-mode switcher now has a Free view, re-reads the feature states and refreshes the page on a change; the hard-coded table is gone", () => {
    const src = read("app/hooks/useSuperAdminChrome.ts");
    expect(src).toContain('"introductory", "free"];');
    expect(src).toContain("void refreshFeatureStore();");
    expect(src).toContain("router.refresh();");
    expect(src).not.toContain("VIEW_MODE_ENTITLEMENTS");
    expect(src).toContain("export function viewModeEntitlements(_mode: AdminViewMode): ViewModeEntitlements | null {\n  return null;");
  });

  it("the banner is drawn only for a real SuperAdmin acting as a level, from the root layout", () => {
    const b = read("app/components/ActingAsBanner.tsx");
    expect(b).toContain("if (!superAdmin) return null;");
    expect(b).toContain("Acting as {name}");
    expect(read("app/layout.tsx")).toContain("<ActingAsBanner superAdmin={superAdmin} />");
  });

  it("the tools are a SuperAdmin-only POST returning the fresh snapshot, and a Test tools panel in the admin popover", () => {
    const r = read("app/api/admin/users/[id]/usage/route.ts");
    expect(r).toContain('case "set-counter"');
    expect(r).toContain('case "reset-counters"');
    expect(r).toContain('case "set-trial-days-left"');
    expect(r.split("isSuperuser(session)").length - 1).toBeGreaterThanOrEqual(2);
    expect(read("app/components/UsagePopover.tsx")).toContain('aria-label="Test tools"');
  });

  it("the speech gate and the voice-assist preview follow the acted-as level too", () => {
    expect(read("app/lib/voice/speechAccess.ts")).toContain("currentActAsLevel");
    const ed = read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    expect(ed).toContain('const voiceAssistAllowed = voiceAssistFeature === "available";');
  });
});
