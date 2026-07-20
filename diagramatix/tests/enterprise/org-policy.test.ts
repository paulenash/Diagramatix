/**
 * Enterprise governance policy — getOrgPolicy (app/lib/auth/orgPolicy.ts).
 * A fresh org allows everything; disabling a flag is reflected. This is the
 * store the route guards (gateOrgPolicy) read from. Phase A1c; see enterprise/.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg } from "../_setup/factories";
import { getOrgPolicy, ORG_POLICY_KEYS } from "@/app/lib/auth/orgPolicy";

beforeEach(async () => { await truncateAll(); });

describe("org governance policy", () => {
  it("T0921 — a fresh org allows every capability by default", async () => {
    const { org } = await createUserWithOrg();
    const policy = await getOrgPolicy(org.id);
    for (const key of ORG_POLICY_KEYS) {
      expect(policy[key], `${key} should default true`).toBe(true);
    }
  });

  it("T0922 — disabling a flag is reflected; an unknown org defaults to all-allowed", async () => {
    const { org } = await createUserWithOrg();
    await prisma.org.update({ where: { id: org.id }, data: { allowAi: false, allowVoiceAi: false } });
    const policy = await getOrgPolicy(org.id);
    expect(policy.allowAi).toBe(false);
    expect(policy.allowVoiceAi).toBe(false);
    expect(policy.allowExternalExport).toBe(true); // untouched

    // Unknown org → all-allowed (fail-open: no org, no policy to enforce).
    const missing = await getOrgPolicy("does-not-exist");
    expect(Object.values(missing).every((v) => v === true)).toBe(true);
  });
});
