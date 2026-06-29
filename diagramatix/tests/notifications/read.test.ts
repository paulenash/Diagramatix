/**
 * Notifications read/dismiss (#8a).
 *
 * Pins the recipient-scoping + idempotency of the mark-read helpers
 * (markNotificationRead / markAllNotificationsRead in
 * app/lib/notifications/markRead.ts) — the exact data effect the
 * POST /api/notifications/[id]/read and /mark-all-read routes call — against
 * the test DB, no mocks. The load-bearing property is the 404 a DIFFERENT user
 * gets when they try to mark someone else's notification, with NO write.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser } from "../_setup/factories";
import { createNotification } from "@/app/lib/notifications";
import { markNotificationRead, markAllNotificationsRead } from "@/app/lib/notifications/markRead";

async function seedNotification(userId: string) {
  await createNotification(userId, "feedback-received", { diagramId: "d1", feedbackId: "f1" });
  return prisma.notification.findFirstOrThrow({ where: { userId } });
}

describe("notifications — mark read", () => {
  beforeEach(async () => { await truncateAll(); });

  it("a recipient marks their own notification read → readAt set, ok", async () => {
    const recipient = await createUser();
    const n = await seedNotification(recipient.id);
    expect(n.readAt).toBeNull();

    const res = await markNotificationRead(n.id, recipient.id);
    expect(res).toEqual({ ok: true });

    const after = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.readAt).not.toBeNull();
  });

  it("a second mark is idempotent → readAt unchanged", async () => {
    const recipient = await createUser();
    const n = await seedNotification(recipient.id);

    await markNotificationRead(n.id, recipient.id);
    const first = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    const firstReadAt = first.readAt;

    const res = await markNotificationRead(n.id, recipient.id);
    expect(res).toEqual({ ok: true });

    const second = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(second.readAt?.getTime()).toBe(firstReadAt?.getTime());
  });

  it("a DIFFERENT user cannot mark it → 404 AND it stays unread (the security property)", async () => {
    const recipient = await createUser();
    const stranger = await createUser();
    const n = await seedNotification(recipient.id);

    const res = await markNotificationRead(n.id, stranger.id);
    expect(res).toEqual({ ok: false, status: 404 });

    // No write happened — still unread.
    const after = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.readAt).toBeNull();
  });

  it("a missing notification → 404", async () => {
    const recipient = await createUser();
    const res = await markNotificationRead("cnonexistent000000000000", recipient.id);
    expect(res).toEqual({ ok: false, status: 404 });
  });

  it("mark-all marks ONLY the caller's unread, leaving another user's untouched + returns the count", async () => {
    const caller = await createUser();
    const other = await createUser();
    // Two unread for the caller, one unread for the other.
    await createNotification(caller.id, "feedback-received", { diagramId: "a" });
    await createNotification(caller.id, "feedback-received", { diagramId: "b" });
    await createNotification(other.id, "feedback-received", { diagramId: "c" });

    const res = await markAllNotificationsRead(caller.id);
    expect(res.count).toBe(2);

    // Caller's are all read.
    const callerUnread = await prisma.notification.count({ where: { userId: caller.id, readAt: null } });
    expect(callerUnread).toBe(0);
    // Other user untouched.
    const otherUnread = await prisma.notification.count({ where: { userId: other.id, readAt: null } });
    expect(otherUnread).toBe(1);
  });
});
