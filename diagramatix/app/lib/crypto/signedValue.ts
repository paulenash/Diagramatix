/**
 * SEC-17: tamper-evident cookie values.
 *
 * The impersonation identity/mode cookies are HttpOnly + Secure but were stored
 * in the clear, so their integrity rested entirely on the browser honouring
 * HttpOnly. Appending an HMAC (keyed on AUTH_SECRET) makes any modification
 * detectable server-side — defence-in-depth against a set-cookie surface or a
 * tampered client. Format: "<value>.<base64url-hmac>".
 *
 * The value itself is NOT secret (it's a userId / "view"|"edit"); the tag only
 * proves the server minted it.
 */
import crypto from "crypto";

function signingKey(): string {
  const s = process.env.AUTH_SECRET;
  // AUTH_SECRET is guaranteed present at boot (CFG-02 guard); fail loud if not.
  if (!s) throw new Error("AUTH_SECRET is required to sign cookie values");
  return s;
}

function mac(value: string): string {
  return crypto.createHmac("sha256", signingKey()).update(value).digest("base64url");
}

/** Append an HMAC tag to `value`. */
export function signValue(value: string): string {
  return `${value}.${mac(value)}`;
}

/**
 * Verify a signed value and return the original, or null when the input is
 * absent, malformed, or the tag doesn't match (tampered / unsigned legacy
 * cookie). The value may itself contain dots — we split on the LAST one.
 */
export function verifySignedValue(signed: string | undefined | null): string | null {
  if (!signed) return null;
  const dot = signed.lastIndexOf(".");
  if (dot <= 0 || dot === signed.length - 1) return null;
  const value = signed.slice(0, dot);
  const tag = signed.slice(dot + 1);
  const expected = mac(value);
  const a = Buffer.from(tag);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  return value;
}
