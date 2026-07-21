import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import bcrypt from "bcryptjs";
import { isImpersonating, isSuperuser } from "@/app/lib/superuser";
import {
  getCurrentOrgId,
  requireOrgAdminFor,
  OrgContextError,
} from "@/app/lib/auth/orgContext";
import { recordAudit, AUDIT, ipFromRequest } from "@/app/lib/audit";
import { eraseUser } from "@/app/lib/account/eraseUser";

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
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
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
    // Editing the org's identity requires Owner/Admin (or SuperAdmin) — a plain
    // member must not be able to rename or re-type the org (ENT-11).
    try {
      await requireOrgAdminFor(session, await cookies(), orgId);
    } catch (e) {
      if (e instanceof OrgContextError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
    const data: Record<string, string> = {};
    if (orgName !== undefined) data.name = orgName.trim();
    if (orgEntityType !== undefined) data.entityType = orgEntityType;
    if (Object.keys(data).length > 0) {
      await prisma.org.update({ where: { id: orgId }, data });
    }
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/account — self-service account erasure (GDPR right to erasure, ENT-12).
 *   Body: { confirmEmail: string } — must match the caller's own email.
 *
 * Permanently deletes the caller and cascades their data (Diagram, Project,
 * OrgMember, DiagramTemplate, Prompt, DiagramRules, UsageCounter). Published
 * versions/bundles survive with a null author (SetNull). Any Org the caller was
 * the SOLE remaining member of — with no data left after the cascade — is then
 * removed too, so self-erasure doesn't leave orphan orgs behind. Audited.
 *
 * Blocked for SuperAdmins (would remove an administrator — they're handled via
 * the admin route) and while impersonating.
 */
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    if (isImpersonating(session, await cookies())) {
      return NextResponse.json({ error: "Cannot delete an account while impersonating" }, { status: 403 });
    }
  } catch { /* cookies may fail */ }
  if (isSuperuser(session)) {
    return NextResponse.json(
      { error: "Administrator accounts can't be self-deleted. Contact support." },
      { status: 403 },
    );
  }

  const userId = session.user.id;
  const body = await req.json().catch(() => ({}));
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, orgMembers: { select: { orgId: true } }, _count: { select: { projects: true, diagrams: true } } },
  });
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (typeof body.confirmEmail !== "string" || body.confirmEmail.trim().toLowerCase() !== me.email.trim().toLowerCase()) {
    return NextResponse.json({ error: "Type your email address exactly to confirm deletion." }, { status: 400 });
  }

  const orgIds = me.orgMembers.map((m) => m.orgId);

  await recordAudit({
    actorUserId: userId, actorEmail: me.email,
    action: AUDIT.UserSelfDelete, targetType: "user", targetId: userId,
    meta: { projects: me._count.projects, diagrams: me._count.diagrams, orgs: orgIds.length },
    ip: ipFromRequest(req),
  });

  const { orgsRemoved } = await eraseUser(userId);
  return NextResponse.json({ deleted: true, orgsRemoved });
}
