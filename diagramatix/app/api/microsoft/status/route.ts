/**
 * GET /api/microsoft/status — can this user use SharePoint, is the signed-in
 * user connected, and as whom. Returns booleans + the account UPN/name ONLY —
 * never any token, and never an env value.
 *
 * `configured` is what the SharePoint window asks BEFORE it offers to connect:
 * a server that could only refuse should say so in a Diagramatix error popup,
 * not send the user to Microsoft (Paul, 2026-09-22/23).
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { orgPolicyAllows } from "@/app/lib/auth/orgPolicy";
import { sharePointServerConfigured } from "@/app/lib/microsoft/serverConfig";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const conn = await prisma.microsoftConnection.findUnique({
    where: { userId: session.user.id },
    select: { accountUpn: true, accountName: true },
  });
  return NextResponse.json({
    configured: sharePointServerConfigured(),
    allowed: await orgPolicyAllows(session, "allowSharePoint"),
    connected: !!conn,
    accountUpn: conn?.accountUpn,
    accountName: conn?.accountName ?? undefined,
  });
}
