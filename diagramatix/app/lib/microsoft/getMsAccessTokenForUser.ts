/**
 * Server-only accessor for a user's delegated Graph access token, backed by the
 * MicrosoftConnection token store (not the session JWT). Refreshes transparently
 * when expired and persists the rotated tokens. Returns null when the user has no
 * connection or the refresh has been revoked — callers then 403 and the UI shows
 * the "Connect SharePoint" state.
 *
 * NEVER call with a client-supplied id — always the authenticated session user id.
 */
import { prisma } from "@/app/lib/db";
import { decryptSecret, encryptSecret } from "@/app/lib/crypto/tokenCrypto";
import { refreshAccessToken } from "./oauth";

export async function getMsAccessTokenForUser(userId: string): Promise<string | null> {
  const conn = await prisma.microsoftConnection.findUnique({ where: { userId } });
  if (!conn) return null;

  // Still valid (60s skew) — decrypt and return.
  if (conn.expiresAt.getTime() - 60_000 > Date.now()) {
    try { return decryptSecret(conn.accessToken); } catch { return null; }
  }

  // Expired — refresh against the row's own tenant endpoint.
  if (!process.env.AZURE_CLIENT_ID || !process.env.AZURE_CLIENT_SECRET) return null;
  let refreshToken: string;
  try { refreshToken = decryptSecret(conn.refreshToken); } catch { return null; }

  try {
    const tok = await refreshAccessToken({
      clientId: process.env.AZURE_CLIENT_ID,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
      tenantId: conn.tenantId,
      refreshToken,
    });
    if (!tok.access_token) {
      // Revoked / expired refresh token — drop the dead connection.
      await prisma.microsoftConnection.deleteMany({ where: { userId } });
      return null;
    }
    await prisma.microsoftConnection.update({
      where: { userId },
      data: {
        accessToken: encryptSecret(tok.access_token),
        // Entra rotates the refresh token — persist the new one when present.
        ...(tok.refresh_token ? { refreshToken: encryptSecret(tok.refresh_token) } : {}),
        expiresAt: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000),
        ...(tok.scope ? { scope: tok.scope } : {}),
      },
    });
    return tok.access_token;
  } catch {
    return null;
  }
}
