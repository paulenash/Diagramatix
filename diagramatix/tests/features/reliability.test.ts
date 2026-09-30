/**
 * Feature Availability slice 9 (plan 2026-09-30): the precedence and the
 * fail-open rules of the resolver, and that every place that SHOWS a feature's
 * state agrees with the place that ENFORCES it.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";

const db = vi.hoisted(() => ({
  user: null as null | Record<string, unknown>,
  memberships: [] as { org: { subscriptionLevelId: string | null } }[],
  matrix: [] as { levelId: string; featureKey: string; state: string }[],
  session: null as null | { user: { id: string } },
  states: {} as Record<string, string>,
  levels: [
    { id: "free", sortOrder: 1 }, { id: "introductory", sortOrder: 2 }, { id: "professional", sortOrder: 3 },
    { id: "expert", sortOrder: 4 }, { id: "enterprise", sortOrder: 5 },
  ],
}));
vi.mock("@/app/lib/db", () => ({
  prisma: {
    user: { findUnique: async () => db.user },
    orgMember: { findMany: async () => db.memberships },
    subscriptionLevel: { findMany: async () => db.levels },
    featureAvailability: { findMany: async (a: { where: { levelId: string } }) => db.matrix.filter((r) => r.levelId === a.where.levelId) },
  },
}));
vi.mock("@/app/lib/features/actAs", async (orig) => ({ ...(await orig<typeof import("@/app/lib/features/actAs")>()), currentActAsLevel: async () => null }));

import { getFeatureStates } from "@/app/lib/features/availability";
import { clearLevelOrders } from "@/app/lib/features/effectiveLevel";
import { buildPublicMatrix } from "@/app/lib/features/publicMatrix";
import { FEATURE_KEYS, FEATURES } from "@/app/lib/features/registry";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const seed = JSON.parse(read("menus_and_features/feature-availability.seed.json")) as { levels: string[]; rows: { key: string; states: Record<string, string> }[] };

function asUser(o: Record<string, unknown> = {}) {
  db.user = { id: "u1", email: "someone@example.com", subscriptionLevelId: "professional", subscriptionEndsAt: null, compTierLevelId: null, compTierExpiresAt: null, featureOverrides: null, ...o };
}
beforeEach(() => { db.user = null; db.memberships = []; db.matrix = []; clearLevelOrders(); });

describe("T5136 — the resolver's precedence and its fail-open rules", () => {
  it("a user who does not exist has nothing (every gate then blocks)", async () => {
    db.user = null;
    expect(await getFeatureStates("ghost")).toEqual({});
  });

  it("a level with NO matrix rows is open (fail-open): a feature is only restricted once a row says so", async () => {
    asUser();
    const s = await getFeatureStates("u1");
    for (const k of FEATURE_KEYS) expect(s[k], k).toBe("available");
  });

  it("an explicit row restricts; an unreadable state counts as hidden; a row for a feature that does not exist is ignored", async () => {
    asUser();
    db.matrix = [
      { levelId: "professional", featureKey: "sharing", state: "disabled" },
      { levelId: "professional", featureKey: "simulator", state: "garbage" },
      { levelId: "professional", featureKey: "no-such-feature", state: "hidden" },
    ];
    const s = await getFeatureStates("u1");
    expect(s.sharing).toBe("disabled");
    expect(s.simulator).toBe("hidden");
    expect(s["no-such-feature"]).toBeUndefined();
  });

  it("the person's own override beats their level's row, in either direction; a bad or unknown override is ignored or hidden", async () => {
    asUser({ featureOverrides: { sharing: "available", simulator: "hidden", "not-a-feature": "available", diffx: 5 } });
    db.matrix = [{ levelId: "professional", featureKey: "sharing", state: "hidden" }, { levelId: "professional", featureKey: "simulator", state: "available" }];
    const s = await getFeatureStates("u1");
    expect(s.sharing).toBe("available");
    expect(s.simulator).toBe("hidden");
    expect(s["not-a-feature"]).toBeUndefined();
  });

  it("an override on a PREREQUISITE flows through to what needs it (Mobile follows Voice Assist)", async () => {
    asUser({ featureOverrides: { "voice-assist": "hidden" } });
    const s = await getFeatureStates("u1");
    expect(s["voice-assist"]).toBe("hidden");
    expect(s.mobile, "its own cell is open, but it needs Voice Assist").toBe("hidden");
    asUser({ featureOverrides: { mobile: "available" } });
    db.matrix = [{ levelId: "professional", featureKey: "voice-assist", state: "hidden" }];
    expect((await getFeatureStates("u1")).mobile, "an override cannot lift a feature above what it needs").toBe("hidden");
  });

  it("the level is the EFFECTIVE one: an Enterprise organisation lifts a Free member; an active comp beats it; the matrix read is that level's", async () => {
    db.matrix = [
      { levelId: "free", featureKey: "sharing", state: "hidden" },
      { levelId: "enterprise", featureKey: "sharing", state: "available" },
      { levelId: "introductory", featureKey: "sharing", state: "disabled" },
    ];
    db.memberships = [{ org: { subscriptionLevelId: "enterprise" } }];
    asUser({ subscriptionLevelId: "free" });
    expect((await getFeatureStates("u1")).sharing).toBe("available");
    asUser({ subscriptionLevelId: "free", compTierLevelId: "introductory", compTierExpiresAt: new Date(Date.now() + 86400000) });
    expect((await getFeatureStates("u1")).sharing, "comp wins outright").toBe("disabled");
  });

  it("a SuperAdmin gets everything, whatever the matrix says", async () => {
    asUser({ email: "paul@nashcc.com.au" });
    db.matrix = FEATURE_KEYS.map((k) => ({ levelId: "professional", featureKey: k, state: "hidden" }));
    const s = await getFeatureStates("u1");
    for (const k of FEATURE_KEYS) expect(s[k], k).toBe("available");
  });
});

describe("T5137 — what is SHOWN agrees with what is ENFORCED", () => {
  it("for every level and every feature in the seed, the state the server resolves is the cell the public comparison shows", async () => {
    const matrixRows = seed.rows.flatMap((r) => seed.levels.map((l) => ({ levelId: l, featureKey: r.key, state: r.states[l] })));
    db.matrix = matrixRows;
    const levels = seed.levels.map((id, i) => ({ id, name: id, sortOrder: i + 1 }));
    const pub = buildPublicMatrix(levels, matrixRows);
    const cellFor = (key: string, level: string) => pub.groups.flatMap((g) => g.rows).find((r) => r.key === key)?.cells[level];
    const CELL = { available: "included", disabled: "soon", hidden: "no" } as const;
    for (const level of seed.levels) {
      asUser({ subscriptionLevelId: level });
      const server = await getFeatureStates("u1");
      for (const f of FEATURES) {
        const shown = cellFor(f.key, level);
        if (shown === undefined) continue;   // left out of the public table (informational, or off everywhere)
        expect(shown, `${f.key} @ ${level}`).toBe(CELL[server[f.key] as keyof typeof CELL]);
      }
    }
  });

  it("Free has no Mobile and every paid level has it (the ruling), by the SAME resolver the phone's layout uses", async () => {
    db.matrix = seed.rows.flatMap((r) => seed.levels.map((l) => ({ levelId: l, featureKey: r.key, state: r.states[l] })));
    asUser({ subscriptionLevelId: "free" });
    expect((await getFeatureStates("u1")).mobile).toBe("hidden");
    for (const l of ["introductory", "professional", "expert", "enterprise"]) {
      asUser({ subscriptionLevelId: l });
      expect((await getFeatureStates("u1")).mobile, l).toBe("available");
    }
  });
});

describe("T5138 — GET /api/features", () => {
  beforeEach(() => { vi.resetModules(); });

  it("signed out: an empty map with a 200 (the client treats it as nothing yet); signed in: the resolved states", async () => {
    vi.doMock("@/auth", () => ({ auth: async () => db.session }));
    vi.doMock("@/app/lib/features/availability", () => ({ getFeatureStates: async () => db.states }));
    const { GET } = await import("@/app/api/features/route");
    db.session = null;
    const out = await GET();
    expect(out.status).toBe(200);
    expect(await out.json()).toEqual({ states: {} });
    db.session = { user: { id: "u1" } };
    db.states = { mobile: "available" };
    expect(await (await GET()).json()).toEqual({ states: { mobile: "available" } });
  });
});

describe("T5139 — the guides say how it works, and the SuperAdmin can preview a plan", () => {
  it("the Feature Availability page carries a 'how this works' note with the precedence, and a Preview-a-plan panel that lists what that plan really gets", () => {
    const ui = read("app/(dashboard)/dashboard/admin/feature-availability/FeatureAvailabilityEditor.tsx");
    expect(ui).toContain('aria-label="How Feature Availability works"');
    expect(ui).toContain("Order of precedence");
    expect(ui).toContain('aria-label="Preview a plan"');
    expect(ui).toContain("effective[previewLevel]");
  });

  it("the comments that described the old behaviour are corrected (limits answer 403, and the client DOES read the notice)", () => {
    const sub = read("app/lib/subscription.ts");
    expect(sub).not.toContain("402 for limit metrics");
    const route = read("app/lib/subscription-route.ts");
    expect(route).toContain("A blocked check returns 403 with a JSON body the UI");
  });
});
