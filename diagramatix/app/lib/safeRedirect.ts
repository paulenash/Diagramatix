/**
 * SEC-15 — validate a user-supplied `?from=` back-link so it can only point at an
 * internal path, never an external origin.
 *
 * The naive guard `raw.startsWith("/")` accepts protocol-relative URLs like
 * `//evil.com` and `/\evil.com`, which browsers (and `router.push`) treat as
 * absolute cross-origin destinations — an open-redirect / phishing vector.
 *
 * Returns the path when it is a safe internal absolute path, otherwise null so
 * the caller can apply its own default fallback.
 */
export function safeInternalPath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  if (!raw.startsWith("/")) return null;        // must be an absolute internal path
  if (raw.startsWith("//")) return null;        // protocol-relative → external
  if (raw.startsWith("/\\")) return null;        // backslash variant → external
  return raw;
}
