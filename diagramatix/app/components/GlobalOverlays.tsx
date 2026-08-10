"use client";

import { usePathname } from "next/navigation";
import { MatrixToggle } from "@/app/components/MatrixToggle";
import { ScreenCapture } from "@/app/components/ScreenCapture";
import { ScreencastStudio } from "@/app/components/screencast/ScreencastStudio";

/**
 * The global desktop-only floating tools (Matrix screensaver toggle, screenshot,
 * screencast). Hidden entirely on the mobile "/m" route tree — phones get a clean
 * touch UI without these desktop affordances.
 */
export function GlobalOverlays({ screencastEnabled }: { screencastEnabled: boolean }) {
  const pathname = usePathname();
  if (pathname === "/m" || pathname?.startsWith("/m/")) return null;
  return (
    <>
      <MatrixToggle />
      <ScreenCapture />
      <ScreencastStudio enabled={screencastEnabled} />
    </>
  );
}
