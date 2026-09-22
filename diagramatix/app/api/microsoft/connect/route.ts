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
import { orgPolicyAllows } from "@/app/lib/auth/orgPolicy";
import { encryptSecret } from "@/app/lib/crypto/tokenCrypto";
import { missingSharePointEnv, sharePointServerConfigured } from "@/app/lib/microsoft/serverConfig";
import { buildAuthorizeUrl, callbackUri, pkcePair, randomState, sanitizeReturnTo } from "@/app/lib/microsoft/oauth";

export const runtime = "nodejs";

export const STATE_COOKIE = "ms_oauth_state";

/**
 * This route is opened as a PAGE — the SharePoint window links to it in a new
 * tab — so every answer is a page too. Paul, 2026-09-22, saw the old JSON body
 * (`{"error":"SharePoint is not configured on this server."}`) fill that tab.
 * The landing page says what happened in English.
 */
function outcome(origin: string, marker: string): NextResponse {
  return NextResponse.redirect(`${origin}/dashboard/microsoft-connected?sharepoint=${marker}`);
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(`${origin}/login`);

  if (!(await orgPolicyAllows(session, "allowSharePoint"))) return outcome(origin, "not-allowed");

  if (!sharePointServerConfigured()) {
    console.error("[microsoft/connect] SharePoint is not configured — missing:", missingSharePointEnv().join(", "));
    return outcome(origin, "unconfigured");
  }

  const url = new URL(request.url);
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"), url.origin);
  const state = randomState();
  const { verifier, challenge } = pkcePair();
  const redirectUri = callbackUri(url.origin);

  const authorizeUrl = buildAuthorizeUrl({ clientId: process.env.AZURE_CLIENT_ID!, redirectUri, state, challenge });

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
