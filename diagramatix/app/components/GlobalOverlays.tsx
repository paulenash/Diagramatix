"use client";

import { usePathname } from "next/navigation";
import { MatrixToggle } from "@/app/components/MatrixToggle";
import { ScreenCapture } from "@/app/components/ScreenCapture";
import { ScreencastStudio } from "@/app/components/screencast/ScreencastStudio";

/**
 * The global desktop-only floating tools: screenshot, screencast, and the
 * Matrix screensaver — which no longer has a button of its own and is armed with
 * Ctrl+Alt+M instead. Hidden entirely on the mobile "/m" route tree; phones get a
 * clean touch UI without these desktop affordances.
 *
 * One flag serves both. It is REAL SuperAdmin identity rather than the acting
 * view mode, so both stay available while a SuperAdmin films the OrgAdmin or
 * User experience through the dgx_sa_mode switch.
 */
export function GlobalOverlays({ superAdmin }: { superAdmin: boolean }) {
  const pathname = usePathname();
  if (pathname === "/m" || pathname?.startsWith("/m/")) return null;
  return (
    <>
      <MatrixToggle superAdmin={superAdmin} />
      <ScreenCapture />
      <ScreencastStudio enabled={superAdmin} />
    </>
  );
}
