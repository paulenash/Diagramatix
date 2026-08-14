import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

export const proxy = auth;

// CFG-05/06: middleware must run on every protected prefix so auth isn't a
// per-page opt-in (which had left /matrix, /notifications, /help, etc. reachable
// without a session). Next requires `matcher` to be a STATIC literal — it can't
// be computed from PROTECTED_PREFIXES at build time — so the list is duplicated
// here and tests/config/route-protection.test.ts asserts the two never drift.
// `/prefix/:path*` matches both the bare prefix and any sub-path.
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/diagram/:path*",
    "/help/:path*",
    "/matrix/:path*",
    "/notifications/:path*",
    "/portal/:path*",
    "/processes/:path*",
    "/tech-notes/:path*",
    "/m/:path*",
  ],
};
