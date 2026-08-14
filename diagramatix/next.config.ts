import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce `.next/standalone/server.js` alongside the regular `.next/`
  // build. The standalone tree contains only traced production deps and
  // is what the Dockerfile copies into the runtime stage.
  //
  // Disabled when NEXT_OUTPUT_STANDALONE="false" (the e2e harness sets this) so
  // a plain `next start` serves the build — `next start` does NOT serve a
  // standalone build. Prod/Docker leave the env unset → standalone as before.
  output: process.env.NEXT_OUTPUT_STANDALONE === "false" ? undefined : "standalone",
  // CFG-07: don't advertise the framework.
  poweredByHeader: false,
  experimental: {
    // Extend client-side Router Cache lifetime to avoid re-fetching
    // recently visited pages (Dashboard, Project screens)
    staleTimes: {
      dynamic: 30,  // cache dynamic pages for 30 seconds
      static: 300,  // cache static pages for 5 minutes
    },
  },
  // CFG-03: baseline security headers on every response. There was no headers()
  // block at all — no clickjacking defence, no MIME-sniff protection, no
  // transport pinning, and no XSS mitigation-in-depth.
  //
  // The CSP is REPORT-ONLY to start: the app currently relies on inline styles
  // and scripts (Next's runtime, styled-jsx, inline SVG), so an enforcing policy
  // would break the UI until those are nonce-based. Report-only lets us see
  // violations in prod without breaking anything; tighten to enforcing in a
  // follow-up once the inline surface is measured. HSTS is only meaningful over
  // HTTPS (prod behind the Azure front end); harmless locally.
  async headers() {
    const csp = [
      "default-src 'self'",
      // 'unsafe-inline' + 'unsafe-eval' are required by Next's dev/runtime and
      // styled-jsx today; this is the honest current state, surfaced (report-only)
      // rather than pretended away.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
