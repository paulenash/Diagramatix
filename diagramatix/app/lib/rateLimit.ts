/**
 * SEC-06 — minimal in-memory fixed-window rate limiter (server-only).
 *
 * Diagramatix runs as a single App Service instance, so a process-local Map is a
 * pragmatic guard against credential-stuffing / brute-force / abuse on the
 * unauthenticated auth surface (login, register, forgot/reset password). If the
 * app is ever scaled out, move this to a shared store (Redis) — keyed identically.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let lastPrune = 0;

/** Drop expired buckets occasionally so the Map can't grow without bound. */
function prune(now: number) {
  if (now - lastPrune < 60_000 && buckets.size < 10_000) return;
  lastPrune = now;
  for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
}

/**
 * Record one hit against `key` and report whether it is within `max` per
 * `windowMs`. The first call that exceeds the limit (and every call after, until
 * the window resets) returns ok=false with the seconds until reset.
 */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  prune(now);
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  if (b.count > max) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfterSec: 0 };
}

/** Best-effort client IP. Azure App Service terminates TLS at a proxy, so the
 *  real client is in X-Forwarded-For; fall back to X-Real-IP. */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
