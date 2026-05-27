/**
 * GET /api/notifications
 *   Returns the signed-in user's notifications, newest first.
 *   Query params:
 *     unread=1     — only unread (readAt IS NULL).
 *     limit=N      — max rows (default 20, cap 100).
 *   Response: { rows: Notification[], unreadCount: number }
 *
 * Polled by the dashboard NotificationsBell on a 60 s interval; the
 * unreadCount drives the bell badge.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const onlyUnread = url.searchParams.get("unread") === "1";
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(100, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 20));

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: {
        userId: session.user.id,
        ...(onlyUnread ? { readAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.notification.count({
      where: { userId: session.user.id, readAt: null },
    }),
  ]);

  return NextResponse.json({ rows, unreadCount });
}
