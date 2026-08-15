/**
 * SEC-08 — user search must not expose a cross-tenant directory. Colleagues
 * (shared org) match on a partial fragment; anyone else only by exact email.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg, addOrgMember, createUser } from "../_setup/factories";
import { searchUsers } from "@/app/lib/userSearch";

describe("searchUsers (SEC-08)", () => {
  beforeEach(async () => { await truncateAll(); });

  it("finds a shared-org colleague by a partial name fragment", async () => {
    const { user: caller, org } = await createUserWithOrg();
    const colleague = await createUser({ email: "alice@acme.test", name: "Alice Smith" });
    await addOrgMember(colleague.id, org.id, "Viewer");

    const res = await searchUsers({ callerId: caller.id, q: "alic" });
    expect(res.map((u) => u.id)).toContain(colleague.id);
  });

  it("does NOT find a different-org user by a partial fragment", async () => {
    const { user: caller } = await createUserWithOrg();
    // Stranger in a totally separate org.
    await createUserWithOrg({ email: "stranger@other.test" });

    const partial = await searchUsers({ callerId: caller.id, q: "stranger" });
    expect(partial).toHaveLength(0);

    // A domain fish must return nothing across tenants.
    const fish = await searchUsers({ callerId: caller.id, q: "@other.test" });
    expect(fish).toHaveLength(0);
  });

  it("DOES find a different-org user by their EXACT email (known-address invite)", async () => {
    const { user: caller } = await createUserWithOrg();
    const stranger = (await createUserWithOrg({ email: "stranger@other.test" })).user;

    const exact = await searchUsers({ callerId: caller.id, q: "stranger@other.test" });
    expect(exact.map((u) => u.id)).toEqual([stranger.id]);
  });

  it("never returns the caller or excluded users", async () => {
    const { user: caller, org } = await createUserWithOrg();
    const colleague = await createUser({ email: "bob@acme.test", name: "Bob" });
    await addOrgMember(colleague.id, org.id, "Viewer");
    // Caller matches their own name fragment but must be excluded.
    const self = await searchUsers({ callerId: caller.id, q: caller.email.slice(0, 4) });
    expect(self.map((u) => u.id)).not.toContain(caller.id);

    const withExclusion = await searchUsers({ callerId: caller.id, q: "bob", excludeUserIds: [colleague.id] });
    expect(withExclusion).toHaveLength(0);
  });
});
