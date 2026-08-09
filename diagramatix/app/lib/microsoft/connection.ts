/**
 * Whether a user has a live "bring-your-own SharePoint" connection. This is the
 * single source of truth for the `hasMicrosoft` UI gate — replacing the old
 * login-token check, so a user connected via /api/microsoft/connect counts even
 * if they signed in with email/password.
 */
import { prisma } from "@/app/lib/db";

export async function isMicrosoftConnected(userId: string): Promise<boolean> {
  const row = await prisma.microsoftConnection.findUnique({ where: { userId }, select: { id: true } });
  return !!row;
}
