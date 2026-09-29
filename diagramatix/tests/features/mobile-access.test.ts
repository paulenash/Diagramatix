/**
 * Mobile Access as a feature (plan 2026-09-30): Available on every paid level,
 * Not Available on Free, and only as available as Process Review and Voice
 * Assist. The /m layout enforces it on the server.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { mobileAccess } from "@/app/lib/features/mobileAccess";
import { applyDependencies } from "@/app/lib/features/dependencies";
import { FEATURE_KEYS } from "@/app/lib/features/registry";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const seed = JSON.parse(read("menus_and_features/feature-availability.seed.json")) as {
  levels: string[]; rows: { key: string; states: Record<string, string> }[];
};
type S = "available" | "disabled" | "hidden";

/** The resolved states for a level, straight from the seed (no per-user overrides). */
function statesFor(level: string) {
  const m: Record<string, S> = {};
  for (const k of FEATURE_KEYS) m[k] = (seed.rows.find((r) => r.key === k)?.states[level] ?? "available") as S;
  return applyDependencies(m);
}

describe("T5103 — Mobile Access: the seed and the rule", () => {
  it("Not Available on Free; Available on Introductory, Professional, Expert and Enterprise — with Process Review and Voice Assist alongside", () => {
    for (const key of ["mobile", "process-review", "voice-assist"]) {
      const row = seed.rows.find((r) => r.key === key)!;
      expect(row.states, key).toEqual({ free: "hidden", introductory: "available", professional: "available", expert: "available", enterprise: "available" });
    }
  });

  it("so, resolved through the dependencies, every paid level has Mobile and Free does not", () => {
    expect(mobileAccess(statesFor("free")).allowed).toBe(false);
    for (const lvl of ["introductory", "professional", "expert", "enterprise"]) expect(mobileAccess(statesFor(lvl)).allowed, lvl).toBe(true);
  });

  it("a prerequisite switched off takes Mobile with it, and the message names it", () => {
    const base = statesFor("professional");
    const noVoice = applyDependencies({ ...base, "voice-assist": "hidden" as S });
    const r = mobileAccess(noVoice);
    expect(r.allowed).toBe(false);
    expect(r.blockedByLabel).toBe("Voice Assist");
    expect(r.message).toBe("Mobile access needs Voice Assist, which isn’t included in your plan.");
    const noReview = mobileAccess(applyDependencies({ ...base, "process-review": "hidden" as S }));
    expect(noReview.blockedByLabel).toBe("Process Review");
  });

  it("Mobile's own cell off (prerequisites fine) says plainly it is not in the plan; a disabled Mobile is also not allowed; no states at all fails closed", () => {
    const base = statesFor("professional");
    const own = mobileAccess({ ...base, mobile: "hidden" });
    expect(own).toMatchObject({ allowed: false, blockedByLabel: null, message: "Mobile access isn’t included in your plan." });
    expect(mobileAccess({ ...base, mobile: "disabled" }).allowed).toBe(false);
    expect(mobileAccess(null).allowed).toBe(false);
    expect(mobileAccess({}).allowed).toBe(false);
  });
});

describe("T5104 — the /m layout enforces it on the server", () => {
  it("resolves the feature states for the signed-in user and shows the upgrade page instead of the app", () => {
    const src = read("app/m/layout.tsx");
    expect(src).toContain('import { getFeatureStates } from "@/app/lib/features/availability";');
    expect(src).toContain("const access = mobileAccess(await getFeatureStates(session.user.id));");
    expect(src).toContain("{access.allowed ? children : <MobileUnavailable");
  });

  it("the upgrade page says why, offers plans and the desktop version (which stops the phone redirect)", () => {
    const src = read("app/m/MobileUnavailable.tsx");
    expect(src).toContain("Mobile access isn’t in your plan");
    expect(src).toContain('useDesktop("/pricing")');
    expect(src).toContain('document.cookie = "dgx-desktop=1; path=/; max-age=31536000";');
  });
});

describe("T5105 — the prod SQL for Mobile Access", () => {
  const sql = read("scripts/sql/patch-mobile-access-feature.sql");
  it("is one idempotent upsert on (levelId, featureKey) touching only FeatureAvailability, for the three features and five levels", () => {
    expect(sql).toContain('ON CONFLICT ("levelId", "featureKey")');
    expect(sql).toContain("VALUES ('mobile'), ('process-review'), ('voice-assist')");
    expect(sql).toContain("'free', 'introductory', 'professional', 'expert', 'enterprise'");
    expect(sql).toContain("CASE WHEN l.\"id\" = 'free' THEN 'hidden' ELSE 'available' END");
    expect(sql.match(/\b(INSERT INTO|DELETE FROM)\s+"?(\w+)"?/g)).toEqual(['INSERT INTO "FeatureAvailability"']);
    expect(sql, "no plain UPDATE or DELETE statement").not.toMatch(/^\s*(UPDATE|DELETE)\s/m);
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
  });
  it("warns that widening Voice Assist is live and costs money", () => {
    expect(sql).toContain("Voice Assist is ALREADY enforced");
  });
});
