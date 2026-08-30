/**
 * The URL a CALLER should use to reach us — as distinct from the one we use to
 * reach ourselves.
 *
 * These are not the same thing and conflating them produces links that look fine
 * in dev and are broken in production. In a standalone build `new URL(req.url)`
 * is reconstructed from the listener, so its host is the BIND address (0.0.0.0)
 * and its scheme is whatever a proxy declared. A deep link built from that reads
 * `https://0.0.0.0:3000/diagram/…`, which is useless to the partner it is handed
 * to and to the customer they hand it on to.
 *
 * So: the forwarded headers, which is what the reverse proxy actually knows,
 * with `APP_BASE_URL` as the override — the same variable the cron routes
 * already use for exactly this reason.
 *
 * The loopback origin the harness proxy needs is the opposite case and is
 * computed separately, in that route.
 */
export function publicBaseUrl(req: Request): string {
  const explicit = process.env.APP_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    // A forwarded chain lists the client's protocol first.
    const proto = (h.get("x-forwarded-proto") ?? "").split(",")[0]?.trim()
      // Behind Azure everything internal is http, so the header is the only
      // honest source. Fall back on the request's own scheme, then https —
      // a wrong https is a redirect, a wrong http can be a downgrade.
      || new URL(req.url).protocol.replace(":", "")
      || "https";
    return `${proto}://${host}`;
  }

  return new URL(req.url).origin;
}
