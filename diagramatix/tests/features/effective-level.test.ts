/**
 * Feature Availability slice 1c (plan 2026-09-30): ONE effective level for the
 * feature matrix, the numeric limits, the usage snapshot and the editor's
 * element cap; and the legacy has* checkboxes retired from what users see.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";

const db = vi.hoisted(() => ({
  user: null as null | Record<string, unknown>,
  memberships: [] as { org: { subscriptionLevelId: string | null } }[],
  levels: [
    { id: "free", sortOrder: 1 }, { id: "introductory", sortOrder: 2 }, { id: "professional", sortOrder: 3 },
    { id: "expert", sortOrder: 4 }, { id: "enterprise", sortOrder: 5 },
  ],
  levelReads: 0,
}));
vi.mock("@/app/lib/db", () => ({
  prisma: {
    user: { findUnique: async () => db.user },
    orgMember: { findMany: async () => db.memberships },
    subscriptionLevel: { findMany: async () => { db.levelReads++; return db.levels; } },
  },
}));

import {
  clearLevelOrders, getEffectiveSubscriptionLevelId, highestLevel, resolveEffectiveLevel, resolveEffectiveLevelId, withOrgLevel,
} from "@/app/lib/features/effectiveLevel";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const day = 24 * 60 * 60 * 1000;
const future = new Date(Date.now() + 30 * day);
const past = new Date(Date.now() - 2 * day);

function user(o: Record<string, unknown> = {}) {
  db.user = { subscriptionLevelId: "free", subscriptionEndsAt: null, compTierLevelId: null, compTierExpiresAt: null, ...o };
}
beforeEach(() => { db.user = null; db.memberships = []; db.levelReads = 0; clearLevelOrders(); });

describe("T5106 — the effective level: comp, grace, the person's own level and their organisations", () => {
  it("the pure rule: an active comp wins; an expired comp does not; a cancelled paid sub past its end drops to Free; else the stored level; else Free", () => {
    const now = new Date();
    expect(getEffectiveSubscriptionLevelId({ subscriptionLevelId: "free", subscriptionEndsAt: null, compTierLevelId: "expert", compTierExpiresAt: future }, now)).toBe("expert");
    expect(getEffectiveSubscriptionLevelId({ subscriptionLevelId: "professional", subscriptionEndsAt: null, compTierLevelId: "expert", compTierExpiresAt: past }, now)).toBe("professional");
    expect(getEffectiveSubscriptionLevelId({ subscriptionLevelId: "professional", subscriptionEndsAt: past }, now)).toBe("free");
    expect(getEffectiveSubscriptionLevelId({ subscriptionLevelId: "professional", subscriptionEndsAt: future }, now)).toBe("professional");
    expect(getEffectiveSubscriptionLevelId({ subscriptionLevelId: null, subscriptionEndsAt: null }, now)).toBe("free");
  });

  it("the higher of the person's own level and their organisations' — never lower; unknown ids rank lowest", () => {
    const orders = new Map(db.levels.map((l) => [l.id, l.sortOrder]));
    expect(highestLevel("free", ["enterprise"], orders)).toEqual({ id: "enterprise", source: "org" });
    expect(highestLevel("expert", ["introductory"], orders)).toEqual({ id: "expert", source: "own" });
    expect(highestLevel("professional", ["introductory", "expert"], orders)).toEqual({ id: "expert", source: "org" });
    expect(highestLevel("free", ["no-such-level"], orders)).toEqual({ id: "free", source: "own" });
    expect(highestLevel("free", [], orders)).toEqual({ id: "free", source: "own" });
  });

  it("resolved for a user: own level alone; an Enterprise organisation lifts a Free member; an organisation cannot lower anyone", async () => {
    user({ subscriptionLevelId: "professional" });
    expect(await resolveEffectiveLevel("u")).toEqual({ id: "professional", source: "own" });
    db.memberships = [{ org: { subscriptionLevelId: "enterprise" } }];
    user({ subscriptionLevelId: "free" });
    expect(await resolveEffectiveLevel("u")).toEqual({ id: "enterprise", source: "org" });
    db.memberships = [{ org: { subscriptionLevelId: "introductory" } }, { org: { subscriptionLevelId: null } }];
    user({ subscriptionLevelId: "expert" });
    expect(await resolveEffectiveLevelId("u")).toBe("expert");
  });

  it("a comp grant wins outright — even over a higher organisation level; an expired one does not", async () => {
    db.memberships = [{ org: { subscriptionLevelId: "enterprise" } }];
    user({ subscriptionLevelId: "free", compTierLevelId: "introductory", compTierExpiresAt: future });
    expect(await resolveEffectiveLevel("u")).toEqual({ id: "introductory", source: "comp" });
    user({ subscriptionLevelId: "free", compTierLevelId: "introductory", compTierExpiresAt: past });
    expect(await resolveEffectiveLevel("u")).toEqual({ id: "enterprise", source: "org" });
  });

  it("grace: a cancelled subscription is Free first, and an organisation can still lift it", async () => {
    user({ subscriptionLevelId: "professional", subscriptionEndsAt: past });
    expect(await resolveEffectiveLevelId("u")).toBe("free");
    db.memberships = [{ org: { subscriptionLevelId: "expert" } }];
    expect(await resolveEffectiveLevelId("u")).toBe("expert");
  });

  it("a user who does not exist has no level", async () => {
    db.user = null;
    expect(await resolveEffectiveLevelId("ghost")).toBeNull();
  });

  it("the level orders are read once, not for every call, and re-read after clearLevelOrders()", async () => {
    db.memberships = [{ org: { subscriptionLevelId: "expert" } }];
    await withOrgLevel("u", "free");
    await withOrgLevel("u", "free");
    expect(db.levelReads).toBe(1);
    clearLevelOrders();
    await withOrgLevel("u", "free");
    expect(db.levelReads).toBe(2);
  });
});

describe("T5107 — every reader of 'the level' uses that one resolver", () => {
  it("the limits' user load applies the organisation rule (an Enterprise organisation's members get Enterprise's limits)", () => {
    const src = read("app/lib/subscription.ts");
    expect(src).toContain('import { getEffectiveSubscriptionLevelId, withOrgLevel } from "./features/effectiveLevel";');
    expect(src).toContain("const finalId = compGrantActive ? effectiveId : (await withOrgLevel(userId, effectiveId)).id;");
    expect(src, "the pure rule is not defined twice").not.toContain("export function getEffectiveSubscriptionLevelId");
  });

  it("no dynamic import is left to dodge the old cycle", () => {
    const src = read("app/lib/subscription.ts");
    expect(src).not.toContain('await import("@/app/lib/features/availability")');
    expect(src).toContain('import { getFeatureStates } from "./features/availability";');
    expect(read("app/lib/features/availability.ts")).not.toContain('from "@/app/lib/subscription"');
  });

  it("the editor's element cap reads the effective level, not the stored one", () => {
    const src = read("app/lib/diagram/elementLimitServer.ts");
    expect(src).toContain("resolveEffectiveLevelId(effectiveUserId)");
    expect(src).toContain("SUPERUSER_EMAILS].some((s) => s.toLowerCase() === user.email.toLowerCase())");
  });

  it("the feature side still imports the resolver from availability.ts (re-exported)", () => {
    expect(read("app/lib/features/availability.ts")).toContain('export { resolveEffectiveLevelId, clearLevelOrders } from "./effectiveLevel";');
    expect(read("app/lib/voice/speechAccess.ts")).toContain('import { resolveEffectiveLevelId } from "@/app/lib/features/availability";');
  });
});

describe("T5108 — the legacy has* feature checkboxes no longer decide what a user sees", () => {
  it("the usage snapshot's entitlements come from the feature matrix, not the level's has* columns", () => {
    const src = read("app/lib/subscription.ts");
    expect(src).toContain("entitlements: entitlementsFromStates(await getFeatureStates(userId)),");
    expect(src).not.toContain("entitlements: entitlementsForLevel(tier, admin),");
  });

  it("the diagram editor's Simulator and Risk & Control buttons follow the matrix (they were always on for a real user)", () => {
    const src = read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    expect(src).toContain('const { states: featureStates, ready: featureStatesReady } = useFeatureStates();');
    expect(src).toContain('const rcAllowed = viewEnt ? viewEnt.riskControl : (!featureStatesReady || featureStates["riskControl"] === "available");');
    expect(src).toContain('const simAllowed = viewEnt ? viewEnt.simulator : (!featureStatesReady || featureStates["simulator"] === "available");');
  });

  it("the Subscription Prices and Limits editor no longer edits feature access — it points at Feature Availability", () => {
    const src = read("app/(dashboard)/dashboard/admin/subscriptions/SubscriptionsEditor.tsx");
    expect(src).not.toContain('key: "hasSimulator" }');
    expect(src).not.toContain('label: "Feature access"');
    expect(src).toContain('href="/dashboard/admin/feature-availability"');
  });
});
