/**
 * SSRF guard for a user-supplied AI provider endpoint (SEC-24).
 *
 * A bring-your-own key may carry its own `baseUrl`, because people legitimately
 * route a provider through their own gateway. That value was stored and used
 * verbatim as the SDK's base URL, so any signed-in user could point it at
 * `http://169.254.169.254/…` (cloud instance metadata) or an internal service
 * and have THE SERVER make the request. The AI error path reflects part of the
 * upstream response back to the caller, which turns it from a blind request
 * into a readable one.
 *
 * Unlike the blob-URL guard next door, a host allow-list is not available here:
 * the whole point is that the endpoint is the customer's own. So this blocks
 * the addresses that have no business being an AI provider — loopback, private
 * and link-local ranges, and the metadata hostnames — and requires https.
 *
 * KNOWN LIMIT, deliberately not solved here: a hostname that resolves to a
 * private address defeats a literal-address check, and closing that properly
 * means resolving, validating and then pinning the address for the request,
 * which the provider SDKs do not expose. This raises the bar from "type an IP"
 * to "control public DNS"; admin-configured endpoints (the Ollama and gateway
 * environment variables) are unaffected since an administrator setting those
 * already has server access.
 */

export class UnsafeAiBaseUrlError extends Error {
  constructor(message: string) { super(message); this.name = "UnsafeAiBaseUrlError"; }
}

/** Hostnames that name the local machine or a cloud metadata service. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost", "ip6-localhost", "ip6-loopback",
  "metadata", "metadata.google.internal", "metadata.goog",
  "instance-data",
]);

/** An IPv4 literal, as four decimal octets. */
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isBlockedIpv4(host: string): boolean {
  const m = IPV4.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 0) return true;                      // 0.0.0.0/8 — "this host"
  if (a === 127) return true;                    // loopback
  if (a === 10) return true;                     // private
  if (a === 169 && b === 254) return true;       // link-local, incl. 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true;       // private
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  return false;
}

function isBlockedIpv6(host: string): boolean {
  // URL keeps IPv6 literals in brackets; strip them and any zone id.
  const h = host.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  if (h === "::1" || h === "::") return true;                    // loopback / unspecified
  if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return true; // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true;     // unique-local
  if (h.startsWith("::ffff:")) return isBlockedIpv4(h.slice(7)); // IPv4-mapped
  return false;
}

/**
 * Throw {@link UnsafeAiBaseUrlError} unless `raw` is an https URL pointing at a
 * publicly routable host. Returns the parsed URL so callers can reuse it.
 */
export function assertSafeAiBaseUrl(raw: unknown): URL {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new UnsafeAiBaseUrlError("The endpoint is required.");
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeAiBaseUrlError("The endpoint is not a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw new UnsafeAiBaseUrlError("The endpoint must use https.");
  }
  if (url.username || url.password) {
    throw new UnsafeAiBaseUrlError("The endpoint must not carry credentials in the URL.");
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost")) {
    throw new UnsafeAiBaseUrlError("The endpoint must not point at this machine.");
  }
  if (isBlockedIpv4(host) || isBlockedIpv6(host)) {
    throw new UnsafeAiBaseUrlError("The endpoint must be a public address, not a private or link-local one.");
  }
  return url;
}

/** Non-throwing form, for filtering a value that was stored before this guard existed. */
export function isSafeAiBaseUrl(raw: unknown): boolean {
  try { assertSafeAiBaseUrl(raw); return true; } catch { return false; }
}
