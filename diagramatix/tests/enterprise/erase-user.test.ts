/**
 * GDPR self-erasure core — eraseUser (app/lib/account/eraseUser.ts): deletes the
 * user + cascaded data, and removes any org they leave empty, but never an org
 * that still has another member's data. Phase A3 (ENT-12).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg, createUser, addOrgMember, createProject } from "../_setup/factories";
import { eraseUser } from "@/app/lib/account/eraseUser";

beforeEach(async () => { await truncateAll(); });

describe("eraseUser (GDPR erasure)", () => {
  it("T0925 — erases a sole-member user and removes their now-empty org", async () => {
    const { user, org } = await createUserWithOrg();
    const res = await eraseUser(user.id);
    expect(res.orgsRemoved).toBe(1);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.org.findUnique({ where: { id: org.id } })).toBeNull();
  });

  it("T0926 — keeps an org that still has another member", async () => {
    const { user: u1, org } = await createUserWithOrg();
    const u2 = await createUser({ email: "second@example.com" });
    await addOrgMember(u2.id, org.id, "Admin");

    const res = await eraseUser(u1.id);
    expect(res.orgsRemoved).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: u1.id } })).toBeNull();
    expect(await prisma.org.findUnique({ where: { id: org.id } })).not.toBeNull();
    // The remaining member survives.
    expect(await prisma.user.findUnique({ where: { id: u2.id } })).not.toBeNull();
  });

  it("T0927 — cascades the user's project, then removes the emptied org", async () => {
    const { user, org } = await createUserWithOrg();
    const project = await createProject({ userId: user.id, orgId: org.id, name: "Mine" });

    const res = await eraseUser(user.id);
    expect(res.orgsRemoved).toBe(1);
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull();
    expect(await prisma.org.findUnique({ where: { id: org.id } })).toBeNull();
  });
});
