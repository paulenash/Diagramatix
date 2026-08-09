/**
 * GET /api/microsoft/callback?code=&state=
 *
 * Completes the "Connect SharePoint" flow: validates the CSRF state cookie
 * (bound to this user), exchanges the auth code for delegated Graph tokens,
 * encrypts them, and upserts the user's MicrosoftConnection. Then redirects back
 * to where the user started. Never exposes tokens.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { encryptSecret, decryptSecret } from "@/app/lib/crypto/tokenCrypto";
import { callbackUri, decodeIdToken, exchangeCodeForTokens, MS_SCOPES } from "@/app/lib/microsoft/oauth";
import { STATE_COOKIE } from "../connect/route";

export const runtime = "nodejs";

interface StateData { state: string; verifier: string; userId: string; returnTo: string; exp: number }

/** Append a marker to the return URL so the UI can show a toast. */
function back(returnTo: string, origin: string, marker: string): NextResponse {
  let target: string;
  try {
    const u = new URL(returnTo, origin);
    u.searchParams.set("sharepoint", marker);
    target = u.toString();
  } catch {
    target = `${origin}/dashboard?sharepoint=${marker}`;
  }
  const res = NextResponse.redirect(target);
  res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(`${origin}/login`);

  // Decode + validate the state cookie (CSRF + fixation defense).
  const jar = await cookies();
  const raw = jar.get(STATE_COOKIE)?.value;
  let st: StateData | null = null;
  try { if (raw) st = JSON.parse(decryptSecret(raw)) as StateData; } catch { st = null; }

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const returnTo = st?.returnTo ?? `${origin}/dashboard`;

  if (oauthError) return back(returnTo, origin, "error");
  if (!st || !code || !returnedState ||
      returnedState !== st.state ||
      st.userId !== session.user.id ||
      Date.now() > st.exp) {
    return back(returnTo, origin, "error");
  }

  try {
    const tok = await exchangeCodeForTokens({
      clientId: process.env.AZURE_CLIENT_ID!,
      clientSecret: process.env.AZURE_CLIENT_SECRET!,
      code,
      redirectUri: callbackUri(origin),
      verifier: st.verifier,
    });
    if (!tok.access_token || !tok.refresh_token) return back(returnTo, origin, "error");

    const { tid, upn, name } = decodeIdToken(tok.id_token);
    const expiresAt = new Date(Date.now() + (tok.expires_in ?? 3600) * 1000);
    const data = {
      tenantId: tid ?? "organizations",
      accountUpn: upn ?? session.user.email ?? "unknown",
      accountName: name ?? null,
      scope: tok.scope ?? MS_SCOPES,
      accessToken: encryptSecret(tok.access_token),
      refreshToken: encryptSecret(tok.refresh_token),
      expiresAt,
      source: "connect",
    };
    await prisma.microsoftConnection.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, ...data },
      update: data,
    });
    return back(returnTo, origin, "connected");
  } catch {
    return back(returnTo, origin, "error");
  }
}
