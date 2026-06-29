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
  experimental: {
    // Extend client-side Router Cache lifetime to avoid re-fetching
    // recently visited pages (Dashboard, Project screens)
    staleTimes: {
      dynamic: 30,  // cache dynamic pages for 30 seconds
      static: 300,  // cache static pages for 5 minutes
    },
  },
};

export default nextConfig;
