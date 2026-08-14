/**
 * SEC-03 — the OrgAdmin scoped backup is downloadable by any Owner/Admin of the
 * org, so the exported User rows must NOT carry members' secrets (password hash,
 * reset token/expiry, Stripe ids). The additive restore re-parents by email and
 * never needs a hash, so redacting them is free.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg } from "../_setup/factories";
import { buildOrgBackup, restoreOrgBackupAdditive } from "@/app/lib/org-backup";
import { parseFullBackup, type AdditiveSelection } from "@/app/lib/full-backup";

const SECRET_COLUMNS = ["password", "resetToken", "resetTokenExpiry", "stripeCustomerId", "stripeSubscriptionId"] as const;

async function seedMemberWithSecrets(orgId: string, email: string) {
  const u = await prisma.user.create({
    data: {
      email,
      name: "Secret Holder",
      password: "$2b$10$abcdefghijklmnopqrstuvwxyzABCDEF0123456789ABCDEF01", // fake bcrypt hash
      resetToken: `reset-${email}`,
      resetTokenExpiry: new Date(Date.now() + 3_600_000),
      stripeCustomerId: `cus_${email.replace(/\W/g, "")}`,
      stripeSubscriptionId: `sub_${email.replace(/\W/g, "")}`,
    },
  });
  await prisma.orgMember.create({ data: { orgId, userId: u.id, role: "Admin" } });
  return u;
}

describe("SEC-03 — org backup redacts member secrets", () => {
  beforeEach(async () => { await truncateAll(); });

  it("exports no password hash, reset token, or Stripe ids for any user", async () => {
    const { org } = await createUserWithOrg();
    await seedMemberWithSecrets(org.id, "member@secret.test");

    const bytes = await buildOrgBackup(org.id, "admin@test", "test");
    const payload = await parseFullBackup(bytes);

    const users = (payload.tables.User as Array<Record<string, unknown>>);
    expect(users.length).toBeGreaterThan(0);
    for (const u of users) {
      for (const col of SECRET_COLUMNS) {
        // The column may be present-but-null (redacted) or absent — never a value.
        expect(u[col] ?? null, `User.${col} must be redacted in the export`).toBeNull();
      }
      // Non-secret identity is still carried, so restore can re-parent by email.
      expect(typeof u.email).toBe("string");
    }
  });

  it("a restore of the redacted backup creates the user with an empty password (login disabled until reset)", async () => {
    const { org } = await createUserWithOrg();
    const member = await seedMemberWithSecrets(org.id, "member@secret.test");
    const bytes = await buildOrgBackup(org.id, "admin@test", "test");
    const payload = await parseFullBackup(bytes);

    // The additive restore matches users by email against the LIVE DB, so to
    // exercise the CREATE path the secret-holder must not already exist. Remove
    // them (membership first) before restoring into a fresh org.
    await prisma.orgMember.deleteMany({ where: { userId: member.id } });
    await prisma.user.delete({ where: { id: member.id } });

    const { org: org2 } = await createUserWithOrg({ email: "owner2@test.dev" });
    const rows = (t: string) => (payload.tables[t] as Array<{ id: string }> | undefined) ?? [];
    const selection: AdditiveSelection = {
      orgIds: rows("Org").map((o) => o.id),
      userIds: rows("User").map((u) => u.id),
      projectIds: [],
      diagramIds: [],
    };
    await restoreOrgBackupAdditive(payload, selection, org2.id);

    const created = await prisma.user.findUnique({ where: { email: "member@secret.test" } });
    expect(created).toBeTruthy();
    expect(created!.password).toBe("");            // schema default — no restored hash
    expect(created!.resetToken).toBeNull();
    expect(created!.stripeCustomerId).toBeNull();  // no stale unique id to collide
    expect(created!.stripeSubscriptionId).toBeNull();
  });
});
