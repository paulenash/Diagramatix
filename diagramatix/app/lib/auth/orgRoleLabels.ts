/**
 * Client-safe OrgRole display labels.
 *
 * Lives in its own file so client components can import it without
 * pulling in the server-only orgContext module (which transitively
 * imports Prisma). Keep this file dependency-free.
 *
 * The most consequential mapping here is `Admin` → "OrgAdmin": the
 * Prisma enum value stays `Admin` (no migration), but everywhere the
 * role is surfaced to a user we render it as "OrgAdmin" so the
 * distinction from the platform-level "SuperAdmin" stays clean.
 */

import type { OrgRole } from "@/app/lib/auth/orgRoleType";

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  Owner: "Owner",
  Admin: "OrgAdmin",
  RiskOwner: "Risk Owner",
  ProcessOwner: "Process Owner",
  ControlOwner: "Control Owner",
  InternalAudit: "Internal Audit",
  BoardObserver: "Board Observer",
  Viewer: "Viewer",
};

/** Display label for an OrgRole. Falls back to the raw string when the
 *  value is unrecognised (e.g. a row with a stale enum value after a
 *  schema rollback). */
export function displayOrgRole(role: OrgRole | string | null | undefined): string {
  if (!role) return "—";
  return ORG_ROLE_LABELS[role as OrgRole] ?? role;
}

/** Order matters in the UI dropdown — Owner first, then OrgAdmin, then
 *  the role-specific writers, then the read-only roles. */
export const ORG_ROLE_DROPDOWN_ORDER: OrgRole[] = [
  "Owner",
  "Admin",
  "RiskOwner",
  "ProcessOwner",
  "ControlOwner",
  "InternalAudit",
  "BoardObserver",
  "Viewer",
];
