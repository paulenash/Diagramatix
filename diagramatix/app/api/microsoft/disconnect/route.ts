/**
 * POST /api/microsoft/disconnect — remove the signed-in user's SharePoint
 * connection (deletes the stored tokens). Idempotent.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.microsoftConnection.deleteMany({ where: { userId: session.user.id } });
  return NextResponse.json({ ok: true });
}
