/** Map a route pathname to a human screen name used to name captured help images. */
export function screenNameFromPath(pathname: string): string {
  if (pathname.startsWith("/diagram/")) return "Diagram Editor";
  if (pathname.startsWith("/processes/")) return "Published Process";
  if (pathname.startsWith("/dashboard/admin/user-guide")) return "User Guide Editor";
  if (pathname.startsWith("/dashboard/admin")) return "Administration";
  if (pathname.startsWith("/dashboard/projects/")) return "Project";
  if (pathname.startsWith("/dashboard/groups")) return "Collaboration Groups";
  if (pathname.startsWith("/dashboard/account")) return "Account Settings";
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname.startsWith("/help")) return "User Guide";
  if (pathname.startsWith("/notifications")) return "Notifications";
  if (pathname.startsWith("/matrix")) return "Matrix";
  return "App";
}
