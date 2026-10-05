/**
 * ONE Org administration role: OrgAdmin (Paul, 2026-10-05: "I don't believe we need both an Owner and an Admin for Orgs. Lets just
 * call the new single role OrgAdmin").
 *
 * The stored value stays `Admin` — the database enum keeps `Owner` too, because dropping an enum value is a risky migration for no
 * gain — and it is DISPLAYED as "OrgAdmin" (orgRoleLabels.ts). Nothing writes `Owner` any more. Until the one-off SQL
 * (scripts/sql/patch-orgrole-owner-to-admin.sql) has converted the existing rows, a stray `Owner` is still treated as an OrgAdmin
 * so nobody is locked out in between.
 *
 * Client-safe: no imports. EVERY "is this person an Org administrator?" check goes through here — a test fails if any file
 * compares a role with the literal "Owner" again.
 */

/** The role an Org administrator is stored as. */
export const ORG_ADMIN_ROLE = "Admin" as const;

/** Every stored value that means "Org administrator" — for `role: { in: [...] }` queries and `requireRole`. */
export const ORG_ADMIN_ROLES = ["Admin", "Owner"] as const;

/** Is this stored role an Org administrator? */
export function isOrgAdminRole(role: string | null | undefined): boolean {
  return role === "Admin" || role === "Owner";
}
