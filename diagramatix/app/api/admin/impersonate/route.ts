import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser, IMPERSONATE_COOKIE, IMPERSONATE_MODE_COOKIE } from "@/app/lib/superuser";
import { getCurrentOrgId } from "@/app/lib/auth/orgContext";
import { recordAudit, AUDIT, ipFromRequest } from "@/app/lib/audit";

/** POST — start impersonating a user */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const su = isSuperuser(session);

  const { userId, mode, reason } = (await req.json()) as { userId?: string; mode?: string; reason?: string };
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }
  const resolvedMode: "view" | "edit" = mode === "edit" ? "edit" : "view";
  // Edit mode mutates another user's data — require a reason (recorded in the
  // audit log) and time-box it tighter than view mode (ENT-02).
  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  if (resolvedMode === "edit" && trimmedReason.length < 3) {
    return NextResponse.json({ error: "Edit-mode impersonation requires a reason." }, { status: 400 });
  }

  // Validate target user exists
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Non-SuperAdmin path (Paul's 2026-06-08 item 8): an OrgAdmin
  // (Owner/Admin in their active Org) can impersonate, but ONLY
  // users who are members of that same Org. SuperAdmin bypasses
  // the org check entirely.
  if (!su) {
    const cookieStore = await cookies();
    const activeOrgId = await getCurrentOrgId(session, cookieStore);
    const callerMembership = await prisma.orgMember.findFirst({
      where: { userId: session.user.id, orgId: activeOrgId },
      select: { role: true },
    });
    const isOrgAdmin = callerMembership?.role === "Owner" || callerMembership?.role === "Admin";
    if (!isOrgAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const targetIsInOrg = await prisma.orgMember.findFirst({
      where: { userId, orgId: activeOrgId },
      select: { id: true },
    });
    if (!targetIsInOrg) {
      return NextResponse.json({ error: "Target user is not in your Org" }, { status: 403 });
    }
  }

  const cookieStore = await cookies();
  // HttpOnly + Secure: these cookies decide whose data every query runs against,
  // so client JS must never read or forge them. The "you are impersonating"
  // banner is driven by a server-computed `isImpersonating` flag, not by reading
  // these cookies in the browser (ENT-02).
  const secure = process.env.NODE_ENV === "production";
  // Edit mode is time-boxed tighter (1h) than read-only view (8h).
  const maxAge = resolvedMode === "edit" ? 60 * 60 : 60 * 60 * 8;
  cookieStore.set(IMPERSONATE_COOKIE, userId, {
    path: "/", sameSite: "lax", httpOnly: true, secure, maxAge,
  });
  cookieStore.set(IMPERSONATE_MODE_COOKIE, resolvedMode, {
    path: "/", sameSite: "lax", httpOnly: true, secure, maxAge,
  });

  await recordAudit({
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    effectiveUserId: userId,
    action: AUDIT.ImpersonateStart,
    targetType: "user",
    targetId: userId,
    meta: { mode: resolvedMode, targetEmail: target.email, viaSuperAdmin: su, ...(trimmedReason ? { reason: trimmedReason } : {}) },
    ip: ipFromRequest(req),
  });

  return NextResponse.json({ ok: true, user: target, mode: resolvedMode });
}

/** DELETE — stop impersonating */
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const prevTarget = cookieStore.get(IMPERSONATE_COOKIE)?.value ?? null;
  const prevMode = cookieStore.get(IMPERSONATE_MODE_COOKIE)?.value ?? null;
  cookieStore.delete(IMPERSONATE_COOKIE);
  cookieStore.delete(IMPERSONATE_MODE_COOKIE);

  if (prevTarget) {
    await recordAudit({
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      effectiveUserId: prevTarget,
      action: AUDIT.ImpersonateStop,
      targetType: "user",
      targetId: prevTarget,
      meta: { mode: prevMode },
      ip: ipFromRequest(req),
    });
  }

  return NextResponse.json({ ok: true });
}
