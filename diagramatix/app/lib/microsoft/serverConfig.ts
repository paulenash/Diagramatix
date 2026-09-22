/**
 * Can this deployment do SharePoint at all?
 *
 * Paul, 2026-09-22, linking a Data Object: `{"error":"SharePoint is not
 * configured on this server."}` — a raw JSON error page where the sign-in
 * should have been. Two things were wrong. The connect route answered a
 * browser navigation with JSON instead of a page, and the check that decides
 * whether to OFFER SharePoint at all was a weaker one than the check that
 * refuses it: the menus asked only for the Entra app's id and tenant, while
 * connecting also needs the client secret and the key the stored Microsoft
 * tokens are encrypted with. A server with the first two and not the last
 * offered SharePoint everywhere and then refused at the last step.
 *
 * One rule, one place — every "is SharePoint available here" question comes
 * through this file. Env vars by NAME only; no value is ever returned.
 *
 * Server-only (it reads the environment and the token key).
 */
import { tokenCryptoConfigured } from "@/app/lib/crypto/tokenCrypto";

/** Present and not blank. */
const set = (name: string): boolean => !!process.env[name]?.trim();

/** The env vars a working SharePoint connection needs. */
export const SHAREPOINT_ENV = [
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
  "AZURE_TENANT_ID",
  "MS_TOKEN_ENC_KEY",
] as const;

/** Which of them are missing — names only, for a log or an admin screen. */
export function missingSharePointEnv(): string[] {
  return SHAREPOINT_ENV.filter((name) => !set(name));
}

/**
 * True when a user could actually connect a Microsoft account and browse
 * SharePoint. False greys the SharePoint options out rather than letting the
 * user walk into a dead end.
 *
 * `MS_TOKEN_ENC_KEY` is checked through `tokenCryptoConfigured` — being set is
 * not enough, it has to decode to a 32-byte key.
 */
export function sharePointServerConfigured(): boolean {
  if (missingSharePointEnv().some((name) => name !== "MS_TOKEN_ENC_KEY")) return false;
  return tokenCryptoConfigured();
}
