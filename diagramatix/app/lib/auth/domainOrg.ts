/**
 * Domain-managed org membership.
 *
 * An Org can "claim" one or more email domains (Org.emailDomains). A user whose
 * email domain matches auto-JOINS that org on registration / SSO. Everyone else
 * joins the one shared "Default Org" — never a personal org of their own, and never
 * as its administrator (Paul, 2026-10-06). There is no self-serve org creation
 * (POST /api/orgs is SuperAdmin-only).
 */
import { prisma } from "@/app/lib/db";
import type { OrgRole } from "@/app/lib/auth/orgRoleType";

/** Role granted to a domain auto-joiner when the Org doesn't set its own
 *  domainJoinRole. A write-capable member, but not an admin/owner. */
export const DEFAULT_DOMAIN_JOIN_ROLE: OrgRole = "ProcessOwner";

/** Lowercased domain part of an email, or "" when malformed. */
export function emailDomain(email: string): string {
  return String(email).toLowerCase().split("@")[1]?.trim() ?? "";
}

/** The Org that claims this email's domain (first by age), with the role a new
 *  member should receive. Null when the domain is unmanaged. */
export async function resolveDomainOrg(
  email: string,
): Promise<{ orgId: string; role: OrgRole } | null> {
  const domain = emailDomain(email);
  if (!domain) return null;
  const org = await prisma.org.findFirst({
    where: { emailDomains: { has: domain } },
    select: { id: true, domainJoinRole: true },
    orderBy: { createdAt: "asc" },
  });
  if (!org) return null;
  return { orgId: org.id, role: (org.domainJoinRole as OrgRole | null) ?? DEFAULT_DOMAIN_JOIN_ROLE };
}

/** True when the email's domain is claimed by some Org (the user is
 *  domain-managed and must not get / create a personal org). */
export async function isDomainManaged(email: string): Promise<boolean> {
  return (await resolveDomainOrg(email)) !== null;
}

/** The one Org that everybody without a claiming email domain belongs to. A fixed id, so two
 *  sign-ups at once cannot create two. */
export const DEFAULT_ORG_ID = "default-org";
export const DEFAULT_ORG_NAME = "Default Org";

/** Minimal DB surface — satisfied by both `prisma` and a `$transaction` client,
 *  so the caller can run this inside its own transaction. */
type OrgDb = { org: typeof prisma.org; orgMember: typeof prisma.orgMember };

/**
 * Ensure the user has an org: JOIN the org claiming their email domain
 * (managed), else the shared Default Org as a plain member (not an OrgAdmin).
 * Idempotent on both paths (upserts). Pass a transaction client
 * as `db` to run inside the caller's transaction.
 */
export async function joinDomainOrgOrCreatePersonal(
  userId: string,
  email: string,
  _displayName?: string,
  db: OrgDb = prisma,
): Promise<{ orgId: string; managed: boolean }> {
  const managed = await resolveDomainOrg(email);
  if (managed) {
    await db.orgMember.upsert({
      where: { orgId_userId: { orgId: managed.orgId, userId } },
      create: { orgId: managed.orgId, userId, role: managed.role },
      update: {}, // already a member → leave their existing role untouched
    });
    return { orgId: managed.orgId, managed: true };
  }
  const org = await db.org.upsert({
    where: { id: DEFAULT_ORG_ID },
    create: { id: DEFAULT_ORG_ID, name: DEFAULT_ORG_NAME, entityType: "Other" },
    update: {},
  });
  await db.orgMember.upsert({
    where: { orgId_userId: { orgId: org.id, userId } },
    create: { orgId: org.id, userId, role: DEFAULT_DOMAIN_JOIN_ROLE },
    update: {},
  });
  return { orgId: org.id, managed: false };
}
