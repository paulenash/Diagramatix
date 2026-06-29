/**
 * Org admin promote/demote logic, extracted VERBATIM from the
 * /api/orgs/[id]/admins routes so the cross-tenant isolation + last-admin
 * protection rules can be unit-tested directly against the real DB.
 *
 * The routes keep their gates (requireOrgAdminFor + read-only impersonation),
 * their status codes and their JSON shapes; this module is purely "given an
 * authorised caller, what does the promote/demote actually do".
 *
 *   - promoteToAdmin: SuperAdmin can promote an existing member OR pull in a
 *     non-member as a new Admin. A non-superadmin OrgAdmin can promote an
 *     existing member but is REJECTED (400) if the target isn't already an
 *     OrgMember — cross-tenant isolation.
 *   - demoteAdmin: sets an OrgAdmin (Owner/Admin) back to Viewer, refusing to
 *     demote the last remaining OrgAdmin (the SuperAdmin path does NOT bypass
 *     this — the count threshold is `adminCount <= 1`).
 */
import { prisma } from "@/app/lib/db";

/** The user identity selection both the route and lib return on the OrgMember. */
const MEMBER_SELECT = {
  id: true,
  userId: true,
  role: true,
  createdAt: true,
  createdBy: true,
  user: { select: { id: true, name: true, email: true } },
} as const;

/** The OrgMember row shape returned by promote (matches MEMBER_SELECT). */
export type PromotedMember = {
  id: string;
  userId: string;
  role: string;
  createdAt: Date;
  createdBy: string | null;
  user: { id: string; name: string | null; email: string };
};
export type ManageAdminsError = { error: string; status: number };

/**
 * Promote a user to OrgRole.Admin in `orgId`. Resolves the target by literal
 * cuid first, then lowercased email — matching the ProjectShare POST order.
 *
 * Returns `{ row, created }` on success (created=true → a new OrgMember was
 * created, so the route returns 201; false → existing member updated → 200).
 * Returns `{ error, status }` for the not-found / cross-tenant rejection paths.
 *
 * `actorUserId` stamps `createdBy` on a newly created membership for audit
 * hints. SuperAdmin (isSuperAdmin=true) may pull in a non-member; a
 * non-superadmin OrgAdmin may not.
 */
export async function promoteToAdmin(
  orgId: string,
  targetUserIdOrEmail: string,
  ctx: { isSuperAdmin: boolean; actorUserId: string },
): Promise<{ row: PromotedMember; created: boolean } | ManageAdminsError> {
  const key = (targetUserIdOrEmail ?? "").trim();
  if (!key) {
    return { error: "userIdOrEmail is required", status: 400 };
  }

  // Resolve recipient. Try literal cuid first (cheap), then lowercased
  // email — matches the resolution order used by ProjectShare POST.
  const target =
    (await prisma.user.findUnique({
      where: { id: key },
      select: { id: true, name: true, email: true },
    })) ??
    (await prisma.user.findUnique({
      where: { email: key.toLowerCase() },
      select: { id: true, name: true, email: true },
    }));
  if (!target) {
    return { error: "User not found", status: 404 };
  }

  const existing = await prisma.orgMember.findFirst({
    where: { orgId, userId: target.id },
    select: { id: true, role: true },
  });

  if (!existing && !ctx.isSuperAdmin) {
    // OrgAdmin trying to add a non-member — rejected. The error
    // message tells them to ask a SuperAdmin if they need to bring an
    // outsider in.
    return {
      error:
        "Only a SuperAdmin can add a user who isn't already an OrgMember. Ask a SuperAdmin to add this user to your Org first.",
      status: 400,
    };
  }

  const row = existing
    ? await prisma.orgMember.update({
        where: { id: existing.id },
        data: { role: "Admin" },
        select: MEMBER_SELECT,
      })
    : await prisma.orgMember.create({
        data: {
          orgId,
          userId: target.id,
          role: "Admin",
          createdBy: ctx.actorUserId,
        },
        select: MEMBER_SELECT,
      });

  return { row, created: !existing };
}

/** The OrgMember row shape returned by demote. */
export type DemotedMember = { id: string; userId: string; role: string; orgId: string };

/**
 * Demote the OrgMember `(orgId, userId)` to Viewer. Does NOT delete the row.
 *
 *   - member not found → 404
 *   - role not Owner/Admin → 400
 *   - last-admin guard: refuses if the org's Owner+Admin count is <= 1 → 400
 *     (the SuperAdmin path doesn't bypass this)
 *   - else → set role Viewer and return the updated row.
 */
export async function demoteAdmin(
  orgId: string,
  userId: string,
): Promise<DemotedMember | ManageAdminsError> {
  const member = await prisma.orgMember.findFirst({
    where: { orgId, userId },
    select: { id: true, role: true },
  });
  if (!member) {
    return { error: "Not an OrgMember of this Org", status: 404 };
  }
  if (member.role !== "Owner" && member.role !== "Admin") {
    return { error: "User is not currently an OrgAdmin of this Org", status: 400 };
  }

  // Last-admin guard.
  const adminCount = await prisma.orgMember.count({
    where: { orgId, role: { in: ["Owner", "Admin"] } },
  });
  if (adminCount <= 1) {
    return {
      error:
        "Cannot demote the last OrgAdmin in this Org. Promote someone else first.",
      status: 400,
    };
  }

  const updated = await prisma.orgMember.update({
    where: { id: member.id },
    data: { role: "Viewer" },
    select: { id: true, userId: true, role: true, orgId: true },
  });
  return updated;
}

/** Narrow a promote/demote result to its error branch. */
export function isManageAdminsError(
  r: unknown,
): r is ManageAdminsError {
  return typeof r === "object" && r !== null && "error" in r && "status" in r;
}
