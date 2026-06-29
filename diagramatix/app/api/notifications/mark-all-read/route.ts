/**
 * POST /api/notifications/mark-all-read
 *   Marks every unread notification for the signed-in user as read.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { markAllNotificationsRead } from "@/app/lib/notifications/markRead";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await markAllNotificationsRead(session.user.id);
  return NextResponse.json({ ok: true, markedRead: result.count });
}
