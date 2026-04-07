/**
 * CPS 230 Phase 0 — Org context helpers.
 *
 * Every API route that touches Project / Diagram must scope its queries by
 * orgId. This module resolves the active org for a given session and
 * provides role-checking utilities for write operations.
 *
 * Until the org switcher UI lands, the active org is simply the user's first
 * OrgMember. The cookie-based override is read here so the future switcher
 * just sets a cookie — no other code needs to change.
 *
 * IMPORTANT: this module is server-only. It must never be imported from
 * client components.
 */

// Server-only module — must never be imported from client components.
import { prisma } from "@/app/lib/db";
import { getEffectiveUserId } from "@/app/lib/superuser";

export const ORG_COOKIE = "dgx_org";

/** Minimal cookie store interface — compatible with whatever cookies() returns */
interface CookieStore {
  get(name: string): { value: string } | undefined;
}

interface SessionLike {
  user?: { id?: string; email?: string | null };
}

/** Roles allowed to perform write operations on org content */
export type OrgRole =
  | "Owner"
  | "Admin"
  | "RiskOwner"
  | "ProcessOwner"
  | "ControlOwner"
  | "InternalAudit"
  | "BoardObserver"
  | "Viewer";

/** Roles that can mutate diagrams / projects (i.e. not read-only) */
export const WRITE_ROLES: OrgRole[] = [
  "Owner",
  "Admin",
  "RiskOwner",
  "ProcessOwner",
  "ControlOwner",
];

/** Roles that have read-only access — useful for guarding admin actions */
export const READ_ONLY_ROLES: OrgRole[] = [
  "InternalAudit",
  "BoardObserver",
  "Viewer",
];

/**
 * Resolve the active org for the current session.
 *
 * Resolution order:
 *   1. dgx_org cookie value, if it points to an org the user is a member of
 *   2. The user's first OrgMember row (oldest membership wins)
 *
 * Honours superuser impersonation: when the superuser is impersonating
 * another user, this returns the impersonated user's org.
 *
 * Throws if the user has no OrgMember rows (should be impossible after the
 * Phase 0 backfill — every user gets a default org).
 */
export async function getCurrentOrgId(
  session: SessionLike | null,
  cookieStore: CookieStore,
): Promise<string> {
  const userId = getEffectiveUserId(session, cookieStore);
  if (!userId) throw new OrgContextError("Not signed in", 401);

  // 1. Cookie override
  const cookieOrgId = cookieStore.get(ORG_COOKIE)?.value;
  if (cookieOrgId) {
    const member = await prisma.orgMember.findFirst({
      where: { userId, orgId: cookieOrgId },
      select: { orgId: true },
    });
    if (member) return member.orgId;
  }

  // 2. Fall back to the user's first OrgMember
  const first = await prisma.orgMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { orgId: true },
  });
  if (!first) {
    throw new OrgContextError(
      "User has no org membership. Run scripts/backfill-orgs.ts.",
      500,
    );
  }
  return first.orgId;
}

/**
 * Resolve the active org AND verify the user has one of the allowed roles
 * within it. Use for write operations.
 *
 * Throws OrgContextError(403) if the user lacks any of the required roles.
 */
export async function requireRole(
  session: SessionLike | null,
  cookieStore: CookieStore,
  allowedRoles: OrgRole[],
): Promise<{ orgId: string; userId: string; role: OrgRole }> {
  const userId = getEffectiveUserId(session, cookieStore);
  if (!userId) throw new OrgContextError("Not signed in", 401);

  const orgId = await getCurrentOrgId(session, cookieStore);
  const member = await prisma.orgMember.findFirst({
    where: { userId, orgId },
    select: { role: true },
  });
  if (!member) {
    throw new OrgContextError("Not a member of this org", 403);
  }
  if (!allowedRoles.includes(member.role as OrgRole)) {
    throw new OrgContextError(
      `Role ${member.role} cannot perform this action`,
      403,
    );
  }
  return { orgId, userId, role: member.role as OrgRole };
}

/**
 * Read the active org without throwing — returns null if none. Useful for
 * routes that need to handle the "no org yet" case gracefully (e.g. the
 * org switcher UI itself).
 */
export async function tryGetCurrentOrgId(
  session: SessionLike | null,
  cookieStore: CookieStore,
): Promise<string | null> {
  try {
    return await getCurrentOrgId(session, cookieStore);
  } catch {
    return null;
  }
}

/**
 * List all orgs the current user is a member of.
 */
export async function getUserOrgs(
  session: SessionLike | null,
  cookieStore: CookieStore,
): Promise<Array<{ id: string; name: string; role: OrgRole }>> {
  const userId = getEffectiveUserId(session, cookieStore);
  if (!userId) return [];
  const memberships = await prisma.orgMember.findMany({
    where: { userId },
    include: { org: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => ({
    id: m.org.id,
    name: m.org.name,
    role: m.role as OrgRole,
  }));
}

/**
 * Error type carrying an HTTP status. Routes catch this and turn it into
 * a NextResponse with the matching status code.
 */
export class OrgContextError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "OrgContextError";
  }
}
