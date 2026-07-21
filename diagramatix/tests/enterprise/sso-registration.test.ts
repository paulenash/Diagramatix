/**
 * A3d (ENT-04) access hardening: requireSso blocks password login for members of
 * an SSO-mandated org (app/lib/auth/credentials.ts); and an optional domain
 * allowlist restricts self-registration (app/lib/auth/registerUser.ts).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { verifyCredentials } from "@/app/lib/auth/credentials";
import { registerUser } from "@/app/lib/auth/registerUser";

beforeEach(async () => { await truncateAll(); });
afterEach(() => { delete process.env.REGISTRATION_ALLOWED_DOMAINS; });

// registerUser assigns subscriptionLevelId "free" — that row must exist.
async function seedFreeTier() {
  await prisma.subscriptionLevel.create({ data: { id: "free", name: "Free", sortOrder: 0, trialDays: 30 } });
}

async function userInOrg(email: string, password: string, requireSso: boolean) {
  const user = await prisma.user.create({ data: { email, name: "T", password: await bcrypt.hash(password, 12) } });
  const org = await prisma.org.create({ data: { name: `${email}-org`, requireSso } });
  await prisma.orgMember.create({ data: { userId: user.id, orgId: org.id, role: "Owner" } });
  return user;
}

describe("requireSso + domain-restricted registration", () => {
  it("T0928 — requireSso blocks password login even with the correct password", async () => {
    await userInOrg("sso@example.com", "correct-horse-8", true);
    expect(await verifyCredentials("sso@example.com", "correct-horse-8")).toBeNull();
  });

  it("T0929 — a normal org still allows password login", async () => {
    await userInOrg("pw@example.com", "correct-horse-8", false);
    const res = await verifyCredentials("pw@example.com", "correct-horse-8");
    expect(res?.email).toBe("pw@example.com");
  });

  it("T0930 — REGISTRATION_ALLOWED_DOMAINS gates self-registration", async () => {
    await seedFreeTier();
    process.env.REGISTRATION_ALLOWED_DOMAINS = "acme.com, acme.co.uk";
    const bad = await registerUser({ email: "x@evil.com", password: "password12" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.status).toBe(403);

    const good = await registerUser({ email: "y@acme.com", password: "password12" });
    expect(good.ok).toBe(true);
  });
});
