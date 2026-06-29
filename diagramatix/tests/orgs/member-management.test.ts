/**
 * Org admin/member management — the gate + the promote/demote logic.
 *
 * (a) requireOrgAdminFor (app/lib/auth/orgContext.ts) — the shared gate for the
 *     Org-management routes. SuperAdmin (email in SUPERUSER_EMAILS) passes
 *     everywhere with isSuperAdmin:true; an Owner or Admin member of the target
 *     org passes; a Viewer/non-member is 403; no session is 401.
 *
 * (b) promoteToAdmin / demoteAdmin (app/lib/orgs/manageAdmins.ts) — the logic
 *     extracted verbatim from POST /api/orgs/[id]/admins and DELETE
 *     /api/orgs/[id]/admins/[userId]. Pins cross-tenant isolation (a
 *     non-superadmin OrgAdmin cannot pull in a non-member) and last-admin
 *     protection (the org always keeps at least one Owner/Admin).
 *
 * Real test DB, no mocks — sessions are constructed plain objects and the
 * cookie store is an empty stub, exactly like tests/sharing/access-guards.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { truncateAll } from "../_setup/db";
import { createUser, createUserWithOrg, addOrgMember } from "../_setup/factories";
import { prisma } from "@/app/lib/db";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";
import { SUPERUSER_EMAILS } from "@/app/lib/superuser";
import { promoteToAdmin, demoteAdmin, isManageAdminsError } from "@/app/lib/orgs/manageAdmins";

const cookies = { get: () => undefined };
const sessionFor = (u: { id: string; email: string }) => ({ user: { id: u.id, email: u.email } });

async function expectDenied(p: Promise<unknown>, status: number) {
  await expect(p).rejects.toMatchObject({ status });
}

/** Role of an OrgMember (orgId,userId) read straight from the DB. */
async function roleOf(orgId: string, userId: string): Promise<string | null> {
  const m = await prisma.orgMember.findFirst({ where: { orgId, userId }, select: { role: true } });
  return m?.role ?? null;
}

describe("requireOrgAdminFor — org-management gate", () => {
  beforeEach(async () => { await truncateAll(); });

  it("null session → 401", async () => {
    await expectDenied(requireOrgAdminFor(null, cookies, "anyorg"), 401);
  });

  it("SuperAdmin passes everywhere with isSuperAdmin:true (even a foreign org)", async () => {
    const su = await createUser({ email: [...SUPERUSER_EMAILS][0] });
    const { org } = await createUserWithOrg(); // an org the superuser is NOT a member of
    const res = await requireOrgAdminFor(sessionFor(su), cookies, org.id);
    expect(res.isSuperAdmin).toBe(true);
    expect(res.userId).toBe(su.id);
  });

  it("an Owner of the org passes with isSuperAdmin:false", async () => {
    const { user, org } = await createUserWithOrg(); // user is Owner
    const res = await requireOrgAdminFor(sessionFor(user), cookies, org.id);
    expect(res.isSuperAdmin).toBe(false);
    expect(res.userId).toBe(user.id);
  });

  it("an Admin member of the org passes", async () => {
    const { org } = await createUserWithOrg();
    const admin = await createUser();
    await addOrgMember(admin.id, org.id, "Admin");
    const res = await requireOrgAdminFor(sessionFor(admin), cookies, org.id);
    expect(res.isSuperAdmin).toBe(false);
  });

  it("a Viewer member of the org → 403", async () => {
    const { org } = await createUserWithOrg();
    const viewer = await createUser();
    await addOrgMember(viewer.id, org.id, "Viewer");
    await expectDenied(requireOrgAdminFor(sessionFor(viewer), cookies, org.id), 403);
  });

  it("a non-member of the org → 403", async () => {
    const { org } = await createUserWithOrg();
    const outsider = await createUser();
    await expectDenied(requireOrgAdminFor(sessionFor(outsider), cookies, org.id), 403);
  });
});

