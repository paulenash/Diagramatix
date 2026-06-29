/**
 * Collaboration-group membership (#8b).
 *
 * Pins the owner-only invite gate + the self-service member transitions
 * (accept/decline/leave) + owner remove, and the notification each emits —
 * the exact data effects the group member routes call, in
 * app/lib/groups/membership.ts — against the test DB, no mocks.
 *
 * Pinned strings (the ACTUAL values the code uses):
 *   member.status:        "invited" | "accepted" | "declined" | "left" | "removed"
 *   notification.type:    "group-invite" (invite), "group-invite-accepted" (accept),
 *                         "group-invite-declined" (decline), "group-removed" (remove)
 *   NOTE: remove is a SOFT remove — the row stays with status="removed" (not deleted).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser } from "../_setup/factories";
import { inviteGroupMembers, groupMemberAction } from "@/app/lib/groups/membership";

async function createGroup(ownerId: string, name = "Reviewers") {
  return prisma.collaborationGroup.create({ data: { name, ownerId } });
}

const memberRow = (groupId: string, userId: string) =>
  prisma.collaborationGroupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });

const notifsFor = (userId: string) =>
  prisma.notification.findMany({ where: { userId } });

describe("collaboration-group membership", () => {
  beforeEach(async () => { await truncateAll(); });

  it("owner invites a user → invited member row + a group-invite notification on the invitee", async () => {
    const owner = await createUser();
    const invitee = await createUser();
    const group = await createGroup(owner.id);

    const res = await inviteGroupMembers(group.id, owner.id, [invitee.id]);
    expect(res).toMatchObject({ ok: true, invited: 1 });

    const row = await memberRow(group.id, invitee.id);
    expect(row?.status).toBe("invited");
    expect(row?.invitedById).toBe(owner.id);

    const notifs = await notifsFor(invitee.id);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe("group-invite");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((notifs[0].payload as any).groupId).toBe(group.id);
  });

  it("a NON-owner inviting → 403 and NO member created", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const invitee = await createUser();
    const group = await createGroup(owner.id);

    const res = await inviteGroupMembers(group.id, stranger.id, [invitee.id]);
    expect(res).toMatchObject({ error: "Forbidden", status: 403 });

    expect(await memberRow(group.id, invitee.id)).toBeNull();
  });

  it("owner inviting THEMSELVES → skipped (no row, no notification)", async () => {
    const owner = await createUser();
    const group = await createGroup(owner.id);

    const res = await inviteGroupMembers(group.id, owner.id, [owner.id]);
    expect(res).toMatchObject({ ok: true, invited: 0 });

    expect(await memberRow(group.id, owner.id)).toBeNull();
    expect(await notifsFor(owner.id)).toHaveLength(0);
  });

  it("invitee ACCEPTS → status accepted + the owner gets a group-invite-accepted notification", async () => {
    const owner = await createUser();
    const invitee = await createUser();
    const group = await createGroup(owner.id);
    await inviteGroupMembers(group.id, owner.id, [invitee.id]);

    const res = await groupMemberAction(group.id, invitee.id, invitee.id, "accept");
    expect(res).toMatchObject({ ok: true, status: "accepted" });

    const row = await memberRow(group.id, invitee.id);
    expect(row?.status).toBe("accepted");
    expect(row?.joinedAt).not.toBeNull();

    const ownerNotifs = await notifsFor(owner.id);
    expect(ownerNotifs).toHaveLength(1);
    expect(ownerNotifs[0].type).toBe("group-invite-accepted");
  });

  it("invitee DECLINES → status declined + the owner is notified (group-invite-declined)", async () => {
    const owner = await createUser();
    const invitee = await createUser();
    const group = await createGroup(owner.id);
    await inviteGroupMembers(group.id, owner.id, [invitee.id]);

    const res = await groupMemberAction(group.id, invitee.id, invitee.id, "decline");
    expect(res).toMatchObject({ ok: true, status: "declined" });

    expect((await memberRow(group.id, invitee.id))?.status).toBe("declined");

    const ownerNotifs = await notifsFor(owner.id);
    expect(ownerNotifs).toHaveLength(1);
    expect(ownerNotifs[0].type).toBe("group-invite-declined");
  });

  it("owner REMOVES a member → soft-removed (status=removed) + the removed user notified (group-removed)", async () => {
    const owner = await createUser();
    const member = await createUser();
    const group = await createGroup(owner.id);
    await inviteGroupMembers(group.id, owner.id, [member.id]);
    await groupMemberAction(group.id, member.id, member.id, "accept");

    const res = await groupMemberAction(group.id, owner.id, member.id, "remove");
    expect(res).toMatchObject({ ok: true, status: "removed" });

    // Soft remove: the row remains with status "removed" (verbatim route behaviour).
    expect((await memberRow(group.id, member.id))?.status).toBe("removed");

    const memberNotifs = (await notifsFor(member.id)).filter(n => n.type === "group-removed");
    expect(memberNotifs).toHaveLength(1);
  });

  it("a non-owner trying to remove a different member → 403 (Owner only)", async () => {
    const owner = await createUser();
    const member = await createUser();
    const stranger = await createUser();
    const group = await createGroup(owner.id);
    await inviteGroupMembers(group.id, owner.id, [member.id]);
    await groupMemberAction(group.id, member.id, member.id, "accept");

    const res = await groupMemberAction(group.id, stranger.id, member.id, "remove");
    expect(res).toMatchObject({ error: "Owner only", status: 403 });

    // Still accepted — untouched.
    expect((await memberRow(group.id, member.id))?.status).toBe("accepted");
  });

  it("an action on a non-member → 404", async () => {
    const owner = await createUser();
    const nonMember = await createUser();
    const group = await createGroup(owner.id);

    const res = await groupMemberAction(group.id, nonMember.id, nonMember.id, "accept");
    expect(res).toMatchObject({ error: "Member not found", status: 404 });
  });
});
