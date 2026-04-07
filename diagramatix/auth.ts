import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { authConfig } from "./auth.config";
import { prisma } from "@/app/lib/db";
import bcrypt from "bcryptjs";

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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user) return null;

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!passwordMatch) return null;

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
              },
            });
            user.id = created.id;
            // CPS 230: every new user gets a default Org with Owner role
            await ensureDefaultOrgForUser(created.id, created.name ?? user.email);
          } else {
            user.id = existing.id;
            // Idempotent — only creates an org if the user doesn't already have one
            await ensureDefaultOrgForUser(existing.id, existing.name ?? existing.email);
          }
        } catch (err) {
          console.error("[auth] signIn callback error:", err);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      // Set user ID on first sign-in
      if (user) token.id = user.id;
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
      // Expose Microsoft connection status and access token for server-side API routes
      (session as any).hasMicrosoft = !!token.msAccessToken;
      (session as any).msAccessToken = token.msAccessToken;
      return session;
    },
  },
});