describe("promoteToAdmin — cross-tenant isolation", () => {
  beforeEach(async () => { await truncateAll(); });

  it("promotes an existing Viewer member to Admin (created=false → 200)", async () => {
    const { user: owner, org } = await createUserWithOrg();
    const viewer = await createUser();
    await addOrgMember(viewer.id, org.id, "Viewer");

    const res = await promoteToAdmin(org.id, viewer.id, { isSuperAdmin: false, actorUserId: owner.id });
    expect(isManageAdminsError(res)).toBe(false);
    if (isManageAdminsError(res)) return;
    expect(res.created).toBe(false);
    expect(res.row.role).toBe("Admin");
    expect(await roleOf(org.id, viewer.id)).toBe("Admin");
  });

  it("resolves the target by EMAIL (key is lowercased to match the stored email)", async () => {
    // The lib lowercases the lookup KEY (matching the route + ProjectShare
    // POST), so a mixed-case input resolves against a lowercase-stored email.
    const { user: owner, org } = await createUserWithOrg();
    const member = await createUser({ email: "promote.me@diagramatix.test" });
    await addOrgMember(member.id, org.id, "Viewer");

    const res = await promoteToAdmin(org.id, "PROMOTE.ME@diagramatix.test", {
      isSuperAdmin: false, actorUserId: owner.id,
    });
    expect(isManageAdminsError(res)).toBe(false);
    if (isManageAdminsError(res)) return;
    expect(res.row.userId).toBe(member.id);
    expect(await roleOf(org.id, member.id)).toBe("Admin");
  });

  it("SuperAdmin promoting a NON-member CREATES an Admin OrgMember (created=true → 201)", async () => {
    const { user: su, org } = await createUserWithOrg();
    const outsider = await createUser(); // no membership in org

    const res = await promoteToAdmin(org.id, outsider.id, { isSuperAdmin: true, actorUserId: su.id });
    expect(isManageAdminsError(res)).toBe(false);
    if (isManageAdminsError(res)) return;
    expect(res.created).toBe(true);
    expect(res.row.role).toBe("Admin");
    expect(res.row.createdBy).toBe(su.id);
    expect(await roleOf(org.id, outsider.id)).toBe("Admin");
  });

  it("a non-superadmin OrgAdmin promoting a NON-member is REJECTED (400, cross-tenant)", async () => {
    const { user: owner, org } = await createUserWithOrg();
    const outsider = await createUser(); // not a member of org

    const res = await promoteToAdmin(org.id, outsider.id, { isSuperAdmin: false, actorUserId: owner.id });
    expect(isManageAdminsError(res)).toBe(true);
    if (!isManageAdminsError(res)) return;
    expect(res.status).toBe(400);
    expect(res.error).toContain("Only a SuperAdmin");
    // No membership was created — isolation held.
    expect(await roleOf(org.id, outsider.id)).toBeNull();
  });

  it("an unknown target → 404", async () => {
    const { user: su, org } = await createUserWithOrg();
    const res = await promoteToAdmin(org.id, "no-such-user@nowhere.test", {
      isSuperAdmin: true, actorUserId: su.id,
    });
    expect(isManageAdminsError(res)).toBe(true);
    if (!isManageAdminsError(res)) return;
    expect(res.status).toBe(404);
  });

  it("an empty userIdOrEmail → 400", async () => {
    const { user: su, org } = await createUserWithOrg();
    const res = await promoteToAdmin(org.id, "   ", { isSuperAdmin: true, actorUserId: su.id });
    expect(isManageAdminsError(res)).toBe(true);
    if (!isManageAdminsError(res)) return;
    expect(res.status).toBe(400);
  });
});

describe("demoteAdmin — last-admin protection", () => {
  beforeEach(async () => { await truncateAll(); });

  it("demotes one of two admins to Viewer", async () => {
    const { org } = await createUserWithOrg(); // owner is admin #1 (Owner)
    const admin2 = await createUser();
    await addOrgMember(admin2.id, org.id, "Admin"); // admin #2

    const res = await demoteAdmin(org.id, admin2.id);
    expect(isManageAdminsError(res)).toBe(false);
    if (isManageAdminsError(res)) return;
    expect(res.role).toBe("Viewer");
    expect(await roleOf(org.id, admin2.id)).toBe("Viewer");
  });

  it("refuses to demote the LAST OrgAdmin (org keeps an admin) → 400", async () => {
    const { user: owner, org } = await createUserWithOrg(); // the ONLY Owner/Admin
    const res = await demoteAdmin(org.id, owner.id);
    expect(isManageAdminsError(res)).toBe(true);
    if (!isManageAdminsError(res)) return;
    expect(res.status).toBe(400);
    expect(res.error).toContain("last OrgAdmin");
    // Still an Owner — protection held.
    expect(await roleOf(org.id, owner.id)).toBe("Owner");
  });

  it("demoting a non-admin member (Viewer) → 400", async () => {
    const { org } = await createUserWithOrg();
    const viewer = await createUser();
    await addOrgMember(viewer.id, org.id, "Viewer");
    const res = await demoteAdmin(org.id, viewer.id);
    expect(isManageAdminsError(res)).toBe(true);
    if (!isManageAdminsError(res)) return;
    expect(res.status).toBe(400);
    expect(res.error).toContain("not currently an OrgAdmin");
    expect(await roleOf(org.id, viewer.id)).toBe("Viewer");
  });

  it("demoting a non-member → 404", async () => {
    const { org } = await createUserWithOrg();
    const outsider = await createUser();
    const res = await demoteAdmin(org.id, outsider.id);
    expect(isManageAdminsError(res)).toBe(true);
    if (!isManageAdminsError(res)) return;
    expect(res.status).toBe(404);
  });
});
