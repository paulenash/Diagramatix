/**
 * POST /api/notifications/[id]/read
 *   Mark a single notification as read. Idempotent.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification || notification.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (notification.readAt == null) {
    await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }
  return NextResponse.json({ ok: true });
}
