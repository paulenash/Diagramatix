/**
 * Shared primitives for the standalone "Connect SharePoint" delegated-OAuth flow
 * (app/api/microsoft/*) and the DB-backed token accessor. This flow is separate
 * from NextAuth login: it runs AFTER the user is already signed in to Diagramatix
 * and targets the multi-tenant `organizations` authority, so any Microsoft 365
 * org's users can connect their own SharePoint — without touching login (which
 * stays single-tenant and unaffected).
 *
 * Raw fetch against the Entra token endpoints (mirrors the existing refresh call
 * in auth.ts) — no MSAL dependency.
 */
import { createHash, randomBytes } from "node:crypto";

/** Multi-tenant authority for the connect flow (any org can consent). */
export const MS_ORGANIZATIONS = "https://login.microsoftonline.com/organizations";
/** Delegated scopes — Graph files/sites + a refresh token (offline_access). */
export const MS_SCOPES = "openid profile email offline_access Files.ReadWrite.All Sites.Read.All";

const b64url = (b: Buffer) => b.toString("base64url");

/** The redirect URI Entra calls back — must exactly match the exchange call + the app-registration entry. */
export function callbackUri(origin: string): string {
  return `${origin}/api/microsoft/callback`;
}

/** Opaque CSRF state token. */
export function randomState(): string {
  return b64url(randomBytes(24));
}

/** PKCE verifier + S256 challenge. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/** Build the /authorize redirect URL (prompt=select_account lets the user pick the right org account). */
export function buildAuthorizeUrl(opts: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const p = new URLSearchParams({
    client_id: opts.clientId,
    response_type: "code",
    response_mode: "query",
    redirect_uri: opts.redirectUri,
    scope: MS_SCOPES,
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${MS_ORGANIZATIONS}/oauth2/v2.0/authorize?${p.toString()}`;
}

export interface MsTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function postToken(url: string, body: Record<string, string>): Promise<MsTokenResponse> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  return (await resp.json()) as MsTokenResponse;
}

/** Authorization-code → tokens (uses the multi-tenant authority + PKCE verifier). */
export function exchangeCodeForTokens(opts: { clientId: string; clientSecret: string; code: string; redirectUri: string; verifier: string }): Promise<MsTokenResponse> {
  return postToken(`${MS_ORGANIZATIONS}/oauth2/v2.0/token`, {
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    code_verifier: opts.verifier,
    scope: MS_SCOPES,
  });
}

/** Refresh against the row's OWN tenant endpoint (works for connect- and login-seeded rows). */
export function refreshAccessToken(opts: { clientId: string; clientSecret: string; tenantId: string; refreshToken: string }): Promise<MsTokenResponse> {
  return postToken(`https://login.microsoftonline.com/${opts.tenantId}/oauth2/v2.0/token`, {
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    scope: MS_SCOPES,
  });
}

/** Pull tenant + account identity from an id_token payload (no signature verify — TLS-trusted exchange). */
export function decodeIdToken(idToken: string | undefined): { tid?: string; upn?: string; name?: string } {
  if (!idToken) return {};
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return {
      tid: payload.tid,
      upn: payload.preferred_username || payload.upn || payload.email,
      name: payload.name,
    };
  } catch {
    return {};
  }
}

/** Keep a redirect target same-origin; fall back to the dashboard otherwise. */
export function sanitizeReturnTo(raw: string | null, origin: string): string {
  if (!raw) return `${origin}/dashboard`;
  try {
    const u = new URL(raw, origin);
    return u.origin === origin ? u.toString() : `${origin}/dashboard`;
  } catch {
    return `${origin}/dashboard`;
  }
}
