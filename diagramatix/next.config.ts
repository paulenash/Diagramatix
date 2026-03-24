import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Extend client-side Router Cache lifetime to avoid re-fetching
    // recently visited pages (Dashboard, Project screens)
    staleTimes: {
      dynamic: 300, // cache dynamic pages for 5 minutes
      static: 600,  // cache static pages for 10 minutes
    },
  },
};

export default nextConfig;
