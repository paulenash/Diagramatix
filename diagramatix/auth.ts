import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { authConfig } from "./auth.config";
import { prisma } from "@/app/lib/db";
import bcrypt from "bcryptjs";
import { rateLimit, clientIp } from "@/app/lib/rateLimit";

/** SEC-12: a fixed, valid bcrypt hash compared against when the user doesn't
 *  exist, so authorize() takes ~the same time whether or not the email is
 *  registered (closes the timing-enumeration oracle). It never matches anything. */
const DUMMY_BCRYPT_HASH = "$2b$12$qO.Q/cmrOm8qGc98tNpKP.eQ.pkPQmLyocrlAbVqID.fiD9T56GP2";

/**
 * Idempotent: ensures the user has at least one OrgMember row. If none, creates
 * a default Org named "${displayName}'s Org" (entityType=Other) and an Owner
 * membership. Called from the signIn callback so SSO users get an org without
 * a separate registration step.
 */
async function ensureDefaultOrgForUser(userId: string, displayName: string) {
  const existing = await prisma.orgMember.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (existing) return;
  await prisma.$transaction(async (tx) => {
    const org = await tx.org.create({
      data: { name: `${displayName}'s Org`, entityType: "Other" },
    });
    await tx.orgMember.create({
      data: { orgId: org.id, userId, role: "Owner" },
    });
  });
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = (credentials.email as string).toLowerCase();

        // SEC-06: throttle online password guessing. Per-account (one email under
        // attack) and per-source IP (credential-stuffing across many accounts).
        // Over-limit fails like a wrong password — no lockout oracle, no enum.
        const ip = clientIp((request as Request | undefined)?.headers ?? new Headers());
        if (!rateLimit(`login:email:${email}`, 10, 15 * 60_000).ok) return null;
        if (!rateLimit(`login:ip:${ip}`, 50, 15 * 60_000).ok) return null;

        const user = await prisma.user.findUnique({
          where: { email: email },
        });

        // SEC-12: always run a bcrypt compare (against a dummy hash when the user
        // is missing) so the response time doesn't reveal whether the email exists.
        const hashToCheck = user?.password || DUMMY_BCRYPT_HASH;
        const passwordMatch = await bcrypt.compare(credentials.password as string, hashToCheck);

        if (!user || !passwordMatch) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
    MicrosoftEntraID({
      clientId: process.env.AZURE_CLIENT_ID!,
      clientSecret: process.env.AZURE_CLIENT_SECRET!,
      issuer: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`,
      authorization: {
        params: {
          scope: "openid profile email offline_access Files.ReadWrite.All Sites.Read.All",
        },
      },
    }),
  ],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isProtected =
        nextUrl.pathname.startsWith("/dashboard") ||
        nextUrl.pathname.startsWith("/diagram");
      if (isProtected) return isLoggedIn;
      return true;
    },
    async signIn({ user, account }) {
      // For Microsoft sign-ins, auto-create a local user record if one doesn't exist
      if (account?.provider === "microsoft-entra-id" && user.email) {
        try {
          const existing = await prisma.user.findUnique({ where: { email: user.email } });
          if (!existing) {
            const created = await prisma.user.create({
              data: {
                email: user.email,
                name: user.name ?? user.email.split("@")[0],
                password: "",
                // New sign-ups start on Free. Existing users were
                // grandfathered to Expert by scripts/seed-subscriptions.ts.
                // subscriptionAssignedAt drives Free's 30-day trial expiry.
                subscriptionLevelId: "free",
                subscriptionAssignedAt: new Date(),
              },
            });
            user.id = created.id;
            // CPS 230: every new user gets a default Org with Owner role
            await ensureDefaultOrgForUser(created.id, created.name ?? user.email);
          } else {
            user.id = existing.id;
            // SEC-04: an attacker can register a victim's email + password BEFORE
            // the victim first signs in with Microsoft; the old code then linked
            // the SSO identity to that pre-existing row, and the attacker's known
            // password still authenticated the SAME account (persistent
            // co-occupation / account pre-hijack). Microsoft has now verified
            // ownership of this email, so the SSO identity is authoritative —
            // disable any pre-existing local password so ONLY SSO can sign into
            // this account. A legitimate user who also had a password can re-set
            // it via "Forgot password".
            if (existing.password && existing.password.length > 0) {
              await prisma.user.update({ where: { id: existing.id }, data: { password: "" } });
            }
            // Idempotent — only creates an org if the user doesn't already have one
            await ensureDefaultOrgForUser(existing.id, existing.name ?? existing.email);
          }
        } catch (err) {
          console.error("[auth] signIn callback error:", err);
          return false;
        }
      }
      // Promote any pending bundle invitations addressed to this email.
      // Idempotent — when there are no pending rows it's a no-op. Lazy-
      // imported so the auth module doesn't pull bundleInvites at boot.
      if (user.id && user.email) {
        try {
          const { promotePendingAudienceMemberships } = await import("@/app/lib/bundleInvites");
          await promotePendingAudienceMemberships(user.id, user.email);
        } catch (err) {
          // Don't block sign-in if invitation promotion fails — the user
          // can still reach the dashboard, and the next sign-in will retry.
          console.error("[auth] bundle invite promotion error:", err);
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      // Set user ID on first sign-in
      if (user) token.id = user.id;

      // Throttled lastSeenAt update — at most once per 60 s per session.
      // Powers the admin Registered Users "online / last seen" column.
      if (token.id) {
        const now = Date.now();
        const prev = typeof token.lastSeenAt === "number" ? token.lastSeenAt : 0;
        if (now - prev > 60_000) {
          token.lastSeenAt = now;
          try {
            await prisma.user.update({
              where: { id: token.id as string },
              data: { lastSeenAt: new Date(now) },
            });
          } catch { /* ignore — admin indicator is best-effort */ }
        }
      }

      // Store Microsoft tokens for Graph API access
      if (account?.provider === "microsoft-entra-id") {
        token.msAccessToken = account.access_token;
        token.msRefreshToken = account.refresh_token;
        token.msTokenExpires = account.expires_at ? account.expires_at * 1000 : 0;
      }
      // Refresh expired Microsoft access token
      if (token.msAccessToken && token.msTokenExpires &&
          Date.now() > (token.msTokenExpires as number) - 60_000) {
        try {
          const resp = await fetch("https://login.microsoftonline.com/" +
            `${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: process.env.AZURE_CLIENT_ID!,
              client_secret: process.env.AZURE_CLIENT_SECRET!,
              grant_type: "refresh_token",
              refresh_token: token.msRefreshToken as string,
              scope: "openid profile email offline_access Files.ReadWrite.All Sites.Read.All",
            }),
          });
          const data = await resp.json();
          if (data.access_token) {
            token.msAccessToken = data.access_token;
            if (data.refresh_token) token.msRefreshToken = data.refresh_token;
            token.msTokenExpires = Date.now() + data.expires_in * 1000;
          }
        } catch {
          // Refresh failed — clear tokens so user re-authenticates
          token.msAccessToken = undefined;
          token.msRefreshToken = undefined;
          token.msTokenExpires = undefined;
        }
      }
      return token;
    },
    session({ session, token }) {
      if (token?.id) session.user.id = token.id as string;
      // SEC-05: expose ONLY the connection-status boolean to the client. The raw
      // Graph access token (Files.ReadWrite.All / Sites.Read.All) must NOT be
      // serialised onto the client-facing session — server routes read it from
      // the encrypted JWT via getMsAccessToken() instead.
      (session as any).hasMicrosoft = !!token.msAccessToken;
      return session;
    },
  },
});
