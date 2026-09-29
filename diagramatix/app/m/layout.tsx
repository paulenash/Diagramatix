import type { Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getFeatureStates } from "@/app/lib/features/availability";
import { mobileAccess } from "@/app/lib/features/mobileAccess";
import { MobileChrome } from "./MobileChrome";
import { MobileUnavailable } from "./MobileUnavailable";

// Mobile UI shell (route tree `/m`). Auth is enforced here once for every /m
// page; the proxy also protects the segment. Desktop is untouched.
//
// Mobile Access is a feature (`mobile`, which requires Process Review and
// Voice Assist): a plan without it gets a page that says so, not the app.
// Resolved on the server for every /m page, so no phone screen can be reached
// around it. (SuperAdmins resolve all-available.)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e3a8a",
};

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const access = mobileAccess(await getFeatureStates(session.user.id));
  return (
    <MobileChrome userName={session.user.name ?? session.user.email ?? "Signed in"}>
      {access.allowed ? children : <MobileUnavailable message={access.message} blockedByLabel={access.blockedByLabel} />}
    </MobileChrome>
  );
}
