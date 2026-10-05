// Server-only. The organisation each new-address SuperAdmin belongs to, and their role in it (Paul, 2026-10-05: "The new Org
// Name for paul@diagramatix.com.au is 'Diagramatix'. Paul should be the OrgAdmin for that new Org. Greg's Org remains
// 'GetAI Org' for which he should be the OrgAdmin."). Idempotent: running it again changes nothing.
import { ORG_ADMIN_ROLE, ORG_ADMIN_ROLES, isOrgAdminRole } from "@/app/lib/auth/orgAdminRole";
import { prisma } from "@/app/lib/db";

export interface SuperAdminOrgSpec {
  orgName: string;
  /** Take over the account's own auto-created personal org ("<Name>'s Org") and rename it, rather than make a second org. */
  adoptPersonalOrg: boolean;
  /** May the org be created when none exists? Not for an org that already exists elsewhere under a name we must not duplicate. */
  createIfMissing: boolean;
}

export const SUPERADMIN_ORGS: Readonly<Record<string, SuperAdminOrgSpec>> = {
  "paul@diagramatix.com.au": { orgName: "Diagramatix", adoptPersonalOrg: true, createIfMissing: true },
  "greg@diagramatix.com.au": { orgName: "GetAI Org", adoptPersonalOrg: false, createIfMissing: false },
};

export const orgSpecFor = (email: string | null | undefined): SuperAdminOrgSpec | null =>
  (email && SUPERADMIN_ORGS[email.toLowerCase()]) || null;

export interface EnsureOrgResult { orgName: string; orgId: string | null; role: string | null; changes: string[] }

export async function ensureSuperAdminOrg(user: { id: string; email: string; name?: string | null }): Promise<EnsureOrgResult | null> {
  const spec = orgSpecFor(user.email);
  if (!spec) return null;
  const changes: string[] = [];

  return prisma.$transaction(async (tx) => {
    let org = await tx.org.findFirst({ where: { name: { equals: spec.orgName, mode: "insensitive" } }, orderBy: { createdAt: "asc" } });

    if (!org && spec.adoptPersonalOrg) {
      // The account's own auto-created org: one it owns, named "<something>'s Org".
      const mine = await tx.orgMember.findMany({
        where: { userId: user.id, role: { in: [...ORG_ADMIN_ROLES] }, org: { name: { endsWith: "'s Org" } } },
        include: { org: true }, orderBy: { createdAt: "asc" },
      });
      if (mine[0]) {
        org = await tx.org.update({ where: { id: mine[0].orgId }, data: { name: spec.orgName } });
        changes.push(`renamed “${mine[0].org.name}” to “${spec.orgName}”`);
      }
    }
    if (!org && spec.createIfMissing) {
      org = await tx.org.create({ data: { name: spec.orgName } });
      changes.push(`created “${spec.orgName}”`);
    }
    if (!org) return { orgName: spec.orgName, orgId: null, role: null, changes: [`“${spec.orgName}” was not found`] };

    const existing = await tx.orgMember.findUnique({ where: { orgId_userId: { orgId: org.id, userId: user.id } } });
    let role = existing?.role ?? null;
    if (!existing) {
      role = ORG_ADMIN_ROLE;
      await tx.orgMember.create({ data: { orgId: org.id, userId: user.id, role, createdBy: user.id } });
      changes.push(`made ${user.email} ${role} of “${org.name}”`);
    } else if (!isOrgAdminRole(existing.role)) {
      role = ORG_ADMIN_ROLE;
      await tx.orgMember.update({ where: { id: existing.id }, data: { role } });
      changes.push(`raised ${user.email} from ${existing.role} to Admin of “${org.name}”`);
    }
    return { orgName: org.name, orgId: org.id, role: role as string | null, changes };
  });
}
