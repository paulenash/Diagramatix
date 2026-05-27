/**
 * GET /api/admin/notifications
 *   Superuser-only. Returns every Notification in the system newest
 *   first, with sender (joined from payload.fromUserId) and recipient
 *   (joined from Notification.userId) details surfaced for the admin
 *   modal. Optional ?recipientUserId=... to filter by a single recipient.
 *
 *   This is a passive view-only feed — admin can't currently act on
 *   notifications from here, only inspect them.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const recipientUserId = url.searchParams.get("recipientUserId") ?? undefined;

  // Newest first. Cap at 500 — that's enough for paul/greg's current
  // user base and keeps the modal responsive.
  const rows = await prisma.notification.findMany({
    where: recipientUserId ? { userId: recipientUserId } : {},
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  // Resolve unique sender ids from payload and look them up in one shot.
  const senderIds = new Set<string>();
  for (const r of rows) {
    const p = r.payload as { fromUserId?: string } | null;
    if (p?.fromUserId) senderIds.add(p.fromUserId);
  }
  const senders = senderIds.size === 0
    ? []
    : await prisma.user.findMany({
      where: { id: { in: Array.from(senderIds) } },
      select: { id: true, name: true, email: true },
    });
  const senderById = new Map(senders.map(s => [s.id, s]));

  // Also surface the set of distinct recipients so the modal's filter
  // dropdown can be populated without a second round-trip.
  const recipients = await prisma.user.findMany({
    where: {
      id: { in: Array.from(new Set(rows.map(r => r.userId))) },
    },
    select: { id: true, name: true, email: true },
    orderBy: { email: "asc" },
  });

  return NextResponse.json({
    rows: rows.map(r => {
      const p = (r.payload ?? {}) as {
        fromUserId?: string;
        fromUserName?: string | null;
        fromUserEmail?: string;
        groupId?: string;
        groupName?: string;
      };
      const sender = p.fromUserId ? senderById.get(p.fromUserId) ?? null : null;
      return {
        id: r.id,
        type: r.type,
        createdAt: r.createdAt.toISOString(),
        readAt: r.readAt ? r.readAt.toISOString() : null,
        recipient: {
          id: r.user.id,
          name: r.user.name,
          email: r.user.email,
        },
        sender: sender
          ? { id: sender.id, name: sender.name, email: sender.email }
          : p.fromUserId
            ? {
              id: p.fromUserId,
              name: p.fromUserName ?? null,
              email: p.fromUserEmail ?? "(deleted user)",
            }
            : null,
        groupId: p.groupId ?? null,
        groupName: p.groupName ?? null,
      };
    }),
    recipients,
  });
}
