import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import {
  requireRole,
  getCurrentOrgId,
  OrgContextError,
} from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

const ADMIN_ROLES = ["Owner", "Admin"] as const;

/**
 * GET /api/orgs/[id]/settings
 *
 * Returns the editable org-level toggles. Currently just
 * `allowCrossOrgSharing`, which gates whether project owners in this Org
 * can share projects with users outside the Org. More toggles will live
 * here as we add them.
 *
 * Gated by Org Owner/Admin role + a path-vs-active-org sanity check, so
 * users can't peek at a different Org's settings via a guessed id.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Match the URL's orgId against the caller's active orgId before
  // anything else — these endpoints are scoped to the active org, not
  // an arbitrary one the caller happens to be a member of. The role
  // check below would catch this, but matching first gives a clearer
  // 400 instead of a misleading 403.
  let activeOrgId: string;
  try {
    activeOrgId = await getCurrentOrgId(session, await cookies());
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  if (activeOrgId !== id) {
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
 * Gated by Org Owner/Admin role. Read-only impersonation is blocked.
 * Unspecified fields are left untouched — this is a PATCH-shaped PUT
 * matching how the admin UI partials send a single toggle at a time.
 */
export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (isReadOnlyImpersonation(session, await cookies())) {
      return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
    }
  } catch { /* cookies() may fail */ }

  const { id } = await params;

  let activeOrgId: string;
  try {
    activeOrgId = await getCurrentOrgId(session, await cookies());
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  if (activeOrgId !== id) {
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
