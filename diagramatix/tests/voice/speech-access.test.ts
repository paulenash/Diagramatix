/**
 * T4772 — who may have Diagramatix speak. The gate fails CLOSED.
 *
 * Paul, 2026-09-25: "Default is on for SuperAdmin users, off for everyone else",
 * and a SuperAdmin turns it on for selected users.
 *
 * The ordinary feature gate fails OPEN — a feature with no matrix row resolves
 * as available — so through it, speech would have been on for every user of
 * every tier from the moment it deployed until somebody seeded production. Each
 * case below is a DECISION somebody made; an absence is never a yes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SUPERUSER_EMAILS } from "@/app/lib/superuser";

let overrides: Record<string, unknown> | null = null;
let levelRow: { state: string } | null = null;

vi.mock("@/app/lib/db", () => ({
  prisma: {
    user: { findUnique: async () => ({ featureOverrides: overrides }) },
    featureAvailability: { findUnique: async () => levelRow },
  },
}));
vi.mock("@/app/lib/features/availability", () => ({
  resolveEffectiveLevelId: async () => "expert",
}));

const { speechGranted } = await import("@/app/lib/voice/speechAccess");

const user = { user: { id: "u1", email: "someone@example.com" } };
const superAdmin = { user: { id: "sa", email: [...SUPERUSER_EMAILS][0] } };

beforeEach(() => { overrides = null; levelRow = null; });

describe("T4772 — the speech gate", () => {
  it("NO ROW, NO OVERRIDE → no. This is the case the ordinary gate gets wrong.", async () => {
    expect(await speechGranted(user)).toBe(false);
  });

  it("a SuperAdmin → yes, with nothing configured", async () => {
    expect(await speechGranted(superAdmin)).toBe(true);
  });

  it("the user's own override decides, either way", async () => {
    overrides = { "voice-feedback": "available" };
    expect(await speechGranted(user)).toBe(true);
    overrides = { "voice-feedback": "hidden" };
    levelRow = { state: "available" }; // even with the whole tier on
    expect(await speechGranted(user), "the more specific decision wins").toBe(false);
  });

  it("an EXPLICIT available row for the user's tier → yes; hidden → no", async () => {
    levelRow = { state: "available" };
    expect(await speechGranted(user)).toBe(true);
    levelRow = { state: "hidden" };
    expect(await speechGranted(user)).toBe(false);
  });

  it("signed out → no", async () => {
    expect(await speechGranted(null)).toBe(false);
    expect(await speechGranted({ user: {} })).toBe(false);
  });
});
