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
import { getEffectiveUserId, SUPERUSER_EMAILS } from "@/app/lib/superuser";

export const ORG_COOKIE = "dgx_org";

/** Minimal cookie store interface — compatible with whatever cookies() returns */
interface CookieStore {
  get(name: string): { value: string } | undefined;
}

interface SessionLike {
  user?: { id?: string; email?: string | null };
}

// OrgRole type + the WRITE_ROLES / READ_ONLY_ROLES role-sets live in a
// client-safe file (no DB imports) so client components can read them
// directly. Re-exported here so server-side callers keep their existing
// import surface untouched.
export type { OrgRole } from "@/app/lib/auth/orgRoleType";
export { WRITE_ROLES, READ_ONLY_ROLES } from "@/app/lib/auth/orgRoleType";
// Type-only import for use inside this file.
import type { OrgRole } from "@/app/lib/auth/orgRoleType";

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

/* ──────────────────────────────────────────────────────────────────────────
 * Project sharing — access resolution
 *
 * Every project/diagram API route checks the caller's relationship to the
 * target project. Today that meant `project.userId === session.user.id`.
 * With sharing, a non-owner caller may have either VIEW or EDIT access via
 * a `ProjectShare` row, plus a per-Org gate (`Org.allowCrossOrgSharing`)
 * controlling whether the recipient may even be in a different Org than
 * the project's owner.
 *
 * `getProjectAccess` resolves the caller's effective role in one query.
 * `requireProjectAccess` wraps it to throw an OrgContextError(403) when
 * the caller doesn't meet the minimum role.
 * ────────────────────────────────────────────────────────────────────── */

/** Effective project role for a user. Owner > Edit > View > null (no access). */
export type ProjectAccessRole = "owner" | "edit" | "view";

export interface ProjectAccess {
  role: ProjectAccessRole;
  /** Org the Project belongs to (not necessarily the caller's active org). */
  projectOrgId: string;
  /** UserId of the project owner (i.e. Project.userId). */
  ownerUserId: string;
}

/** Numeric rank so we can compare role tiers. Higher = more privileged. */
const PROJECT_ROLE_RANK: Record<ProjectAccessRole, number> = {
  view: 1,
  edit: 2,
  owner: 3,
};

/**
 * "Silent" admin elevation: does this user implicitly count as an owner
 * for projects/diagrams in `orgId`?
 *
 * Two paths grant elevation:
 *
 *   1. SuperAdmin — caller's email is in SUPERUSER_EMAILS. Cross-org by
 *      definition: SuperAdmins act everywhere.
 *   2. OrgAdmin / OrgOwner — caller has OrgMember.role of "Admin" or
 *      "Owner" in the project's Org. (The Prisma enum value "Admin" is
 *      surfaced as "OrgAdmin" in the UI per Slice 7b.)
 *
 * "Silent" is the contract: an elevated caller passes every guard as if
 * they were the project owner, but no ProjectShare row is ever written
 * for them and they never appear in any share list. The share UI only
 * shows real recipients.
 *
 * Returns `true` if either path applies. The two probe queries run in
 * parallel so this adds at most one round-trip to the access check.
 */
async function isAdminElevatedForOrg(
  userId: string,
  projectOrgId: string,
): Promise<boolean> {
  const [user, member] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
    prisma.orgMember.findFirst({
      where: { userId, orgId: projectOrgId, role: { in: ["Admin", "Owner"] } },
      select: { id: true },
    }),
  ]);
  if (user && SUPERUSER_EMAILS.has(user.email)) return true;
  if (member) return true;
  return false;
}

/**
 * Resolve a user's effective role on a project. Returns `null` if the user
 * has no access (not owner, no share row, or the cross-org gate is closed
 * for an inter-Org share).
 *
 * Single Prisma query — fetches the project + the caller's share row (if
 * any) + the project's Org's `allowCrossOrgSharing` flag in one join.
 */
export async function getProjectAccess(
  userId: string,
  projectId: string,
): Promise<ProjectAccess | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      userId: true,
      orgId: true,
      org: { select: { allowCrossOrgSharing: true } },
      shares: {
        where: { userId },
        select: { role: true },
        take: 1,
      },
    },
  });
  if (!project) return null;

  // Owner always wins; no cross-org check needed (it's the owner's own
  // org). Skip the elevation probe entirely — the project owner doesn't
  // need it and we'd otherwise burn two extra queries per call.
  if (project.userId === userId) {
    return { role: "owner", projectOrgId: project.orgId, ownerUserId: project.userId };
  }

  // Silent admin elevation. SuperAdmin (everywhere) and OrgAdmin /
  // OrgOwner (in the project's Org) act as implicit owners — passes
  // every owner-gated guard, but no ProjectShare row exists for them
  // so they don't appear in any share list. Checked before share-row
  // resolution so an OrgAdmin who's also a VIEW share recipient is
  // still treated as an owner.
  if (await isAdminElevatedForOrg(userId, project.orgId)) {
    return { role: "owner", projectOrgId: project.orgId, ownerUserId: project.userId };
  }

  // Non-owner, non-elevated — must have a ProjectShare row.
  const share = project.shares[0];
  if (!share) return null;

  // Cross-org gate: if the share recipient is not a member of the
  // project's Org, the project's Org must have allowCrossOrgSharing on.
  if (!project.org.allowCrossOrgSharing) {
    const membership = await prisma.orgMember.findFirst({
      where: { userId, orgId: project.orgId },
      select: { id: true },
    });
    if (!membership) return null;
  }

  const role: ProjectAccessRole = share.role === "EDIT" ? "edit" : "view";
  return { role, projectOrgId: project.orgId, ownerUserId: project.userId };
}

