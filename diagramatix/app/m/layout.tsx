import type { Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MobileChrome } from "./MobileChrome";

// Mobile UI shell (route tree `/m`). Auth is enforced here once for every /m
// page; the proxy also protects the segment. Desktop is untouched.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e3a8a",
};

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return (
    <MobileChrome userName={session.user.name ?? session.user.email ?? "Signed in"}>
      {children}
    </MobileChrome>
  );
}
