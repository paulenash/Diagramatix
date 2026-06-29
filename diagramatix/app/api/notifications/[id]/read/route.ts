/**
 * POST /api/notifications/[id]/read
 *   Mark a single notification as read. Idempotent.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { markNotificationRead } from "@/app/lib/notifications/markRead";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

  const result = await markNotificationRead(id, session.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: "Not found" }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
