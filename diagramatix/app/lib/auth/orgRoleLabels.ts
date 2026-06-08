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
  // Specialty GRC roles retained in the schema for forward-compat
  // (no migration), but no longer surfaced in the SuperAdmin user
  // table. If a row still has one of these values we render the raw
  // label via displayOrgRole.
  RiskOwner: "Risk Owner",
  ProcessOwner: "Process Owner",
  ControlOwner: "Control Owner",
  InternalAudit: "Internal Audit",
  BoardObserver: "Board Observer",
  // Renamed display: the Viewer enum value is what we now show as
  // "Normal" — every user defaults here unless explicitly elevated
  // to OrgAdmin or Owner.
  Viewer: "Normal",
};

/** Display label for an OrgRole. Falls back to the raw string when the
 *  value is unrecognised (e.g. a row with a stale enum value after a
 *  schema rollback). */
export function displayOrgRole(role: OrgRole | string | null | undefined): string {
  if (!role) return "—";
  return ORG_ROLE_LABELS[role as OrgRole] ?? role;
}

/** SuperAdmin user-table dropdown options. Simplified 2026-06-08 to
 *  the two roles the SuperAdmin actually needs to flip between:
 *  OrgAdmin (Admin enum value) and Normal (Viewer enum value). The
 *  specialty GRC roles are dropped from the dropdown — users who
 *  already have one display their existing role via displayOrgRole
 *  but can only be reassigned to OrgAdmin or Normal from here. Owner
 *  is also dropped because Owner is set at Org creation and managed
 *  via the Org Settings page, not from the user table.
 *
 *  Order: OrgAdmin first (the elevation target), Normal second
 *  (the default / demotion target). */
export const ORG_ROLE_DROPDOWN_ORDER: OrgRole[] = [
  "Admin",
  "Viewer",
];
