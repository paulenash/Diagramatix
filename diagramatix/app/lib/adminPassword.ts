import crypto from "crypto";

/**
 * SEC-02 — validate the optional template-elevation password (server-only).
 *
 * The old guard `provided !== process.env.ADMIN_PASSWORD ?? ""` failed OPEN when
 * the env var was unset: `ADMIN_PASSWORD` defaulted to `""`, so a request sending
 * `{ adminPassword: "" }` made `"" !== ""` false and the elevation check was
 * skipped — letting ANY authenticated user edit/delete global built-in templates.
 *
 * This helper instead treats an unset/empty secret as "elevation DISABLED"
 * (returns false), and does a constant-time compare otherwise.
 */
export function isAdminPasswordValid(provided: unknown): boolean {
  const secret = process.env.ADMIN_PASSWORD ?? "";
  if (secret.length === 0) return false; // unset ⇒ elevation path disabled
  if (typeof provided !== "string" || provided.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}
