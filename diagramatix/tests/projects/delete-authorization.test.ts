/**
 * Project-delete authorization (backlog gap). Two layers:
 *
 *  (a) requireRole (app/lib/auth/orgContext.ts) — the org-role gate every write
 *      route layers on top of access. Exercised directly against the test DB
 *      with a constructed session + empty cookie store (no auth() mock), exactly
 *      like the sharing access-guards. getCurrentOrgId resolves the user's
 *      oldest OrgMember (no cookie override), so the seeded membership is the one
 *      it checks.
 *
 *  (b) authorizeProjectDelete (app/lib/projects/deleteProject.ts) — the pure
 *      per-tier verdict extracted from the DELETE route. Pinned across ALL
 *      combinations of the three booleans × three modes so the three-tier
 *      delete model (hard / archive / unorganise) can't silently drift.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { truncateAll } from "../_setup/db";
import { createUser, createUserWithOrg, addOrgMember } from "../_setup/factories";
import { requireRole, OrgContextError } from "@/app/lib/auth/orgContext";
import { authorizeProjectDelete, type ProjectDeleteMode } from "@/app/lib/projects/deleteProject";

const cookies = { get: () => undefined };
const sessionFor = (u: { id: string; email: string }) => ({ user: { id: u.id, email: u.email } });

async function expectDenied(p: Promise<unknown>, status: number) {
  await expect(p).rejects.toMatchObject({ status });
}

describe("requireRole — org-role gate", () => {
  beforeEach(async () => { await truncateAll(); });

  it("null session → 401", async () => {
    await expectDenied(requireRole(null, cookies, ["Owner", "Admin"]), 401);
  });

  it("a user with no org membership cannot resolve an org → throws (no membership)", async () => {
    // getCurrentOrgId only ever resolves an org the user belongs to, so the
    // literal "member row missing" 403 branch in requireRole is unreachable in
    // normal operation: a user with zero memberships fails earlier at org
    // resolution (500). The realistic denial is the wrong-role path below.
    const orphan = await createUser(); // no org membership at all
    await expectDenied(requireRole(sessionFor(orphan), cookies, ["Owner", "Admin"]), 500);
  });

  it("a member whose role is NOT in allowedRoles → 403", async () => {
    const viewer = await createUser();
    const { org } = await createUserWithOrg();
    // Viewer's OWN first membership resolves the org; make it a Viewer role.
    await addOrgMember(viewer.id, org.id, "Viewer");
    await expectDenied(requireRole(sessionFor(viewer), cookies, ["Owner", "Admin"]), 403);
  });

  it("an allowed role → returns { role }", async () => {
    const { user, org } = await createUserWithOrg(); // user is Owner of org
    const res = await requireRole(sessionFor(user), cookies, ["Owner", "Admin"]);
    expect(res.role).toBe("Owner");
    expect(res.orgId).toBe(org.id);
  });

  it("an Admin member also passes when Admin is allowed", async () => {
    const admin = await createUser();
    const { org } = await createUserWithOrg();
    await addOrgMember(admin.id, org.id, "Admin");
    const res = await requireRole(sessionFor(admin), cookies, ["Owner", "Admin"]);
    expect(res.role).toBe("Admin");
  });
});

describe("authorizeProjectDelete — three-tier verdict (all combinations)", () => {
  const modes: ProjectDeleteMode[] = ["hard", "archive", "unorganise"];
  const bools = [false, true];

  /** Reference oracle of the exact current rules. */
  function expected(mode: ProjectDeleteMode, o: boolean, s: boolean, a: boolean): boolean {
    if (mode === "hard") return s && o;
    if (mode === "archive") return a;
    return o || s || a; // unorganise
  }

  for (const mode of modes) {
    for (const isProjectOwner of bools) {
      for (const isSuperuser of bools) {
        for (const isOrgAdmin of bools) {
          const want = expected(mode, isProjectOwner, isSuperuser, isOrgAdmin);
          it(`${mode}: owner=${isProjectOwner} su=${isSuperuser} orgAdmin=${isOrgAdmin} → ${want ? "allow" : "deny"}`, () => {
            const res = authorizeProjectDelete(mode, { isProjectOwner, isSuperuser, isOrgAdmin });
            expect(res.allowed).toBe(want);
            if (!want) expect(typeof res.message).toBe("string");
          });
        }
      }
    }
  }

  it("hard denial carries the SuperAdmin-owner message", () => {
    expect(authorizeProjectDelete("hard", { isProjectOwner: false, isSuperuser: true, isOrgAdmin: true }).message)
      .toBe("Hard delete requires SuperAdmin who owns the project");
  });
});
