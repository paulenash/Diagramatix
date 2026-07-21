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
import { OrgEntityType } from "@/app/generated/prisma/enums";
import { ORG_POLICY_KEYS } from "@/app/lib/auth/orgPolicy";
import { recordAudit, AUDIT, ipFromRequest } from "@/app/lib/audit";

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
 * Returns every editable Org-level field plus the headline counts used
 * by the Org Info card on the settings page.
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
    select: {
      id: true,
      name: true,
      entityType: true,
      allowCrossOrgSharing: true,
      allowAi: true,
      allowVoiceAi: true,
      allowExternalExport: true,
      allowSharePoint: true,
      allowSupportDiagram: true,
      requireSso: true,
      createdAt: true,
      _count: { select: { members: true, projects: true, diagrams: true } },
    },
  });
  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });
  return NextResponse.json(org);
}

const VALID_ENTITY_TYPES: ReadonlySet<OrgEntityType> = new Set([
  OrgEntityType.ADI,
  OrgEntityType.Insurer,
  OrgEntityType.LifeInsurer,
  OrgEntityType.HealthInsurer,
  OrgEntityType.RSE,
  OrgEntityType.Other,
]);

/**
 * PUT /api/orgs/[id]/settings
 *
 * Body: { allowCrossOrgSharing?: boolean, name?: string, entityType?: OrgEntityType }
 *
 * `allowCrossOrgSharing` is editable by SuperAdmin OR OrgOwner/OrgAdmin.
 *
 * `name` and `entityType` are tenant-identity edits — SuperAdmin only.
 * OrgAdmins reading the doc might assume they own the Org name; they
 * don't. The gate keeps that explicit.
 *
 * Read-only impersonation is blocked. Unspecified fields are left
 * untouched — PATCH-shaped PUT matching how the page sends a single
 * field at a time.
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
    name?: unknown;
    entityType?: unknown;
  };

  const updates: Record<string, unknown> = {};
  if (typeof body.allowCrossOrgSharing === "boolean") {
    updates.allowCrossOrgSharing = body.allowCrossOrgSharing;
  }
  // Enterprise governance policy flags — editable by the org's own Owner/Admin
  // (or SuperAdmin), the same gate as allowCrossOrgSharing. This is how a customer
  // enforces THEIR policy (disable AI, block external export, …).
  const bodyRec = body as Record<string, unknown>;
  for (const key of ORG_POLICY_KEYS) {
    if (typeof bodyRec[key] === "boolean") updates[key] = bodyRec[key];
  }
  // Access policy: require SSO (A3d) — same OrgAdmin/SuperAdmin gate as above.
  if (typeof bodyRec.requireSso === "boolean") updates.requireSso = bodyRec.requireSso;

  // SuperAdmin-only fields. Done with a separate isSuperuser check
  // rather than another gate() call because gate() conflates
  // SuperAdmin and OrgAdmin into one allow, which would let OrgAdmin
  // rename the tenant — the exact gap we're closing.
  const su = isSuperuser(session);
  if (body.name !== undefined) {
    if (!su) {
      return NextResponse.json({ error: "Only a SuperAdmin can rename an Org" }, { status: 403 });
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Org name must be a non-empty string" }, { status: 400 });
    }
    updates.name = name;
  }
  if (body.entityType !== undefined) {
    if (!su) {
      return NextResponse.json({ error: "Only a SuperAdmin can change Org entity type" }, { status: 403 });
    }
    const et = body.entityType as OrgEntityType;
    if (!VALID_ENTITY_TYPES.has(et)) {
      return NextResponse.json({ error: "entityType must be a valid OrgEntityType" }, { status: 400 });
    }
    updates.entityType = et;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No supported fields supplied" }, { status: 400 });
  }

  await recordAudit({
    actorUserId: session?.user?.id ?? null, actorEmail: session?.user?.email ?? null, orgId: id,
    action: AUDIT.OrgSettingsUpdate, targetType: "org", targetId: id,
    meta: { changed: updates }, ip: ipFromRequest(req),
  });

  const updated = await prisma.org.update({
    where: { id },
    data: updates as Parameters<typeof prisma.org.update>[0]["data"],
    select: {
      id: true,
      name: true,
      entityType: true,
      allowCrossOrgSharing: true,
      allowAi: true,
      allowVoiceAi: true,
      allowExternalExport: true,
      allowSharePoint: true,
      allowSupportDiagram: true,
      requireSso: true,
      createdAt: true,
      _count: { select: { members: true, projects: true, diagrams: true } },
    },
  });
  return NextResponse.json(updated);
}
