import type { NextAuthConfig } from "next-auth";

// Minimal auth config used by the proxy (middleware) — no Prisma imports.
// JWT and session callbacks are defined in auth.ts (they need Prisma + token refresh).
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" as const },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isProtected =
        nextUrl.pathname.startsWith("/dashboard") ||
        nextUrl.pathname.startsWith("/diagram");
      if (isProtected) return isLoggedIn;
      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
