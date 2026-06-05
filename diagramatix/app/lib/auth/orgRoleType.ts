/**
 * Client-safe OrgRole type + role-set constants.
 *
 * Mirrors the Prisma OrgRole enum but lives in its own file (no DB
 * imports) so client components can import it. The server-side
 * orgContext module re-exports these so route handlers don't need to
 * juggle two source files.
 */

/** Every role recognised by the OrgMember table. */
export type OrgRole =
  | "Owner"
  | "Admin"
  | "RiskOwner"
  | "ProcessOwner"
  | "ControlOwner"
  | "InternalAudit"
  | "BoardObserver"
  | "Viewer";

/** Roles that can mutate diagrams / projects. */
export const WRITE_ROLES: OrgRole[] = [
  "Owner",
  "Admin",
  "RiskOwner",
  "ProcessOwner",
  "ControlOwner",
];

/** Roles that have read-only org access. */
export const READ_ONLY_ROLES: OrgRole[] = [
  "InternalAudit",
  "BoardObserver",
  "Viewer",
];
