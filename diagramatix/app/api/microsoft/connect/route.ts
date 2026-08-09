/**
 * GET /api/microsoft/connect?returnTo=<url>
 *
 * Starts the standalone "Connect SharePoint" delegated-OAuth flow for the
 * signed-in user (any login method). Mints CSRF `state` + PKCE, stashes them in a
 * short-lived encrypted HttpOnly cookie, and 302s to Microsoft's multi-tenant
 * consent. Gated by `allowSharePoint` so a disabled org can't even begin consent.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";
import { encryptSecret, tokenCryptoConfigured } from "@/app/lib/crypto/tokenCrypto";
import { buildAuthorizeUrl, callbackUri, pkcePair, randomState, sanitizeReturnTo } from "@/app/lib/microsoft/oauth";

export const runtime = "nodejs";

export const STATE_COOKIE = "ms_oauth_state";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pol = await gateOrgPolicy(session, "allowSharePoint");
  if (pol) return pol;

  if (!process.env.AZURE_CLIENT_ID || !process.env.AZURE_CLIENT_SECRET || !tokenCryptoConfigured()) {
    return NextResponse.json({ error: "SharePoint is not configured on this server." }, { status: 500 });
  }

  const url = new URL(request.url);
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"), url.origin);
  const state = randomState();
  const { verifier, challenge } = pkcePair();
  const redirectUri = callbackUri(url.origin);

  const authorizeUrl = buildAuthorizeUrl({ clientId: process.env.AZURE_CLIENT_ID, redirectUri, state, challenge });

  const payload = encryptSecret(JSON.stringify({ state, verifier, userId: session.user.id, returnTo, exp: Date.now() + 600_000 }));
  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(STATE_COOKIE, payload, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
