/**
 * Read/dismiss helpers for in-app notifications, extracted verbatim from the
 * notification routes so the recipient-scoping + idempotency rules can be
 * unit-tested directly against the DB.
 *
 *  - markNotificationRead   ← POST /api/notifications/[id]/read
 *  - markAllNotificationsRead ← POST /api/notifications/mark-all-read
 *
 * The routes keep their auth 401 + JSON shaping; the data effect lives here.
 */

import { prisma } from "@/app/lib/db";

/**
 * Mark a single notification read. Recipient-scoped: a notification that is
 * missing OR not owned by `userId` returns { ok:false, status:404 } and writes
 * nothing (the security property). Idempotent: only writes `readAt` when it is
 * currently null.
 */
export async function markNotificationRead(
  notificationId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: 404 }> {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification || notification.userId !== userId) {
    return { ok: false, status: 404 };
  }
  if (notification.readAt == null) {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }
  return { ok: true };
}

/** Mark every unread notification for `userId` as read; returns the count. */
export async function markAllNotificationsRead(
  userId: string,
): Promise<{ count: number }> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { count: result.count };
}
