/**
 * Domain-managed org membership (app/lib/auth/domainOrg.ts + registerUser):
 * a user whose email domain is CLAIMED by an Org auto-joins that org (no personal
 * org, so no ability to create their own); everyone else gets a personal org.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { registerUser } from "@/app/lib/auth/registerUser";
import { resolveDomainOrg, isDomainManaged, DEFAULT_DOMAIN_JOIN_ROLE } from "@/app/lib/auth/domainOrg";

beforeEach(async () => { await truncateAll(); });

async function seedFreeTier() {
  await prisma.subscriptionLevel.create({ data: { id: "free", name: "Free", sortOrder: 0, trialDays: 30 } });
}
async function claimOrg(name: string, domains: string[], role?: "ProcessOwner" | "Viewer") {
  return prisma.org.create({ data: { name, emailDomains: domains, ...(role ? { domainJoinRole: role } : {}) } });
}
async function membershipsOf(email: string) {
  const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return prisma.orgMember.findMany({ where: { userId: u!.id }, include: { org: true } });
}

describe("resolveDomainOrg / isDomainManaged", () => {
  it("resolves a claimed domain (case-insensitive) and reports managed", async () => {
    const org = await claimOrg("Claimed Co", ["claimed.com"], "Viewer");
    expect((await resolveDomainOrg("Person@Claimed.com"))?.orgId).toBe(org.id);
    expect((await resolveDomainOrg("Person@Claimed.com"))?.role).toBe("Viewer");
    expect(await isDomainManaged("x@claimed.com")).toBe(true);
    expect(await isDomainManaged("x@unclaimed.com")).toBe(false);
  });
  it("falls back to the default role when the org sets none", async () => {
    await claimOrg("No Role Co", ["norole.com"]);
    expect((await resolveDomainOrg("x@norole.com"))?.role).toBe(DEFAULT_DOMAIN_JOIN_ROLE);
  });
});

describe("registerUser + domain claim", () => {
  it("auto-joins the claiming org (no personal org) with its domainJoinRole", async () => {
    await seedFreeTier();
    const org = await claimOrg("GetAI Org", ["getai.com.au"], "ProcessOwner");
    const res = await registerUser({ email: "new@getai.com.au", name: "New Person", password: "password12" });
    expect(res.ok).toBe(true);

    const mships = await membershipsOf("new@getai.com.au");
    expect(mships).toHaveLength(1);
    expect(mships[0].orgId).toBe(org.id);
    expect(mships[0].role).toBe("ProcessOwner");
    // No personal "…'s Org" was created.
    expect(await prisma.org.count({ where: { name: { contains: "'s Org" } } })).toBe(0);
    expect(await prisma.org.count()).toBe(1);
  });

  it("gives an unmanaged-domain user their own personal org as Owner", async () => {
    await seedFreeTier();
    await claimOrg("GetAI Org", ["getai.com.au"], "ProcessOwner");
    const res = await registerUser({ email: "solo@elsewhere.com", name: "Solo", password: "password12" });
    expect(res.ok).toBe(true);

    const mships = await membershipsOf("solo@elsewhere.com");
    expect(mships).toHaveLength(1);
    expect(mships[0].role).toBe("Owner");
    expect(mships[0].org.name).toBe("Solo's Org");
  });
});
