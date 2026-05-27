/**
 * Helper functions for creating in-app notifications.
 *
 * Notifications are minimal — a discriminator string + a JSON payload.
 * Each callsite that creates one knows what payload shape it needs;
 * the bell-popover renderer dispatches on `type` to render the row.
 */

import { prisma } from "@/app/lib/db";

export type NotificationType =
  | "group-invite"
  | "group-invite-accepted"
  | "group-invite-declined"
  | "group-removed"
  | "ownership-transfer"
  | "ownership-transfer-accepted"
  | "ownership-transfer-declined";

export interface NotificationPayload {
  // group-invite / group-invite-accepted / group-invite-declined /
  // group-removed / ownership-transfer*: all carry groupId + groupName.
  groupId?: string;
  groupName?: string;
  // Who triggered the notification (inviter, accepter, etc.).
  fromUserId?: string;
  fromUserName?: string | null;
  fromUserEmail?: string;
  // ownership-transfer*: the pending OwnershipTransfer row.
  transferId?: string;
}

export async function createNotification(
  userId: string,
  type: NotificationType,
  payload: NotificationPayload,
): Promise<void> {
  await prisma.notification.create({
    data: {
      userId,
      type,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: payload as any,
    },
  });
}

export async function createNotifications(
  rows: Array<{ userId: string; type: NotificationType; payload: NotificationPayload }>,
): Promise<void> {
  if (rows.length === 0) return;
  await prisma.notification.createMany({
    data: rows.map(r => ({
      userId: r.userId,
      type: r.type,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: r.payload as any,
    })),
  });
}