/**
 * Resolve the caller's project access AND assert it meets `minRole`.
 * Throws OrgContextError(401) if not signed in, (404) if the project
 * doesn't exist, (403) if the caller has no access or insufficient role.
 *
 * Use from API route handlers — the existing OrgContextError handler in
 * each route turns this into the appropriate HTTP status.
 */
export async function requireProjectAccess(
  session: SessionLike | null,
  cookieStore: CookieStore,
  projectId: string,
  minRole: ProjectAccessRole,
): Promise<ProjectAccess> {
  const userId = getEffectiveUserId(session, cookieStore);
  if (!userId) throw new OrgContextError("Not signed in", 401);

  const access = await getProjectAccess(userId, projectId);
  if (!access) {
    // Distinguish "doesn't exist" from "no access" by checking project
    // existence separately. We avoid leaking whether a project id is
    // valid to someone with no access — return 403 for both.
    throw new OrgContextError("No access to this project", 403);
  }
  if (PROJECT_ROLE_RANK[access.role] < PROJECT_ROLE_RANK[minRole]) {
    throw new OrgContextError(
      `Project role ${access.role} cannot perform this action (requires ${minRole})`,
      403,
    );
  }
  return access;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Diagram access — wraps project access plus the legacy orphan-diagram path.
 *
 * Most diagrams now live inside a Project, so a caller's access to a diagram
 * is whatever their project access is. A small number of historical diagrams
 * have `projectId IS NULL` (legacy orphans) — for those, the only person
 * with access is the diagram's original owner. The wrapper folds both into
 * one helper so each /api/diagrams route is a tight one-call guard.
 * ────────────────────────────────────────────────────────────────────── */

/** Minimal shape returned alongside the resolved role. */
interface DiagramHandle {
  id: string;
  userId: string;
  orgId: string;
  projectId: string | null;
  diagramOwnerId: string | null;
}

export interface DiagramAccess {
  diagram: DiagramHandle;
  /** Resolved role — `owner` for legacy orphan diagrams owned by the caller. */
  role: ProjectAccessRole;
  /**
   * Project access record if the diagram is in a project; null for legacy
   * orphans. Routes that need to know the project owner read it from here.
   */
  projectAccess: ProjectAccess | null;
}

/**
 * Resolve a user's effective role on a diagram. Returns null when the
 * diagram doesn't exist, the caller has no project access, or it's a
 * legacy orphan owned by someone else.
 */
export async function getDiagramAccess(
  userId: string,
  diagramId: string,
): Promise<DiagramAccess | null> {
  const diagram = await prisma.diagram.findUnique({
    where: { id: diagramId },
    select: {
      id: true,
      userId: true,
      orgId: true,
      projectId: true,
      diagramOwnerId: true,
    },
  });
  if (!diagram) return null;

  if (diagram.projectId) {
    const projectAccess = await getProjectAccess(userId, diagram.projectId);
    if (!projectAccess) return null;
    return { diagram, role: projectAccess.role, projectAccess };
  }

  // Legacy orphan — original creator passes immediately.
  if (diagram.userId === userId) {
    return { diagram, role: "owner", projectAccess: null };
  }

  // Silent elevation on orphan diagrams: SuperAdmin (everywhere) and
  // OrgAdmin/OrgOwner (in the diagram's Org) get implicit owner. Same
  // contract as the project path — no share row, no visible footprint.
  // Without this an OrgAdmin trying to support a user's pre-Slice-1
  // orphan diagram would be denied even though they have full project-
  // path access to everything else in the Org.
  if (await isAdminElevatedForOrg(userId, diagram.orgId)) {
    return { diagram, role: "owner", projectAccess: null };
  }
  return null;
}

/**
 * Resolve diagram access AND assert it meets `minRole`. 401 if not signed
 * in, 404 if the diagram doesn't exist, 403 otherwise. The "doesn't exist"
 * vs "no access" distinction is deliberately kept here — diagram ids are
 * UUID-style cuids so leaking existence is harmless, and the 404 lets the
 * UI distinguish a deleted diagram from a permission downgrade.
 */
export async function requireDiagramAccess(
  session: SessionLike | null,
  cookieStore: CookieStore,
  diagramId: string,
  minRole: ProjectAccessRole,
): Promise<DiagramAccess> {
  const userId = getEffectiveUserId(session, cookieStore);
  if (!userId) throw new OrgContextError("Not signed in", 401);

  // Fast-path 404: probe existence so the caller can tell apart "deleted"
  // from "you lost permission". getDiagramAccess returns null for both,
  // which would otherwise collapse to a single 403.
  const exists = await prisma.diagram.findUnique({
    where: { id: diagramId },
    select: { id: true },
  });
  if (!exists) throw new OrgContextError("Not found", 404);

  const access = await getDiagramAccess(userId, diagramId);
  if (!access) throw new OrgContextError("No access to this diagram", 403);
  if (PROJECT_ROLE_RANK[access.role] < PROJECT_ROLE_RANK[minRole]) {
    throw new OrgContextError(
      `Diagram role ${access.role} cannot perform this action (requires ${minRole})`,
      403,
    );
  }
  return access;
}
