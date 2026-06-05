import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation, isSuperuser } from "@/app/lib/superuser";
import {
  requireRole,
  getCurrentOrgId,
  OrgContextError,
} from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

const ADMIN_ROLES = ["Owner", "Admin"] as const;

/** Minimal session shape the gate consumes. NextAuth's `auth()` return
 *  type is a union that includes a middleware-handler variant; this
 *  narrows to just the Session-like branch so `session.user.id` reads
 *  cleanly. */
type SessionForGate = { user?: { id?: string; email?: string | null } } | null;

/**
 * Common gate for both GET and PUT: either the caller is a SuperAdmin
 * (silent elevation everywhere — they can read/write any org's
 * settings), or the URL's orgId matches the caller's active org AND
 * the caller holds the Owner/OrgAdmin role within it.
 *
 * Returns null on success or a NextResponse to short-circuit the
 * handler when the gate rejects.
 */
async function gate(
  session: SessionForGate,
  pathOrgId: string,
): Promise<NextResponse | null> {
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (isSuperuser(session)) return null;

  let activeOrgId: string;
  try {
    activeOrgId = await getCurrentOrgId(session, await cookies());
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  if (activeOrgId !== pathOrgId) {
    return NextResponse.json(
      { error: "Org id in path must match the active org" },
      { status: 400 },
    );
  }

  try {
    await requireRole(session, await cookies(), [...ADMIN_ROLES]);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  return null;
}

/**
 * GET /api/orgs/[id]/settings
 *
 * Returns the editable org-level toggles. Currently just
 * `allowCrossOrgSharing`, which gates whether project owners in this Org
 * can share projects with users outside the Org. More toggles will live
 * here as we add them.
 *
 * Gated by SuperAdmin OR (active-org match + Owner/OrgAdmin role).
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  const blocked = await gate(session, id);
  if (blocked) return blocked;

  const org = await prisma.org.findUnique({
    where: { id },
    select: { id: true, name: true, allowCrossOrgSharing: true },
  });
  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });
  return NextResponse.json(org);
}

/**
 * PUT /api/orgs/[id]/settings
 *
 * Body: { allowCrossOrgSharing?: boolean }
 *
 * Gated by SuperAdmin OR (active-org match + Owner/OrgAdmin role).
 * Read-only impersonation is blocked. Unspecified fields are left
 * untouched — this is a PATCH-shaped PUT matching how the admin UI
 * partials send a single toggle at a time.
 */
export async function PUT(req: Request, { params }: Params) {
  const session = await auth();

  try {
    if (session && isReadOnlyImpersonation(session, await cookies())) {
      return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
    }
  } catch { /* cookies() may fail */ }

  const { id } = await params;
  const blocked = await gate(session, id);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as {
    allowCrossOrgSharing?: unknown;
  };

  const updates: { allowCrossOrgSharing?: boolean } = {};
  if (typeof body.allowCrossOrgSharing === "boolean") {
    updates.allowCrossOrgSharing = body.allowCrossOrgSharing;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No supported fields supplied" }, { status: 400 });
  }

  const updated = await prisma.org.update({
    where: { id },
    data: updates,
    select: { id: true, name: true, allowCrossOrgSharing: true },
  });
  return NextResponse.json(updated);
}
