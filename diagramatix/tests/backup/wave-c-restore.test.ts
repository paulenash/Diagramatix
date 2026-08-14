/**
 * Wave C batch 1 — backup/restore data-loss fixes.
 *
 *  DATA-14  org backup must carry + restore the org's OWN rule set (userId null),
 *           not only members' rules.
 *  DATA-19  a user in several orgs must not lose same-named prompts when a
 *           backup is restored (they were collapsed into one org before).
 *  DATA-09  promoting a pending bundle invite only drops the pending row when
 *           the grant genuinely succeeds (or the user is already a member) — a
 *           transient failure keeps the invite for retry.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser, createUserWithOrg, addOrgMember, createProject } from "../_setup/factories";
import { buildOrgBackup, restoreOrgBackupAdditive } from "@/app/lib/org-backup";
import { buildUserBackup, restoreUserBackup } from "@/app/lib/backup";
import { parseFullBackup, type AdditiveSelection } from "@/app/lib/full-backup";
import { promotePendingAudienceMemberships } from "@/app/lib/bundleInvites";

// ── DATA-14 ─────────────────────────────────────────────────────────────────
describe("DATA-14 — org backup carries + restores the org's default rules", () => {
  beforeEach(async () => { await truncateAll(); });

  it("captures the org-default rule (userId null) that a member filter dropped", async () => {
    const { user, org } = await createUserWithOrg();
    await prisma.diagramRules.create({ data: { category: "bpmn", rules: "1. org default", orgId: org.id } }); // userId null
    await prisma.diagramRules.create({ data: { category: "general", rules: "personal", userId: user.id, orgId: org.id } });

    const bytes = await buildOrgBackup(org.id, "admin@test", "test");
    const payload = await parseFullBackup(bytes);

    const rules = payload.tables.DiagramRules as Array<{ category: string; userId: string | null; rules: string }>;
    const orgDefault = rules.find((r) => r.category === "bpmn" && r.userId == null);
    expect(orgDefault, "the org default rule must be in the backup").toBeTruthy();
    expect(orgDefault!.rules).toBe("1. org default");
  });

  it("recreates the org default rule in the target org on additive restore", async () => {
    const { org } = await createUserWithOrg();
    await prisma.diagramRules.create({ data: { category: "bpmn", rules: "1. org default", orgId: org.id } });

    const bytes = await buildOrgBackup(org.id, "admin@test", "test");
    const payload = await parseFullBackup(bytes);

    const { org: org2 } = await createUserWithOrg({ email: "two@test.dev" });
    const rows = (t: string) => (payload.tables[t] as Array<{ id: string }> | undefined) ?? [];
    const selection: AdditiveSelection = {
      orgIds: rows("Org").map((o) => o.id),
      userIds: rows("User").map((u) => u.id),
      projectIds: [],
      diagramIds: [],
    };
    await restoreOrgBackupAdditive(payload, selection, org2.id);

    const restored = await prisma.diagramRules.findFirst({ where: { orgId: org2.id, userId: null, category: "bpmn" } });
    expect(restored, "org default rule must be recreated in the target org").toBeTruthy();
    expect(restored!.rules).toBe("1. org default");
  });
});

// ── DATA-19 ─────────────────────────────────────────────────────────────────
describe("DATA-19 — multi-org prompts survive a restore in their own orgs", () => {
  beforeEach(async () => { await truncateAll(); });

  it("keeps same-named prompts from two orgs instead of collapsing to one", async () => {
    const { user, org: orgA } = await createUserWithOrg();
    const orgB = (await createUserWithOrg({ email: "b-owner@test.dev" })).org;
    await addOrgMember(user.id, orgB.id, "Owner"); // user is in BOTH orgs

    await prisma.prompt.create({ data: { name: "Foo", text: "text-A", diagramType: "bpmn", userId: user.id, orgId: orgA.id } });
    await prisma.prompt.create({ data: { name: "Foo", text: "text-B", diagramType: "bpmn", userId: user.id, orgId: orgB.id } });

    const bytes = await buildUserBackup(user.id, "test");
    // Wipe the live prompts so the restore genuinely recreates them.
    await prisma.prompt.deleteMany({ where: { userId: user.id } });

    await restoreUserBackup(bytes, user.id, orgA.id, "Owner");

    const prompts = await prisma.prompt.findMany({ where: { userId: user.id, name: "Foo" } });
    expect(prompts).toHaveLength(2); // both survived — before the fix only one did
    expect(prompts.find((p) => p.orgId === orgA.id)?.text).toBe("text-A");
    expect(prompts.find((p) => p.orgId === orgB.id)?.text).toBe("text-B");
  });

  it("falls back to the current org for a prompt whose source org the user has left", async () => {
    const { user, org: orgA } = await createUserWithOrg();
    const orgB = (await createUserWithOrg({ email: "b2-owner@test.dev" })).org;
    await addOrgMember(user.id, orgB.id, "Owner");
    await prisma.prompt.create({ data: { name: "Bar", text: "from-B", diagramType: "bpmn", userId: user.id, orgId: orgB.id } });

    const bytes = await buildUserBackup(user.id, "test");
    await prisma.prompt.deleteMany({ where: { userId: user.id } });
    // User leaves org B before restoring.
    await prisma.orgMember.deleteMany({ where: { userId: user.id, orgId: orgB.id } });

    await restoreUserBackup(bytes, user.id, orgA.id, "Owner");

    const bar = await prisma.prompt.findFirst({ where: { userId: user.id, name: "Bar" } });
    expect(bar?.orgId, "an orphaned prompt lands in the current org").toBe(orgA.id);
  });
});

// ── DATA-09 ─────────────────────────────────────────────────────────────────
describe("DATA-09 — bundle-invite promotion drops the pending row only on real success", () => {
  beforeEach(async () => { await truncateAll(); });

  async function seedPending(email: string) {
    const { user, org } = await createUserWithOrg();
    const project = await createProject({ userId: user.id, orgId: org.id });
    const bundle = await prisma.publicationBundle.create({ data: { name: "B", projectId: project.id, publishedById: user.id } });
    const pending = await prisma.pendingBundleAudience.create({ data: { bundleId: bundle.id, email, invitedById: user.id } });
    return { bundle, pending };
  }

  it("promotes: grant created, pending row gone", async () => {
    const invitee = await createUser({ email: "invitee@test.dev" });
    const { bundle } = await seedPending("invitee@test.dev");

    const res = await promotePendingAudienceMemberships(invitee.id, "invitee@test.dev");
    expect(res.promoted).toBe(1);
    expect(await prisma.publicationBundleAudience.findFirst({ where: { bundleId: bundle.id, userId: invitee.id } })).toBeTruthy();
    expect(await prisma.pendingBundleAudience.count()).toBe(0);
  });

  it("already a member: drops the redundant pending row, no duplicate grant", async () => {
    const invitee = await createUser({ email: "member@test.dev" });
    const { bundle } = await seedPending("member@test.dev");
    await prisma.publicationBundleAudience.create({ data: { bundleId: bundle.id, userId: invitee.id } });

    const res = await promotePendingAudienceMemberships(invitee.id, "member@test.dev");
    expect(res.promoted).toBe(0);
    expect(await prisma.publicationBundleAudience.count({ where: { bundleId: bundle.id, userId: invitee.id } })).toBe(1);
    expect(await prisma.pendingBundleAudience.count()).toBe(0); // redundant row cleared
  });

  it("keeps the pending row when the grant transaction fails transiently", async () => {
    const invitee = await createUser({ email: "retry@test.dev" });
    await seedPending("retry@test.dev");

    // Inject a transient failure into the promotion transaction.
    const spy = vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("deadlock detected"));
    const res = await promotePendingAudienceMemberships(invitee.id, "retry@test.dev");
    spy.mockRestore();

    expect(res.promoted).toBe(0);
    // The invite MUST survive for a later retry — this is the DATA-09 fix.
    expect(await prisma.pendingBundleAudience.count()).toBe(1);
    expect(await prisma.publicationBundleAudience.count()).toBe(0);

    // And a subsequent call (no fault) then promotes it.
    const res2 = await promotePendingAudienceMemberships(invitee.id, "retry@test.dev");
    expect(res2.promoted).toBe(1);
    expect(await prisma.pendingBundleAudience.count()).toBe(0);
  });
});
