"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { guideHref } from "@/app/lib/help/guideReturn";

/**
 * A "User Guide" link that carries the CURRENT page path as `?from=` so the
 * guide's back link returns the user to their point of invocation (see
 * app/(dashboard)/help/page.tsx). Drop-in replacement for a plain
 * `<Link href="/help">` / `<a href="/help">` — pass the same className/children.
 *
 * Uses usePathname() (SSR-safe in a client component); the invoking page's path
 * is enough to return there. Query state on the caller isn't preserved — the
 * guide is a full-page detour, not a modal — which is the intended behaviour.
 */
export function UserGuideLink({
  className,
  children,
  title,
  chapter,
}: {
  className?: string;
  children: ReactNode;
  title?: string;
  /**
   * Open the guide AT a chapter rather than at its first one. A link from a
   * screen about projects that lands on "Getting started" makes the reader do
   * the finding — the caller already knows what they are looking at.
   */
  chapter?: string;
}) {
  const pathname = usePathname();
  return (
    <Link
      href={guideHref({ chapter, pathname: pathname || "/dashboard" })}
      className={className}
      title={title}
    >
      {children}
    </Link>
  );
}
