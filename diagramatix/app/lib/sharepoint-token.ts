import { getToken } from "next-auth/jwt";

/**
 * SEC-05 — read the Microsoft Graph access token from the ENCRYPTED session JWT,
 * server-side only.
 *
 * The token carries broad delegated Graph scopes (Files.ReadWrite.All /
 * Sites.Read.All), so it is deliberately NOT placed on the client-facing session
 * object (see the `session()` callback in auth.ts). The session JWT is encrypted
 * with AUTH_SECRET, so only the server can decode it here. `secureCookie` /
 * cookie-name defaults are derived by Auth.js from AUTH_URL — the same logic it
 * uses to SET the cookie — so this works in both the local (http) and Azure
 * (https) deployments without extra config.
 */
export async function getMsAccessToken(request: Request): Promise<string | null> {
  const token = await getToken({
    req: request as unknown as Parameters<typeof getToken>[0]["req"],
    secret: process.env.AUTH_SECRET,
  });
  return ((token as { msAccessToken?: string } | null)?.msAccessToken) ?? null;
}
