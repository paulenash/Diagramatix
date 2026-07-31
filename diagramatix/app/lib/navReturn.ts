/**
 * Helpers for the "return to point of invocation" navigation pattern.
 *
 * Several destinations (User Guide, SuperAdmin, OrgAdmin) are reached from many
 * different pages. Each caller appends `?from=<their path>`; the destination
 * reads it (guarded by safeInternalPath / SEC-15) and points its back link
 * there instead of a hardcoded /dashboard. This module keeps the label
 * derivation in one place so every back link reads consistently.
 *
 * Pure (no React / no "use client") so it works in both server and client
 * components. The client-only link helper lives in components/UserGuideLink.tsx.
 */

/** Human label for a "← back" link, given the return path. */
export function backLabelForPath(path: string | null | undefined): string {
  if (!path) return "Back";
  if (path.startsWith("/dashboard/org-admin")) return "OrgAdmin";
  if (path.startsWith("/dashboard/admin")) return "SuperAdmin";
  if (path.startsWith("/dashboard/projects/")) return "Project";
  if (path.startsWith("/diagram/")) return "Diagram";
  if (path.startsWith("/dashboard")) return "Dashboard";
  return "Back";
}
