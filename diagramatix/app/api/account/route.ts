import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import bcrypt from "bcryptjs";
import { isImpersonating } from "@/app/lib/superuser";
import {
  getCurrentOrgId,
  OrgContextError,
} from "@/app/lib/auth/orgContext";

/** GET /api/account — return current user profile + org details */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, createdAt: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let orgId: string | null = null;
  let orgName = "";
  let orgEntityType = "";
  try {
    orgId = await getCurrentOrgId(session, await cookies());
    if (orgId) {
      const org = await prisma.org.findUnique({
        where: { id: orgId },
        select: { name: true, entityType: true },
      });
      if (org) {
        orgName = org.name;
        orgEntityType = org.entityType;
      }
    }
  } catch { /* no org context */ }

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
    org: orgId ? { id: orgId, name: orgName, entityType: orgEntityType } : null,
  });
}

/** PUT /api/account — update user profile and/or org details */
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (isImpersonating(session, await cookies())) {
      return NextResponse.json({ error: "Cannot edit while impersonating" }, { status: 403 });
    }
  } catch { /* cookies may fail */ }

  const body = await req.json();
  const { name, email, orgName, orgEntityType, currentPassword, newPassword } = body;

  const userId = session.user.id;

  // Update user name
  if (name !== undefined) {
    await prisma.user.update({ where: { id: userId }, data: { name: name.trim() || null } });
  }

  // Update email (check uniqueness)
  if (email !== undefined && email !== session.user.email) {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return NextResponse.json({ error: "Email cannot be empty" }, { status: 400 });
    const existing = await prisma.user.findUnique({ where: { email: trimmed } });
    if (existing && existing.id !== userId) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    await prisma.user.update({ where: { id: userId }, data: { email: trimmed } });
  }

  // Change password
  if (newPassword) {
    if (!currentPassword) {
      return NextResponse.json({ error: "Current password required" }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { password: hash } });
  }

  // Update org details
  let orgId: string | null = null;
  try {
    orgId = await getCurrentOrgId(session, await cookies());
  } catch { /* no org */ }

  if (orgId && (orgName !== undefined || orgEntityType !== undefined)) {
    const data: Record<string, string> = {};
    if (orgName !== undefined) data.name = orgName.trim();
    if (orgEntityType !== undefined) data.entityType = orgEntityType;
    if (Object.keys(data).length > 0) {
      await prisma.org.update({ where: { id: orgId }, data });
    }
  }

  return NextResponse.json({ success: true });
}
