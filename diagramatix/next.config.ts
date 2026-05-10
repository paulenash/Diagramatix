import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce `.next/standalone/server.js` alongside the regular `.next/`
  // build. The standalone tree contains only traced production deps and
  // is what the Dockerfile copies into the runtime stage. Local `next
  // dev` and `next start` are unaffected — this only adds an artefact.
  output: "standalone",
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
