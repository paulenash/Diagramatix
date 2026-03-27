import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
