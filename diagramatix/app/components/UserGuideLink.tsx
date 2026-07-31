"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

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
}: {
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  const pathname = usePathname();
  const href = `/help?from=${encodeURIComponent(pathname || "/dashboard")}`;
  return (
    <Link href={href} className={className} title={title}>
      {children}
    </Link>
  );
}
