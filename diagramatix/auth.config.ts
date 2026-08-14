import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";

// Coarse mobile-phone detection from the UA (tablets deliberately excluded — the
// desktop canvas is usable on a tablet). Drives the auto-redirect to the /m UI.
const MOBILE_UA = /Android.+Mobile|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile/i;

// Minimal auth config used by the proxy (middleware) — no Prisma imports.
// JWT and session callbacks are defined in auth.ts (they need Prisma + token refresh).

// Session lifetime is configurable so an enterprise can tighten it (ENT-13). Was
// the NextAuth default of 30 days with no cap; now an absolute maxAge (default 7
// days) plus a rolling daily refresh (updateAge). Override via env, in SECONDS:
//   AUTH_SESSION_MAX_AGE   — absolute session lifetime (default 604800 = 7 days)
//   AUTH_SESSION_UPDATE_AGE — how often the JWT is refreshed  (default 86400 = 1 day)
const SESSION_MAX_AGE = parseInt(process.env.AUTH_SESSION_MAX_AGE ?? "", 10) || 60 * 60 * 24 * 7;
const SESSION_UPDATE_AGE = parseInt(process.env.AUTH_SESSION_UPDATE_AGE ?? "", 10) || 60 * 60 * 24;

/**
 * Every top-level URL prefix that requires a signed-in user (CFG-05, CFG-06).
 *
 * These are the routes the `(dashboard)` layout group exposes, plus the mobile
 * `/m` tree. Route GROUPS (`(dashboard)`) do NOT gate anything — only this list,
 * consumed by both the `authorized` callback below and the `proxy.ts` matcher,
 * decides what's protected. Auth was previously per-page opt-in (a page calling
 * `auth()` itself), so `/matrix` — which does not — was silently public, and any
 * new page under the group that forgot its own check would be too.
 *
 * The single source of truth: `proxy.ts` must list a matcher entry for each of
 * these, and `tests/config/route-protection.test.ts` fails if the two drift.
 */
export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/diagram",
  "/help",
  "/matrix",
  "/notifications",
  "/portal",
  "/processes",
  "/tech-notes",
  "/m",
] as const;

/** Does `path` fall under a protected prefix (the prefix itself, or a sub-path)? */
export function isProtectedPath(path: string): boolean {
  return PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" as const, maxAge: SESSION_MAX_AGE, updateAge: SESSION_UPDATE_AGE },
  callbacks: {
    authorized({ auth, request }) {
      const { nextUrl } = request;
      const path = nextUrl.pathname;
      const isLoggedIn = !!auth?.user;
      if (isProtectedPath(path) && !isLoggedIn) return false; // → signIn page (keeps callbackUrl)

      // Phone auto-redirect: a logged-in mobile user landing on the desktop
      // dashboard is sent to the mobile UI, unless they've opted for desktop
      // (?desktop=1 or the dgx-desktop cookie set by the "Desktop version" link).
      const prefersDesktop =
        request.cookies.get("dgx-desktop")?.value === "1" ||
        nextUrl.searchParams.get("desktop") === "1";
      const isMobile = MOBILE_UA.test(request.headers.get("user-agent") ?? "");
      if (isLoggedIn && isMobile && !prefersDesktop) {
        // Send phones to the touch-optimised /m UI instead of the desktop screens.
        // Diagrams open in the mobile viewer (not the desktop editor with its
        // Matrix/Camera/Video toolbar + mouse canvas); projects → the mobile list.
        if (path === "/dashboard") return NextResponse.redirect(new URL("/m", nextUrl));
        const diag = path.match(/^\/diagram\/([^/]+)\/?$/);
        if (diag) return NextResponse.redirect(new URL(`/m/diagram/${diag[1]}`, nextUrl));
        const proj = path.match(/^\/dashboard\/projects\/([^/]+)\/?$/);
        if (proj) return NextResponse.redirect(new URL(`/m/project/${proj[1]}`, nextUrl));
      }
      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
