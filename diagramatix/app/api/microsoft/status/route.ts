/**
 * GET /api/microsoft/status — is the signed-in user connected to SharePoint, and
 * as whom. Returns booleans + the account UPN/name ONLY — never any token.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const conn = await prisma.microsoftConnection.findUnique({
    where: { userId: session.user.id },
    select: { accountUpn: true, accountName: true },
  });
  return NextResponse.json({
    connected: !!conn,
    accountUpn: conn?.accountUpn,
    accountName: conn?.accountName ?? undefined,
  });
}
