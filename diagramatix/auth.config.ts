import type { NextAuthConfig } from "next-auth";

// Minimal auth config used by the proxy (middleware) — no Prisma imports.
// JWT and session callbacks are defined in auth.ts (they need Prisma + token refresh).

// Session lifetime is configurable so an enterprise can tighten it (ENT-13). Was
// the NextAuth default of 30 days with no cap; now an absolute maxAge (default 7
// days) plus a rolling daily refresh (updateAge). Override via env, in SECONDS:
//   AUTH_SESSION_MAX_AGE   — absolute session lifetime (default 604800 = 7 days)
//   AUTH_SESSION_UPDATE_AGE — how often the JWT is refreshed  (default 86400 = 1 day)
const SESSION_MAX_AGE = parseInt(process.env.AUTH_SESSION_MAX_AGE ?? "", 10) || 60 * 60 * 24 * 7;
const SESSION_UPDATE_AGE = parseInt(process.env.AUTH_SESSION_UPDATE_AGE ?? "", 10) || 60 * 60 * 24;

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" as const, maxAge: SESSION_MAX_AGE, updateAge: SESSION_UPDATE_AGE },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isProtected =
        nextUrl.pathname.startsWith("/dashboard") ||
        nextUrl.pathname.startsWith("/diagram") ||
        nextUrl.pathname.startsWith("/portal");
      if (isProtected) return isLoggedIn;
      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
